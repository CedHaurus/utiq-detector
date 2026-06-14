# Utiq Detector

Extension navigateur (Chrome / Chromium + Firefox, Manifest V3) qui détecte si un
site utilise **Utiq** — le pistage publicitaire des opérateurs télécom — et avertit
l'utilisateur.

## Écosystème — deux dépôts liés

Utiq Detector est le **client navigateur** d'un projet en deux parties :

| Composant | Dépôt | Rôle |
|-----------|-------|------|
| **Extension** (ce dépôt) | [CedHaurus/utiq-detector](https://github.com/CedHaurus/utiq-detector) | Détecte Utiq dans le navigateur et avertit l'utilisateur |
| **Site & backend** | [CedHaurus/utiq-tracker](https://github.com/CedHaurus/utiq-tracker) — [utiq-tracker.online](https://utiq-tracker.online) | Publie la liste de référence (`/api/v1/sites.json`, 542 sites, CC BY 4.0) et reçoit les signalements (`POST /api/v1/report`) |

L'extension **lit** la liste depuis le site et lui **renvoie** les signalements de l'utilisateur.
Voir la [politique de confidentialité de l'extension](https://utiq-tracker.online/privacy-extension).

## Détection — 3 couches

1. **Liste centralisée** (silencieuse) — le service worker récupère `sites.json`
   au démarrage puis toutes les 6 h. Si le domaine est connu → **icône rouge immédiate**, sans toast.
2. **Scan DOM** (content script) — signaux **forts** (scripts Utiq, CNAME `utiq.*`,
   `window.Utiq`, localStorage/cookie `utiqPass`, sélecteurs d'intégration) qui déclenchent
   seuls, et signaux **faibles** (lien consenthub, texte footer, `mtid`/`atid`, cookie `utiq_`)
   qui exigent une corroboration (≥ 2) pour ne pas piéger un article parlant d'Utiq.
   Deux passes (immédiate + 3 s) + MutationObserver 30 s. Alerte (toast) plafonnée à 1×/domaine.
3. **Réseau** (webRequest, lecture seule) — URLs `utiq-aws.net`, `utiqLoader`,
   `utiqConsentManager`, `utiqManagePage`, `frontend.prod.utiq`, `adtechservices.de`.

## Signalement communautaire

Quand Utiq est détecté activement sur un site **absent de la liste**, le popup
propose un bouton « Signaler ce site ». Envoie uniquement le `domain`, la raison
technique (`detected_by`) et la version de l'extension. Jamais d'URL complète,
de chemin, d'IP ni d'identifiant. Cache local `reported_domains` pour ne pas redemander.

## Icônes

Les icônes reprennent le **favicon officiel d'utiq-tracker.online**
(carré arrondi + bordure sombre + « U » blanche), recolorées par état :
rouge (détecté) / vert (propre) / gris (inconnu).

```bash
pip install Pillow
cd icons && python3 generate_icons.py
```

## Installation en dev

**Chrome** : `chrome://extensions` → activer « Mode développeur » → « Charger l'extension non empaquetée » → choisir ce dossier.

**Firefox** : `about:debugging#/runtime/this-firefox` → « Charger un module complémentaire temporaire » → choisir `manifest.json`.

Avec hot reload Firefox :
```bash
npm install -g web-ext
web-ext run
```

## Tester

- `allocine.fr`, `bfmtv.com`, `capital.fr` → icône rouge immédiate (dans la liste).
- `github.com` → icône verte après ~3 s.
- Logs : DevTools → onglet Extensions → service worker (background) / console de la page (content).

## Structure

```
manifest.json        Manifest V3 (Chrome + Firefox via browser_specific_settings)
background.js        Service worker — liste, icône, réseau, signalement
content.js           Scan DOM + toast
popup/               UI du popup (html / css / js)
icons/               PNG d'état (rouge/vert/gris) + icône de marque + generate_icons.py
_locales/            41 langues (fr, en, de, es, it, pt, nl, pl, … via generate_locales.py)
JOURNAL.md           Journal des actions de développement
```

## Licence

Données de sites : CC BY 4.0 — *Utiq Tracker — christopheboutry.com*.
