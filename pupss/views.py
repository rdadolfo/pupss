from django.contrib.auth import logout
from django.shortcuts import render, redirect
from .forms import DocumentForm

# Create your views here.

def landing(request):
    return render(request, "landing.html")

def dashboard(request):
    return render(request, "dashboard.html")

def hatedetector(request):
    return render(request, "hatedetector.html")

def upload_file(request):
    if request.method == 'POST':
        form = DocumentForm(request.POST, request.FILES)
        if form.is_valid():
            form.save()
            return redirect('success') 
    else:
        form = DocumentForm()
    return render(request, 'hatedetector.html', {'form': form})

def custom_logout(request):
    logout(request)
    request.session.flush()  
    return redirect("landing")