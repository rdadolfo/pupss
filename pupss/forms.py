from django import forms
from django.contrib.auth.models import Group, Permission
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from pupss.models import GroupProfile

User = get_user_model()

PUPSS_PERMISSIONS_MATRIX = [
    'system_manage', 'user_manage', 'audit_read', 'report_delete',
    'detector_execute', 'report_export', 'feedback_override'
]

class PUPSSCustomAuth(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['username'].widget.attrs.update({'class': 'form-control', 'placeholder': 'Username'})
        self.fields['password'].widget.attrs.update({'class': 'form-control', 'placeholder': 'Password'})

class PUPSSCustomUserCreationForm(UserCreationForm):
    groups = forms.ModelMultipleChoiceField(
        queryset=Group.objects.all().order_by('name'),
        widget=forms.CheckboxSelectMultiple(attrs={'class': 'form-check-input'}),
        required=False,
        label="Assign Roles / Access Groups"
    )

    class Meta:
        model = User
        fields = ('username', 'email', 'first_name', 'last_name', 'groups')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field_name, field in self.fields.items():
            if field_name != 'groups':
                field.widget.attrs.update({'class': 'form-control', 'placeholder': f"Enter {field.label}"})
        
        if 'password1' in self.fields:
            self.fields['password1'].widget.attrs.update({'class': 'form-control', 'placeholder': 'Password'})
        if 'password2' in self.fields:
            self.fields['password2'].widget.attrs.update({'class': 'form-control', 'placeholder': 'Confirm Password'})

    def save(self, commit=True):
        user = super().save(commit=commit)
        if commit:
            user.groups.set(self.cleaned_data['groups'])
        return user

class CustomUserUpdateForm(forms.ModelForm):
    groups = forms.ModelMultipleChoiceField(
        queryset=Group.objects.all().order_by('name'),
        widget=forms.CheckboxSelectMultiple(attrs={'class': 'form-check-input'}),
        required=False,
        label="Assigned System Groups"
    )

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'is_active', 'is_staff', 'groups']
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields['groups'].initial = self.instance.groups.all()
        
        for field_name, field in self.fields.items():
            if isinstance(field.widget, (forms.CheckboxInput, forms.CheckboxSelectMultiple)):
                field.widget.attrs['class'] = 'form-check-input'
            else:
                field.widget.attrs['class'] = 'form-control'

# 🎯 OPTIMIZATION: Centralized Base Group Form for DRY architecture
class BaseGroupForm(forms.ModelForm):
    description = forms.CharField(
        widget=forms.Textarea(attrs={'class': 'form-control', 'rows': 3, 'placeholder': 'Describe what permissions this group possesses...'}),
        required=False,
        label="Functional Description Summary"
    )

    permissions = forms.ModelMultipleChoiceField(
        queryset=Permission.objects.filter(
            content_type__app_label='pupss',  
            content_type__model='systemaccess',
            codename__in=PUPSS_PERMISSIONS_MATRIX
        ).order_by('name'),
        widget=forms.CheckboxSelectMultiple(attrs={'class': 'form-check-input'}),
        required=False,
        label="Module Authorization Controls Matrix"
    )

    class Meta:
        model = Group
        fields = ['name', 'permissions']
        labels = {'name': 'Group Name'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['name'].widget.attrs.update({'class': 'form-control', 'placeholder': 'e.g., Faculty Reviewer'})
        self.fields['permissions'].label_from_instance = lambda obj: f"{obj.name}"
        
        if self.instance and self.instance.pk:
            self.fields['permissions'].initial = self.instance.permissions.all()
            if hasattr(self.instance, 'profile') and self.instance.profile.description:
                self.fields['description'].initial = self.instance.profile.description

    def save(self, commit=True):
        group = super().save(commit=commit)
        description_text = self.cleaned_data.get('description')
        profile, _ = GroupProfile.objects.get_or_create(group=group)
        profile.description = description_text
        profile.save()
        return group

# Both forms now inherit cleanly from the Base Form
class PUPSSCustomGroupCreationForm(BaseGroupForm):
    pass 

class CustomGroupUpdateForm(BaseGroupForm):
    pass