/* =============================================================
   Lapeeet — Call Layer (WebRTC via webconnect streaming) — Phase 3/4 REAL
   Signalling rides on LapeeetP2P directs (CALL_INITIATE / CALL_END).
   Media rides on connect.openStreaming / onStreaming (transport peerId).
   UI: LapeeetCall renders its own modal; app.js routes P2P events in.
   Fallback: any media failure -> toast "use P2P chat" (Messages tab).
   ============================================================= */

(function (global) {
    'use strict';

    const CALL_VERSION = '3.0.0-phase3';

    const LapeeetCall = {
        version: CALL_VERSION,
        localStream: null,
        remoteStream: null,
        peerIdentity: null,   // stable tenant identity (pubkey b64)
        peerTransport: null,  // ephemeral transport id for openStreaming
        rideId: null,
        state: 'idle', // idle | outgoing | ringing | in-call | ended | error
        _modalOpen: false,

        onIncoming: null,
        onStateChange: null,
        onEnded: null,

        init(callbacks) {
            callbacks = callbacks || {};
            this.onIncoming    = callbacks.onIncoming    || null;
            this.onStateChange = callbacks.onStateChange || null;
            this.onEnded       = callbacks.onEnded       || null;
            // Mesh may not exist yet (P2P inits after CALL in app boot);
            // app.js calls attachMesh() once the mesh is up.
            this.attachMesh();
            this._setState('idle');
        },

        /* ---------- MESH ATTACH (call AFTER LapeeetP2P.init — connect is null before) ---------- */

        attachMesh() {
            try {
                if (!(global.LapeeetP2P && LapeeetP2P.connect)) return false;
                LapeeetP2P.connect.onStreaming((stream, peer) => {
                    this.remoteStream = stream;
                    if (this.state === 'outgoing' || this.state === 'ringing') {
                        this._setState('in-call');
                        this._render();
                    } else {
                        this._attachRemote();
                    }
                    if (peer && peer.connectId) this.peerTransport = peer.connectId;
                });
                return true;
            } catch (e) {
                console.warn('[CALL] onStreaming wire failed:', e && e.message);
                return false;
            }
        },

        async startCall(peerIdentity, rideId, video, audio) {
            video = video !== false; audio = audio !== false;
            this._setState('outgoing');
            this.peerIdentity = peerIdentity;
            this.rideId = rideId || null;
            const peer = (global.LapeeetP2P && LapeeetP2P.peers.get(peerIdentity)) || {};
            this.peerTransport = peer.transportId || null;
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ video, audio });
                LapeeetP2P.sendDirect(peerIdentity, LapeeetP2P.MSG_TYPES.CALL_INITIATE,
                    { ride_id: this.rideId, video, audio });
                if (this.peerTransport) {
                    LapeeetP2P.connect.openStreaming(this.localStream, { connectId: this.peerTransport });
                }
                this._render();
            } catch (e) {
                console.warn('[CALL] getUserMedia failed:', e && e.message);
                this._setState('error');
                this._render();
                if (window.LapeeetUI) LapeeetUI.showToast('Call failed — use P2P chat instead', 'warning');
            }
        },

        /* ---------- INCOMING ---------- */

        _handleIncoming(envelopeBody, fromIdentity, transportId) {
            // Busy? auto-reject with CALL_END so the caller isn't left hanging.
            if (this.state !== 'idle' && this.state !== 'ended') {
                try {
                    LapeeetP2P.sendDirect(fromIdentity, LapeeetP2P.MSG_TYPES.CALL_END,
                        { ride_id: envelopeBody.ride_id, reason: 'busy' });
                } catch (e) {}
                return;
            }
            this._setState('ringing');
            this.peerIdentity = fromIdentity;
            this.peerTransport = transportId;
            this.rideId = envelopeBody.ride_id || null;
            this._pendingMedia = { video: envelopeBody.video !== false, audio: envelopeBody.audio !== false };
            this._render();
            if (this.onIncoming) {
                try {
                    this.onIncoming({
                        fromId: fromIdentity,
                        rideId: this.rideId,
                        accept: () => this._acceptIncoming(),
                        reject: () => this._rejectIncoming()
                    });
                } catch (e) {}
            }
        },

        async _acceptIncoming() {
            const m = this._pendingMedia || { video: true, audio: true };
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ video: m.video, audio: m.audio });
                if (this.peerTransport) {
                    LapeeetP2P.connect.openStreaming(this.localStream, { connectId: this.peerTransport });
                }
                this._setState('in-call');
                this._render();
            } catch (e) {
                this._setState('error');
                this._render();
            }
        },

        _rejectIncoming() {
            try {
                LapeeetP2P.sendDirect(this.peerIdentity, LapeeetP2P.MSG_TYPES.CALL_END,
                    { ride_id: this.rideId, reason: 'rejected' });
            } catch (e) {}
            this._cleanup();
            this._setState('ended');
            this._closeModal();
        },

        _handleRemoteEnd() {
            if (this.state === 'idle') return;
            this._cleanup();
            this._setState('ended');
            this._render();
            if (window.LapeeetUI) LapeeetUI.showToast('Call ended', 'info');
            setTimeout(() => this._closeModal(), 1200);
        },

        /* ---------- CONTROLS ---------- */

        toggleMic() {
            try {
                const t = this.localStream && this.localStream.getAudioTracks()[0];
                if (t) { t.enabled = !t.enabled; this._render(); }
            } catch (e) {}
        },
        toggleCamera() {
            try {
                const t = this.localStream && this.localStream.getVideoTracks()[0];
                if (t) { t.enabled = !t.enabled; this._render(); }
            } catch (e) {}
        },
        toggleSpeaker() {
            try {
                const el = document.getElementById('callRemoteAudio');
                if (el) el.muted = !el.muted;
            } catch (e) {}
        },

        endCall() {
            try {
                if (this.peerIdentity) {
                    LapeeetP2P.sendDirect(this.peerIdentity, LapeeetP2P.MSG_TYPES.CALL_END,
                        { ride_id: this.rideId, reason: 'hangup' });
                }
            } catch (e) {}
            const rideId = this.rideId;
            this._cleanup();
            this._setState('ended');
            this._closeModal();
            if (this.onEnded) { try { this.onEnded({ rideId }); } catch (e) {} }
        },

        _cleanup() {
            try {
                if (this.localStream) {
                    this.localStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
                }
            } catch (e) {}
            try {
                if (this.localStream && global.LapeeetP2P && LapeeetP2P.connect) {
                    LapeeetP2P.connect.closeStreaming(this.localStream, { connectId: this.peerTransport });
                }
            } catch (e) {}
            this.localStream = null;
            this.remoteStream = null;
            this.peerIdentity = null;
            this.peerTransport = null;
        },

        /* ---------- UI (self-rendered modal) ---------- */

        _render() {
            if (this.state === 'idle' || this.state === 'ended' && !this._modalOpen) return;
            this._attachRemote();
            let modal = document.getElementById('callModalLive');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'callModalLive';
                modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(6,12,24,0.72);padding:20px';
                document.body.appendChild(modal);
            }
            this._modalOpen = true;
            const title = { outgoing: 'Calling…', ringing: 'Incoming call', 'in-call': 'In call', error: 'Call failed', ended: 'Call ended' }[this.state] || this.state;
            modal.innerHTML =
                '<div style="width:100%;max-width:360px;background:#121d35;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden">' +
                '<div style="padding:14px 16px;color:#fff;font-weight:700">' + title + '</div>' +
                '<video id="callRemoteVideo" autoplay playsinline style="width:100%;max-height:240px;background:#000;display:block"></video>' +
                '<audio id="callRemoteAudio" autoplay style="display:none"></audio>' +
                '<video id="callLocalVideo" autoplay playsinline muted style="width:110px;height:82px;background:#000;border-radius:10px;margin:10px 0 0 16px"></video>' +
                '<div style="display:flex;gap:8px;padding:14px 16px;flex-wrap:wrap">' +
                (this.state === 'ringing'
                    ? '<button id="callAccept" class="btn btn-success" style="flex:1">Accept</button>' +
                      '<button id="callReject" class="btn btn-danger" style="flex:1">Reject</button>'
                    : '<button id="callMic" class="btn btn-outline-primary">Mic</button>' +
                      '<button id="callCam" class="btn btn-outline-primary">Cam</button>' +
                      '<button id="callHang" class="btn btn-danger" style="flex:1">End</button>') +
                '</div></div>';
            this._attachLocal();
            this._attachRemote();
            const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
            on('callAccept', () => this._acceptIncoming());
            on('callReject', () => this._rejectIncoming());
            on('callMic', () => this.toggleMic());
            on('callCam', () => this.toggleCamera());
            on('callHang', () => this.endCall());
        },

        _attachLocal() {
            try {
                const el = document.getElementById('callLocalVideo');
                if (el && this.localStream) el.srcObject = this.localStream;
            } catch (e) {}
        },
        _attachRemote() {
            try {
                const v = document.getElementById('callRemoteVideo');
                const a = document.getElementById('callRemoteAudio');
                if (v && this.remoteStream) v.srcObject = this.remoteStream;
                if (a && this.remoteStream) a.srcObject = this.remoteStream;
            } catch (e) {}
        },
        _closeModal() {
            const modal = document.getElementById('callModalLive');
            if (modal) modal.remove();
            this._modalOpen = false;
            if (this.state === 'ended' || this.state === 'error') this._setState('idle');
        },

        /* ---------- UTIL ---------- */

        _setState(s) {
            this.state = s;
            if (this.onStateChange) { try { this.onStateChange(s); } catch (e) {} }
        },

        getSupportedModes() {
            const ok = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
            return { audio: ok, video: ok, screen: ok };
        }
    };

    global.LapeeetCall = LapeeetCall;
})(window);
