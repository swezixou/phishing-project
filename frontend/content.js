// content.js — S'exécute dans le contexte de la page web
// Extrait le sujet et le corps de l'email affiché

// ── Écoute les messages de popup.js ───────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractEmail") {
    const emailData = extractEmailFromPage();
    sendResponse(emailData);
  }
  return true; // garder le canal ouvert pour la réponse async
});

// ── Stratégie d'extraction multi-plateforme ───────────────────
function extractEmailFromPage() {
  const url = window.location.href;

  // --- Gmail ---
  if (url.includes("mail.google.com")) {
    return extractGmail();
  }
  // --- Outlook Web ---
  if (url.includes("outlook.live.com") || url.includes("outlook.office.com")) {
    return extractOutlook();
  }
  // --- Yahoo Mail ---
  if (url.includes("mail.yahoo.com")) {
    return extractYahoo();
  }
  // --- Fallback générique ---
  return extractGeneric();
}

function extractGmail() {
  const subjectEl = document.querySelector("h2.hP");
  const bodyEl    = document.querySelector("div.a3s.aiL");
  return {
    subject: subjectEl ? subjectEl.innerText.trim() : document.title,
    body:    bodyEl    ? bodyEl.innerText.trim()    : extractGeneric().body
  };
}

function extractOutlook() {
  const subjectEl = document.querySelector(
    "[class*='subject'], [aria-label*='Subject'], .allowTextSelection.bYB8Pb"
  );
  const bodyEl = document.querySelector(
    "[class*='readingPaneContent'], [class*='UniqueMessageBody']"
  );
  return {
    subject: subjectEl ? subjectEl.innerText.trim() : document.title,
    body:    bodyEl    ? bodyEl.innerText.trim()    : extractGeneric().body
  };
}

function extractYahoo() {
  const subjectEl = document.querySelector("[data-test-id='message-subject']");
  const bodyEl    = document.querySelector("[data-test-id='message-body']");
  return {
    subject: subjectEl ? subjectEl.innerText.trim() : document.title,
    body:    bodyEl    ? bodyEl.innerText.trim()    : extractGeneric().body
  };
}

function extractGeneric() {
  // Récupère tout le texte visible de la page (fallback)
  const title = document.title || "";
  const body  = document.body ? document.body.innerText.substring(0, 3000) : "";
  return { subject: title, body };
}