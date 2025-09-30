import os
from django.contrib.auth import logout
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required, permission_required
from .forms import DocumentForm
from django.http import JsonResponse
from django.conf import settings

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