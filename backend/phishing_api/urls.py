from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.HealthView.as_view(), name='health'),
    path('predict/', views.PredictView.as_view(), name='predict'),
]