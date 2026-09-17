/* =============================================================
   Lapeeet — Auth Layer (phone registration + WebAuthn passkeys)
   Phase 9. No backend: all ceremony crypto runs client-side.
   - PH mobile: normalize/validate only (no SMS OTP without a gateway).
   - Passkeys: navigator.credentials create/get, attestation "none",
     EdDSA-free ES256 (P-256) verification via WebCrypto.
   - RP ID = current hostname. Works on https origins (Pages,
     localhost). file:// has no host -> ceremonies fail there;
     callers must degrade gracefully via isSupported()/rpId().
   Requires: SecureContext + window.PublicKeyCredential.
   ============================================================= */

(function (global) {
    'use strict';

    const AUTH_VERSION = '9.0.0-phase9';

    /* ---------- base64url ---------- */
    function b64urlEncode(buf) {
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function b64urlDecode(str) {
        let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    /* ---------- minimal CBOR decoder (maps/arrays/ints/bstr/tstr only) ---------- */
    function cborDecode(bytes) {
        let pos = 0;
        function read(n) {
            if (pos + n > bytes.length) throw new Error('CBOR truncated');
            const sl = bytes.slice(pos, pos + n);
            pos += n;
            return sl;
        }
        function uint(ai) {
            if (ai < 24) return ai;
            if (ai === 24) return read(1)[0];
            if (ai === 25) { const b = read(2); return (b[0] << 8) | b[1]; }
            if (ai === 26) {
                const b = read(4);
                return (b[0] * 16777216) + ((b[1] << 16) | (b[2] << 8) | b[3]);
            }
            throw new Error('CBOR uint too large');
        }
        function item() {
            const ib = read(1)[0];
            const major = ib >> 5, ai = ib & 31;
            if (major === 0) return uint(ai);
            if (major === 1) return -1 - uint(ai);
            if (major === 2 || major === 3) {
                const len = uint(ai);
                const raw = read(len);
                if (major === 3) {
                    let s = '';
                    for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
                    return decodeURIComponent(escape(s));
                }
                return raw;
            }
            if (major === 4) {
                const len = uint(ai), arr = [];
                for (let i = 0; i < len; i++) arr.push(item());
                return arr;
            }
            if (major === 5) {
                const len = uint(ai), obj = {};
                for (let i = 0; i < len; i++) {
                    const k = item();
                    obj[typeof k === 'string' ? k : JSON.stringify(k)] = item();
                }
                return obj;
            }
            throw new Error('CBOR unsupported major type ' + major);
        }
        const val = item();
        return val;
    }

    /* SPKI DER prefix for P-256 uncompressed EC keys (0x2A...034200) */
    const P256_SPKI_PREFIX = new Uint8Array([
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
        0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00
    ]);

    function coseToSpki(coseMap) {
        // Expect COSE EC2 / ES256 / P-256: {1:2, 3:-7, -1:1, -2:x, -3:y}
        const kty = coseMap['1'] !== undefined ? coseMap['1'] : coseMap[1];
        const alg = coseMap['3'] !== undefined ? coseMap['3'] : coseMap[3];
        const crv = coseMap['-1'] !== undefined ? coseMap['-1'] : coseMap[-1];
        const x = coseMap['-2'] !== undefined ? coseMap['-2'] : coseMap[-2];
        const y = coseMap['-3'] !== undefined ? coseMap['-3'] : coseMap[-3];
        if (kty !== 2 || alg !== -7 || crv !== 1) throw new Error('Only COSE ES256/P-256 supported');
        if (!x || x.length !== 32 || !y || y.length !== 32) throw new Error('Bad P-256 coordinates');
        const point = new Uint8Array(65);
        point[0] = 0x04;
        point.set(x, 1);
        point.set(y, 33);
        const spki = new Uint8Array(P256_SPKI_PREFIX.length + 65);
        spki.set(P256_SPKI_PREFIX, 0);
        spki.set(point, P256_SPKI_PREFIX.length);
        return spki;
    }

    function parseAuthData(authData) {
        if (authData.length < 37) throw new Error('authData too short');
        const rpIdHash = authData.slice(0, 32);
        const flags = authData[32];
        const signCount = (authData[33] << 24) | (authData[34] << 16) | (authData[35] << 8) | authData[36];
        let credId = null, coseKey = null, rest = 37;
        if (flags & 0x40) { // AT: attested credential data present
            if (authData.length < rest + 18) throw new Error('attested data truncated');
            rest += 16; // aaguid
            const idLen = (authData[rest] << 8) | authData[rest + 1];
            rest += 2;
            credId = authData.slice(rest, rest + idLen);
            rest += idLen;
            const coseBytes = authData.slice(rest);
            coseKey = cborDecode(coseBytes);
        }
        return { rpIdHash, flags, signCount, credId, coseKey };
    }

    async function sha256(data) {
        return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    }

    const LapeeetAuth = {
        version: AUTH_VERSION,
        _pendingChallenge: null, // b64url of last issued challenge (same-session ceremony binding)

        /* ---------- environment ---------- */

        rpId() {
            try {
                const h = window.location.hostname;
                return h || null; // null on file:// (no host) -> ceremonies will fail
            } catch (e) { return null; }
        },

        isSupported() {
            try {
                return !!(window.PublicKeyCredential && window.isSecureContext && crypto.subtle);
            } catch (e) { return false; }
        },

        supportReason() {
            if (!this.isSupported()) {
                if (!window.isSecureContext) return 'Passkeys need a secure https page (open the GitHub Pages link, not the local file).';
                return 'This browser does not support passkeys (WebAuthn).';
            }
            if (!this.rpId()) return 'Passkeys need a hosted page with a hostname (open the GitHub Pages link, not the local file).';
            return 'ok';
        },

        /* ---------- PH mobile numbers (format validation only — no SMS gateway) ---------- */

        /** Normalize 09xx / 639xx / +639xx -> +63XXXXXXXXXX, or null. */
        normalizePHMobile(raw) {
            if (raw === undefined || raw === null) return null;
            let s = String(raw).replace(/[\s\-().]/g, '');
            if (/^0\d{10}$/.test(s)) s = '+63' + s.slice(1);
            else if (/^63\d{10}$/.test(s)) s = '+' + s;
            if (/^\+63\d{10}$/.test(s)) return s;
            return null;
        },

        isValidPHMobile(raw) {
            return this.normalizePHMobile(raw) !== null;
        },

        /* ---------- passkey enrollment ---------- */

        /**
         * Create a passkey for (name, phone). Returns {credIdB64, pubKeySpkiB64, signCount}
         * after client-side verification of the attestation ceremony.
         */
        async registerPasskey(opts) {
            opts = opts || {};
            const reason = this.supportReason();
            if (reason !== 'ok') throw new Error(reason);
            const rpId = this.rpId();
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            this._pendingChallenge = b64urlEncode(challenge);
            const userId = new Uint8Array(16);
            crypto.getRandomValues(userId);

            const cred = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: 'Lapeeet', id: rpId },
                    user: {
                        id: userId,
                        name: opts.phone || 'lapeeet-user',
                        displayName: opts.name || 'Lapeeet User'
                    },
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                    authenticatorSelection: {
                        residentKey: 'required',
                        requireResidentKey: true,
                        userVerification: 'preferred'
                    },
                    attestation: 'none',
                    timeout: 60000
                }
            });
            if (!cred) throw new Error('No credential created');
            return this._verifyAttestation(cred, rpId);
        },

        async _verifyAttestation(cred, rpId) {
            const resp = cred.response;
            if (!resp.attestationObject) throw new Error('Missing attestationObject');
            const att = cborDecode(new Uint8Array(resp.attestationObject));
            if (!att || att.fmt !== 'none') throw new Error('Only none-attestation supported, got ' + (att && att.fmt));
            // Challenge binding: clientDataJSON carries our challenge.
            const clientData = JSON.parse(new TextDecoder().decode(resp.clientDataJSON));
            if (clientData.challenge !== this._pendingChallenge) throw new Error('Challenge mismatch');
            const origin = new URL(clientData.origin);
            if (origin.hostname !== rpId) throw new Error('Origin mismatch');
            if (clientData.type !== 'webauthn.create') throw new Error('Wrong ceremony type');
            const authData = new Uint8Array(resp.authData || att.authData);
            const parsed = parseAuthData(authData);
            if (!(parsed.flags & 0x01)) throw new Error('User not present');
            if (!parsed.credId || !parsed.coseKey) throw new Error('No attested credential in response');
            const expectedRp = await sha256(new TextEncoder().encode(rpId));
            for (let i = 0; i < 32; i++) {
                if (expectedRp[i] !== parsed.rpIdHash[i]) throw new Error('RP ID hash mismatch');
            }
            const spki = coseToSpki(parsed.coseKey);
            this._pendingChallenge = null;
            return {
                credIdB64: b64urlEncode(parsed.credId),
                pubKeySpkiB64: b64urlEncode(spki),
                signCount: parsed.signCount
            };
        },

        /* ---------- passkey unlock (assertion) ---------- */

        /**
         * Verify a passkey assertion against an enrolled record
         * {credIdB64, pubKeySpkiB64, signCount}. Returns updated record.
         */
        async unlockWithPasskey(enrolled) {
            const reason = this.supportReason();
            if (reason !== 'ok') throw new Error(reason);
            if (!enrolled || !enrolled.credIdB64 || !enrolled.pubKeySpkiB64) {
                throw new Error('No passkey enrolled on this device');
            }
            const rpId = this.rpId();
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            this._pendingChallenge = b64urlEncode(challenge);

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    rpId,
                    allowCredentials: [{ type: 'public-key', id: b64urlDecode(enrolled.credIdB64) }],
                    userVerification: 'preferred',
                    timeout: 60000
                }
            });
            if (!assertion) throw new Error('No assertion returned');
            return this._verifyAssertion(assertion, enrolled, rpId);
        },

        async _verifyAssertion(assertion, enrolled, rpId) {
            const resp = assertion.response;
            const clientData = JSON.parse(new TextDecoder().decode(resp.clientDataJSON));
            if (clientData.challenge !== this._pendingChallenge) throw new Error('Challenge mismatch');
            if (clientData.type !== 'webauthn.get') throw new Error('Wrong ceremony type');
            const authData = new Uint8Array(resp.authenticatorData);
            const parsed = parseAuthData(authData);
            if (!(parsed.flags & 0x01)) throw new Error('User not present');
            const expectedRp = await sha256(new TextEncoder().encode(rpId));
            for (let i = 0; i < 32; i++) {
                if (expectedRp[i] !== parsed.rpIdHash[i]) throw new Error('RP ID hash mismatch');
            }
            const storedCount = Number(enrolled.signCount) || 0;
            if (storedCount > 0 && parsed.signCount <= storedCount) {
                throw new Error('Possible cloned authenticator (signCount did not advance)');
            }
            const clientHash = await sha256(resp.clientDataJSON);
            const signed = new Uint8Array(authData.length + clientHash.length);
            signed.set(authData, 0);
            signed.set(clientHash, authData.length);
            const key = await crypto.subtle.importKey(
                'spki', b64urlDecode(enrolled.pubKeySpkiB64),
                { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
            );
            const ok = await crypto.subtle.verify(
                { name: 'ECDSA', hash: 'SHA-256' }, key, resp.signature, signed
            );
            if (!ok) throw new Error('Assertion signature invalid');
            this._pendingChallenge = null;
            enrolled.signCount = parsed.signCount;
            return enrolled;
        },

        /* ---------- test-exposed pure helpers ---------- */
        _b64urlEncode: b64urlEncode,
        _b64urlDecode: b64urlDecode,
        _cborDecode: cborDecode,
        _coseToSpki: coseToSpki,
        _parseAuthData: parseAuthData
    };

    global.LapeeetAuth = LapeeetAuth;
})(window);
