# Graph Report - Lapeeet  (2026-09-17)

## Corpus Check
- 18 files · ~33,072 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: .css 5, (none) 2, .psd 1)

## Summary
- 379 nodes · 671 edges · 21 communities (20 shown, 1 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad90618f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- 7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip)
- app.js
- db-layer.js
- map-layer.js
- ui-components.js
- git-layer.js
- build-single.py
- p2p-layer.js
- call-layer.js
- check-mode.js
- Lapeeet — dev_phases.md (master plan, no skips)
- 3.1 Official Currency — Philippine Peso `₱ PHP`
- Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist
- 6. Feature Inventory & Scope (Updated with Completed Sub-items)
- 11. COMPLETE ACTIVITY REGISTER (NO SKIP — every command run, every manual action)
- 2.2 Developer Tools / Permanent Memory Layer (outside `www/`)
- 10. DB + Storage Change Manifest (NO SKIP)
- 1. Project Vision & Principles (UNCHANGED — Still Governs All Decisions)
- 8. COMPLETE FILE CHANGE MANIFEST — Every file modified or created (NO SKIP)
- manifest.json

## God Nodes (most connected - your core abstractions)
1. `_needInit()` - 18 edges
2. `start()` - 16 edges
3. `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` - 16 edges
4. `Lapeeet — dev_phases.md (master plan, no skips)` - 16 edges
5. `_render()` - 12 edges
6. `sendDirect()` - 12 edges
7. `Lapeeet — Development Phases (Single-File Live P2P)` - 12 edges
8. `_renderScreen()` - 11 edges
9. `_setState()` - 10 edges
10. `_run()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `6.2 Trip Distance Cap (60 km max) — still valid 4-layer enforcement plan (Phase 1 impl partial)` --references--> `_calcFare()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/app.js
- `Phase 4 — Call + Chat` --references--> `attachMesh()`  [INFERRED]
  DEVELOPMENT_PHASES.md → www/assets/js/call-layer.js
- `Phase 8 — OrbitDB Full Replacement ⬜ TRACK (after 7; gates each step)` --references--> `appendEvent()`  [INFERRED]
  dev_phases.md → www/assets/js/db-layer.js
- `PHASE 5 — Finishing Touches & MVP Polish` --references--> `formatCurrency()`  [INFERRED]
  Lapeet_app_development.md → www/assets/js/ui-components.js
- `Lapeeet — dev_phases.md (master plan, no skips)` --references--> `main()`  [INFERRED]
  dev_phases.md → tools/build-single.py

## Import Cycles
- None detected.

## Communities (21 total, 1 thin omitted)

### Community 0 - "7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip)"
Cohesion: 0.20
Nodes (11): 0. Executive Summary of Work Done So Far, 7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip), PHASE 0.5 — Currency, Localisation, Permanent Theme, Brand Fixes — 100% ✅, PHASE 0 — Project Scaffolding & Static Setup — **100% ✅ COMPLETED**, PHASE 1 — Map Layer + 60 km Cap + Organic Maps Deep Links — 🚧 PARTIALLY STARTED, PHASE 2 — sql.js Tenant Database + E-Bike Registration — 🚧 DB STUB ONLY, PHASE 3 — webconnect.js P2P Layer + Core Ride Flow — ⬜ (P2P STUB ONLY; Key pair/signing TBI), PHASE 4 — WebRTC Video/Audio Call (Built on webconnect Streaming API) — ⬜ (+3 more)

### Community 1 - "app.js"
Cohesion: 0.09
Nodes (45): Phase 6 — `?mode=` Role Deep Links ✅ DONE, _bindAutocomplete(), _bindCapacityDropdown(), applyFocus(), open(), _bindDataScreen(), _bindEbikeScreen(), _bindMapScreenButtons() (+37 more)

### Community 2 - "db-layer.js"
Cohesion: 0.14
Nodes (33): Phase 3 — webconnect.js P2P Ride Flow ✅ DONE (code; field test pending), _all(), appendEvent(), b64ToU8(), createEbike(), deleteEbike(), exportBinary(), exportJSON() (+25 more)

### Community 3 - "map-layer.js"
Cohesion: 0.09
Nodes (39): Phase 1 — Map + 60km Gate + Organic Maps ✅ DONE, 0. Live vs Dev separation (locked), Icebox (not MVP), Lapeeet — Development Phases (Single-File Live P2P), Ops (dev workstation only), Phase 0 — Single-File Shell, Phase 1 — Map + 60 km Gate + Organic Maps, Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes (+31 more)

### Community 4 - "ui-components.js"
Cohesion: 0.15
Nodes (24): 4.1 Header — static logotext image, never overwritten by screen title, 4.2 Sidebar avatar — ZERO border, ZERO shadow, ZERO padding, transparent bg, 4.3 Dark Mode — PERMANENT ON (NOT a toggle), 4. Permanent UI Decisions (CONFirmed by code & tested live), _bindScreenEvents(), _earningsCard(), _escapeAttr(), _escapeHtml() (+16 more)

### Community 5 - "git-layer.js"
Cohesion: 0.12
Nodes (14): 5.1 Tenant Roles, 5.2 Tenancy Guarantees (UPDATED — 6 guarantees now, last two new), 5.3 Data Sharing Boundaries (same as original §3.3 — unchanged), 5. User-Hosted Tenancy Model (Updated With isomorphic-git Versioned Snapshot Layer), commit(), createRepo(), _ensureRepo(), fetch() (+6 more)

### Community 6 - "build-single.py"
Cohesion: 0.14
Nodes (16): argparse, base64, mimetypes, Path, pathlib, re, shutil, sys (+8 more)

### Community 7 - "p2p-layer.js"
Cohesion: 0.10
Nodes (38): broadcast(), _canonical(), _currentLoc(), _dispatch(), _emit(), _ensureKeys(), geohash(), haversineKm() (+30 more)

### Community 8 - "call-layer.js"
Cohesion: 0.26
Nodes (17): Phase 4 — Call + Chat ✅ DONE (code; field test pending), _acceptIncoming(), _attachLocal(), attachMesh(), _attachRemote(), _cleanup(), _closeModal(), endCall() (+9 more)

### Community 9 - "check-mode.js"
Cohesion: 0.07
Nodes (23): ref_fs, ref_path, ref_vm, fs, path, VL, all, fs (+15 more)

### Community 10 - "Lapeeet — dev_phases.md (master plan, no skips)"
Cohesion: 0.10
Nodes (18): Lapeeet — dev_phases.md (master plan, no skips), Live vs Dev separation (locked), Open decisions (need your call), Phase 0 — Single-File Shell ✅ DONE (verified 2026-09-17, step by step), Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes ✅ DONE, Phase 5 — Polish + Manifest ✅ DONE (code; device test pending), Phase 7 — GitHub Pages Deploy ✅ LIVE, Phase 8 — OrbitDB Full Replacement ⬜ TRACK (after 7; gates each step) (+10 more)

### Community 11 - "3.1 Official Currency — Philippine Peso `₱ PHP`"
Cohesion: 0.33
Nodes (6): 3.1.1 Canonical formatter — ONE location, all code calls this, 3.1.2 Fare formula (updated to PHP constants, no USD anywhere), 3.1.3 UI Strings updated to ₱ PHP, 3.1 Official Currency — Philippine Peso `₱ PHP`, 3.2 Locale — `en-PH` (English — Philippines), 3. Currency & Locale (CONFIRMED — FULLY IMPLEMENTED)

### Community 12 - "Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist"
Cohesion: 0.25
Nodes (7): 12. QUESTIONS / OPEN DECISIONS FROM ORIGINAL §8 — **ALL RESOLVED 6/8, 2 STILL OPEN**, 13. RISKS & MITIGATIONS REGISTER (UPDATED — 7 original + 4 new), 14.1 Graphify CLI (run from repo root `c:\Users\meoas\OneDrive\Desktop\Lapeeet\`), 14.2 isomorphic-git Browser API (run in browser DevTools console OR in future app code), 14. QUICK OPERATIONS REFERENCE (for next session, copy-paste ready), 9. CHANGELOG (Reverse Chronological, NO SKIP), Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist

### Community 13 - "6. Feature Inventory & Scope (Updated with Completed Sub-items)"
Cohesion: 0.33
Nodes (6): 6.1 E-Bike Registration — Driver Tenant (Full Seed Data Still Confirmed — same as §4.1 in original doc, NO CHANGES), 6.2 Trip Distance Cap (60 km max) — still valid 4-layer enforcement plan (Phase 1 impl partial), 6.3 Organic Maps Integration (unchanged — Deep Link Only, no embedding possible), 6.4 🆕 Graphify Permanent Structural Memory Layer (IMPLEMENTED), 6.5 🆕 isomorphic-git@1.25.0 Browser-internal versioning (IMPLEMENTED — Option A chosen by user), 6. Feature Inventory & Scope (Updated with Completed Sub-items)

### Community 14 - "11. COMPLETE ACTIVITY REGISTER (NO SKIP — every command run, every manual action)"
Cohesion: 0.40
Nodes (5): 11.1 Graphify install + build pipeline commands executed, 11.2 isomorphic-git distribution download (vendored, no npm), 11.3 Browser smoke tests (MCP integrated_browser, captured evaluate result objects), 11.4 Manual UI actions / integrated_browser navigations, 11. COMPLETE ACTIVITY REGISTER (NO SKIP — every command run, every manual action)

### Community 15 - "2.2 Developer Tools / Permanent Memory Layer (outside `www/`)"
Cohesion: 0.40
Nodes (5): 2.1 Browser / SPA Layer (in `www/`), 2.2.1 Permanent Memory Graph Artifacts — queryable FOREVER in future sessions, 2.2.2 Ignore specification (to keep graph CLEAN — no vendored deps indexed), 2.2 Developer Tools / Permanent Memory Layer (outside `www/`), 2. Technology Stack — FULLY CONFIRMED & DOWNLOADED

### Community 16 - "10. DB + Storage Change Manifest (NO SKIP)"
Cohesion: 0.50
Nodes (4): 10.1 Local Storage / IndexedDB (browser-side), 10.2 DB Schema (Phase 2 to implement — NO CHANGES from confirmed §3 except + isomorphic-git snapshot tables), 10.3 isomorphic-git Repositories (browser internal, created so far), 10. DB + Storage Change Manifest (NO SKIP)

### Community 17 - "1. Project Vision & Principles (UNCHANGED — Still Governs All Decisions)"
Cohesion: 0.50
Nodes (4): 1.1 What Is Lapeeet?, 1.2 Core Principles, 1.3 Target Use Cases, 1. Project Vision & Principles (UNCHANGED — Still Governs All Decisions)

### Community 18 - "8. COMPLETE FILE CHANGE MANIFEST — Every file modified or created (NO SKIP)"
Cohesion: 0.50
Nodes (4): 8.1 Application source files, 8.2 Vendor distribution files (downloaded, NOT edited), 8.3 Developer Tooling (graphifyy local install + memory graph), 8. COMPLETE FILE CHANGE MANIFEST — Every file modified or created (NO SKIP)

### Community 19 - "manifest.json"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, lang, name, orientation, scope (+3 more)

## Knowledge Gaps
- **80 isolated node(s):** `fs`, `path`, `VL`, `fs`, `vm` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 126 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Lapeeet — dev_phases.md (master plan, no skips)` connect `Lapeeet — dev_phases.md (master plan, no skips)` to `app.js`, `db-layer.js`, `map-layer.js`, `build-single.py`, `call-layer.js`?**
  _High betweenness centrality (0.268) - this node is a cross-community bridge._
- **Why does `_calcFare()` connect `7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip)` to `app.js`, `map-layer.js`, `6. Feature Inventory & Scope (Updated with Completed Sub-items)`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._
- **Why does `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` connect `Lapeeet — E-Bike Ride-Hailing P2P App — Development Plan & LIVE Checklist` to `7. Development Phases & LIVE Checklists (FULLY UPDATED — No Skip)`, `ui-components.js`, `git-layer.js`, `3.1 Official Currency — Philippine Peso `₱ PHP``, `6. Feature Inventory & Scope (Updated with Completed Sub-items)`, `11. COMPLETE ACTIVITY REGISTER (NO SKIP — every command run, every manual action)`, `2.2 Developer Tools / Permanent Memory Layer (outside `www/`)`, `10. DB + Storage Change Manifest (NO SKIP)`, `1. Project Vision & Principles (UNCHANGED — Still Governs All Decisions)`, `8. COMPLETE FILE CHANGE MANIFEST — Every file modified or created (NO SKIP)`?**
  _High betweenness centrality (0.251) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `VL` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09485815602836879 - nodes in this community are weakly interconnected._
- **Should `db-layer.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1411764705882353 - nodes in this community are weakly interconnected._
- **Should `map-layer.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08637873754152824 - nodes in this community are weakly interconnected._