/* Utiq Detector — Service Worker (MV3, Chrome + Firefox) */

// Cross-browser shim: Firefox exposes `browser` (Promise), Chrome `chrome`.
const api = (typeof browser !== 'undefined') ? browser : chrome;

const LIST_URL      = 'https://utiq-tracker.online/api/v1/sites.json';
const LIST_FALLBACK = 'https://raw.githubusercontent.com/CedHaurus/utiq-tracker/main/data/utiq-sites.json';
const TRACKER_URL   = 'https://utiq-tracker.online';
const OPTOUT_URL    = 'https://utiq-tracker.online/opt-out';
const REPORT_URL    = 'https://utiq-tracker.online/api/v1/report';
const CACHE_KEY     = 'utiq_list_cache';
const REPORTED_KEY  = 'reported_domains';
const BLOCK_KEY     = 'block_enabled'; // Firefox Android: navigation blocking toggle
const CACHE_TTL     = 6 * 60 * 60 * 1000; // 6h

/* ---------- Firefox Android: navigation blocking ---------- */
// On Android the colored toolbar icon is invisible, so the signal becomes an
// active interstitial that blocks navigation to Utiq sites until the user
// chooses to unblock. This whole feature is dormant on desktop / Chrome.
let IS_ANDROID = false;
let blockingEnabled = true;            // default ON on Android, persisted in storage
const sessionAllow = new Set();        // hosts unblocked for this session (in-memory)

function baseDomain(host) {
  return (host || '').toLowerCase().replace(/^www\./, '');
}

function isUnblocked(host) {
  host = (host || '').toLowerCase();
  return sessionAllow.has(host) || sessionAllow.has(baseDomain(host));
}

function interstitialUrl(originalUrl, host) {
  return api.runtime.getURL('blocked/blocked.html')
    + '?url=' + encodeURIComponent(originalUrl || '')
    + '&host=' + encodeURIComponent(host || '');
}

// Reactive block (layers 2/3): the page already started loading when Utiq was
// detected, so we navigate the whole tab to the interstitial.
function maybeBlockTab(tabId, host, pageUrl) {
  if (!IS_ANDROID || !blockingEnabled || tabId == null || tabId < 0) return;
  if (!host || isSelfHost(host) || isUnblocked(host)) return;
  try { api.tabs.update(tabId, { url: interstitialUrl(pageUrl, host) }); } catch (e) {}
}

// Network URLs (layer 3) that reveal Utiq.
const NET_PATTERNS = [
  'utiq-aws.net',
  'utiqLoader',
  'utiqConsentManager',
  'utiqManagePage',
  'frontend.prod.utiq',
  'adtechservices.de'
];

// The extension's own domains: never flagged (source site + its opt-out).
const SELF_HOSTS = ['utiq-tracker.online'];
function isSelfHost(host) {
  host = (host || '').toLowerCase();
  return SELF_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

// In-memory state (lost when the SW stops — rebuilt on navigation).
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

/* ---------- Centralized list (layer 1) ---------- */

async function fetchList() {
  for (const url of [LIST_URL, LIST_FALLBACK]) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const data = await res.json();
      const sites = data.sites || data; // sites.json -> {sites:[]}, fallback -> []
      if (Array.isArray(sites) && sites.length) return sites;
    } catch (e) {
      // try the next URL
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
  // Stale -> refresh in the background but answer with the cache.
  if (Date.now() - cache.timestamp > CACHE_TTL) {
    refreshList();
  }
  return cache.domains;
}

// Test the hostname and its parents: www.lemonde.fr -> lemonde.fr.
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

/* ---------- Tab / icon handling ---------- */

function setTabState(tabId, state) {
  tabStates[tabId] = state;
  const path = ICONS[state] || ICONS.unknown;
  try {
    api.action.setIcon({ tabId, path });
  } catch (e) {
    // the tab may have gone away
  }
  // Red "!" badge to draw attention when Utiq is detected.
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
    // no content script on this tab (internal page, etc.)
  }
}

async function checkTabByUrl(tabId, url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    return;
  }

  // Reset meta for the new navigation.
  tabMeta[tabId] = { inList: false, detectedBy: null, url };

  // Our own site: always treated as clean, never analysed.
  if (isSelfHost(hostname)) {
    setTabState(tabId, 'clean');
    return;
  }

  // Gray icon by default, while waiting for the analysis.
  setTabState(tabId, 'unknown');

  const domains = await getCachedDomains();
  if (isKnownDomain(hostname, domains)) {
    tabMeta[tabId].inList = true;
    setTabState(tabId, 'detected');
    // No toast here: just tell the content script it is already listed.
    sendToTab(tabId, { action: 'already_in_list' });
  }
}

/* ---------- Reporting (community layer) ---------- */

async function submitReport(domain, detectedBy) {
  const result = await api.storage.local.get(REPORTED_KEY);
  const reported = result[REPORTED_KEY] || [];
  if (reported.includes(domain)) return { status: 'already_reported' };

  const manifest = api.runtime.getManifest();
  // detected_by must match ^[a-z0-9_]{1,32}$ server-side, otherwise -> "unknown".
  const detected = /^[a-z0-9_]{1,32}$/.test(detectedBy || '') ? detectedBy : 'unknown';

  // 5s timeout to handle offline / slow server without blocking the UI.
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
    // 429 returns status:"invalid" server-side -> distinguish it for the UI.
    if (res.status === 429) return { status: 'rate_limited' };
    let data;
    try { data = await res.json(); } catch (e) { return { status: 'error' }; }
    if (['ok', 'pending', 'known'].includes(data.status)) {
      await api.storage.local.set({ [REPORTED_KEY]: [...reported, domain] });
    }
    return data; // may contain status:"invalid"
  } catch (e) {
    return { status: 'error' }; // network / timeout / offline
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

// Layer 3 — network, read-only (no "blocking" in MV3).
api.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url || '';
    if (!NET_PATTERNS.some(p => url.includes(p))) return;
    const tabId = details.tabId;
    if (tabId < 0) return;
    // Ignore requests initiated by our own site.
    const origin = details.initiator || details.originUrl || details.documentUrl || '';
    try { if (origin && isSelfHost(new URL(origin).hostname)) return; } catch (e) {}
    if (tabStates[tabId] === 'detected') return; // already red via the list
    if (!tabMeta[tabId]) tabMeta[tabId] = { inList: false, detectedBy: null };
    tabMeta[tabId].detectedBy = 'network';
    setTabState(tabId, 'detected_net');
    sendToTab(tabId, { action: 'utiq_network_detected' });
    // Android: reactive block (the page is already loading).
    const pageUrl = tabMeta[tabId].url || '';
    let pageHost = '';
    try { pageHost = new URL(pageUrl).hostname; } catch (e) {}
    maybeBlockTab(tabId, pageHost, pageUrl);
  },
  { urls: ['<all_urls>'] }
);

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // For get_state/get_config the tabId comes from the sender (content) or is resolved by the popup.
  const senderTabId = sender.tab ? sender.tab.id : null;

  switch (msg.action) {
    case 'utiq_dom_detected': {
      if (senderTabId == null) break;
      if (tabStates[senderTabId] !== 'detected') {
        setTabState(senderTabId, 'detected');
      }
      if (!tabMeta[senderTabId]) tabMeta[senderTabId] = { inList: false, detectedBy: null };
      tabMeta[senderTabId].detectedBy = msg.reason || 'dom';
      // Android: reactive block on DOM detection.
      if (sender.tab) {
        let h = '';
        try { h = new URL(sender.tab.url).hostname; } catch (e) {}
        maybeBlockTab(senderTabId, h, sender.tab.url);
      }
      break;
    }

    case 'utiq_dom_clean': {
      if (senderTabId == null) break;
      // Do not overwrite a network/list detection.
      if (tabStates[senderTabId] === 'unknown' || tabStates[senderTabId] === undefined) {
        setTabState(senderTabId, 'clean');
      }
      break;
    }

    case 'get_state': {
      // The popup has no sender.tab: it provides its tabId, otherwise we use the sender.
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
      return true; // asynchronous response
    }

    // ----- Firefox Android: blocking feature -----
    case 'get_settings': {
      sendResponse({ isAndroid: IS_ANDROID, blockingEnabled });
      return true;
    }

    case 'set_blocking': {
      blockingEnabled = !!msg.enabled;
      api.storage.local.set({ [BLOCK_KEY]: blockingEnabled });
      sendResponse({ ok: true, blockingEnabled });
      return true;
    }

    case 'unblock_navigation': {
      // Allow this host for the rest of the session, then let the page load.
      const h = (msg.host || '').toLowerCase();
      if (h) { sessionAllow.add(h); sessionAllow.add(baseDomain(h)); }
      sendResponse({ ok: true });
      return true;
    }
  }
});

// Periodic refresh alarm (every 6h).
api.alarms.create('refresh_list', { periodInMinutes: 360 });
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh_list') refreshList();
});

/* ---------- Firefox Android: pre-emptive blocking listener ---------- */

// Async blocking listener (Firefox supports a Promise return on webRequest).
// Fires for top-level navigations only and blocks Utiq sites known from the
// centralized list *before* the page loads — the clean, pre-emptive case.
async function utiqMainFrameBlocker(details) {
  if (!blockingEnabled || details.type !== 'main_frame' || details.tabId < 0) return {};
  let host;
  try { host = new URL(details.url).hostname.toLowerCase().replace(/\.$/, ''); }
  catch (e) { return {}; }
  if (isSelfHost(host) || isUnblocked(host)) return {};

  const domains = await getCachedDomains();
  if (!isKnownDomain(host, domains)) return {};

  // Cancel the request to the Utiq site and send the tab to the interstitial.
  try { api.tabs.update(details.tabId, { url: interstitialUrl(details.url, host) }); } catch (e) {}
  return { cancel: true };
}

async function initPlatform() {
  try {
    const info = await api.runtime.getPlatformInfo();
    IS_ANDROID = !!(info && info.os === 'android');
  } catch (e) { IS_ANDROID = false; }

  const stored = await api.storage.local.get(BLOCK_KEY);
  if (typeof stored[BLOCK_KEY] === 'boolean') blockingEnabled = stored[BLOCK_KEY];

  // Register the blocking listener only on Android, where webRequestBlocking
  // is granted (Firefox build). No-op everywhere else.
  if (IS_ANDROID) {
    try {
      api.webRequest.onBeforeRequest.addListener(
        utiqMainFrameBlocker,
        { urls: ['<all_urls>'], types: ['main_frame'] },
        ['blocking']
      );
    } catch (e) { /* blocking not available -> feature silently disabled */ }
  }
}
initPlatform();

// Init: if there is no cache, fetch the list right away.
(async () => {
  const result = await api.storage.local.get(CACHE_KEY);
  if (!result[CACHE_KEY]) await refreshList();
})();
