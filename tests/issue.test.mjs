import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, periodOf } from '../worker/index.mjs';
import { createD1 } from './helpers/d1.mjs';

const CLIENT = 'test-client.apps.googleusercontent.com';
const NOW = Date.parse('2026-11-03T02:00:00Z');
const fakeFetch = async (url) => {
  const tok = decodeURIComponent(String(url).split('access_token=')[1] || '');
  if (!tok.startsWith('tok-')) return new Response('{}', { status: 400 });
  return new Response(JSON.stringify({ aud: CLIENT, email: tok.slice(4), email_verified: 'true' }), { status: 200 });
};
const setup = (vars) => {
  const env = Object.assign({ GOOGLE_CLIENT_ID: CLIENT, DB: createD1(), BUY_URL_SUB: 'https://bcl.test/sub' }, vars || {});
  const call = (method, path, token, body, now) => handle(new Request('https://w.test' + path, {
    method, headers: token ? { authorization: 'Bearer ' + token } : {}, body: body ? JSON.stringify(body) : undefined
  }), env, { fetch: fakeFetch, now: () => now || NOW }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  return { env, call };
};
const ISS = (docId, extra) => Object.assign({ docId, type: 'invoice', prefix: 'APS', date: '2026-11-03' }, extra || {});
const T = 'tok-pemilik@contoh.my';

test('periodOf', () => { assert.equal(periodOf('2026-11-03'), '1126'); assert.equal(periodOf('2027-01-31'), '0127'); });

test('terbit pertama: nombor PREFIX/MMYY-001, caj 5 kredit, ledger', async () => {
  const { env, call } = setup();
  const r = await call('POST', '/api/issue', T, ISS('doc-aaaa-0001'));
  assert.equal(r.status, 200); assert.equal(r.number, 'APS/1126-001'); assert.equal(r.charged, 5); assert.equal(r.credits, 45);
  assert.equal(r.repeat, false); assert.equal(r.editableUntil, '2026-11-04T02:00:00.000Z');
  const l = await env.DB.prepare("SELECT delta, balance_after, ref FROM credit_ledger WHERE reason = 'issue'").first();
  assert.deepEqual(l, { delta: -5, balance_after: 45, ref: 'doc-aaaa-0001' });
});

test('ulangan doc_id sama: nombor sama, tiada caj tambahan', async () => {
  const { call } = setup();
  const a = await call('POST', '/api/issue', T, ISS('doc-aaaa-0001'));
  const b = await call('POST', '/api/issue', T, ISS('doc-aaaa-0001'));
  assert.equal(b.number, a.number); assert.equal(b.repeat, true); assert.equal(b.credits, 45);
});

test('berturutan ikut jenis, prefix dan bulan', async () => {
  const { call } = setup();
  const n = async (id, x) => (await call('POST', '/api/issue', T, ISS(id, x))).number;
  assert.equal(await n('doc-0000-0001'), 'APS/1126-001');
  assert.equal(await n('doc-0000-0002'), 'APS/1126-002');
  assert.equal(await n('doc-0000-0003', { type: 'quotation', prefix: 'APS-Q' }), 'APS-Q/1126-001');
  assert.equal(await n('doc-0000-0004', { date: '2026-12-01' }), 'APS/1226-001');
  assert.equal(await n('doc-0000-0005', { prefix: 'inv' }), 'INV/1126-001');
  assert.equal(await n('doc-0000-0006'), 'APS/1126-003');
});

test('baki tidak cukup: dokumen ke-11 ditolak, tiada rekod baharu', async () => {
  const { env, call } = setup();
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/issue', T, ISS('doc-bbbb-' + String(i).padStart(4, '0')))).status, 200);
  const r = await call('POST', '/api/issue', T, ISS('doc-bbbb-0010'));
  assert.equal(r.status, 403); assert.equal(r.reason, 'tiada-kredit'); assert.equal(r.credits, 0); assert.equal(r.buyUrls.sub, 'https://bcl.test/sub');
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM doc_issues').first('n'), 10);
  assert.equal(await env.DB.prepare('SELECT last_seq FROM counters').first('last_seq'), 10);
});

test('baki 4 kredit ditolak; langganan aktif tidak dicaj; ihsan tidak dicaj', async () => {
  const { env, call } = setup();
  await call('POST', '/api/check', T);
  await env.DB.prepare("UPDATE tenants SET credits = 4").run();
  assert.equal((await call('POST', '/api/issue', T, ISS('doc-cccc-0001'))).status, 403);
  await env.DB.prepare("INSERT INTO subscriptions (email, plan, expires, day, updated_at) VALUES ('pemilik@contoh.my', 'bulanan', '2026-11-30', 30, 'x')").run();
  const r = await call('POST', '/api/issue', T, ISS('doc-cccc-0002'));
  assert.equal(r.status, 200); assert.equal(r.charged, 0); assert.equal(r.credits, 4); assert.equal(r.mode, 'langganan');
  await env.DB.prepare("UPDATE subscriptions SET expires = '2026-10-30'").run();
  const g = await call('POST', '/api/issue', T, ISS('doc-cccc-0003'));
  assert.equal(g.status, 200); assert.equal(g.charged, 0); assert.equal(g.mode, 'ihsan');
  await env.DB.prepare("UPDATE subscriptions SET expires = '2026-10-01'").run();
  const x = await call('POST', '/api/issue', T, ISS('doc-cccc-0004'));
  assert.equal(x.status, 403); assert.equal(x.reason, 'tamat');
});

test('20 terbit serentak: nombor unik dan berturutan, caj tepat', async () => {
  const { env, call } = setup({ TRIAL_CREDITS: '200' });
  await call('POST', '/api/check', T);
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => call('POST', '/api/issue', T, ISS('doc-conc-' + String(i).padStart(4, '0')))));
  rs.forEach((r) => assert.equal(r.status, 200));
  const nums = rs.map((r) => r.number).sort();
  assert.deepEqual(nums, Array.from({ length: 20 }, (_, i) => 'APS/1126-' + String(i + 1).padStart(3, '0')));
  assert.equal(await env.DB.prepare('SELECT credits FROM tenants').first('credits'), 100);
  assert.equal(await env.DB.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason = 'issue'").first('n'), 20);
});

test('serentak dengan baki terhad: tiada lebihan caj atau nombor tanpa caj', async () => {
  const { env, call } = setup({ TRIAL_CREDITS: '12' });   // cukup untuk 2 dokumen
  await call('POST', '/api/check', T);
  const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/api/issue', T, ISS('doc-lim0-' + i + 'xxx'))));
  assert.equal(rs.filter((r) => r.status === 200).length, 2);
  assert.equal(rs.filter((r) => r.status === 403).length, 3);
  assert.equal(await env.DB.prepare('SELECT credits FROM tenants').first('credits'), 2);
  assert.equal(await env.DB.prepare('SELECT COUNT(*) AS n FROM doc_issues').first('n'), 2);
});

test('validasi input', async () => {
  const { call } = setup();
  const bads = [ISS('x'), ISS('doc-dddd-0001', { type: 'po' }), ISS('doc-dddd-0001', { prefix: 'AZN/1' }), ISS('doc-dddd-0001', { prefix: '' }),
    ISS('doc-dddd-0001', { date: '2026-13-01' }), ISS('doc-dddd-0001', { date: '2026-02-30' }), ISS('doc-dddd-0001', { date: '2030-01-01' }), ISS("doc-'; DROP TABLE tenants;--")];
  for (const b of bads) { const r = await call('POST', '/api/issue', T, b); assert.equal(r.status, 400, JSON.stringify(b)); }
  assert.equal((await call('POST', '/api/issue', undefined, ISS('doc-dddd-0001'))).status, 401);
});

test('doc_id akaun lain ditolak (409)', async () => {
  const { call } = setup();
  await call('POST', '/api/issue', T, ISS('doc-eeee-0001'));
  const r = await call('POST', '/api/issue', 'tok-orang-lain@x.my', ISS('doc-eeee-0001'));
  assert.equal(r.status, 409);
});

test('void, senarai terbitan dan ledger (hanya milik sendiri)', async () => {
  const { call } = setup();
  await call('POST', '/api/issue', T, ISS('doc-ffff-0001'));
  await call('POST', '/api/issue', T, ISS('doc-ffff-0002'), NOW + 60000);
  await call('POST', '/api/issue', 'tok-lain@x.my', ISS('doc-ffff-0003'));
  const v = await call('POST', '/api/void', T, { docId: 'doc-ffff-0001' });
  assert.equal(v.status, 200); assert.equal(v.status === 200 && v.number, 'APS/1126-001');
  assert.equal((await call('POST', '/api/void', T, { docId: 'doc-ffff-0003' })).status, 404, 'tidak boleh void milik orang lain');
  const l = await call('GET', '/api/issues?since=2026-01-01T00:00:00.000Z', T);
  assert.deepEqual(l.issues.map((x) => [x.number, x.status]), [['APS/1126-002', 'issued'], ['APS/1126-001', 'void']]);
  const r2 = await call('POST', '/api/issue', T, ISS('doc-ffff-0001'));
  assert.equal(r2.status, 200); assert.equal(r2.status === 200 && r2.repeat, true); // nombor batal tidak digunakan semula
  const g = await call('GET', '/api/ledger', T);
  assert.deepEqual(g.entries.map((e) => e.reason), ['issue', 'issue', 'trial']);
});
