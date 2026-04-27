// background.js — Service worker de l'extension
// Responsabilité : gérer les événements de cycle de vie de l'extension

// À l'installation, on initialise le state
chrome.runtime.onInstalled.addListener(() => {
  console.log("[PhishingDetector] Extension installée.");
});
