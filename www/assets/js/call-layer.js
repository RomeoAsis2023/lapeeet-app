/* =============================================================
   Lapeeet — Call Layer (WebRTC Video/Audio via webconnect streaming)
   Phase 4 implementation.
   Responsible for:
     - getUserMedia requests + media stream management
     - webconnect.openStreaming() / onStreaming() wrapping
     - Call UI state: idle → ringing → in-call → ended
     - Camera / mic toggles, speaker, end-call
     - Fallback: P2P text chat message if media fails
   ============================================================= */

(function (global) {
    'use strict';

    const CALL_VERSION = '0.0.1';

    const LapeeetCall = {
        version: CALL_VERSION,
        localStream: null,
        remoteStream: null,
        peerConnectId: null,
        rideId: null,
        state: 'idle', // idle | outgoing | ringing | in-call | ended | error

        onIncoming: null,     // callback({ fromId, rideId, accept(), reject() })
        onStateChange: null,  // callback(newState)
        onEnded: null,

        /* ---------- LIFECYCLE ---------- */

        init(callbacks = {}) {
            console.debug('[CALL-LAYER] init()');
            this.onIncoming    = callbacks.onIncoming    || null;
            this.onStateChange = callbacks.onStateChange || null;
            this.onEnded       = callbacks.onEnded       || null;
            // TODO Phase 4:
            //   Wire LapeeetP2P.MSG_TYPES.CALL_INITIATE handler → this._handleIncoming()
            //   Wire webconnect.onStreaming → attach remote stream to video element
            this._setState('idle');
        },

        /* ---------- OUTGOING ---------- */

        /** Start video/audio call to matched peer. Displays call modal first. */
        async startCall(peerConnectId, rideId, video = true, audio = true) {
            this._setState('outgoing');
            this.peerConnectId = peerConnectId;
            this.rideId = rideId;
            try {
                // TODO Phase 4:
                //   1. this.localStream = await navigator.mediaDevices.getUserMedia({video, audio})
                //   2. LapeeetP2P.sendDirect(peer, CALL_INITIATE, {video,audio,rideId})
                //   3. LapeeetP2P.connect.openStreaming(this.localStream, { connectId: peer })
                //   4. When onStreaming fires from peer → state='in-call'
                this._setState('in-call');
            } catch (e) {
                console.error('[CALL-LAYER] getUserMedia failed', e);
                // Fallback: send P2P text "Call failed. Use chat."
                this._setState('error');
            }
        },

        /* ---------- INCOMING ---------- */

        _handleIncoming(envelope) {
            // TODO Phase 4:
            //   if this.onIncoming → invoke with accept()/reject()
            //   accept() → getUserMedia → openStreaming back → state='in-call'
        },

        /* ---------- CONTROLS ---------- */

        toggleMic() {
            // TODO: localStream.getAudioTracks()[0].enabled = !enabled
        },
        toggleCamera() {
            // TODO: video tracks
        },
        toggleSpeaker() {
            // TODO: flip remote audio element to speaker/earpiece
        },

        endCall() {
            // TODO Phase 4:
            //   close local tracks, stop webconnect streaming,
            //   send CALL_END message, state='ended'
            if (this.onEnded) this.onEnded({ rideId: this.rideId });
            this._setState('ended');
        },

        /* ---------- UTIL ---------- */

        _setState(s) {
            this.state = s;
            if (this.onStateChange) this.onStateChange(s);
        },

        getSupportedModes() {
            const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
            return {
                audio: hasGetUserMedia,
                video: hasGetUserMedia,
                screen: hasGetUserMedia
            };
        }
    };

    global.LapeeetCall = LapeeetCall;
})(window);
