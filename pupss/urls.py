from django.urls import path
from django.contrib.auth import views as auth_views
from .forms import PUPSSCustomAuth
from .views import landing_page

urlpatterns = [
    path('login/', auth_views.LoginView.as_view(authentication_form=PUPSSCustomAuth), name='login'),
    path('', landing_page, name='landing'),
]
