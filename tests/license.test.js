const test = require('node:test');
const assert = require('node:assert/strict');
require('../js/core.js');
const AI = require('../js/license.js');

const NOW = Date.parse('2026-11-03T02:00:00Z');
const live = (b, status) => ({ status: status || 200, body: Object.assign({ ok: true, email: 'a@x.com', creditsPerDoc: 5 }, b) });

test('jawapan live: percubaan boleh terbit dan cache dibina', () => {
  const d = AI.licenseDecision({ result: live({ mode: 'kredit', entitled: true, trial: true, credits: 50, docsLeft: 10 }), now: NOW });
  assert.equal(d.state, 'live'); assert.equal(d.canIssue, true);
  assert.equal(d.cache.checkedAt, NOW); assert.equal(d.cache.email, 'a@x.com');
  assert.equal(AI.licenseNotice(d), null); // baki jelas pada kad lesen
  const low = AI.licenseDecision({ result: live({ mode: 'kredit', entitled: true, trial: true, credits: 15, docsLeft: 3 }), now: NOW });
  assert.equal(AI.licenseNotice(low).tone, 'warn'); assert.match(AI.licenseNotice(low).text, /3 dokumen lagi/);
});

test('token tidak sah → perlu log masuk', () => {
  const d = AI.licenseDecision({ result: { status: 401, body: { ok: false, reason: 'token-tidak-sah' } }, now: NOW });
  assert.equal(d.needsLogin, true); assert.equal(d.canIssue, false);
});

test('pelayan tak dapat dihubungi: guna cache 7 hari untuk emel sama sahaja', () => {
  const cache = { email: 'a@x.com', checkedAt: NOW - 6 * 864e5, mode: 'langganan', entitled: true, expires: '2026-12-01' };
  let d = AI.licenseDecision({ error: new Error('x'), cache, email: 'a@x.com', now: NOW });
  assert.equal(d.state, 'cached'); assert.equal(d.canIssue, true);
  d = AI.licenseDecision({ error: new Error('x'), cache, email: 'b@x.com', now: NOW });
  assert.equal(d.state, 'unreachable'); assert.equal(d.canIssue, false);
  d = AI.licenseDecision({ error: new Error('x'), cache: Object.assign({}, cache, { checkedAt: NOW - 8 * 864e5 }), email: 'a@x.com', now: NOW });
  assert.equal(d.state, 'unreachable');
});

test('notis langganan: amaran 14 hari, mendesak 3 hari, tiada notis bila jauh', () => {
  const mk = (daysLeft) => AI.licenseNotice(AI.licenseDecision({ result: live({ mode: 'langganan', entitled: true, daysLeft, expires: '2026-11-20', plan: 'bulanan' }), now: NOW }));
  assert.equal(mk(30), null);
  assert.equal(mk(10).tone, 'warn');
  assert.equal(mk(2).tone, 'urgent');
  assert.match(mk(10).text, /20\/11\/2026/);
});

test('notis ihsan, habis, kredit rendah', () => {
  const n = (b) => AI.licenseNotice(AI.licenseDecision({ result: live(b), now: NOW }));
  assert.equal(n({ mode: 'ihsan', entitled: true, graceLeft: 4 }).tone, 'urgent');
  assert.equal(n({ mode: 'habis', entitled: false, credits: 3, reason: 'tiada-kredit' }).tone, 'critical');
  assert.match(n({ mode: 'habis', entitled: false, reason: 'tamat' }).text, /Langganan telah tamat/);
  assert.equal(n({ mode: 'kredit', entitled: true, trial: false, credits: 8, docsLeft: 1 }).tone, 'warn');
  assert.equal(n({ mode: 'kredit', entitled: true, trial: false, credits: 80, docsLeft: 16 }), null);
});

test('fetchCheck: hantar Bearer dan pulang badan; lontar bila bukan JSON', async () => {
  let seen;
  const ok = await AI.fetchCheck('https://w.test/', 'TOK', async (url, opt) => { seen = { url, opt }; return new Response('{"ok":true,"mode":"kredit"}', { status: 200 }); });
  assert.equal(seen.url, 'https://w.test/api/check');
  assert.equal(seen.opt.headers.Authorization, 'Bearer TOK');
  assert.equal(ok.body.mode, 'kredit');
  await assert.rejects(AI.fetchCheck('', 'TOK', async () => new Response('<html>', { status: 502 })), /HTTP 502/);
});

test('fmtDate DD/MM/YYYY', () => {
  assert.equal(AI.fmtDate('2026-01-05'), '05/01/2026');
});
