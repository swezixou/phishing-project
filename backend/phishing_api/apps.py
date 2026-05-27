"""
apps.py — Configuration de l'application Django
Le modèle ML est chargé ici, une seule fois au démarrage du serveur.
"""

from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class PhishingApiConfig(AppConfig):
    name = "phishing_api"

    def ready(self):
        """Appelé automatiquement par Django au démarrage."""
        from .predictor import predictor
        try:
            predictor.load()
            logger.info(f"[PhishingAPI] Modèle chargé : {predictor.model_name}")
        except FileNotFoundError as e:
            logger.warning(f"[PhishingAPI] {e}")
            logger.warning("[PhishingAPI] Lance d'abord l'entraînement et copie les .pkl dans phishing_api/ml/")
