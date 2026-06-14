/* Utiq Detector — Content Script (couche 2 : scan DOM) */

const api = (typeof browser !== 'undefined') ? browser : chrome;

let detected      = false;
let reportedClean = false;
let inList        = false;   // site déjà présent dans la liste centralisée
let toastShown    = false;
let detectedBy    = 'unknown';

// Domaine candidat au signalement (minuscules, sans www.).
const reportDomain = (location.hostname || '').toLowerCase().replace(/^www\./, '');

// Patterns de scripts Utiq.
const SCRIPT_PATTERNS = ['utiqLoader', 'utiqConsentManager', 'utiqManagePage'];

// i18n robuste (fonctionne dans les content scripts, mais on protège).
function t(key, fallback) {
  try {
    const m = api.i18n.getMessage(key);
    if (m) return m;
  } catch (e) {}
  return fallback;
}

// Promesse autour de runtime.sendMessage (compat Chrome callback / Firefox promise).
function sendBg(message) {
  return new Promise((resolve) => {
    try {
      const p = api.runtime.sendMessage(message, resolve);
      if (p && typeof p.then === 'function') p.then(resolve).catch(() => resolve(null));
    } catch (e) { resolve(null); }
  });
}

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      const p = api.storage.local.get(key, resolve);
      if (p && typeof p.then === 'function') p.then(resolve).catch(() => resolve({}));
    } catch (e) { resolve({}); }
  });
}

// Domaines de l'extension elle-même : jamais flaggés (site source + son opt-out).
const SELF_HOSTS = ['utiq-tracker.online'];
function isSelfHost(host) {
  host = (host || '').toLowerCase();
  return SELF_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// Même pré-filtre que le popup : ne proposer le signalement que pour un FQDN public.
function isReportableDomain(host) {
  if (!host) return false;
  if (host.length < 5) return false;
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (host.includes(':')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host);
}

/* ---------- Fonctions de détection ---------- */

function checkScripts() {
  const scripts = document.querySelectorAll('script[src]');
  for (const s of scripts) {
    const src = s.src || '';
    for (const p of SCRIPT_PATTERNS) {
      if (src.includes(p)) return { found: true, reason: 'script_src', detail: p };
    }
    // CNAME cloaking : hostname du script commence par "utiq."
    try {
      const host = new URL(src).hostname;
      if (/^utiq\./i.test(host)) return { found: true, reason: 'cname', detail: host };
    } catch (e) {}
  }
  return { found: false };
}

function checkGlobalVars() {
  try {
    if (typeof window.Utiq !== 'undefined') {
      return { found: true, reason: 'global_var', detail: 'window.Utiq' };
    }
  } catch (e) {}
  return { found: false };
}

/* --- Signaux FORTS : propres à une intégration Utiq, déclenchent seuls --- */

function checkLocalStorageStrong() {
  try {
    if (localStorage.getItem('utiqPass') !== null) {
      return { found: true, reason: 'localstorage', detail: 'utiqPass' };
    }
  } catch (e) {}
  return { found: false };
}

function checkCookiesStrong() {
  try {
    if ((document.cookie || '').includes('utiqPass')) {
      return { found: true, reason: 'cookie', detail: 'utiqPass' };
    }
  } catch (e) {}
  return { found: false };
}

function checkDOMStrong() {
  // Sélecteurs de l'INTÉGRATION Utiq (pas un simple lien cité dans un article).
  const selectors = ['[data-utiq]', '#utiq-consent', '#utiq-manage-page', '.utiq-popup'];
  for (const sel of selectors) {
    try {
      if (document.querySelector(sel)) {
        return { found: true, reason: 'dom_selector', detail: sel };
      }
    } catch (e) {}
  }
  return { found: false };
}

/* --- Signaux FAIBLES : génériques / ambigus. Il en faut AU MOINS DEUX pour
       flagger, afin de ne pas piéger un blog/article qui parle d'Utiq. --- */

function checkConsentHubLink() {
  // Un article peut citer ce lien sans utiliser Utiq -> signal faible.
  try {
    if (document.querySelector('a[href*="consenthub.utiq.com"]')) {
      return { found: true, reason: 'consenthub_link', detail: 'consenthub.utiq.com' };
    }
  } catch (e) {}
  return { found: false };
}

function checkLocalStorageWeak() {
  // mtid / atid sont des noms génériques -> faible hors corroboration.
  try {
    for (const k of ['mtid', 'atid']) {
      if (localStorage.getItem(k) !== null) {
        return { found: true, reason: 'localstorage_weak', detail: k };
      }
    }
  } catch (e) {}
  return { found: false };
}

function checkCookiesWeak() {
  try {
    if ((document.cookie || '').includes('utiq_')) {
      return { found: true, reason: 'cookie_weak', detail: 'utiq_' };
    }
  } catch (e) {}
  return { found: false };
}

function checkFooterText() {
  const needles = [
    'manage utiq', 'gérer utiq', 'utiq verwalten',
    'gestionar utiq', 'gestisci utiq', 'zarządzaj utiq'
  ];
  const containers = document.querySelectorAll(
    'footer, [role="contentinfo"], .footer, #footer'
  );
  for (const el of containers) {
    const text = (el.innerText || el.textContent || '').toLowerCase();
    if (!text) continue;
    for (const n of needles) {
      if (text.includes(n)) return { found: true, reason: 'footer_text', detail: n };
    }
  }
  return { found: false };
}

function runAllChecks() {
  // 1) Un seul signal fort suffit.
  const strong = [
    checkScripts, checkGlobalVars,
    checkLocalStorageStrong, checkCookiesStrong, checkDOMStrong
  ];
  for (const fn of strong) {
    const r = fn();
    if (r.found) return r;
  }
  // 2) Sinon, il faut au moins DEUX signaux faibles concordants.
  const weak = [checkConsentHubLink, checkFooterText, checkLocalStorageWeak, checkCookiesWeak];
  const hits = [];
  for (const fn of weak) {
    const r = fn();
    if (r.found) hits.push(r);
  }
  if (hits.length >= 2) {
    return { found: true, reason: hits[0].reason, detail: 'weak:' + hits.map(h => h.reason).join('+') };
  }
  return { found: false };
}

/* ---------- Reporting au background ---------- */

function reportDetected(reason, detail) {
  detected = true;
  detectedBy = reason || detectedBy;
  try {
    api.runtime.sendMessage({ action: 'utiq_dom_detected', reason, detail });
  } catch (e) {}
  // Avertir l'utilisateur dans tous les cas de détection (liste, DOM, réseau).
  showToast();
}

function reportClean() {
  if (detected || reportedClean) return;
  reportedClean = true;
  try {
    api.runtime.sendMessage({ action: 'utiq_dom_clean' });
  } catch (e) {}
}

/* ---------- Toast in-page ---------- */

// Branche le signalement directement sur le bouton du toast.
function attachToastReport(toast, btn, feedback) {
  btn.addEventListener('click', async () => {
    clearTimeout(toast._utiqTimer); // ne pas refermer pendant l'action
    btn.disabled = true;
    btn.textContent = t('popupReporting', 'Envoi…');

    const res = await sendBg({ action: 'submit_report', domain: reportDomain, detectedBy });

    btn.style.display = 'none';
    feedback.style.display = 'block';
    let reopen = false;
    switch (res && res.status) {
      case 'ok':
      case 'pending':
        feedback.textContent = t('popupReported', '✓ Merci ! Ce site sera bientôt ajouté à la liste.');
        feedback.style.color = '#7cffb0';
        break;
      case 'known':
      case 'already_reported':
        feedback.textContent = t('popupKnown', '✓ Ce site est déjà en cours d\'ajout.');
        feedback.style.color = '#7cffb0';
        break;
      case 'invalid':
        feedback.textContent = t('popupReportInvalid', 'Ce site ne peut pas être signalé.');
        feedback.style.color = '#ff9b9b';
        break;
      case 'rate_limited':
        feedback.textContent = t('popupReportRateLimited', 'Trop de signalements, réessaie plus tard.');
        feedback.style.color = '#ff9b9b';
        break;
      default:
        feedback.textContent = t('popupReportError', 'Erreur, réessaie dans quelques instants.');
        feedback.style.color = '#ff9b9b';
        reopen = true; // erreur réseau : on autorise une nouvelle tentative
    }
    if (reopen) {
      btn.style.display = 'block';
      btn.disabled = false;
      btn.textContent = t('popupReportBtn', 'Signaler ce site');
    } else {
      toast._utiqTimer = setTimeout(() => toast.remove(), 6000);
    }
  });
}

function buildToast(opts) {
  opts = opts || {};
  const trackerUrl = opts.trackerUrl || 'https://utiq-tracker.online';

  const toast = document.createElement('div');
  toast.id = '_utiq_det_toast';
  toast.style.cssText = [
    'position:fixed', 'bottom:20px', 'right:20px',
    'z-index:2147483647',
    'max-width:280px',
    'background:#1a1a1a', 'color:#f2f2f2',
    'border-left:4px solid #e03030', 'border-radius:10px',
    'padding:14px 16px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.35)',
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    'font-size:13px', 'line-height:1.45'
  ].join(';');

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:flex-start;gap:10px';

  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  icon.style.cssText = 'font-size:18px;flex:0 0 auto;line-height:1';

  const body = document.createElement('div');
  body.style.cssText = 'flex:1 1 auto';

  const title = document.createElement('div');
  title.textContent = t('toastTitle', 'Ce site utilise Utiq');
  title.style.cssText = 'font-weight:600;margin-bottom:4px';

  const link = document.createElement('a');
  link.href = trackerUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = t('toastLink', 'En savoir plus →');
  link.style.cssText = 'color:#ff8a4c;text-decoration:none;font-size:12px;display:inline-block';

  const close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Fermer');
  close.style.cssText = [
    'flex:0 0 auto', 'background:none', 'border:none',
    'color:#999', 'font-size:18px', 'line-height:1',
    'cursor:pointer', 'padding:0', 'margin-left:4px'
  ].join(';');
  close.addEventListener('click', () => { clearTimeout(toast._utiqTimer); toast.remove(); });

  body.appendChild(title);
  body.appendChild(link);

  // Bouton de signalement intégré (site détecté hors liste) -> visible sans ouvrir le popup.
  if (opts.canReport) {
    const prompt = document.createElement('div');
    prompt.textContent = '🔍 ' + t('toastReportPrompt', 'Ce site n\'est pas encore référencé.');
    prompt.style.cssText = 'font-size:12px;color:#cfcfcf;margin-top:8px';

    const btn = document.createElement('button');
    btn.textContent = t('popupReportBtn', 'Signaler ce site');
    btn.style.cssText = [
      'display:block', 'width:100%', 'margin-top:8px',
      'background:#e8590c', 'color:#fff', 'border:none', 'border-radius:6px',
      'padding:7px 10px', 'font-size:12px', 'font-weight:600', 'cursor:pointer'
    ].join(';');

    const feedback = document.createElement('div');
    feedback.style.cssText = 'display:none;font-size:12px;margin-top:8px;line-height:1.4';

    body.appendChild(prompt);
    body.appendChild(btn);
    body.appendChild(feedback);
    attachToastReport(toast, btn, feedback);
  }

  row.appendChild(icon);
  row.appendChild(body);
  row.appendChild(close);
  toast.appendChild(row);
  return toast;
}

function showToast() {
  if (isSelfHost(location.hostname)) return; // ne jamais alerter sur notre propre site
  if (toastShown || document.getElementById('_utiq_det_toast')) return;
  if (!document.body) return;
  toastShown = true;

  let settled = false;
  const render = (info) => {
    if (settled) return;
    settled = true;
    info = info || {};
    const toast = buildToast(info);
    document.body.appendChild(toast);
    // Plus de temps si une action est proposée ; le clic annule cette fermeture.
    toast._utiqTimer = setTimeout(() => toast.remove(), info.canReport ? 20000 : 8000);
  };

  // Config + état + domaines déjà signalés + domaines déjà avertis (anti-spam).
  Promise.all([
    sendBg({ action: 'get_config' }),
    sendBg({ action: 'get_state' }),
    storageGet('reported_domains'),
    storageGet('warned_domains')
  ]).then(([cfg, st, repCache, warnCache]) => {
    const host = (location.hostname || '').toLowerCase();
    const warned = (warnCache && warnCache['warned_domains']) || [];
    // Déjà averti pour ce domaine -> on n'affiche plus le toast (l'icône rouge suffit).
    if (warned.includes(host)) { settled = true; return; }

    const meta = (st && st.meta) || {};
    if (meta.inList) inList = true;
    if (meta.detectedBy) detectedBy = meta.detectedBy;
    const reported = (repCache && repCache['reported_domains']) || [];
    const canReport = !inList && isReportableDomain(reportDomain) && !reported.includes(reportDomain);

    render({ trackerUrl: cfg && cfg.trackerUrl, canReport });
    // Mémoriser l'avertissement pour ne plus le réafficher à chaque page.
    try { api.storage.local.set({ warned_domains: [...warned, host] }); } catch (e) {}
  }).catch(() => render(null));

  // Filet de sécurité si le background tarde (toast simple, sans bouton).
  setTimeout(() => render(null), 2500);
}

/* ---------- MutationObserver (scripts injectés tardivement) ---------- */

function observeDOM() {
  let observer;
  const onNode = (node) => {
    if (node.nodeType !== 1 || node.tagName !== 'SCRIPT') return;
    const src = node.src || '';
    if (!src) return;
    for (const p of SCRIPT_PATTERNS) {
      if (src.includes(p)) { reportDetected('script_src', p); return; }
    }
    try {
      const host = new URL(src).hostname;
      if (/^utiq\./i.test(host)) reportDetected('cname', host);
    } catch (e) {}
  };

  observer = new MutationObserver((mutations) => {
    if (detected) { observer.disconnect(); return; }
    for (const m of mutations) {
      for (const node of m.addedNodes) onNode(node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30000);
}

/* ---------- Messages du background ---------- */

api.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.action) return;
  if (msg.action === 'already_in_list') {
    inList = true;
    detected = true;
    showToast(); // le site est connu : on avertit quand même l'utilisateur
  } else if (msg.action === 'utiq_network_detected') {
    detected = true;
    if (!detectedBy || detectedBy === 'unknown') detectedBy = 'network';
    showToast();
  }
});

/* ---------- Init ---------- */

// La détection via la liste / le réseau peut arriver avant que ce script soit prêt
// (le message poussé est alors perdu) -> on interroge le background au démarrage.
function checkBackgroundState() {
  const handle = (resp) => {
    if (!resp) return;
    const meta = resp.meta || {};
    if (meta.inList) inList = true;
    if (meta.detectedBy) detectedBy = meta.detectedBy;
    if (resp.state === 'detected' || resp.state === 'detected_net') {
      detected = true;
      showToast();
    }
  };
  try {
    const p = api.runtime.sendMessage({ action: 'get_state' }, handle);
    if (p && typeof p.then === 'function') p.then(handle).catch(() => {});
  } catch (e) {}
}

function init() {
  // Notre propre site (et son opt-out) n'est jamais analysé ni flaggé.
  if (isSelfHost(location.hostname)) { reportClean(); return; }
  checkBackgroundState();
  const r = runAllChecks();
  if (r.found) { reportDetected(r.reason, r.detail); return; }
  observeDOM();
  setTimeout(() => {
    if (!detected) {
      const r2 = runAllChecks();
      if (r2.found) reportDetected(r2.reason, r2.detail);
      else reportClean();
    }
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
