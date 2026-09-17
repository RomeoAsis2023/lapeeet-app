/* =============================================================
   Lapeeet — P2P Layer (webconnect.js + Ed25519 signing) — Phase 3 REAL
   Transport: webconnect() = 3 Trystero rooms (torrent/nostr/mqtt).
     - connect.Send(data, {connectId: null})  = broadcast to peers
     - connect.Send(data, {connectId: <transportId>}) = direct
     - transport peerIds are EPHEMERAL per session.
   Identity: Ed25519 keypair per tenant (IndexedDB). connectId =
     base64(pubkey). Every envelope carries from+pub+sig; receivers
     verify and map identity -> transport peerId for directs.
   Dedup: same envelope can arrive via multiple engines -> id cache.
   ============================================================= */

(function (global) {
    'use strict';

    const P2P_VERSION = '3.0.0-phase3';
    const APP_NAME = 'lapeeet';
    const HEARTBEAT_MS = 10000;
    const IDB_NAME = 'lapeeet-idb-v1';
    const IDB_STORE = 'kv';
    const IDENTITY_KEY = 'lapeeet::identity_v1';

    const MSG_TYPES = Object.freeze({
        HELLO:           'HELLO',
        DRIVER_STATUS:   'DRIVER_STATUS',
        RIDE_REQUEST:    'RIDE_REQUEST',
        RIDE_ACCEPT:     'RIDE_ACCEPT',
        RIDE_REJECT:     'RIDE_REJECT',   // reasons: declined | taken | expired
        RIDE_LOCKED:     'RIDE_LOCKED',   // Phase 13: passenger broadcast, first-accept-wins
        PING:            'PING',          // Phase 14: signed latency probe {nonce, ts}
        PONG:            'PONG',          // Phase 14: signed latency reply {nonce, ts}
        RIDE_CANCEL:     'RIDE_CANCEL',
        RIDE_STATUS:     'RIDE_STATUS',
        LOCATION_UPDATE: 'LOCATION_UPDATE',
        EBIKE_INFO:      'EBIKE_INFO',
        RIDER_INFO:      'RIDER_INFO',
        RATING:          'RATING',
        CHAT:            'CHAT',
        DB_SYNC_REQ:     'DB_SYNC_REQ',
        DB_SYNC_RES:     'DB_SYNC_RES',
        CALL_INITIATE:   'CALL_INITIATE',
        CALL_END:        'CALL_END'
    });

    // Phase 13: driver offer window — one constant, both sides agree.
    const RIDE_OFFER_MS = 60000;

    // Phase 15: STUN redundancy — one server failing must not kill NAT traversal.
    const STUN_SERVERS = [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
        'stun:stun3.l.google.com:19302',
        'stun:stun4.l.google.com:19302'
    ];

    /* ---------- geohash-4 (no dep) ---------- */
    const GH32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    function geohash(lat, lng, len) {
        let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
        let hash = '', bits = 0, chr = 0, even = true;
        while (hash.length < (len || 4)) {
            if (even) {
                const mid = (minLng + maxLng) / 2;
                if (lng >= mid) { chr = chr * 2 + 1; minLng = mid; }
                else { chr = chr * 2; maxLng = mid; }
            } else {
                const mid = (minLat + maxLat) / 2;
                if (lat >= mid) { chr = chr * 2 + 1; minLat = mid; }
                else { chr = chr * 2; maxLat = mid; }
            }
            even = !even;
            if (++bits === 5) { hash += GH32[chr]; bits = 0; chr = 0; }
        }
        return hash;
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        const R = 6371, toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function trunc3(x) { return Number(Number(x).toFixed(3)); }

    function idbGet(key) {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
                req.onsuccess = () => {
                    const db = req.result;
                    try {
                        const tx = db.transaction(IDB_STORE, 'readonly');
                        const rq = tx.objectStore(IDB_STORE).get(key);
                        rq.onsuccess = () => { resolve(rq.result); db.close(); };
                        rq.onerror = () => { reject(rq.error); db.close(); };
                    } catch (e) { try { db.close(); } catch (_) {} reject(e); }
                };
                req.onerror = () => reject(req.error);
            } catch (e) { reject(e); }
        });
    }
    function idbSet(key, val) {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
                req.onsuccess = () => {
                    const db = req.result;
                    try {
                        const tx = db.transaction(IDB_STORE, 'readwrite');
                        tx.objectStore(IDB_STORE).put(val, key);
                        tx.oncomplete = () => { resolve(true); db.close(); };
                        tx.onerror = () => { reject(tx.error); db.close(); };
                    } catch (e) { try { db.close(); } catch (_) {} reject(e); }
                };
                req.onerror = () => reject(req.error);
            } catch (e) { reject(e); }
        });
    }

    const LapeeetP2P = {
        version: P2P_VERSION,
        APP_NAME,
        MSG_TYPES,

        connect: null,            // webconnect instance
        transportId: null,        // ephemeral Trystero self id (per session)
        connectId: null,          // STABLE tenant identity = b64(pubkey)
        myPublicKey: null,        // b64 Ed25519 pubkey (= connectId)
        mySecretKey: null,        // Uint8Array (memory only, never broadcast)
        channel: null,            // lapeeet-<geohash4>
        initialized: false,
        status: 'offline',        // offline | connecting | online | error

        peers: new Map(),         // identityB64 -> { transportId, lastSeen, role, name, tLat, tLng, capacity, brand, model }
        rideRequests: new Map(),  // ride_id -> full request envelope body (drivers, last 1h)
        activeRide: null,         // { ride_id, peer_identity, role }
        latency: new Map(),       // Phase 14: identityB64 -> { rtt, ts }
        _pendingPings: {},        // nonce -> { to, ts, timer }
        _meshLog: [],             // Phase 15: ring buffer {ts, msg} for diagnostics
        lastPeerActivity: 0,      // Phase 15: Date.now() of last join/verified message
        rejoinCount: 0,           // Phase 15: isolation rejoins this session
        _watchdogTimer: null,
        _seenIds: [],             // envelope dedup ring
        _heartbeatTimer: null,
        _reconcileTimer: null,
        _onEvent: null,
        _role: 'RIDER',

        /* ---------- LIFECYCLE ---------- */

        async init(opts) {
            opts = opts || {};
            if (this.initialized && this.connect) return true;
            this.status = 'connecting';
            this._onEvent = opts.onEventCallback || null;
            this._role = opts.role || this._role || 'RIDER';
            if (typeof global.webconnect !== 'function') {
                this.status = 'error';
                throw new Error('webconnect.js runtime missing');
            }
            await this._ensureKeys();
            const lat = Number(opts.lat) || 14.5995;
            const lng = Number(opts.lng) || 120.9842;
            this.channel = 'lapeeet-' + geohash(lat, lng, 4);

            this.connect = global.webconnect({
                appName: APP_NAME,
                channelName: this.channel,
                iceConfiguration: { iceServers: STUN_SERVERS.map((u) => ({ urls: u })) }
            });
            const self = this;
            this.connect.getMyId((out) => { self.transportId = out && out.connectId; });
            this.connect.onConnect((peer) => self._onTransportJoin(peer && peer.connectId));
            this.connect.onDisconnect((peer) => self._onTransportLeave(peer && peer.connectId));
            this.connect.onReceive((data, peer) => self._onReceive(data, peer && peer.connectId));

            this.initialized = true;
            this.status = 'online';
            this.lastPeerActivity = Date.now();
            this._mlog('joined ' + this.channel + ' as ' + String(this.transportId).slice(0, 8));
            // Announce ourselves so the cell learns identity->transport mapping.
            setTimeout(() => { try { self._sendHello(null); } catch (e) {} }, 1200);
            // Driver presence heartbeat.
            if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = setInterval(() => self._heartbeatTick(), HEARTBEAT_MS);
            // Phase 14: transport reconcile — HELLO any connected peer we have
            // no identity mapping for (covers missed HELLOs so ALL peers connect).
            if (this._reconcileTimer) clearInterval(this._reconcileTimer);
            this._reconcileTimer = setInterval(() => self._reconcilePeers(), 20000);
            setTimeout(() => self._reconcilePeers(), 3000);
            // Phase 15: isolation watchdog — rejoin when the mesh goes silent.
            if (this._watchdogTimer) clearInterval(this._watchdogTimer);
            this._watchdogTimer = setInterval(() => self._watchdogTick(), 15000);
            this._emit({ type: '__status', status: this.status, channel: this.channel });
            return true;
        },

        shutdown() {
            if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
            if (this._reconcileTimer) clearInterval(this._reconcileTimer);
            this._reconcileTimer = null;
            if (this._watchdogTimer) clearInterval(this._watchdogTimer);
            this._watchdogTimer = null;
            try { this.connect && this.connect.Disconnect(); } catch (e) {}
            this.connect = null;
            this.initialized = false;
            this.status = 'offline';
        },

        setRole(role) { this._role = role; },

        /* ---------- PHASE 15: DIAGNOSTICS + AUTO-REJOIN ---------- */

        _mlog(msg) {
            try {
                this._meshLog.push({ ts: Date.now(), msg: String(msg).slice(0, 160) });
                if (this._meshLog.length > 40) this._meshLog.splice(0, this._meshLog.length - 40);
            } catch (e) {}
        },

        _touchActivity() { this.lastPeerActivity = Date.now(); },

        _transportCount() {
            if (!this.connect) return 0;
            try {
                let n = 0;
                this.connect.getConnection((out) => {
                    const list = (out && (out.connection || out.connections)) || [];
                    n = Array.isArray(list) ? list.length : 0;
                });
                return n;
            } catch (e) { return -1; }
        },

        meshStats() {
            const now = Date.now();
            return {
                channel: this.channel,
                status: this.status,
                transportId: this.transportId,
                transports: this._transportCount(),
                peers: this.peerCount(),
                rejoins: this.rejoinCount,
                idleSec: this.lastPeerActivity ? Math.round((now - this.lastPeerActivity) / 1000) : -1,
                log: this._meshLog.slice(-12)
            };
        },

        _shouldRejoin(now) {
            if (!this.initialized || this.status !== 'online') return false;
            if (!this.lastPeerActivity) return false;
            return (now - this.lastPeerActivity) > 60000;
        },

        _watchdogTick() {
            if (!this._shouldRejoin(Date.now())) return;
            this._mlog('isolated 60s+ with 0 activity — rejoining mesh');
            try {
                if (window.LapeeetUI) LapeeetUI.showToast('Mesh silent — reconnecting…', 'warning');
            } catch (e) {}
            this.rejoin();
        },

        /**
         * Leave + rejoin the channel with a fresh transport session.
         * Identity keys are kept (stable connectId); transport-bound state
         * (peers, latency, pending pings) is dropped — it rebuilds via HELLO.
         */
        async rejoin() {
            const opts = {
                lat: (this.myLoc && this.myLoc.lat) || 14.5995,
                lng: (this.myLoc && this.myLoc.lng) || 120.9842,
                role: this._role,
                onEventCallback: this._onEvent
            };
            const keepChannel = this.channel;
            try {
                Object.keys(this._pendingPings || {}).forEach((n) => {
                    try { clearTimeout(this._pendingPings[n].timer); } catch (e) {}
                });
            } catch (e) {}
            this._pendingPings = {};
            this.peers = new Map();
            this.latency = new Map();
            this._seenIds = [];
            this.shutdown();
            this.rejoinCount++;
            this._mlog('rejoin #' + this.rejoinCount + ' on ' + keepChannel);
            try {
                await this.init(opts);
            } catch (e) {
                this._mlog('rejoin failed: ' + (e.message || e));
            }
            return true;
        },

        async _ensureKeys() {
            const util = (global.nacl && global.nacl.util) || global.naclUtil;
            if (!global.nacl || !global.nacl.sign || !util) {
                throw new Error('TweetNaCl runtime missing');
            }
            let saved = null;
            try { saved = await idbGet(IDENTITY_KEY); } catch (e) { saved = null; }
            if (saved && saved.secret && saved.pub) {
                this.mySecretKey = util.decodeBase64(saved.secret);
                this.myPublicKey = saved.pub;
            } else {
                const kp = global.nacl.sign.keyPair();
                this.mySecretKey = kp.secretKey;
                this.myPublicKey = util.encodeBase64(kp.publicKey);
                try {
                    await idbSet(IDENTITY_KEY, {
                        secret: util.encodeBase64(kp.secretKey),
                        pub: this.myPublicKey
                    });
                } catch (e) { console.warn('[P2P] identity persist failed:', e && e.message); }
            }
            this.connectId = this.myPublicKey;
            // Mirror identity into tenant DB when ready (export travels with it).
            try {
                if (global.LapeeetDB && LapeeetDB.initialized) {
                    LapeeetDB.setIdentity(this.connectId, this.myPublicKey);
                }
            } catch (e) { /* DB not ready — fine */ }
        },

        /* ---------- TRANSPORT EVENTS ---------- */

        _onTransportJoin(transportId) {
            if (!transportId) return;
            this._touchActivity();
            this._mlog('transport join ' + String(transportId).slice(0, 8));
            // Greet the newcomer directly so both sides learn the mapping fast.
            try { this._sendHello(transportId); } catch (e) {}
            this._emit({ type: '__peer-join', transportId });
        },

        _onTransportLeave(transportId) {
            if (!transportId) return;
            this._mlog('transport leave ' + String(transportId).slice(0, 8));
            // Drop identity mappings bound to this transport.
            const gone = [];
            this.peers.forEach((p, ident) => {
                if (p.transportId === transportId) gone.push(ident);
            });
            gone.forEach(id => {
                this.peers.delete(id);
                try { if (global.LapeeetMap) LapeeetMap.removeDriverPin(id); } catch (e) {}
            });
            this._emit({ type: '__peer-leave', transportId, identities: gone });
        },

        _onReceive(data, transportId) {
            if (!data || typeof data !== 'object') return;
            if (!this._validEnvelopeShape(data)) return;
            // Phase 16 room check (fail-open for legacy cached builds without
            // the stamp; drops only present-but-mismatched rooms).
            if (data.room !== undefined && data.room !== null &&
                this.channel && data.room !== this.channel) {
                try { this._mlog('dropped cross-room msg ' + data.type); } catch (e) {}
                return;
            }
            if (this._seen(data.id)) return;
            this._markSeen(data.id);
            // Bind transport <-> identity on every verified message.
            if (!this.verify(data)) {
                console.warn('[P2P] bad signature, dropping', data.type);
                return;
            }
            const isSelf = data.from === this.connectId;
            if (!isSelf) {
                this._touchActivity();
                this.peers.set(data.from, Object.assign(
                    this.peers.get(data.from) || {},
                    { transportId, lastSeen: Date.now() }
                ));
            }
            this._dispatch(data, transportId, isSelf);
        },

        _validEnvelopeShape(e) {
            return e && typeof e.id === 'string' && typeof e.type === 'string' &&
                e.body !== undefined && typeof e.from === 'string' &&
                typeof e.pub === 'string' && typeof e.ts === 'number' &&
                typeof e.sig === 'string' && e.from === e.pub &&
                (e.room === undefined || e.room === null || typeof e.room === 'string');
        },

        _seen(id) { return this._seenIds.indexOf(id) !== -1; },
        _markSeen(id) {
            this._seenIds.push(id);
            if (this._seenIds.length > 1000) this._seenIds.splice(0, this._seenIds.length - 1000);
        },

        _dispatch(env, transportId, isSelf) {
            const T = MSG_TYPES, b = env.body || {};
            switch (env.type) {
                case T.HELLO: {
                    if (!isSelf) {
                        const cur = this.peers.get(env.from) || {};
                        cur.role = b.role || cur.role || 'RIDER';
                        cur.name = b.name || cur.name || '';
                        if (b.tLat !== undefined) cur.tLat = b.tLat;
                        if (b.tLng !== undefined) cur.tLng = b.tLng;
                        cur.transportId = transportId;
                        cur.lastSeen = Date.now();
                        this.peers.set(env.from, cur);
                        // Instant presence solicit: a rider just appeared — answer
                        // immediately instead of making them wait for the 10s tick,
                        // so passengers see ALL connected drivers within ~1-2s.
                        if (this._role === 'DRIVER' && cur.role !== 'DRIVER') {
                            try {
                                const r = this._sendDriverStatusNow();
                                if (r && r.catch) r.catch(() => {});
                            } catch (e) {}
                        }
                    }
                    break;
                }
                case T.DRIVER_STATUS: {
                    if (!isSelf && b.online) {
                        const cur = this.peers.get(env.from) || {};
                        cur.role = 'DRIVER';
                        cur.transportId = transportId;
                        cur.lastSeen = Date.now();
                        cur.tLat = b.tLat; cur.tLng = b.tLng;
                        cur.capacity = b.capacity; cur.brand = b.brand; cur.model = b.model;
                        this.peers.set(env.from, cur);
                        try {
                            if (global.LapeeetMap && b.tLat !== undefined) {
                                LapeeetMap.upsertDriverPin(env.from, b.tLat, b.tLng, {
                                    name: (b.brand || 'Driver') + ' ' + (b.model || '')
                                });
                            }
                        } catch (e) {}
                    } else if (!isSelf && b.online === false) {
                        this.peers.delete(env.from);
                        try { if (global.LapeeetMap) LapeeetMap.removeDriverPin(env.from); } catch (e) {}
                    }
                    break;
                }
                case T.PING: {
                    if (!isSelf) this._onPing({ from: env.from, body: b, isSelf });
                    break;
                }
                case T.PONG: {
                    if (!isSelf) this._onPong({ from: env.from, body: b, isSelf });
                    break;
                }
                case T.RIDE_REQUEST: {
                    if (!isSelf && this.validateRideRequest(b)) {
                        this.rideRequests.set(b.ride_id, {
                            body: b, from: env.from, transportId, ts: env.ts
                        });
                        // Prune requests older than 1h.
                        const cut = Date.now() - 3600000;
                        this.rideRequests.forEach((v, k) => { if (v.ts < cut) this.rideRequests.delete(k); });
                    }
                    break;
                }
                default:
                    break; // directed types flow to the app via _emit below
            }
            this._emit({ type: env.type, body: b, from: env.from, transportId, isSelf, ts: env.ts });
        },

        _emit(evt) {
            try { if (this._onEvent) this._onEvent(evt); } catch (e) {
                console.warn('[P2P] event callback failed:', e && e.message);
            }
            // Keep sidebar + home status fresh without app polling.
            try {
                if (global.LapeeetUI && (evt.type === '__status' || evt.type === '__peer-join' || evt.type === '__peer-leave')) {
                    LapeeetUI.updateSidebar({ p2pStatus: this.status + ' · ' + this.peerCount() + ' peers' });
                }
            } catch (e) {}
        },

        /* ---------- PRESENCE ---------- */

        _profileSnapshot() {
            let name = '';
            try {
                if (global.LapeeetDB && LapeeetDB.initialized) {
                    name = LapeeetDB.displayName() || '';
                }
            } catch (e) {}
            return { role: this._role, name };
        },

        _sendHello(transportId, extra) {
            const snap = this._profileSnapshot();
            const body = Object.assign({ pub: this.myPublicKey, role: snap.role, name: snap.name }, extra || {});
            if (transportId) this.sendDirectByTransport(transportId, MSG_TYPES.HELLO, body);
            else this.broadcast(MSG_TYPES.HELLO, body);
        },

        _currentLoc() {
            // Shared cache with the map layer when available (cheap on 10s heartbeat).
            try {
                if (global.LapeeetMap && LapeeetMap.cachedLocation) return LapeeetMap.cachedLocation(60000);
            } catch (e) {}
            return new Promise((resolve) => {
                if (!navigator.geolocation) { resolve(null); return; }
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => resolve(null),
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                );
            });
        },

        myLoc: null,            // last known own position {lat, lng, ts}
        _lastRiderHello: 0,
        RIDER_HELLO_MS: 15000,

        async _heartbeatTick() {
            if (!this.initialized || this.status !== 'online') return;
            const loc = await this._currentLoc();
            if (loc) this.myLoc = { lat: loc.lat, lng: loc.lng, ts: Date.now() };
            if (this._role !== 'DRIVER') {
                // Passenger presence: truncated coords only (no name/phone/photo),
                // so nearby drivers can discover them. Throttled to 15s.
                if (loc && Date.now() - this._lastRiderHello > this.RIDER_HELLO_MS) {
                    this._lastRiderHello = Date.now();
                    this._sendHello(null, { tLat: trunc3(loc.lat), tLng: trunc3(loc.lng) });
                }
                return;
            }
            let brand = '', model = '', capacity = 0;
            try {
                if (global.LapeeetDB && LapeeetDB.initialized) {
                    const bike = LapeeetDB.getPrimaryEbike() || (LapeeetDB.listEbikes()[0] || null);
                    if (bike) { brand = bike.brand; model = bike.model; capacity = bike.capacity; }
                }
            } catch (e) {}
            await this._sendDriverStatusNow(loc, { brand, model, capacity });
            // Exact live location goes ONLY to the matched passenger (direct).
            try {
                if (this.activeRide && this.activeRide.peer_identity && loc) {
                    this.sendDirect(this.activeRide.peer_identity, MSG_TYPES.LOCATION_UPDATE, {
                        ride_id: this.activeRide.ride_id,
                        lat: loc.lat, lng: loc.lng, ts: Date.now()
                    });
                }
            } catch (e) {}
        },

        /** Broadcast one DRIVER_STATUS now (heartbeat tick + instant solicit). */
        async _sendDriverStatusNow(knownLoc, knownBike) {
            const loc = knownLoc || await this._currentLoc();
            let brand = '', model = '', capacity = 0;
            if (knownBike) {
                brand = knownBike.brand || ''; model = knownBike.model || ''; capacity = knownBike.capacity || 0;
            } else {
                try {
                    if (global.LapeeetDB && LapeeetDB.initialized) {
                        const bike = LapeeetDB.getPrimaryEbike() || (LapeeetDB.listEbikes()[0] || null);
                        if (bike) { brand = bike.brand; model = bike.model; capacity = bike.capacity; }
                    }
                } catch (e) {}
            }
            return this.broadcast(MSG_TYPES.DRIVER_STATUS, {
                online: true,
                tLat: loc ? trunc3(loc.lat) : undefined,
                tLng: loc ? trunc3(loc.lng) : undefined,
                capacity, brand, model
            });
        },

        /* ---------- TRANSPORT RECONCILE (Phase 14: all peers auto-connected) ---------- */

        /**
         * Ask the transport for every connected peer id; greet any transport
         * peer we hold no identity mapping for. Closes the "missed HELLO" gap
         * so every peer in the channel ends up mapped + announced.
         */
        _reconcilePeers() {
            if (!this.initialized || this.status !== 'online' || !this.connect) return;
            let tids = [];
            try {
                this.connect.getConnection((out) => {
                    const list = (out && (out.connection || out.connections)) || [];
                    tids = Array.isArray(list) ? list : [];
                });
            } catch (e) { return; }
            if (!tids.length) return;
            const known = new Set([this.transportId]);
            this.peers.forEach((p) => { if (p.transportId) known.add(p.transportId); });
            tids.forEach((tid) => {
                if (tid && !known.has(tid)) {
                    known.add(tid); // greet once per sweep
                    try { this._sendHello(tid); } catch (e) {}
                }
            });
        },

        /* ---------- SIGNED LATENCY PROBE (Phase 14: Ping equivalent) ---------- */

        PING_TIMEOUT_MS: 5000,

        /**
         * Signed ping to a stable identity. RTT lands in this.latency on PONG.
         * Returns nonce, or false when offline/unknown peer.
         */
        pingPeer(identityB64) {
            if (!this.connect || this.status !== 'online') return false;
            const peer = this.peers.get(identityB64);
            if (!peer || !peer.transportId) return false;
            const nonce = Math.random().toString(36).slice(2, 10) +
                Date.now().toString(36).slice(-4);
            const self = this;
            const timer = setTimeout(() => {
                if (self._pendingPings[nonce]) {
                    delete self._pendingPings[nonce];
                    self._emit({ type: '__ping-timeout', from: identityB64 });
                }
            }, this.PING_TIMEOUT_MS);
            this._pendingPings[nonce] = { to: identityB64, ts: Date.now(), timer };
            const env = this.sendDirect(identityB64, MSG_TYPES.PING, { nonce, ts: Date.now() });
            if (!env) {
                try { clearTimeout(timer); } catch (e) {}
                delete this._pendingPings[nonce];
                return false;
            }
            return nonce;
        },

        _onPing(env, transportId) {
            if (env.isSelf) return;
            // Authenticated by envelope signature upstream — echo back.
            this.sendDirect(env.from, MSG_TYPES.PONG, {
                nonce: env.body.nonce, ts: env.body.ts
            });
        },

        _onPong(env) {
            if (env.isSelf) return;
            const pend = this._pendingPings[env.body.nonce];
            if (!pend || pend.to !== env.from) return; // stray or foreign reply
            try { clearTimeout(pend.timer); } catch (e) {}
            delete this._pendingPings[env.body.nonce];
            const rtt = Math.max(0, Date.now() - Number(env.body.ts || Date.now()));
            this.latency.set(env.from, { rtt, ts: Date.now() });
            this._emit({ type: 'PONG', body: { nonce: env.body.nonce, rtt }, from: env.from, isSelf: false });
        },

        /* ---------- SIGNING ---------- */

        _canonical(type, body, ts, id, from) {
            return JSON.stringify({ v: 1, id, type, body, from, ts });
        },

        signEnvelope(type, body) {
            const util = (global.nacl && global.nacl.util) || global.naclUtil;
            const ts = Date.now();
            const id = util.encodeBase64(global.nacl.randomBytes(12));
            const msg = this._canonical(type, body, ts, id, this.connectId);
            const sig = global.nacl.sign.detached(util.decodeUTF8(msg), this.mySecretKey);
            // Phase 16 room stamp: UNSIGNED routing metadata (trust comes from
            // the signature + channel join, never from this field).
            return { v: 1, id, type, body, from: this.connectId, pub: this.myPublicKey, ts, sig: util.encodeBase64(sig), room: this.channel || null };
        },

        /** Sign an arbitrary object (compat helper). Returns base64 signature. */
        sign(obj) {
            const util = (global.nacl && global.nacl.util) || global.naclUtil;
            const bytes = util.decodeUTF8(JSON.stringify(obj));
            return util.encodeBase64(global.nacl.sign.detached(bytes, this.mySecretKey));
        },

        verify(env) {
            try {
                const util = (global.nacl && global.nacl.util) || global.naclUtil;
                // Freshness: ±24h window, 2min future skew.
                if (Math.abs(Date.now() - env.ts) > 86400000 || env.ts > Date.now() + 120000) return false;
                const msg = this._canonical(env.type, env.body, env.ts, env.id, env.from);
                const pub = util.decodeBase64(env.pub);
                const sig = util.decodeBase64(env.sig);
                return global.nacl.sign.detached.verify(util.decodeUTF8(msg), sig, pub);
            } catch (e) { return false; }
        },

        /* ---------- MESSAGING ---------- */

        /** Broadcast to all peers in the mesh (geo-channel). Returns envelope or false. */
        broadcast(type, body) {
            if (!this.connect || this.status !== 'online') return false;
            const env = this.signEnvelope(type, body);
            try {
                this.connect.Send(env, { connectId: null });
                return env;
            } catch (e) {
                console.warn('[P2P] broadcast failed:', e && e.message);
                return false;
            }
        },

        /** Direct message to a single TRANSPORT peer id. */
        sendDirectByTransport(transportId, type, body) {
            if (!this.connect || this.status !== 'online' || !transportId) return false;
            const env = this.signEnvelope(type, body);
            try {
                this.connect.Send(env, { connectId: transportId });
                return env;
            } catch (e) {
                console.warn('[P2P] direct failed:', e && e.message);
                return false;
            }
        },

        /** Direct message to a stable tenant IDENTITY (pubkey b64). */
        sendDirect(identityB64, type, body) {
            const peer = this.peers.get(identityB64);
            if (!peer || !peer.transportId) return false;
            return this.sendDirectByTransport(peer.transportId, type, body);
        },

        peerCount() { return this.peers.size; },

        RIDE_OFFER_MS,
        STUN_SERVERS,

        /* ---------- CONVENIENCE SENDERS ---------- */

        sendRideRequest(rideObj) { return this.broadcast(MSG_TYPES.RIDE_REQUEST, rideObj); },
        sendRideAccept(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDE_ACCEPT, payload); },
        sendRideReject(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDE_REJECT, payload); },
        sendRideLocked(payload) { return this.broadcast(MSG_TYPES.RIDE_LOCKED, payload); },
        sendRideCancel(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDE_CANCEL, payload); },
        sendRideStatus(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDE_STATUS, payload); },
        sendLocationUpdate(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.LOCATION_UPDATE, payload); },
        sendEbikeInfo(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.EBIKE_INFO, payload); },
        sendRiderInfo(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDER_INFO, payload); },
        sendRating(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RATING, payload); },
        sendChat(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.CHAT, payload); },

        /* ---------- VALIDATION ---------- */

        validateRideRequest(b) {
            if (!b || typeof b !== 'object') return false;
            if (!b.ride_id || typeof b.ride_id !== 'string') return false;
            // Phase 13: requests are passenger-only (peer recheck layer).
            if (b.role !== 'RIDER') return false;
            // Phase 13: offer must carry a live expiry (30s clock-skew grace).
            if (typeof b.expires_at !== 'number' || isNaN(b.expires_at)) return false;
            if (b.expires_at - Date.now() < -30000) return false;
            const need = ['pickup_lat', 'pickup_lng', 'drop_lat', 'drop_lng', 'distance_km', 'capacity'];
            for (const k of need) { if (typeof b[k] !== 'number' || isNaN(b[k])) return false; }
            if (!this.validateCapacity(b.capacity)) return false;
            // Receiver recomputes distance (peer recheck layer of the 60km cap).
            const reKm = haversineKm(b.pickup_lat, b.pickup_lng, b.drop_lat, b.drop_lng);
            if (reKm > 60 || Number(b.distance_km) > 60) return false;
            // Claimed distance must roughly match coords (spoof guard, 25% tolerance).
            if (Math.abs(reKm - Number(b.distance_km)) > Math.max(2, reKm * 0.25)) return false;
            return true;
        },
        validateCapacity(cap) {
            return [1, 2, 3, 6, 8, 10, 12, 15].indexOf(Number(cap)) !== -1;
        }
    };

    global.LapeeetP2P = LapeeetP2P;
    global.LapeeetGeohash = geohash;
    global.LapeeetGeo = { geohash, haversineKm, trunc3, MAX_TRIP_KM: 60, RIDE_OFFER_MS };
})(window);
