// content.js — CyberShield
// Fix SPA : Gmail/Outlook sont des Single Page Apps.
// Quand on change d'email, le DOM est mis à jour en JS sans rechargement de page.
// On attend donc que le contenu soit stable avant de le lire (MutationObserver + retry).

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "extractEmail") {
    extractEmailFromPage()
      .then(sendResponse)
      .catch(() => sendResponse({ subject: document.title || "", body: "" }));
    return true; // Indique à Chrome qu'on répond de manière asynchrone
  }
});

// ── Dispatcher principal ─────────────────────────────────────
async function extractEmailFromPage() {
  const url = window.location.href;

  if (url.includes("mail.google.com"))    return extractGmail();
  if (url.includes("outlook.live.com") ||
      url.includes("outlook.office.com")) return extractOutlook();
  if (url.includes("mail.yahoo.com"))     return extractYahoo();

  return extractGeneric();
}

// ── Gmail ────────────────────────────────────────────────────
// Problème SPA : Gmail injecte le contenu après un clic, pas immédiatement.
// On attend jusqu'à 3s que le sélecteur soit présent ET non-vide.
async function extractGmail() {
  const subject = await waitForText("h2.hP", 3000);
  const body    = await waitForText("div.a3s.aiL", 3000);

  // Dernier recours : si on n'a rien, on tente de lire ce qui est visible
  return {
    subject: subject || getActiveGmailSubject(),
    body:    body    || "",
  };
}

// Fallback Gmail : cherche le sujet dans les titres visibles
function getActiveGmailSubject() {
  // Gmail peut utiliser plusieurs sélecteurs selon la version
  const selectors = [
    "h2.hP",
    "[data-legacy-thread-id] h2",
    ".ha h2",
    ".nH h2",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) return el.innerText.trim();
  }
  return document.title.replace(" - Gmail", "").trim();
}

// ── Outlook ──────────────────────────────────────────────────
async function extractOutlook() {
  const subject = await waitForText(
    "[class*='SubjectText'], [data-automation-id='subjectLine']",
    3000
  );
  const body = await waitForText(
    "[class*='UniqueMessageBody'], [data-automation-id='messageBody']",
    3000
  );
  return { subject, body };
}

// ── Yahoo ────────────────────────────────────────────────────
async function extractYahoo() {
  const subject = await waitForText("[data-test-id='message-subject']", 3000);
  const body    = await waitForText("[data-test-id='message-body']", 3000);
  return { subject, body };
}

// ── Generic ──────────────────────────────────────────────────
function extractGeneric() {
  return {
    subject: document.title || "",
    body:    document.body?.innerText?.substring(0, 3000) || "",
  };
}

// ══════════════════════════════════════════════════════════════
// CORE FIX — waitForText
// Attend qu'un sélecteur CSS soit présent dans le DOM ET ait du texte.
// Utilise MutationObserver pour réagir aux changements du DOM SPA.
// Timeout : maxMs (défaut 3000ms).
// ══════════════════════════════════════════════════════════════
function waitForText(selector, maxMs = 3000) {
  return new Promise((resolve) => {
    // Si l'élément est déjà là et non-vide, on retourne immédiatement
    const existing = getTextFromSelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        // Dernière tentative avant d'abandonner
        resolve(getTextFromSelector(selector) || "");
      }
    }, maxMs);

    // MutationObserver : surveille les changements du DOM
    const observer = new MutationObserver(() => {
      const text = getTextFromSelector(selector);
      if (text && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(text);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

// ── Lit le texte d'un sélecteur (multi-sélecteurs séparés par virgule) ──
function getTextFromSelector(selector) {
  // Supporte les sélecteurs multiples (ex: "sel1, sel2")
  const parts = selector.split(",").map(s => s.trim());
  for (const part of parts) {
    try {
      const el = document.querySelector(part);
      const text = el?.innerText?.trim() || el?.textContent?.trim() || "";
      if (text.length > 2) return text; // > 2 pour ignorer les textes vides ou espaces
    } catch {
      // Sélecteur invalide, on continue
    }
  }
  return "";
}