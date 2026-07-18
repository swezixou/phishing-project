# 🛡️ Phishing Detector — Extension Anti-Phishing basée sur le Machine Learning

Extension de navigateur (Manifest V3) qui analyse en un clic les emails ouverts sur **Gmail, Outlook Web et Yahoo Mail**, et qui prédit s'ils sont du **phishing** ou **sécurisés**, à l'aide d'un modèle de **Régression Logistique** entraîné sur plus de 51 000 emails (un modèle SVM a également été entraîné et comparé, voir section [Machine Learning](#-machine-learning)).

Le projet a été réalisé dans le cadre d'un stage de fin d'année (CESI/ISSI Algérie, 2025/2026), et inclut également un volet **Red Team / Active Directory** documentant les conséquences réelles d'une infection par phishing (escalade de privilèges, Pass-the-Hash) — mené en laboratoire isolé, à but pédagogique uniquement.

> ⚠️ Ce dépôt ne contient **pas** le poste malveillant ni le payload du volet Red Team ; seuls le code applicatif (ML + backend + extension) et la documentation associée sont publiés ici.

---

## 📐 Architecture

```
Utilisateur → Extension navigateur (Gmail/Outlook/Yahoo)
                   │  extrait le sujet + le corps de l'email (content.js)
                   ▼
              popup.js  ──POST──▶  Backend Django REST (localhost:8000)
                                        │
                                        ▼
                              predictor.py (pipeline ML)
                              ├─ nettoyage du texte
                              ├─ extraction features custom (liens, mots urgents, longueur)
                              ├─ vectorisation TF-IDF
                              ├─ fusion scipy.sparse.hstack
                              └─ prédiction (Régression Logistique) + score de décision
                                        │
                                        ▼
              popup.js  ◀──JSON──   { label, score_svm, status, signals }
```

---

## 📁 Structure du dépôt

```
.
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/
│   │   ├── settings.py        # config Django (CORS, DRF)
│   │   └── urls.py
│   └── phishing_api/
│       ├── apps.py            # charge le modèle ML au démarrage
│       ├── serializers.py     # validation du JSON entrant
│       ├── predictor.py       # pipeline de prédiction (Régression Logistique)
│       ├── views.py           # endpoints /health/ et /predict/
│       ├── urls.py
│       └── ml/
│           ├── LogisticRegression_model.pkl
│           ├── LgrSvectorizer.pkl
│           ├── SVM_model.pkl          # modèle comparé, non retenu en prod
│           └── SVMvectorizer.pkl
├── frontend/
│   ├── Manifest.json          # extension Manifest V3
│   ├── popup.html / popup.css / popup.js
│   ├── content.js             # extraction du contenu email par webmail
│   └── background.js          # service worker
├── code_du_train_du_model_svm.txt   # script d'entraînement du modèle
└── README.md
```

---

## 🚀 Installation

### Prérequis

- Python 3.10+
- Google Chrome (ou tout navigateur compatible Manifest V3)
- [Git LFS](https://git-lfs.com/) — les fichiers `.pkl` du modèle sont versionnés via LFS

```bash
git clone <url-du-depot>
cd <nom-du-depot>
git lfs pull
```

### 1. Backend (Django)

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows : venv\Scripts\activate

pip install -r requirements.txt

python manage.py runserver
```

Le serveur démarre par défaut sur `http://localhost:8000`.
Au lancement, `phishing_api/apps.py` charge automatiquement le modèle et le vectorizer depuis `phishing_api/ml/`.

> ⚠️ **À vérifier avant publication** : dans la version actuelle de `predictor.py`, les chemins pointent vers `SVM_model.pkl` / `SVMvectorizer.pkl`. Si la Régression Logistique est bien le modèle retenu en production, il faut mettre à jour `MODEL_PATH` et `VECTORIZER_PATH` vers `LogisticRegression_model.pkl` / `LgrSvectorizer.pkl` (déjà présents dans `phishing_api/ml/`).

Vérification rapide :

```bash
curl http://localhost:8000/api/health/
```

### 2. Extension navigateur

1. Ouvrir `chrome://extensions`
2. Activer le **Mode développeur**
3. Cliquer sur **Charger l'extension non empaquetée**
4. Sélectionner le dossier `frontend/`
5. Ouvrir un email sur Gmail, Outlook Web ou Yahoo Mail, puis cliquer sur l'icône de l'extension → **Analyser cet email**

---

## 🔌 API REST

| Méthode | Endpoint         | Description                                  |
|---------|------------------|-----------------------------------------------|
| `GET`   | `/api/health/`   | Vérifie que le modèle est chargé              |
| `POST`  | `/api/predict/`  | Analyse un email et renvoie la prédiction     |

**Requête `POST /api/predict/`**

```json
{
  "subject": "Votre compte a été suspendu",
  "body": "Cliquez ici immédiatement pour vérifier votre mot de passe : http://..."
}
```

**Réponse**

```json
{
  "label": 1,
  "score_svm": 1.8342,
  "status": "PHISHING",
  "signals": {
    "num_links": 1,
    "urgent_count": 3
  }
}
```

---

## 🧠 Machine Learning

### Datasets

- **Enron Email Dataset** (~33 700 emails)
- **Phishing Email Dataset** (~18 000 emails)
- Source : [Kaggle — naserabdullahalam/phishing-email-dataset](https://www.kaggle.com/datasets/naserabdullahalam/phishing-email-dataset), téléchargé via `kagglehub`

### Pipeline (`code_du_train_du_model_svm.txt`)

1. Fusion et uniformisation des deux datasets (`subject` + `body` → `text`)
2. Nettoyage du texte (minuscules, suppression des URLs et de la ponctuation)
3. Vectorisation **TF-IDF** (`max_features=5000`)
4. Extraction de **features custom** : nombre de liens, mots à connotation urgente, longueur du texte
5. Fusion TF-IDF + features custom via `scipy.sparse.hstack`
6. Entraînement et comparaison de trois modèles : **SVM (LinearSVC)**, **Régression Logistique**, **Random Forest**
7. Sérialisation du meilleur modèle avec `joblib` → `LogisticRegression_model.pkl` / `LgrSvectorizer.pkl`

### Résultats

| Modèle                  | Précision globale | Choix retenu |
|--------------------------|--------------------|:---:|
| **Régression Logistique**| ~95-96 %           | ✔️ |
| SVM (LinearSVC)          | ~97-98 %           | — |
| Random Forest            | ~94-96 %           | — |

La Régression Logistique a été retenue comme modèle final malgré une précision légèrement inférieure au SVM, pour son meilleur compromis interprétabilité / robustesse en production (score de probabilité directement exploitable, comportement plus stable face aux données non vues).

Pour ré-entraîner le modèle :

```bash
pip install kagglehub pandas scikit-learn joblib
python code_du_train_du_model_svm.txt   # à renommer en .py
```

---

## 🕵️ Volet Red Team (documentation uniquement)

Une phase complémentaire, réalisée en environnement de laboratoire isolé (VMs Windows Server / Windows 10 / Kali Linux), documente la chaîne d'attaque post-phishing :

1. Reconnaissance OSINT
2. Exécution d'un payload simulant le clic sur un lien de phishing
3. Escalade de privilèges locale (CVE-2020-17103)
4. Credential dumping (hash NTLM via LSASS)
5. Pass-the-Hash → accès RDP au contrôleur de domaine Active Directory

Cette démarche est strictement pédagogique et confinée à un laboratoire virtualisé, sans lien avec des systèmes en production. Le détail méthodologique est disponible dans le rapport de stage (non inclus dans le code source).

---

## 🛠️ Stack technique

| Domaine | Technologies |
|---|---|
| Machine Learning | Python, scikit-learn, pandas, joblib, scipy |
| Backend | Django, Django REST Framework, django-cors-headers |
| Extension | HTML5, CSS3, JavaScript (Manifest V3) |
| Data | Kaggle (kagglehub) |

---

## 📌 Limitations connues

- CORS ouvert (`CORS_ALLOW_ALL_ORIGINS = True`) et `SECRET_KEY` en clair : configuration **dev uniquement**, à durcir avant tout déploiement (variables d'environnement, `DEBUG=False`, restriction CORS).
- Modèle entraîné sur des emails majoritairement en anglais (Enron) : les performances sur des emails francophones peuvent varier.
- L'extraction du contenu email repose sur des sélecteurs CSS spécifiques à chaque webmail, susceptibles de casser en cas de refonte de l'interface (Gmail/Outlook/Yahoo).

## 🗺️ Pistes d'amélioration

- Modèle deep learning (BERT/DistilBERT) pour les emails plus sophistiqués
- Base de données d'URLs malveillantes connues
- Déploiement cloud du backend
- Signalement communautaire pour enrichir le dataset d'entraînement

---

## 👤 Auteur

**Brahimi Mohamed Aymen**
Stage CESI/ISSI Algérie — Département Informatique, 2025/2026
Tutrice pédagogique : Mme Maryam Chnaoui — Maître de stage : M. Youcef Benab

## 📄 Licence

Projet académique — usage éducatif. À adapter selon la licence souhaitée (MIT, GPL, etc.).
