/* Utiq Detector — Content Script (layer 2: DOM scan) */

const api = (typeof browser !== 'undefined') ? browser : chrome;

let detected      = false;
let reportedClean = false;
let inList        = false;   // site already present in the centralized list
let toastShown    = false;
let detectedBy    = 'unknown';

// Candidate domain for reporting (lowercase, without www.).
const reportDomain = (location.hostname || '').toLowerCase().replace(/^www\./, '');

// Utiq script patterns.
const SCRIPT_PATTERNS = ['utiqLoader', 'utiqConsentManager', 'utiqManagePage'];

// Robust i18n (works in content scripts, but guard it anyway).
function t(key, fallback) {
  try {
    const m = api.i18n.getMessage(key);
    if (m) return m;
  } catch (e) {}
  return fallback;
}

// Promise wrapper around runtime.sendMessage (Chrome callback / Firefox promise).
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

// The extension's own domains: never flagged (source site + its opt-out).
const SELF_HOSTS = ['utiq-tracker.online'];
function isSelfHost(host) {
  host = (host || '').toLowerCase();
  return SELF_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// Same pre-filter as the popup: only offer reporting for a public FQDN.
function isReportableDomain(host) {
  if (!host) return false;
  if (host.length < 5) return false;
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (host.includes(':')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host);
}

/* ---------- Detection functions ---------- */

function checkScripts() {
  const scripts = document.querySelectorAll('script[src]');
  for (const s of scripts) {
    const src = s.src || '';
    for (const p of SCRIPT_PATTERNS) {
      if (src.includes(p)) return { found: true, reason: 'script_src', detail: p };
    }
    // CNAME cloaking: the script hostname starts with "utiq.".
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

/* --- STRONG signals: specific to a Utiq integration, trigger on their own --- */

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
  // Selectors specific to the Utiq INTEGRATION (not just a link quoted in an article).
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

/* --- WEAK signals: generic / ambiguous. AT LEAST TWO are required to flag,
       so a blog/article merely talking about Utiq is not caught. --- */

function checkConsentHubLink() {
  // An article may quote this link without using Utiq -> weak signal.
  try {
    if (document.querySelector('a[href*="consenthub.utiq.com"]')) {
      return { found: true, reason: 'consenthub_link', detail: 'consenthub.utiq.com' };
    }
  } catch (e) {}
  return { found: false };
}

function checkLocalStorageWeak() {
  // mtid / atid are generic names -> weak without corroboration.
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
  // 1) A single strong signal is enough.
  const strong = [
    checkScripts, checkGlobalVars,
    checkLocalStorageStrong, checkCookiesStrong, checkDOMStrong
  ];
  for (const fn of strong) {
    const r = fn();
    if (r.found) return r;
  }
  // 2) Otherwise, at least TWO concurring weak signals are required.
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

/* ---------- Reporting to the background ---------- */

function reportDetected(reason, detail) {
  detected = true;
  detectedBy = reason || detectedBy;
  try {
    api.runtime.sendMessage({ action: 'utiq_dom_detected', reason, detail });
  } catch (e) {}
  // Warn the user in every detection case (list, DOM, network).
  showToast();
}

function reportClean() {
  if (detected || reportedClean) return;
  reportedClean = true;
  try {
    api.runtime.sendMessage({ action: 'utiq_dom_clean' });
  } catch (e) {}
}

/* ---------- In-page toast ---------- */

// Wire reporting directly onto the toast button.
function attachToastReport(toast, btn, feedback) {
  btn.addEventListener('click', async () => {
    clearTimeout(toast._utiqTimer); // do not auto-close during the action
    btn.disabled = true;
    btn.textContent = t('popupReporting', 'Sending…');

    const res = await sendBg({ action: 'submit_report', domain: reportDomain, detectedBy });

    btn.style.display = 'none';
    feedback.style.display = 'block';
    let reopen = false;
    switch (res && res.status) {
      case 'ok':
      case 'pending':
        feedback.textContent = t('popupReported', '✓ Thanks! This site will soon be added to the list.');
        feedback.style.color = '#7cffb0';
        break;
      case 'known':
      case 'already_reported':
        feedback.textContent = t('popupKnown', '✓ This site is already being added.');
        feedback.style.color = '#7cffb0';
        break;
      case 'invalid':
        feedback.textContent = t('popupReportInvalid', "This site can't be reported.");
        feedback.style.color = '#ff9b9b';
        break;
      case 'rate_limited':
        feedback.textContent = t('popupReportRateLimited', 'Too many reports, try again later.');
        feedback.style.color = '#ff9b9b';
        break;
      default:
        feedback.textContent = t('popupReportError', 'Error, please try again in a moment.');
        feedback.style.color = '#ff9b9b';
        reopen = true; // network error: allow a retry
    }
    if (reopen) {
      btn.style.display = 'block';
      btn.disabled = false;
      btn.textContent = t('popupReportBtn', 'Report this site');
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
  title.textContent = t('toastTitle', 'This site uses Utiq');
  title.style.cssText = 'font-weight:600;margin-bottom:4px';

  const link = document.createElement('a');
  link.href = trackerUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = t('toastLink', 'Learn more →');
  link.style.cssText = 'color:#ff8a4c;text-decoration:none;font-size:12px;display:inline-block';

  const close = document.createElement('button');
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.style.cssText = [
    'flex:0 0 auto', 'background:none', 'border:none',
    'color:#999', 'font-size:18px', 'line-height:1',
    'cursor:pointer', 'padding:0', 'margin-left:4px'
  ].join(';');
  close.addEventListener('click', () => { clearTimeout(toast._utiqTimer); toast.remove(); });

  body.appendChild(title);
  body.appendChild(link);

  // Inline report button (site detected but not in the list) -> visible without opening the popup.
  if (opts.canReport) {
    const prompt = document.createElement('div');
    prompt.textContent = '🔍 ' + t('toastReportPrompt', "This site isn't listed yet.");
    prompt.style.cssText = 'font-size:12px;color:#cfcfcf;margin-top:8px';

    const btn = document.createElement('button');
    btn.textContent = t('popupReportBtn', 'Report this site');
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
  if (isSelfHost(location.hostname)) return; // never warn on our own site
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
    // More time when an action is offered; the click cancels this auto-close.
    toast._utiqTimer = setTimeout(() => toast.remove(), info.canReport ? 20000 : 8000);
  };

  // Config + state + already-reported domains + already-warned domains (anti-spam).
  Promise.all([
    sendBg({ action: 'get_config' }),
    sendBg({ action: 'get_state' }),
    storageGet('reported_domains'),
    storageGet('warned_domains')
  ]).then(([cfg, st, repCache, warnCache]) => {
    const host = (location.hostname || '').toLowerCase();
    const warned = (warnCache && warnCache['warned_domains']) || [];
    // Already warned for this domain -> stop showing the toast (the red icon is enough).
    if (warned.includes(host)) { settled = true; return; }

    const meta = (st && st.meta) || {};
    if (meta.inList) inList = true;
    if (meta.detectedBy) detectedBy = meta.detectedBy;
    const reported = (repCache && repCache['reported_domains']) || [];
    const canReport = !inList && isReportableDomain(reportDomain) && !reported.includes(reportDomain);

    render({ trackerUrl: cfg && cfg.trackerUrl, canReport });
    // Remember the warning so it is not shown again on every page.
    try { api.storage.local.set({ warned_domains: [...warned, host] }); } catch (e) {}
  }).catch(() => render(null));

  // Safety net if the background is slow (plain toast, no button).
  setTimeout(() => render(null), 2500);
}

/* ---------- MutationObserver (late-injected scripts) ---------- */

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

/* ---------- Messages from the background ---------- */

api.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.action) return;
  if (msg.action === 'already_in_list') {
    inList = true;
    detected = true;
    showToast(); // the site is known: still warn the user
  } else if (msg.action === 'utiq_network_detected') {
    detected = true;
    if (!detectedBy || detectedBy === 'unknown') detectedBy = 'network';
    showToast();
  }
});

/* ---------- Init ---------- */

// List/network detection may happen before this script is ready
// (the pushed message is then lost) -> query the background on startup.
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
  // Our own site (and its opt-out) is never analysed nor flagged.
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
