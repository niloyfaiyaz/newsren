<p align="center">
  <img src="public/assets/purple-greeting.svg" width="130" alt="Newsren pixel-computer companion" />
</p>

<h1 align="center">Newsren</h1>
<p align="center"><strong>Understand the news. Connect the dots. Build stronger arguments.</strong></p>
<p align="center">A mobile-first current-affairs learning prototype for curious students who find news overwhelming.</p>

## Why Newsren?

Students are often told to read more, but reading a story does not automatically make it a useful essay example. Newsren helps students understand what happened, explore related developments, and save that understanding for later use.

The experience centres on a friendly pixel-computer companion, a curated article collection, and a personal evidence Bank.

## The experience

### Explore
Choose a theme, browse articles by publication date, and open a concise explanation. Read the takeaway, inspect explained connections, and follow links to related articles within Newsren. Save useful articles with their gists and source details.

**Six themes**
- Arts and Culture
- Science and Technology
- Media and Communication
- Politics and International Relations
- Environment and Sustainability
- Individuals and Values

### Bank
Keep saved understanding alongside source links. Search saved text, filter by theme, edit notes, export references, and remove cards with confirmation. Saving is explicit and browser-local.

### Question
Enter an essay question and select saved evidence without losing the question as you navigate. The AI integration aims to assess relevance, explain evidence limitations, and support discovery when useful evidence is missing.

**Example question:** *Is modern technology a benefit or a threat to democracy?*

## Current status

This is an academic prototype, not a production news service.

| Capability | Status |
| --- | --- |
| Six-theme curated article browsing and publication-date ordering | Implemented |
| Article explanations and checked internal connections | Implemented |
| Browser-local Bank, notes, search/filter, deletion and reference export | Implemented |
| Question entry and manual saved-evidence selection | Implemented |
| AI relevance assessment and external discovery | Experimental, requires private configuration and controlled dispatch |
| Complete live question/search/save/reassessment journey | Not verified end to end |
| Automatic daily news refresh, accounts and cross-device sync | Not provided by the default clone |

The default clean checkout keeps paid AI actions unavailable. An API key alone does not activate the controlled evaluation paths. Private spending ledgers, dispatch-owner state, credentials and historical evaluation artifacts are intentionally excluded.

## Quick start

**Requires Node.js 22 or newer.** The application uses built-in Node modules and has no third-party runtime dependencies.

```bash
git clone https://github.com/niloyfaiyaz/newsren.git
cd newsren
npm start
```

Open **http://127.0.0.1:3001**. Press **Ctrl+C** to stop the server.

No `npm install` or API key is needed for curated reading and Bank features. The server binds to `127.0.0.1`; this is a local application, not a public deployment. If the port is occupied, stop your own earlier Newsren process before starting another.

## Development

```bash
npm run check   # Primary syntax checks
npm test        # Node test runner
```

Tests include content/data contracts, storage behaviour, rendering, request validation and controlled AI infrastructure. Mocked responses validate integration behaviour, not real model quality. Some historical evaluation/recovery checks may depend on operator-local artifacts excluded from this repository. A passing unit suite is not proof that the complete live AI journey works.

### Repository layout

```text
public/
  app.mjs          Browser interface and navigation
  styles.css       Shared visual styling
  assets/          Pixel-computer artwork
  data/            Curated article corpus
  lib/             Browser data, question and storage helpers
lib/               Server-side AI, retrieval and control modules
server.mjs         Local HTTP server and API routes
tests/             Automated checks and synthetic fixtures
```

## Data, privacy and sources

- Articles are curated, with publisher attribution and publication dates. The collection is not a live feed.
- Explanations use retained source material. Newsren distinguishes reporting from interpretation and does not treat chronology as causation.
- Saved cards reside in this browser on this device. There are no accounts, sync or guaranteed backups. Clearing site data can remove the Bank.
- Reference export is not a restorable backup. Some legacy saved-context qualifications may not appear in exported Markdown.
- Never commit `.env`, API keys, browser profiles, personal Bank contents or live evaluation logs.
- Content and artwork retain their respective owners' rights. No blanket republication rights or open-source licence are asserted for third-party material.

## What comes next

Finish live verification of evidence matching and the insufficient-evidence discovery loop, evaluate the journeys with students, and test on actual mobile devices. Source coverage, editorial quality, accessibility, privacy and production deployment need further work.
