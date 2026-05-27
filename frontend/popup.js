// popup.js — Logique de l'interface utilisateur
// Responsabilité unique : gérer les interactions de la popup

const API_URL    = "http://localhost:8000/api/predict/";
const HEALTH_URL = "http://localhost:8000/api/health/";

// ── Éléments du DOM ──────────────────────────────────────────
const btnAnalyze  = document.getElementById("btn-analyze");
const resultEl    = document.getElementById("result");
const statusDot   = document.getElementById("status-dot");
const statusText  = document.getElementById("status-text");


// ── Vérifie que le backend est en ligne au chargement ────────
async function checkBackendStatus() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error();
    const data = await res.json();
    statusDot.classList.add("status-dot--online");
    statusText.textContent = "Backend connecté";
    
  } catch {
    statusDot.classList.add("status-dot--offline");
    statusText.textContent = "Backend hors ligne";
  }
}

// ── Analyse l'email de l'onglet actif ────────────────────────
async function analyzeEmail() {
  setLoading(true);
  hideResult();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab.url || "";

    // Vérifier qu'on est sur une page email
    const isEmailPage = [
      "mail.google.com",
      "outlook.live.com",
      "outlook.office.com",
      "mail.yahoo.com",
    ].some(domain => url.includes(domain));

    if (!isEmailPage) {
      renderError("Ouvre un email sur Gmail, Outlook ou Yahoo pour lancer l'analyse.");
      return;
    }

    const emailData = await extractEmailFromTab();

    if (!emailData.subject && !emailData.body) {
      renderError("Aucun email détecté. Ouvre un email avant d'analyser.");
      return;
    }

    const data = await callPredictAPI(emailData);
    renderResult(data, emailData);

  } catch (err) {
    renderError(err.message);
  } finally {
    setLoading(false);
  }
}

// ── Extrait le texte depuis le content script ────────────────
async function extractEmailFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractEmail" });
    if (response?.subject || response?.body) return response;
  } catch {
    // content script non disponible sur cette page (ex: page interne Chrome)
  }

  // Fallback : titre + URL de l'onglet
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

// ── Rendu du résultat ────────────────────────────────────────
function renderResult(data, emailData) {
  const status   = data.status || (data.label === 1 ? "PHISHING" : "SECURISE");
  const score    = data.score_svm ?? 0;
  const barWidth = scoreToPercent(score);

  // Configuration selon le statut
  const config = {
    "PHISHING":       { modifier: "phishing",     icon: iconShield("danger"), label: "Phishing détecté",      color: "#e74c3c" },
    "SUSPECT_HAUT":   { modifier: "suspect-haut",  icon: iconShield("warn"),   label: "Suspect — Haut risque", color: "#e67e22" },
    "SUSPECT_FAIBLE": { modifier: "suspect-faible",icon: iconShield("warn"),   label: "Suspect — Risque faible",color: "#f39c12" },
    "SECURISE":       { modifier: "legit",          icon: iconShield("ok"),     label: "Email sécurisé",        color: "#2ecc71" },
  }[status] || { modifier: "legit", icon: iconShield("ok"), label: "Inconnu", color: "#7f8c8d" };

  resultEl.innerHTML = `
    <div class="result-card result-card--${config.modifier}">
      <div class="result-card__header">
        <span class="result-card__icon">${config.icon}</span>
        <span class="result-card__label" style="color:${config.color}">${config.label}</span>
      </div>
      <div class="score-section">
        <div class="score-section__labels">
          <span>Score</span>
          <span>${score.toFixed(4)}</span>
        </div>
        <div class="score-bar">
          <div class="score-bar__fill" style="width:${barWidth}%;background:${config.color}"></div>
        </div>
      </div>
      ${renderSignals(data.signals)}
      ${renderEmailPreview(emailData.subject)}
    </div>`;

  resultEl.classList.add("result--visible");
}

// ── Rendu des signaux détectés ───────────────────────────────
function renderSignals(signals) {
  if (!signals || Object.keys(signals).length === 0) {
    return `
      <p class="signals__title">Signaux détectés</p>
      <div class="signals__list">
        <span class="signal-tag signal-tag--info">Aucun signal suspect</span>
      </div>`;
  }

  const SIGNAL_LABELS = {
    nb_urls:                (v) => `${v} URL(s)`,
    has_ip_url:             ()  => "IP dans URL",
    has_short_url:          ()  => "URL raccourcie",
    has_suspicious_tld:     ()  => "TLD suspect (.ru, .tk…)",
    ratio_caps:             (v) => `Majuscules ${(v * 100).toFixed(0)}%`,
    nb_urgent_words:        (v) => `${v} mots urgents`,
    has_credential_request: ()  => "Demande de credentials",
    nb_exclamation:         (v) => `${v} point(s) d'exclamation`,
    ratio_digits:           (v) => `Chiffres ${(v * 100).toFixed(0)}%`,
  };

  const tags = Object.entries(signals)
    .filter(([, v]) => v > 0)
    .map(([key, val]) => {
      const label = SIGNAL_LABELS[key]?.(val) ?? key;
      return `<span class="signal-tag signal-tag--danger">${escapeHtml(label)}</span>`;
    })
    .join("");

  return `
    <p class="signals__title">Signaux détectés</p>
    <div class="signals__list">${tags}</div>`;
}

// ── Aperçu du sujet ──────────────────────────────────────────
function renderEmailPreview(subject) {
  if (!subject) return "";
  return `
    <div class="email-preview">
      <p class="email-preview__label">Sujet analysé</p>
      <p class="email-preview__text">${escapeHtml(subject.substring(0, 70))}</p>
    </div>`;
}

// ── Rendu d'une erreur ───────────────────────────────────────
function renderError(message) {
  resultEl.innerHTML = `
    <div class="result-card result-card--error">
      <div class="result-card__header">
        <span class="result-card__icon">${iconWarning()}</span>
        <span class="result-card__label">Erreur</span>
      </div>
      <p class="error-message">${escapeHtml(message)}</p>
      <p class="error-message__hint">Vérifie que le serveur Django est lancé sur le port 8000.</p>
    </div>`;
  resultEl.classList.add("result--visible");
}

// ── État chargement ──────────────────────────────────────────
function setLoading(isLoading) {
  btnAnalyze.disabled = isLoading;
  btnAnalyze.innerHTML = isLoading
    ? `<span class="spinner" aria-hidden="true"></span>Analyse en cours…`
    : "Analyser cet email";
}

function hideResult() {
  resultEl.classList.remove("result--visible");
  resultEl.innerHTML = "";
}

// ── Utilitaires ──────────────────────────────────────────────

// Normalise le score SVM (plage ~[-3, 3]) vers [0, 100]%
function scoreToPercent(score) {
  return Math.min(100, Math.max(0, ((score + 3) / 6) * 100));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Icônes SVG inline (évite les dépendances externes)
function iconShield(type) {
  const colors = { danger: "#e74c3c", warn: "#f39c12", ok: "#2ecc71" };
  const color  = colors[type] || "#7f8c8d";
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="${color}" stroke-width="2" stroke-linecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    ${type === "danger"
      ? '<line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
      : type === "warn"
      ? '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
      : '<polyline points="9 12 11 14 15 10"/>'}
  </svg>`;
}

function iconWarning() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#f39c12" stroke-width="2" stroke-linecap="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`;
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  checkBackendStatus();
  btnAnalyze.addEventListener("click", analyzeEmail);
});
