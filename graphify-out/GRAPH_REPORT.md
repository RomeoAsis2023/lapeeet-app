# Graph Report - Lapeeet  (2026-09-17)

## Corpus Check
- 32 files · ~49,049 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 183 file(s) not represented in the graph (top: (none) 134, .data 43, .css 5)

## Summary
- 590 nodes · 1076 edges · 22 communities (21 shown, 1 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 71 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d719712d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dependencies
- app.js
- db-layer.js
- map-layer.js
- ui-components.js
- git-layer.js
- build-single.py
- p2p-layer.js
- call-layer.js
- ref_fs
- Lapeeet — dev_phases.md (master plan, no skips)
- Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist
- manifest.json
- auth-layer.js
- check-auth.js
- check-webauthn.js
- check-mode.js
- check-wiring.js
- check-p2p.js
- check-guard.js
- converge.js

## God Nodes (most connected - your core abstractions)
1. `start()` - 24 edges
2. `_needInit()` - 23 edges
3. `Lapeeet — dev_phases.md (master plan, no skips)` - 22 edges
4. `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` - 16 edges
5. `sendDirect()` - 14 edges
6. `_renderScreen()` - 13 edges
7. `_onP2PEvent()` - 12 edges
8. `_render()` - 12 edges
9. `_run()` - 12 edges
10. `Lapeeet — Development Phases (Single-File Live P2P)` - 12 edges

## Surprising Connections (you probably didn't know these)
- `0. Executive Summary of Work Done So Far` --references--> `_calcFare()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/app.js
- `6.2 Trip Distance Cap (60 km max) — still valid 4-layer enforcement plan (Phase 1 impl partial)` --references--> `_calcFare()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/app.js
- `Phase 4 — Call + Chat` --references--> `attachMesh()`  [INFERRED]
  DEVELOPMENT_PHASES.md → www/assets/js/call-layer.js
- `PHASE 5 — Finishing Touches & MVP Polish` --references--> `formatCurrency()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/ui-components.js
- `Lapeeet — dev_phases.md (master plan, no skips)` --references--> `main()`  [INFERRED]
  dev_phases.md → tools/build-single.py

## Import Cycles
- None detected.

## Communities (22 total, 1 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.18
Nodes (11): dependencies, blockstore-fs, blockstore-idb, @chainsafe/libp2p-yamux, helia, libp2p, @libp2p/identify, @libp2p/noise (+3 more)

### Community 1 - "app.js"
Cohesion: 0.07
Nodes (66): Phase 6 — `?mode=` Role Deep Links ✅ DONE, _bindAutocomplete(), _bindCapacityDropdown(), applyFocus(), open(), _bindDataScreen(), _bindEbikeScreen(), _bindHomeScreen() (+58 more)

### Community 2 - "db-layer.js"
Cohesion: 0.12
Nodes (40): Phase 10 — Rich Profile (avatar + first/last + email) ✅ DONE, Phase 3 — webconnect.js P2P Ride Flow ✅ DONE (code; field test pending), _all(), appendEvent(), b64ToU8(), createEbike(), deleteEbike(), displayName() (+32 more)

### Community 3 - "map-layer.js"
Cohesion: 0.06
Nodes (56): Phase 12 — Home Nearby Map + Realtime Peer Discovery ✅ DONE (code; 2-device field test pending), 0. Live vs Dev separation (locked), Icebox (not MVP), Lapeeet — Development Phases (Single-File Live P2P), Ops (dev workstation only), Phase 0 — Single-File Shell, Phase 1 — Map + 60 km Gate + Organic Maps, Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes (+48 more)

### Community 4 - "ui-components.js"
Cohesion: 0.12
Nodes (28): Phase 1 — Map + 60km Gate + Organic Maps ✅ DONE, 4.1 Header — static logotext image, never overwritten by screen title, 4.2 Sidebar avatar — ZERO border, ZERO shadow, ZERO padding, transparent bg, 4.3 Dark Mode — PERMANENT ON (NOT a toggle), 4. Permanent UI Decisions (CONFirmed by code & tested live), flyToCurrentLocation(), _bindScreenEvents(), _earningsCard() (+20 more)

### Community 5 - "git-layer.js"
Cohesion: 0.12
Nodes (14): 5.1 Tenant Roles, 5.2 Tenancy Guarantees (UPDATED — 6 guarantees now, last two new), 5.3 Data Sharing Boundaries (same as original §3.3 — unchanged), 5. User-Hosted Tenancy Model (Updated With isomorphic-git Versioned Snapshot Layer), commit(), createRepo(), _ensureRepo(), fetch() (+6 more)

### Community 6 - "build-single.py"
Cohesion: 0.14
Nodes (16): argparse, base64, mimetypes, Path, pathlib, re, shutil, sys (+8 more)

### Community 7 - "p2p-layer.js"
Cohesion: 0.09
Nodes (45): Phase 13 — Passenger-Only Requests + Driver Offer Dialogs + First-Accept-Wins ✅ DONE (code; 3-device field test pending), broadcast(), _canonical(), _currentLoc(), _dispatch(), _emit(), _ensureKeys(), geohash() (+37 more)

### Community 8 - "call-layer.js"
Cohesion: 0.26
Nodes (17): Phase 4 — Call + Chat ✅ DONE (code; field test pending), _acceptIncoming(), _attachLocal(), attachMesh(), _attachRemote(), _cleanup(), _closeModal(), endCall() (+9 more)

### Community 9 - "ref_fs"
Cohesion: 0.18
Nodes (10): ref_fs, ref_path, ref_vm, fs, path, VL, all, fs (+2 more)

### Community 10 - "Lapeeet — dev_phases.md (master plan, no skips)"
Cohesion: 0.10
Nodes (19): Lapeeet — dev_phases.md (master plan, no skips), Live vs Dev separation (locked), Open decisions (need your call), Phase 0 — Single-File Shell ✅ DONE (verified 2026-09-17, step by step), Phase 14 — Signed Latency + Auto-Connect Reconcile ✅ DONE (code; field test pending), Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes ✅ DONE, Phase 5 — Polish + Manifest ✅ DONE (code; device test pending), Phase 7 — GitHub Pages Deploy ✅ LIVE (+11 more)

### Community 12 - "Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist"
Cohesion: 0.05
Nodes (42): 0. Executive Summary of Work Done So Far, 10.1 Local Storage / IndexedDB (browser-side), 10.2 DB Schema (Phase 2 to implement — NO CHANGES from confirmed §3 except + isomorphic-git snapshot tables), 10.3 isomorphic-git Repositories (browser internal, created so far), 10. DB + Storage Change Manifest (NO SKIP), 11.1 Graphify install + build pipeline commands executed, 11.2 isomorphic-git distribution download (vendored, no npm), 11.3 Browser smoke tests (MCP integrated_browser, captured evaluate result objects) (+34 more)

### Community 19 - "manifest.json"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, lang, name, orientation, scope (+3 more)

### Community 21 - "auth-layer.js"
Cohesion: 0.16
Nodes (27): Phase 11 — Device PIN Fallback ✅ DONE, Phase 9 — Phone Registration Gate + WebAuthn Passkeys ✅ DONE (code; ceremony field test pending), b64urlDecode(), b64urlEncode(), cborDecode(), item(), read(), uint() (+19 more)

### Community 22 - "check-auth.js"
Cohesion: 0.09
Nodes (19): ad1, ad2, cbor, cose, coseBytes, dec, enc, fs (+11 more)

### Community 23 - "check-webauthn.js"
Cohesion: 0.18
Nodes (9): cborArr(), cborBstr(), cborLen(), cborMap(), fs, nodeCrypto, sandbox, src (+1 more)

### Community 24 - "check-mode.js"
Cohesion: 0.17
Nodes (9): { app }, fs, loadApp(), win, src, t1, t2, t3 (+1 more)

### Community 25 - "check-wiring.js"
Cohesion: 0.20
Nodes (9): app, defined, DIR, DYNAMIC, fs, html, path, ui (+1 more)

### Community 26 - "check-p2p.js"
Cohesion: 0.25
Nodes (5): fs, mnl_qc, sandbox, src, vm

### Community 27 - "check-guard.js"
Cohesion: 0.17
Nodes (9): ref_crypto, createGate, fs, getGate, nodeCrypto, sandbox, src, vm (+1 more)

### Community 28 - "converge.js"
Cohesion: 0.06
Nodes (47): blockstore-fs, blockstore-idb, @chainsafe/libp2p-yamux, helia, ref_ipld_dag_cbor, libp2p, @libp2p/identify, @libp2p/noise (+39 more)

## Knowledge Gaps
- **159 isolated node(s):** `fs`, `vm`, `nodeCrypto`, `src`, `sandbox` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 226 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Lapeeet — dev_phases.md (master plan, no skips)` connect `Lapeeet — dev_phases.md (master plan, no skips)` to `app.js`, `db-layer.js`, `map-layer.js`, `ui-components.js`, `build-single.py`, `p2p-layer.js`, `call-layer.js`, `auth-layer.js`?**
  _High betweenness centrality (0.291) - this node is a cross-community bridge._
- **Why does `rpId()` connect `auth-layer.js` to `check-webauthn.js`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `Phase 9 — Phone Registration Gate + WebAuthn Passkeys ✅ DONE (code; ceremony field test pending)` connect `auth-layer.js` to `app.js`, `Lapeeet — dev_phases.md (master plan, no skips)`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **What connects `fs`, `vm`, `nodeCrypto` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0741687979539642 - nodes in this community are weakly interconnected._
- **Should `db-layer.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11962833914053426 - nodes in this community are weakly interconnected._
- **Should `map-layer.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05658381808566896 - nodes in this community are weakly interconnected._