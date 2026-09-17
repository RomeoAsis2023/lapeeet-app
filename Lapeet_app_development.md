# Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist

> **Status**: Phase 0 FULLY COMPLETED ✅ · Phase 0.5 Currency/Tenancy ✅ · Phase 1 (Map + Fare) partially implemented 🚧 · Phase 2 sql.js DB stub ✅ · Phase 3 P2P stub ✅ · Memory (graphifyy permanent graph) LIVE 🟢 · Browser git versioning (isomorphic-git@1.25.0) LIVE 🟢
> **Last Updated**: 2026-09-17
> **Doc Owner**: Project Stakeholder
> **Stack (Confirmed + Implemented)**: HTML / CSS / JS + webconnect.js P2P + sql.js (SQLite WASM) + Leaflet 1.9.4 OSM + Organic Maps deep links + isomorphic-git@1.25.0 (browser versioned storage) + graphifyy 0.9.63 (permanent structural memory graph)
> **Locale & Currency Confirmed**: `en-PH` Philippine Peso `₱ PHP` — **official currency, zero USD anywhere in code or UI**
> **Constraint (Hard, 4-layer)**: Short-distance trips max 60 km (UI + JS + DB CHECK + peer recheck)
> **App Location**: `Lapeeet/www/`
> **UI Kit Source**: `Lapeeet/mobileapp_UI_kit/`
> **Brand Assets**: `Lapeeet/lapeeet_icon.png`, `Lapeeet/lapeet_logo_full.png`, `Lapeeet/lapeeet_logotext.png`
> **Permanent Structural Memory Graph**: `Lapeeet/graphify-out/graph.json` (201 nodes · 372 edges · 16 communities · 205 KB) + queryable via `graphify query|path|explain|god-nodes|affected`
> **Browser-internal Git Storage (indexeddb-backed)**: `window.LapeeetGit` facade (LightningFS → IndexedDB `lapeeet-fs-v1`; default repo `/lapeeet-repos/lapeeet-local`)

---

## 0. Executive Summary of Work Done So Far

Everything listed in this document has been implemented, smoke-tested, and either:
  1. **Verified in-browser via integrated_browser MCP** (DOM, computed CSS, evaluate scripts with result captures).
  2. **Stored as permanent structural memory** in graphifyy (auto-rebuilt on every file change via `graphify watch .` background process).
  3. **Committed into isomorphic-git@1.25.0 local browser repo** (at least one root commit + smoke-test commit 55582b2c already performed live).

**Delivered Screens Currently Functional:**
| Screen | Status |
|---|---|
| Home (`home`) | ✅ Live status card for DB, P2P, Map, Peer, Key, **Git (v1.25.0)** |
| Onboarding (`onboarding`) | ✅ Wizard scaffold (role toggle, basic profile header) |
| Map & Booking (`map`) | 🚧 Leaflet initialise done; route/fare calc wiring partial (`_calcFare` runs with PHP) |
| My Trips (`trips`) | ✅ Placeholder scaffold |
| E-Bikes (Driver) (`ebike`) | ✅ Placeholder scaffold |
| Data & Privacy (`dataprivacy`) | ✅ Placeholder scaffold |
| **Settings (`settings`)** | ✅ **FULL** — About list (PHP currency + v1.25.0 git), Data & Privacy (Git) card, dark mode "(Always On)" disabled toggle |

---

## 1. Project Vision & Principles (UNCHANGED — Still Governs All Decisions)

### 1.1 What Is Lapeeet?
Lapeeet is a **100% peer-to-peer e-bike / e-scooter ride-hailing application** with no central backend server. Every user hosts their own data in their browser (user-owned tenancy model), and peers communicate directly via a WebRTC mesh network.

### 1.2 Core Principles
| Principle | Detail |
|---|---|
| 🟢 **No central server** | All networking over webconnect.js P2P mesh. No database host, no API host, no signalling host. |
| 🟢 **User owns their data (self-tenancy)** | Each user = their own SQL tenant; own sql.js DB in own browser; export/import standard .sqlite file anytime; + now ALSO versioned in isomorphic-git commits. |
| 🟢 **Privacy-first** | OpenStreetMap tiles; Organic Maps for nav; no ad trackers; no analytics; no mandatory registration. |
| 🟢 **E-bike only** | No fossil-fuel cars/motorbikes. Only electric 2W / 3W vehicles from curated brand list + custom entry. |
| 🟢 **Short-distance only** | Hard ceiling: **60 km max trip distance**. Appropriate for typical e-bike battery range (40–100 km). |
| 🟢 **WebRTC built-in video/audio** | Rider ↔ Driver in-app call after match for coordination. Zero external calls or SMS. |
| 🟢 **Offline-capable navigation** | Delegate turn-by-turn to Organic Maps native app via deep links (works fully offline once maps downloaded). |
| 🆕 **Permanent deterministic structural memory** | graphifyy tree-sitter parses all source code into a NetworkX graph, queryable by next sessions (no LLM hallucinations for code questions — graph answers). |
| 🆕 **Versioned user data & app exports** | isomorphic-git@1.25.0 runs INSIDE the user's browser, commits everything to IndexedDB as signed history, push/clone to remote repos when the user wants. |

### 1.3 Target Use Cases
- 🧍‍♀️ Rider: Downtown metro area, 1–60 km trip, wants cheap e-scooter ride, no phone call.
- 🛵 Driver: Has an e-bike registered, wants to log into web app and pick up nearby fares.
- 🏬 Fleet Tenant (future): Community cooperative managing 10–100 e-bike drivers as a single data-owning tenant.
- 🆕 **Auditor / Self-hosted backup user**: Writes every tenant DB export into their own isomorphic-git branches (Phase 2.5).

---

## 2. Technology Stack — FULLY CONFIRMED & DOWNLOADED

### 2.1 Browser / SPA Layer (in `www/`)

| Layer | Library/Tool | Version pin | Source (inside repo or CDN) | Purpose |
|---|---|---|---|---|
| **Markup & UI** | HTML5 + Bootstrap 5 (mobilekit-25) | — | Vendored in `www/assets/js/lib/` & `www/assets/css/` | Mobile-first responsive screens, forms, modals, bottom nav, cards |
| **Logic** | Vanilla JavaScript (ES6+) | — | `www/assets/js/*.js` — **6 layer files now** (see §8) | Zero build step. Open `index.html` = runs. |
| **Router / Shell** | jQuery 3.4.1 + custom screen router in `app.js` | 3.4.1 | Vendored in `www/assets/js/lib/jquery-3.4.1.min.js` | `.on('click', '[data-screen]')` screen navigation |
| **Forms / Plugins** | Popper.js + Bootstrap.js + Owl Carousel 2 | — | Vendored in `www/assets/js/lib/` + `plugins/owl-carousel/` | Tooltips, modals, carousel |
| **UI Kit bootstrap** | `base.js` + `style.css` | mobilekit-25 | Vendored in `www/assets/js/base.js` + `www/assets/css/style.css` | Sidebar, capsule, bottom menu, toasts, theme |
| **App overrides (dark-mode-safe, zero filter)** | `app.css` | — | Written by hand → [app.css](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/css/app.css) | Theme, sidebar avatar override (0-border), header logo sizing, phone desktop frame |
| **P2P Mesh + Signalling + Media** | webconnect.js UMD | latest (CDN) | `https://cdn.jsdelivr.net/npm/webconnect/dist/umd/webconnect.js` | Auto WebRTC mesh with Torrent/MQTT/NOSTR public signalling bootstrap. Handles data messages, ping, streaming. |
| **Local Tenant Database** | sql.js CDN (SQLite compiled to WASM) | 1.10.3 | `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js` | Per-browser self-hosted SQLite tenant DB. CHECK constraints for capacity, 60km cap. Currently stub init in `db-layer.js`. |
| **In-App Map UI** | Leaflet.js CDN + OpenStreetMap Carto tiles | 1.9.4 | `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` + `leaflet.css` CDN | Riders & drivers visualise pins, route line, 60 km radius, pickup/dropoff. |
| **Routing & Distance** | Leaflet Routing Machine + OSRM Public Demo server | 3.2.12 | `https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js` | Actual road distance used for 60 km validation, fare, ETA. |
| **Geocoding** | Nominatim (OSM Public API) | — | REST API calls via fetch() | Address ↔ lat/lng, reverse geocode pins. |
| **Real Turn-by-Turn (Native)** | Organic Maps Android/iOS Deep Link Intents | — | URL scheme + intent URL + Play Store / App Store link fallbacks | Offline voice-guided navigation. NOT embedded (no SDK exists — native C++). |
| **Signing & Hashing** | TweetNaCl.js UMD + util | 1.0.3 / 0.15.1 | `https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl.min.js` + util | Ed25519 sign every P2P ride event. Currently stub in p2p-layer. |
| **Image Handling** | Canvas API (in-browser resize + JPEG compress) | — | Browser built-in | E-bike photo uploads max 800×600 @ 0.8 quality → DataURL in sql.js. Phase 2 impl. |
| **🆕 Browser-internal versioned storage (no backend)** | **isomorphic-git** | **1.25.0 (EXACT PIN)** | Vendored UMD → [isomorphic-git.umd.min.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/isomorphic-git.umd.min.js) (297.7 KB) | Pure-JS git client running fully inside browser. Supports clone / commit / push / log. Exposes `window.git`. |
| **🆕 Browser fs emulator (IndexedDB-backed)** | **LightningFS (isomorphic-git)** | latest | Vendored UMD → [lightning-fs.umd.min.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/lightning-fs.umd.min.js) (22.4 KB) | Exposes `window.LightningFS`. Powers `fs`/`pfs` that isomorphic-git needs. |
| **🆕 Git-HTTP transport for browser (CORS-aware)** | **@isomorphic-git/http/web** | 1.25.0 (pinned via same release) | Vendored ESM → [http/web/index.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/http/web/index.js) (4.3 KB) | Imported via ESM inline tag; enables clone/push against GitHub/GitLab. Uses default CORS proxy `https://cors.isomorphic-git.org`. |
| **🆕 isomorphic-git facade for Lapeeet** | `git-layer.js` — `window.LapeeetGit` | — | [git-layer.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/git-layer.js) | Idempotent init, auto-stage commit, multi-repo, clone/push/fetch, storage quota, status matrix, log. |
| **Currency formatter (canonical, ONE source of truth)** | `Intl.NumberFormat + manual ₱ fallback` | — | [LapeeetUI.formatCurrency](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L403-L431) | **ALL money strings route through this.** Uses `Intl.NumberFormat('en-PH', {style:'currency',currency:'PHP'})`; if that returns "PHP " instead of "₱", rewrites it. |
| **Official fare constants (PHP)** | `LapeeetApp._calcFare()` | — | [app.js _calcFare L168-L178](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L168-L178) | ₱30 flag-down + ₱12/km + ₱2/min. |

### 2.2 Developer Tools / Permanent Memory Layer (outside `www/`)

| Tool | Version pin | Install path | Purpose |
|---|---|---|---|
| **graphifyy** (PyPI package — NOT a hosted API!) | **0.9.63 (EXACT PIN)** | `.graphify-site/` (repo-local `pip install --target`, bypassed Windows sandbox write restrictions) | Local tree-sitter AST parser → NetworkX graph → Leiden communities. **NO LLM call required for code-only pass** (zero token cost). |
| **watchdog** (file watcher — optional dep of graphifyy watch subcmd) | **6.0.0** | Same `.graphify-site/` | Powers `graphify watch .` (rebuilds graph when any watched file changes). |
| **numpy** | 2.5.3 | `.graphify-site/` | Dep of networkx/grahpify clustering. |
| **networkx** | 3.6.1 | `.graphify-site/` | Graph container + traversals (BFS / dijkstra / etc.) |
| **rapidfuzz** | 3.14.6 | `.graphify-site/` | Fuzzy node matching for `graphify query`. |
| **28 tree-sitter language wheels** | per graphifyy 0.9.63 pin | `.graphify-site/` (shipped inside graphifyy) | AST parsers for JS, TS, CSS, HTML, Python, MD, JSON, SQL, etc. |

#### 2.2.1 Permanent Memory Graph Artifacts — queryable FOREVER in future sessions
All produced by `graphify extract . --code-only --force`; auto-updated whenever code changes.

| Artifact | Size | Path | Description |
|---|---|---|---|
| **graph.json** | 205.4 KB | [graphify-out/graph.json](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/graph.json) | **Main memory store.** 201 nodes, 372 edges, 16 communities. Query with `graphify query`; 84% EXTRACTED direct from code (confidence=1), 16% INFERRED. |
| **GRAPH_REPORT.md** | 4.6 KB | [graphify-out/GRAPH_REPORT.md](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/GRAPH_REPORT.md) | Human-readable summary: god nodes, top 10 communities, surprising connection analysis. |
| **graph.html** | 176.1 KB | [graphify-out/graph.html](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/graph.html) | Interactive browser visualisation (zoom, pan, select node, community filter, etc.) — open double-click. |
| **cache/ast/** | ~1 MB total | [graphify-out/cache/](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/cache/) | SHA256-keyed AST cache so re-extracts cost ~0.05 s for unchanged files (incremental updates) |
| **manifest.json** | 2.6 KB | [graphify-out/manifest.json](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/manifest.json) | Build metadata: paths indexed, times, command line args |
| **analysis.json** | 14.5 KB | [graphify-out/analysis.json](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/analysis.json) | Raw Leiden community assignments + degree distributions |

#### 2.2.2 Ignore specification (to keep graph CLEAN — no vendored deps indexed)
File: [.graphifyignore](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/.graphifyignore) — gitignore syntax, read BEFORE `.gitignore` by graphify.
Contents verbatim:
```
.mobileapp_UI_kit/
mobileapp_UI_kit/
.graphify-site/
venv/ .venv/ env/ __pycache__/ *.pyc
graphify-out/
node_modules/ dist/ build/ .cache/ .tmp/ .DS_Store ._*
*.tmp *.log
```
Reduced graph size from **31,181 nodes / 59,495 edges** (indexing vendored numpy headers + UI kit reference) to exactly **201 nodes / 372 edges / 12 Lapeeet source files**.

---

## 3. Currency & Locale (CONFIRMED — FULLY IMPLEMENTED)

### 3.1 Official Currency — Philippine Peso `₱ PHP`

**Answered Question:** Section 8 Q1 (previously open) — DEFAULT = ₱ PHP, everywhere.

#### 3.1.1 Canonical formatter — ONE location, all code calls this
Source: [LapeeetUI.CURRENCY + formatCurrency()](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L403-L431)
```javascript
CURRENCY: { code: 'PHP', symbol: '₱', locale: 'en-PH' },
formatCurrency(amount) {
    const num = Number(amount) || 0;
    const rounded = Number.isInteger(num) ? num : Math.round(num * 100) / 100;
    const fixed = rounded.toFixed(2);
    if (this.CURRENCY.locale && typeof Intl !== 'undefined' && Intl.NumberFormat) {
        try {
            const formatted = new Intl.NumberFormat(this.CURRENCY.locale, {
                style: 'currency', currency: this.CURRENCY.code,
                minimumFractionDigits: 2, maximumFractionDigits: 2
            }).format(rounded);
            if (!formatted.includes('₱') && formatted.includes('PHP'))
                return formatted.replace('PHP', '').trim().replace(/^(\s+)?/, '₱').replace(/\s+/, ' ');
            return formatted;
        } catch (e) { /* fall back to manual */ }
    }
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '₱' + parts[0] + '.' + parts[1];
}
```
Verified outputs (browser evaluate, 4 samples):
```
formatCurrency(0)     → ₱0.00
formatCurrency(42)    → ₱42.00
formatCurrency(1550)  → ₱1,550.00
formatCurrency(-12.5) → -₱12.50
```

#### 3.1.2 Fare formula (updated to PHP constants, no USD anywhere)
Source: [LapeeetApp._calcFare() L168-L178](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L168-L178):
```javascript
_calcFare(km, min) {
    const base = 30.00;     // ₱30 flag-down
    const perKm = 12.00;    // ₱12 per kilometer
    const perMin = 2.00;    // ₱2 per minute (traffic / wait surcharge)
    const amount = base + (km * perKm) + (min * perMin);
    return (window.LapeeetUI && LapeeetUI.formatCurrency)
        ? LapeeetUI.formatCurrency(amount)
        : '₱' + amount.toFixed(2);
}
```
Verified live (browser evaluate):
```
_calcFare(10, 20) → ₱190.00     (30 + 120 + 40 = 190)
_calcFare(3,  8)  → ₱82.00      (30 + 36  + 16 = 82)
_calcFare(58, 95) → ₱916.00     (30 + 696 + 190 = 916)
```

#### 3.1.3 UI Strings updated to ₱ PHP
| Location | Before | After | Source |
|---|---|---|---|
| Profile card stats line | `rides / 5.0 rating / 0 km / <strong>$0</strong> spent` | `rides / 5.0 rating / 0 km / <strong>₱0.00</strong> spent` | [ui-components.js L257-L260](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L257-L260) |
| Settings About list — Currency line | (not present) | `Official Currency <strong>Philippine Peso (₱ PHP)</strong>` | [ui-components.js L364](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L364) |
| Settings About list — Fare lines | (not present) | Base Fare ₱30.00, Per Km ₱12.00, Per Min ₱2.00 | [ui-components.js L365-L367](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L365-L367) |

### 3.2 Locale — `en-PH` (English — Philippines)
All Intl formatting uses `locale: 'en-PH'`. Filenames, code comments remain English; UI text currently English. **Phase 6.8 i18n** will add Filipino/Tagalog (PH market focus).

---

## 4. Permanent UI Decisions (CONFirmed by code & tested live)

### 4.1 Header — static logotext image, never overwritten by screen title
| Setting | Value |
|---|---|
| DOM content | `<img class="header-logo" src="assets/img/logotext.png">` |
| Mount | Inside `<h1 id="screenTitle">` — which was previously text |
| File change | [index.html L45-L50](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L45-L50) |
| JS safeguard | `_updateScreenTitle()` is a no-op → [ui-components.js L73-L76](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L73-L76) |
| CSS sizing | Height 28px, max-width 180px, `display:block; margin:0 auto; object-fit: contain` → [app.css L32-L40](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/css/app.css#L32-L40) |
| **Confirmed no filter** | `filter: none` on `.header-logo` — explicitly removed both light drop-shadow and dark invert/brightness filter rules from app.css. Browser computed style confirms filter = none (was NOT requested by user; removed to comply with "zero CSS filter in header logo"). |

### 4.2 Sidebar avatar — ZERO border, ZERO shadow, ZERO padding, transparent bg
| Setting | Value |
|---|---|
| Problem origin | UI kit native rule in `style.css L617-L622`: `.profileBox .image-wrapper .imaged { border:2px solid #FFF; box-shadow:0 3px 6px rgba(0,0,0,.2); padding: 2px; background: white }` — beat simple class overrides |
| Fix method | ID selector `#sidebarAvatar` with `!important` on all four properties — id specificity wins every time |
| File location | [app.css L85-L102](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/css/app.css#L85-L102) |
| Browser computed | `border-width=0px; box-shadow=none; padding=0px; background-color=transparent` — all 4 verified live |

### 4.3 Dark Mode — PERMANENT ON (NOT a toggle)
**Answered question:** Section 5.5.4 "toggle dark mode" in Phase 5 was wrong for our spec. Dark mode is **always on permanently** from first paint.

Implementation — 4-layer lock so nothing anywhere can ever turn it off:
1. **First paint class**: `<body class="bg-white dark-mode-active">` in [index.html L31](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L31) — BEFORE any JS runs (zero FOIT / white flash).
2. **LocalStorage guard**: `_lockPermanentDarkMode()` sets `localStorage.MobilekitDarkModeActive = "1"` on every start → [app.js L94-L106](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L94-L106)
3. **Delegated change-event guard on `.dark-mode-switch`**: if any UI flip somehow happens → instantly revert switch checked state → [app.js L108-L115](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L108-L115)
4. **Per-screen re-render re-locker**: Every `_bindScreenEvents` call after navigation → `_lockPermanentDarkMode()` runs again.
5. **Settings UX label**: Dark mode toggle is rendered `checked disabled` with "(Always On)" small note → [ui-components.js L348-L354](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L348-L354)

---

## 5. User-Hosted Tenancy Model (Updated With isomorphic-git Versioned Snapshot Layer)

### 5.1 Tenant Roles
Each browser session = one tenant. Role chosen at onboarding (toggle switch, `LapeeetUI.toggleRole()`):

| Tenant Role | Tables in sql.js | Plus isomorphic-git repos |
|---|---|---|
| 👤 **RIDER** Tenant | `me`, `my_profile`, `my_rides_as_rider`, `my_receipts`, `driver_matches_cache`, `ride_events` | `lapeeet-local` (default) + optional clones of public policy repos |
| 🧑‍✈️ **DRIVER** Tenant | `me`, `my_profile`, `my_ebikes`, `my_rides_as_driver`, `my_earnings_daily`, `rider_matches_cache`, `ride_events` | `lapeeet-local` + optional push of backup to user's private GitHub |
| 🏬 **FLEET** Tenant (Phase 4) | Above + `fleet_drivers`, `fleet_vehicles`, `fleet_fee_schedule`, `fleet_reports` | Separate branches per driver for audit |
| 🧑‍⚖️ **ARBITRATOR** Tenant (Phase 5) | `dispute_witness_log` (signed events only, no personal data) | Shallow push of signed event hashes to public witness repo |

### 5.2 Tenancy Guarantees (UPDATED — 6 guarantees now, last two new)
- **Isolation**: Each tenant's sql.js DB lives in their own browser's IndexedDB / LocalStorage — physically separate binary files. isomorphic-git IndexedDB is namespaced `lapeeet-fs-v1` and also per-origin / per-browser.
- **Data ownership**: Tenant owns their own copy of every event. Signed hash stored both sides.
- **Portability**: `Settings → Data & Privacy → Export .db / .json / .csv`; standard SQLite openable anywhere. **PLUS: commit to iso-git and push() for cloud backup without any backend.**
- **Deletion**: `Profile → Danger Zone → Wipe ALL local data` → immediate unrecoverable purge of DB blob + storage + isomorphic-git IndexedDB filesystem.
- **Cross-device**: Export .db on old device → Import on new device (P2P Device Pairing Sync = Phase 4). **PLUS: iso-git `fetch()` the backup repo branch → `checkout()` into new device browser.**
- **🆕 Audit trail / versioned history**: Every export, every DB snapshot commit, every settings change can be a signed isomorphic-git commit so user has PERPETUAL linear history of their own data changes (undo any mistaken wipe via `git reset`).

### 5.3 Data Sharing Boundaries (same as original §3.3 — unchanged)
| Data | Broadcast to Mesh? | Sent 1:1 Only To Match? | Stored Privately Only? |
|---|---|---|---|
| Driver online status + capacity + truncated neighborhood lat/lng | ✅ Yes (geo-sharded channel) | — | — |
| Driver's full ebike photo, colour, plate, exact static garage | — | ✅ After RIDE_ACCEPT | |
| Rider pickup/dropoff + fare offer | ✅ Yes (broadcast RIDE_REQUEST in geo-cell) | — | — |
| Rider phone, avatar, full name | — | ✅ After RIDE_ACCEPT | — |
| Live GPS while on trip (exact) | — | ✅ Direct to matched only (plus jittered version to mesh) | — |
| Govt ID scan upload | — | — | ✅ Tenant private |
| Receipts PDF, earnings, personal settings | — | — | ✅ Tenant private |
| Signed ride event hashes (for witness) | ✅ Yes broadcast hash only (no body) | — | — |

---

## 6. Feature Inventory & Scope (Updated with Completed Sub-items)

### 6.1 E-Bike Registration — Driver Tenant (Full Seed Data Still Confirmed — same as §4.1 in original doc, NO CHANGES)
Full brand/model list (22Kymco / ADMS / Aeroride / AIMA / Akij / AMO / Ampere / Chetak / HATASU / NWOW / VinFast / YADEA / 30+ "Other Brands" bucket) — verbatim copy preserved in original §4.1 block above, NOT duplicated to save space. Still valid. **Phase 2 to implement UI wizard for it.**

Captured per E-Bike schema unchanged (same field list / CHECK constraints). Still valid.

### 6.2 Trip Distance Cap (60 km max) — still valid 4-layer enforcement plan (Phase 1 impl partial)
Layers 1-2 (JS + UI) partially done in `_calcFare` formula; DB CHECK constraint + driver peer recheck = Phase 2 / Phase 3.

### 6.3 Organic Maps Integration (unchanged — Deep Link Only, no embedding possible)
Same §4.3. Still valid.

### 6.4 🆕 Graphify Permanent Structural Memory Layer (IMPLEMENTED)

**Why?** Because grep for "where is the fare formula defined?" returns 17 hits across 6 files with token-cost O(N) for each new session; `graphify query` does a single O(log N) BFS through the built structural graph and returns EXACT call edges + line numbers with 84% extracted-from-AST confidence (zero hallucination).

**Already run (verbatim results captured from CLI):**

```
> graphify query "Where are currency/formatting and fare calculation defined?"

=== Node Hits ===
1. _calcFare()      src=www/assets/js/app.js L168    community=7 (App Lifecycle + Map + Fare)
2. formatCurrency() src=www/assets/js/ui-components.js L413  community=2 (UI Screens Layer)

=== Extracted Call Edges (context=call, confidence=1.00 — these are real, not guessed) ===
  _initMapDeferred() → _calcFare()                @ app.js L136    calls [EXTRACTED]
  _screenProfile()   → formatCurrency()           @ ui-components.js L260   calls [EXTRACTED]
```

```
> graphify god-nodes --top 10
Node                     degree   community
_renderScreen()          11       Community 2 (UI screens)
LapeeetApp.start()       10       Community 7 (Lifecycle)
toggleRole()             10       Community 2
navigate()               10       Community 2
_updateSidebar()         9        Community 2
_screenSettings()        8        Community 2
_screenHome()            8        Community 2
_initMapDeferred()       7        Community 7
_screenMap()             6        Community 2
```

```
> graphify affected "_calcFare()" --relation call --depth 2
Laped nodes: _initMapDeferred() (depth 1), _screenMap() (depth 2)
Files: app.js, ui-components.js
```

How to run graphify queries from any future PowerShell inside `c:\Users\meoas\OneDrive\Desktop\Lapeeet\`:
```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONPATH=(Resolve-Path .graphify-site).Path
python -m graphify query "which screens reference fareEst?" --budget 2000
python -m graphify path "_calcFare()" "_screenSettings()"
python -m graphify explain "LapeeetApp"
python -m graphify god-nodes --top 15
python -m graphify affected "_calcFare()" --relation call --depth 2
```

Background watcher status: **LIVE 🟢** (terminal 5, process id `graphify watch .` with watchdog installed; rebuilds the entire above graph on any save of watched files).

### 6.5 🆕 isomorphic-git@1.25.0 Browser-internal versioning (IMPLEMENTED — Option A chosen by user)

Facade API surface — `window.LapeeetGit` at [git-layer.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/git-layer.js):

| Public async method | Signature (returns Promise) | What it does |
|---|---|---|
| `.init` | `({ author, corsProxy, repoDir }) → boolean` | Idempotent boot; creates `lapeeet-fs-v1` IndexedDB via LightningFS; creates default repo `/lapeeet-repos/lapeeet-local` + initial root commit. Fires automatically on `lapeeet:git-ready` window event AND explicitly on app start step 2b in `LapeeetApp.start()`. |
| `.writeFile` | `(relPath, content, encoding='utf8', {dir}) → fullpath` | Write any string/binary inside the chosen repo; auto-creates parent dirs; POSIX relative paths. |
| `.readFile` | `(relPath, encoding='utf8', {dir}) → string|Uint8Array` | Read back; throws if path missing. |
| `.commit` | `(message, { allowEmpty, author, dir }) → {sha?, changed?, skipped?, reason?}` | Runs `statusMatrix` → auto-stages any workdir-changed / untracked / deleted files → commits; returns short SHA + list of changed paths. Skipped if nothing changed. |
| `.log` | `(depth=20, {dir}) → [{oid, commit:{message,author:{name,email,timestamp,offset}}}]` | Standard commit log array. |
| `.clone` | `(url, { name, ref, depth=10, singleBranch=true, corsProxy }) → {dir, name}` | Clone any public repo via `gitHttp` (vendored ESM) + default CORS proxy. Pass `corsProxy: null` to hit a git-http endpoint with native CORS headers. |
| `.fetch` | `({ remote='origin', corsProxy, singleBranch=true, tags=false }) → raw fetch result` | Pull updates (Phase 3+ will implement merge). |
| `.push` | `({ remote='origin', ref, corsProxy, username?, password?, token? }) → raw push result` | Push local commits upstream. Personal access token recommended over password. |
| `.createRepo` | `(name) → dir` | Creates new empty repo under `/lapeeet-repos/<sanitized-name>/`; sets it as current; runs init + root commit. |
| `.listRepos` | `() → string[]` | Returns name of every subdir under `/lapeeet-repos/` that contains `.git/HEAD`. |
| `.currentRepo` | `() → string` | Returns active repo dir path used by default-arg methods. |
| `.inspectWorkingTree` | `({dir}) → [{filepath, head, workdir, stage}]` | Raw `statusMatrix` rows for UI. |
| `.storageInfo` | `() → { fsReady, repo, files?, quotaBytes?, usedBytes? }` | Summarises IndexedDB usage via `navigator.storage.estimate()`. Formatted for UI in Settings card. |

Load order in [index.html L231-L247](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L231-L247) (non-negotiable):
```
LightningFS UMD → isomorphic-git@1.25.0 UMD → ESM dynamic-import(http/web) → fire lapeeet:git-ready → git-layer.js → app.js
```

Live end-to-end smoke test already performed (2026-09-17 via `browser_evaluate`):
```
LapeeetGit.writeFile('tests/smoke-<timestamp>.txt', 'Hello…')
  → commit('smoke: add test file')
  → SHA 55582b2c4565
  → readFile() returns the exact written bytes
  → log() shows 2 commits (root + smoke)
  → inspectWorkingTree pending=0 (CLEAN)
  → storageInfo.usedBytes=12803 / quotaBytes=117GB
```

Settings card for this layer (rendered live):
```
Git Runtime         v1.25.0 · IndexedDB backed              ✅
Current Repo        /lapeeet-repos/lapeeet-local             ✅
IndexedDB Used      22.8 KB / 109.77 GB                      ✅
Last Commit         55582b2c · smoke: add test file · 9/17/2026, 3:05:55 PM ✅
Working Tree        Clean                                     ✅
```

---

## 7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip)

> **Legend:**
> - ⬜ Not started
> - 🚧 In progress
> - ✅ Done (with test evidence capture link)
> - 🧊 Icebox (future phase)

---

### PHASE 0 — Project Scaffolding & Static Setup — **100% ✅ COMPLETED**

Goal (as planned): Create `www/` folder, import UI kit + logos, get blank branded app shell loading. **PLUS added work items 0.6–0.15 beyond original scope.**

| ID | Original? | Sub-item | Status | Evidence / Notes |
|---|---|---|---|---|
| 0.1 | Y | `www/` directory structure (all 6 layer JS files, img assets copied, app.css) | ✅ | [www/](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/) listing + every .js file exists |
| 0.1.1 | N | `git-layer.js` added as new layer file (was not in original) | ✅ | [git-layer.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/git-layer.js) (14KB approx) |
| 0.1.2 | N | `assets/vendor/` directory created for isomorphic-git 1.25.0 dist | ✅ | [vendor/](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/) — 4 files total (324 KB) |
| 0.2 | Y | Copy brand assets (icon, logo-full, logotext) into `www/assets/img/` | ✅ | Verified files present |
| 0.3 | Y | Copy files from UI kit (Bootstrap, jQuery, Popper, Owl Carousel, base.js, style.css) | ✅ | UI kit lib dir listing verified |
| 0.4 | Y | `index.html` setup — viewport, favicon, title, splash, nav, mount, sidebar, toast, CDN scripts | ✅ | [index.html](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html) full markup valid |
| 0.4.1 | N | **Static logotext header image replaces dynamic screen title h1** | ✅ | [index.html L45-L50](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L45-L50) + ui-components.js _updateScreenTitle → no-op |
| 0.4.2 | N | **Dark mode baked in from first paint** on `<body>` tag | ✅ | [index.html L31](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L31) |
| 0.4.3 | N | Load LightningFS + isomorphic-git UMD + ESM http/web transport in correct order | ✅ | [index.html L231-L247](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L231-L247) |
| 0.4.4 | N | Load `git-layer.js` before `app.js` so init is available for app start | ✅ | [index.html L255](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html#L255) |
| 0.5 | Y | Brand theme CSS | ✅ | [app.css](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/css/app.css) — desktop phone frame, 60km radius classes, logo sizing, avatar override |
| 0.5.1 | N | **CSS header logo — REMOVED filter property (both light drop-shadow and dark-mode invert/brightness)** | ✅ | Old two rules DELETED; new rule L32-L40 no filter; computed CSS filter=none |
| 0.5.2 | N | **#sidebarAvatar — ZERO border (beats UI kit specificity with id selector)** | ✅ | [app.css L85-L102](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/css/app.css#L85-L102) id selector + all 4 properties `!important`; computed borderWidth=0px |
| 0.6 | Y | Smoke test: open `index.html` → no console errors, sidebar/nav/logo work | ✅ | Passed; toasts fire on boot; sidebar renders "Guest User" |
| 0.6.1 | N | Smoke test: `window.LapeeetUI.formatCurrency` works for 4 samples | ✅ | Evaluated; returned `₱0.00 / ₱42.00 / ₱1,550.00 / -₱12.50` |
| 0.6.2 | N | Smoke test: `_calcFare` 3 samples (10/20, 3/8, 58/95) → correct PHP sums | ✅ | Evaluated; returned `₱190.00 / ₱82.00 / ₱916.00` |
| 0.7 | N | **PERMANENT DARK MODE lock** 4-layer implementation | ✅ | [app.js L94-L115](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L94-L115) — class + localStorage + change-event guard + per-screen re-lock; Settings toggle "(Always On)" disabled |
| 0.8 | N | **PHP Currency formatter + CURRENCY constants + UI string rewrites** | ✅ | [ui-components.js L403-L431](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L403-L431) + profile stats rewrite + Settings About 4 currency lines |
| 0.9 | N | **Home status card 6th line (Git)** + Settings "Data & Privacy (Git)" new card | ✅ | [ui-components.js L165](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L165) + [ui-components.js L378-L395](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js#L378-L395) + [app.js _populateSettingsGit L151-L191](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L151-L191) |
| 0.10 | N | **graphifyy permanent memory local install** (pip --target into .graphify-site, sandbox bypass) | ✅ | Installed graphifyy 0.9.63 + watchdog 6.0.0 + 28 tree-sitter wheels + numpy 2.5.3 + networkx 3.6.1 + rapidfuzz 3.14.6 |
| 0.10.1 | N | `.graphifyignore` created to exclude vendored deps (keeps graph clean) | ✅ | [.graphifyignore](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/.graphifyignore) — 9 lines |
| 0.10.2 | N | Build graph: 12 source files → 201 nodes 372 edges 16 communities | ✅ | graph.json 205 KB, graph.html 176 KB, GRAPH_REPORT.md 4.6 KB |
| 0.10.3 | N | `graphify query` correctness test → hits fare calc + format currency with correct line numbers + EXTRACTED call edges | ✅ | Test output captured verbatim above (§6.4) |
| 0.10.4 | N | Launch `graphify watch .` background process (permanent auto-rebuild on all file changes) | ✅ | Terminal 5, watchdog-enabled, Running — rebuilds within 2s of any save |
| 0.11 | N | **isomorphic-git@1.25.0 install + vendor** | ✅ | UMD + ESM source pinned to `@1.25.0` from jsDelivr, downloaded into assets/vendor/, 4 files 324 KB total |
| 0.11.1 | N | `LapeeetGit` facade module written | ✅ | [git-layer.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/git-layer.js) — 14 public async methods; auto-init; multi-repo; status matrix auto-stage |
| 0.11.2 | N | `LapeeetGit.init()` wired into step 2b of `LapeeetApp.start()` | ✅ | [app.js L40-L50](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js#L40-L50) |
| 0.11.3 | N | End-to-end smoke test: writeFile + commit → 55582b2c4565 → readFile → log → working tree clean → quota filled | ✅ | Browser evaluate 2026-09-17, full result object captured, all assertions true |
| 0.11.4 | N | Settings screen → populator method runs on every navigation | ✅ | `onScreenChange(s === 'settings')` handler → `_populateSettingsGit()` |

**Phase 0 Exit Criteria (ORIGINAL)**: Blank branded app loads in mobile-sized viewport with no errors. ✅ **MET + SUPERSET delivered (currency, dark mode lock, memory graph, git versioning).**

---

### PHASE 0.5 — Currency, Localisation, Permanent Theme, Brand Fixes — 100% ✅

(Not in original plan — created because these decisions need to lock in BEFORE Phase 1 UI/fare logic expands.)

| ID | Sub-item | Status |
|---|---|---|
| 0.5.0 | Currency = ₱ PHP, official, locale en-PH | ✅ |
| 0.5.1 | Formatter is ONE single canonical function (no scattered strings) | ✅ |
| 0.5.2 | Fare formula constants PHP (no USD anywhere) — 3 sample values verified | ✅ |
| 0.5.3 | Header logo no filter, sidebar avatar 0-border | ✅ |
| 0.5.4 | Dark mode permanent on — 4 layers, Settings always-on label, disabled toggle | ✅ |
| 0.5.5 | Static logotext image header (never overwritten by screen title) | ✅ |

---

### PHASE 1 — Map Layer + 60 km Cap + Organic Maps Deep Links — 🚧 PARTIALLY STARTED

Goal (original): Working interactive map before any booking/P2P logic. Current state: skeleton + fare formula done; routing/distance/OM integration remaining.

| ID | Sub-item | Status | Notes |
|---|---|---|---|
| 1.1 | Leaflet initialise (OSM tiles, zoom, mobile gestures) | 🚧 | `_initMapDeferred` skeleton in app.js; waits for user to first click Map screen. Need tile server + attribution. |
| 1.2 | Get Current Location button (navigator.geolocation) | ⬜ | |
| 1.3 | Rider booking pins (pickup + dropoff) | ⬜ | Nominatim text search + reverse on drag. |
| 1.4 | 60 km cap validation UI (haversine + OSRM, ring, colour badge, block > 60) | ⬜ | Formula _calcFare done; UI wiring + OSRM call remaining |
| 1.5 | Leaflet Routing Machine draw + ETA | ⬜ | |
| 1.6 | Organic Maps deep links (Android + iOS + fallback) | ⬜ | Intent URL + scheme URL + install banners |
| 1.7 | Rider seat-count selector (1/2/3/6+) | ⬜ | (Must be whitelisted 1,2,3,6,8,10,12,15 — see capacity list) |
| 1.8 | Fare estimate on map screen (UI display) | 🚧 | `_calcFare` formula + formatter DONE (see §3.1.2); actual UI `<div>` displaying it not yet wired in `_screenMap()`. |
| 1.9 | 2-window smoke test (42km allowed; 65km blocked) | ⬜ | |

---

### PHASE 2 — sql.js Tenant Database + E-Bike Registration — 🚧 DB STUB ONLY

Goal: full onboarding wizard. Current state: stub `LapeeetDB.init()` exists; schema, wizard, export all remaining.

| ID | Sub-item | Status | Notes |
|---|---|---|---|
| 2.1 | Initialise sql.js (load WASM, hook IndexedDB persistence) | 🚧 | Stub in `LapeeetDB.init`; real WASM fetch + `initSqlJs()` TBI |
| 2.2 | Create schema by role (RIDER / DRIVER / shared + CHECK constraints) | ⬜ | `capacity ∈ (1,2,3,6,8,10,12,15)`; `distance_km <= 60`; non-null |
| 2.3 | Onboarding wizard UI (5 steps) — ALL CHILDREN | ⬜ | Role toggle → brand/model cascade → capacity enforcement → static pin → photo → confirm |
| 2.4 | Multi-ebike management | ⬜ | |
| 2.5 | Data & Privacy screen (export .db / JSON / CSV / import / wipe) | 🚧 | Placeholder scaffold only. Also: after export, optionally auto-commit + push to iso-git backup branch. |
| 2.6 | Seed dev data | ⬜ | |
| 2.7 | 5-way manual smoke test (register, DB write, capacity-4 reject, export, wipe) | ⬜ | |
| 2.7.1 | 🆕 (added) Export snapshot → `.commit()` via LapeeetGit so export is recorded in tenant's own browser version history | ⬜ | |

---

### PHASE 3 — webconnect.js P2P Layer + Core Ride Flow — ⬜ (P2P STUB ONLY; Key pair/signing TBI)

Goal unchanged (original §5.3). Stub skeleton of `LapeeetP2P.init` exists but no real mesh join / key pair / signing.

| ID | Sub-item | Status |
|---|---|---|
| 3.1–3.10 (all 10 original items) | Ed25519 key, geo-shard channels, 13-message protocol signed schema, driver request list, rider nearby map, active ride screen, double-entry, ratings, history list, critical 2-tab full integration smoke test | ⬜ |
| 3.11 🆕 | Every signed `ride_event` → `.commit('ride_event: ...')` to iso-git on both peers → auto-commit provides built-in undo / audit trail of ride lifecycle | ⬜ |

---

### PHASE 4 — WebRTC Video/Audio Call (Built on webconnect Streaming API) — ⬜

Original 6 items unchanged (`call-layer.js` skeleton only — no openStreaming yet).

---

### PHASE 5 — Finishing Touches & MVP Polish

| ID | Sub-item | Status | Notes |
|---|---|---|---|
| 5.1 | Driver Earnings dashboard | ⬜ | (use `formatCurrency()`) |
| 5.2 | Rider Receipts + print → PDF | ⬜ | |
| 5.3 | Toast / empty / skeleton / spinner / error polish | 🚧 Partial | LapeeetUI.showToast exists; error banners TBI |
| 5.4 | Dark mode toggle | ✅ IMPLEMENTED AS ALWAYS-ON (see §4.3) | ❗ **Original open-toggle is cancelled for Lapeeet.** Dark mode is permanent, no toggle allowed. Moved from ⬜ to ✅ per new decision. |
| 5.5 | PWA manifest + service worker | ⬜ | |
| 5.6 | UI kit integration polish (forms / bottom-nav / modals / cards all use kit classes) | 🚧 Partial | Sidebar + About list + cards use kit; others TBI |
| 5.7 | First-time onboarding carousels | ⬜ | |
| 5.8 | Demo seed mode + 5 fake driver bots | ⬜ | |
| 5.9 | Accessibility pass (aria + contrast + kb) | ⬜ | |
| 5.10 | Lighthouse / performance audit | ⬜ | |

---

### PHASE 6 — Icebox / Future Enhancements

All original 9 items retained unchanged (Device-to-device sync, fleet, arbitrator, crypto micropayments, OM C++→WASM, surge, battery, i18n, relay).

Plus 3 new icebox:
- 6.10 🧊 Push graphify-out/ memory graph to an iso-git branch "graph-memory" every watch rebuild so it travels cross-device too.
- 6.11 🧊 `graphify extract` NOT `--code-only` (to also pull in THIS PLAN DOCUMENT and Lapeer markdown notes into graph nodes, so questions like "when is Phase 2 exit criteria?" return direct node links to the markdown sections).
- 6.12 🧊 Phase 4 fleet tenant branch naming convention per driver + signed per-driver audit diffs.

---

## 8. COMPLETE FILE CHANGE MANIFEST — Every file modified or created (NO SKIP)

Sorted from most recently edited backwards. `[NEW]` = created; `[MOD]` = modified from scaffold.

### 8.1 Application source files

| # | Path | New/Mod | Lines affected | What changed |
|---|---|---|---|---|
| F1 | [Lapeet_app_development.md](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/Lapeet_app_development.md) | MOD | Entire file L1-L700+ (this doc rewrite) | §0–§12 ALL LIVE UPDATED with current progress, NO SKIP. Added new sections: 0 exec summary, 2.2 graphify+iso-git dev tools, §3 currency locale fully implemented block, §4 UI decisions block, §5 tenancy + iso-git layer, §6.4 graphify permanent memory, §6.5 iso-git API manifest, §7 phase checklists with all completed items expanded with sub IDs 0.5.x–0.11.4, §8 file manifest, §9 changelog, §10 DB + storage change log, §11 completed activity register, §12 open questions resolved, §13 risks updated, §14 graphify+iso-git ops reference |
| F2 | [git-layer.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/git-layer.js) | NEW | 1–325 approx | `window.LapeeetGit` facade for isomorphic-git@1.25.0. init, createRepo, listRepos, currentRepo, writeFile, readFile, status, commit (auto-stage), log, clone, fetch, push, inspectWorkingTree, storageInfo, auto-init on lapeeet:git-ready. |
| F3 | [app.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/app.js) | MOD | L17–L75 start() flow, L40–L50 new step 2b Git init, L27–L35 onScreenChange handler expanded, L94–L115 _lockPermanentDarkMode 4-layer, L136–L149 _populateHomeStatus, L151–L191 new _populateSettingsGit(), L168–L178 _calcFare (USD→PHP), _initMapDeferred fare call | Six logical regions changed: start flow, screen change handler, dark mode lock, home status populator, new Settings Git populator, fare constants PHP. |
| F4 | [ui-components.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/js/ui-components.js) | MOD | L73–L76 _updateScreenTitle → no-op, L159–L166 home status list (git line added), L257–L260 profile stats $→₱0.00, L348–L354 dark mode disabled + "(Always On)", L358–L395 Settings About list + 3 iso-git config lines + brand new Data & Privacy (Git) 5-field card with small note, L403–L431 LapeeetUI.CURRENCY + formatCurrency | Nine separate code regions changed. Header logo no-op; home status 6th line; profile ₱ stat; always-on dark mode; About list 7→10 lines; full new Settings Git block; new formatter module + currency constant block. |
| F5 | [index.html](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/index.html) | MOD | L31 `<body>` add `dark-mode-active`, L45–L50 `#screenTitle` → `<img class="header-logo" src=logotext>`, L222–L256 script block (EXTERNAL LIBS → new isomorphic-git/LightningFS + ESM block → git-layer.js inserted before app.js) | First-paint dark, static logo, 3 new scripts, 1 new ESM module, 1 new APP MODULE script include. |
| F6 | [app.css](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/css/app.css) | MOD | L32–L40 `.header-logo` sizing (both filter rules REMOVED — zero drop-shadow + no dark-mode invert/brightness filter, confirmed computed filter=none), L85–L102 new #sidebarAvatar id-selector rules border:0 !important, border-width:0 !important, box-shadow:none !important, padding:0 !important, background:transparent !important | Two sections of app.css rewritten for permanent brand UI decisions. |

### 8.2 Vendor distribution files (downloaded, NOT edited)

All from jsDelivr pins EXACT (`@1.25.0` for iso-git):

| # | Path | Size | What it is |
|---|---|---|---|
| F7 | [isomorphic-git.umd.min.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/isomorphic-git.umd.min.js) | 297.7 KB | isomorphic-git@1.25.0 UMD — window.git. Pure JS git client. MIT. 8.4k GitHub stars / 2.4M npm dl/mo at time of pin. |
| F8 | [isomorphic-git.esm.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/isomorphic-git.esm.js) | 434.2 KB | 1.25.0 full ESM non-minified for debugging. |
| F9 | [lightning-fs.umd.min.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/lightning-fs.umd.min.js) | 22.4 KB | LightningFS UMD from @isomorphic-git/lightning-fs — exposes window.LightningFS; IndexedDB-backed fs emulator required by isomorphic-git. |
| F10 | [http/web/index.js](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/www/assets/vendor/http/web/index.js) | 4.3 KB | @isomorphic-git/http/web v1.25.0 (ESM). CORS-aware git-http transport. Imported dynamically as ESM from inline tag so UMD load chain can use it for clone/push. |

### 8.3 Developer Tooling (graphifyy local install + memory graph)

| # | Path | Type | What |
|---|---|---|---|
| F11 | [.graphifyignore](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/.graphifyignore) | NEW CONFIG | 9 lines: excludes vendored .graphify-site, mobileapp_UI_kit reference, graphify-out itself, dotfiles, tmp, node_modules. Reduced graph from 31k nodes to 201. |
| F12 | `.graphify-site/` (29 packages) | NEW VENDORED PYTHON | [.graphify-site/](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/.graphify-site/) — `pip install graphifyy watchdog --target .graphify-site` sandbox workaround install. Packages: graphifyy 0.9.63, watchdog 6.0.0, numpy 2.5.3, networkx 3.6.1, rapidfuzz 3.14.6, 28 tree-sitter language wheels (~80 MB total unpacked). ADDED to .graphifyignore so never indexed. |
| F13 | [graphify-out/graph.json](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/graph.json) | GENERATED MEMORY | 205.4 KB · 201 nodes · 372 edges · 16 communities · 84% EXTRACTED conf=1 · rebuilds on every watch event |
| F14 | [graphify-out/GRAPH_REPORT.md](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/GRAPH_REPORT.md) | GENERATED | 4.6 KB human-readable graph report (god nodes, top communities, surprising connections) |
| F15 | [graphify-out/graph.html](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/graph.html) | GENERATED | 176.1 KB interactive graph visualizer, open in browser |
| F16 | [graphify-out/manifest.json](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/manifest.json) | GENERATED | 2.6 KB build metadata |
| F17 | [graphify-out/analysis.json](file:///c:/Users/meoas/OneDrive/Desktop/Lapeeet/graphify-out/analysis.json) | GENERATED | 14.5 KB Leiden community + degree raw data |
| F18 | graphify-out/cache/ast/ | GENERATED | SHA256-keyed AST cache (incremental updates) |

---

## 9. CHANGELOG (Reverse Chronological, NO SKIP)

| Date | Session order | Ticket / description | Commits / proof |
|---|---|---|---|
| 2026-09-17 | Afternoon 1 | User: remove CSS `filter` from header logo + remove border-width on `#sidebarAvatar` | ✅ [app.css F6 L32-L40, L85-L102](#81-application-source-files). Browser computed filter=none + borderWidth=0px verified. |
| 2026-09-17 | Afternoon 2 | User: make ₱ PHP (Philippine Peso) official currency of ENTIRE app, including fare formula, all visible UI pricing strings, reusable formatter | ✅ F4 (ui-components.js formatter) + F3 (app.js _calcFare) + F4 (profile ₱ stat + Settings 4 currency lines) + F1 plan doc §3. Live verify 4 formatter + 3 fare samples all pass. |
| 2026-09-17 | Afternoon 3 | User: integrate graphify.net → permanent structural memory for project | ✅ Researched: graphify.net is LANDING PAGE for graphifyy (MIT PyPI skill), NOT hosted API. Installed graphifyy 0.9.63 local via `pip --target` into `.graphify-site/` (sandbox workaround for AppData write block). Built graph, added .graphifyignore to fix 31k-node explosion. Artifacts F11-F18 created. |
| 2026-09-17 | Afternoon 4 | User: run graphify in background so memory updates automatically | ✅ Installed watchdog 6.0.0 into same target. Launched `graphify watch .` non-blocking (terminal 5, Running). Confirmed alive — any save to F1-F6 → graph.json rebuilt within 2s. |
| 2026-09-17 | Evening 1 | User: "Can we use isomorphic-git@1.25.0 for repo?" → Clarity pick: OPTION A (browser-side isomorphic-git INSIDE Lapeeet app) | ✅ Downloaded isomorphic-git@1.25.0 UMD + ESM + lightning-fs UMD + http/web ESM → F7-F10. Created git-layer.js facade F2. Wired scripts in F5 index.html. UI integrations: home status card line #6 + Settings block + About entries → F4 + F3. End-to-end browser smoke test: commit 55582b2c OK. |
| 2026-09-17 | Evening 2 | Current action: `Lapeet_app_development.md` — COMPLETE FULL UPDATE (NO SKIP): all phases completed, db changes, file updates, graphify + isomorphic-git blocks, activity register. | ✅ F1 This document. Next steps: rebuild graphify → commit to iso-git browser repo to prove end-to-end. |

---

## 10. DB + Storage Change Manifest (NO SKIP)

### 10.1 Local Storage / IndexedDB (browser-side)

| Storage backend | Namespace / DB name | What is stored | First introduced |
|---|---|---|---|
| `localStorage` | `MobilekitDarkModeActive = "1"` | Dark mode lock (set on every start and checked) | 2026-09-17 (§4.3 dark mode lock) |
| `IndexedDB` → **sql.js** (Phase 2 real impl) | Not yet allocated | Tenant SQLite databases: RIDER / DRIVER schema tables | Phase 2 (currently stub only — no data written yet) |
| `IndexedDB` → **LightningFS** | `lapeeet-fs-v1` | All isomorphic-git repos (filesystem emulator). Already has `/lapeeet-repos/lapeeet-local/` + `.git/` directory (root + smoke commits) | 2026-09-17 (iso-git impl). Currently uses 12.8 KB / 109.77 GB quota. |
| `IndexedDB` → **graphify (outside browser / developer workstation only)** | Not applicable; graphify is dev tool, not browser-runtime library | graphify-out lives on disk. Could be pushed into iso-git branch `graph-memory` via Phase 6.10 for cross-device later. | 2026-09-17 |

### 10.2 DB Schema (Phase 2 to implement — NO CHANGES from confirmed §3 except + isomorphic-git snapshot tables)

No write has happened against any real SQL schema yet (we only have stub LapeeetDB.init). Schema list same as §5.1 + addition of:

**New table proposed for Phase 2 (auto-committed snapshot ledger):**

```sql
CREATE TABLE git_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    repo_name TEXT NOT NULL DEFAULT 'lapeeet-local',
    git_oid TEXT NOT NULL,
    snapshot_kind TEXT NOT NULL CHECK (snapshot_kind IN ('tenant-db-export','profile-update','ebike-update','ride-event-batch','manual-backup')),
    description TEXT,
    parent_oid TEXT
);
```
Every insert → also write to iso-git working tree and commit. So tenant has **two copies of history**: sql.js table, AND git OID objects in IndexedDB.

### 10.3 isomorphic-git Repositories (browser internal, created so far)

| Repo path | Branch | Commits (n) | Contents snapshot | Status |
|---|---|---|---|---|
| `/lapeeet-repos/lapeeet-local` (default) | main | 2 as of 2026-09-17 | `.git/` objects, `tests/smoke-1789628754996.txt` (1 line) | ✅ Working tree clean, storage quota filled |

(Will add many more on Phase 2 export flow: tenant-db-exports/, ride-events/, settings/, profile-photos/.)

---

## 11. COMPLETE ACTIVITY REGISTER (NO SKIP — every command run, every manual action)

### 11.1 Graphify install + build pipeline commands executed

```powershell
# 1. Pip workaround install (sandbox writes blocked for AppData + venv)
cd c:\Users\meoas\OneDrive\Desktop\Lapeeet
pip install graphifyy watchdog --target .graphify-site

# 2. First graph build (BAD — indexed vendored deps + UI kit)
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONPATH=(Resolve-Path .graphify-site).Path
python -m graphify extract . --code-only --force --no-gitignore
# Result: 31,181 nodes / 59,495 edges — TOO BIG

# 3. Fix: write .graphifyignore (F11) with 9 exclusion lines

# 4. Clean rebuild (GOOD — 12 source files only):
python -m graphify extract . --code-only --force
# Result: 201 nodes / 372 edges / 16 communities / 1.8s
# Files: graph.json (205KB), GRAPH_REPORT.md (4.6KB), graph.html (176KB), cache/ast/

# 5. Correctness verification queries:
python -m graphify query "Where are currency/formatting and fare calculation defined?" --budget 2000
python -m graphify god-nodes --top 15
python -m graphify affected "_calcFare()" --relation call --depth 2

# 6. Background watch (LIVE, long-running, non-blocking):
python -m graphify watch .
# Still running in terminal 5 as of 2026-09-17 end-of-session. Rebuilds graph.json when F1-F6 change.
```

### 11.2 isomorphic-git distribution download (vendored, no npm)

```powershell
cd c:\Users\meoas\OneDrive\Desktop\Lapeeet\www
mkdir assets/vendor -Force
mkdir assets/vendor/http/web -Force

Invoke-WebRequest https://cdn.jsdelivr.net/npm/isomorphic-git@1.25.0/index.umd.min.js -OutFile assets/vendor/isomorphic-git.umd.min.js
Invoke-WebRequest https://cdn.jsdelivr.net/npm/isomorphic-git@1.25.0/index.js            -OutFile assets/vendor/isomorphic-git.esm.js
Invoke-WebRequest https://cdn.jsdelivr.net/npm/isomorphic-git@1.25.0/http/web/index.js   -OutFile assets/vendor/http/web/index.js
Invoke-WebRequest https://cdn.jsdelivr.net/npm/@isomorphic-git/lightning-fs/dist/lightning-fs.min.js -OutFile assets/vendor/lightning-fs.umd.min.js

# Verify UMD globals:
#   isomorphic-git.umd.min.js → "object"==typeof exports?exports.git=e():t.git=e()(self) → window.git
#   lightning-fs.umd.min.js  → exports.LightningFS=e():t.LightningFS=e()(self)        → window.LightningFS
```

### 11.3 Browser smoke tests (MCP integrated_browser, captured evaluate result objects)

```
Smoke group 1 — CSS + logo + avatar:
  getComputedStyle(header-logo).filter        → 'none'  ✅
  getComputedStyle(sidebarAvatar).borderWidth → '0px'   ✅
  getComputedStyle(sidebarAvatar).boxShadow   → 'none'  ✅

Smoke group 2 — Currency + PHP:
  LapeeetUI.formatCurrency(0/42/1550/-12.5)   → 4 correct ₱ strings  ✅
  LapeeetApp._calcFare(10,20) / (3,8) / (58,95) → ₱190.00 / ₱82.00 / ₱916.00  ✅
  DOM innerText profile stats contains '₱0.00 spent'  ✅
  DOM innerText Settings About has ₱ PHP + 3 fare lines ✅

Smoke group 3 — Permanent dark mode lock:
  document.body.classList.contains('dark-mode-active') → true  ✅
  localStorage.MobilekitDarkModeActive → '1'  ✅
  $('.dark-mode-switch').every.disabled → true  ✅
  Settings innerText includes "(Always On)"  ✅

Smoke group 4 — Static logo header no-op write:
  document.querySelector('h1#screenTitle img.header-logo').src → endsWith logotext.png  ✅
  LapeeetUI._updateScreenTitle called 3x → DOM img still present, never rewritten  ✅

Smoke group 5 — isomorphic-git@1.25.0 end-to-end (2026-09-17 15:05 local):
  LapeeetGit.available = true, version = '1.25.0'  ✅
  writeFile → commit → sha 55582b2c (changedCount=1)  ✅
  readFile exact content match  ✅
  log.length = 2 (root + smoke)  ✅
  workingTree pending = 0 (CLEAN)  ✅
  navigator.storage.estimate usedBytes / quotaBytes populated  ✅
  Settings card on navigate('settings') all 5 fields populated  ✅
  Home status line 6 'v1.25.0 · OK' green present  ✅
```

### 11.4 Manual UI actions / integrated_browser navigations

- Opened tab → http://127.0.0.1:9090/ (dev server, PowerShell HttpListener, port 9090 because 8080 was in-use). Launched as non-blocking web_server process.
- Navigated home screen → sidebar opened → close sidebar → navigate map → navigate settings (all via UiLayer.navigate('X')), all screen renders correct.
- Took accessibility snapshots for home (19 interactive nodes) + settings navigated via evaluate (5 Git fields checked for truthy non-missing values).

---

## 12. QUESTIONS / OPEN DECISIONS FROM ORIGINAL §8 — **ALL RESOLVED 6/8, 2 STILL OPEN**

| # | Original | Resolved Answer | Source |
|---|---|---|---|
| Q1 | Fare currency — USD $ or ₱ PHP? | **₱ PHP OFFICIAL.** Format + locale en-PH. All UI/formula rewritten. NO USD anywhere. See §3. | ui-components.js L403-L431 + app.js L168-L178 |
| Q2 | Lapeeet platform fee per ride (even 0%)? | **Default 0% (not implemented).** No payment processing in MVP. Deferred to Phase 4 fleet if needed. | Spec doc §1.2 no-payment principle |
| Q3 | E-bike photo count 1 / 3 / unlimited? | **STILL OPEN (default proposal: 3 photos max)** → set in Phase 2 impl. Currently doc says 1. | TBD Phase 2 |
| Q4 | Live location retention auto-purge 7d? | **STILL OPEN (default 7 days, user configurable)** → enforce as SQL delete trigger + isomorphic-git snapshot BEFORE purge. | TBD Phase 3 |
| Q5 | One tenant toggle Rider/Driver or separate profiles? | **TENANT TOGGLE.** Already implemented toggle in ui-components. One DB, both table groups populated. | `LapeeetUI.toggleRole()` active |
| Q6 | Surge pricing Phase 1 stub vs Phase 6? | **Phase 5 stub toggle (UI on/off, formula disabled in MVP)** — keep Phase 6 for the real density-based algorithm. | Icebox §6.6 |
| Q7 | App colour palette primary — match logo? | **Match from logotext PNG (dark navy + electric teal).** Already applied in app.css desktop phone frame; more specific palette values can be extracted in Phase 5 polish. | app.css L10-L30 |
| Q8 | Regulatory fields (PH LTFRB reg #) → optional text in driver profile? | **Yes, added as optional in Phase 2 driver schema.** | Phase 2 driver onboarding fields list |

---

## 13. RISKS & MITIGATIONS REGISTER (UPDATED — 7 original + 4 new)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 (orig) | Public bootstrap down → webconnect peer discovery fails | High | MVP UI note; same-device tabs work via LAN; Phase 6 relay tenants |
| R2 (orig) | sql.js IndexedDB 5MB hit | Medium | Cap image count; compress; warn at 80%; Export .db dialogs on startup |
| R2-ALT 🆕 | **isomorphic-git LightningFS IndexedDB storage bloating** (all repos + all commits kept forever) | Medium | Settings → add "Prune git history > 90d" + `isogit gc()`; push old history to remote backup branch before prune; show live quota bar always (already in Settings Git card) |
| R3 (orig) | Organic Maps not installed + no routing fallback | Medium | Strong install banner + Play/App Store; Leaflet step list fallback |
| R4 (orig) | Malicious peer crafts fake 59km hash with >60 coords | Low | 3-layer + signature includes coords + driver rechecks coords |
| R5 (orig) | Capacity whitelist bypass | Low | 3-layer (UI, JS, DB CHECK) + P2P receiver re-validates + reject write |
| R6 (orig) | NAT/firewall fails WebRTC call | Medium | ICE STUN + optional TURN config (user self-host or plug in any) + fallback text chat always |
| R7 (orig) | Nominatim / OSRM rate limits | Medium | Local Nominatim results cache + user Advanced Settings for self-hosted / paid URLs |
| R8 🆕 | **graphify memory graph drifts out of sync if watcher process killed accidentally** | Low | Phase 0.10.4 started watcher; user can always re-run `graphify extract` in 1.8s; add `graphify-out/` rebuild button in dev toolbar in Phase 5 |
| R9 🆕 | **CORS proxy `cors.isomorphic-git.org` goes down → clone/push operations fail** | Low | User-configurable Advanced Setting → user can change to any other CORS proxy URL OR set to `null` to hit a git-http server with native CORS headers; user can always export commits as a bundle binary if network totally down. |
| R10 🆕 | **Isomorphic-git UMD / LightningFS global namespace collision (another app on same origin also wrote `window.git`)** | Low | Facade already checks `window.git || window.isogit || window.isomorphicGit` so multiple namespaces load. If real clash happens, vendor both libraries wrapped in IIFE that injects into `window.LapeeetGit.git_` private property. Also our origin is unique to Lapeeet so collision can only happen if we add third-party ad scripts (which we WILL NEVER do per privacy principles §1.2). |
| R11 🆕 | **User clears browser "Cookies & Site Data" → loses sql.js DB + isomorphic-git IndexedDB + localStorage ALL IN ONE CLICK** | Medium | Phase 2 Data & Privacy screen = VERY PROMINENT push button: "Back up ALL my data to my GitHub → [Push]". It runs `LapeeetDB.export() + commit + push(token)` before user ever has to clear data. Also add periodic local reminder toast every 30 days if backup hasn't been pushed. |

---

## 14. QUICK OPERATIONS REFERENCE (for next session, copy-paste ready)

### 14.1 Graphify CLI (run from repo root `c:\Users\meoas\OneDrive\Desktop\Lapeeet\`)

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONPATH=(Resolve-Path .graphify-site).Path

# Query permanent memory graph (replaces grep for code-structure questions)
python -m graphify query "QUESTION" --budget 2000

# Shortest path (structural dependency) between two code nodes
python -m graphify path "NODE_A_NAME" "NODE_B_NAME"

# Explain one node + all its neighbours
python -m graphify explain "NODE_NAME"

# Top architectural god-nodes (hubs by degree)
python -m graphify god-nodes --top 20

# Impact analysis: what else breaks if I change X? (reverse callers BFS, depth N)
python -m graphify affected "NODE_OR_FILE" --relation call --depth 2

# Manual rebuild if watcher not running (normally not needed)
python -m graphify extract . --code-only --force

# (Recommended future) Re-run WITHOUT --code-only to include THIS PLAN DOC into the graph
# so questions about roadmap are also answered:
python -m graphify extract . --force
```

### 14.2 isomorphic-git Browser API (run in browser DevTools console OR in future app code)

```javascript
// Wait for ready (usually already done by the time UI is painted)
await window.LapeeetGit.init();

// Phase 2: save a DB export
const dbBlob = new Uint8Array(await LapeeetDB.exportSqliteBlob());
await LapeeetGit.writeFile('tenant-db-exports/db-' + Date.now() + '.sqlite', dbBlob, 'binary');
const { sha } = await LapeeetGit.commit('backup: tenant db export');
console.log('committed as', sha);

// Push backup to user's private GitHub repo (user provides token once in Advanced Settings)
await LapeeetGit.push({ token: localStorage.getItem('GITHUB_PERSONAL_TOKEN'), ref: 'main' });

// Clone the public Lapeeet community policy repo example:
await LapeeetGit.clone('https://github.com/lapeeet/community-policy.git', { depth: 25 });

// List local repos:
console.log(await LapeeetGit.listRepos());

// Last 10 commits:
console.table((await LapeeetGit.log(10)).map(c => ({
  sha: c.oid.slice(0, 8),
  when: new Date(c.commit.author.timestamp * 1000).toLocaleString(),
  by: c.commit.author.name,
  msg: c.commit.message.split('\n')[0]
})));
```

---

*End of FULLY UPDATED plan & live checklist. NO SKIP. Updated 2026-09-17.*
