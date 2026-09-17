# Lapeeet — dev_phases.md (master plan, no skips)

> **Last Updated:** 2026-09-17 · **Status:** Phases 0–5 code-complete, device field tests pending
> **Live artifact:** `dist/lapeeet.html` — single self-contained file (3.06MB, 0 CDN JS, WASM embedded)
> **Source:** `www/` · **Builder:** `tools/build-single.py` (inline vendors, strip dev-only, embed WASM, copy manifest+icons)
> **Repo:** https://github.com/RomeoAsis2023/lapeeet-app (`main`, in sync)
> **Live stack:** HTML/CSS/JS + webconnect.js P2P + sql.js 1.10.3 + Leaflet 1.9.4 OSM + TweetNaCl + Organic Maps intents
> **Future track:** full sql.js → OrbitDB replacement (Phase 8), GitHub Pages deploy (Phase 7)
> **Locale:** `en-PH`, `₱ PHP` only · Fare `₱30 + ₱12/km + ₱2/min` via single `LapeeetUI.formatCurrency()`
> **Hard cap:** 60 km (UI + JS + DB CHECK + peer recheck) · **Capacities:** [1,2,3,6,8,10,12,15]
> **Privacy:** truncated broadcast coords, exact/photo/phone only direct after RIDE_ACCEPT
> **Discovery:** `lapeeet-{geohash4}` (Manila = `lapeeet-wdw5`) · **Photos:** max 3, 1280px, JPEG q0.85
> **Dev-only (never shipped):** isomorphic-git + graphify memory graph (watcher live) + `git-layer.js`

## Live vs Dev separation (locked)

| Area | Live (`dist/lapeeet.html`) | Dev-only (workstation) |
|---|---|---|
| P2P + DB + map + fare + call + chat + polish | ✅ shipped | — |
| `git-layer.js`, LightningFS, isomorphic-git, git UI rows/cards | ❌ stripped by builder | ✅ kept in `www/` |
| `graphify-out/`, `.graphify-site/` | ❌ never inlined | ✅ local queries, watcher live |
| `dist/` build output | git-ignored, rebuilt anytime | — |

---

## Phase 0 — Single-File Shell ✅ DONE (verified 2026-09-17, step by step)

**Exit met:** `dist/lapeeet.html` (3,061,424 bytes) boots, 0 CDN JS, no console errors, shell reveals.
- [x] 0.1 `tools/build-single.py` → `dist/lapeeet.html` (WASM base64-embedded, manifest+icons copied). Verified: rebuild + byte count.
- [x] 0.2 `www/assets/vendor-live/` 9/9 present: webconnect, sql.js JS+WASM, Leaflet JS+CSS, Routing Machine JS+CSS, NaCl+util.
- [x] 0.3 Dev-strip verified in dist: no isomorphic-git/LightningFS/`git-layer.js`/git ESM (sole `git-ready` hit is a code comment), 0 external CDN scripts.
- [x] 0.4 Permanent UI verified in dist: `dark-mode-active` first paint, static logotext header, `#sidebarAvatar` zero-border rules, `.header-logo` filter none, `.form-button-group` in-flow (was `position:fixed`, hid Request Ride behind tab bar).
- [x] 0.5 `tools/check-dist.js` — 18/18 blocks syntax-clean every build.
- [x] 0.6 Static header: `.scrolled`/`.is-active` removed from markup, `animatedHeader()` permanent no-op, overrides re-scoped to `#appHeader` id selectors (beat kit + dark-mode rules).

## Phase 1 — Map + 60km Gate + Organic Maps ✅ DONE

- [x] 1.1 Leaflet deferred init, OSM tiles + SVG-grid `errorTileUrl` offline fallback + one-time toast, 60 km dashed circle
- [x] 1.2 `flyToCurrentLocation()`, tap/drag pickup (A)/dropoff (B), `clearPins()`
- [x] 1.3 Haversine-first gate, OSRM refine (raw `lng,lat;lng,lat` — never encoded), dashed fallback line
- [x] 1.4 Nominatim `countrycodes=ph` + 1.1s throttle + memory/localStorage cache (DB-backed when ready)
- [x] 1.5 `classifyDistance ok≤55/warn≤60/bad>60`, badge, fare/ETA, Request disabled when bad
- [x] 1.6 Organic Maps intents (Android/iOS/desktop fallback + install banner)
- [x] 1.7 Capacity dropdown fixed: full dark CSS (was unstyled), single-bind guard, outside/Escape/Tab close, Arrow+Enter nav, aria-selected, whitelist guard, `get/setCapacity` API; `showToast` host-duplication fixed

## Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes ✅ DONE

- [x] 2.1 Real `initSqlJs({wasmBinary})` → IndexedDB `lapeeet-idb-v1`, 400 ms debounced persist, legacy localStorage read (`tools/check-db.js` 12/12)
- [x] 2.2 Schema: `me`/`my_profile` singletons, `my_ebikes` capacity CHECK, rider/driver ride tables distance CHECK ≤60, `ride_events` + index, `geocode_cache`
- [x] 2.3 Onboarding 4-step wizard (role → profile → e-bike → confirm), role persisted (`lapeeet::role`)
- [x] 2.4 E-Bikes CRUD (brand+custom Other, set-primary, remove, photo previews via `processPhoto`); Data screen Export .db/.json, Import (validates tables), two-tap Wipe; Profile edit; real Trips/stats; role restores at boot

## Phase 3 — webconnect.js P2P Ride Flow ✅ DONE (code; field test pending)

- [x] 3.1 Ed25519 identity in IndexedDB, stable `connectId=b64(pubkey)`, `lapeeet-{geohash4}` join, HELLO presence (`tools/check-p2p.js` 13/13)
- [x] 3.2 Envelopes `{v,id,type,body,from,pub,ts,sig}`, freshness window, from==pub bind, 1000-id dedup ring; 16 types (14 + HELLO + CHAT)
- [x] 3.3 Driver 10s heartbeat (truncated coords + bike summary → map pins; prune on leave)
- [x] 3.4 Rider broadcast (saved locally first); `validateRideRequest` (haversine recompute ≤60, 25% spoof tolerance, whitelist) → driver request panel
- [x] 3.5 Driver Accept (ACCEPT + EBIKE_INFO w/ photo1) → rider match modal (Chat/Call/Navigate) + RIDER_INFO back; both sides `upsertRide` + `appendEvent`; Reject/Cancel clear `activeRide`
- [x] 3.6 Active-ride panel (driver Enroute/Arrived/Completed; rider Chat/Call/Navigate/Cancel); exact LOCATION_UPDATE direct-only
- [x] 3.7 Rating modal on completed; Trips/Profile read real tables
- [ ] 3.8 FIELD TEST (2 browsers + internet): driver online → pin → request → accept → status → rating, matching `ride_events` both sides

## Phase 4 — Call + Chat ✅ DONE (code; field test pending)

- [x] 4.1 `startCall` (getUserMedia → CALL_INITIATE → `openStreaming` via `attachMesh`), self-rendered modal, mic/cam toggles, busy auto-reject, CALL_END + cleanup
- [x] 4.2 Messages tab (peer pills + unread, threads in localStorage, CHAT directs, auto-refresh + toast)
- [ ] 4.3 FIELD TEST: voice call + chat fallback on 2 devices

## Phase 5 — Polish + Manifest ✅ DONE (code; device test pending)

- [x] 5.1 Earnings card (today/7d/all-time + 7-day rows); Receipt modal + print-only CSS; 30-day backup reminder (stamped on export); a11y labels
- [x] 5.2 `file://`-safe verified by construction (embedded WASM, no fetches); device wrapper test pending
- [x] 5.3 `www/manifest.json` + icons, builder static-copy to `dist/`; no service worker (by design for `file://`)
- [ ] 5.4 DEVICE TEST: WebView APK loads `dist/`, kill/restart keeps IndexedDB, permissions granted

---

## Phase 6 — `?mode=` Role Deep Links ✅ DONE

**Exit met:** `?mode=driver` boots Driver, `?mode=passenger` boots Rider; toggle + onboarding keep URL in sync; invalid values ignored.
- [x] 6.1 `resolveInitialRole()` in `LapeeetApp.start()` before UI/DB/P2P init (`_modeFromParam`: `driver→DRIVER`, `passenger`/`rider`→RIDER); priority URL > `lapeeet::role` > RIDER; case-insensitive, whitespace-tolerant
- [x] 6.2 Valid param persisted to localStorage; `_syncModeUrl()` via `history.replaceState` on boot + toggle + onboarding finish (preserves other params); onboarding role select pre-filled
- [x] 6.3 Verified: `tools/check-mode.js` 16/16 (mapping, priority, sync, param preservation); browser check left: `file://` + Pages URLs both roles

## Phase 7 — GitHub Pages Deploy ✅ LIVE

**Site live:** https://romeoasis2023.github.io/lapeeet-app/ (source `gh-pages` / root). Verified: `/` serves app shell, `/manifest.json` valid, `/?mode=driver` serves 200.
- [x] 7.1 `tools/deploy-pages.ps1`: rebuild → publish `dist/` to `gh-pages` (preserves history on re-runs); `dist/` stays git-ignored.
- [x] 7.2 Manifest `start_url/scope` relative (subpath-safe); publish root = `index.html` + `manifest.json` + `assets/img/` + `leaflet-images/` + `routing-images/`
- [x] 7.2b Layout+images fix (2026-09-17): builder now resolves local CSS `@import`s (Bootstrap/owl were 404ing → layout collapse), ships full `assets/img/` (logotext + map pins were 404ing), vendors Leaflet/routing control sprites; deploy script mirrors all of `dist/` and uses explicit remote URL (git-2.54 nickname bug workaround)
- [ ] 7.3 Mixed-content CI guard (deferred — add when Actions CI lands)
- [ ] 7.4 Device check left: open live URL on phone browser, confirm boot + map + `?mode=` both roles with zero console errors (fetch-based check can't execute JS)

## Phase 8 — OrbitDB Full Replacement ⬜ TRACK (after 7; gates each step)

**Exit:** sql.js removed; tenant + shared ride data on OrbitDB; same UI; same field-test script green.
- [ ] 8.0 P0 SPIKE (go/no-go): vite-bundle Helia+libp2p-v2-pinned+`@orbitdb/core@4` → load from `file://` AND Pages URL → open/persist/reload `documents` DB (IndexedDB blockstore) → 2-tab replication via address. STOP if `file://` breaks libp2p (fallback: WebView serves over localhost).
- [ ] 8.1 Stores: `profile`/`ebikes`/`rides` (documents+keyvalue per tenant, creator-only write) + shared per-ride `events` log (`write:[rider,driver]`); `connectId↔orbitIdentity` sidecar; keep Ed25519 envelope signing
- [ ] 8.2 Facade rewrite: identical `LapeeetDB` API over stores; 60km/capacity CHECKs → JS guards + peer recheck; export → JSON dump (+optional CAR); Data-screen copy updated; `check-db.js` → guard tests
- [ ] 8.3 Ride sharing: create/grant shared `events` DB inside existing ACCEPT/RIDER_INFO directs; `appendEvent` writes shared log; photos stay in tenant docs (never in shared log)
- [ ] 8.4 Harness+docs: `check-orbit.js` (Node round-trip), phases/README update, commit, push; bundle-size + budget-phone cold-start measured
- [ ] 8.5 FIELD TEST: 2-device full cycle + kill/restart persistence + export/import round-trip

## Track W — WebView Wrapper ⬜ (parallel, device-side)

- [ ] W.1 Minimal Android wrapper loading `dist/` (local server preferred over raw `file://` for OrbitDB future), geolocation + mic/camera permissions, kill/restart IndexedDB check

## Risks

R1 bootstrap/relay downtime → status UI + retry (unchanged) · R2 photo/quota bloat → 1280px/q0.85/3max + 80% warn + export-first wipe · R3 OSRM/Nominatim limits → haversine gate + cache · R4 spoofed coords → sig covers coords + recompute + 25% tolerance reject · R5 capacity bypass → UI+JS+DB+peer (DB layer drops to 3-layer under OrbitDB) · R6 NAT → STUN + chat fallback · R7 site-data clear → export reminder · R8 (OrbitDB) libp2p-v3 incompatibility → pin v2 stack · R9 (OrbitDB) bundle size/startup → measure in P0 · R10 (Pages) mixed content → CI guard

## Open decisions (need your call)

1. Deploy via GitHub Actions (recommended) vs manual `gh-pages` branch?
2. Should `?mode=` also jump first-run users into onboarding with that role pre-selected, or only set background role?
3. OrbitDB: accept losing `.sqlite` export for JSON dump? (biggest user-visible tradeoff)
4. WebView: raw `file://` must keep working, or may wrapper serve over `http://localhost`?
5. Floor Android/WebView version (decides OrbitDB bundle transpiling)?

## Verification log

- 2026-09-17 Phase 0 re-verified step by step: rebuild 3,061,424B · vendors 9/9 · strips 0-fail · UI 8/8 · check-dist 18/18 OK · check-p2p 13/13 · check-db 12/12.
