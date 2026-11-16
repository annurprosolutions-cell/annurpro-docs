const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Jalankan config.js dengan window.location palsu dan pulang URL yang dihantar (atau null)
const run = (loc) => {
  let to = null;
  const win = { location: Object.assign({ pathname: '/', search: '', hash: '', replace: (u) => { to = u; } }, loc) };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../config.js', 'utf8'), { window: win });
  return to;
};

test('http:// pada domain sebenar dihantar ke https (elak origin_mismatch Google)', () => {
  assert.equal(run({ protocol: 'http:', hostname: 'docs.annurpro.com', host: 'docs.annurpro.com', pathname: '/admin/', search: '?a=1', hash: '#x' }), 'https://docs.annurpro.com/admin/?a=1#x');
  assert.equal(run({ protocol: 'https:', hostname: 'docs.annurpro.com', host: 'docs.annurpro.com' }), null, 'https tidak dialihkan');
});

test('localhost dan 127.0.0.1 tidak dialihkan (pembangunan, ujian)', () => {
  assert.equal(run({ protocol: 'http:', hostname: 'localhost', host: 'localhost:8787' }), null);
  assert.equal(run({ protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1:3000' }), null);
});

test('workers.dev dihantar ke domain utama', () => {
  assert.equal(run({ protocol: 'https:', hostname: 'annur-invoice.x.workers.dev', host: 'annur-invoice.x.workers.dev', pathname: '/privasi.html' }), 'https://docs.annurpro.com/privasi.html');
  assert.equal(run({ protocol: 'http:', hostname: 'annur-invoice.x.workers.dev', host: 'annur-invoice.x.workers.dev' }), 'https://docs.annurpro.com/', 'http workers.dev terus ke domain utama');
});
