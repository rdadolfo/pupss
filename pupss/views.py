import json
import csv
import io
import math

from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST, require_GET

# Custom App Imports
from pupss.processor import process_csv, results_to_csv, detect_text_column
from pupss.tools import generate_file_hash
from pupss.models import HateSpeechReport
from pupss.pdf_service import generate_rml_insight_report


# ── HTML Web Pages ───────────────────────────────────────────────────────────

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

@login_required(login_url='login')
def report_generation(request):
    return render(request, "report_generation.html")

def custom_logout(request):
    logout(request)
    request.session.flush()  
    return redirect("landing")


# ── Hate Detector API Endpoints (JSON) ───────────────────────────────────────

@require_POST
def preview_columns_view(request):
    """Reads the header row of the CSV to detect the text column."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized access."}, status=401)

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

@require_POST
def process_view(request):
    """Processes the CSV through the AI model and saves the report."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized access."}, status=401)

    uploaded = request.FILES.get("file")
    if not uploaded or not uploaded.name.lower().endswith(".csv"):
        return JsonResponse({"error": "A valid CSV file is required."}, status=400)

    text_column = request.POST.get("text_column") or None
    author_column = request.POST.get("author_column") or None
    target_column = request.POST.get("target_column") or None

    check_file_hash = generate_file_hash(uploaded, text_column)
    existing_report = HateSpeechReport.objects.filter(file_hash=check_file_hash).first()

    if existing_report:
        cache_data = existing_report.results_data
        cache_data["is_cached"] = True
        return JsonResponse(cache_data)
    
    results = process_csv(uploaded, text_column=text_column, author_column=author_column, target_column=target_column)

    if results.get("error"):
        return JsonResponse({"error": results["error"]}, status=422)

    results["is_cached"] = False
    report_name = f"{uploaded.name[:-4]}_{text_column}"
    
    HateSpeechReport.objects.create(
        report_name=report_name,
        original_filename=uploaded.name,
        text_column=text_column or "Auto-detected",
        file_hash=check_file_hash,
        results_data=results,
        created_by=request.user,
    )

    request.session["hate_results_json"] = json.dumps(results)

    return JsonResponse({
        "text_column": results["text_column"],
        "headers": results["headers"],
        "stats": results["stats"],
        "rows": results["rows"], 
    })


# ── Dashboard API Endpoints (JSON) ───────────────────────────────────────────

@require_GET
def dashboard_data_view(request):
    """Returns summary statistics and a paginated list of recent reports."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized access."}, status=401)
    if not request.user.groups.filter(name__in=["Manager", "Admin", "Auditor"]).exists():
        return JsonResponse({"error": "Forbidden: Requires Admin privileges"}, status=403)

    page = int(request.GET.get('page', 1))
    per_page = 10 

    all_reports = HateSpeechReport.objects.all().order_by('-created_at')
    total_reports = all_reports.count()
    
    grand_total_rows = 0
    grand_total_hate = 0
    grand_total_safe = 0
    all_table_rows = []

    for report in all_reports:
        stats = report.results_data.get("stats", {})
        grand_total_rows += stats.get("total", 0)
        grand_total_hate += stats.get("hate_count", 0)
        grand_total_safe += stats.get("not_hate_count", 0)
        
        all_table_rows.append({
            "id": report.id,
            "filename": report.original_filename,
            "date": report.created_at.strftime("%Y-%m-%d %H:%M"),
            "uploader": report.created_by.username if report.created_by else "Guest",
            "hate_count": stats.get("hate_count", 0),
            "safe_count": stats.get("not_hate_count", 0),
            "total_rows": stats.get("total", 0)
        })

    overall_hate_pct = round((grand_total_hate / grand_total_rows) * 100, 2) if grand_total_rows > 0 else 0

    # Paginate results
    total_pages = max(1, math.ceil(total_reports / per_page))
    start_index = (page - 1) * per_page
    paginated_reports = all_table_rows[start_index:start_index + per_page]

    return JsonResponse({
        "summary": {
            "total_reports": total_reports,
            "total_rows": grand_total_rows,
            "total_hate": grand_total_hate,
            "total_safe": grand_total_safe,
            "overall_pct": overall_hate_pct
        },
        "table_data": paginated_reports,
        "current_page": page,
        "total_pages": total_pages
    })

@require_GET
def dashboard_rows_api(request):
    """Extracts, filters, and paginates individual rows from all JSON reports."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized access."}, status=401)

    filter_type = request.GET.get('filter', 'all')
    page = int(request.GET.get('page', 1))
    per_page = 10 
    
    all_reports = HateSpeechReport.objects.all().order_by('-created_at')
    all_rows = []

    for report in all_reports:
        rows = report.results_data.get("rows", [])
        
        for idx, row in enumerate(rows):
            model_label = row.get("label", "NOT HATE") 
            is_hate = (model_label == "HATE")
            
            if filter_type == 'hate' and not is_hate:
                continue 
            if filter_type == 'safe' and is_hate:
                continue 
                
            hate_words_list = row.get("highlights", []) 
            
            all_rows.append({
                "filename": report.original_filename,
                "row_num": row.get("row_num", idx + 1),
                "text": row.get("text", "No text found"),
                "status": "🚨 Hate Speech" if is_hate else "✅ Safe",
                "confidence": f"{int(row.get('confidence', 0.0) * 100)}%", 
                "hate_words": ", ".join(hate_words_list) if hate_words_list else "None"
            })

    total_rows = len(all_rows)
    total_pages = max(1, math.ceil(total_rows / per_page))
    start_index = (page - 1) * per_page

    return JsonResponse({
        "rows": all_rows[start_index:start_index + per_page],
        "total_pages": total_pages,
        "current_page": page,
        "total_found": total_rows
    })


# ── Download Endpoints (CSV Responses) ───────────────────────────────────────

@login_required(login_url='/')
@require_GET
def hatedetector_download_view(request):
    """Returns processed results from the current session as a CSV."""
    raw = request.session.get("hate_results_json")
    if not raw:
        return HttpResponse("No results found. Please process a file first.", status=404)

    csv_str = results_to_csv(json.loads(raw))
    response = HttpResponse(csv_str, content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="hate_speech_results.csv"'
    return response

@login_required(login_url='/')
@require_GET
def dashboard_download_view(request):
    """Generates a downloadable CSV from the database based on dashboard filters."""
    filter_type = request.GET.get('filter', 'all')
    
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="dashboard_export_{filter_type}.csv"'
    writer = csv.writer(response)
    all_reports = HateSpeechReport.objects.all().order_by('-created_at')
    
    if filter_type == 'all':
        writer.writerow(['Filename', 'Date Processed', 'Uploaded By', 'Hate Rows', 'Safe Rows'])
        for report in all_reports:
            stats = report.results_data.get("stats", {})
            f = report.original_filename
            d = report.created_at.strftime("%Y-%m-%d %H:%M")
            u = report.created_by.username if report.created_by else "Guest"
            h = stats.get("hate_count", 0)
            s = stats.get("not_hate_count", 0)
            writer.writerow([f, d, u, h, s])
    elif filter_type == 'toxicity':
        writer.writerow(['Filename', 'Date Processed', 'Uploaded By', 'Hate Rows', 'Safe Rows', 'Toxicity %'])
        for report in all_reports:
            stats = report.results_data.get("stats", {})
            total = stats.get("total", 0)
            hate = stats.get("hate_count", 0)
            safe = stats.get("not_hate_count", 0)
            toxicity_pct = round((hate / total) * 100, 2) if total > 0 else 0
    
            f = report.original_filename
            d = report.created_at.strftime("%Y-%m-%d %H:%M")
            u = report.created_by.username if report.created_by else "Guest"
            h = hate
            s = safe
            writer.writerow([f, d, u, h, s, f"{toxicity_pct}%"])
    else:
        writer.writerow(['Filename', 'Row #', 'Text Content', 'Status', 'Confidence', 'Highlights'])
        for report in all_reports:
            for idx, row in enumerate(report.results_data.get("rows", [])):
                is_hate = (row.get("label", "NOT HATE") == "HATE")
                
                if filter_type == 'hate' and not is_hate:
                    continue
                if filter_type == 'safe' and is_hate:
                    continue
                    
                writer.writerow([
                    report.original_filename,
                    row.get("row_num", idx + 1),
                    row.get("text", "No text found"),
                    "Hate Speech" if is_hate else "Safe",
                    f"{int(row.get('confidence', 0.0) * 100)}%",
                    ", ".join(row.get("highlights", [])) if row.get("highlights") else "None"
                ])

    return response


# ── Generate Insights API Endpoints (Used by report.js) ────────────────────────

@require_GET
def generate_insights_api(request):
    """Analyzes reports and returns either JSON data or a PDF download."""
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized access."}, status=401)
    if not request.user.groups.filter(name__in=["Manager", "Admin", "Auditor"]).exists():
        return JsonResponse({"error": "Forbidden: Requires Admin privileges"}, status=403)

    file_id = request.GET.get('file', 'all')
    entity_type = request.GET.get('entity', 'student') 
    action = request.GET.get('action', 'json') 

    try:
        top_n = int(request.GET.get('top', 10))
    except ValueError:
        top_n = 10

    reports = HateSpeechReport.objects.all() if file_id == 'all' else HateSpeechReport.objects.filter(id=file_id)

    entity_stats = {}
    total_file_hate = 0
    total_file_safe = 0

    # Calculate entity statistics
    for report in reports:
        for row in report.results_data.get('rows', []):
            category = 'hate' if str(row.get("label", "SAFE")).upper() == "HATE" else 'safe'
            
            if category == 'hate':
                total_file_hate += 1
            else:
                total_file_safe += 1

            column_key = "author" if entity_type == 'student' else "target"
            entity_name = str(row.get(column_key, "Unknown")).strip()
            
            if not entity_name or entity_name == "None":
                entity_name = "Unknown"

            if entity_name not in entity_stats:
                entity_stats[entity_name] = {'total': 0, 'hate': 0, 'safe': 0}

            entity_stats[entity_name]['total'] += 1
            entity_stats[entity_name][category] += 1 

    sorted_entities = sorted(
        [{'name': k, **v} for k, v in entity_stats.items()],
        key=lambda x: x['hate'],
        reverse=True
    )
    top_entities = sorted_entities[:top_n]

    for item in top_entities:
        item['toxicity_pct'] = round((item['hate'] / item['total']) * 100, 2) if item['total'] > 0 else 0

    # Route response based on requested format
    if action == 'download':
        pdf_bytes = generate_rml_insight_report(top_entities, entity_type)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="PUPSS_Insight_{entity_type.capitalize()}.pdf"'
        return response
        
    return JsonResponse({
        "graph_data": {
            "labels": [item['name'] for item in top_entities],
            "hate_counts": [item['hate'] for item in top_entities],
            "total_hate": sum(item['hate'] for item in top_entities), 
            "total_safe": sum(item['safe'] for item in top_entities)
        },
        "table_data": top_entities 
    })