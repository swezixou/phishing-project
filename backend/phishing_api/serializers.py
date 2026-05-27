"""
serializers.py — Validation des données JSON entrantes
Le serializer vérifie que la requête a bien les champs attendus
avant de les passer à la vue. C'est le gardien de l'entrée.
"""

from rest_framework import serializers


class EmailInputSerializer(serializers.Serializer):
    """Valide le JSON reçu par l'endpoint /api/predict/"""
    subject = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=1000,
    )
    body = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=50000,
    )
