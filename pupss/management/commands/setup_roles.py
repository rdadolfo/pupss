from django.core.management.base import BaseCommand
from django.contrib.auth.models import Group, Permission

ROLE_PERMISSIONS = {
    "Uploader": [
        "upload_create",
        "upload_read",
        # optional delete
        "upload_delete",
    ],
    "Manager": [
        "upload_create",
        "upload_read",
        "upload_delete",
        "convert_rerun",
    ],
    "Admin": [
        "upload_create",
        "upload_read",
        "upload_delete",
        "convert_rerun",
        "system_manage",
        "user_manage",
        "audit_read",
    ],
    "Auditor": [
        "upload_read",
        "audit_read",
    ],
}

class Command(BaseCommand):
    help = "Set up RBAC roles as Django groups"

    def handle(self, *args, **kwargs):
        for role_name, perms in ROLE_PERMISSIONS.items():
            group, created = Group.objects.get_or_create(name=role_name)
            for codename in perms:
                try:
                    perm = Permission.objects.get(codename=codename)
                    group.permissions.add(perm)
                except Permission.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"Permission {codename} not found"))
            self.stdout.write(self.style.SUCCESS(f"Role '{role_name}' updated"))