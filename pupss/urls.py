from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views

# Form & View Imports
from pupss.forms import PUPSSCustomAuth
from pupss.views import (
    generate_insights_api, hatedetector_download_view, landing, custom_logout, 
    dashboard, dashboard_data_view, dashboard_rows_api, dashboard_download_view,
    hatedetector, process_view, preview_columns_view, report_generation
)

urlpatterns = [
    # ── Authentication ────────────────────────────────────────────────────────
    path('login/', auth_views.LoginView.as_view(authentication_form=PUPSSCustomAuth, redirect_authenticated_user=True), name='login'),
    path('logout/', custom_logout, name='logout'),
    
    # ── Main UI Pages (Returns HTML) ──────────────────────────────────────────
    path('', landing, name='landing'),
    path('dashboard/', dashboard, name='dashboard'),
    path('hatedetector/', hatedetector, name='hatedetector'),
    path('report/', report_generation, name='report_generation'),

    # ── Hate Detector Endpoints (Used by hatedetector.js) ─────────────────────
    path('hatedetector/preview/',   preview_columns_view, name='hatedetector_preview'),
    path('hatedetector/process/',   process_view,         name='hatedetector_process'),
    path('hatedetector/download/',  hatedetector_download_view,        name='hatedetector_download'),

    # ── Dashboard API Endpoints (Used by dashboard.js) ────────────────────────
    path('api/dashboard-data/',     dashboard_data_view,     name='dashboard_data'),
    path('api/dashboard-rows/',     dashboard_rows_api,      name='dashboard_rows'),
    path('api/dashboard-download/', dashboard_download_view, name='dashboard_download'),

    # ── Generate Insights API Endpoints (Used by report.js) ────────────────────────
    path('api/generate-insights/', generate_insights_api, name='api-generate-insights'),
]

# ── Static Media Handling for Development ─────────────────────────────────────
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)