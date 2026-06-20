# Utiq Detector — detect & block Utiq tracking

Browser extension (Chrome / Chromium + Firefox, Manifest V3) that detects whether a
site uses **Utiq** — the telecom operators' advertising tracker (telco / carrier
tracking) — and warns the user. On **Firefox for Android**, it goes further and can
**block navigation** to sites that use Utiq.

## Install

- **Chrome / Chromium / Edge / Brave** : [Chrome Web Store](https://chromewebstore.google.com/detail/abkbmdfjlfmlonomlbmhgbhkeikpijfl)
- **Firefox (desktop & Android)** : [Firefox Add-ons](https://addons.mozilla.org/addon/utiq-detector/)

A browser-detecting install button for both stores is also available on [utiq-tracker.online](https://utiq-tracker.online).

## Block Utiq on Firefox Android 🛡️📱

On mobile, the colored toolbar icon used on desktop is not visible, so Utiq Detector
turns detection into an **active block**: a full-page warning that stops navigation to
any site using Utiq.

- 🚫 **Utiq blocker for Firefox Android** — when you open a site that uses Utiq, an
  interstitial **"This site uses Utiq"** page is shown instead of the page.
- ✅ **One-tap unblock** — a *Unblock and continue* button lets you load the site
  anyway; the choice lasts for the current session only (nothing is stored).
- ⚙️ **Toggle on/off** — a *Block Utiq sites* switch in the popup enables or disables
  blocking on mobile. It is **on by default on Android**.
- 🔒 **Mobile-only & private** — the feature is detected via
  `runtime.getPlatformInfo()` and stays completely inactive on desktop / Chrome. No
  data is collected.

**How the block works:** known Utiq domains (from the centralized list) are blocked
*before* the page loads via a blocking `webRequest` listener on top-level navigations;
sites detected on the fly (DOM / network) are blocked *reactively* by redirecting the
tab to the same warning page. Implemented in [`background.js`](background.js) and the
[`blocked/`](blocked/) interstitial page.

> Why block instead of just warn? Utiq identifies you at the **mobile network level**
> (your carrier), so on a phone it is exactly where stopping it matters most.

## Ecosystem — two linked repositories

Utiq Detector is the **browser client** of a two-part project:

| Component | Repository | Role |
|-----------|------------|------|
| **Extension** (this repo) | [CedHaurus/utiq-detector](https://github.com/CedHaurus/utiq-detector) | Detects Utiq in the browser and warns the user |
| **Site & backend** | [CedHaurus/utiq-tracker](https://github.com/CedHaurus/utiq-tracker) — [utiq-tracker.online](https://utiq-tracker.online) | Publishes the reference list (`/api/v1/sites.json`, 542 sites, CC BY 4.0) and receives reports (`POST /api/v1/report`) |

The extension **reads** the list from the site and **sends back** the user's reports.
See the [extension privacy policy](https://utiq-tracker.online/privacy-extension).

## Detection — 3 layers

1. **Centralized list** (silent) — the service worker fetches `sites.json`
   at startup then every 6h. If the domain is known → **red icon immediately**, no toast.
2. **DOM scan** (content script) — **strong** signals (Utiq scripts, CNAME `utiq.*`,
   `window.Utiq`, localStorage/cookie `utiqPass`, integration selectors) that trigger
   on their own, and **weak** signals (consenthub link, footer text, `mtid`/`atid`, cookie `utiq_`)
   that require corroboration (≥ 2) so an article merely talking about Utiq is not caught.
   Two passes (immediate + 3s) + a 30s MutationObserver. The toast warning is capped at 1×/domain.
3. **Network** (webRequest, read-only) — URLs `utiq-aws.net`, `utiqLoader`,
   `utiqConsentManager`, `utiqManagePage`, `frontend.prod.utiq`, `adtechservices.de`.

## Community reporting

When Utiq is actively detected on a site **absent from the list**, the popup
offers a "Report this site" button. It sends only the `domain`, the technical
reason (`detected_by`) and the extension version. Never a full URL, path, IP or
identifier. A local `reported_domains` cache avoids asking again.

## Icons

The icons reuse the **official utiq-tracker.online favicon**
(rounded square + dark border + white "U"), recolored per state:
red (detected) / green (clean) / gray (unknown).

```bash
pip install Pillow
cd icons && python3 generate_icons.py
```

## Dev installation

**Chrome**: `chrome://extensions` → enable "Developer mode" → "Load unpacked" → pick this folder.

**Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → pick `manifest.json`.

With Firefox hot reload:
```bash
npm install -g web-ext
web-ext run
```

## Testing

- `allocine.fr`, `bfmtv.com`, `capital.fr` → red icon immediately (in the list).
- `github.com` → green icon after ~3s.
- Logs: DevTools → Extensions → service worker (background) / page console (content).

## Layout

```
manifest.json        Manifest V3 (Chrome + Firefox via browser_specific_settings)
background.js        Service worker — list, icon, network, reporting
content.js           DOM scan + toast
popup/               Popup UI (html / css / js) — incl. Firefox Android block toggle
blocked/             "This site uses Utiq" interstitial (Firefox Android blocking)
icons/               State PNGs (red/green/gray) + brand icon + generate_icons.py
_locales/            41 languages (fr, en, de, es, it, pt, nl, pl, … via generate_locales.py)
build.sh             Builds the Chrome/Firefox packages into dist/
```

## License

Extension code: MIT — see [LICENSE](LICENSE).

Site data (the reference list): CC BY 4.0 — *Utiq Tracker — christopheboutry.com*.
