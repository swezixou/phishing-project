// popup.js — Logique de l'interface utilisateur

const API_URL = "http://localhost:8000/api/predict/";
const HEALTH_URL = "http://localhost:8000/api/health/";

// ── Vérifie que le backend est en ligne au chargement ──────────
async function checkBackendStatus() {
  const dot  = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      dot.className  = "online";
      text.textContent = "Backend connecté";
      document.getElementById("model-info").textContent = data.model || "SVM v1.0";
    } else {
      throw new Error();
    }
  } catch {
    dot.className  = "offline";
    text.textContent = "Backend hors ligne";
  }
}

// ── Analyse l'email de l'onglet actif ──────────────────────────
async function analyzeEmail() {
  const btn    = document.getElementById("btn-analyze");
  const result = document.getElementById("result");

  // Désactiver le bouton pendant l'analyse
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Analyse en cours...';
  result.style.display = "none";

  try {
    // 1. Demander au content.js d'extraire le texte de la page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let emailData = { subject: "", body: "" };
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "extractEmail" });
      if (response) emailData = response;
    } catch {
      // Si le content script ne répond pas, on analyse l'URL + le titre
      emailData = {
        subject: tab.title || "",
        body: tab.url || ""
      };
    }

    // 2. Envoyer au backend Django
    const apiRes = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(emailData)
    });

    if (!apiRes.ok) throw new Error(`API Error: ${apiRes.status}`);
    const data = await apiRes.json();

    // 3. Afficher le résultat
    showResult(data, emailData);

  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = "Analyser cet email";
  }
}

// ── Affiche le résultat dans la popup ─────────────────────────
function showResult(data, emailData) {
  const result = document.getElementById("result");
  const isPhishing = data.label === 1;
  const cardClass  = isPhishing ? "phishing" : "legit";
  const badge      = isPhishing ? "&#128308;" : "&#128994;";
  const label      = isPhishing ? "PHISHING DÉTECTÉ" : "EMAIL LÉGITIME";

  // Score normalisé entre 0 et 100% pour la barre
  const rawScore   = data.score_svm || 0;
  const barPercent = Math.min(100, Math.max(0, (rawScore + 3) / 6 * 100));

  // Construction des tags de signaux
  const signals    = data.signals || {};
  const signalTags = Object.entries(signals)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const labels = {
        nb_urls: `${v} URL(s)`,
        has_ip_url: "IP dans URL",
        has_short_url: "URL raccourcie",
        has_suspicious_tld: "TLD suspect",
        ratio_caps: `Majuscules ${(v * 100).toFixed(0)}%`,
        nb_urgent_words: `${v} mots urgents`,
        has_credential_request: "Demande credentials",
        nb_exclamation: `${v} !`,
        ratio_digits: `Chiffres ${(v * 100).toFixed(0)}%`
      };
      return labels[k] || k;
    });

  const signalsHTML = signalTags.length > 0
    ? `<div class="signals-title">Signaux détectés</div>
       <div class="signals-list">
         ${signalTags.map(s => `<span class="signal-tag">${s}</span>`).join("")}
       </div>`
    : `<div class="signals-list"><span class="signal-tag neutral">Aucun signal suspect</span></div>`;

  const subjectPreview = emailData.subject
    ? `<div class="email-preview">
         <div class="ep-label">Sujet analysé</div>
         <div class="ep-text">${escapeHtml(emailData.subject.substring(0, 60))}</div>
       </div>`
    : "";

  result.style.display = "block";
  result.innerHTML = `
    <div class="result-card ${cardClass}">
      <div class="result-top">
        <span class="result-badge">${badge}</span>
        <span class="result-label">${label}</span>
      </div>
      <div class="score-section">
        <div class="score-label">
          <span>Score de confiance</span>
          <span>${rawScore.toFixed(3)}</span>
        </div>
        <div class="score-bar">
          <div class="score-fill" style="width: ${barPercent.toFixed(1)}%"></div>
        </div>
      </div>
      ${signalsHTML}
      ${subjectPreview}
    </div>
  `;
}

// ── Affiche une erreur ─────────────────────────────────────────
function showError(message) {
  const result = document.getElementById("result");
  result.style.display = "block";
  result.innerHTML = `
    <div class="result-card error">
      <div class="result-top">
        <span class="result-badge">&#9888;</span>
        <span class="result-label">Erreur</span>
      </div>
      <p style="font-size:12px;color:#bdc3c7;margin-top:6px;">
        ${escapeHtml(message)}<br>
        <span style="color:#7f8c8d">Vérifie que le backend Django est lancé.</span>
      </p>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", checkBackendStatus);