import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, entitlement, todayMY, daysBetween } from '../worker/index.mjs';
import { createD1 } from './helpers/d1.mjs';

const CLIENT = 'test-client.apps.googleusercontent.com';
const NOW = Date.parse('2026-11-03T02:00:00Z'); // 03/11/2026 10:00 MYT

// tokeninfo palsu: token "tok-<emel>" sah; "tok-bad-aud" untuk app lain
const fakeFetch = async (url) => {
  const tok = decodeURIComponent(String(url).split('access_token=')[1] || '');
  if (tok === 'tok-bad-aud') return new Response(JSON.stringify({ aud: 'lain', email: 'a@b.com', email_verified: 'true' }), { status: 200 });
  if (tok === 'tok-unverified') return new Response(JSON.stringify({ aud: CLIENT, email: 'u@b.com', email_verified: 'false' }), { status: 200 });
  if (!tok.startsWith('tok-')) return new Response('{"error":"invalid_token"}', { status: 400 });
  return new Response(JSON.stringify({ aud: CLIENT, email: tok.slice(4), email_verified: 'true' }), { status: 200 });
};

const setup = (vars) => {
  const env = Object.assign({ GOOGLE_CLIENT_ID: CLIENT, ALLOWED_ORIGINS: 'https://annurinvoice.test', DB: createD1() }, vars || {});
  const call = (path, opts = {}) => handle(new Request('https://w.test' + path, {
    method: opts.method || 'GET',
    headers: Object.assign({}, opts.token ? { authorization: 'Bearer ' + opts.token } : {}, opts.origin ? { origin: opts.origin } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }), env, { fetch: fakeFetch, now: () => opts.now || NOW });
  return { env, call };
};
const body = async (res) => ({ status: res.status, ...(await res.json()) });

test('ping', async () => {
  const { call } = setup();
  const r = await body(await call('/api/ping'));
  assert.equal(r.status, 200); assert.equal(r.ok, true); assert.equal(r.db, true);
});

test('check tanpa token / token ditolak / audience salah / emel tidak disahkan → 401', async () => {
  const { call } = setup();
  for (const token of [undefined, 'xyzxyzxyzxyz', 'tok-bad-aud', 'tok-unverified']) {
    const r = await body(await call('/api/check', { method: 'POST', token }));
    assert.equal(r.status, 401, String(token)); assert.equal(r.reason, 'token-tidak-sah');
  }
});

test('akaun baharu dapat 50 kredit sekali sahaja', async () => {
  const { env, call } = setup();
  const r1 = await body(await call('/api/check', { method: 'POST', token: 'tok-Ali@Contoh.com' }));
  assert.equal(r1.status, 200);
  assert.equal(r1.email, 'ali@contoh.com');
  assert.equal(r1.newAccount, true);
  assert.equal(r1.credits, 50); assert.equal(r1.docsLeft, 10);
  assert.equal(r1.mode, 'kredit'); assert.equal(r1.entitled, true); assert.equal(r1.trial, true);
  const r2 = await body(await call('/api/check', { method: 'POST', token: 'tok-ali@contoh.com' }));
  assert.equal(r2.newAccount, false); assert.equal(r2.credits, 50);
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE email = ? AND reason = 'trial'").bind('ali@contoh.com').first('n');
  assert.equal(n, 1);
});

test('dua check serentak untuk akaun baharu tidak menggandakan kredit', async () => {
  const { env, call } = setup();
  const rs = await Promise.all([1, 2, 3].map(() => call('/api/check', { method: 'POST', token: 'tok-serentak@x.com' }).then(body)));
  rs.forEach((r) => { assert.equal(r.status, 200); assert.equal(r.credits, 50); });
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM credit_ledger WHERE email = ?').bind('serentak@x.com').first('n');
  assert.equal(n, 1);
});

test('TRIAL_CREDITS 0: tiada kredit, mode habis', async () => {
  const { call } = setup({ TRIAL_CREDITS: '0' });
  const r = await body(await call('/api/check', { method: 'POST', token: 'tok-kosong@x.com' }));
  assert.equal(r.credits, 0); assert.equal(r.mode, 'habis'); assert.equal(r.entitled, false); assert.equal(r.reason, 'tiada-kredit');
});

test('nama perniagaan disimpan dan dipotong 120 aksara', async () => {
  const { call } = setup();
  const r = await body(await call('/api/check', { method: 'POST', token: 'tok-n@x.com', body: { businessName: '  AZN POWER SOLUTION ' + 'x'.repeat(200) } }));
  assert.equal(r.businessName.length, 120); assert.ok(r.businessName.startsWith('AZN POWER SOLUTION'));
});

test('langganan aktif, ihsan dan tamat', async () => {
  const { env, call } = setup();
  await call('/api/check', { method: 'POST', token: 'tok-s@x.com' });
  const setSub = (expires) => env.DB.prepare("INSERT OR REPLACE INTO subscriptions (email, plan, expires, day, updated_at) VALUES ('s@x.com', 'bulanan', ?, 3, 'x')").bind(expires).run();
  await setSub('2026-11-20');
  let r = await body(await call('/api/check', { method: 'POST', token: 'tok-s@x.com' }));
  assert.equal(r.mode, 'langganan'); assert.equal(r.daysLeft, 17); assert.equal(r.trial, false);
  await setSub('2026-10-30');
  r = await body(await call('/api/check', { method: 'POST', token: 'tok-s@x.com' }));
  assert.equal(r.mode, 'ihsan'); assert.equal(r.graceLeft, 3);
  await setSub('2026-10-01');
  await env.DB.prepare("UPDATE tenants SET credits = 3 WHERE email = 's@x.com'").run();
  r = await body(await call('/api/check', { method: 'POST', token: 'tok-s@x.com' }));
  assert.equal(r.mode, 'habis'); assert.equal(r.reason, 'tamat'); assert.equal(r.entitled, false);
});

test('kekangan D1: baki kredit tidak boleh negatif', async () => {
  const { env, call } = setup();
  await call('/api/check', { method: 'POST', token: 'tok-c@x.com' });
  await assert.rejects(env.DB.prepare("UPDATE tenants SET credits = credits - 55 WHERE email = 'c@x.com'").run());
});

test('CORS: asal disenarai dapat header, asal lain ditolak', async () => {
  const { call } = setup();
  let res = await call('/api/ping', { origin: 'https://annurinvoice.test' });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://annurinvoice.test');
  res = await call('/api/ping', { origin: 'https://jahat.test' });
  assert.equal(res.status, 403);
  res = await call('/api/ping', { origin: 'https://w.test' });
  assert.equal(res.status, 200);
});

test('laluan tidak wujud → 404, bukan API → ASSETS', async () => {
  const { env, call } = setup();
  assert.equal((await call('/api/tiada')).status, 404);
  env.ASSETS = { fetch: async () => new Response('app') };
  assert.equal(await (await call('/index.html')).text(), 'app');
});

test('tarikh Malaysia dan entitlement tulen', () => {
  assert.equal(todayMY(Date.parse('2026-11-02T16:30:00Z')), '2026-11-03'); // 00:30 MYT
  assert.equal(daysBetween('2026-01-31', '2026-03-01'), 29);
  const c = { perDoc: 5, graceDays: 7 };
  assert.equal(entitlement({ credits: 4 }, null, false, c, '2026-11-03').mode, 'habis');
  assert.equal(entitlement({ credits: 5 }, null, true, c, '2026-11-03').trial, false);
});

test('had kadar: terbit dihadkan 30/minit per token, minit seterusnya pulih; webhook & ping tidak dihadkan', async () => {
  const { call, env } = setup({ TRIAL_CREDITS: '500' });
  const tok = 'tok-laju@x.com';
  let last;
  for (let i = 0; i < 31; i++) {
    last = await handle(new Request('https://w.test/api/issue', { method: 'POST', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify({ docId: 'doc-rate-' + String(i).padStart(4, '0'), type: 'invoice', prefix: 'APS', date: '2026-11-03' }) }), env, { fetch: fakeFetch, now: () => NOW });
  }
  assert.equal(last.status, 429); assert.ok(Number(last.headers.get('retry-after')) > 0);
  assert.equal((await last.json()).reason, 'terlalu-kerap');
  const next = await handle(new Request('https://w.test/api/issue', { method: 'POST', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify({ docId: 'doc-rate-next', type: 'invoice', prefix: 'APS', date: '2026-11-03' }) }), env, { fetch: fakeFetch, now: () => NOW + 61000 });
  assert.equal(next.status, 200);
  const other = await handle(new Request('https://w.test/api/check', { method: 'POST', headers: { authorization: 'Bearer tok-lain@x.com' } }), env, { fetch: fakeFetch, now: () => NOW });
  assert.equal(other.status, 200, 'token lain tidak terjejas');
  for (let i = 0; i < 70; i++) await call('/api/ping');
  assert.equal((await call('/api/ping')).status, 200);
});

test('borang BCL sebenar (20718): nama item & medan e-mel', async () => {
  const { planFromItems, pickEmail, pickBusiness } = await import('../worker/index.mjs');
  const env = { PACKS: '{"10":110}', YEARLY_MIN_AMOUNT: '150' };
  assert.deepEqual(planFromItems([{ name: 'LANGGANAN BULANAN', quantity: 3, price: '20.00' }], 60, env), { months: 3, credits: 0 });
  assert.deepEqual(planFromItems([{ name: 'LANGGANAN TAHUNAN', quantity: 1, price: '200.00' }], 200, env), { months: 12, credits: 0 });
  const custom = { e_mel_akaun_google_untuk_log_masuk: ' Owner@Gmail.com ', nama_syarikat: 'Contoh Trading' };
  assert.equal(pickEmail(custom, 'lain@x.my'), 'owner@gmail.com');
  assert.equal(pickBusiness(custom), 'Contoh Trading');
});
