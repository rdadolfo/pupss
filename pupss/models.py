from django.db import models
from django.contrib.auth.models import User

import os, re
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

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = "./hatedetector"   # <- path to your saved checkpoint
USE_GPU    = True                            # set False to force CPU
THRESHOLD  = 0.5                             # hate score threshold
 
# ── Keyword fallback ──────────────────────────────────────────────────────────
HATE_KEYWORDS = [
    "putangina", "puta", "gago", "bobo", "tanga", "ulol", "inutil",
    "pakyu", "leche", "tarantado", "lintik", "pesteng yawa",
    "hayop ka", "walang kwenta", "bwisit", "engot", "ungas",
    "pukingina", "punyeta", "bwiset", "ampota", "hudas",
]
HATE_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(k) for k in HATE_KEYWORDS) + r')\b',
    re.IGNORECASE
)
 
 
class HateSpeechDetector:
    """
    Loads your fine-tuned BERT model for Taglish hate speech detection.
    Falls back to keyword detection if the model cannot be loaded.
 
    Modes:
      1. bert    - your fine-tuned checkpoint (90% F1)
      2. keyword - regex fallback (always available)
    """
 
    def __init__(self):
        self._mode      = "keyword"
        self.classifier = None
        self._load_model()
 
    # ── Loader ────────────────────────────────────────────────────────────────
 
    def _load_model(self):
        if not os.path.isdir(MODEL_PATH):
            print(f"[HateDetector] Model not found at '{MODEL_PATH}'")
            print("[HateDetector] Using keyword fallback.")
            print("[HateDetector] Run your training notebook to generate the model first.")
            return
 
        try:
            from transformers import (
                AutoTokenizer,
                AutoModelForSequenceClassification,
                pipeline as hf_pipeline,
            )
            import torch
 
            # Determine device
            if USE_GPU and torch.cuda.is_available():
                device     = 0
                device_str = f"GPU ({torch.cuda.get_device_name(0)})"
            else:
                device     = -1
                device_str = "CPU"
 
            tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
            model     = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
 
            self.classifier = hf_pipeline(
                "text-classification",
                model             = model,
                tokenizer         = tokenizer,
                device            = device,
                return_all_scores = True,
            )
 
            self._mode = "bert"
            print(f"[HateDetector] Fine-tuned BERT loaded from '{MODEL_PATH}'")
            print(f"[HateDetector] Device : {device_str}")
 
        except Exception as exc:
            print(f"[HateDetector] Model load failed: {exc}")
            print("[HateDetector] Using keyword fallback.")
 
    # ── Public API ────────────────────────────────────────────────────────────
 
    def predict(self, text: str) -> dict:
        """
        Returns:
            {
                "label":      "HATE" | "NOT HATE",
                "confidence": 0.0-1.0,
                "highlights": ["word1", "word2", ...]
            }
        """
        if not isinstance(text, str) or not text.strip():
            return {"label": "NOT HATE", "confidence": 1.0, "highlights": []}
 
        highlights = self._get_highlights(text)
 
        if self._mode == "bert":
            return self._bert_predict(text, highlights)
        return self._keyword_predict(text, highlights)
 
    def predict_batch(self, texts: list) -> list:
        """Run prediction on a list of texts efficiently."""
        if not texts:
            return []
 
        # Use batch inference for BERT (much faster than one-by-one)
        if self._mode == "bert":
            return self._bert_predict_batch(texts)
 
        return [self.predict(t) for t in texts]
 
    # ── Internal prediction ───────────────────────────────────────────────────
 
    def _bert_predict(self, text: str, highlights: list) -> dict:
        try:
            scores     = self.classifier(text[:512])[0]
            hate_score = self._get_hate_score(scores)
            label      = "HATE" if hate_score >= THRESHOLD else "NOT HATE"
            confidence = hate_score if label == "HATE" else 1 - hate_score
 
            # Keyword boost: BERT says NOT HATE but keywords found -> escalate
            if label == "NOT HATE" and highlights:
                label      = "HATE"
                confidence = max(float(confidence), 0.72)
 
            return {
                "label":      label,
                "confidence": round(float(confidence), 4),
                "highlights": highlights,
            }
 
        except Exception as exc:
            print(f"[HateDetector] Inference error: {exc}")
            return self._keyword_predict(text, highlights)
 
    def _bert_predict_batch(self, texts: list) -> list:
        """Batch inference — significantly faster for CSV processing."""
        try:
            truncated  = [str(t)[:512] if isinstance(t, str) else "" for t in texts]
            all_scores = self.classifier(truncated, batch_size=32)
 
            results = []
            for text, scores in zip(texts, all_scores):
                highlights = self._get_highlights(str(text))
                hate_score = self._get_hate_score(scores)
                label      = "HATE" if hate_score >= THRESHOLD else "NOT HATE"
                confidence = hate_score if label == "HATE" else 1 - hate_score
 
                if label == "NOT HATE" and highlights:
                    label      = "HATE"
                    confidence = max(float(confidence), 0.72)
 
                results.append({
                    "label":      label,
                    "confidence": round(float(confidence), 4),
                    "highlights": highlights,
                })
            return results
 
        except Exception as exc:
            print(f"[HateDetector] Batch inference error: {exc}")
            return [self.predict(t) for t in texts]
 
    def _keyword_predict(self, text: str, highlights: list) -> dict:
        if highlights:
            conf = min(0.60 + 0.08 * len(highlights), 0.95)
            return {"label": "HATE", "confidence": round(conf, 4), "highlights": highlights}
        return {"label": "NOT HATE", "confidence": 0.85, "highlights": []}
 
    # ── Helpers ───────────────────────────────────────────────────────────────
 
    def _get_highlights(self, text: str) -> list:
        return list({m.group(0).lower() for m in HATE_PATTERN.finditer(text)})
 
    def _get_hate_score(self, scores: list) -> float:
        """
        Extract hate probability from classifier output.
        Handles LABEL_0/LABEL_1 and custom label names robustly.
        """
        for s in scores:
            lbl = s["label"].upper()
            if lbl in ("LABEL_1", "1", "HATE"):
                return float(s["score"])
        # Fallback: assume [not_hate, hate] ordering
        return float(scores[1]["score"]) if len(scores) > 1 else 0.0
 
    @property
    def mode(self) -> str:
        return self._mode
 
    @property
    def is_ready(self) -> bool:
        return self._mode == "bert"
 
 
# ── Singleton ─────────────────────────────────────────────────────────────────
_detector: Optional[HateSpeechDetector] = None
 
 
def get_detector() -> HateSpeechDetector:
    global _detector
    if _detector is None:
        _detector = HateSpeechDetector()
    return _detector