"""Patient-facing assistant.

Two layers:
  1. A deterministic safety layer (regex red-flag triage) that ALWAYS runs and can only raise urgency.
  2. A conversational layer: Claude if ANTHROPIC_API_KEY is set, otherwise a rule-based intake flow.
"""
import json
import logging
import re
import socket
import unicodedata
import urllib.error
import urllib.request

from ..config import get_settings
from ..models import ChatMessage, Scan

log = logging.getLogger("dermavision.chat")
settings = get_settings()

LEVELS = ["routine", "soon", "urgent"]
LANG_NAMES = {"en": "English", "hi": "Hindi"}

def _nfc(text: str) -> str:
    """Hindi letters like ढ़ can be typed two ways; normalise so patterns match both."""
    return unicodedata.normalize("NFC", text)


def is_hindi(text: str) -> bool:
    return any("\u0900" <= ch <= "\u097f" for ch in text)


# (regex, label, level). "emergency" is handled separately and maps to urgency "urgent" + emergency=True.
RED_FLAGS = [
    (r"(trouble|difficulty|hard) (to )?breath|can'?t breathe|short(ness)? of breath", "breathing difficulty", "emergency"),
    (r"swell(ing|en)? (of )?(the |my )?(face|lips?|tongue|throat)|throat (is )?closing", "facial or throat swelling", "emergency"),
    (r"fever.{0,40}(rash|blister)|(rash|blister).{0,40}fever|red streaks?", "fever with spreading rash or red streaks", "emergency"),
    (r"\bbleed\w*|\bblood(?!\s+(pressure|sugar|test|thinner|group))", "bleeding", "urgent"),
    (r"won'?t heal|not healing|non[- ]?healing|open sore|ulcer|oozing|weeping", "non-healing sore", "urgent"),
    (r"(grow|grew|growing|spread|spreading)\w* (very |really )?(fast|quickly|rapidly)|rapid(ly)? (grow|chang)|doubled|suddenly (appeared|bigger|larger)", "rapid change", "urgent"),
    (r"lumps? (in|under|on) (my )?(neck|armpit|groin)|swollen (lymph )?(nodes?|glands?)", "swollen lymph nodes", "urgent"),
    (r"chang(e|ed|ing) (in )?(colou?r|shape|size)|getting (darker|bigger|larger)|darker|irregular (border|edge)|multiple colou?rs?|black", "change in size, shape or colour", "soon"),
    (r"\bitch\w*|\btender\b|\bpainful\b", "persistent itch or pain", "soon"),
    (r"asymmetr|uneven", "asymmetry", "soon"),
    # --- Hindi (no \b: it is unreliable around Devanagari vowel signs) ---
    (r"सांस (लेने )?में (तकलीफ|दिक्कत|परेशानी)|साँस (लेने )?में (तकलीफ|दिक्कत|परेशानी)", "breathing difficulty", "emergency"),
    (r"(चेहरे|होंठ|होठ|जीभ|गले)( पर| में)? सूजन", "facial or throat swelling", "emergency"),
    (r"बुखार.{0,30}(चकत्ते|छाले)|(चकत्ते|छाले).{0,30}बुखार", "fever with spreading rash or red streaks", "emergency"),
    (r"खून|रक्तस्राव|ब्लीडिंग", "bleeding", "urgent"),
    (r"घाव.{0,20}(नहीं भर|ठीक नहीं)|ठीक नहीं हो रहा|ठीक नहीं हो रही|मवाद", "non-healing sore", "urgent"),
    (r"तेज़ी से (बढ़|फैल)|तेजी से (बढ़|फैल)|अचानक (बढ़|बड़ा)", "rapid change", "urgent"),
    (r"(गर्दन|बगल|जांघ|कमर).{0,15}(गांठ|गाँठ|सूजन)", "swollen lymph nodes", "urgent"),
    (r"रंग (बदल|गहरा)|आकार (बदल|बढ़)|काला|गहरा होता", "change in size, shape or colour", "soon"),
    (r"खुजली|दर्द", "persistent itch or pain", "soon"),
    (r"असमान|बेढंग", "asymmetry", "soon"),
]
RED_FLAGS = [(_nfc(p), label, lvl) for p, label, lvl in RED_FLAGS]
NEGATORS = re.compile(r"\b(no|not|never|without|don'?t|doesn'?t|didn'?t|isn'?t|hasn'?t|haven'?t|nothing)\b[^.!?]{0,25}$")
HI_NEGATION_AFTER = re.compile(r"\s*(बिल्कुल )?(नहीं|नही)")
FLAG_HI = {
    "breathing difficulty": "सांस लेने में तकलीफ",
    "facial or throat swelling": "चेहरे या गले में सूजन",
    "fever with spreading rash or red streaks": "बुखार के साथ फैलते चकत्ते",
    "bleeding": "खून आना",
    "non-healing sore": "घाव का न भरना",
    "rapid change": "तेज़ी से बदलाव",
    "swollen lymph nodes": "लिम्फ नोड्स में सूजन",
    "change in size, shape or colour": "आकार या रंग में बदलाव",
    "persistent itch or pain": "खुजली या दर्द",
    "asymmetry": "असमान आकार",
}


def triage(text: str) -> tuple[list[str], str, bool]:
    """Return (flag labels, urgency, emergency). Works for English and Hindi."""
    t = _nfc(text.lower())
    flags: list[str] = []
    level = "routine"
    emergency = False
    for pattern, label, lvl in RED_FLAGS:
        for m in re.finditer(pattern, t):
            if NEGATORS.search(t[max(0, m.start() - 30) : m.start()]):
                continue
            if is_hindi(m.group()) and HI_NEGATION_AFTER.match(t[m.end() : m.end() + 15]):
                continue  # Hindi puts the negation after the word: "खून नहीं आ रहा"
            if label not in flags:
                flags.append(label)
            if lvl == "emergency":
                emergency = True
                level = "urgent"
            elif LEVELS.index(lvl) > LEVELS.index(level):
                level = lvl
            break
    return flags, level, emergency


def _max_level(*levels: str) -> str:
    return max(levels, key=LEVELS.index)


# ---------------------------------------------------------------- LLM layer
SYSTEM_PROMPT = """You are DermaVision Assistant, a friendly virtual skin-health guide inside a skin-lesion screening app. You are talking with a patient, not a clinician.

Your job:
1. Understand the patient's concern through natural conversation. Find out what and where it is, how long it has been there, any change in size, shape or colour, itching, pain, bleeding, crusting or non-healing, sun exposure or sunburns, and personal or family history of skin cancer. Ask at most two short questions per turn. Do not interrogate.
2. Use what they tell you, plus the AI scan result below if one is provided, to explain in plain language what could be going on in general terms. Offer possibilities, never a diagnosis.
3. Say clearly how soon they should see a doctor: routine, soon (within 1 to 2 weeks), or urgent (within 1 to 2 days, or emergency care).
4. Offer only simple, safe self-care: sun protection, do not pick or scratch, gentle moisturiser, and photographing the spot monthly next to a ruler to track change.

Hard rules:
- Never give a definitive diagnosis. Never say a spot is definitely harmless or definitely cancer. The scan is a screening aid and can be wrong, especially for phone photos.
- Never recommend prescription medicines or doses, and never tell someone to start, stop or change a medicine. Refer those questions to a doctor or pharmacist.
- If the patient describes trouble breathing, swelling of the face, lips, tongue or throat, fever with a rapidly spreading painful rash, or red streaks from a wound, tell them to call {emergency} or go to the nearest emergency department now.
- Bleeding, rapid change, non-healing sores and swollen lymph nodes are at least "urgent". Change in colour, border or size, or persistent itch, are at least "soon".
- Reply in {lang}, or in the language the patient writes in.
- Plain text only. No markdown, bullet points, asterisks or emoji, because your reply may be read aloud. Keep replies under 120 words.
- Do not ask for full name, address, phone number or other identifying details.
- If the question is unrelated to skin or health, gently steer back.

Respond with ONLY a JSON object and nothing else, in this exact shape:
{{"reply": "<your message>", "urgency": "routine|soon|urgent", "quick_replies": ["<up to 3 short likely answers, max 5 words each>"]}}"""


def _scan_context(scan: Scan | None) -> str:
    if not scan:
        return "No scan is attached to this conversation."
    top = ", ".join(f"{c['label']} {round(c['probability'] * 100)}%" for c in scan.top_classes[:3])
    demo = " (DEMO result, not real)" if scan.is_demo else ""
    return (
        f"Attached AI scan #{scan.scan_number}{demo}: predicted {scan.prediction} with "
        f"{round(scan.confidence * 100)}% confidence, risk level {scan.risk_level}. Top classes: {top}."
    )


def _provider() -> str:
    p = settings.llm_provider.lower()
    if p == "auto":
        if settings.anthropic_api_key:
            return "anthropic"
        if settings.gemini_api_key:
            return "gemini"
        return "none"
    return p


class LLMHTTPError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status


def _request_json(url: str, payload: dict | None, headers: dict | None, timeout: float) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise LLMHTTPError(exc.code, exc.read().decode("utf-8", "replace")) from None


def _post_json(url: str, payload: dict, headers: dict | None = None, timeout: float = 30.0) -> dict:
    return _request_json(url, payload, headers, timeout)


def _get_json(url: str, headers: dict | None = None, timeout: float = 15.0) -> dict:
    return _request_json(url, None, headers, timeout)


GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
_gemini_model: str | None = None  # model actually in use (may differ from GEMINI_MODEL if that one is unavailable)


_gemini_alts: list[str] | None = None  # cached list of usable models, best first


def _gemini_models() -> list[str]:
    """Ask Google which models this key can use and rank them: flash-lite, then flash, then the rest."""
    global _gemini_alts
    if _gemini_alts is None:
        data = _get_json(f"{GEMINI_BASE}/models?pageSize=200", {"x-goog-api-key": settings.gemini_api_key})
        skip = ("preview", "exp", "tts", "image", "live", "audio", "embedding", "thinking", "robotics", "computer", "learnlm", "gemma")
        names = [
            m["name"].removeprefix("models/")
            for m in data.get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
            and "gemini" in m["name"]
            and not any(x in m["name"] for x in skip)
        ]
        names.sort(key=lambda n: (0 if "flash-lite" in n else 1 if "flash" in n else 2, 0 if "latest" in n else 1, n))
        _gemini_alts = names
    if not _gemini_alts:
        raise RuntimeError("This Gemini key has no models that support generateContent")
    return _gemini_alts


def _transient(exc: Exception) -> bool:
    """Errors worth retrying on another model: not found, rate limit, overload, timeout, network."""
    if isinstance(exc, LLMHTTPError):
        return exc.status in (404, 429, 500, 503)
    return isinstance(exc, (TimeoutError, socket.timeout, urllib.error.URLError))


def _gemini_generate(system: str, msgs: list[dict]) -> str:
    global _gemini_model
    payload = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [
            {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in msgs
        ],
        "generationConfig": {"maxOutputTokens": 1000},
    }
    headers = {"x-goog-api-key": settings.gemini_api_key}

    def call(model: str) -> dict:
        return _post_json(f"{GEMINI_BASE}/models/{model}:generateContent", payload, headers, timeout=15.0)

    model = _gemini_model or settings.gemini_model
    try:
        data = call(model)
    except Exception as first_error:
        if not _transient(first_error):
            raise
        # The model is missing or overloaded (503/429/timeout): try one other model before giving up.
        alt = next((m for m in _gemini_models() if m != model), None)
        if alt is None:
            raise
        log.warning("Gemini model %r failed (%s); trying %r.", model, first_error, alt)
        data = call(alt)
        model = alt
    _gemini_model = model
    return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])


def _generate(provider: str, system: str, history: list[ChatMessage]) -> str:
    msgs = [{"role": m.role, "content": m.content} for m in history]
    if provider == "anthropic":
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=30.0)
        resp = client.messages.create(model=settings.chat_model, max_tokens=600, system=system, messages=msgs)
        return "".join(b.text for b in resp.content if b.type == "text")
    if provider == "gemini":
        return _gemini_generate(system, msgs)
    if provider == "ollama":
        data = _post_json(
            f"{settings.ollama_url}/api/chat",
            {"model": settings.ollama_model, "stream": False, "messages": [{"role": "system", "content": system}] + msgs},
            timeout=120.0,
        )
        return data["message"]["content"]
    raise ValueError(f"unknown provider {provider}")


def _llm_reply(history: list[ChatMessage], first_name: str, scan: Scan | None, lang: str) -> dict | None:
    provider = _provider()
    if provider in ("none", ""):
        return None
    try:
        system = (
            SYSTEM_PROMPT.format(emergency=settings.emergency_number, lang=LANG_NAMES.get(lang, "English"))
            + f"\n\nPatient first name: {first_name}.\n{_scan_context(scan)}"
        )
        text = _generate(provider, system, history).strip()
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                data = json.loads(text[start : end + 1])
                if isinstance(data.get("reply"), str):
                    urgency = data.get("urgency") if data.get("urgency") in LEVELS else "routine"
                    qr = [str(q)[:40] for q in (data.get("quick_replies") or [])][:3]
                    return {"reply": data["reply"].strip(), "urgency": urgency, "quick_replies": qr}
            except json.JSONDecodeError:
                pass
        return {"reply": text, "urgency": "routine", "quick_replies": []} if text else None
    except Exception as exc:  # network, auth, rate limit, blocked content... never break the chat
        log.warning("LLM call failed (%s): %s. Using the rule-based fallback.", provider, exc)
        return None


# ---------------------------------------------------------- rule-based layer
TOPICS = [
    ("duration", r"\b(day|days|week|weeks|month|months|year|years|since|ago|born with|always)\b",
     "How long have you had this spot or skin problem, and did it appear suddenly or slowly?",
     ["A few days", "A few months", "Over a year"]),
    ("change", r"\b(chang\w*|grow\w*|grew|bigger|larger|same|stable|darker|lighter|spread\w*)\b",
     "Has it changed in size, shape or colour recently, or has it stayed the same?",
     ["It has grown", "Colour changed", "No change"]),
    ("symptoms", r"\b(itch\w*|pain\w*|hurt\w*|bleed\w*|crust\w*|scab\w*|burn\w*|tender|no symptoms|nothing else)\b",
     "Does it itch, hurt, bleed or form a crust?",
     ["Itchy", "Bleeds sometimes", "No symptoms"]),
    ("history", r"\b(sun|sunburn\w*|tan|tanning|family|mother|father|history|cancer|neither)\b",
     "Do you have a history of heavy sun exposure or sunburns, or any skin cancer in your family?",
     ["Lots of sun", "Family history", "Neither"]),
]

ADVICE = {
    "routine": "Nothing you have described is an obvious warning sign. Keep an eye on it, photograph it monthly next to a ruler, and wear sunscreen. Book a routine skin check if it ever changes.",
    "soon": "Some of what you describe is worth getting looked at. Please book a dermatologist appointment within the next one to two weeks.",
    "urgent": "Some of what you describe needs prompt attention. Please see a doctor or dermatologist within the next day or two, and do not wait for it to settle on its own.",
}

TOPICS_HI = [
    ("duration", _nfc(r"दिन|हफ्त|सप्ताह|महीन|साल|वर्ष|से है|जन्म"),
     "यह दाग या समस्या आपको कब से है, और क्या यह अचानक आई या धीरे-धीरे?",
     ["कुछ दिनों से", "कुछ महीनों से", "एक साल से ज़्यादा"]),
    ("change", _nfc(r"बदल|बढ़|बड़ा|फैल|गहरा|हल्का|वैसा|कोई बदलाव"),
     "क्या हाल ही में इसके आकार, बनावट या रंग में कोई बदलाव आया है, या यह वैसा ही है?",
     ["यह बढ़ गया है", "रंग बदला है", "कोई बदलाव नहीं"]),
    ("symptoms", _nfc(r"खुजली|दर्द|खून|ब्लीडिंग|पपड़ी|जलन|लक्षण"),
     "क्या इसमें खुजली, दर्द, खून आना या पपड़ी बनना होता है?",
     ["खुजली होती है", "कभी-कभी खून आता है", "कोई लक्षण नहीं"]),
    ("history", _nfc(r"धूप|सनबर्न|परिवार|कैंसर|इतिहास|दोनों नहीं|माँ|मां|पिता"),
     "क्या आपने बहुत धूप में समय बिताया है या सनबर्न हुआ है, या परिवार में किसी को त्वचा का कैंसर रहा है?",
     ["बहुत धूप", "परिवार में इतिहास", "दोनों नहीं"]),
]
ADVICE_HI = {
    "routine": "आपने जो बताया उसमें कोई स्पष्ट चेतावनी संकेत नहीं है। इस पर नज़र रखें, हर महीने रूलर के साथ इसकी फोटो लें और सनस्क्रीन लगाएँ। अगर इसमें कोई बदलाव आए तो त्वचा रोग विशेषज्ञ को दिखाएँ।",
    "soon": "आपने जो बताया उसमें से कुछ बातें जाँच करवाने लायक हैं। कृपया अगले एक से दो हफ्तों में त्वचा रोग विशेषज्ञ से मिलें।",
    "urgent": "आपने जो बताया उसमें से कुछ बातों पर जल्दी ध्यान देना ज़रूरी है। कृपया अगले एक-दो दिनों में डॉक्टर या त्वचा रोग विशेषज्ञ को दिखाएँ, और इसके अपने आप ठीक होने का इंतज़ार न करें।",
}
RISK_HI = {"low": "कम", "medium": "मध्यम", "high": "उच्च"}


def _rule_reply(history: list[ChatMessage], urgency: str, flags: list[str], scan: Scan | None, lang: str) -> dict:
    hi = lang == "hi"
    user_text = _nfc(" ".join(m.content for m in history if m.role == "user").lower())
    n_user = sum(1 for m in history if m.role == "user")
    topics = TOPICS_HI if hi else TOPICS
    covered = {key for key, pattern, _, _ in topics if re.search(pattern, user_text)}
    # Anything the patient said right after a question counts as the answer to it ("no", "कोई नहीं"...),
    # otherwise the bot would ask the same question again.
    for m in history:
        if m.role == "assistant":
            covered |= {key for key, _, question, _ in topics if question in m.content}

    prefix = "I can only reply in English without the AI model. " if lang not in ("en", "hi") and n_user == 1 else ""
    if not covered and n_user == 1:
        if hi:
            return {
                "reply": "नमस्ते, मैं आपकी त्वचा की समस्या को समझने में मदद के लिए यहाँ हूँ। आपने अपनी त्वचा पर क्या देखा है, और यह शरीर के किस हिस्से पर है?",
                "quick_replies": ["नया तिल", "चकत्ते", "बदलता हुआ दाग"],
            }
        return {
            "reply": prefix + "Hello, I'm here to help you think through a skin concern. What have you noticed on your skin, and where on your body is it?",
            "quick_replies": ["A new mole", "A rash", "A changing spot"],
        }
    for key, _, question, quick in topics:
        if key not in covered and n_user < 6:
            if hi:
                names = ", ".join(FLAG_HI[f] for f in flags)
                ack = f"धन्यवाद। मैंने ध्यान दिया: {names}। " if flags and n_user == 1 else "धन्यवाद। "
            else:
                ack = f"Thank you. I noticed: {', '.join(flags)}. " if flags and n_user == 1 else "Thanks. "
            return {"reply": prefix + ack + question, "quick_replies": quick}

    if hi:
        parts = ["धन्यवाद, इससे मुझे बेहतर समझ मिली।"]
        if flags:
            parts.append("ध्यान देने योग्य बातें: " + ", ".join(FLAG_HI[f] for f in flags) + "।")
        if scan:
            parts.append(f"आपके स्कैन में {scan.prediction} ({RISK_HI[scan.risk_level]} जोखिम) का संकेत मिला, लेकिन स्कैन केवल एक जाँच-सहायक है।")
        parts.append(ADVICE_HI[urgency])
        parts.append("मैं चैट से निदान नहीं कर सकता, इसलिए अगला कदम डॉक्टर से जाँच करवाना है।")
        return {"reply": " ".join(parts), "quick_replies": ["तब तक मैं क्या करूँ?", "नई चैट शुरू करें"]}

    parts = ["Thank you, that gives me a clearer picture."]
    if flags:
        parts.append("Things worth noting: " + ", ".join(flags) + ".")
    if scan:
        parts.append(f"Your scan suggested {scan.prediction.lower()} ({scan.risk_level} risk), but a scan is only a screening aid.")
    parts.append(ADVICE[urgency])
    parts.append("I can't diagnose from a chat, so a doctor's examination is the next step.")
    return {"reply": " ".join(parts), "quick_replies": ["What can I do meanwhile?", "Start a new chat"]}


# --------------------------------------------------------------- public API
def respond(history: list[ChatMessage], first_name: str, scan: Scan | None, lang: str) -> dict:
    user_text = " ".join(m.content for m in history if m.role == "user")
    last_user = next((m.content for m in reversed(history) if m.role == "user"), "")
    if is_hindi(last_user):  # the patient wrote in Hindi, whatever the language picker says
        lang = "hi"

    flags, rule_urgency, emergency = triage(user_text)
    _, _, last_emergency = triage(last_user)
    floor = "soon" if scan and scan.risk_level == "high" else "routine"

    # Emergency in the latest message: skip the LLM entirely and answer deterministically.
    if last_emergency:
        number = settings.emergency_number
        reply = (
            f"आप जो बता रहे हैं वह गंभीर हो सकता है। कृपया अभी {number} पर कॉल करें या नज़दीकी इमरजेंसी विभाग में जाएँ। अपॉइंटमेंट का इंतज़ार न करें।"
            if lang == "hi"
            else f"What you describe could be serious. Please call {number} or go to the nearest emergency department right now. Do not wait for an appointment."
        )
        return {"reply": reply, "urgency": "urgent", "red_flags": flags, "quick_replies": [], "emergency": True}

    llm = _llm_reply(history, first_name, scan, lang)
    base = llm or _rule_reply(history, _max_level(rule_urgency, floor), flags, scan, lang)
    urgency = _max_level(rule_urgency, floor, (llm or {}).get("urgency", "routine"))
    return {
        "reply": base["reply"],
        "urgency": urgency,
        "red_flags": flags,
        "quick_replies": base.get("quick_replies", []),
        "emergency": False,
    }
