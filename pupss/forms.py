from django import forms
from .models import Document
from django.contrib.auth.forms import AuthenticationForm


class PUPSSCustomAuth(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['username'].widget.attrs.update({'placeholder': 'Username'})
        self.fields['password'].widget.attrs.update({'placeholder': 'Password'})

class DocumentForm(forms.ModelForm):
    class Meta:
        model = Document
        fields = ('title', 'file',)