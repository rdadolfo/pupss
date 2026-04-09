from django.db import models
from django.contrib.auth.models import User


class HateSpeechReport(models.Model):
    report_name = models.CharField(max_length=255) 
    original_filename = models.CharField(max_length=255)
    text_column = models.CharField(max_length=255)
    file_hash = models.CharField(max_length=64, unique=True, null=True) 
    results_data = models.JSONField() 
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        ordering = ['-created_at'] # Always load newest reports first

    def __str__(self):
        return f"{self.report_name} (by {self.created_by})"


class SystemAccess(models.Model):
    """
    Dummy model to hold global system permissions.
    No database table will be created for this (managed = False).
    """
    class Meta:
        managed = False  
        default_permissions = () 
        permissions = [
            ("system_manage", "Can manage system settings"),
            ("user_manage", "Can manage users & roles"),
            ("audit_read", "Can view logs and history"),
            # You can add report-specific permissions here too!
            ("report_delete", "Can delete system-wide reports"), 
        ]