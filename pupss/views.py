import os, json
from django.contrib.auth import logout
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required, permission_required
from .forms import DocumentForm
from django.http import HttpResponse, JsonResponse
from django.conf import settings
from django.views.decorators.http import require_POST, require_GET
from .processor import process_csv, results_to_csv, detect_text_column

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

    results = process_csv(uploaded, text_column=text_column)

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
    import csv, io

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
