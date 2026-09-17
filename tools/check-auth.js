// Phase 9 auth harness: pure helpers only (ceremonies need a real authenticator).
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('www/assets/js/auth-layer.js', 'utf8');
const sandbox = {
  console,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const A = sandbox.LapeeetAuth;

let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
};

// PH mobile normalization
ok('09xx normalizes', A.normalizePHMobile('09171234567') === '+639171234567');
ok('+63 passthrough', A.normalizePHMobile('+639171234567') === '+639171234567');
ok('63 prefix normalizes', A.normalizePHMobile('639171234567') === '+639171234567');
ok('spaces/dashes stripped', A.normalizePHMobile('09 17-123 4567') === '+639171234567');
ok('too short rejected', A.normalizePHMobile('0917') === null);
ok('too long rejected', A.normalizePHMobile('091712345678') === null);
ok('non-PH rejected', A.normalizePHMobile('+12025551234') === null);
ok('empty rejected', A.normalizePHMobile('') === null && A.normalizePHMobile(null) === null);
ok('isValid true/false', A.isValidPHMobile('09171234567') && !A.isValidPHMobile('abc'));

// base64url round-trip (bytes chosen to hit + / = in std base64)
const raw = new Uint8Array([0xfb, 0xff, 0x00, 0x01, 0xfe, 0x80]);
const enc = A._b64urlEncode(raw);
ok('b64url url-safe', !/[+/=]/.test(enc));
const dec = A._b64urlDecode(enc);
ok('b64url round-trip', dec.length === raw.length && dec.every((b, i) => b === raw[i]));

// CBOR: {"a":1,"b":h'0102'} = A2 6161 01 6162 420102
const cbor = new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x61, 0x62, 0x42, 0x01, 0x02]);
const obj = A._cborDecode(cbor);
ok('cbor map+int+bstr', obj.a === 1 && obj.b.length === 2 && obj.b[0] === 1 && obj.b[1] === 2);
ok('cbor rejects trunc', (() => { try { A._cborDecode(new Uint8Array([0xa2])); return false; } catch (e) { return true; } })());

// COSE EC2 (P-256 generator point) -> SPKI DER, 91 bytes, 0x04 point marker
const Gx = '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296';
const Gy = '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
const hx = Buffer.from(Gx, 'hex'), hy = Buffer.from(Gy, 'hex');
const cose = { 1: 2, 3: -7, '-1': 1, '-2': new Uint8Array(hx), '-3': new Uint8Array(hy) };
const spki = A._coseToSpki(cose);
ok('spki length 91', spki.length === 91);
ok('spki DER header', spki[0] === 0x30 && spki[1] === 0x59 && spki[25] === 0x00 && spki[26] === 0x04);
ok('spki embeds Gx/Gy', Buffer.from(spki.slice(27, 59)).toString('hex') === Gx &&
  Buffer.from(spki.slice(59, 91)).toString('hex') === Gy);
ok('cose rejects RSA', (() => { try { A._coseToSpki({ 1: 3, 3: -7, '-1': 1, '-2': hx, '-3': hy }); return false; } catch (e) { return true; } })());

// authData parser: flags without AT -> no credential; signCount big-endian
const ad1 = new Uint8Array(37);
ad1[32] = 0x01; ad1[33] = 0x00; ad1[34] = 0x00; ad1[35] = 0x01; ad1[36] = 0x2c;
const p1 = A._parseAuthData(ad1);
ok('authdata flags+count', p1.flags === 1 && p1.signCount === 300 && p1.credId === null);
// with AT: aaguid(16) + idLen(16) + credId + COSE map for the G key above
const coseBytes = Buffer.concat([
  Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), hx,
  Buffer.from([0x22, 0x58, 0x20]), hy,
]);
const ad2 = Buffer.concat([
  Buffer.alloc(32, 0xab), Buffer.from([0x45, 0x00, 0x00, 0x00, 0x07]),
  Buffer.alloc(16, 0x01), Buffer.from([0x00, 0x10]), Buffer.alloc(16, 0x02), coseBytes,
]);
const p2 = A._parseAuthData(new Uint8Array(ad2));
ok('authdata attested parse', p2.credId.length === 16 && p2.signCount === 7 &&
  p2.coseKey['-2'].length === 32 && p2.coseKey[3] === -7);
ok('authdata rejects short', (() => { try { A._parseAuthData(new Uint8Array(10)); return false; } catch (e) { return true; } })());

process.exit(fails ? 1 : 0);
