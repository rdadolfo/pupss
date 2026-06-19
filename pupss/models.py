from django.db import models
from django.contrib.auth.models import Group, User
from django.db.models.signals import post_save
from django.dispatch import receiver


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
    class Meta:
        managed = False  
        default_permissions = () 
        permissions = [
            ("system_manage", "Can manage system settings"),
            ("user_manage", "Can manage users & roles"),
            ("audit_read", "Can view dashboard and history"),
            ("report_delete", "Can delete system-wide reports"), 
            ("detector_execute", "Can run hate detector analysis"),
            ("feedback_override", "Can manually override NLP classification labels"),
            ("report_export", "Can generate and download PDF insight reports"),
            # ("model_fine_tune", "Can trigger BERT pipeline fine-tuning"),
        ]

class GroupProfile(models.Model):
    """
    Extends Django's built-in Group model to add custom fields 
    like functional descriptions cleanly.
    """
    group = models.OneToOneField(Group, on_delete=models.CASCADE, related_name='profile')
    description = models.TextField(blank=True, null=True, help_text="Functional description summary of the group actions.")

    def __str__(self):
        return f"Profile for {self.group.name}"

# ── DJANGO DATABASE SIGNALS ───────────────────────────────────────────────
@receiver(post_save, sender=Group)
def create_or_update_group_profile(sender, instance, created, **kwargs):
    """
    Automatically creates a GroupProfile row whenever a new Group is created.
    """
    if created:
        GroupProfile.objects.create(group=instance)
    else:
        # Safeguard if a group exists but somehow doesn't have a profile row yet
        GroupProfile.objects.get_or_create(group=instance)