/* Utiq Detector — Blocking interstitial (Firefox Android) */

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

const params      = new URLSearchParams(location.search);
const originalUrl = params.get('url') || '';
const host        = (params.get('host') || '').toLowerCase();

// Only allow http(s) targets back (never javascript:, data:, moz-extension:, …).
function safeTarget(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (e) {
    return '';
  }
}
const target = safeTarget(originalUrl);

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('title').textContent = t('blockedTitle', 'This site uses Utiq');
  document.getElementById('host').textContent  = host;
  document.getElementById('desc').textContent  = t('blockedDesc',
    'Navigation blocked. This site uses Utiq, telco-level advertising tracking that identifies you across the web.');

  const unblockBtn = document.getElementById('unblock-btn');
  const backBtn    = document.getElementById('back-btn');
  const learnMore  = document.getElementById('learn-more');

  unblockBtn.textContent = t('blockedUnblock', 'Unblock and continue');
  backBtn.textContent    = t('blockedBack', 'Go back to safety');
  learnMore.textContent  = t('blockedLearnMore', 'Learn more about Utiq →');
  learnMore.href = 'https://utiq-tracker.online' + (host ? ('?q=' + encodeURIComponent(host)) : '');

  unblockBtn.addEventListener('click', async () => {
    unblockBtn.disabled = true;
    await sendMessage({ action: 'unblock_navigation', host });
    if (target) {
      location.replace(target);
    } else {
      unblockBtn.disabled = false;
    }
  });

  backBtn.addEventListener('click', () => {
    // history has at least this interstitial; step back to the previous page.
    if (history.length > 1) {
      history.back();
    } else {
      location.replace('about:blank');
    }
  });
});
