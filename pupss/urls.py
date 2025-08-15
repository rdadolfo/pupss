from django.urls import path
from django.contrib.auth import views as auth_views
from .forms import PUPSSCustomAuth
from .views import landing, dashboard, custom_logout

urlpatterns = [
    path('login/', auth_views.LoginView.as_view(authentication_form=PUPSSCustomAuth), name='login'),
    path('', landing, name='landing'),
    path('dashboard/', dashboard, name='dashboard'),
    path('logout/', custom_logout, name='logout')
]