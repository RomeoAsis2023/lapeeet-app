/* =============================================================
   Lapeeet — Map Layer (Leaflet.js + OSM + OSRM + Organic Maps deep links)
   Phase 1 implementation.
   Responsible for:
     - Initialising Leaflet map in a container
     - Drawing pickup/dropoff pins, driver pins, ride route
     - 60km radius visualization & validation
     - Nominatim search / reverse-geocode
     - OSRM route distance/ETA via Leaflet Routing Machine
     - Organic Maps deep link intents (Android / iOS)
   ============================================================= */

(function (global) {
    'use strict';

    const MAP_VERSION = '0.1.0-phase1';
    const MAX_TRIP_KM = 60;
    const DEFAULT_CENTER = [14.5995, 120.9842];
    const DEFAULT_ZOOM = 13;
    const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
    const OSRM_DEMO_URL = 'https://router.project-osrm.org/route/v1';

    const LapeeetMap = {
        version: MAP_VERSION,
        MAX_TRIP_KM,
        DEFAULT_CENTER,
        DEFAULT_ZOOM,

        map: null,
        containerId: 'map',
        tilesUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        tilesAttrib: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',

        pickupMarker: null,
        dropoffMarker: null,
        pickupLatLng: null,
        dropoffLatLng: null,
        placeNext: 'pickup',
        driverMarkers: new Map(),
        riderMarkers: new Map(),
        radiusCircle: null,
        routeLine: null,
        routeControl: null,

        onPickupChange: null,
        onDropoffChange: null,
        onRouteCalculated: null,

        initialized: false,
        _waitForL: null,
        _tileOfflineNoted: false,

        /* Geocode cache + Nominatim 1 req/s throttle (Phase 1).
           Phase 2 will move this into sql.js geocode_cache; the same
           method names are kept so callers don't change. */
        _geoMemCache: new Map(),
        _lastGeoTs: 0,
        _GEO_MIN_GAP_MS: 1100,
        _GEO_CACHE_KEY: 'lapeeet::geocode_cache_v1',
        _GEO_CACHE_MAX: 200,

        /* ---------- LIFECYCLE ---------- */

        init(containerId, callbacks = {}) {
            console.debug('[MAP-LAYER] init(', containerId, ')');
            this.containerId = containerId || this.containerId;
            this.onPickupChange = callbacks.onPickupChange || null;
            this.onDropoffChange = callbacks.onDropoffChange || null;
            this.onRouteCalculated = callbacks.onRouteCalculated || null;

            const tryInit = () => {
                if (typeof L === 'undefined') return false;
                this._createMap();
                this.initialized = true;
                if (window.LapeeetUI) {
                    window.LapeeetUI.showToast('Map ready — tap to set pickup', 'success');
                }
                return true;
            };

            if (!tryInit()) {
                this._waitForL = setInterval(() => {
                    if (tryInit() && this._waitForL) {
                        clearInterval(this._waitForL);
                        this._waitForL = null;
                    }
                }, 80);
                setTimeout(() => {
                    if (this._waitForL) {
                        clearInterval(this._waitForL);
                        this._waitForL = null;
                        console.warn('[MAP-LAYER] Leaflet never loaded (CDN block?)');
                    }
                }, 8000);
            }
        },

        destroy() {
            if (this.routeControl) {
                try { this.map.removeControl(this.routeControl); } catch (e) { /* noop */ }
                this.routeControl = null;
            }
            if (this.routeLine) { try { this.map.removeLayer(this.routeLine); } catch (e) { /* noop */ } this.routeLine = null; }
            if (this.radiusCircle) { try { this.map.removeLayer(this.radiusCircle); } catch (e) { /* noop */ } this.radiusCircle = null; }
            if (this.pickupMarker) { try { this.map.removeLayer(this.pickupMarker); } catch (e) { /* noop */ } this.pickupMarker = null; }
            if (this.dropoffMarker) { try { this.map.removeLayer(this.dropoffMarker); } catch (e) { /* noop */ } this.dropoffMarker = null; }
            if (this.map) { try { this.map.remove(); } catch (e) { /* noop */ } this.map = null; }
            this.initialized = false;
        },

        /* ---------- MAP SETUP ---------- */

        _tileLayer() {
            return L.tileLayer(this.tilesUrl, {
                maxZoom: 19,
                attribution: this.tilesAttrib,
                // Offline/blocked-tiles fallback: light grid tile so pins +
                // distance gate keep working with zero network. (Phase 1.1)
                errorTileUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
                    '<rect width="256" height="256" fill="#dbe9ff"/>' +
                    '<path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256" stroke="#b9c8e2" stroke-width="1"/>' +
                    '</svg>'
                )
            });
        },

        _noteTilesOffline(map) {
            // One-time notice if tiles fail (map still usable offline).
            map.on('tileerror', () => {
                if (this._tileOfflineNoted) return;
                this._tileOfflineNoted = true;
                if (window.LapeeetUI) LapeeetUI.showToast('Map tiles offline — pins + 60km check still work', 'warning');
            });
        },

        _createMap() {
            const mapEl = document.getElementById(this.containerId);
            if (!mapEl) {
                console.warn('[MAP-LAYER] Container #' + this.containerId + ' not in DOM');
                return;
            }

            const map = L.map(this.containerId, {
                zoomControl: true,
                attributionControl: true,
                gestureHandling: (typeof L !== 'undefined' && L.gestureHandling) ? true : false
            }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

            this._tileLayer().addTo(map);
            this._noteTilesOffline(map);

            this.drawMaxRadius(DEFAULT_CENTER[0], DEFAULT_CENTER[1], MAX_TRIP_KM);

            const self = this;
            map.on('click', (ev) => self._onMapClick(ev));

            this.map = map;
            setTimeout(() => { try { map.invalidateSize(); } catch (e) { /* noop */ } }, 120);
        },

        /* ---------- HOME MINI-MAP (second instance: nearby peers, radius search) ---------- */

        homeMap: null,
        homeMarkers: new Map(),   // key -> L.marker (keys: 'ref' | 'd:'+identity | 'r:'+identity)
        homeCircle: null,
        homeRef: null,            // {lat, lng} reference point for radius filtering

        initHome(containerId, center) {
            this.destroyHome();
            if (typeof L === 'undefined') return false;
            const el = document.getElementById(containerId || 'homeMap');
            if (!el) return false;
            const c = center || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
            const map = L.map(el, {
                zoomControl: true,
                attributionControl: false,
                gestureHandling: (typeof L !== 'undefined' && L.gestureHandling) ? true : false
            }).setView([c.lat, c.lng], 12);
            this._tileLayer().addTo(map);
            this._noteTilesOffline(map);
            this.homeMap = map;
            this.setHomeRef(c.lat, c.lng, MAX_TRIP_KM);
            setTimeout(() => { try { map.invalidateSize(); } catch (e) { /* noop */ } }, 120);
            return true;
        },

        destroyHome() {
            try {
                if (this.homeMap) {
                    this.homeMarkers.forEach(m => { try { this.homeMap.removeLayer(m); } catch (e) {} });
                    this.homeMap.remove();
                }
            } catch (e) {}
            this.homeMap = null;
            this.homeMarkers = new Map();
            this.homeCircle = null;
        },

        /** Move the radius reference point (search result or GPS); redraws the ring. */
        setHomeRef(lat, lng, radiusKm) {
            this.homeRef = { lat: Number(lat), lng: Number(lng) };
            if (!this.homeMap) return;
            if (this.homeCircle) { try { this.homeMap.removeLayer(this.homeCircle); } catch (e) {} }
            const r = Math.min(Number(radiusKm) || MAX_TRIP_KM, MAX_TRIP_KM);
            this.homeCircle = L.circle([this.homeRef.lat, this.homeRef.lng], {
                radius: r * 1000,
                color: '#1E74FD', weight: 1.2, opacity: 0.55,
                fillColor: '#1E74FD', fillOpacity: 0.04, dashArray: '6 6'
            }).addTo(this.homeMap);
            // Reference pin (you / search point).
            const old = this.homeMarkers.get('ref');
            if (old) { try { this.homeMap.removeLayer(old); } catch (e) {} }
            const ref = L.marker([this.homeRef.lat, this.homeRef.lng], {
                icon: this._pinIcon('pickup'), title: 'Reference point', keyboard: false
            }).addTo(this.homeMap);
            this.homeMarkers.set('ref', ref);
        },

        upsertHomePin(key, lat, lng, kind, label) {
            if (!this.homeMap) return;
            const old = this.homeMarkers.get(key);
            if (old) { try { this.homeMap.removeLayer(old); } catch (e) {} }
            const m = L.marker([lat, lng], {
                icon: this._pinIcon(kind === 'rider' ? 'driver' : 'dropoff'),
                title: label || key
            });
            if (label) m.bindTooltip(String(label));
            m.addTo(this.homeMap);
            this.homeMarkers.set(key, m);
        },

        removeHomePin(key) {
            const m = this.homeMarkers.get(key);
            if (m && this.homeMap) { try { this.homeMap.removeLayer(m); } catch (e) {} }
            this.homeMarkers.delete(key);
        },

        focusHome(lat, lng, zoom) {
            if (!this.homeMap) return;
            try { this.homeMap.flyTo([lat, lng], zoom || 12, { duration: 0.8 }); } catch (e) {}
        },

        _onMapClick(ev) {
            const { lat, lng } = ev.latlng;
            if (this.placeNext === 'pickup' || !this.pickupLatLng) {
                this.setPickup(lat, lng, true);
                this.placeNext = 'dropoff';
            } else {
                this.setDropoff(lat, lng, true);
                this.placeNext = 'pickup';
            }
        },

        /* ---------- CURRENT LOCATION ---------- */

        _locCache: null, // {lat, lng, ts}

        /** Cached-first geolocation shared by home map, heartbeat and search. */
        cachedLocation(maxAgeMs) {
            const maxAge = maxAgeMs == null ? 60000 : maxAgeMs;
            if (this._locCache && (Date.now() - this._locCache.ts) < maxAge) {
                return Promise.resolve({ lat: this._locCache.lat, lng: this._locCache.lng });
            }
            if (!navigator.geolocation) return Promise.resolve(null);
            return new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        this._locCache = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
                        resolve({ lat: this._locCache.lat, lng: this._locCache.lng });
                    },
                    () => resolve(this._locCache
                        ? { lat: this._locCache.lat, lng: this._locCache.lng }
                        : null),
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                );
            });
        },

        async flyToCurrentLocation() {
            if (!navigator.geolocation) {
                if (window.LapeeetUI) LapeeetUI.showToast('Geolocation not available', 'warning');
                return null;
            }
            return new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude: lat, longitude: lng } = pos.coords;
                        if (this.map) this.map.flyTo([lat, lng], 15, { duration: 0.8 });
                        resolve({ lat, lng });
                    },
                    (err) => {
                        console.warn('[MAP-LAYER] geo error:', err && err.message);
                        if (window.LapeeetUI) LapeeetUI.showToast('Could not determine your location', 'warning');
                        resolve(null);
                    },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            });
        },

        /* ---------- PINS ---------- */

        _pinIcon(kind) {
            const url = kind === 'driver'
                ? 'assets/img/marker_driver.svg'
                : 'assets/img/marker_user.svg';
            const sizePx = (kind === 'driver') ? [26, 32] : [34, 42];
            const anchorPx = (kind === 'driver') ? [13, 32] : [17, 42];
            let filter = 'none';
            if (kind === 'pickup') {
                filter = 'hue-rotate(130deg) saturate(2.2) brightness(0.92) drop-shadow(0 2px 3px rgba(0,0,0,0.28))';
            } else if (kind === 'dropoff') {
                filter = 'hue-rotate(-50deg) saturate(2.5) brightness(0.92) drop-shadow(0 2px 3px rgba(0,0,0,0.28))';
            } else if (kind === 'driver') {
                filter = 'hue-rotate(200deg) saturate(1.6) brightness(1.05) drop-shadow(0 1px 2px rgba(0,0,0,0.25))';
            }
            const html = kind === 'driver' ? '' : `
                <div style="
                    position:absolute;
                    left:${Math.round(anchorPx[0] - 7)}px;
                    top:6px;
                    width:14px;height:14px;
                    color:#fff;
                    font-size:11px;
                    font-weight:800;
                    text-align:center;
                    line-height:14px;
                    pointer-events:none;
                    text-shadow:0 1px 1px rgba(0,0,0,0.25);
                ">${kind === 'pickup' ? 'A' : 'B'}</div>`;
            return L.divIcon({
                className: 'lapeeet-pin lapeeet-pin-' + kind,
                html: `<img src="${url}" style="
                    width:${sizePx[0]}px;
                    height:${sizePx[1]}px;
                    display:block;
                    filter:${filter};
                    margin-left:-${anchorPx[0]}px;
                    margin-top:-${anchorPx[1]}px;
                    pointer-events:none;
                ">${html}`,
                iconSize: sizePx,
                iconAnchor: anchorPx,
                popupAnchor: [0, -sizePx[1]]
            });
        },

        setPickup(lat, lng, draggable = true) {
            if (!this.map) return;
            this.pickupLatLng = L.latLng(lat, lng);
            if (this.pickupMarker) {
                this.pickupMarker.setLatLng(this.pickupLatLng);
            } else {
                this.pickupMarker = L.marker(this.pickupLatLng, {
                    icon: this._pinIcon('pickup'),
                    draggable: !!draggable,
                    title: 'Pickup'
                }).addTo(this.map);
                const self = this;
                this.pickupMarker.on('dragend', () => {
                    const p = self.pickupMarker.getLatLng();
                    self.setPickup(p.lat, p.lng, true);
                });
            }
            this._afterPinChange('pickup');
        },

        setDropoff(lat, lng, draggable = true) {
            if (!this.map) return;
            this.dropoffLatLng = L.latLng(lat, lng);
            if (this.dropoffMarker) {
                this.dropoffMarker.setLatLng(this.dropoffLatLng);
            } else {
                this.dropoffMarker = L.marker(this.dropoffLatLng, {
                    icon: this._pinIcon('dropoff'),
                    draggable: !!draggable,
                    title: 'Dropoff'
                }).addTo(this.map);
                const self = this;
                this.dropoffMarker.on('dragend', () => {
                    const p = self.dropoffMarker.getLatLng();
                    self.setDropoff(p.lat, p.lng, true);
                });
            }
            this._afterPinChange('dropoff');
        },

        clearPins() {
            if (this.pickupMarker) { this.map.removeLayer(this.pickupMarker); this.pickupMarker = null; }
            if (this.dropoffMarker) { this.map.removeLayer(this.dropoffMarker); this.dropoffMarker = null; }
            this.pickupLatLng = null;
            this.dropoffLatLng = null;
            this.placeNext = 'pickup';
            this.clearRoute();
        },

        async _afterPinChange(which) {
            const ll = which === 'pickup' ? this.pickupLatLng : this.dropoffLatLng;
            const info = await this.reverseGeocode(ll.lat, ll.lng);
            const payload = { lat: ll.lat, lng: ll.lng, address: info.display_name || `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}` };
            if (which === 'pickup' && this.onPickupChange) this.onPickupChange(payload);
            if (which === 'dropoff' && this.onDropoffChange) this.onDropoffChange(payload);
            if (this.pickupLatLng && this.dropoffLatLng) {
                const hvKm = this.haversineKm(this.pickupLatLng.lat, this.pickupLatLng.lng, this.dropoffLatLng.lat, this.dropoffLatLng.lng);
                if (hvKm > MAX_TRIP_KM * 1.01) {
                    if (this.onRouteCalculated) this.onRouteCalculated({
                        distanceKm: hvKm, durationMin: Math.max(1, Math.round(hvKm * 2.8)),
                        geometry: null, haversine: true
                    });
                } else {
                    this.calculateRoute(this.pickupLatLng, this.dropoffLatLng);
                }
            }
        },

        upsertDriverPin(connectId, lat, lng, data = {}) {
            if (!this.map) return;
            const pos = L.latLng(lat, lng);
            if (this.driverMarkers.has(connectId)) {
                this.driverMarkers.get(connectId).setLatLng(pos);
                return;
            }
            const m = L.marker(pos, {
                icon: this._pinIcon('driver'),
                title: data.name || ('Driver ' + String(connectId).slice(0, 6))
            }).bindTooltip(data.name || ('Driver ' + String(connectId).slice(0, 6))).addTo(this.map);
            this.driverMarkers.set(connectId, m);
        },
        removeDriverPin(connectId) {
            if (!this.map || !this.driverMarkers.has(connectId)) return;
            this.map.removeLayer(this.driverMarkers.get(connectId));
            this.driverMarkers.delete(connectId);
        },

        /* ---------- 60 KM RING ---------- */

        drawMaxRadius(centerLat, centerLng, km = MAX_TRIP_KM) {
            if (!this.map) return;
            if (this.radiusCircle) this.map.removeLayer(this.radiusCircle);
            this.radiusCircle = L.circle([centerLat, centerLng], {
                radius: km * 1000,
                color: '#1E74FD',
                weight: 1.2,
                opacity: 0.55,
                fillColor: '#1E74FD',
                fillOpacity: 0.04,
                dashArray: '6 6'
            }).addTo(this.map);
        },
        removeRadius() {
            if (!this.map || !this.radiusCircle) return;
            this.map.removeLayer(this.radiusCircle);
            this.radiusCircle = null;
        },

        classifyDistance(km) {
            if (km == null || isNaN(km)) return 'bad';
            if (km <= 55) return 'ok';
            if (km <= MAX_TRIP_KM) return 'warn';
            return 'bad';
        },

        isDistanceAllowed(km) {
            return this.classifyDistance(km) !== 'bad';
        },

        /* ---------- ROUTING ---------- */

        async calculateRoute(pickupLatLng, dropoffLatLng) {
            if (!this.map) return;
            this.clearRoute();
            const pu = L.latLng(pickupLatLng);
            const dp = L.latLng(dropoffLatLng);
            // NOTE: do NOT encodeURIComponent() the whole pair — OSRM needs
            // raw `lng,lat;lng,lat` separators. Numbers/./- are URL-safe.
            const coords = `${pu.lng},${pu.lat};${dp.lng},${dp.lat}`;
            const url = `${OSRM_DEMO_URL}/driving/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;
            try {
                const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!r.ok) throw new Error('osrm ' + r.status);
                const data = await r.json();
                if (!data || !data.routes || !data.routes.length) throw new Error('no route');
                const route = data.routes[0];
                const distanceKm = (route.distance || 0) / 1000;
                const durationMin = Math.max(1, Math.round((route.duration || 0) / 60));
                const geometry = route.geometry && route.geometry.type === 'LineString' ? route.geometry.coordinates : null;
                if (geometry) {
                    const latlngs = geometry.map(pt => L.latLng(pt[1], pt[0]));
                    this.routeLine = L.polyline(latlngs, {
                        color: '#1E74FD', weight: 5, opacity: 0.85, lineJoin: 'round'
                    }).addTo(this.map);
                    if (this.map.fitBounds) this.map.fitBounds(this.routeLine.getBounds().pad(0.2));
                }
                if (this.onRouteCalculated) this.onRouteCalculated({ distanceKm, durationMin, geometry });
            } catch (err) {
                console.warn('[MAP-LAYER] OSRM route failed, falling back to haversine:', err && err.message);
                const hv = this.haversineKm(pu.lat, pu.lng, dp.lat, dp.lng);
                if (this.map) {
                    this.routeLine = L.polyline([pu, dp], {
                        color: '#8594ac', weight: 4, opacity: 0.7, dashArray: '5 8'
                    }).addTo(this.map);
                }
                if (this.onRouteCalculated) this.onRouteCalculated({
                    distanceKm: hv,
                    durationMin: Math.max(1, Math.round(hv * 2.8)),
                    geometry: null,
                    haversine: true
                });
            }
        },

        clearRoute() {
            if (this.routeControl) { try { this.map.removeControl(this.routeControl); } catch (e) { /* noop */ } this.routeControl = null; }
            if (this.routeLine) { try { this.map.removeLayer(this.routeLine); } catch (e) { /* noop */ } this.routeLine = null; }
        },

        /* ---------- GEOCODING (throttled + cached, Phase 1) ---------- */

        _geoCacheGet(key) {
            // Prefer tenant DB when ready (survives with the DB export);
            // fall back to memory + localStorage otherwise.
            try {
                if (window.LapeeetDB && LapeeetDB.initialized) {
                    const row = LapeeetDB.geoGet(key);
                    if (row) {
                        const val = key.indexOf('s:') === 0 ? JSON.parse(row.address || '[]') : { display_name: row.address };
                        this._geoMemCache.set(key, val);
                        return val;
                    }
                }
            } catch (e) { /* fall through */ }
            if (this._geoMemCache.has(key)) return this._geoMemCache.get(key);
            try {
                const raw = localStorage.getItem(this._GEO_CACHE_KEY);
                if (!raw) return null;
                const obj = JSON.parse(raw);
                if (obj && obj[key] !== undefined) {
                    this._geoMemCache.set(key, obj[key]);
                    return obj[key];
                }
            } catch (e) { /* storage unavailable — memory cache only */ }
            return null;
        },

        _geoCacheSet(key, val) {
            this._geoMemCache.set(key, val);
            try {
                if (window.LapeeetDB && LapeeetDB.initialized) {
                    if (key.indexOf('s:') === 0) {
                        const first = (val && val[0]) || {};
                        LapeeetDB.geoSet(key, first.lat || null, first.lng || null, JSON.stringify(val));
                    } else {
                        LapeeetDB.geoSet(key, null, null, (val && val.display_name) || '');
                    }
                    return;
                }
            } catch (e) { /* fall through to localStorage */ }
            try {
                const raw = localStorage.getItem(this._GEO_CACHE_KEY);
                const obj = raw ? (JSON.parse(raw) || {}) : {};
                obj[key] = val;
                const keys = Object.keys(obj);
                if (keys.length > this._GEO_CACHE_MAX) {
                    // Evict oldest inserts (insertion-ordered).
                    keys.slice(0, keys.length - this._GEO_CACHE_MAX).forEach(k => delete obj[k]);
                }
                localStorage.setItem(this._GEO_CACHE_KEY, JSON.stringify(obj));
            } catch (e) { /* quota / private mode — ignore */ }
        },

        async _geoThrottle() {
            // Nominatim usage policy: max 1 req/s. Serialise all callers.
            const now = Date.now();
            const wait = this._GEO_MIN_GAP_MS - (now - this._lastGeoTs);
            if (wait > 0) await new Promise(r => setTimeout(r, wait));
            this._lastGeoTs = Date.now();
        },

        async searchAddress(q) {
            if (!q || !q.trim()) return [];
            const key = 's:' + q.trim().toLowerCase();
            const hit = this._geoCacheGet(key);
            if (hit) return hit;
            await this._geoThrottle();
            try {
                const url = `${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&countrycodes=ph`;
                const r = await fetch(url, {
                    headers: { 'Accept': 'application/json', 'User-Agent': 'Lapeeet/0.1 (p2p ebike app)' }
                });
                if (!r.ok) return [];
                const rows = (await r.json() || []).map(item => ({
                    lat: parseFloat(item.lat),
                    lng: parseFloat(item.lon),
                    address: item.display_name,
                    placeId: item.place_id
                }));
                this._geoCacheSet(key, rows);
                return rows;
            } catch (e) {
                console.warn('[MAP-LAYER] nominatim search fail:', e && e.message);
                return [];
            }
        },

        async reverseGeocode(lat, lng) {
            const key = `r:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
            const hit = this._geoCacheGet(key);
            if (hit) return hit;
            const fallback = { display_name: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
            await this._geoThrottle();
            try {
                const url = `${NOMINATIM_URL}/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=16&addressdetails=1`;
                const r = await fetch(url, {
                    headers: { 'Accept': 'application/json', 'User-Agent': 'Lapeeet/0.1 (p2p ebike app)' }
                });
                if (!r.ok) return fallback;
                const j = await r.json();
                const out = (j && j.display_name)
                    ? { display_name: j.display_name, address: j.address }
                    : fallback;
                this._geoCacheSet(key, out);
                return out;
            } catch (e) {
                return fallback;
            }
        },

        /* ---------- ORGANIC MAPS DEEP LINKS (Confirmed design) ---------- */

        _isIOS() {
            return /iPad|iPhone|iPod/.test(navigator.userAgent || navigator.platform || '');
        },
        _isAndroid() {
            return /android/i.test(navigator.userAgent || '');
        },

        buildOrganicMapsDeepLink(mode, payload = {}) {
            const sLat = payload.pickupLat ?? (this.pickupLatLng ? this.pickupLatLng.lat : DEFAULT_CENTER[0]);
            const sLng = payload.pickupLng ?? (this.pickupLatLng ? this.pickupLatLng.lng : DEFAULT_CENTER[1]);
            const dLat = payload.dropoffLat ?? (this.dropoffLatLng ? this.dropoffLatLng.lat : sLat);
            const dLng = payload.dropoffLng ?? (this.dropoffLatLng ? this.dropoffLatLng.lng : sLng);
            const saddr = encodeURIComponent(payload.pickupAddress || 'Pickup');
            const daddr = encodeURIComponent(payload.dropoffAddress || 'Dropoff');

            if (this._isIOS()) {
                return `organicmaps://route?sll=${sLat},${sLng}&saddr=${saddr}&dll=${dLat},${dLng}&daddr=${daddr}&type=vehicle`;
            }
            if (this._isAndroid()) {
                return `intent://map/dir/?origin=${sLat},${sLng}&destination=${dLat},${dLng}#Intent;scheme=geo;package=app.organicmaps;S.org_name=Lapeeet;end`;
            }
            const fallback = `https://organicmaps.app/`;
            const geo = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_bike&route=${sLat}%2C${sLng}%3B${dLat}%2C${dLng}`;
            return geo || fallback;
        },

        launchOrganicMaps(mode, payload) {
            const url = this.buildOrganicMapsDeepLink(mode, payload || {});
            if (!url || url === '#') {
                if (window.LapeeetUI) LapeeetUI.showToast('Set pickup and dropoff first', 'warning');
                return;
            }
            const wasIOS = this._isIOS();
            const wasAndroid = this._isAndroid();
            const fallbackInstall = 'https://organicmaps.app/';
            try {
                window.location.href = url;
                if (!wasIOS && !wasAndroid) {
                    setTimeout(() => {
                        if (document.hidden) return;
                        window.open(fallbackInstall, '_blank', 'noopener');
                        if (window.LapeeetUI) LapeeetUI.showToast('Install Organic Maps (desktop) or use the OSM link', 'info');
                    }, 1800);
                }
            } catch (e) {
                window.open(fallbackInstall, '_blank', 'noopener');
            }
        },

        /* ---------- UTIL ---------- */

        haversineKm(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const toRad = d => d * Math.PI / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 +
                      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
    };

    global.LapeeetMap = LapeeetMap;
})(window);
