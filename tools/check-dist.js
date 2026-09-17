const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync('dist/lapeeet.html', 'utf8');
const all = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
console.log('total script blocks:', all.length);
let bad = 0;
all.forEach((m, i) => {
  const s = m[1];
  if (!s.includes('inlined:') && !s.includes('LAPEEET_WASM_B64')) return;
  const n = s.match(/inlined: ([^*]+)/);
  try {
    new vm.Script(s.replace(/\/\* inlined:.*?\*\//, ' '));
  } catch (e) {
    bad++;
    console.log('FAIL idx', i, 'marker:', n ? n[1] : '(wasm-inject)', 'len:', s.length);
    console.log('  head:', JSON.stringify(s.slice(0, 100)));
    console.log('  err:', e.message);
  }
});
console.log(bad === 0 ? 'ALL SYNTAX OK' : 'FAILURES: ' + bad);
