import re
import os
import logging
import numpy as np
import joblib
from scipy.sparse import hstack, csr_matrix

logger = logging.getLogger(__name__)

ML_DIR          = os.path.join(os.path.dirname(__file__), "ml")
MODEL_PATH      = os.path.join(ML_DIR, "SVM_model.pkl")
VECTORIZER_PATH = os.path.join(ML_DIR, "SVMvectorizer.pkl")


class PhishingPredictor:

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._loaded = False
        return cls._instance

    def load(self):
        if self._loaded:
            return
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Modèle introuvable : {MODEL_PATH}")
        if not os.path.exists(VECTORIZER_PATH):
            raise FileNotFoundError(f"Vectorizer introuvable : {VECTORIZER_PATH}")
        self._model      = joblib.load(MODEL_PATH)
        self._vectorizer = joblib.load(VECTORIZER_PATH)
        self._model_name = type(self._model).__name__
        self._loaded     = True
        logger.info(f"Modèle chargé : {self._model_name}")

    @property
    def is_loaded(self):
        return self._loaded

    @property
    def model_name(self):
        return getattr(self, "_model_name", "Non chargé")

    def predict(self, subject: str, body: str) -> dict:
        if not self._loaded:
            raise RuntimeError("Modèle non chargé.")

        text = subject + " " + body

        # 3 features custom — exactement comme dans ton notebook
        custom = self._get_custom_features(text)

        # Nettoyage + TF-IDF
        text_clean = self._clean_text(text)
        tfidf_vec  = self._vectorizer.transform([text_clean])

        # Fusion : 5000 TF-IDF + 3 features = 5003
        full_vec = hstack([tfidf_vec, csr_matrix([custom])])

        label = int(self._model.predict(full_vec)[0])
        score = float(self._model.decision_function(full_vec)[0])

        # Même logique de seuil que dans ton notebook
        if score > 1:
            status = "PHISHING"
        else:
            status = "SECURISE"

        signals = {}
        if custom[0] > 0:
            signals["num_links"] = custom[0]
        if custom[1] > 0:
            signals["urgent_count"] = custom[1]

        return {
            "label":     label,
            "score_svm": round(score, 4),
            "status":    status,
            "signals":   signals,
        }

    @staticmethod
    def _clean_text(text: str) -> str:
        text = str(text).lower()
        text = re.sub(r"\W", " ", text)
        return text

    @staticmethod
    def _get_custom_features(text: str) -> list:
        text = str(text).lower()
        num_links = len(re.findall(
            r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+',
            text
        ))
        suspicious_words = ['urgent', 'verify', 'password', 'cliquez', 'connexion', 'suspendu', 'immediat']
        urgent_count = sum(1 for w in suspicious_words if w in text)
        length = len(text)
        return [num_links, urgent_count, length]


predictor = PhishingPredictor()