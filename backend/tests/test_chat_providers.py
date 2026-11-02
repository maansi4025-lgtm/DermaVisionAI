import os, tempfile
_t = tempfile.mkdtemp()
os.environ.update(DATABASE_URL=f"sqlite:///{_t}/t.db", MEDIA_DIR=f"{_t}/m", ANTHROPIC_API_KEY="", GEMINI_API_KEY="")

from app.models import ChatMessage
from app.services import chatbot
from app.services.chatbot import triage


def _hist(text):
    return [ChatMessage(role="user", content=text)]


def test_gemini_provider_parses_json_and_keeps_safety_floor(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "gemini_api_key", "k")
    monkeypatch.setattr(chatbot.settings, "llm_provider", "auto")
    seen = {}

    def fake(url, payload, headers=None, timeout=0):
        seen.update(url=url, headers=headers, payload=payload)
        body = '{"reply": "Thanks, how long has it been there?", "urgency": "routine", "quick_replies": ["A week"]}'
        return {"candidates": [{"content": {"parts": [{"text": body}]}}]}

    monkeypatch.setattr(chatbot, "_post_json", fake)
    r = chatbot.respond(_hist("my mole has been bleeding"), "Ann", None, "en")
    assert r["reply"].startswith("Thanks") and r["quick_replies"] == ["A week"]
    assert r["urgency"] == "urgent"  # red-flag rules override the model saying "routine"
    assert seen["headers"]["x-goog-api-key"] == "k" and "system_instruction" in seen["payload"]


def test_ollama_provider(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "llm_provider", "ollama")
    monkeypatch.setattr(chatbot, "_post_json", lambda *a, **k: {"message": {"content": "plain text reply"}})
    r = chatbot.respond(_hist("I have a rash"), "Ann", None, "en")
    assert r["reply"] == "plain text reply"


def test_provider_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "gemini_api_key", "k")
    monkeypatch.setattr(chatbot.settings, "llm_provider", "auto")

    def boom(*a, **k):
        raise OSError("network down")

    monkeypatch.setattr(chatbot, "_post_json", boom)
    r = chatbot.respond(_hist("hi"), "Ann", None, "en")
    assert "What have you noticed" in r["reply"]


def test_emergency_never_calls_llm(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "gemini_api_key", "k")
    monkeypatch.setattr(chatbot, "_post_json", lambda *a, **k: (_ for _ in ()).throw(AssertionError("LLM called")))
    assert chatbot.respond(_hist("I can't breathe and my face is swelling"), "Ann", None, "en")["emergency"]


def test_gemini_unknown_model_auto_switches(monkeypatch):
    from app.services.chatbot import LLMHTTPError

    monkeypatch.setattr(chatbot.settings, "gemini_api_key", "k")
    monkeypatch.setattr(chatbot.settings, "llm_provider", "auto")
    monkeypatch.setattr(chatbot, "_gemini_model", None)
    monkeypatch.setattr(chatbot, "_gemini_alts", None)
    calls = []

    def fake_post(url, payload, headers=None, timeout=0):
        calls.append(url)
        if "bad-model" in url:
            raise LLMHTTPError(404, "model not found")
        body = '{"reply": "Hello from the right model", "urgency": "routine", "quick_replies": []}'
        return {"candidates": [{"content": {"parts": [{"text": body}]}}]}

    models = {"models": [
        {"name": "models/gemini-2.0-pro-exp", "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/gemini-flash-latest", "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/gemini-flash-lite-latest", "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
    ]}
    monkeypatch.setattr(chatbot.settings, "gemini_model", "bad-model")
    monkeypatch.setattr(chatbot, "_post_json", fake_post)
    monkeypatch.setattr(chatbot, "_get_json", lambda *a, **k: models)
    r = chatbot.respond(_hist("a rash"), "Ann", None, "en")
    assert r["reply"] == "Hello from the right model"
    assert calls[-1].endswith("gemini-flash-lite-latest:generateContent")
    assert chatbot._gemini_model == "gemini-flash-lite-latest"
    monkeypatch.setattr(chatbot, "_gemini_model", None)


def test_gemini_overloaded_retries_other_model(monkeypatch):
    from app.services.chatbot import LLMHTTPError

    monkeypatch.setattr(chatbot.settings, "gemini_api_key", "k")
    monkeypatch.setattr(chatbot.settings, "llm_provider", "auto")
    monkeypatch.setattr(chatbot.settings, "gemini_model", "model-a")
    monkeypatch.setattr(chatbot, "_gemini_model", None)
    monkeypatch.setattr(chatbot, "_gemini_alts", None)
    used = []

    def fake_post(url, payload, headers=None, timeout=0):
        used.append(url.split("models/")[1].split(":")[0])
        if used[-1] == "model-a":
            raise LLMHTTPError(503, "high demand")
        return {"candidates": [{"content": {"parts": [{"text": '{"reply": "ok", "urgency": "routine", "quick_replies": []}'}]}}]}

    monkeypatch.setattr(chatbot, "_post_json", fake_post)
    monkeypatch.setattr(chatbot, "_get_json", lambda *a, **k: {"models": [
        {"name": "models/model-a", "supportedGenerationMethods": ["generateContent"]},
        {"name": "models/gemini-flash-b", "supportedGenerationMethods": ["generateContent"]}]})
    assert chatbot.respond(_hist("a rash"), "Ann", None, "en")["reply"] == "ok"
    assert used == ["model-a", "gemini-flash-b"]
    monkeypatch.setattr(chatbot, "_gemini_model", None)
    monkeypatch.setattr(chatbot, "_gemini_alts", None)


def test_timeout_falls_back_instead_of_crashing(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "gemini_api_key", "k")
    monkeypatch.setattr(chatbot.settings, "llm_provider", "auto")
    monkeypatch.setattr(chatbot, "_gemini_model", None)
    monkeypatch.setattr(chatbot, "_gemini_alts", ["only-model"])

    def slow(*a, **k):
        raise TimeoutError("The read operation timed out")

    monkeypatch.setattr(chatbot, "_post_json", slow)
    assert "What have you noticed" in chatbot.respond(_hist("hi"), "Ann", None, "en")["reply"]


def test_hindi_rule_based_flow(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "llm_provider", "none")
    r = chatbot.respond(_hist("नमस्ते"), "Ann", None, "hi")
    assert r["reply"].startswith("नमस्ते") and "त्वचा पर क्या देखा" in r["reply"]
    # Hindi text is detected even if the language picker says English
    r = chatbot.respond(_hist("मेरे तिल पर 2 महीने से खुजली है"), "Ann", None, "en")
    assert "बदलाव" in r["reply"] and "soon" == r["urgency"]
    h = [ChatMessage(role="user", content="मेरे तिल पर 2 महीने से खुजली है, कोई बदलाव नहीं, परिवार में कैंसर नहीं")]
    r = chatbot.respond(h, "Ann", None, "hi")
    assert "डॉक्टर" in r["reply"] and r["urgency"] == "soon"


def test_hindi_red_flags(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "llm_provider", "none")
    assert triage("तिल से खून आ रहा है")[1] == "urgent"
    assert triage("खून नहीं आ रहा")[1] == "routine"
    assert triage("मुझे साँस लेने में तकलीफ हो रही है")[2] is True
    r = chatbot.respond(_hist("मुझे सांस लेने में तकलीफ है"), "Ann", None, "hi")
    assert r["emergency"] and "112" in r["reply"] and "कृपया" in r["reply"]


def test_short_answer_does_not_repeat_question(monkeypatch):
    monkeypatch.setattr(chatbot.settings, "llm_provider", "none")
    for lang, first, second in [("en", "a mole on my arm for 3 months", "no"), ("hi", "हाथ पर तिल, 3 महीने से", "कोई नहीं")]:
        h = [ChatMessage(role="user", content=first)]
        q1 = chatbot.respond(h, "Ann", None, lang)["reply"]
        h += [ChatMessage(role="assistant", content=q1), ChatMessage(role="user", content=second)]
        q2 = chatbot.respond(h, "Ann", None, lang)["reply"]
        assert q2 != q1 and not q2.endswith(q1.split(". ")[-1]), (lang, q1, q2)
