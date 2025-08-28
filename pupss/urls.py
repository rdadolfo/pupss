from django.urls import path
from django.contrib.auth import views as auth_views
from .forms import PUPSSCustomAuth
from .views import landing, dashboard, custom_logout, hatedetector, upload_file

urlpatterns = [
    path('login/', auth_views.LoginView.as_view(authentication_form=PUPSSCustomAuth), name='login'),
    path('logout/', custom_logout, name='logout'),
    path('', landing, name='landing'),
    path('dashboard/', dashboard, name='dashboard'),
    path('hatedetector/', hatedetector, name='hatedector'),
    path("upload/", upload_file, name="upload_file")
]
