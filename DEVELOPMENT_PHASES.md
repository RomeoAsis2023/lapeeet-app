# Lapeeet — Development Phases (Single-File Live P2P)

> **Status:** Live = `dist/lapeeet.html` only (self-contained, double-click / WebView `file://`).
> Dev-only (never shipped): isomorphic-git + graphify permanent memory.
> **Last Updated:** 2026-09-17
> **Stack live (free / open-source / unlimited only):** HTML/CSS/JS + webconnect.js P2P + sql.js 1.10.3 WASM + Leaflet 1.9.4 OSM + TweetNaCl 1.0.3 + Organic Maps intents.
> **Locale:** `en-PH`, `₱ PHP` only. Fare: `₱30 flag-down + ₱12/km + ₱2/min` via single `LapeeetUI.formatCurrency()`.
> **Constraint hard (4-layer):** 60 km max — UI badge + JS `isDistanceAllowed()` + DB `CHECK(distance_km <= 60)` + peer re-validate + signature covers coords.
> **Privacy split:** broadcast truncated lat/lng (~3 decimals, neighbourhood). Exact pickup/dropoff + phone/avatar + ebike photo only direct after `RIDE_ACCEPT`.
> **Discovery:** online P2P, channel `lapeeet-{geohash4}` (~20x39 km cell, ideal for 60 km trips). Manila default `14.5995,120.9842`.
> **Photos (good quality, any mobile):** max 3 per ebike, long-edge 1280px, JPEG q0.85, EXIF-rotate via canvas, ~200–350 KB each, total <1.2 MB. Enforced in UI + JS + DB length check.

## 0. Live vs Dev separation (locked)

| Area | Live (`dist/lapeeet.html`) | Dev-only (workstation, never shipped) |
|---|---|---|
| P2P + DB + map + fare + call + chat | ✅ shipped | — |
| `git-layer.js`, `lightning-fs`, `isomorphic-git.*`, `http/web` ESM | ❌ stripped (`__DEV__` flag) | ✅ kept in `www/` source |
| Home `gitStatus` row, Settings Git card | ❌ removed in build | ✅ kept in source |
| `graphify-out/`, `.graphify-site/` memory graph | ❌ never inlined | ✅ local queries only |

Free-services policy: no backend, no API keys, no paid TURN. WebRTC bootstrap = webconnect.js public defaults (WebTorrent trackers + public MQTT + Nostr relays, best-effort) + free STUN `stun.l.google.com:19302`. Tiles = OSM Carto online with offline grid fallback. Routing = haversine gate (unlimited) + OSRM demo refine (rate-limited, optional). Geocode = Nominatim + sql.js cache. Navigation = Organic Maps intents (offline if user pre-downloaded maps).

---

## Phase 0 — Single-File Shell

**Exit:** `dist/lapeeet.html` double-click boots with zero network, no console errors, header/capsule/bottomMenu reveal.

- [x] 0.1 `tools/build-single.py`: inline `style.css critical + app.css + vendors + app JS` → `dist/lapeeet.html` (3.0 MB true single-file, WASM base64-embedded, 0 CDN JS). Never hand-edit dist.
- [x] 0.2 Vendor locally: `webconnect UMD`, `sql-wasm.js + sql-wasm.wasm (base64-embedded)`, `leaflet.js/css`, `nacl.min.js + nacl-util` under `www/assets/vendor-live/`.
- [x] 0.3 Strip dev-only blocks: `git-layer.js` include, LightningFS/isomorphic-git scripts, ESM `lapeeet:git-ready`, git UI rows — pattern-matched by builder.
- [x] 0.4 Permanent UI: `dark-mode-active` first paint, static logotext header no-op, `#sidebarAvatar{border:0!important}`, `.header-logo{filter:none}`, `.form-button-group` in-flow (was `position:fixed` pinning Request Ride behind the tab bar).
- [x] 0.5 Shell smoke: 17/17 inline blocks `node --check` clean; `tools/check-dist.js` harness kept for rebuilds.

## Phase 1 — Map + 60 km Gate + Organic Maps

**Exit:** 42 km allows Request, 65 km blocks with badge; OM link opens correct coords.

- [x] 1.1 Leaflet init deferred on first Map visit (`_initMapDeferred`), OSM tiles online / grid fallback offline (`errorTileUrl` SVG grid + one-time offline toast), 60 km dashed circle `drawMaxRadius()`.
- [x] 1.2 `flyToCurrentLocation()` + tap-to-set pickup (green A) / dropoff (red B), draggable markers, `clearPins()`.
- [x] 1.3 Distance: haversine first for gate (`haversineKm`), OSRM `router.project-osrm.org` refine for fare/ETA (raw `lng,lat;lng,lat` — never encoded), dashed straight-line fallback.
- [x] 1.4 Nominatim `searchAddress(countrycodes=ph)` + `reverseGeocode()` + memory/localStorage cache (200 entries, survives reload; sql.js table in Phase 2), 1.1 s throttle serialising all callers, tap-map fallback when empty.
- [x] 1.5 `classifyDistance(): ok<=55 warn<=60 bad>60`, badge `#distBadge`, `#fareEst` via `_calcFare()`, `#btnRequestRide` disabled when bad.
- [x] 1.6 OM deep links (`buildOrganicMapsDeepLink`): Android `intent://...app.organicmaps`, iOS `organicmaps://route`, desktop OSM directions fallback + install banner.
- [x] 1.7 Capacity dropdown fixed: full dark-theme CSS (was unstyled), single-bind guard, outside-click/Escape/Tab close, arrow+Enter keyboard nav, aria-selected, hidden-input whitelist guard `[1,2,3,6,8,10,12,15]`, `getCapacity()/setCapacity()` API, toast-host duplication fixed.

## Phase 2 — sql.js Tenant DB + Onboarding + E-Bikes

**Exit:** register ebike → reload persists → Export .db re-imports → Wipe clears.

- [x] 2.1 `initSqlJs({wasmBinary: embedded base64})` → IndexedDB `lapeeet-idb-v1` kv load or new `SQL.Database()`, 400 ms debounced persist, legacy localStorage fallback read. Verified via `tools/check-db.js` (12/12 PASS).
- [x] 2.2 Schema live in `db-layer.js` SCHEMA (superset of below): `me`/`my_profile` singletons, `my_ebikes` capacity CHECK, rider/driver ride tables distance CHECK ≤60, `ride_events` + `idx_ride_events_ride`, `geocode_cache` (map-layer prefers DB when ready).
```sql
CREATE TABLE me(id INTEGER PRIMARY KEY CHECK(id=1), connectId TEXT UNIQUE, pubkey TEXT NOT NULL);
CREATE TABLE my_profile(name TEXT, phone TEXT, avatar_url TEXT);
CREATE TABLE my_ebikes(id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, model TEXT NOT NULL,
  color TEXT, capacity INTEGER NOT NULL CHECK(capacity IN(1,2,3,6,8,10,12,15)),
  photo1 TEXT, photo2 TEXT, photo3 TEXT, is_primary INTEGER DEFAULT 0);
CREATE TABLE my_rides_as_rider(id TEXT PRIMARY KEY, pickup_lat REAL, pickup_lng REAL, drop_lat REAL, drop_lng REAL,
  distance_km REAL CHECK(distance_km<=60), fare_php REAL, status TEXT, peer_id TEXT, created_at INTEGER);
CREATE TABLE my_rides_as_driver(id TEXT PRIMARY KEY, pickup_lat REAL, pickup_lng REAL, drop_lat REAL, drop_lng REAL,
  distance_km REAL CHECK(distance_km<=60), fare_php REAL, status TEXT, peer_id TEXT, created_at INTEGER);
CREATE TABLE ride_events(id INTEGER PRIMARY KEY AUTOINCREMENT, ride_id TEXT NOT NULL, type TEXT NOT NULL,
  from_id TEXT NOT NULL, ts INTEGER NOT NULL, body_json TEXT NOT NULL, sig TEXT NOT NULL);
CREATE TABLE geocode_cache(q TEXT PRIMARY KEY, lat REAL, lng REAL, address TEXT, ts INTEGER);
```
- [x] 2.3 Onboarding 4-step wizard (role → profile → e-bike → confirm): persists role (`lapeeet::role`), profile, first driver e-bike; riders skip step 3. Photos upload lives on the E-Bikes screen (canvas 1280px/q0.85, max 3).
- [x] 2.4 My E-Bikes list/set-primary/remove + register form (brand incl. custom Other, model, colour, capacity select, photo previews); Data screen Export .db/.json download, Import .db (validates tenant tables), two-tap Wipe → re-init; Profile edit + real Trips history/stats.

## Phase 3 — webconnect.js P2P Core Ride Flow

**Exit:** 2 browsers/phones full cycle: driver online → rider sees pin → request → accept → status → rating, both sides have matching `ride_events`.

- [ ] 3.1 Identity: `_ensureKeys()` → `nacl.sign.keyPair()` first run → secret in IndexedDB, `connectId = base58(pubkey[0..16])`. `init({lat,lng})` joins `lapeeet-{geohash4}`, `getMyId`, `onConnect/onDisconnect/onReceive`, status `offline/connecting/online`.
- [ ] 3.2 Envelope `{type, body, from, ts, sig}` + `sign()/verify()` for all 14 types: `DRIVER_STATUS RIDE_REQUEST RIDE_ACCEPT RIDE_REJECT RIDE_CANCEL RIDE_STATUS LOCATION_UPDATE EBIKE_INFO RIDER_INFO RATING DB_SYNC_REQ DB_SYNC_RES CALL_INITIATE CALL_END`.
- [ ] 3.3 Driver heartbeat every 10 s: `{online, tLat, tLng (truncated), capacity, brand, model, rating}` → rider `upsertDriverPin()` / `removeDriverPin()` on disconnect.
- [ ] 3.4 Rider `RIDE_REQUEST {ride_id, pickup, dropoff, distance_km, fare_php, capacity, ts}` broadcast; receiver runs `validateRideRequest()` (distance<=60 recomputed + capacity whitelist) then shows in driver Map request list.
- [ ] 3.5 Driver Accept (direct, includes `EBIKE_INFO` summary, no photo yet) → rider modal → both `appendEvent()` + `my_rides_*` rows. Reject/Cancel paths update status both sides.
- [ ] 3.6 Active ride: `RIDE_STATUS (enroute/arrived/completed)` + `LOCATION_UPDATE` direct (exact) + jittered mesh copy; photo + phone exchanged only now (`EBIKE_INFO`/`RIDER_INFO` direct).
- [ ] 3.7 Rating both ways + Trips history + receipts from local tables, all money via `formatCurrency()`.

## Phase 4 — Call + Chat

**Exit:** matched pair can voice-call; if media/NAT fails, P2P chat always works.

- [ ] 4.1 `LapeeetCall.startCall(peer, rideId)`: `getUserMedia → sendDirect CALL_INITIATE → openStreaming(localStream)`, `onStreaming` → remote video, mic/cam toggles, `CALL_END` + track cleanup.
- [ ] 4.2 Messages screen: 1:1 P2P text over same mesh (ordered by `ts`), call-history entries, no SMS dependency.

## Phase 5 — Polish + WebView Wrap

**Exit:** WebView APK loads `file://lapeeet.html`, survives app kill (IndexedDB intact), Lighthouse mobile >85.

- [ ] 5.1 Driver Earnings daily rollup, rider receipts print-to-PDF, toasts/empty/skeleton/error states, a11y labels + contrast, capacity dropdown hardening.
- [ ] 5.2 WebView test: `file://` WASM instantiate, geolocation permission, WebRTC permission, background heartbeat note, 30-day backup reminder toast.
- [ ] 5.3 `manifest.json` + icons from `lapeeet_icon.png` (optional PWA install, no store requirement).

## Icebox (not MVP)

Relay tenants for NAT-hard cases, fleet cooperative branches, arbitrator witness-hash log, surge toggle (UI only, formula off), battery-range hint (40–100 km), Tagalog i18n, offline MBTiles pack (separate download — would break single-file budget).

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Public bootstrap down | Retry + mesh status UI; same-channel tabs still work |
| R2 | IndexedDB quota / photo bloat | 1280px/q0.85/3max, length CHECK, 80% warn, Export-first Wipe |
| R3 | OSRM/Nominatim rate limits | Haversine gate always; cache; tap-map fallback |
| R4 | Fake coords / >60 km spoof | Sig covers coords; receiver recomputes haversine; reject + log |
| R5 | Capacity bypass | UI + JS + DB CHECK + peer re-validate |
| R6 | NAT blocks call | Free STUN; chat fallback guaranteed |
| R7 | User clears site data | Prominent Export; reminder toast |

## Ops (dev workstation only)

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'; $env:PYTHONPATH=(Resolve-Path .graphify-site).Path
python -m graphify query "QUESTION" --budget 2000
python -m graphify extract . --code-only --force
python tools/build-single.py --out dist/lapeeet.html
```
