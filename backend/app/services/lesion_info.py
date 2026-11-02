"""Class metadata + risk logic for the 7 HAM10000 diagnostic categories."""

# code -> (display name, base risk)
CLASS_INFO = {
    "akiec": ("Actinic keratosis", "medium"),  # pre-cancerous
    "bcc": ("Basal cell carcinoma", "high"),
    "bkl": ("Benign keratosis-like lesion", "low"),
    "df": ("Dermatofibroma", "low"),
    "mel": ("Melanoma", "high"),
    "nv": ("Melanocytic nevus", "low"),
    "vasc": ("Vascular lesion", "low"),
}

# Tune these on your validation set. They deliberately favour sensitivity (catching cancers)
# over specificity, because a missed melanoma is far worse than an unnecessary doctor visit.
MALIGNANT_MASS_HIGH = 0.25   # P(mel)+P(bcc) at or above this -> high risk even if top-1 is benign
PRECANCER_MASS_MED = 0.30    # P(akiec) at or above this -> at least medium
LOW_CONFIDENCE = 0.50        # top-1 below this -> at least medium (model is unsure)


def assess_risk(probs: dict[str, float]) -> tuple[str, str]:
    """Return (risk_level, top_code). Risk looks at probability mass, not just the top-1 label."""
    top = max(probs, key=probs.get)
    malignant = probs.get("mel", 0.0) + probs.get("bcc", 0.0)
    if CLASS_INFO[top][1] == "high" or malignant >= MALIGNANT_MASS_HIGH:
        return "high", top
    if (
        CLASS_INFO[top][1] == "medium"
        or probs.get("akiec", 0.0) >= PRECANCER_MASS_MED
        or probs[top] < LOW_CONFIDENCE
    ):
        return "medium", top
    return "low", top


def build_insight(top_code: str, confidence: float, risk: str) -> str:
    name = CLASS_INFO[top_code][0]
    if risk == "high":
        text = (
            f"The model found features that may be associated with {name.lower()} or other skin cancers. "
            "This is not a diagnosis, but please see a dermatologist promptly for an in-person examination."
        )
    elif risk == "medium":
        text = (
            f"The strongest match was {name.lower()}, but the result is either uncertain or involves a "
            "lesion that deserves a professional look. Consider booking a dermatologist visit."
        )
    else:
        text = (
            f"The strongest match was {name.lower()}, which is usually harmless. Keep monitoring the spot "
            "and see a doctor if it changes in size, shape or colour, bleeds, or starts to itch."
        )
    if confidence < LOW_CONFIDENCE:
        text += " The model's confidence is low, so treat this result with extra caution."
    text += " Photos taken with a phone are different from the dermoscopic images the model learned from, so accuracy may be lower."
    return text
