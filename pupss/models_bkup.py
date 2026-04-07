from django.db import models
from django.contrib.auth.models import User

import re
from typing import Optional

class Document(models.Model):
    title = models.CharField(max_length=100)
    file = models.FileField(upload_to='files/')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        permissions = [
            ("upload_create", "Can upload files (auto-converts)"),
            ("upload_read", "Can view uploaded files & results"),
            ("upload_delete", "Can delete uploaded files & results"),
            ("convert_rerun", "Can manually re-run conversions"),
            ("system_manage", "Can manage system settings"),
            ("user_manage", "Can manage users & roles"),
            ("audit_read", "Can view logs and history"),
        ]
    def __str__(self):
        return self.title

# ── attempt to load transformers ──────────────────────────────────────────────
try:
    from transformers import pipeline as hf_pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

# ── fallback keyword list (lightweight demo mode) ─────────────────────────────
HATE_KEYWORDS = [
    # Tagalog slurs / insults (non-exhaustive, for demo)
    "putangina", "puta", "gago", "bobo", "tanga", "ulol", "inutil",
    "pakyu", "leche", "tarantado", "lintik", "pesteng yawa",
    "hayop ka", "walang kwenta", "bwisit", "engot", "ungas",
    # Common mixed-language hate markers
    "pukingina", "punyeta", "bwiset", "ampota", "hudas",
]

HATE_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(k) for k in HATE_KEYWORDS) + r')\b',
    re.IGNORECASE
)


class HateSpeechDetector:
    """
    Two-mode detector:
      1. Transformer mode  – uses zero-shot multilingual model (accurate)
      2. Keyword mode      – fast regex fallback (no GPU/transformers needed)
    """

    def __init__(self, use_transformer: bool = True, model_name: Optional[str] = None):
        self.use_transformer = use_transformer and TRANSFORMERS_AVAILABLE
        self.classifier = None

        if self.use_transformer:
            _model = model_name or "facebook/bart-large-mnli"
            try:
                self.classifier = hf_pipeline(
                    "zero-shot-classification",
                    model=_model,
                    device=-1,          # CPU; set to 0 for GPU
                )
                print(f"[HateDetector] Transformer loaded: {_model}")
            except Exception as exc:
                print(f"[HateDetector] Transformer load failed ({exc}), falling back to keyword mode.")
                self.use_transformer = False

    # ── public API ────────────────────────────────────────────────────────────

    def predict(self, text: str) -> dict:
        """
        Returns:
            {
                "label":      "HATE" | "NOT HATE",
                "confidence": 0.0–1.0,
                "highlights": ["word1", "word2", ...]   # matched hate words
            }
        """
        if not isinstance(text, str) or not text.strip():
            return {"label": "NOT HATE", "confidence": 1.0, "highlights": []}

        highlights = self._extract_highlights(text)

        if self.use_transformer:
            return self._transformer_predict(text, highlights)
        else:
            return self._keyword_predict(text, highlights)

    def predict_batch(self, texts: list[str]) -> list[dict]:
        return [self.predict(t) for t in texts]

    # ── private helpers ───────────────────────────────────────────────────────

    def _extract_highlights(self, text: str) -> list[str]:
        """Find hate keywords present in the text."""
        return list({m.group(0).lower() for m in HATE_PATTERN.finditer(text)})

    def _transformer_predict(self, text: str, highlights: list[str]) -> dict:
        candidate_labels = ["hate speech", "not hate speech"]
        try:
            result = self.classifier(
                text[:512],          # truncate for speed
                candidate_labels=candidate_labels,
                hypothesis_template="This text is {}.",
            )
            top_label = result["labels"][0]
            confidence = result["scores"][0]
            label = "HATE" if "hate" in top_label and "not" not in top_label else "NOT HATE"

            # Boost confidence if keywords also found
            if label == "NOT HATE" and highlights:
                label = "HATE"
                confidence = max(confidence, 0.75)

            return {"label": label, "confidence": round(confidence, 4), "highlights": highlights}

        except Exception as exc:
            print(f"[HateDetector] Inference error: {exc}")
            return self._keyword_predict(text, highlights)

    def _keyword_predict(self, text: str, highlights: list[str]) -> dict:
        """Simple keyword-based fallback."""
        if highlights:
            # Rough confidence: more keywords → higher confidence
            conf = min(0.60 + 0.08 * len(highlights), 0.95)
            return {"label": "HATE", "confidence": round(conf, 4), "highlights": highlights}
        return {"label": "NOT HATE", "confidence": 0.85, "highlights": []}


# ── module-level singleton (lazy) ─────────────────────────────────────────────
_detector: Optional[HateSpeechDetector] = None


def get_detector() -> HateSpeechDetector:
    global _detector
    if _detector is None:
        _detector = HateSpeechDetector(use_transformer=TRANSFORMERS_AVAILABLE)
    return _detector
