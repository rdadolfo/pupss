import csv
import io
from typing import Optional
from pupss.tools import get_detector
# from pupss.models import HateSpeechReport
# from django.http import JsonResponse


# ── column auto-detection ─────────────────────────────────────────────────────

TEXT_COLUMN_HINTS = [
    "text", "comment", "post", "message", "content", "tweet",
    "feedback", "review", "body", "remarks", "description",
    # Tagalog / Filipino hints
    "mensahe", "komento", "teksto",
]


def detect_text_column(headers: list[str]) -> Optional[str]:
    """
    Try to automatically pick the most likely text column.
    Priority: exact match → partial match → first string-like column.
    """
    lower_headers = [h.lower().strip() for h in headers]

    for hint in TEXT_COLUMN_HINTS:
        if hint in lower_headers:
            return headers[lower_headers.index(hint)]

    for hint in TEXT_COLUMN_HINTS:
        for i, h in enumerate(lower_headers):
            if hint in h:
                return headers[i]

    # Fallback: return first column
    return headers[0] if headers else None


# ── main pipeline ─────────────────────────────────────────────────────────────

def process_csv(
    file_obj,
    text_column: Optional[str] = None,
    max_rows: int = None,
) -> dict:
    """
    Read a CSV, run hate detection on each row, return results dict.

    Returns:
        {
            "headers":      [...original columns...],
            "text_column":  "comment",
            "rows":         [
                {
                    "row_num":    1,
                    "original":   {...original row data...},
                    "label":      "HATE" | "NOT HATE",
                    "confidence": 0.87,
                    "highlights": ["gago", "tanga"],
                },
                ...
            ],
            "stats": {
                "total": 120,
                "hate_count": 34,
                "not_hate_count": 86,
                "hate_pct": 28.3,
            },
            "error": None | "error message"
        }
    """
    try:
        # Handle both file path strings and file-like objects
        if hasattr(file_obj, "read"):
            raw = file_obj.read()
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8-sig", errors="replace")
            reader = csv.DictReader(io.StringIO(raw))
        else:
            with open(file_obj, encoding="utf-8-sig", errors="replace") as f:
                raw = f.read()
            reader = csv.DictReader(io.StringIO(raw))

        headers = reader.fieldnames or []
        if not headers:
            return _error("CSV file has no headers.")

        # Auto-detect text column if not specified
        col = text_column or detect_text_column(list(headers))
        if col not in headers:
            return _error(f"Column '{col}' not found. Available: {', '.join(headers)}")

        # Count rows and collect up to max_rows
        if max_rows is not None:
            try:
                max_rows = int(max_rows)
                if max_rows <= 0:
                    max_rows = None
            except ValueError:
                return _error("max_rows must be an integer or None")
        
        rows_raw = []
        row_count = 0
        for row in reader:
            row_count += 1
            if max_rows is None or len(rows_raw) < max_rows:
                rows_raw.append(row)
        
        if not rows_raw:
            return _error("CSV file is empty.")

        detector = get_detector()

        results = []
        hate_count = 0

        for i, row in enumerate(rows_raw, start=1):
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
            })

        total = len(results)

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


def _error(msg: str) -> dict:
    return {
        "headers": [], "text_column": None, "rows": [], "error": msg,
        "stats": {"total": 0, "hate_count": 0, "not_hate_count": 0, "hate_pct": 0},
    }


# ── export helpers ────────────────────────────────────────────────────────────

def results_to_csv(results: dict) -> str:
    """Convert processed results back to a downloadable CSV string."""
    output = io.StringIO()

    if not results.get("rows"):
        return ""

    extra_cols = ["hate_label", "confidence_pct", "hate_words_found"]
    original_headers = results["headers"]
    all_headers = original_headers + extra_cols

    writer = csv.DictWriter(output, fieldnames=all_headers, extrasaction="ignore")
    writer.writeheader()

    for r in results["rows"]:
        row_data = dict(r["original"])
        row_data["hate_label"]         = r["label"]
        row_data["confidence_pct"]     = f"{r['confidence'] * 100:.1f}%"
        row_data["hate_words_found"]   = ", ".join(r["highlights"]) if r["highlights"] else ""
        writer.writerow(row_data)

    return output.getvalue()
