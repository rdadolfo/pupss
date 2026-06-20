import csv
import io
from typing import Optional
from pupss.tools import get_detector

# ── column auto-detection ─────────────────────────────────────────────────────
TEXT_COLUMN_HINTS = [
    "text", "comment", "post", "message", "content", "tweet",
    "feedback", "review", "body", "remarks", "description",
    "mensahe", "komento", "teksto",
]

def detect_text_column(headers: list[str]) -> Optional[str]:
    lower_headers = [h.lower().strip() for h in headers]
    for hint in TEXT_COLUMN_HINTS:
        if hint in lower_headers:
            return headers[lower_headers.index(hint)]
    for hint in TEXT_COLUMN_HINTS:
        for i, h in enumerate(lower_headers):
            if hint in h:
                return headers[i]
    return headers[0] if headers else None


# ── main pipeline ─────────────────────────────────────────────────────────────
def process_csv(
    file_obj,
    text_column: Optional[str] = None,
    max_rows: int = None,
    author_column: Optional[str] = None,
    target_column: Optional[str] = None,
) -> dict:
    
    try:
        # 🎯 OPTIMIZATION: Stream the file line-by-line instead of loading to RAM
        if hasattr(file_obj, 'chunks'): # Django UploadedFile
            text_stream = io.TextIOWrapper(file_obj.file, encoding='utf-8-sig', errors='replace')
        elif hasattr(file_obj, "read"):
            if isinstance(file_obj.read(0), bytes):
                text_stream = io.TextIOWrapper(file_obj, encoding="utf-8-sig", errors="replace")
            else:
                text_stream = file_obj
        else:
            text_stream = open(file_obj, mode='r', encoding="utf-8-sig", errors="replace")

        reader = csv.DictReader(text_stream)
        headers = reader.fieldnames or []
        
        if not headers:
            return _error("CSV file has no headers.")

        col = text_column or detect_text_column(list(headers))
        if col not in headers:
            return _error(f"Column '{col}' not found. Available: {', '.join(headers)}")

        if max_rows is not None:
            try:
                max_rows = max(int(max_rows), 0) or None
            except ValueError:
                return _error("max_rows must be an integer or None")
        
        detector = get_detector()
        results = []
        hate_count = 0

        # Process while reading to save memory
        for i, row in enumerate(reader, start=1):
            if max_rows and i > max_rows:
                break
                
            text = row.get(col, "") or ""
            pred = detector.predict(text)

            if pred["label"] == "HATE":
                hate_count += 1

            results.append({
                "row_num":    i,
                "original":   dict(row),
                "text":       text,
                "label":      pred["label"],
                "confidence": pred["confidence"],
                "highlights": pred["highlights"],
                "author":     row.get(author_column) if author_column else None,
                "target":     row.get(target_column) if target_column else None,
            })

        total = len(results)
        if total == 0:
            return _error("CSV file is empty.")

        return {
            "headers":     list(headers),
            "text_column": col,
            "rows":        results,
            "stats": {
                "total":         total,
                "hate_count":    hate_count,
                "not_hate_count": total - hate_count,
                "hate_pct":      round(hate_count / total * 100, 1) if total else 0,
            },
            "error": None,
        }

    except Exception as exc:
        return _error(str(exc))
    finally:
        # Reset file pointer if needed downstream
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)

def _error(msg: str) -> dict:
    return {
        "headers": [], "text_column": None, "rows": [], "error": msg,
        "stats": {"total": 0, "hate_count": 0, "not_hate_count": 0, "hate_pct": 0},
    }

# ── export helpers ────────────────────────────────────────────────────────────
def results_to_csv(results: dict) -> str:
    output = io.StringIO()
    if not results.get("rows"):
        return ""

    all_headers = results["headers"] + ["hate_label", "confidence_pct", "hate_words_found"]
    writer = csv.DictWriter(output, fieldnames=all_headers, extrasaction="ignore")
    writer.writeheader()

    for r in results["rows"]:
        row_data = dict(r["original"])
        row_data.update({
            "hate_label": r["label"],
            "confidence_pct": f"{r['confidence'] * 100:.1f}%",
            "hate_words_found": ", ".join(r["highlights"]) if r["highlights"] else ""
        })
        writer.writerow(row_data)

    return output.getvalue()