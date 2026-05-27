"""
settings.py — Configuration Django
Points importants pour ce projet :
  - CORS autorisé pour que l'extension Chrome puisse appeler l'API
  - DEBUG=True uniquement en développement
  - REST_FRAMEWORK : format JSON par défaut
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Sécurité ─────────────────────────────────────────────────
SECRET_KEY = "dev-secret-key-change-this-in-production"
DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# ── Applications installées ──────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    # Bibliothèques tierces
    "rest_framework",       # Django REST Framework → facilite la création d'API JSON
    "corsheaders",          # Autorise les requêtes cross-origin de l'extension
    # Notre application
    "phishing_api",
]

# ── Middleware ───────────────────────────────────────────────
# CorsMiddleware DOIT être en premier pour intercepter les requêtes OPTIONS
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

# ── CORS : autorise l'extension Chrome à appeler l'API ───────
# Les extensions Chrome ont une origine du type "chrome-extension://..."
# CORS_ALLOW_ALL_ORIGINS=True est acceptable en développement local uniquement
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_METHODS = ["POST", "GET", "OPTIONS"]
CORS_ALLOW_HEADERS = ["Content-Type", "Authorization"]

# ── Routage principal ────────────────────────────────────────
ROOT_URLCONF = "config.urls"

# ── REST Framework ───────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
}

# ── Base de données (non utilisée ici, Django en a besoin) ───
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# ── Internationalisation ─────────────────────────────────────
LANGUAGE_CODE = "fr-fr"
TIME_ZONE     = "Europe/Paris"
USE_I18N      = True
USE_TZ        = True

# ── Fichiers statiques ───────────────────────────────────────
STATIC_URL = "/static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
