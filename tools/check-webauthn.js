// WebAuthn ceremony simulation: synthetic attestation + assertion through the
// REAL LapeeetAuth._verifyAttestation / _verifyAssertion (no authenticator needed).
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');
const subtle = nodeCrypto.webcrypto.subtle;

const src = fs.readFileSync('www/assets/js/auth-layer.js', 'utf8');
const sandbox = {
  console,
  crypto: nodeCrypto.webcrypto,
  TextEncoder, TextDecoder, URL,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const A = sandbox.LapeeetAuth;

/* ---------- tiny CBOR encoder (test-side only) ---------- */
function cborUint(n) {
  if (n < 24) return Buffer.from([n]);
  if (n < 256) return Buffer.from([24, n]);
  const b = Buffer.alloc(5); b[0] = 26; b.writeUInt32BE(n, 1); return b;
}
function cborTstr(s) {
  const p = Buffer.from(s, 'utf8');
  return Buffer.concat([Buffer.from([0x60 + p.length]), p]);
}
function cborBstr(p) {
  return Buffer.concat([cborLen(0x40, p.length), p]);
}
function cborLen(major, n) {
  if (n < 24) return Buffer.from([major + n]);
  if (n < 256) return Buffer.from([major + 24, n]);
  const b = Buffer.alloc(5); b[0] = major + 26; b.writeUInt32BE(n, 1); return b;
}
function cborArr(items) {
  return Buffer.concat([cborLen(0x80, items.length), ...items]);
}
function cborMap(pairs) {
  return Buffer.concat([cborLen(0xa0, pairs.length),
    ...pairs.flatMap(([k, v]) => [k, v])]);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
};

(async () => {
  // Keypair stand-in for the authenticator (P-256).
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', kp.privateKey);
  const x = Buffer.from(jwk.x, 'base64url'), y = Buffer.from(jwk.y, 'base64url');
  const rpId = 'test.local';
  const rpHash = nodeCrypto.createHash('sha256').update(rpId).digest();

  // ---- REGISTRATION ceremony ----
  const challenge = nodeCrypto.randomBytes(32);
  A._pendingChallenge = b64url(challenge);
  const credId = nodeCrypto.randomBytes(32);
  const coseKey = cborMap([
    [cborUint(1), cborUint(2)],                       // kty: EC2
    [cborUint(3), Buffer.from([0x26])],               // alg: -7 (0x26 = -7)
    [Buffer.from([0x20]), cborUint(1)],               // crv: 1 (P-256), key -1
    [Buffer.from([0x21]), cborBstr(x)],               // x, key -2
    [Buffer.from([0x22]), cborBstr(y)],               // y, key -3
  ]);
  const authData = Buffer.concat([
    rpHash,
    Buffer.from([0x45, 0x00, 0x00, 0x00, 0x00]),   // flags UP+UV+AT, count 0 (BE32)
    Buffer.alloc(16, 0xaa),                           // aaguid
    Buffer.from([0x00, 0x20]), credId,                // credId len + bytes
    coseKey,
  ]);
  const attObj = cborMap([
    [cborTstr('fmt'), cborTstr('none')],
    [cborTstr('authData'), cborBstr(authData)],
    [cborTstr('attStmt'), cborMap([])],
  ]);
  const clientData = Buffer.from(JSON.stringify({
    type: 'webauthn.create', challenge: b64url(challenge), origin: 'https://' + rpId,
  }));
  const fakeCred = { response: { attestationObject: attObj, clientDataJSON: clientData } };

  let enrolled;
  try {
    enrolled = await A._verifyAttestation(fakeCred, rpId);
    ok('registration verifies', !!(enrolled && enrolled.credIdB64 && enrolled.pubKeySpkiB64));
  } catch (e) { ok('registration verifies (' + e.message + ')', false); }
  if (!enrolled) { console.log('FATAL - aborting'); process.exit(1); }
  ok('credId round-trips', Buffer.from(enrolled.credIdB64, 'base64url').equals(credId));

  // The derived SPKI must verify signatures from the authenticator key.
  const spkiDer = Buffer.from(enrolled.pubKeySpkiB64, 'base64url');
  const pubKey = await subtle.importKey('spki', spkiDer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const probe = Buffer.from('hello-lapeeet');
  const probeSig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, probe);
  ok('spki verifies authenticator sigs', await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, probeSig, probe));

  // Negative: wrong challenge must throw.
  A._pendingChallenge = b64url(nodeCrypto.randomBytes(32));
  let threw = false;
  try { await A._verifyAttestation(fakeCred, rpId); } catch (e) { threw = /Challenge/.test(e.message); }
  ok('wrong challenge rejected', threw);

  // ---- AUTHENTICATION ceremony ----
  const achal = nodeCrypto.randomBytes(32);
  A._pendingChallenge = b64url(achal);
  const aAuthData = Buffer.concat([rpHash, Buffer.from([0x05, 0x00, 0x00, 0x00, 0x01])]); // UP, count 1 (BE32)
  const aClient = Buffer.from(JSON.stringify({
    type: 'webauthn.get', challenge: b64url(achal), origin: 'https://' + rpId,
  }));
  const cHash = nodeCrypto.createHash('sha256').update(aClient).digest();
  const asig = Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
    kp.privateKey, Buffer.concat([aAuthData, cHash])));
  const fakeAssertion = {
    response: { authenticatorData: aAuthData, clientDataJSON: aClient, signature: asig },
  };
  try {
    const updated = await A._verifyAssertion(fakeAssertion, enrolled, rpId);
    ok('assertion verifies + count advances', updated.signCount === 1);
  } catch (e) { ok('assertion verifies (' + e.message + ')', false); }

  // Negative: tampered signature must throw.
  const bad = Buffer.from(asig); bad[10] ^= 0xff;
  A._pendingChallenge = b64url(achal);
  let threw2 = false;
  try {
    await A._verifyAssertion({ response: { authenticatorData: aAuthData, clientDataJSON: aClient, signature: bad } }, enrolled, rpId);
  } catch (e) { threw2 = /signature|count/i.test(e.message); }
  ok('tampered signature rejected', threw2);

  // Negative: replayed (non-advancing) counter must throw.
  A._pendingChallenge = b64url(achal);
  let threw3 = false;
  try {
    await A._verifyAssertion(fakeAssertion, { ...enrolled, signCount: 5 }, rpId);
  } catch (e) { threw3 = /clone/i.test(e.message); }
  ok('replayed counter rejected', threw3);

  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL:', e); process.exit(1); });
