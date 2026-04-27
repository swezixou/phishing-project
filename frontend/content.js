// content.js — Exécuté dans le contexte de chaque page
// Responsabilité unique : extraire le contenu d'un email affiché

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "extractEmail") {
    sendResponse(extractEmailFromPage());
  }
  return true;
});

function extractEmailFromPage() {
  const url = window.location.href;

  if (url.includes("mail.google.com"))    return extractGmail();
  if (url.includes("outlook.live.com") ||
      url.includes("outlook.office.com")) return extractOutlook();
  if (url.includes("mail.yahoo.com"))     return extractYahoo();

  return extractGeneric();
}

function extractGmail() {
  return {
    subject: getText("h2.hP"),
    body:    getText("div.a3s.aiL"),
  };
}

function extractOutlook() {
  return {
    subject: getText("[class*='SubjectText'], [data-automation-id='subjectLine']"),
    body:    getText("[class*='UniqueMessageBody'], [data-automation-id='messageBody']"),
  };
}

function extractYahoo() {
  return {
    subject: getText("[data-test-id='message-subject']"),
    body:    getText("[data-test-id='message-body']"),
  };
}

function extractGeneric() {
  return {
    subject: document.title || "",
    body:    document.body?.innerText?.substring(0, 3000) || "",
  };
}

// Récupère le texte d'un sélecteur CSS (retourne le titre de page en fallback)
function getText(selector) {
  return document.querySelector(selector)?.innerText?.trim() || document.title;
}
