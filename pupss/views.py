import os
from django.contrib.auth import logout
from django.shortcuts import render, redirect
from .forms import DocumentForm
from django.http import JsonResponse
from django.conf import settings

# Create your views here.

def landing(request):
    return render(request, "landing.html")

def dashboard(request):
    return render(request, "dashboard.html")

def hatedetector(request):
    return render(request, "hatedetector.html")

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