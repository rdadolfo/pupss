from django.db import models
from django.contrib.auth.models import User

class Document(models.Model):
    title = models.CharField(max_length=100)
    file = models.FileField(upload_to='files/')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        permissions = [
            ("upload_create", "Can upload files (auto-converts)"),
            ("upload_read", "Can view uploaded files & results"),
            ("upload_delete", "Can delete uploaded files & results"),
            ("convert_rerun", "Can manually re-run conversions"),
            ("system_manage", "Can manage system settings"),
            ("user_manage", "Can manage users & roles"),
            ("audit_read", "Can view logs and history"),
        ]
    def __str__(self):
        return self.title
