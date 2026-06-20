// popup.js — CyberShield Extension Popup
// Responsabilités :
//   - Analyse de l'email actif via le backend Django
//   - Affichage du dashboard résultat
//   - Sauvegarde de chaque analyse dans chrome.storage.local
//   - Application du thème sauvegardé
//   - Ouverture du dashboard complet via le bouton Paramètres

const API_URL    = "http://localhost:8000/api/predict/";
const HEALTH_URL = "http://localhost:8000/api/health/";

// ── Clés storage ─────────────────────────────────────────────
const STORAGE_HISTORY   = "cs_history";
const STORAGE_THEME     = "cs_theme";
const STORAGE_THRESHOLD = "cs_threshold";

// ── Helpers storage (chrome.storage + fallback localStorage) ─
const store = {
  get: (key) => new Promise((res) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([key], (r) => res(r[key] ?? null));
    } else {
      res(JSON.parse(localStorage.getItem(key)));
    }
  }),
  set: (key, val) => new Promise((res) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [key]: val }, res);
    } else {
      localStorage.setItem(key, JSON.stringify(val));
      res();
    }
  }),
};

// ── Éléments du DOM ──────────────────────────────────────────
const btnAnalyze      = document.getElementById("btn-analyze");
const btnSettings     = document.getElementById("btn-settings");
const statusDot       = document.getElementById("status-dot");
const statusText      = document.getElementById("status-text");

// Zones d'état
const stateIdle       = document.getElementById("state-idle");
const stateScanning   = document.getElementById("state-scanning");
const stateError      = document.getElementById("state-error");
const dashboard       = document.getElementById("dashboard");

// Dashboard — éléments
const riskCard        = document.getElementById("risk-card");
const riskIcon        = document.getElementById("risk-icon");
const riskStatus      = document.getElementById("risk-status");
const riskScore       = document.getElementById("risk-score");
const riskBar         = document.getElementById("risk-bar");
const riskPercent     = document.getElementById("risk-percent");
const signalsTags     = document.getElementById("signals-tags");
const emailSubject    = document.getElementById("email-subject");
const svmScore        = document.getElementById("svm-score");
const modelName       = document.getElementById("model-name");
const errorMsg        = document.getElementById("error-msg");

// ── Ouvre le dashboard dans un onglet dédié ──────────────────
function openDashboard() {
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  } else {
    window.open("dashboard.html", "_blank");
  }
}

// ── Vérifie que le backend est en ligne ──────────────────────
async function checkBackendStatus() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    statusDot.classList.add("statusbar__dot--online");
    statusText.textContent = "Backend: Connecté";
    if (data.model_name) modelName.textContent = data.model_name;
  } catch {
    statusDot.classList.add("statusbar__dot--offline");
    statusText.textContent = "Backend: Hors ligne";
  }
}

// ── Applique le thème sauvegardé ──────────────────────────────
async function applyThemeFromStorage() {
  const theme = (await store.get(STORAGE_THEME)) || "blue";
  document.documentElement.setAttribute("data-theme", theme);
}

// ── Analyse l'email de l'onglet actif ────────────────────────
async function analyzeEmail() {
  setLoading(true);
  showState("scanning");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab.url || "";

    const isEmailPage = [
      "mail.google.com",
      "outlook.live.com",
      "outlook.office.com",
      "mail.yahoo.com",
    ].some(domain => url.includes(domain));

    if (!isEmailPage) {
      showError("Ouvre un email sur Gmail, Outlook ou Yahoo pour lancer l'analyse.");
      return;
    }

    const emailData = await extractEmailFromTab();

    if (!emailData.subject && !emailData.body) {
      showError("Aucun email détecté. Ouvre un email avant d'analyser.");
      return;
    }

    const data = await callPredictAPI(emailData);
    await saveAnalysis(data, emailData);
    renderDashboard(data, emailData);

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

// ── Sauvegarde l'analyse dans l'historique ───────────────────
async function saveAnalysis(data, emailData) {
  const history = (await store.get(STORAGE_HISTORY)) || [];
  const entry = {
    timestamp: new Date().toISOString(),
    subject:   emailData.subject || "",
    score:     data.score_svm ?? 0,
    percent:   scoreToPercent(data.score_svm ?? 0),
    status:    data.status || (data.label === 1 ? "PHISHING" : "SECURISE"),
    signals:   data.signals || {},
  };
  history.push(entry);
  // Limite à 200 entrées
  if (history.length > 200) history.splice(0, history.length - 200);
  await store.set(STORAGE_HISTORY, history);
}

// ── Extrait le texte depuis le content script ────────────────
async function extractEmailFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractEmail" });
    if (response?.subject || response?.body) return response;
  } catch {
    // content script non disponible
  }
  return { subject: tab.title || "", body: tab.url || "" };
}

// ── Appel API Django ─────────────────────────────────────────
async function callPredictAPI(emailData) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(emailData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Erreur API (${res.status})`);
  }
  return res.json();
}

// ── Rendu du dashboard résultat ──────────────────────────────
function renderDashboard(data, emailData) {
  const status   = data.status || (data.label === 1 ? "PHISHING" : "SECURISE");
  const rawScore = data.score_svm ?? 0;
  const percent  = scoreToPercent(rawScore);

  const config = {
    "PHISHING":       { modifier: "danger", icon: "gpp_bad",      label: "PHISHING DÉTECTÉ" },
    "SUSPECT_HAUT":   { modifier: "warn",   icon: "gpp_maybe",    label: "SUSPECT — Risque élevé" },
    "SUSPECT_FAIBLE": { modifier: "warn",   icon: "gpp_maybe",    label: "SUSPECT — Risque faible" },
    "SECURISE":       { modifier: "safe",   icon: "verified_user", label: "EMAIL SÉCURISÉ" },
  }[status] || { modifier: "danger", icon: "gpp_bad", label: "INCONNU" };

  riskCard.className   = `risk-card risk-card--${config.modifier}`;
  riskIcon.textContent = config.icon;
  riskStatus.textContent = config.label;
  riskScore.textContent  = `${Math.round(percent)}%`;
  riskBar.style.width    = `${percent}%`;
  riskPercent.textContent = `${Math.round(percent)} / 100`;

  emailSubject.textContent = emailData.subject
    ? emailData.subject.substring(0, 60)
    : "Aucun sujet détecté";
  svmScore.textContent = rawScore.toFixed(4);

  renderSignals(data.signals);
  showState("dashboard");
}

// ── Rendu des signaux ─────────────────────────────────────────
function renderSignals(signals) {
  signalsTags.innerHTML = "";

  const SIGNAL_LABELS = {
    num_links:              (v) => `${v} URL${v > 1 ? "s" : ""}`,
    urgent_count:           (v) => `${v} mot${v > 1 ? "s" : ""} urgent${v > 1 ? "s" : ""}`,
    nb_urls:                (v) => `${v} URL(s)`,
    has_ip_url:             ()  => "IP dans URL",
    has_short_url:          ()  => "URL raccourcie",
    has_suspicious_tld:     ()  => "TLD suspect",
    ratio_caps:             (v) => `Majuscules ${(v * 100).toFixed(0)}%`,
    nb_urgent_words:        (v) => `${v} mots urgents`,
    has_credential_request: ()  => "Demande credentials",
    nb_exclamation:         (v) => `${v} exclamation(s)`,
    ratio_digits:           (v) => `Chiffres ${(v * 100).toFixed(0)}%`,
  };

  const activeSignals = signals
    ? Object.entries(signals).filter(([, v]) => v && v > 0)
    : [];

  if (activeSignals.length === 0) {
    const tag = document.createElement("span");
    tag.className   = "signal-tag signal-tag--safe";
    tag.textContent = "Aucun signal suspect";
    signalsTags.appendChild(tag);
    return;
  }

  activeSignals.forEach(([key, val]) => {
    const label   = SIGNAL_LABELS[key]?.(val) ?? key;
    const isDanger = ["has_ip_url", "has_short_url", "has_suspicious_tld",
                      "has_credential_request", "num_links", "nb_urls"].includes(key);
    const isWarn  = ["urgent_count", "nb_urgent_words", "nb_exclamation"].includes(key);
    const tag = document.createElement("span");
    tag.className   = `signal-tag signal-tag--${isDanger ? "danger" : isWarn ? "warn" : "info"}`;
    tag.textContent = label;
    signalsTags.appendChild(tag);
  });
}

// ── Gestion des états (idle | scanning | dashboard | error) ──
function showState(state) {
  [stateIdle, stateScanning, stateError, dashboard].forEach(el => {
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  });

  const map = { idle: stateIdle, scanning: stateScanning, error: stateError, dashboard };
  const target = map[state];
  if (target) {
    target.classList.remove("hidden");
    target.setAttribute("aria-hidden", "false");
  }
}

// ── Erreur ────────────────────────────────────────────────────
function showError(message) {
  errorMsg.textContent = escapeHtml(message);
  showState("error");
}

// ── État chargement ───────────────────────────────────────────
function setLoading(isLoading) {
  btnAnalyze.disabled = isLoading;
  const icon  = btnAnalyze.querySelector(".btn-analyze__icon");
  const label = btnAnalyze.querySelector(".btn-analyze__label");

  if (isLoading) {
    if (icon)  icon.style.display = "none";
    if (label) label.textContent  = "Analyse en cours…";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    btnAnalyze.prepend(spinner);
  } else {
    const spinner = btnAnalyze.querySelector(".spinner");
    if (spinner) spinner.remove();
    if (icon)    icon.style.display = "";
    if (label)   label.textContent  = "Analyser cet email";
  }
}

// ── Normalise score 
function scoreToPercent(score) {
  return Math.min(100, Math.max(0, score * 100));
}

// ── Échappe le HTML ───────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await applyThemeFromStorage();
  await checkBackendStatus();
  btnAnalyze.addEventListener("click", analyzeEmail);
  btnSettings.addEventListener("click", openDashboard);
});
