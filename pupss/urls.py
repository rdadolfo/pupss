from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views

# Form & View Imports
from pupss.forms import PUPSSCustomAuth
from pupss.views import (
    admin_settings, api_delete_report, api_override_row, create_user, admin_user_api, edit_user, admin_group_api, create_group, edit_group, landing, custom_logout,  
    dashboard, dashboard_data_view, dashboard_rows_api, dashboard_download_view, hatedetector, process_view, preview_columns_view, 
    report_generation, generate_insights_api, hatedetector_download_view, delete_user_api, delete_group_api, admin_change_password
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
    path('api/report/delete/<int:report_id>/', api_delete_report, name='api_delete_report'),
    path('api/row/override/<int:report_id>/<int:row_num>/', api_override_row, name='api_override_row'),

    # ── Get Admin Dashboard Data API Endpoints (Used by admin.js) ────────────────────────
    path('api/admin-user/', admin_user_api, name='api-admin-user'),
    path('api/admin-group/', admin_group_api, name='api-admin-group'),

    # ── Admin Dashboard (HTML) ───────────────────────────────────────────────
    path('admin-setting/', admin_settings, name='admin_setting'),
    path('admin-setting/user/add/', create_user, name='add_user'),
    path('admin-setting/user/edit/<int:user_id>/', edit_user, name='edit_user'),
    path('admin-setting/user/delete/<int:user_id>/', delete_user_api, name='delete_user_api'),
    path('admin-setting/user/password/<int:user_id>/', admin_change_password, name='admin_change_password'),
    path('admin-setting/group/add/', create_group, name='add_group'),
    path('admin-setting/group/edit/<int:group_id>/', edit_group, name='edit_group'),
    path('admin-setting/group/delete/<int:group_id>/', delete_group_api, name='delete_group_api'),
]

# ── Static Media Handling for Development ─────────────────────────────────────
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)