/* Utiq Detector — Popup */

const api = (typeof browser !== 'undefined') ? browser : chrome;

function t(key, fallback) {
  try {
    const m = api.i18n.getMessage(key);
    if (m) return m;
  } catch (e) {}
  return fallback;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      const p = api.runtime.sendMessage(message, resolve);
      if (p && typeof p.then === 'function') p.then(resolve).catch(() => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    try {
      const p = api.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
      if (p && typeof p.then === 'function') p.then((tabs) => resolve(tabs && tabs[0])).catch(() => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      const p = api.storage.local.get(key, resolve);
      if (p && typeof p.then === 'function') p.then(resolve).catch(() => resolve({}));
    } catch (e) {
      resolve({});
    }
  });
}

async function main() {
  const uLetter      = document.getElementById('u-letter');
  const statusCard   = document.getElementById('status-card');
  const statusIcon   = document.getElementById('status-icon');
  const statusText   = document.getElementById('status-text');
  const cacheInfo    = document.getElementById('cache-info');
  const moreInfoLink = document.getElementById('more-info-link');
  const optoutLink   = document.getElementById('optout-link');
  const versionEl    = document.getElementById('version');
  const reportBlock  = document.getElementById('report-block');
  const reportBtn    = document.getElementById('report-btn');
  const reportPrompt = document.getElementById('report-prompt');
  const reportFeedback = document.getElementById('report-feedback');

  // Version in the footer
  const manifest = api.runtime.getManifest();
  versionEl.textContent = 'v' + manifest.version;

  // Active tab -> hostname (lowercase, no port). Never any URL/path/query.
  const tab = await getActiveTab();
  let hostname = '';
  try { hostname = (new URL(tab.url).hostname || '').toLowerCase(); } catch (e) {}
  const siteLabel = hostname || t('popupUnknownSite', 'this site');
  // Domain to report: strip the redundant www.
  const reportDomain = hostname.replace(/^www\./, '');

  // State + config
  const [stateResp, config, cache] = await Promise.all([
    sendMessage({ action: 'get_state', tabId: tab ? tab.id : null }),
    sendMessage({ action: 'get_config' }),
    storageGet('utiq_list_cache')
  ]);

  const state = (stateResp && stateResp.state) || 'unknown';
  const meta  = (stateResp && stateResp.meta) || { inList: false, detectedBy: null };
  const trackerUrl = (config && config.trackerUrl) || 'https://utiq-tracker.online';
  const optoutUrl  = (config && config.optoutUrl)  || 'https://utiq-tracker.online/opt-out';

  // Sites count
  const cacheData = cache && cache['utiq_list_cache'];
  if (cacheData && cacheData.count) {
    cacheInfo.textContent = cacheData.count + ' ' + t('popupSitesLabel', 'sites');
  }

  // Links
  moreInfoLink.textContent = t('popupMoreInfo', 'More info on Utiq Tracker →');
  moreInfoLink.href = trackerUrl + (hostname ? ('?q=' + encodeURIComponent(hostname)) : '');
  optoutLink.textContent = t('popupOptout', 'Opt out of Utiq →');
  optoutLink.href = optoutUrl;

  const isDetected = (state === 'detected' || state === 'detected_net');

  // Render according to state
  if (isDetected) {
    uLetter.className = 'u-letter red';
    statusCard.className = 'status-card detected';
    statusIcon.textContent = '🔴';
    statusText.innerHTML = '<strong>' + escapeHtml(siteLabel) + '</strong>' +
      escapeHtml(t('popupDetected', 'uses Utiq (telco tracking)'));
    optoutLink.style.display = 'block';
  } else if (state === 'clean') {
    uLetter.className = 'u-letter green';
    statusCard.className = 'status-card clean';
    statusIcon.textContent = '🟢';
    statusText.innerHTML = '<strong>' + escapeHtml(siteLabel) + '</strong>' +
      escapeHtml(t('popupClean', 'does not use Utiq'));
  } else {
    uLetter.className = 'u-letter gray';
    statusCard.className = 'status-card';
    statusIcon.textContent = '⏳';
    statusText.textContent = t('popupUnknown', 'Analysing…');
  }

  // Report block: site actively detected but absent from the list.
  const cacheReported = await storageGet('reported_domains');
  const alreadyReported = ((cacheReported && cacheReported['reported_domains']) || []).includes(reportDomain);

  if (isDetected && isReportableDomain(reportDomain) && !meta.inList && !alreadyReported) {
    reportPrompt.innerHTML = t('popupReportPrompt',
      '🔍 This site is not in our list yet.<br><strong>Help us reference it!</strong>');
    reportBtn.textContent = t('popupReportBtn', 'Report this site');
    reportBlock.style.display = 'block';

    reportBtn.addEventListener('click', async () => {
      reportBtn.disabled = true;
      reportBtn.textContent = t('popupReporting', 'Sending…');

      const res = await sendMessage({
        action: 'submit_report',
        domain: reportDomain,
        detectedBy: meta.detectedBy || 'unknown'
      });

      reportBtn.style.display = 'none';
      reportFeedback.style.display = 'block';

      switch (res && res.status) {
        case 'ok':
        case 'pending':
          reportFeedback.textContent = t('popupReported', '✓ Thanks! This site will soon be added to the list.');
          reportFeedback.className = 'report-feedback success';
          break;
        case 'known':
        case 'already_reported':
          reportFeedback.textContent = t('popupKnown', '✓ This site is already being added.');
          reportFeedback.className = 'report-feedback success';
          break;
        case 'invalid':
          // Domain rejected by the server: neutral message, no retry.
          reportFeedback.textContent = t('popupReportInvalid', "This site can't be reported.");
          reportFeedback.className = 'report-feedback error';
          break;
        case 'rate_limited':
          // 429: too many reports, no automatic retry.
          reportFeedback.textContent = t('popupReportRateLimited', 'Too many reports, try again later.');
          reportFeedback.className = 'report-feedback error';
          break;
        default:
          // Network error / timeout: allow a manual retry.
          reportFeedback.textContent = t('popupReportError', 'Error, please try again in a moment.');
          reportFeedback.className = 'report-feedback error';
          reportBtn.style.display = 'block';
          reportBtn.disabled = false;
          reportBtn.textContent = t('popupReportBtn', 'Report this site');
      }
    });
  }
}

// Client-side pre-filter: only send plausible public FQDNs to the server
// (saves the rate-limit quota, avoids pointless "invalid" responses).
function isReportableDomain(host) {
  if (!host) return false;
  if (host.length < 5) return false;
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (host.includes(':')) return false;                  // IPv6 / port
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4
  // at least one dot + alphabetic TLD
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

document.addEventListener('DOMContentLoaded', main);
