# Graph Report - Lapeeet  (2026-09-17)

## Corpus Check
- 13 files · ~25,613 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 5, (none) 1, .psd 1)

## Summary
- 272 nodes · 435 edges · 12 communities
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist
- app.js
- db-layer.js
- map-layer.js
- ui-components.js
- git-layer.js
- build-single.py
- p2p-layer.js
- call-layer.js
- check-dist.js
- base.js
- 3.1 Official Currency — Philippine Peso `₱ PHP`

## God Nodes (most connected - your core abstractions)
1. `_needInit()` - 18 edges
2. `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` - 16 edges
3. `Lapeeet — Development Phases (Single-File Live P2P)` - 12 edges
4. `start()` - 11 edges
5. `_renderScreen()` - 11 edges
6. `_run()` - 10 edges
7. `Phase 1 — Map + 60 km Gate + Organic Maps` - 9 edges
8. `7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip)` - 9 edges
9. `_initMapDeferred()` - 7 edges
10. `_calcFare()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `0. Executive Summary of Work Done So Far` --references--> `_calcFare()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/app.js
- `6.2 Trip Distance Cap (60 km max) — still valid 4-layer enforcement plan (Phase 1 impl partial)` --references--> `_calcFare()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/app.js
- `Phase 3 — webconnect.js P2P Core Ride Flow` --references--> `appendEvent()`  [INFERRED]
  DEVELOPMENT_PHASES.md → www/assets/js/db-layer.js
- `Phase 1 — Map + 60 km Gate + Organic Maps` --references--> `flyToCurrentLocation()`  [INFERRED]
  DEVELOPMENT_PHASES.md → www/assets/js/map-layer.js
- `Phase 1 — Map + 60 km Gate + Organic Maps` --references--> `clearPins()`  [INFERRED]
  DEVELOPMENT_PHASES.md → www/assets/js/map-layer.js

## Import Cycles
- None detected.

## Communities (12 total, 0 thin omitted)

### Community 0 - "Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist"
Cohesion: 0.05
Nodes (39): 0. Executive Summary of Work Done So Far, 10.1 Local Storage / IndexedDB (browser-side), 10.2 DB Schema (Phase 2 to implement — NO CHANGES from confirmed §3 except + isomorphic-git snapshot tables), 10.3 isomorphic-git Repositories (browser internal, created so far), 10. DB + Storage Change Manifest (NO SKIP), 11.1 Graphify install + build pipeline commands executed, 11.2 isomorphic-git distribution download (vendored, no npm), 11.3 Browser smoke tests (MCP integrated_browser, captured evaluate result objects) (+31 more)

### Community 1 - "app.js"
Cohesion: 0.10
Nodes (33): Phase 1 — Map + 60 km Gate + Organic Maps, 4.3 Dark Mode — PERMANENT ON (NOT a toggle), 7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip), PHASE 0.5 — Currency, Localisation, Permanent Theme, Brand Fixes — 100% ✅, PHASE 0 — Project Scaffolding & Static Setup — **100% ✅ COMPLETED**, PHASE 1 — Map Layer + 60 km Cap + Organic Maps Deep Links — 🚧 PARTIALLY STARTED, PHASE 2 — sql.js Tenant Database + E-Bike Registration — 🚧 DB STUB ONLY, PHASE 3 — webconnect.js P2P Layer + Core Ride Flow — ⬜ (P2P STUB ONLY; Key pair/signing TBI) (+25 more)

### Community 2 - "db-layer.js"
Cohesion: 0.14
Nodes (32): _all(), appendEvent(), b64ToU8(), createEbike(), deleteEbike(), exportBinary(), exportJSON(), geoGet() (+24 more)

### Community 3 - "map-layer.js"
Cohesion: 0.15
Nodes (25): _afterPinChange(), buildOrganicMapsDeepLink(), calculateRoute(), classifyDistance(), clearPins(), clearRoute(), _createMap(), drawMaxRadius() (+17 more)

### Community 4 - "ui-components.js"
Cohesion: 0.17
Nodes (21): PHASE 5 — Finishing Touches & MVP Polish, _bindScreenEvents(), _escapeAttr(), _escapeHtml(), formatCurrency(), init(), navigate(), _placeholderCard() (+13 more)

### Community 5 - "git-layer.js"
Cohesion: 0.12
Nodes (14): 5.1 Tenant Roles, 5.2 Tenancy Guarantees (UPDATED — 6 guarantees now, last two new), 5.3 Data Sharing Boundaries (same as original §3.3 — unchanged), 5. User-Hosted Tenancy Model (Updated With isomorphic-git Versioned Snapshot Layer), commit(), createRepo(), _ensureRepo(), fetch() (+6 more)

### Community 6 - "build-single.py"
Cohesion: 0.17
Nodes (13): argparse, base64, mimetypes, Path, pathlib, re, sys, build() (+5 more)

### Community 7 - "p2p-layer.js"
Cohesion: 0.07
Nodes (13): 0. Live vs Dev separation (locked), Icebox (not MVP), Lapeeet — Development Phases (Single-File Live P2P), Ops (dev workstation only), Phase 0 — Single-File Shell, Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes, Phase 3 — webconnect.js P2P Core Ride Flow, Phase 4 — Call + Chat (+5 more)

### Community 8 - "call-layer.js"
Cohesion: 0.19
Nodes (7): endCall(), init(), TODO: localStream.getAudioTracks()[0].enabled = !enabled, TODO: video tracks, TODO: flip remote audio element to speaker/earpiece, _setState(), startCall()

### Community 9 - "check-dist.js"
Cohesion: 0.17
Nodes (10): ref_fs, ref_path, ref_vm, fs, path, VL, all, fs (+2 more)

### Community 10 - "base.js"
Cohesion: 0.29
Nodes (5): offlineMode(), offlineModeToast(), onlineMode(), onlineModeToast(), toastbox()

### Community 11 - "3.1 Official Currency — Philippine Peso `₱ PHP`"
Cohesion: 0.33
Nodes (6): 3.1.1 Canonical formatter — ONE location, all code calls this, 3.1.2 Fare formula (updated to PHP constants, no USD anywhere), 3.1.3 UI Strings updated to ₱ PHP, 3.1 Official Currency — Philippine Peso `₱ PHP`, 3.2 Locale — `en-PH` (English — Philippines), 3. Currency & Locale (CONFIRMED — FULLY IMPLEMENTED)

## Knowledge Gaps
- **52 isolated node(s):** `fs`, `path`, `VL`, `fs`, `vm` (+47 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 109 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` connect `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` to `app.js`, `3.1 Official Currency — Philippine Peso `₱ PHP``, `git-layer.js`?**
  _High betweenness centrality (0.307) - this node is a cross-community bridge._
- **Why does `Phase 3 — webconnect.js P2P Core Ride Flow` connect `p2p-layer.js` to `db-layer.js`, `map-layer.js`, `ui-components.js`?**
  _High betweenness centrality (0.283) - this node is a cross-community bridge._
- **Why does `formatCurrency()` connect `ui-components.js` to `p2p-layer.js`?**
  _High betweenness centrality (0.180) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `VL` to the rest of the system?**
  _52 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09682539682539683 - nodes in this community are weakly interconnected._
- **Should `db-layer.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13949579831932774 - nodes in this community are weakly interconnected._