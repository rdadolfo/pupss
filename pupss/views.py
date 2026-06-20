import json
import csv
import io
import math

from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required, permission_required
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.views.decorators.http import require_POST, require_GET
from django.db.models import Count
from django.contrib.auth.models import User, Group
from django.contrib import messages
from django.contrib.auth.forms import SetPasswordForm

# Custom App Imports
from pupss.processor import process_csv, results_to_csv, detect_text_column
from pupss.tools import generate_file_hash
from pupss.models import HateSpeechReport
from pupss.pdf_service import generate_rml_insight_report
from pupss.forms import PUPSSCustomUserCreationForm, CustomUserUpdateForm, PUPSSCustomGroupCreationForm, CustomGroupUpdateForm

class Echo:
    """An object that implements just the write method of the file-like interface."""
    def write(self, value):
        return value
    
# ── HTML Web Pages ───────────────────────────────────────────────────────────
def landing(request):
    return render(request, "landing.html")

@login_required(login_url='login')
def dashboard(request):
    if request.user.has_perm('pupss.audit_read'):
        return render(request, "dashboard.html")
    return redirect("landing")

@login_required(login_url='login')
def hatedetector(request):
    if request.user.has_perm('pupss.detector_execute'):
        return render(request, "hatedetector.html")
    return redirect("landing")

@login_required(login_url='login')
def report_generation(request):
    if request.user.has_perm('pupss.report_export'):
        return render(request, "report_generation.html")
    return redirect("landing")

def custom_logout(request):
    logout(request)
    request.session.flush()  
    return redirect("landing")


# ── Hate Detector API Endpoints (JSON) ───────────────────────────────────────
@require_POST
@login_required
@permission_required('pupss.detector_execute', raise_exception=True)
def preview_columns_view(request):
    """Reads the header row of the CSV to detect the text column."""
    uploaded = request.FILES.get("file")
    if not uploaded:
        return JsonResponse({"error": "No file provided."}, status=400)

    raw = uploaded.read(4096).decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(raw))
    
    try:
        headers = next(reader)
    except StopIteration:
        return JsonResponse({"error": "Empty file content provided."}, status=422)

    detected = detect_text_column(headers)
    return JsonResponse({"headers": headers, "detected_column": detected})

@require_POST
@login_required
@permission_required('pupss.detector_execute', raise_exception=True)
def process_view(request):
    """Processes the CSV through the AI model and saves the report."""
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
        cache_data["report_id"] = existing_report.id
        return JsonResponse(cache_data)
    
    results = process_csv(uploaded, text_column=text_column, author_column=author_column, target_column=target_column)
    if results.get("error"):
        return JsonResponse({"error": results["error"]}, status=422)

    results["is_cached"] = False
    report_name = f"{uploaded.name[:-4]}_{text_column}"
    
    report = HateSpeechReport.objects.create(
        report_name=report_name,
        original_filename=uploaded.name,
        text_column=text_column or "Auto-detected",
        file_hash=check_file_hash,
        results_data=results,
        created_by=request.user,
    )

    results["report_id"] = report.id
    request.session["hate_results_json"] = json.dumps(results)
    return JsonResponse({
        "report_id": report.id,
        "text_column": results["text_column"],
        "headers": results["headers"],
        "stats": results["stats"],
        "rows": results["rows"], 
    })


# ── Dashboard API Endpoints (JSON) ───────────────────────────────────────────
@require_GET
@login_required
@permission_required('pupss.audit_read', raise_exception=True)
def dashboard_data_view(request):
    page = int(request.GET.get('page', 1))
    per_page = 10 
    
    # 🎯 OPTIMIZATION: Extract raw dictionary chunks directly to avoid Python model object build overhead
    grand_total_rows, grand_total_hate, grand_total_safe = 0, 0, 0
    for data in HateSpeechReport.objects.values_list('results_data', flat=True).iterator():
        stats = data.get("stats", {})
        grand_total_rows += stats.get("total", 0)
        grand_total_hate += stats.get("hate_count", 0)
        grand_total_safe += stats.get("not_hate_count", 0)

    total_reports = HateSpeechReport.objects.count()
    start_index = (page - 1) * per_page
    
    all_table_rows = []
    # 🎯 OPTIMIZATION: Dynamic SQL window-slicing keeps data load locked strictly to 10 entities
    paginated_reports = HateSpeechReport.objects.all().order_by('-created_at')[start_index:start_index + per_page]

    for report in paginated_reports:
        stats = report.results_data.get("stats", {})
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
    total_pages = max(1, math.ceil(total_reports / per_page))

    return JsonResponse({
        "summary": {
            "total_reports": total_reports,
            "total_rows": grand_total_rows,
            "total_hate": grand_total_hate,
            "total_safe": grand_total_safe,
            "overall_pct": overall_hate_pct
        },
        "table_data": all_table_rows,
        "current_page": page,
        "total_pages": total_pages
    })

@require_GET
@login_required
@permission_required('pupss.audit_read', raise_exception=True)
def dashboard_rows_api(request):
    filter_type = request.GET.get('filter', 'all')
    page = int(request.GET.get('page', 1))
    per_page = 10 
    
    start_index = (page - 1) * per_page
    
    # 🎯 OPTIMIZATION: Fast metadata counter using stats blocks inside the database iterator stream
    total_rows = 0
    for data in HateSpeechReport.objects.values_list('results_data', flat=True).iterator():
        stats = data.get("stats", {})
        if filter_type == 'hate':
            total_rows += stats.get("hate_count", 0)
        elif filter_type == 'safe':
            total_rows += stats.get("not_hate_count", 0)
        else:
            total_rows += stats.get("total", 0)

    # 🎯 OPTIMIZATION: Short-Circuit math evaluation matrix blocks processing after collecting the needed 10 items
    target_rows = []
    current_idx = 0

    for report in HateSpeechReport.objects.all().order_by('-created_at').iterator():
        data = report.results_data
        stats = data.get("stats", {})
        
        report_relevant_count = stats.get("total", 0)
        if filter_type == 'hate':
            report_relevant_count = stats.get("hate_count", 0)
        elif filter_type == 'safe':
            report_relevant_count = stats.get("not_hate_count", 0)
            
        if current_idx + report_relevant_count <= start_index:
            current_idx += report_relevant_count
            continue
            
        for idx, row in enumerate(data.get("rows", [])):
            model_label = row.get("label", "NOT HATE") 
            is_hate = (model_label == "HATE")
            
            if filter_type == 'hate' and not is_hate: continue 
            if filter_type == 'safe' and is_hate: continue 
            
            if start_index <= current_idx < start_index + per_page:
                hate_words_list = row.get("highlights", []) 
                target_rows.append({
                    "report_id": report.id,                
                    "raw_label": model_label,              
                    "row_num": row.get("row_num", idx + 1),
                    "text": row.get("text", "No text found"),
                    "status": "🚨 Hate Speech" if is_hate else "✅ Safe",
                    "confidence": f"{int(row.get('confidence', 0.0) * 100)}%", 
                    "hate_words": ", ".join(hate_words_list) if hate_words_list else "None"
                })
            
            current_idx += 1
            if current_idx >= start_index + per_page: break 
        if current_idx >= start_index + per_page: break

    total_pages = max(1, math.ceil(total_rows / per_page))

    return JsonResponse({
        "rows": target_rows,
        "total_pages": total_pages,
        "current_page": page,
        "total_found": total_rows
    })

@require_POST
@login_required
def api_override_row(request, report_id, row_num):
    if not (request.user.has_perm('pupss.system_manage') or request.user.has_perm('pupss.detector_execute')):
        return JsonResponse({'success': False, 'error': 'Permission denied. You do not have access to override results.'}, status=403)

    try:
        report = HateSpeechReport.objects.get(id=report_id)
        data = report.results_data
        rows = data.get("rows", [])

        target_row = next((r for r in rows if r.get("row_num") == row_num), None)
        if not target_row:
            return JsonResponse({'success': False, 'error': 'Row not found in report.'}, status=404)

        current_label = target_row.get("label", "NOT HATE")
        new_label = "NOT HATE" if current_label == "HATE" else "HATE"
        target_row["label"] = new_label

        total = data["stats"]["total"]
        if new_label == "HATE":
            data["stats"]["hate_count"] += 1
            data["stats"]["not_hate_count"] -= 1
        else:
            data["stats"]["hate_count"] -= 1
            data["stats"]["not_hate_count"] += 1

        data["stats"]["hate_pct"] = round((data["stats"]["hate_count"] / total) * 100) if total > 0 else 0

        report.results_data = data
        report.save(update_fields=['results_data']) # 🎯 OPTIMIZATION: Avoid rewriting full DB row index bounds

        return JsonResponse({'success': True, 'message': f'Override successful. New status: {new_label}'})
    except HateSpeechReport.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Report not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
    
# ── Download Endpoints (CSV Responses) ───────────────────────────────────────
@login_required
@require_GET
@permission_required('pupss.report_export', raise_exception=True)
def hatedetector_download_view(request):
    """Returns processed results from the current session as a CSV."""
    raw = request.session.get("hate_results_json")
    if not raw:
        return HttpResponse("No results found. Please process a file first.", status=404)

    csv_str = results_to_csv(json.loads(raw))
    response = HttpResponse(csv_str, content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="hate_speech_results.csv"'
    return response

@login_required
@require_GET
@permission_required('pupss.report_export', raise_exception=True)
def dashboard_download_view(request):
    """Generates a downloadable CSV via memory-safe data generation streams."""
    filter_type = request.GET.get('filter', 'all')
    
    def csv_generator():
        pseudo_buffer = Echo()
        writer = csv.writer(pseudo_buffer)
        
        if filter_type == 'all':
            yield writer.writerow(['Filename', 'Date Processed', 'Uploaded By', 'Hate Rows', 'Safe Rows'])
            for report in HateSpeechReport.objects.all().order_by('-created_at').iterator():
                stats = report.results_data.get("stats", {})
                yield writer.writerow([
                    report.original_filename, report.created_at.strftime("%Y-%m-%d %H:%M"),
                    report.created_by.username if report.created_by else "Guest",
                    stats.get("hate_count", 0), stats.get("not_hate_count", 0)
                ])
        elif filter_type == 'toxicity':
            yield writer.writerow(['Filename', 'Date Processed', 'Uploaded By', 'Hate Rows', 'Safe Rows', 'Toxicity %'])
            for report in HateSpeechReport.objects.all().order_by('-created_at').iterator():
                stats = report.results_data.get("stats", {})
                total = stats.get("total", 0)
                hate = stats.get("hate_count", 0)
                toxicity_pct = round((hate / total) * 100, 2) if total > 0 else 0
                yield writer.writerow([
                    report.original_filename, report.created_at.strftime("%Y-%m-%d %H:%M"),
                    report.created_by.username if report.created_by else "Guest",
                    hate, stats.get("not_hate_count", 0), f"{toxicity_pct}%"
                ])
        else:
            yield writer.writerow(['Filename', 'Row #', 'Text Content', 'Status', 'Confidence', 'Highlights'])
            for report in HateSpeechReport.objects.all().order_by('-created_at').iterator():
                for idx, row in enumerate(report.results_data.get("rows", [])):
                    is_hate = (row.get("label", "NOT HATE") == "HATE")
                    if (filter_type == 'hate' and not is_hate) or (filter_type == 'safe' and is_hate):
                        continue
                    yield writer.writerow([
                        report.original_filename, row.get("row_num", idx + 1),
                        row.get("text", "No text found"), "Hate Speech" if is_hate else "Safe",
                        f"{int(row.get('confidence', 0.0) * 100)}%",
                        ", ".join(row.get("highlights", [])) if row.get("highlights") else "None"
                    ])

    response = StreamingHttpResponse(csv_generator(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="dashboard_export_{filter_type}.csv"'
    return response

# ── Generate Insights API Endpoints ──────────────────────────────────────────
@require_GET
@login_required
@permission_required('pupss.report_export', raise_exception=True)
def generate_insights_api(request):
    file_id = request.GET.get('file', 'all')
    entity_type = request.GET.get('entity', 'student') 
    action = request.GET.get('action', 'json') 

    try:
        top_n = int(request.GET.get('top', 10))
    except ValueError:
        top_n = 10

    reports = HateSpeechReport.objects.all() if file_id == 'all' else HateSpeechReport.objects.filter(id=file_id)
    entity_stats = {}

    for report in reports.iterator():
        for row in report.results_data.get('rows', []):
            category = 'hate' if str(row.get("label", "SAFE")).upper() == "HATE" else 'safe'
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

# ── Identity Management Admin Section ────────────────────────────────────────
@login_required
@permission_required('pupss.system_manage', raise_exception=True)
def admin_settings(request):
    user_form = PUPSSCustomUserCreationForm()
    group_form = PUPSSCustomGroupCreationForm()

    if request.method == 'POST':
        if 'submit_user' in request.POST:
            user_form = PUPSSCustomUserCreationForm(request.POST)
            if user_form.is_valid():
                user_form.save()
                messages.success(request, 'New PUPSS user created and roles assigned!')
                return redirect('admin_setting')                  
        elif 'submit_group' in request.POST:
            group_form = PUPSSCustomGroupCreationForm(request.POST)
            if group_form.is_valid():
                group_form.save()
                messages.success(request, f"New group '{group_form.cleaned_data['name']}' created!")
                return redirect('admin_setting')  

    context = {
        'user_form': user_form,
        'group_form': group_form,
        'total_users': User.objects.count(),    
        'total_groups': Group.objects.count(),  
    }
    return render(request, 'admin.html', context)

@login_required
@permission_required('pupss.system_manage', raise_exception=True)
def admin_user_api(request):
    users = User.objects.prefetch_related('groups').all().order_by('-date_joined')
    users_payload = [{
        'id': u.id,
        'username': u.username,
        'first_name': u.first_name,
        'last_name': u.last_name,
        'email': u.email,
        'is_active': u.is_active,
        'is_staff': u.is_staff,
        'is_superuser': u.is_superuser,
        'date_joined': u.date_joined,
        'last_login': u.last_login,
        'groups': list(u.groups.values_list('name', flat=True)) 
    } for u in users]
    return JsonResponse(users_payload, safe=False)

@login_required
@permission_required('pupss.system_manage', raise_exception=True)
def admin_group_api(request):
    groups = Group.objects.select_related('profile').annotate(member_count=Count('user')).order_by('name')
    groups_payload = [{
        'id': g.id,
        'name': g.name,
        'member_count': g.member_count,
        'description': g.profile.description if hasattr(g, 'profile') and g.profile.description else 'No descriptive summary added.'
    } for g in groups]
    return JsonResponse({"groups": groups_payload})

@login_required
@permission_required('pupss.user_manage', raise_exception=True)
def create_user(request):
    if request.method == 'POST':
        form = PUPSSCustomUserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'New PUPSS user created successfully!')
            return redirect('admin_setting') 
    else:
        form = PUPSSCustomUserCreationForm()
    return render(request, 'registration/create_user.html', {'form': form})

@login_required
@permission_required('pupss.user_manage', raise_exception=True)
def edit_user(request, user_id):
    user_obj = get_object_or_404(User, id=user_id)
    if request.method == 'POST':
        form = CustomUserUpdateForm(request.POST, instance=user_obj)
        if form.is_valid():
            form.save()
            messages.success(request, f'Account for {user_obj.username} updated successfully!')
            return redirect('admin_setting')
    else:
        form = CustomUserUpdateForm(instance=user_obj)
    return render(request, 'registration/edit_user.html', {'form': form, 'user_obj': user_obj})

@login_required
@permission_required('pupss.user_manage', raise_exception=True)
def create_group(request):
    if request.method == 'POST':
        form = PUPSSCustomGroupCreationForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'Group created successfully!')
            return redirect('admin_setting')
    else:
        form = PUPSSCustomGroupCreationForm()
    return render(request, 'registration/create_group.html', {'form': form})

@login_required
@permission_required('pupss.system_manage', raise_exception=True)
def edit_group(request, group_id):
    group_obj = get_object_or_404(Group, id=group_id)
    if request.method == 'POST':
        form = CustomGroupUpdateForm(request.POST, instance=group_obj) 
        if form.is_valid():
            form.save()
            messages.success(request, f'Group "{group_obj.name}" updated successfully!')
            return redirect('admin_setting')
    else:
        form = CustomGroupUpdateForm(instance=group_obj)  
    return render(request, 'registration/edit_group.html', {'group_obj': group_obj, 'form': form})

@require_POST
@login_required
@permission_required('pupss.system_manage', raise_exception=True)
def delete_user_api(request, user_id):
    if request.user.id == int(user_id):
        return JsonResponse({"success": False, "error": "Self-destruction blocked. You cannot delete your own account."}, status=400)
    
    user_obj = get_object_or_404(User, id=user_id)
    target_name = user_obj.username
    user_obj.delete()

    new_total_users = User.objects.count()
    new_total_groups = Group.objects.count()

    return JsonResponse({
        "success": True, 
        "message": f"Account '{target_name}' has been permanently purged.",
        "total_users": new_total_users,
        "total_groups": new_total_groups
    })

@require_POST
@login_required
@permission_required('pupss.system_manage', raise_exception=True)
def delete_group_api(request, group_id):
    if request.user.groups.filter(id=int(group_id)).exists():
        return JsonResponse({"success": False, "error": "Self-destruction blocked. You cannot delete your own active group association."}, status=400)
    
    group_obj = get_object_or_404(Group, id=group_id)
    target_name = group_obj.name
    group_obj.delete()
    
    new_total_users = User.objects.count()
    new_total_groups = Group.objects.count()

    return JsonResponse({
        "success": True, 
        "message": f"Group policy layer '{target_name}' has been removed successfully.",
        "total_users": new_total_users,
        "total_groups": new_total_groups
    })

@login_required
@permission_required('pupss.user_manage', raise_exception=True)
def admin_change_password(request, user_id):
    user_obj = get_object_or_404(User, id=user_id)
    if request.method == 'POST':
        form = SetPasswordForm(user=user_obj, data=request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, f"Password for account '{user_obj.username}' has been successfully updated.")
            return redirect('admin_setting')
    else:
        form = SetPasswordForm(user=user_obj)
        
    for field in form.fields.values():
        field.widget.attrs.update({'class': 'form-control', 'placeholder': 'Enter new secure credentials'})
        
    return render(request, 'registration/change_password.html', {'form': form, 'user_obj': user_obj})

@require_POST
@permission_required('pupss.system_manage', raise_exception=True)
def api_delete_report(request, report_id):
    try:
        report = HateSpeechReport.objects.get(id=report_id)
        report.delete()
        return JsonResponse({'success': True, 'message': 'Report and all associated rows permanently deleted.'})
    except HateSpeechReport.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Report not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)