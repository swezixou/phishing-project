"""
views.py — Endpoints de l'API REST
Deux endpoints :
  GET  /api/health/   → état du serveur + modèle chargé
  POST /api/predict/  → prédiction phishing sur un email
"""

import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .serializers import EmailInputSerializer
from .predictor import predictor

logger = logging.getLogger(__name__)


class HealthView(APIView):
    """
    GET /api/health/
    Utilisé par la popup pour afficher le point vert/rouge.
    """

    def get(self, request):
        if not predictor.is_loaded:
            return Response(
                {"status": "error", "detail": "Modèle non chargé"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            "status":     "ok",
            "model_name": predictor.model_name,
        })


class PredictView(APIView):
    """
    POST /api/predict/
    Corps attendu : { "subject": "...", "body": "..." }
    Réponse       : { "label": 0|1, "score_svm": float, "signals": {...} }
    """

    def post(self, request):
        # 1. Valider les données entrantes
        serializer = EmailInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"detail": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subject = serializer.validated_data["subject"]
        body    = serializer.validated_data["body"]

        # 2. Appeler le predictor (couche ML isolée)
        try:
            result = predictor.predict(subject=subject, body=body)
        except RuntimeError as e:
            logger.error(f"Erreur predictor : {e}")
            return Response(
                {"detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.exception("Erreur inattendue lors de la prédiction")
            return Response(
                {"detail": "Erreur interne du serveur"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # 3. Retourner le résultat
        return Response(result, status=status.HTTP_200_OK)
