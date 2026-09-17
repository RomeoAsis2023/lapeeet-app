// Wiring audit: every $('#id') referenced in app.js binders must exist either in
// index.html (static shell) or in some ui-components.js template (rendered screens).
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'www');

const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(DIR, 'assets', 'js', 'ui-components.js'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'assets', 'js', 'app.js'), 'utf8');

const defined = new Set();
for (const m of html.matchAll(/id="([^"]+)"/g)) defined.add(m[1]);
for (const m of ui.matchAll(/id="([^"]+)"/g)) defined.add(m[1]);

const used = new Set();
for (const m of app.matchAll(/\$\(['"]#([\w-]+)['"]\)/g)) used.add(m[1]);

// IDs created dynamically at runtime (not in templates) — allowlisted with reason.
const DYNAMIC = new Set([
  'callModalLive', 'callRemoteVideo', 'callRemoteAudio', 'callLocalVideo',
  'callAccept', 'callReject', 'callMic', 'callCam', 'callHang', // call-layer modal
  'lp-toast-host',                                              // toast host
  'btnPrintReceipt', 'lockEraseCancel', 'lockEraseGo',          // modal-injected
  'dbStatus', 'gitStatus', 'keyStatus', 'mapStatus',            // home status rows
  'p2pStatus', 'peerId',                                        // rendered via ${r.id}
]);
let fails = 0;
for (const id of [...used].sort()) {
  if (defined.has(id) || DYNAMIC.has(id)) continue;
  console.log('FAIL - binder references missing #' + id);
  fails++;
}
console.log(fails === 0
  ? `ALL WIRING OK (${used.size} binder IDs resolve)`
  : `FAILURES: ${fails}`);

// Spot-check the auth/logout/recover/logout-critical IDs explicitly.
for (const id of ['btnUnlock', 'btnLockErase', 'btnLockRecover', 'btnLogout',
  'btnProfileLogout', 'btnRecoverImport', 'fileRecoverDb', 'btnRecoverFresh',
  'btnRecoverBack', 'recoverError', 'obPasskeyBtn', 'obPasskeySkip', 'obPasskeyState',
  'btnPasskeyAdd', 'btnPasskeyRemove', 'settingsPasskeyState', 'fileImportDb',
  'capacityGroup', 'capacityValue', 'btnRequestRide']) {
  const where = (html.includes(`id="${id}"`) ? 'index' : '') +
    (ui.includes(`id="${id}"`) ? ' ui' : '');
  console.log(((where ? 'PASS' : 'FAIL') + ' - #' + id + ' in:' + (where || ' NOWHERE')));
  if (!where) fails++;
}
process.exit(fails ? 1 : 0);
