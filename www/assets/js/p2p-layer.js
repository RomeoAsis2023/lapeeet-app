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
        RIDE_REJECT:     'RIDE_REJECT',
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
        _seenIds: [],             // envelope dedup ring
        _heartbeatTimer: null,
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
                iceConfiguration: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
            });
            const self = this;
            this.connect.getMyId((out) => { self.transportId = out && out.connectId; });
            this.connect.onConnect((peer) => self._onTransportJoin(peer && peer.connectId));
            this.connect.onDisconnect((peer) => self._onTransportLeave(peer && peer.connectId));
            this.connect.onReceive((data, peer) => self._onReceive(data, peer && peer.connectId));

            this.initialized = true;
            this.status = 'online';
            // Announce ourselves so the cell learns identity->transport mapping.
            setTimeout(() => { try { self._sendHello(null); } catch (e) {} }, 1200);
            // Driver presence heartbeat.
            if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = setInterval(() => self._heartbeatTick(), HEARTBEAT_MS);
            this._emit({ type: '__status', status: this.status, channel: this.channel });
            return true;
        },

        shutdown() {
            if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
            try { this.connect && this.connect.Disconnect(); } catch (e) {}
            this.connect = null;
            this.initialized = false;
            this.status = 'offline';
        },

        setRole(role) { this._role = role; },

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
            // Greet the newcomer directly so both sides learn the mapping fast.
            try { this._sendHello(transportId); } catch (e) {}
            this._emit({ type: '__peer-join', transportId });
        },

        _onTransportLeave(transportId) {
            if (!transportId) return;
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
            if (this._seen(data.id)) return;
            this._markSeen(data.id);
            // Bind transport <-> identity on every verified message.
            if (!this.verify(data)) {
                console.warn('[P2P] bad signature, dropping', data.type);
                return;
            }
            const isSelf = data.from === this.connectId;
            if (!isSelf) {
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
                typeof e.sig === 'string' && e.from === e.pub;
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

        _sendHello(transportId) {
            const snap = this._profileSnapshot();
            const body = { pub: this.myPublicKey, role: snap.role, name: snap.name };
            if (transportId) this.sendDirectByTransport(transportId, MSG_TYPES.HELLO, body);
            else this.broadcast(MSG_TYPES.HELLO, body);
        },

        _currentLoc() {
            // Cached-first geolocation (cheap on 10s heartbeat).
            return new Promise((resolve) => {
                if (!navigator.geolocation) { resolve(null); return; }
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    () => resolve(null),
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                );
            });
        },

        async _heartbeatTick() {
            if (!this.initialized || this.status !== 'online') return;
            if (this._role !== 'DRIVER') return;
            const loc = await this._currentLoc();
            let brand = '', model = '', capacity = 0;
            try {
                if (global.LapeeetDB && LapeeetDB.initialized) {
                    const bike = LapeeetDB.getPrimaryEbike() || (LapeeetDB.listEbikes()[0] || null);
                    if (bike) { brand = bike.brand; model = bike.model; capacity = bike.capacity; }
                }
            } catch (e) {}
            this.broadcast(MSG_TYPES.DRIVER_STATUS, {
                online: true,
                tLat: loc ? trunc3(loc.lat) : undefined,
                tLng: loc ? trunc3(loc.lng) : undefined,
                capacity, brand, model
            });
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
            return { v: 1, id, type, body, from: this.connectId, pub: this.myPublicKey, ts, sig: util.encodeBase64(sig) };
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

        /* ---------- CONVENIENCE SENDERS ---------- */

        sendRideRequest(rideObj) { return this.broadcast(MSG_TYPES.RIDE_REQUEST, rideObj); },
        sendRideAccept(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDE_ACCEPT, payload); },
        sendRideReject(identityB64, payload) { return this.sendDirect(identityB64, MSG_TYPES.RIDE_REJECT, payload); },
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
})(window);
