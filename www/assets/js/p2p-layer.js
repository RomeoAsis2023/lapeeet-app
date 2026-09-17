/* =============================================================
   Lapeeet — P2P Layer (webconnect.js + Ed25519 signing)
   Phase 3 implementation.
   Responsible for:
     - Initialising webconnect mesh (geo-sharded channels by cell)
     - Ed25519 key pair generation per tenant (stable connectId identity)
     - Message protocol broadcast/direct with schema validation + signing
     - Event handlers: DRIVER_STATUS, RIDE_REQUEST, RIDE_ACCEPT, ...
     - Peer lifecycle (onConnect / onDisconnect / Ping)
   ============================================================= */

(function (global) {
    'use strict';

    const P2P_VERSION = '0.0.1';
    const APP_NAME = 'lapeeet';

    const MSG_TYPES = Object.freeze({
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
        DB_SYNC_REQ:     'DB_SYNC_REQ',
        DB_SYNC_RES:     'DB_SYNC_RES',
        CALL_INITIATE:   'CALL_INITIATE',
        CALL_END:        'CALL_END'
    });

    const LapeeetP2P = {
        version: P2P_VERSION,
        APP_NAME,
        MSG_TYPES,

        connect: null,            // webconnect instance
        connectId: null,          // self peer id
        myPublicKey: null,
        mySecretKey: null,
        initialized: false,
        status: 'offline',        // offline | connecting | online | error

        // In-memory caches (Phase 3)
        peers: new Map(),         // connectId → { lastSeen, role, lat, lng, capacity, brand, model, rating }
        rideRequests: new Map(),  // ride_id → full request object (last 1h)
        activeRide: null,         // { ride_id, peer_connect_id, role }

        /* ---------- LIFECYCLE ---------- */

        /**
         * Initialise webconnect mesh with geo-sharded channel name.
         * @param {object} opts - { lat, lng, onEventCallback }
         */
        async init(opts) {
            console.debug('[P2P-LAYER] init()');
            this.status = 'connecting';
            // TODO Phase 3:
            //   1. _ensureKeys() → load or generate Ed25519 keys, derive connectId
            //   2. Compute geohash cell of opts.lat, opts.lng for channelName
            //   3. this.connect = webconnect({
            //        appName: APP_NAME,
            //        channelName: `lapeeet-${geohashCell}`,
            //        connectPassword: null // or app-specific salt
            //      })
            //   4. Wire .onConnect / onDisconnect / onReceive handlers →
            //      each validates signature + schema then dispatches to opts.onEventCallback
            //   5. this.connectId = result of getMyId
            //   6. this.status = 'online'
            this.initialized = true;
            this.status = 'online';
            return Promise.resolve(true);
        },

        shutdown() {
            // TODO Phase 3: this.connect?.Disconnect(); this.status = 'offline'
        },

        _ensureKeys() {
            // TODO Phase 3:
            //   Load from LapeeetDB or localStorage → if not present
            //   nacl.sign.keyPair() → store secret key encrypted + public key plain
        },

        /* ---------- SIGNING ---------- */

        /** Sign JSON object with tenant Ed25519 key. Returns base64 signature. */
        sign(obj) {
            // TODO Phase 3:
            //   const bytes = naclUtil.decodeUTF8(JSON.stringify(obj))
            //   const sig = nacl.sign.detached(bytes, this.mySecretKey)
            //   return naclUtil.encodeBase64(sig)
            return 'todo-sig';
        },

        /** Verify a signed message from a peer (uses their cached public key) */
        verify(obj, signatureBase64, peerConnectId) {
            // TODO Phase 3
            return true;
        },

        /* ---------- MESSAGING ---------- */

        /** Broadcast to all peers in the mesh (geo-channel) */
        broadcast(type, body) {
            // TODO Phase 3:
            //   const envelope = { type, body, from: this.connectId,
            //                      ts: Date.now(), sig: this.sign({type,body,ts}) }
            //   this.connect.Send(envelope, { connectId: null })
        },

        /** Direct message to a single peer connectId */
        sendDirect(toConnectId, type, body) {
            // TODO Phase 3: envelope with to field
        },

        /* ---------- CONVENIENCE SENDERS (Phase 3) ---------- */

        sendDriverStatus(status) {
            // this.broadcast(MSG_TYPES.DRIVER_STATUS, { online, lat, lng,
            //   capacity, brand, model, rating })
        },
        sendRideRequest(rideObj) { /* broadcast */ },
        sendRideAccept(rideId, toRiderId, etaMin, ebikeSummary) { /* direct */ },
        sendLocationUpdate(lat, lng, rideId) { /* direct or broadcast */ },
        sendRideStatus(rideId, toId, newStatus) { /* direct */ },
        sendRating(rideId, toId, stars, comment) { /* direct */ },

        /* ---------- VALIDATION HELPERS ---------- */

        validateRideRequest(body) {
            // Enforce distance_km <= 60, capacity requested in whitelist, etc.
            // return boolean
            return true;
        },
        validateCapacity(cap) {
            return [1, 2, 3, 6, 8, 10, 12, 15].includes(cap);
        }
    };

    global.LapeeetP2P = LapeeetP2P;
})(window);
