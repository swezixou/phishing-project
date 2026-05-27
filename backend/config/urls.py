"""
config/urls.py — Routage principal
Django reçoit une URL et cherche ici quel sous-routeur appeler.
"""

from django.urls import path, include

from django.urls import path, include

urlpatterns = [
    path('api/', include('phishing_api.urls')),
]