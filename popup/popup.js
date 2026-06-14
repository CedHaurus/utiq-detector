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

  // Version dans le footer
  const manifest = api.runtime.getManifest();
  versionEl.textContent = 'v' + manifest.version;

  // Onglet actif -> hostname (minuscules, sans port). Jamais d'URL/chemin/query.
  const tab = await getActiveTab();
  let hostname = '';
  try { hostname = (new URL(tab.url).hostname || '').toLowerCase(); } catch (e) {}
  const siteLabel = hostname || t('popupUnknownSite', 'ce site');
  // Domaine à signaler : on retire le www. superflu.
  const reportDomain = hostname.replace(/^www\./, '');

  // État + config
  const [stateResp, config, cache] = await Promise.all([
    sendMessage({ action: 'get_state', tabId: tab ? tab.id : null }),
    sendMessage({ action: 'get_config' }),
    storageGet('utiq_list_cache')
  ]);

  const state = (stateResp && stateResp.state) || 'unknown';
  const meta  = (stateResp && stateResp.meta) || { inList: false, detectedBy: null };
  const trackerUrl = (config && config.trackerUrl) || 'https://utiq-tracker.online';
  const optoutUrl  = (config && config.optoutUrl)  || 'https://utiq-tracker.online/opt-out';

  // Compteur de sites
  const cacheData = cache && cache['utiq_list_cache'];
  if (cacheData && cacheData.count) {
    cacheInfo.textContent = cacheData.count + ' ' + t('popupSitesLabel', 'sites');
  }

  // Liens
  moreInfoLink.textContent = t('popupMoreInfo', 'Plus d\'infos sur Utiq Tracker →');
  moreInfoLink.href = trackerUrl + (hostname ? ('?q=' + encodeURIComponent(hostname)) : '');
  optoutLink.textContent = t('popupOptout', 'Se désinscrire d\'Utiq →');
  optoutLink.href = optoutUrl;

  const isDetected = (state === 'detected' || state === 'detected_net');

  // Rendu selon l'état
  if (isDetected) {
    uLetter.className = 'u-letter red';
    statusCard.className = 'status-card detected';
    statusIcon.textContent = '🔴';
    statusText.innerHTML = '<strong>' + escapeHtml(siteLabel) + '</strong>' +
      escapeHtml(t('popupDetected', 'utilise Utiq (pistage opérateur)'));
    optoutLink.style.display = 'block';
  } else if (state === 'clean') {
    uLetter.className = 'u-letter green';
    statusCard.className = 'status-card clean';
    statusIcon.textContent = '🟢';
    statusText.innerHTML = '<strong>' + escapeHtml(siteLabel) + '</strong>' +
      escapeHtml(t('popupClean', 'n\'utilise pas Utiq'));
  } else {
    uLetter.className = 'u-letter gray';
    statusCard.className = 'status-card';
    statusIcon.textContent = '⏳';
    statusText.textContent = t('popupUnknown', 'Analyse en cours…');
  }

  // Bloc de signalement : site détecté activement mais absent de la liste.
  const cacheReported = await storageGet('reported_domains');
  const alreadyReported = ((cacheReported && cacheReported['reported_domains']) || []).includes(reportDomain);

  if (isDetected && isReportableDomain(reportDomain) && !meta.inList && !alreadyReported) {
    reportPrompt.innerHTML = t('popupReportPrompt',
      '🔍 Ce site n\'est pas encore dans notre liste.<br><strong>Aidez-nous à le référencer !</strong>');
    reportBtn.textContent = t('popupReportBtn', 'Signaler ce site');
    reportBlock.style.display = 'block';

    reportBtn.addEventListener('click', async () => {
      reportBtn.disabled = true;
      reportBtn.textContent = t('popupReporting', 'Envoi…');

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
          reportFeedback.textContent = t('popupReported', '✓ Merci ! Ce site sera bientôt ajouté à la liste.');
          reportFeedback.className = 'report-feedback success';
          break;
        case 'known':
        case 'already_reported':
          reportFeedback.textContent = t('popupKnown', '✓ Ce site est déjà en cours d\'ajout.');
          reportFeedback.className = 'report-feedback success';
          break;
        case 'invalid':
          // Domaine rejeté par le serveur : message neutre, pas de nouvelle tentative.
          reportFeedback.textContent = t('popupReportInvalid', 'Ce site ne peut pas être signalé.');
          reportFeedback.className = 'report-feedback error';
          break;
        case 'rate_limited':
          // 429 : trop de signalements, pas de retry automatique.
          reportFeedback.textContent = t('popupReportRateLimited', 'Trop de signalements, réessaie plus tard.');
          reportFeedback.className = 'report-feedback error';
          break;
        default:
          // Erreur réseau / timeout : on autorise une nouvelle tentative manuelle.
          reportFeedback.textContent = t('popupReportError', 'Erreur, réessaie dans quelques instants.');
          reportFeedback.className = 'report-feedback error';
          reportBtn.style.display = 'block';
          reportBtn.disabled = false;
          reportBtn.textContent = t('popupReportBtn', 'Signaler ce site');
      }
    });
  }
}

// Pré-filtre client : n'envoyer au serveur que des FQDN publics plausibles
// (économise le quota de rate limit, évite les "invalid" inutiles).
function isReportableDomain(host) {
  if (!host) return false;
  if (host.length < 5) return false;
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (host.includes(':')) return false;                  // IPv6 / port
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4
  // au moins un point + TLD alphabétique
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

document.addEventListener('DOMContentLoaded', main);
