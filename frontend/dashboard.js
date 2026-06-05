// dashboard.js — CyberShield Dashboard
// Responsabilités :
//   - Navigation entre pages (overview / history / settings)
//   - Lecture de l'historique depuis chrome.storage.local
//   - Paramètres : thème, raccourci clavier, seuil de détection
//   - Vérification du statut backend

const HEALTH_URL = "http://localhost:8000/api/health/";

// ── Clés chrome.storage ──────────────────────────────────────
const STORAGE_HISTORY   = "cs_history";    // tableau d'analyses
const STORAGE_THEME     = "cs_theme";      // string : blue/red/green/purple/orange
const STORAGE_SHORTCUT  = "cs_shortcut";   // string : lettre, ex "P"
const STORAGE_THRESHOLD = "cs_threshold";  // float  : ex 1.0

// ── Helpers storage (compatibilité chrome + fallback localStorage) ──
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

// ── Navigation ───────────────────────────────────────────────
const navItems = document.querySelectorAll(".sidebar__nav-item");
const pages    = document.querySelectorAll(".page");

navItems.forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.page;

    navItems.forEach(b => b.classList.remove("sidebar__nav-item--active"));
    btn.classList.add("sidebar__nav-item--active");
    btn.setAttribute("aria-current", "page");

    pages.forEach(p => {
      if (p.id === `page-${target}`) {
        p.classList.remove("hidden");
      } else {
        p.classList.add("hidden");
      }
    });

    // Charge les données à l'ouverture de chaque page
    if (target === "overview")  loadOverview();
    if (target === "history")   loadHistory();
    if (target === "settings")  loadSettings();
  });
});

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await checkBackendStatus();
  await loadOverview();
  await applyThemeFromStorage();
});

// ── Backend status ───────────────────────────────────────────
async function checkBackendStatus() {
  const dot  = document.getElementById("sidebar-status-dot");
  const text = document.getElementById("sidebar-status-text");
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error();
    dot.classList.add("sidebar__status-dot--online");
    text.textContent = "Backend: OK";
  } catch {
    dot.classList.add("sidebar__status-dot--offline");
    text.textContent = "Backend: OFF";
  }
}

// ══════════════════════════════════════════════════════════════
// PAGE : OVERVIEW
// ══════════════════════════════════════════════════════════════
async function loadOverview() {
  const history = (await store.get(STORAGE_HISTORY)) || [];

  // KPIs
  const total   = history.length;
  const phishing = history.filter(e => e.status === "PHISHING").length;
  const safe     = history.filter(e => e.status === "SECURISE").length;
  const suspect  = history.filter(e => e.status?.startsWith("SUSPECT")).length;

  document.getElementById("kpi-total").textContent    = total;
  document.getElementById("kpi-phishing").textContent  = phishing;
  document.getElementById("kpi-safe").textContent      = safe;
  document.getElementById("kpi-suspect").textContent   = suspect;

  // Bar chart (7 derniers jours)
  renderBarChart(history);

  // Dernière analyse
  renderLastAnalysis(history);
}

function renderBarChart(history) {
  const container = document.getElementById("bar-chart");
  container.innerHTML = "";

  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const today = new Date().getDay(); // 0=Dim, 1=Lun…

  // Réordonner pour que le dernier jour soit aujourd'hui
  const ordered = [];
  for (let i = 6; i >= 0; i--) {
    const d = (today - i + 7) % 7;
    ordered.push(days[d]);
  }

  // Grouper les entrées par jour de la semaine (limité à 7 jours)
  const buckets = ordered.map((day, idx) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - (6 - idx));
    const dateStr = targetDate.toDateString();
    const dayEntries = history.filter(e => {
      const entryDate = new Date(e.timestamp);
      return entryDate.toDateString() === dateStr;
    });
    return {
      day,
      safe:     dayEntries.filter(e => e.status === "SECURISE").length,
      phishing: dayEntries.filter(e => e.status === "PHISHING" || e.status?.startsWith("SUSPECT")).length,
    };
  });

  const maxVal = Math.max(1, ...buckets.map(b => b.safe + b.phishing));

  buckets.forEach(bucket => {
    const safeH    = Math.round((bucket.safe    / maxVal) * 100);
    const phishingH = Math.round((bucket.phishing / maxVal) * 100);

    const col = document.createElement("div");
    col.className = "bar-chart__col";

    col.innerHTML = `
      <div class="bar-chart__bars">
        ${safeH > 0 ? `<div class="bar-chart__bar bar-chart__bar--primary" style="height:${safeH}%"></div>` : ''}
        ${phishingH > 0 ? `<div class="bar-chart__bar bar-chart__bar--danger" style="height:${phishingH}%"></div>` : ''}
      </div>
      <span class="bar-chart__label">${escapeHtml(bucket.day)}</span>
    `;
    container.appendChild(col);
  });
}

function renderLastAnalysis(history) {
  const el = document.getElementById("last-analysis");
  if (history.length === 0) {
    el.innerHTML = `<p class="empty-state">Aucune analyse effectuée pour l'instant.</p>`;
    return;
  }

  const last = history[history.length - 1];
  const pill = statusToPill(last.status);
  const time = last.timestamp
    ? new Date(last.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  el.innerHTML = `
    <div class="last-analysis-result">
      <span class="last-analysis-result__subject">${escapeHtml((last.subject || "Sujet inconnu").substring(0, 55))}</span>
      ${pill}
      <span class="last-analysis-result__meta">${time}</span>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// PAGE : HISTORY
// ══════════════════════════════════════════════════════════════
async function loadHistory() {
  const history = (await store.get(STORAGE_HISTORY)) || [];
  renderHistoryTable(history);

  document.getElementById("btn-clear-history").onclick = async () => {
    if (confirm("Supprimer tout l'historique ?")) {
      await store.set(STORAGE_HISTORY, []);
      renderHistoryTable([]);
      // Refresh overview KPIs
      await loadOverview();
    }
  };
}

function renderHistoryTable(history) {
  const tbody = document.getElementById("history-tbody");

  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Aucune analyse dans l'historique.</td></tr>`;
    return;
  }

  // Afficher du plus récent au plus ancien
  const sorted = [...history].reverse();

  tbody.innerHTML = sorted.map(entry => {
    const time    = entry.timestamp
      ? new Date(entry.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      : "—";
    const subject = escapeHtml((entry.subject || "—").substring(0, 40));
    const score   = typeof entry.score === "number" ? entry.score.toFixed(4) : "—";
    const percent = typeof entry.percent === "number" ? entry.percent : 50;
    const pill    = statusToPill(entry.status);

    return `
      <tr>
        <td>${time}</td>
        <td title="${escapeHtml(entry.subject || '')}">${subject}</td>
        <td><span class="score-mono">${score}</span></td>
        <td>
          <div class="mini-risk">
            <div class="mini-risk__track">
              <div class="mini-risk__fill" style="width:${percent}%"></div>
            </div>
            <span class="mini-risk__label">${Math.round(percent)}/100</span>
          </div>
        </td>
        <td>${pill}</td>
      </tr>
    `;
  }).join("");
}

// ══════════════════════════════════════════════════════════════
// PAGE : SETTINGS
// ══════════════════════════════════════════════════════════════
async function loadSettings() {
  await loadThemeSettings();
  await loadShortcutSettings();
  await loadThresholdSettings();

  document.getElementById("btn-reset-all").onclick = async () => {
    if (confirm("Réinitialiser toutes les données CyberShield ?")) {
      await store.set(STORAGE_HISTORY,   []);
      await store.set(STORAGE_THEME,     "blue");
      await store.set(STORAGE_SHORTCUT,  "P");
      await store.set(STORAGE_THRESHOLD, 1.0);
      await loadSettings();
      applyTheme("blue");
    }
  };
}

// ── Thème ────────────────────────────────────────────────────
async function loadThemeSettings() {
  const saved = (await store.get(STORAGE_THEME)) || "blue";
  applyTheme(saved);

  document.querySelectorAll(".theme-swatch").forEach(btn => {
    btn.classList.remove("theme-swatch--active");
    if (btn.dataset.theme === saved) btn.classList.add("theme-swatch--active");

    btn.onclick = async () => {
      const theme = btn.dataset.theme;
      await store.set(STORAGE_THEME, theme);
      applyTheme(theme);
      document.querySelectorAll(".theme-swatch").forEach(b => b.classList.remove("theme-swatch--active"));
      btn.classList.add("theme-swatch--active");
    };
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

async function applyThemeFromStorage() {
  const saved = (await store.get(STORAGE_THEME)) || "blue";
  applyTheme(saved);
}

// ── Raccourci ────────────────────────────────────────────────
async function loadShortcutSettings() {
  const saved = (await store.get(STORAGE_SHORTCUT)) || "P";
  document.getElementById("shortcut-key-display").textContent = saved.toUpperCase();

  const btnRecord     = document.getElementById("btn-record-shortcut");
  const recordingZone = document.getElementById("shortcut-recording");
  let isRecording     = false;

  btnRecord.onclick = () => {
    isRecording = true;
    recordingZone.classList.remove("hidden");
    btnRecord.disabled = true;

    const onKey = async (e) => {
      e.preventDefault();
      const key = e.key.toUpperCase();
      // Accepter seulement les lettres A–Z et chiffres 0–9
      if (/^[A-Z0-9]$/.test(key)) {
        await store.set(STORAGE_SHORTCUT, key);
        document.getElementById("shortcut-key-display").textContent = key;
        recordingZone.classList.add("hidden");
        btnRecord.disabled = false;
        isRecording = false;
        document.removeEventListener("keydown", onKey);
      }
    };

    document.addEventListener("keydown", onKey);

    // Timeout 5s
    setTimeout(() => {
      if (isRecording) {
        recordingZone.classList.add("hidden");
        btnRecord.disabled = false;
        isRecording = false;
        document.removeEventListener("keydown", onKey);
      }
    }, 5000);
  };
}

// ── Seuil ────────────────────────────────────────────────────
async function loadThresholdSettings() {
  const saved = (await store.get(STORAGE_THRESHOLD)) ?? 1.0;
  const slider = document.getElementById("threshold-slider");
  const display = document.getElementById("threshold-value");

  slider.value   = saved;
  display.textContent = parseFloat(saved).toFixed(1);

  slider.addEventListener("input", async () => {
    const val = parseFloat(slider.value);
    display.textContent = val.toFixed(1);
    await store.set(STORAGE_THRESHOLD, val);
  });
}

// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════
function statusToPill(status) {
  const map = {
    "PHISHING":       { cls: "danger", label: "PHISHING" },
    "SUSPECT_HAUT":   { cls: "warn",   label: "SUSPECT ↑" },
    "SUSPECT_FAIBLE": { cls: "warn",   label: "SUSPECT ↓" },
    "SECURISE":       { cls: "safe",   label: "SÉCURISÉ" },
  };
  const cfg = map[status] || { cls: "warn", label: status || "INCONNU" };
  return `<span class="pill pill--${cfg.cls}">${cfg.label}</span>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Normalize score SVM → percent (copie de popup.js) ────────
function scoreToPercent(score) {
  return Math.min(100, Math.max(0, ((score + 3) / 6) * 100));
}
