import re
import hashlib
import numpy as np
from typing import Optional

try:
    import onnxruntime as ort
    from transformers import AutoTokenizer
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

MODEL_PATH = "./hatedetector_onnx_int8"   
USE_GPU    = True                            
THRESHOLD  = 0.5                             
 
HATE_KEYWORDS = [
    "putangina", "puta", "gago", "gaga", "bobo", "boba", "tanga", "ulol", "inutil",
    "pakyu", "leche", "tarantado", "lintik", "pesteng yawa", "putang ina mo",
    "hayop ka", "walang kwenta", "bwisit", "engot", "ungas", "walang hiya ka",
    "pukingina", "punyeta", "bwiset", "ampota", "hudas", "buang", "putragis",
    "syet", "shet", "kupal", "hudas", "burat", "punyeta", "putang ina", "tarantado",
    "ungas", "hinayupak", "pesteng yawa", "pakshet", "pakyu", "pakyu ka", "puke ng ina mo",
    "kainin mo tae ko", "supot", "animal ka"
]

HATE_PATTERN = re.compile(
    r'\b(' + '|'.join(re.escape(k) for k in HATE_KEYWORDS) + r')\b',
    re.IGNORECASE
)

def generate_file_hash(uploaded_file, target_column):
    hasher = hashlib.md5()
    for chunk in uploaded_file.chunks():
        hasher.update(chunk)
    if target_column:
        hasher.update(target_column.encode('utf-8'))
    uploaded_file.seek(0) 
    return hasher.hexdigest()

def softmax(x):
    """Compute softmax values for each sets of scores in x to get probabilities."""
    e_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e_x / e_x.sum(axis=-1, keepdims=True)

class HateSpeechDetector:
    def __init__(self, model_dir: Optional[str] = None):
        self._mode = "keyword"  
        self.session = None
        self.tokenizer = None

        if ONNX_AVAILABLE:
            _model_dir = model_dir or MODEL_PATH
            try:
                # 🎯 OPTIMIZATION: Load ONNX Runtime Session (Extremely lightweight)
                providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if USE_GPU else ['CPUExecutionProvider']
                self.session = ort.InferenceSession(f"{_model_dir}/model.onnx", providers=providers)
                self.tokenizer = AutoTokenizer.from_pretrained(_model_dir)
                
                # Dynamically check what inputs the specific ONNX model expects
                self.expected_inputs = [i.name for i in self.session.get_inputs()]
                
                self._mode = "onnx" 
                print(f"[HateDetector] ONNX INT8 Engine loaded successfully from {_model_dir}")
            except Exception as exc:
                print(f"[HateDetector] ONNX load failed ({exc}), falling back to purely keyword mode.")

    def predict(self, text: str) -> dict:
        if not isinstance(text, str) or not text.strip():
            return {"label": "NOT HATE", "confidence": 1.0, "highlights": []}
 
        highlights = self._get_highlights(text)
        if self._mode == "onnx":
            return self._onnx_predict_batch([text])[0]
        return self._keyword_predict(text, highlights)
 
    def predict_batch(self, texts: list) -> list:
        if not texts:
            return []
        if self._mode == "onnx":
            return self._onnx_predict_batch(texts)
        return [self.predict(t) for t in texts]
 
    def _onnx_predict_batch(self, texts: list) -> list:
        try:
            # 1. Tokenize texts
            truncated = [str(t)[:512] if isinstance(t, str) else "" for t in texts]
            inputs = self.tokenizer(truncated, return_tensors="np", truncation=True, max_length=512, padding=True)
            
            # 2. Prepare ONNX dictionary based on model expected inputs
            ort_inputs = {
                "input_ids": inputs["input_ids"],
                "attention_mask": inputs["attention_mask"]
            }
            if "token_type_ids" in self.expected_inputs and "token_type_ids" in inputs:
                ort_inputs["token_type_ids"] = inputs["token_type_ids"]

            # 3. Execute ONNX Inference
            logits = self.session.run(None, ort_inputs)[0]
            
            # 4. Convert Logits to Probabilities using Softmax
            probs = softmax(logits)

            results = []
            for idx, text in enumerate(texts):
                # Assuming standard HuggingFace config where Index 1 is the HATE label
                hate_score = float(probs[idx][1])
                highlights = self._get_highlights(str(text))
                
                label = "HATE" if hate_score >= THRESHOLD else "NOT HATE"
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
            print(f"[HateDetector] ONNX batch inference error: {exc}")
            return [self._keyword_predict(str(t), self._get_highlights(str(t))) for t in texts]
 
    def _keyword_predict(self, text: str, highlights: list) -> dict:
        if highlights:
            conf = min(0.60 + 0.08 * len(highlights), 0.95)
            return {"label": "HATE", "confidence": round(conf, 4), "highlights": highlights}
        return {"label": "NOT HATE", "confidence": 0.85, "highlights": []}
 
    def _get_highlights(self, text: str) -> list:
        return list({m.group(0).lower() for m in HATE_PATTERN.finditer(text)})
 
    @property
    def mode(self) -> str:
        return self._mode
 
    @property
    def is_ready(self) -> bool:
        return self._mode == "onnx"

_detector: Optional[HateSpeechDetector] = None
 
def get_detector() -> HateSpeechDetector:
    global _detector
    if _detector is None:
        _detector = HateSpeechDetector()
    return _detector

def generate_instructor_summary(instructor_name: str, feedback_list: list) -> dict:
    """Extracts the top 5 highest-confidence safe and hate comments for the report."""
    
    # 1. Separate the feedback using the exact labels from your ONNX detector
    safe_comments = [row for row in feedback_list if row.get('label') in ['SAFE', 'NOT HATE']]
    hate_comments = [row for row in feedback_list if row.get('label') == 'HATE']
    
    # 2. Sort both lists by confidence score (highest to lowest)
    safe_sorted = sorted(safe_comments, key=lambda x: x.get('confidence', 0), reverse=True)
    hate_sorted = sorted(hate_comments, key=lambda x: x.get('confidence', 0), reverse=True)
    
    # 3. Grab the top 5 most representative comments
    top_safe = safe_sorted[:5]
    top_hate = hate_sorted[:5]
    
    # 4. Format them beautifully with XML-compliant HTML so RML can parse it
    safe_html = "<br/><br/>".join([
        f"• <i>\"{c.get('text')}\"</i> <br/><font color='#7f8c8d' size='8'>Confidence: {c.get('confidence', 0)*100:.0f}%</font>" 
        for c in top_safe
    ])
    
    hate_html = "<br/><br/>".join([
        f"• <i>\"{c.get('text')}\"</i> <br/><font color='#7f8c8d' size='8'>Confidence: {c.get('confidence', 0)*100:.0f}%</font>" 
        for c in top_hate
    ])
    
    # 5. Return the exact dictionary structure your frontend expects
    return {
        "strengths": safe_html if safe_html else "No positive/safe feedback logged.",
        "concerns": hate_html if hate_html else "No negative/hate feedback logged."
    }