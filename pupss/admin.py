from django.contrib import admin
from .models import HateSpeechReport, SystemAccess

# Register your models here.
@admin.register(HateSpeechReport)
class HateSpeechReportAdmin(admin.ModelAdmin):
    # These are the columns that will show up in the admin list view
    list_display = ('report_name', 'created_by', 'created_at')
    
    # Adds a search bar so you can quickly find a specific file
    search_fields = ('report_name', 'original_filename', 'file_hash')
    
    # Adds a filter sidebar to sort by date or user
    list_filter = ('created_at', 'created_by')
    
    # Makes the JSON data read-only so admins don't accidentally break it
    readonly_fields = ('file_hash', 'results_data')

# --- The Simple Way ---
# For models that don't need fancy search bars, you can just do this:
admin.site.register(SystemAccess)
