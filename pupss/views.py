from django.contrib.auth import logout
from django.shortcuts import render, redirect

# Create your views here.

def landing(request):
    return render(request, "landing.html")

def dashboard(request):
    return render(request, "dashboard.html")

def custom_logout(request):
    logout(request)
    request.session.flush()  
    return redirect('landing')