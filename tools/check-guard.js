// Ceremony-guard harness: stub authenticator that hangs, proving concurrent
// register/unlock calls are rejected (the "already pending" browser error) and
// the guard clears after each ceremony settles.
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');

const src = fs.readFileSync('www/assets/js/auth-layer.js', 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let createCalls = 0;
let getCalls = 0;
let createGate = deferred();
let getGate = deferred();

const win = {
  PublicKeyCredential: function () {},
  isSecureContext: true,
  location: { hostname: 'test.local' },
};
const sandbox = {
  window: win,
  navigator: {
    credentials: {
      create: () => { createCalls++; return createGate.promise; },
      get: () => { getCalls++; return getGate.promise; },
    },
  },
  crypto: nodeCrypto.webcrypto,
  TextEncoder, TextDecoder, URL,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  console,
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const A = win.LapeeetAuth; // IIFE binds to `window`, which is the mock here

let fails = 0;
const ok = (name, cond) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) fails++;
};

(async () => {
  // 1. First create() hangs on the stub prompt...
  const p1 = A.registerPasskey({ name: 'T', phone: '+639171234567' });
  p1.catch(() => {}); // settle later; silence unhandled rejection warnings
  await new Promise((r) => setTimeout(r, 20));
  // 2. ...so a second create() must be rejected by the guard, not the browser.
  let err1 = null;
  try { await A.registerPasskey({ name: 'T', phone: '+639171234567' }); }
  catch (e) { err1 = e; }
  ok('concurrent create rejected by guard', !!err1 && /already open/.test(err1.message));
  ok('browser saw exactly 1 create call', createCalls === 1);

  // 3. Same for unlock (with a dummy-but-shaped enrollment).
  const enrolled = { credIdB64: 'AAEC', pubKeySpkiB64: 'AAEC', signCount: 0 };
  const u1 = A.unlockWithPasskey(enrolled);
  u1.catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  let err2 = null;
  try { await A.unlockWithPasskey(enrolled); }
  catch (e) { err2 = e; }
  // create-guard is still held by p1, so unlock is also rejected — correct.
  ok('cross-kind overlap rejected too', !!err2 && /already open/.test(err2.message));

  // 4. Settle the first ceremony (garbage cred -> verification throws), guard must clear.
  // (u1 was guard-rejected before touching getGate, so nothing consumes it — just drop it.)
  createGate.resolve({ response: {} });
  await p1.then(() => ok('first ceremony settled (unexpected pass)', false),
    () => ok('first ceremony settled with error', true));
  // Fresh gates for the recovery check.
  createGate = deferred();
  getGate = deferred();
  const p2 = A.registerPasskey({ name: 'T', phone: '+639171234567' });
  p2.catch(() => {});
  await new Promise((r) => setTimeout(r, 20));
  ok('guard clears after settle (browser sees 2nd create)', createCalls === 2);
  createGate.resolve({ response: {} });
  await p2.then(() => {}, () => {});

  // 5. friendlyError maps the exact browser message the user reported.
  const msg = A.friendlyError({ name: 'InvalidStateError', message: 'A request is already pending.' }, 'unlock');
  ok('pending message is actionable', /already open/.test(msg));

  // 6. Discoverable fallback: first get() (pinned cred) throws NotAllowedError,
  // second get() (empty allow list) runs and its result goes to verification.
  let fbCalls = 0;
  const fbNav = {
    credentials: {
      create: () => Promise.reject(new Error('unused')),
      get: (opts) => {
        fbCalls++;
        const allow = (opts && opts.publicKey && opts.publicKey.allowCredentials) || [];
        if (allow.length) {
          const e = new Error('no matching credential');
          e.name = 'NotAllowedError';
          return Promise.reject(e);
        }
        return Promise.resolve({ id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', response: {} });
      },
    },
  };
  sandbox.navigator = fbNav;
  let fbErr = null;
  try {
    await A.unlockWithPasskey({ credIdB64: 'AAEC', pubKeySpkiB64: 'AAEC', signCount: 0 });
  } catch (e) { fbErr = e; }
  ok('fallback runs second ceremony', fbCalls === 2);
  ok('fallback mismatch rejected (not guard error)',
    !!fbErr && /not enrolled/.test(fbErr.message));

  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL:', e); process.exit(1); });
