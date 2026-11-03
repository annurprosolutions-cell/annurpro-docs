import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, addMonths, pickEmail, planFromItems } from '../worker/index.mjs';
import { createD1 } from './helpers/d1.mjs';

const CLIENT = 'cid.apps.googleusercontent.com';
const NOW = Date.parse('2026-11-03T02:00:00Z');
const KEY = 'k'.repeat(48);
const EMAIL_FIELD = { 'E-mel Google untuk sistem': 'Pemilik@Contoh.my', 'Nama syarikat': 'AnnurPro Solutions' };

// BCL palsu: transaksi disimpan dalam peta; Google tokeninfo palsu
function setup(vars, txs) {
  txs = txs || {};
  let bclCalls = 0;
  const fetchFn = async (url) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      const tok = decodeURIComponent(u.split('access_token=')[1]);
      return new Response(JSON.stringify({ aud: CLIENT, email: tok.replace(/^tok-/, ''), email_verified: 'true' }), { status: tok.startsWith('tok-') ? 200 : 400 });
    }
    if (u.startsWith('https://api.bcl.test/v1/transactions/')) {
      bclCalls++;
      const id = decodeURIComponent(u.split('/transactions/')[1]);
      return txs[id] ? new Response(JSON.stringify({ success: true, data: txs[id] }), { status: 200 }) : new Response('{"message":"Not found"}', { status: 404 });
    }
    throw new Error('fetch tidak dijangka ' + u);
  };
  const env = Object.assign({ GOOGLE_CLIENT_ID: CLIENT, DB: createD1(), BCL_WEBHOOK_KEY: KEY, BCL_API_TOKEN: 'bcl_test', BCL_API_URL: 'https://api.bcl.test/v1',
    OWNER_EMAILS: 'owner@annurpro.com', ADMIN_TOKEN: 'a'.repeat(40), PACKS: '{"10":110,"20":230,"50":600}' }, vars || {});
  const call = (method, path, opts = {}) => handle(new Request('https://w.test' + path, {
    method, headers: Object.assign({}, opts.token ? { authorization: 'Bearer ' + opts.token } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined
  }), env, { fetch: fetchFn, now: () => opts.now || NOW }).then(async (r) => ({ http: r.status, ...(await r.json()) }));
  return { env, call, txs, bclCalls: () => bclCalls };
}
const tx = (order, items, amount, extra) => ({ record_id: 'r-' + order, main_data: Object.assign({ order_number: order, status: 3, is_paid: true, amount, subtotal_amount: amount, items, payer_email: 'payer@x.my' }, extra || {}), custom_fields_data: EMAIL_FIELD });
const hook = (order, amount, extra) => ({ event: 'payment-success', data: { record_id: 'r-' + order, main_data: Object.assign({ order_number: order, amount, transaction_type: 'live' }, extra || {}), custom_fields_data: EMAIL_FIELD } });
const sub = async (env, email) => env.DB.prepare('SELECT plan, expires, day FROM subscriptions WHERE email = ?').bind(email).first();

test('addMonths: tambat hari, bulan pendek, merentas tahun', () => {
  assert.equal(addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(addMonths('2028-01-31', 1, 31), '2028-02-29');
  assert.equal(addMonths('2026-11-30', 3, 30), '2027-02-28');
  assert.equal(addMonths('2026-11-03', 12, 3), '2027-11-03');
});

test('pickEmail & planFromItems', () => {
  assert.equal(pickEmail(EMAIL_FIELD, 'payer@x.my'), 'pemilik@contoh.my');
  assert.equal(pickEmail({ Telefon: '012' }, 'Payer@X.my'), 'payer@x.my');
  assert.equal(pickEmail({}, 'bukan-emel'), '');
  assert.deepEqual(planFromItems([{ item: 'Langganan Bulanan', quantity: 3 }], 60, {}), { months: 3, credits: 0 });
  assert.deepEqual(planFromItems([{ item: 'Langganan Tahunan', quantity: 1 }], 200, {}), { months: 12, credits: 0 });
  assert.deepEqual(planFromItems([{ item: 'Pek Kredit', price: '20.00', quantity: 2 }], 40, { PACKS: '{"20":230}' }), { months: 0, credits: 460 });
  assert.deepEqual(planFromItems([{ item: '110 kredit', quantity: 1 }], 10, {}), { months: 0, credits: 110 });
  assert.equal(planFromItems([], 200, {}).months, 12); assert.equal(planFromItems([], 20, {}).months, 1);
  assert.equal(planFromItems([{ item: 'Langganan Bulanan', quantity: 999 }], 20, {}).months, 120);
});

test('webhook: kunci salah 404; bukan payment-success diabaikan; ujian diabaikan', async () => {
  const S = setup({}, { O1: tx('O1', [{ item: 'Langganan Bulanan', quantity: 1 }], '20.00') });
  assert.equal((await S.call('POST', '/bcl/salah', { body: hook('O1', '20.00') })).http, 404);
  assert.equal((await S.call('POST', '/bcl/' + KEY, { body: { event: 'payment-failed', data: {} } })).ignored, 'payment-failed');
  assert.equal((await S.call('POST', '/bcl/' + KEY, { body: hook('O1', '20.00', { transaction_type: 'test' }) })).ignored, 'transaksi-ujian');
  assert.equal(await sub(S.env, 'pemilik@contoh.my'), null);
});

test('webhook berjaya: langganan 1 bulan, nama syarikat, log; hantar semula tidak menambah dua kali', async () => {
  const S = setup({}, { O1: tx('O1', [{ item: 'Langganan Bulanan', quantity: 1 }], '20.00') });
  const r = await S.call('POST', '/bcl/' + KEY, { body: hook('O1', '20.00') });
  assert.equal(r.ok, true); assert.equal(r.email, 'pemilik@contoh.my'); assert.equal(r.expires, '2026-12-03');
  assert.deepEqual(await sub(S.env, 'pemilik@contoh.my'), { plan: 'bulanan', expires: '2026-12-03', day: 3 });
  assert.equal(await S.env.DB.prepare('SELECT business_name FROM tenants').first('business_name'), 'AnnurPro Solutions');
  const again = await S.call('POST', '/bcl/' + KEY, { body: hook('O1', '20.00') });
  assert.equal(again.duplicate, true);
  assert.equal((await sub(S.env, 'pemilik@contoh.my')).expires, '2026-12-03');
  assert.equal(await S.env.DB.prepare('SELECT COUNT(*) AS n FROM webhook_log').first('n'), 2);
  // langganan kini berkuat kuasa untuk terbit
  const chk = await S.call('POST', '/api/check', { token: 'tok-pemilik@contoh.my' });
  assert.equal(chk.mode, 'langganan'); assert.equal(chk.daysLeft, 30);
});

test('dua webhook serentak untuk pesanan sama: dilanjutkan sekali sahaja', async () => {
  const S = setup({}, { O2: tx('O2', [{ item: 'Langganan Tahunan', quantity: 1 }], '200.00') });
  const rs = await Promise.all([1, 2, 3].map(() => S.call('POST', '/bcl/' + KEY, { body: hook('O2', '200.00') })));
  assert.equal(rs.filter((r) => r.ok && !r.duplicate).length, 1);
  assert.deepEqual(await sub(S.env, 'pemilik@contoh.my'), { plan: 'tahunan', expires: '2027-11-03', day: 3 });
  assert.equal(await S.env.DB.prepare('SELECT COUNT(*) AS n FROM payments').first('n'), 1);
});

test('pelanjutan: dari tarikh tamat jika aktif, dari hari ini jika tamat; kuantiti', async () => {
  const S = setup({}, { A: tx('A', [{ item: 'Langganan Bulanan', quantity: 3 }], '60.00'), B: tx('B', [{ item: 'Langganan Bulanan', quantity: 1 }], '20.00') });
  await S.call('POST', '/bcl/' + KEY, { body: hook('A', '60.00') });
  assert.equal((await sub(S.env, 'pemilik@contoh.my')).expires, '2027-02-03');
  await S.call('POST', '/bcl/' + KEY, { body: hook('B', '20.00') });
  assert.equal((await sub(S.env, 'pemilik@contoh.my')).expires, '2027-03-03', 'dari tarikh tamat semasa');
  const S2 = setup({}, { C: tx('C', [{ item: 'Langganan Bulanan', quantity: 1 }], '20.00') });
  await S2.env.DB.prepare("INSERT INTO tenants (email, credits, created_at) VALUES ('pemilik@contoh.my', 0, 'x')").run();
  await S2.env.DB.prepare("INSERT INTO subscriptions (email, plan, expires, day, updated_at) VALUES ('pemilik@contoh.my', 'bulanan', '2026-09-30', 30, 'x')").run();
  await S2.call('POST', '/bcl/' + KEY, { body: hook('C', '20.00') });
  assert.deepEqual(await sub(S2.env, 'pemilik@contoh.my'), { plan: 'bulanan', expires: '2026-12-03', day: 3 }, 'tamat → dari hari ini');
});

test('pengesahan: belum dibayar, jumlah tidak sepadan, pesanan tidak sepadan, tiada token API', async () => {
  const S = setup({}, { P: tx('P', [], '20.00', { status: 1, is_paid: false }), Q: tx('Q', [{ item: 'Langganan Bulanan' }], '20.00'), R: Object.assign(tx('R', [], '20.00'), { main_data: { order_number: 'LAIN', status: 3, amount: '20.00' } }) });
  assert.equal((await S.call('POST', '/bcl/' + KEY, { body: hook('P', '20.00') })).reason, 'belum-dibayar');
  assert.equal((await S.call('POST', '/bcl/' + KEY, { body: hook('Q', '200.00') })).reason, 'jumlah-tidak-sepadan');
  assert.equal((await S.call('POST', '/bcl/' + KEY, { body: hook('R', '20.00') })).reason, 'pesanan-tidak-sepadan');
  assert.equal((await S.call('POST', '/bcl/' + KEY, { body: hook('TIADA', '20.00') })).reason, 'api-bcl-404');
  const S2 = setup({ BCL_API_TOKEN: '' }, { Q: tx('Q', [], '20.00') });
  assert.equal((await S2.call('POST', '/bcl/' + KEY, { body: hook('Q', '20.00') })).reason, 'tiada-token-api');
  assert.equal(await S.env.DB.prepare('SELECT COUNT(*) AS n FROM payments').first('n'), 0);
  assert.equal(await S.env.DB.prepare('SELECT COUNT(*) AS n FROM webhook_log WHERE ok = 0').first('n'), 4);
});

test('pek kredit: kredit ditambah sekali, ledger pack', async () => {
  const S = setup({}, { K: tx('K', [{ item: 'Pek Kredit RM10', price: '10.00', quantity: 1 }], '10.00') });
  await S.call('POST', '/bcl/' + KEY, { body: hook('K', '10.00') });
  await S.call('POST', '/bcl/' + KEY, { body: hook('K', '10.00') });
  assert.equal(await S.env.DB.prepare('SELECT credits FROM tenants').first('credits'), 50 + 110);
  assert.deepEqual(await S.env.DB.prepare("SELECT delta, ref FROM credit_ledger WHERE reason = 'pack'").first(), { delta: 110, ref: 'K' });
  const chk = await S.call('POST', '/api/check', { token: 'tok-pemilik@contoh.my' });
  assert.equal(chk.trial, false, 'pembeli kredit bukan lagi percubaan');
  const p = await S.call('GET', '/api/payments', { token: 'tok-pemilik@contoh.my' });
  assert.equal(p.payments.length, 1); assert.equal(p.payments[0].kind, 'kredit');
});

test('borang lain diabaikan bila BCL_FORM_ID ditetapkan', async () => {
  const S = setup({ BCL_FORM_ID: '42' }, { F: Object.assign(tx('F', [], '20.00'), { formable_id: 7 }) });
  const r = await S.call('POST', '/bcl/' + KEY, { body: { event: 'payment-success', data: { formable_id: 7, record_id: 'r-F', main_data: { order_number: 'F', amount: '20.00' } } } });
  assert.equal(r.ignored, 'borang-lain');
});

test('admin: akses ditolak untuk bukan pemilik; pemilik & ADMIN_TOKEN dibenarkan', async () => {
  const S = setup();
  assert.equal((await S.call('GET', '/api/admin/overview', { token: 'tok-orang@x.my' })).http, 403);
  assert.equal((await S.call('GET', '/api/admin/overview')).http, 401);
  assert.equal((await S.call('GET', '/api/admin/overview', { token: 'tok-owner@annurpro.com' })).ok, true);
  assert.equal((await S.call('GET', '/api/admin/overview', { token: 'a'.repeat(40) })).ok, true);
});

test('admin: tambah bulan, tetap tarikh, laras kredit, statistik, sahkan pesanan manual', async () => {
  const S = setup({}, { 'ORD-M01': tx('ORD-M01', [{ item: 'Langganan Bulanan', quantity: 1 }], '20.00') });
  const O = { token: 'tok-owner@annurpro.com' };
  let r = await S.call('POST', '/api/admin/subscription', Object.assign({ body: { email: 'baru@x.my', addMonths: 3 } }, O));
  assert.equal(r.expires, '2027-02-03'); assert.equal(r.plan, 'bulanan');
  r = await S.call('POST', '/api/admin/subscription', Object.assign({ body: { email: 'baru@x.my', addMonths: 12 } }, O));
  assert.equal(r.expires, '2028-02-03'); assert.equal(r.plan, 'tahunan');
  r = await S.call('POST', '/api/admin/subscription', Object.assign({ body: { email: 'baru@x.my', expires: '2026-12-31', plan: 'pilot' } }, O));
  assert.deepEqual([r.expires, r.plan], ['2026-12-31', 'pilot']);
  assert.equal((await S.call('POST', '/api/admin/subscription', Object.assign({ body: { email: 'baru@x.my', addMonths: 0 } }, O))).http, 400);
  r = await S.call('POST', '/api/admin/credits', Object.assign({ body: { email: 'baru@x.my', delta: 25, note: 'Ganti rugi sokongan' } }, O));
  assert.equal(r.credits, 75);
  assert.equal((await S.call('POST', '/api/admin/credits', Object.assign({ body: { email: 'baru@x.my', delta: -500, note: 'Salah' } }, O))).http, 400);
  assert.equal((await S.call('POST', '/api/admin/credits', Object.assign({ body: { email: 'baru@x.my', delta: 5, note: '' } }, O))).http, 400);
  // pesanan terlepas webhook: sahkan manual, e-mel boleh dinyatakan
  r = await S.call('POST', '/api/admin/verify-order', Object.assign({ body: { order: 'ORD-M01', email: 'betul@x.my' } }, O));
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.email, 'betul@x.my');
  const ov = await S.call('GET', '/api/admin/overview', O);
  assert.equal(ov.stats.tenants, 2); assert.equal(ov.stats.subscribed, 2); assert.equal(ov.stats.revenue30, 20);
  assert.equal(ov.payments.length, 1); assert.ok(ov.logs.length >= 4);
  const t = ov.tenants.find((x) => x.email === 'baru@x.my');
  assert.equal(t.state, 'langganan'); assert.equal(t.credits, 75);
  assert.equal(ov.stats.mrr, 40);
});
