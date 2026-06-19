import re
import hashlib
from typing import Optional

def generate_file_hash(uploaded_file, target_column):
    hasher = hashlib.md5()
    for chunk in uploaded_file.chunks():
        hasher.update(chunk)
    if target_column:
        hasher.update(target_column.encode('utf-8'))
    uploaded_file.seek(0) 
    return hasher.hexdigest()

try:
    from transformers import pipeline as hf_pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

MODEL_PATH = "./hatedetector"   
USE_GPU    = True                            
THRESHOLD  = 0.5                             
 
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
    def __init__(self, use_transformer: bool = True, model_name: Optional[str] = None):
        self.use_transformer = use_transformer and TRANSFORMERS_AVAILABLE
        self.classifier = None
        self._mode = "keyword"  

        if self.use_transformer:
            _model = model_name or "./hatedetector"
            try:
                self.classifier = hf_pipeline(
                    "text-classification",
                    model=_model,
                    device=0 if USE_GPU else -1,          
                )
                self._mode = "bert"  # 🎯 FIX: Standardized string variable assignment matching downstream lookups
                print(f"[HateDetector] Transformer loaded: {_model}")
            except Exception as exc:
                print(f"[HateDetector] Transformer load failed ({exc}), falling back to keyword mode.")
                self.use_transformer = False

    def predict(self, text: str) -> dict:
        if not isinstance(text, str) or not text.strip():
            return {"label": "NOT HATE", "confidence": 1.0, "highlights": []}
 
        highlights = self._get_highlights(text)
        if self._mode == "bert":
            return self._bert_predict(text, highlights)
        return self._keyword_predict(text, highlights)
 
    def predict_batch(self, texts: list) -> list:
        if not texts:
            return []
        if self._mode == "bert":
            return self._bert_predict_batch(texts)
        return [self.predict(t) for t in texts]
 
    def _bert_predict(self, text: str, highlights: list) -> dict:
        try:
            scores     = self.classifier(text[:512])[0]
            hate_score = self._get_hate_score(scores)
            label      = "HATE" if hate_score >= THRESHOLD else "NOT HATE"
            confidence = hate_score if label == "HATE" else 1 - hate_score
 
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
 
    def _get_highlights(self, text: str) -> list:
        return list({m.group(0).lower() for m in HATE_PATTERN.finditer(text)})
 
    def _get_hate_score(self, scores: list) -> float:
        for s in scores:
            lbl = s["label"].upper()
            if lbl in ("LABEL_1", "1", "HATE"):
                return float(s["score"])
        return float(scores[1]["score"]) if len(scores) > 1 else 0.0
 
    @property
    def mode(self) -> str:
        return self._mode
 
    @property
    def is_ready(self) -> bool:
        return self._mode == "bert"

_detector: Optional[HateSpeechDetector] = None
 
def get_detector() -> HateSpeechDetector:
    global _detector
    if _detector is None:
        _detector = HateSpeechDetector()
    return _detector