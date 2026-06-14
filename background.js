/* Utiq Detector — Service Worker (MV3, Chrome + Firefox) */

// Shim cross-browser : Firefox expose `browser` (Promise), Chrome `chrome`.
const api = (typeof browser !== 'undefined') ? browser : chrome;

const LIST_URL      = 'https://utiq-tracker.online/api/v1/sites.json';
const LIST_FALLBACK = 'https://raw.githubusercontent.com/CedHaurus/utiq-tracker/main/data/utiq-sites.json';
const TRACKER_URL   = 'https://utiq-tracker.online';
const OPTOUT_URL    = 'https://utiq-tracker.online/opt-out';
const REPORT_URL    = 'https://utiq-tracker.online/api/v1/report';
const CACHE_KEY     = 'utiq_list_cache';
const REPORTED_KEY  = 'reported_domains';
const CACHE_TTL     = 6 * 60 * 60 * 1000; // 6h

// URLs réseau (couche 3) qui trahissent Utiq.
const NET_PATTERNS = [
  'utiq-aws.net',
  'utiqLoader',
  'utiqConsentManager',
  'utiqManagePage',
  'frontend.prod.utiq',
  'adtechservices.de'
];

// Domaines de l'extension elle-même : jamais flaggés (site source + son opt-out).
const SELF_HOSTS = ['utiq-tracker.online'];
function isSelfHost(host) {
  host = (host || '').toLowerCase();
  return SELF_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// État en mémoire (perdu si le SW s'arrête — on le reconstruit à la navigation).
const tabStates = {}; // { [tabId]: 'unknown' | 'detected' | 'detected_net' | 'clean' }
const tabMeta   = {}; // { [tabId]: { inList: bool, detectedBy: string|null } }

const ICONS = {
  detected: {
    16: 'icons/icon-red-16.png',
    32: 'icons/icon-red-32.png',
    48: 'icons/icon-red-48.png',
    128: 'icons/icon-red-128.png'
  },
  detected_net: {
    16: 'icons/icon-red-16.png',
    32: 'icons/icon-red-32.png',
    48: 'icons/icon-red-48.png',
    128: 'icons/icon-red-128.png'
  },
  clean: {
    16: 'icons/icon-green-16.png',
    32: 'icons/icon-green-32.png',
    48: 'icons/icon-green-48.png',
    128: 'icons/icon-green-128.png'
  },
  unknown: {
    16: 'icons/icon-gray-16.png',
    32: 'icons/icon-gray-32.png',
    48: 'icons/icon-gray-48.png',
    128: 'icons/icon-gray-128.png'
  }
};

/* ---------- Liste centralisée (couche 1) ---------- */

async function fetchList() {
  for (const url of [LIST_URL, LIST_FALLBACK]) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data = await res.json();
      const sites = data.sites || data; // sites.json -> {sites:[]}, fallback -> []
      if (Array.isArray(sites) && sites.length) return sites;
    } catch (e) {
      // on tente l'URL suivante
    }
  }
  return null;
}

async function refreshList() {
  const sites = await fetchList();
  if (!sites) return null;
  const domains = sites
    .map(s => (typeof s === 'string' ? s : s.domain))
    .filter(Boolean)
    .map(d => d.toLowerCase());
  const cache = { domains, timestamp: Date.now(), count: domains.length };
  await api.storage.local.set({ [CACHE_KEY]: cache });
  return cache;
}

async function getCachedDomains() {
  const result = await api.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY];
  if (!cache || !Array.isArray(cache.domains)) {
    const fresh = await refreshList();
    return fresh ? fresh.domains : [];
  }
  // Périmé -> on rafraîchit en arrière-plan mais on répond avec le cache.
  if (Date.now() - cache.timestamp > CACHE_TTL) {
    refreshList();
  }
  return cache.domains;
}

// Teste le hostname et ses parents : www.lemonde.fr -> lemonde.fr.
function isKnownDomain(hostname, domains) {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const set = new Set(domains);
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (set.has(candidate)) return true;
  }
  return false;
}

/* ---------- Gestion des onglets / icône ---------- */

function setTabState(tabId, state) {
  tabStates[tabId] = state;
  const path = ICONS[state] || ICONS.unknown;
  try {
    api.action.setIcon({ tabId, path });
  } catch (e) {
    // l'onglet peut avoir disparu
  }
  // Badge "!" rouge pour attirer l'attention quand Utiq est détecté.
  try {
    const detected = (state === 'detected' || state === 'detected_net');
    api.action.setBadgeText({ tabId, text: detected ? '!' : '' });
    if (detected) api.action.setBadgeBackgroundColor({ tabId, color: '#e03030' });
  } catch (e) {}
}

function sendToTab(tabId, message) {
  try {
    const p = api.tabs.sendMessage(tabId, message);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    // pas de content script sur cet onglet (page interne, etc.)
  }
}

async function checkTabByUrl(tabId, url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    return;
  }

  // Reset meta pour la nouvelle navigation.
  tabMeta[tabId] = { inList: false, detectedBy: null };

  // Notre propre site : toujours considéré comme propre, jamais analysé.
  if (isSelfHost(hostname)) {
    setTabState(tabId, 'clean');
    return;
  }

  // Icône grise par défaut, en attendant l'analyse.
  setTabState(tabId, 'unknown');

  const domains = await getCachedDomains();
  if (isKnownDomain(hostname, domains)) {
    tabMeta[tabId].inList = true;
    setTabState(tabId, 'detected');
    // Pas de toast : juste signaler au content script qu'il est déjà listé.
    sendToTab(tabId, { action: 'already_in_list' });
  }
}

/* ---------- Signalement (couche communautaire) ---------- */

async function submitReport(domain, detectedBy) {
  const result = await api.storage.local.get(REPORTED_KEY);
  const reported = result[REPORTED_KEY] || [];
  if (reported.includes(domain)) return { status: 'already_reported' };

  const manifest = api.runtime.getManifest();
  // detected_by doit matcher ^[a-z0-9_]{1,32}$ côté serveur, sinon -> "unknown".
  const detected = /^[a-z0-9_]{1,32}$/.test(detectedBy || '') ? detectedBy : 'unknown';

  // Timeout 5 s pour gérer le hors-ligne / serveur lent sans bloquer l'UI.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain,
        detected_by: detected,
        extension_version: manifest.version
      }),
      signal: controller.signal
    });
    // 429 renvoie status:"invalid" côté serveur -> on le distingue pour l'UI.
    if (res.status === 429) return { status: 'rate_limited' };
    let data;
    try { data = await res.json(); } catch (e) { return { status: 'error' }; }
    if (['ok', 'pending', 'known'].includes(data.status)) {
      await api.storage.local.set({ [REPORTED_KEY]: [...reported, domain] });
    }
    return data; // peut contenir status:"invalid"
  } catch (e) {
    return { status: 'error' }; // réseau / timeout / hors-ligne
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Listeners ---------- */

api.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  checkTabByUrl(details.tabId, details.url);
});

api.tabs.onRemoved.addListener((tabId) => {
  delete tabStates[tabId];
  delete tabMeta[tabId];
});

// Couche 3 — réseau, lecture seule (pas de "blocking" en MV3).
api.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url || '';
    if (!NET_PATTERNS.some(p => url.includes(p))) return;
    const tabId = details.tabId;
    if (tabId < 0) return;
    // Ignorer les requêtes initiées par notre propre site.
    const origin = details.initiator || details.originUrl || details.documentUrl || '';
    try { if (origin && isSelfHost(new URL(origin).hostname)) return; } catch (e) {}
    if (tabStates[tabId] === 'detected') return; // déjà rouge via la liste
    if (!tabMeta[tabId]) tabMeta[tabId] = { inList: false, detectedBy: null };
    tabMeta[tabId].detectedBy = 'network';
    setTabState(tabId, 'detected_net');
    sendToTab(tabId, { action: 'utiq_network_detected' });
  },
  { urls: ['<all_urls>'] }
);

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Pour get_state/get_config le tabId vient du sender (content) ou est résolu côté popup.
  const senderTabId = sender.tab ? sender.tab.id : null;

  switch (msg.action) {
    case 'utiq_dom_detected': {
      if (senderTabId == null) break;
      if (tabStates[senderTabId] !== 'detected') {
        setTabState(senderTabId, 'detected');
      }
      if (!tabMeta[senderTabId]) tabMeta[senderTabId] = { inList: false, detectedBy: null };
      tabMeta[senderTabId].detectedBy = msg.reason || 'dom';
      break;
    }

    case 'utiq_dom_clean': {
      if (senderTabId == null) break;
      // Ne pas écraser une détection réseau/liste.
      if (tabStates[senderTabId] === 'unknown' || tabStates[senderTabId] === undefined) {
        setTabState(senderTabId, 'clean');
      }
      break;
    }

    case 'get_state': {
      // Le popup n'a pas de sender.tab : il fournit son tabId, sinon on prend le sender.
      const tabId = (msg.tabId != null) ? msg.tabId : senderTabId;
      sendResponse({
        state: tabStates[tabId] || 'unknown',
        meta: tabMeta[tabId] || { inList: false, detectedBy: null }
      });
      return true;
    }

    case 'get_config': {
      sendResponse({ trackerUrl: TRACKER_URL, optoutUrl: OPTOUT_URL });
      return true;
    }

    case 'submit_report': {
      submitReport(msg.domain, msg.detectedBy).then(sendResponse);
      return true; // réponse asynchrone
    }
  }
});

// Alarme de rafraîchissement périodique (toutes les 6h).
api.alarms.create('refresh_list', { periodInMinutes: 360 });
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh_list') refreshList();
});

// Init : si pas de cache, on récupère la liste tout de suite.
(async () => {
  const result = await api.storage.local.get(CACHE_KEY);
  if (!result[CACHE_KEY]) await refreshList();
})();
