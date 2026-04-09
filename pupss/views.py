import os
import json
from django.contrib.auth import logout
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required, permission_required
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from django.views.decorators.http import require_POST, require_GET
from pupss.processor import process_csv, results_to_csv, detect_text_column
from pupss.tools import generate_file_hash
from pupss.models import HateSpeechReport


# Create your views here.

def landing(request):
    return render(request, "landing.html")

@login_required(login_url='login')
def dashboard(request):
    if request.user.groups.filter(name__in=["Manager", "Admin", "Auditor"]).exists():
        return render(request, "dashboard.html")
    return render(request, "landing.html")

@login_required(login_url='login')
def hatedetector(request):
    return render(request, "hatedetector.html")

@login_required(login_url='/')
@permission_required('files.upload_create', raise_exception=True)
def upload_file(request):
    if request.method == "POST" and request.FILES.get("file"):
        uploaded_file = request.FILES["file"]

        # Ensure the upload folder exists
        os.makedirs(settings.UPLOAD_ROOT, exist_ok=True)

        # Build file path
        file_path = os.path.join(settings.UPLOAD_ROOT, uploaded_file.name)

        # Save the uploaded file
        with open(file_path, "wb+") as destination:
            for chunk in uploaded_file.chunks():
                destination.write(chunk)

        # Respond with JSON
        return JsonResponse({
            "status": "success",
            "filename": uploaded_file.name,
            "path": f"/upload/{uploaded_file.name}"
        })

    return JsonResponse({"error": "Invalid request"}, status=400)

def custom_logout(request):
    logout(request)
    request.session.flush()  
    return redirect("landing")

def upload_view(request):
    """Render the upload page (your existing hatedetector.html)."""
    return render(request, "hatedetector.html")


# ── Process CSV (AJAX or form POST) ──────────────────────────────────────────
@login_required(login_url='/')
@require_POST
def process_view(request):
    """
    Accepts multipart/form-data with:
        file        – the CSV file
        text_column – (optional) column name override

    Returns JSON with detection results.
    """
    uploaded = request.FILES.get("file")
    if not uploaded:
        return JsonResponse({"error": "No file uploaded."}, status=400)

    if not uploaded.name.lower().endswith(".csv"):
        return JsonResponse({"error": "Only CSV files are supported."}, status=400)

    text_column = request.POST.get("text_column") or None
    check_file_hash = generate_file_hash(uploaded, text_column)
    current_user = request.user if request.user.is_authenticated else None

    existing_report = HateSpeechReport.objects.filter(file_hash=check_file_hash).first()

    if existing_report:
        cache_data = existing_report.results_data
        cache_data["is_cached"] = True
        return JsonResponse(existing_report.results_data)
    
    results = process_csv(uploaded, text_column=text_column)

    if not results.get("error"):
        results["is_cached"] = False
        report_name = f"{uploaded.name[:-4]}_{text_column}"
        HateSpeechReport.objects.create(
            report_name=report_name,
            original_filename=uploaded.name,
            text_column=text_column or "Auto-detected",
            file_hash=check_file_hash,
            results_data=results,
            created_by=current_user,
        )

    if results["error"]:
        return JsonResponse({"error": results["error"]}, status=422)

    # Store results in session so download view can access them
    request.session["hate_results_json"] = json.dumps(results)

    return JsonResponse({
        "text_column": results["text_column"],
        "headers":     results["headers"],
        "stats":       results["stats"],
        "rows":        results["rows"],   # full row data for the table
    })


# ── Download results as CSV ───────────────────────────────────────────────────

@require_GET
def download_view(request):
    """Return processed results as a downloadable CSV."""
    raw = request.session.get("hate_results_json")
    if not raw:
        return HttpResponse("No results found. Please process a file first.", status=404)

    results = json.loads(raw)
    csv_str = results_to_csv(results)

    response = HttpResponse(csv_str, content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="hate_speech_results.csv"'
    return response


# ── (Optional) column preview – detect text column before full run ─────────────

@require_POST
def preview_columns_view(request):
    """
    Quickly reads just the header row of the uploaded CSV and returns
    the detected text column + all available columns.
    Useful for letting the user confirm/override the column before processing.
    """
    import csv
    import io

    uploaded = request.FILES.get("file")
    if not uploaded:
        return JsonResponse({"error": "No file."}, status=400)

    raw = uploaded.read(4096).decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(raw))
    try:
        headers = next(reader)
    except StopIteration:
        return JsonResponse({"error": "Empty file."}, status=422)

    detected = detect_text_column(headers)
    return JsonResponse({"headers": headers, "detected_column": detected})


@require_GET
def dashboard_data_view(request):
    # SECURITY BONUS: Let's protect this API with the exact same security you used above!
    if not request.user.groups.filter(name__in=["Manager", "Admin", "Auditor"]).exists():
        return JsonResponse({"error": "Unauthorized"}, status=403)

    # Grab all reports
    all_reports = HateSpeechReport.objects.all().order_by('-created_at')
    
    total_reports = all_reports.count()
    grand_total_rows = 0
    grand_total_hate = 0
    grand_total_safe = 0
    table_rows = []

    for report in all_reports:
        stats = report.results_data.get("stats", {})
        grand_total_rows += stats.get("total", 0)
        grand_total_hate += stats.get("hate_count", 0)
        grand_total_safe += stats.get("not_hate_count", 0)
        
        table_rows.append({
            "id": report.id,
            "filename": report.original_filename,
            "date": report.created_at.strftime("%Y-%m-%d %H:%M"),
            "uploader": report.created_by.username if report.created_by else "Guest",
            "hate_count": stats.get("hate_count", 0),
            "safe_count": stats.get("not_hate_count", 0),
            "total_rows": stats.get("total", 0)
        })

    overall_hate_pct = round((grand_total_hate / grand_total_rows) * 100, 2) if grand_total_rows > 0 else 0

    return JsonResponse({
        "summary": {
            "total_reports": total_reports,
            "total_rows": grand_total_rows,
            "total_hate": grand_total_hate,
            "total_safe": grand_total_safe,
            "overall_pct": overall_hate_pct
        },
        "table_data": table_rows
    })