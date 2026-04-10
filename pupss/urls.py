from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views
from pupss.forms import PUPSSCustomAuth
from pupss.views import dashboard_rows_api, landing, dashboard, custom_logout, hatedetector, process_view, download_view, preview_columns_view, dashboard_data_view

urlpatterns = [
    path('login/', auth_views.LoginView.as_view(authentication_form=PUPSSCustomAuth, redirect_authenticated_user=True), name='login'),
    path('logout/', custom_logout, name='logout'),
    path('', landing, name='landing'),
    path('dashboard/', dashboard, name='dashboard'),
    path('hatedetector/', hatedetector, name='hatedetector'),
    path('hatedetector/process/',   process_view,         name='hatedetector_process'),
    path('hatedetector/download/',  download_view,        name='hatedetector_download'),
    path('hatedetector/preview/',   preview_columns_view, name='hatedetector_preview'),
    path('dashboard/stats', dashboard_data_view, name='dashboard_data'),
    path('dashboard/rows/', dashboard_rows_api, name='dashboard_rows')
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
