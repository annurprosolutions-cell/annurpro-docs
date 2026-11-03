// Annur Invoice — Worker (Cloudflare Workers + D1)
// Laluan: /api/ping, /api/check (Fasa 1). /api/issue, /api/void, /api/issues, /api/ledger,
// /bcl/<key> dan /api/admin/* ditambah dalam fasa berikutnya (rujuk docs/06-IPD.md).
//
// Pemboleh ubah: GOOGLE_CLIENT_ID, ALLOWED_ORIGINS (dipisah koma), OWNER_EMAILS, TRIAL_CREDITS (50),
//   CREDITS_PER_DOC (5), GRACE_DAYS (7), BUY_URL_SUB, BUY_URL_PACK.
// Binding: DB (D1), ASSETS (fail statik).
//
// handle(req, env, deps) ialah fungsi tulen supaya boleh diuji: deps.fetch (tokeninfo), deps.now (ms).

const APP = 'Annur Invoice API';
const MY_OFFSET_MS = 8 * 3600 * 1000; // Asia/Kuala_Lumpur, tiada DST

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };
const cfg = (env) => ({
  trialCredits: int(env.TRIAL_CREDITS, 50),
  perDoc: int(env.CREDITS_PER_DOC, 5) || 5,
  graceDays: int(env.GRACE_DAYS, 7),
  editHours: int(env.EDIT_WINDOW_HOURS, 24),
  buyUrls: { sub: env.BUY_URL_SUB || '', pack: env.BUY_URL_PACK || '' }
});

// ---------- tarikh (ikut waktu Malaysia) ----------
export const todayMY = (now) => new Date(now + MY_OFFSET_MS).toISOString().slice(0, 10);
const dayNum = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 864e5);
export const daysBetween = (fromIso, toIso) => dayNum(toIso) - dayNum(fromIso);

// ---------- HTTP ----------
const allowedOrigins = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);

function corsHeaders(req, env) {
  const origin = req.headers.get('origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'origin'
  };
}

// Permintaan dari asal lain yang tidak disenarai ditolak (asal yang sama dengan Worker sentiasa dibenarkan).
function originOk(req, env) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  if (origin === new URL(req.url).origin) return true;
  return allowedOrigins(env).includes(origin);
}

const json = (body, status, extra) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {})
});

async function readJson(req, max) {
  const text = await req.text();
  if (text.length > (max || 16384)) { const e = new Error('Permintaan terlalu besar'); e.status = 413; throw e; }
  if (!text) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  catch (e) { const err = new Error('JSON tidak sah'); err.status = 400; throw err; }
}

// ---------- pengesahan token Google ----------
// Pulang emel huruf kecil, atau lontar ralat status 401.
export async function authEmail(req, env, fetchFn) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(\S{10,4096})$/i);
  const fail = (reason) => { const e = new Error(reason); e.status = 401; e.reason = 'token-tidak-sah'; throw e; };
  if (!m) fail('Token tiada');
  if (!env.GOOGLE_CLIENT_ID) { const e = new Error('GOOGLE_CLIENT_ID belum ditetapkan pada Worker'); e.status = 500; throw e; }
  let info;
  try {
    const res = await fetchFn('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(m[1]));
    if (!res.ok) fail('Token ditolak Google');
    info = await res.json();
  } catch (e) {
    if (e.status) throw e;
    const err = new Error('Tidak dapat menghubungi Google'); err.status = 502; throw err;
  }
  const aud = info.aud || info.azp;
  if (aud !== env.GOOGLE_CLIENT_ID) fail('Token bukan untuk app ini');
  if (!(info.email_verified === true || info.email_verified === 'true')) fail('Emel tidak disahkan');
  const email = String(info.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Emel tiada dalam token');
  return email;
}

// ---------- akaun & kelayakan ----------
async function getTenant(db, email) {
  return db.prepare('SELECT email, business_name, credits, created_at FROM tenants WHERE email = ?').bind(email).first();
}

// Cipta akaun + kredit percubaan sekali sahaja. Selamat jika dua permintaan serentak (PK + UNIQUE).
export async function ensureTenant(db, email, c, nowIso) {
  let t = await getTenant(db, email);
  if (t) return { tenant: t, created: false };
  const stmts = [db.prepare('INSERT INTO tenants (email, business_name, credits, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
    .bind(email, '', c.trialCredits, nowIso, nowIso)];
  if (c.trialCredits > 0) {
    stmts.push(db.prepare("INSERT INTO credit_ledger (email, delta, reason, ref, balance_after, note, created_at) VALUES (?, ?, 'trial', 'trial', ?, ?, ?)")
      .bind(email, c.trialCredits, c.trialCredits, 'Kredit percubaan percuma', nowIso));
  }
  try {
    await db.batch(stmts);
    return { tenant: await getTenant(db, email), created: true };
  } catch (e) {
    t = await getTenant(db, email); // permintaan lain sudah cipta
    if (t) return { tenant: t, created: false };
    throw e;
  }
}

// Status kelayakan (tulen): mode langganan | ihsan | kredit | habis
export function entitlement(tenant, sub, paidBefore, c, today) {
  const credits = tenant ? tenant.credits : 0;
  const out = { credits, creditsPerDoc: c.perDoc, docsLeft: Math.floor(credits / c.perDoc), plan: null, expires: null, daysLeft: null };
  if (sub) {
    out.plan = sub.plan; out.expires = sub.expires;
    out.daysLeft = daysBetween(today, sub.expires);
    if (out.daysLeft >= 0) return Object.assign(out, { mode: 'langganan', entitled: true, trial: false });
    if (out.daysLeft >= -c.graceDays) return Object.assign(out, { mode: 'ihsan', entitled: true, trial: false, graceLeft: c.graceDays + out.daysLeft });
  }
  const trial = !sub && !paidBefore;
  if (credits >= c.perDoc) return Object.assign(out, { mode: 'kredit', entitled: true, trial });
  return Object.assign(out, { mode: 'habis', entitled: false, trial, reason: sub ? 'tamat' : 'tiada-kredit' });
}

async function check(req, env, deps) {
  const email = await authEmail(req, env, deps.fetch);
  const body = await readJson(req, 4096);
  const c = cfg(env);
  const nowIso = new Date(deps.now()).toISOString();
  const db = env.DB;
  const { tenant: t0, created } = await ensureTenant(db, email, c, nowIso);

  const name = typeof body.businessName === 'string' ? body.businessName.trim().slice(0, 120) : null;
  if (name !== null && name !== t0.business_name) {
    await db.prepare('UPDATE tenants SET business_name = ?, last_seen = ? WHERE email = ?').bind(name, nowIso, email).run();
    t0.business_name = name;
  } else if (!created) {
    await db.prepare('UPDATE tenants SET last_seen = ? WHERE email = ?').bind(nowIso, email).run();
  }

  const sub = await db.prepare('SELECT plan, expires FROM subscriptions WHERE email = ?').bind(email).first();
  const paid = await db.prepare("SELECT 1 AS x FROM credit_ledger WHERE email = ? AND reason = 'pack' LIMIT 1").bind(email).first();
  const ent = entitlement(t0, sub, !!paid, c, todayMY(deps.now()));
  return json(Object.assign({ ok: true, email, businessName: t0.business_name, newAccount: created, buyUrls: c.buyUrls }, ent));
}

// ---------- terbit dokumen: nombor berserial + caj kredit (docs/05-BSD.md §3B) ----------
const DOC_TYPES = ['invoice', 'quotation', 'do'];
const bad = (msg, reason) => { const e = new Error(msg); e.status = 400; e.reason = reason || 'input-tidak-sah'; return e; };
export const periodOf = (iso) => iso.slice(5, 7) + iso.slice(2, 4);   // 2026-11-03 → 1126

function issuedOut(row, c, extra) {
  const until = new Date(Date.parse(row.issued_at) + c.editHours * 3600e3).toISOString();
  return Object.assign({ ok: true, docId: row.doc_id, number: row.number, type: row.doc_type, issuedAt: row.issued_at, state: row.status,
    charged: row.credits_charged, editableUntil: until }, extra || {});
}

async function issue(req, env, deps) {
  const email = await authEmail(req, env, deps.fetch);
  const b = await readJson(req, 4096);
  const c = cfg(env), db = env.DB;
  const docId = String(b.docId || ''), type = String(b.type || ''), prefix = String(b.prefix || '').toUpperCase(), date = String(b.date || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(docId)) throw bad('docId tidak sah');
  if (!DOC_TYPES.includes(type)) throw bad('Jenis dokumen tidak sah');
  if (!/^[A-Z0-9-]{1,12}$/.test(prefix)) throw bad('Prefix tidak sah (huruf, nombor, sempang; maks 12)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw bad('Tarikh tidak sah');
  const nowIso = new Date(deps.now()).toISOString();
  const today = todayMY(deps.now());
  if (Math.abs(daysBetween(today, date)) > 366) throw bad('Tarikh terlalu jauh dari hari ini');

  // 1) ulangan dengan doc_id sama → nombor sama, tiada caj (cuba semula selamat)
  const prev = await db.prepare('SELECT * FROM doc_issues WHERE doc_id = ?').bind(docId).first();
  if (prev) {
    if (prev.email !== email) { const e = new Error('docId milik akaun lain'); e.status = 409; e.reason = 'doc-id-bertembung'; throw e; }
    const t = await getTenant(db, email);
    return json(issuedOut(prev, c, { repeat: true, credits: t ? t.credits : 0 }));
  }

  // 2) kelayakan
  const { tenant } = await ensureTenant(db, email, c, nowIso);
  const sub = await db.prepare('SELECT plan, expires FROM subscriptions WHERE email = ?').bind(email).first();
  const paid = await db.prepare("SELECT 1 AS x FROM credit_ledger WHERE email = ? AND reason = 'pack' LIMIT 1").bind(email).first();
  const ent = entitlement(tenant, sub, !!paid, c, today);
  if (!ent.entitled) return json(Object.assign({ ok: false, error: ent.reason === 'tamat' ? 'Langganan telah tamat.' : 'Baki kredit tidak cukup.', buyUrls: c.buyUrls }, ent), 403);
  const charge = ent.mode === 'langganan' || ent.mode === 'ihsan' ? 0 : c.perDoc;

  // 3) satu transaksi: kaunter → rekod terbit → potong kredit → ledger
  const period = periodOf(date);
  const stmts = [
    db.prepare('INSERT INTO counters (email, doc_type, prefix, period, last_seq) VALUES (?, ?, ?, ?, 1) ON CONFLICT (email, doc_type, prefix, period) DO UPDATE SET last_seq = last_seq + 1')
      .bind(email, type, prefix, period),
    db.prepare(`INSERT INTO doc_issues (doc_id, email, doc_type, number, period, seq, credits_charged, issued_at, status)
      SELECT ?, ?, ?, ? || '/' || ? || '-' || printf('%03d', last_seq), ?, last_seq, ?, ?, 'issued' FROM counters WHERE email = ? AND doc_type = ? AND prefix = ? AND period = ?`)
      .bind(docId, email, type, prefix, period, period, charge, nowIso, email, type, prefix, period)
  ];
  if (charge) {
    stmts.push(db.prepare('UPDATE tenants SET credits = credits - ?, last_seen = ? WHERE email = ?').bind(charge, nowIso, email));
    stmts.push(db.prepare("INSERT INTO credit_ledger (email, delta, reason, ref, balance_after, note, created_at) SELECT ?, ?, 'issue', ?, credits, ?, ? FROM tenants WHERE email = ?")
      .bind(email, -charge, docId, 'Terbit ' + type, nowIso, email));
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    const again = await db.prepare('SELECT * FROM doc_issues WHERE doc_id = ?').bind(docId).first();
    if (again && again.email === email) { const t = await getTenant(db, email); return json(issuedOut(again, c, { repeat: true, credits: t ? t.credits : 0 })); }
    if (/CHECK|constraint/i.test(String(e && e.message))) {
      const t = await getTenant(db, email);
      return json({ ok: false, reason: 'tiada-kredit', error: 'Baki kredit tidak cukup.', credits: t ? t.credits : 0, creditsPerDoc: c.perDoc, buyUrls: c.buyUrls }, 403);
    }
    throw e;
  }
  const row = await db.prepare('SELECT * FROM doc_issues WHERE doc_id = ?').bind(docId).first();
  const t = await getTenant(db, email);
  return json(issuedOut(row, c, { repeat: false, credits: t.credits, mode: ent.mode }));
}

async function voidDoc(req, env, deps) {
  const email = await authEmail(req, env, deps.fetch);
  const b = await readJson(req, 2048);
  const docId = String(b.docId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(docId)) throw bad('docId tidak sah');
  const nowIso = new Date(deps.now()).toISOString();
  const r = await env.DB.prepare("UPDATE doc_issues SET status = 'void', voided_at = COALESCE(voided_at, ?) WHERE doc_id = ? AND email = ?").bind(nowIso, docId, email).run();
  if (!r.meta.changes) return json({ ok: false, reason: 'tiada', error: 'Dokumen tidak dijumpai' }, 404);
  const row = await env.DB.prepare('SELECT * FROM doc_issues WHERE doc_id = ?').bind(docId).first();
  return json(issuedOut(row, cfg(env)));
}

async function listIssues(req, env, deps) {
  const email = await authEmail(req, env, deps.fetch);
  const u = new URL(req.url);
  const since = u.searchParams.get('since') || '1970-01-01T00:00:00.000Z';
  const limit = Math.min(500, Math.max(1, int(u.searchParams.get('limit'), 200)));
  const r = await env.DB.prepare('SELECT doc_id, doc_type, number, issued_at, status, credits_charged FROM doc_issues WHERE email = ? AND issued_at >= ? ORDER BY issued_at DESC LIMIT ?')
    .bind(email, since, limit).all();
  return json({ ok: true, issues: r.results.map((x) => ({ docId: x.doc_id, type: x.doc_type, number: x.number, issuedAt: x.issued_at, status: x.status, charged: x.credits_charged })) });
}

async function ledger(req, env, deps) {
  const email = await authEmail(req, env, deps.fetch);
  const limit = Math.min(200, Math.max(1, int(new URL(req.url).searchParams.get('limit'), 50)));
  const r = await env.DB.prepare('SELECT delta, reason, ref, balance_after, note, created_at FROM credit_ledger WHERE email = ? ORDER BY id DESC LIMIT ?').bind(email, limit).all();
  return json({ ok: true, entries: r.results });
}

// ---------- bayaran BCL (docs/05-BSD.md §3B, rujukan: skill micro-saas-builder references/bcl.md) ----------
// Tambah bulan kalendar dengan hari tambatan: 31 Jan + 1 = 28/29 Feb, pembaharuan seterusnya kembali ke 31.
export const addMonths = (iso, n, day) => {
  const [y, m, d] = iso.split('-').map(Number), want = Math.max(d, day | 0);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(want, last));
  return t.toISOString().slice(0, 10);
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// E-mel log masuk Google: medan borang yang menyebut google/emel; jika tiada, e-mel pembayar
export function pickEmail(custom, fallback) {
  const entries = Object.entries(custom || {}).map(([k, v]) => [k, String(v == null ? '' : v).trim().toLowerCase()]).filter(([, v]) => EMAIL_RE.test(v));
  const hit = entries.find(([k]) => /google|login|log ?masuk|akaun|sistem|e-?mel|email/i.test(k)) || entries[0];
  const v = hit ? hit[1] : String(fallback || '').trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : '';
}
export function pickBusiness(custom) {
  const e = Object.entries(custom || {}).find(([k, v]) => /syarikat|company|perniagaan|business|kedai/i.test(k) && String(v || '').trim());
  return e ? String(e[1]).trim().slice(0, 120) : '';
}
const qtyOf = (it) => Math.min(120, Math.max(1, parseInt(it.quantity, 10) || 1));
const nameOf = (it) => [it.item, it.name, it.option, it.sku, it.title].filter(Boolean).join(' ');
const priceOf = (it) => parseFloat(it.price != null ? it.price : it.unit_price != null ? it.unit_price : it.amount);
const packsOf = (env) => { try { const p = JSON.parse(env.PACKS || '{}'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } };
// Item → { months, credits }. Langganan: nama menyebut tahun (12) / bulan (1) × kuantiti. Kredit: nama menyebut kredit/credit;
// bilangan kredit daripada PACKS (harga → kredit), atau nombor dalam nama ("110 kredit"). Tiada padanan: ikut amaun.
export function planFromItems(items, amount, env, alt) {
  const sum = (list) => {
    let months = 0, credits = 0, known = false;
    for (const it of list || []) {
      const n = nameOf(it || {}), q = qtyOf(it || {});
      if (/kredit|credit/i.test(n)) {
        const packs = packsOf(env), p = priceOf(it);
        const c = (Number.isFinite(p) && packs[String(Math.round(p))]) || parseInt((n.match(/(\d+)\s*(kredit|credit)/i) || [])[1], 10) || 0;
        if (c) { credits += c * q; known = true; }
      } else if (/tahun|year|annual|12 ?bulan/i.test(n)) { months += 12 * q; known = true; }
      else if (/bulan|month/i.test(n)) { months += q; known = true; }
    }
    return known ? { months: Math.min(months, 120), credits } : null;
  };
  return sum(items) || sum(alt) || { months: parseFloat(amount) >= (parseFloat(env.YEARLY_MIN_AMOUNT) || 150) ? 12 : 1, credits: 0, guessed: true };
}

// BCL tidak menandatangani webhook: sentiasa ambil semula transaksi daripada API sebelum memberi apa-apa
export async function verifyOrder(env, order, fetchFn) {
  if (!env.BCL_API_TOKEN) return { paid: false, reason: 'tiada-token-api' };
  const base = String(env.BCL_API_URL || 'https://api.bcl.my/v1').replace(/\/$/, '');
  let res;
  try { res = await fetchFn(`${base}/transactions/${encodeURIComponent(order)}`, { headers: { authorization: 'Bearer ' + env.BCL_API_TOKEN, accept: 'application/json', 'user-agent': 'AnnurInvoice-Billing/1.0' } }); }
  catch (e) { return { paid: false, reason: 'api-bcl-gagal' }; }
  if (!res.ok) return { paid: false, reason: 'api-bcl-' + res.status };
  let j; try { j = await res.json(); } catch (e) { return { paid: false, reason: 'api-bcl-json' }; }
  const d = (j && j.data) || j || {}, t = d.main_data || d;
  const code = Number(t.status);
  const paid = code === 3 || t.is_paid === true || Number(t.is_paid) === 1 || /^(success|successful|approved|completed)$/i.test(String(t.status || ''));
  if (String(t.order_number || d.record_id || order) !== String(order)) return { paid: false, reason: 'pesanan-tidak-sepadan' };
  return { paid, amount: t.amount, subtotal: t.subtotal_amount, items: t.items, payer_email: t.payer_email, custom: d.custom_fields_data || t.custom_fields_data || null,
    test: t.transaction_type === 'test', formId: d.formable_id != null ? d.formable_id : d.form_id };
}

// Lanjut langganan dalam satu transaksi bersama rekod bayaran & kredit (PK order_no = idempoten)
async function applyPayment(env, o, info) {
  const db = env.DB, c = cfg(env), nowIso = new Date(o.now).toISOString(), t = todayMY(o.now);
  const { tenant } = await ensureTenant(db, info.email, c, nowIso);
  if (info.business && !tenant.business_name) await db.prepare('UPDATE tenants SET business_name = ? WHERE email = ?').bind(info.business, info.email).run();
  const stmts = [db.prepare('INSERT INTO payments (order_no, email, kind, item, months, credits, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(info.order, info.email, info.credits && !info.months ? 'kredit' : 'langganan', info.item.slice(0, 200), info.months || null, info.credits || null, info.amount, 'paid', nowIso)];
  let expires = null;
  if (info.months) {
    const cur = await db.prepare('SELECT plan, expires, day FROM subscriptions WHERE email = ?').bind(info.email).first();
    const active = cur && cur.expires >= t, base = active ? cur.expires : t;
    const day = active && cur.day ? cur.day : Number(base.slice(8));
    expires = addMonths(base, info.months, day);
    const plan = info.months >= 12 || (active && cur.plan === 'tahunan') ? 'tahunan' : 'bulanan';
    stmts.push(db.prepare('INSERT INTO subscriptions (email, plan, expires, day, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET plan = excluded.plan, expires = excluded.expires, day = excluded.day, updated_at = excluded.updated_at')
      .bind(info.email, plan, expires, day, nowIso));
  }
  if (info.credits) {
    stmts.push(db.prepare('UPDATE tenants SET credits = credits + ? WHERE email = ?').bind(info.credits, info.email));
    stmts.push(db.prepare("INSERT INTO credit_ledger (email, delta, reason, ref, balance_after, note, created_at) SELECT ?, ?, 'pack', ?, credits, ?, ? FROM tenants WHERE email = ?")
      .bind(info.email, info.credits, info.order, 'Pek kredit', nowIso, info.email));
  }
  try { await db.batch(stmts); }
  catch (e) {
    if (await db.prepare('SELECT 1 AS x FROM payments WHERE order_no = ?').bind(info.order).first()) return { ok: true, duplicate: true };
    throw e;
  }
  return { ok: true, email: info.email, months: info.months, credits: info.credits, expires };
}

// Proses satu pesanan (daripada webhook atau "sahkan pesanan" pemilik)
export async function processOrder(env, o, order, hint) {
  hint = hint || {};
  if (await env.DB.prepare('SELECT 1 AS x FROM payments WHERE order_no = ?').bind(order).first()) return { ok: true, duplicate: true };
  const v = await verifyOrder(env, order, o.fetch);
  if (!v.paid) return { ok: false, reason: v.reason || 'belum-dibayar' };
  if (v.test && env.BCL_ACCEPT_TEST !== '1') return { ok: true, ignored: 'transaksi-ujian' };
  if (env.BCL_FORM_ID && v.formId != null && String(v.formId) !== String(env.BCL_FORM_ID)) return { ok: true, ignored: 'borang-lain' };
  // jumlah dalam webhook mesti sama dengan API (webhook palsu dengan pesanan lain ditolak)
  if (hint.amount != null && v.amount != null && Math.abs(parseFloat(v.amount) - parseFloat(hint.amount)) > 0.009 &&
      !(v.subtotal != null && Math.abs(parseFloat(v.subtotal) - parseFloat(hint.amount)) < 0.01)) return { ok: false, reason: 'jumlah-tidak-sepadan' };
  const email = (hint.email && EMAIL_RE.test(hint.email) ? hint.email.toLowerCase() : '') || pickEmail(v.custom || hint.custom, v.payer_email || hint.payer_email);
  if (!email) return { ok: false, reason: 'tiada-emel' };
  const plan = planFromItems(v.items, v.subtotal != null ? v.subtotal : v.amount, env, hint.items);
  const item = (v.items || hint.items || []).map((it) => `${nameOf(it)} x${qtyOf(it)}`).join(', ') || (plan.guessed ? 'ikut amaun' : '');
  return applyPayment(env, o, { order, email, months: plan.months, credits: plan.credits, amount: parseFloat(v.amount) || 0, item, business: pickBusiness(v.custom || hint.custom) });
}

export async function processBcl(body, env, o) {
  const ev = String((body && body.event) || ''), d = (body && body.data) || {}, md = d.main_data || {};
  const order = String(md.order_number || d.record_id || '');
  if (ev !== 'payment-success') return { ok: true, ignored: ev || 'tiada-event' };
  if (!order) return { ok: false, reason: 'tiada-rekod' };
  if (md.transaction_type === 'test' && env.BCL_ACCEPT_TEST !== '1') return { ok: true, ignored: 'transaksi-ujian' };
  const formId = d.formable_id != null ? d.formable_id : d.form_id;
  if (env.BCL_FORM_ID && formId != null && String(formId) !== String(env.BCL_FORM_ID)) return { ok: true, ignored: 'borang-lain' };
  return processOrder(env, o, order, { amount: md.amount, custom: d.custom_fields_data, payer_email: md.payer_email, items: md.items });
}

const safeEqual = (a, b) => { a = String(a || ''); b = String(b || ''); if (!a || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function bclWebhook(req, env, deps, key) {
  if (!env.BCL_WEBHOOK_KEY || !safeEqual(key, env.BCL_WEBHOOK_KEY)) return json({ ok: false, error: 'tidak dijumpai' }, 404);
  if (req.method !== 'POST') return json({ ok: false, error: 'kaedah tidak disokong' }, 405);
  let body; try { body = JSON.parse(await req.text()); } catch (e) { return json({ ok: false, error: 'JSON tidak sah' }, 400); }
  const o = { now: deps.now(), fetch: deps.fetch };
  const order = String(((body.data || {}).main_data || {}).order_number || (body.data || {}).record_id || '');
  const work = processBcl(body, env, o).catch((e) => ({ ok: false, reason: 'ralat', message: String(e && e.message) })).then(async (r) => {
    try {
      await env.DB.prepare('INSERT INTO webhook_log (ts, order_no, ok, detail) VALUES (?, ?, ?, ?)').bind(new Date(o.now).toISOString(), order, r.ok ? 1 : 0, JSON.stringify(Object.assign({ event: body.event }, r)).slice(0, 2000)).run();
      await env.DB.prepare('DELETE FROM webhook_log WHERE ts < ?').bind(new Date(o.now - 90 * 864e5).toISOString()).run();
    } catch (e) { /* log gagal tidak menjejaskan bayaran */ }
    return r;
  });
  if (deps.waitUntil) { deps.waitUntil(work); return json({ ok: true, received: true }); }
  return json(await work);
}

// ---------- pengguna: bayaran sendiri ----------
async function myPayments(req, env, deps) {
  const email = await authEmail(req, env, deps.fetch);
  const r = await env.DB.prepare('SELECT order_no, kind, item, months, credits, amount, created_at FROM payments WHERE email = ? ORDER BY created_at DESC LIMIT 50').bind(email).all();
  return json({ ok: true, payments: r.results });
}

// ---------- pentadbir platform (R-03) ----------
async function adminAuth(req, env, deps) {
  const h = req.headers.get('authorization') || '';
  const tok = (h.match(/^Bearer\s+(\S+)$/i) || [])[1] || '';
  if (env.ADMIN_TOKEN && safeEqual(tok, env.ADMIN_TOKEN)) return 'admin-token';
  const email = await authEmail(req, env, deps.fetch);
  const owners = String(env.OWNER_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!owners.includes(email)) { const e = new Error('Akses ditolak'); e.status = 403; e.reason = 'bukan-pemilik'; throw e; }
  return email;
}
async function adminOverview(req, env, deps) {
  await adminAuth(req, env, deps);
  const db = env.DB, c = cfg(env), now = deps.now(), t = todayMY(now);
  const tenants = (await db.prepare(`SELECT t.email, t.business_name, t.credits, t.created_at, t.last_seen, s.plan, s.expires,
      (SELECT COUNT(*) FROM doc_issues d WHERE d.email = t.email) AS docs, (SELECT MAX(issued_at) FROM doc_issues d WHERE d.email = t.email) AS last_issue
      FROM tenants t LEFT JOIN subscriptions s ON s.email = t.email ORDER BY t.created_at DESC LIMIT 2000`).all()).results;
  tenants.forEach((x) => {
    const left = x.expires ? daysBetween(t, x.expires) : null;
    x.daysLeft = left;
    x.state = x.expires && left >= 0 ? 'langganan' : x.expires && left >= -c.graceDays ? 'ihsan' : x.expires ? 'tamat' : x.credits >= c.perDoc ? 'kredit' : 'habis';
  });
  const payments = (await db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 300').all()).results;
  const logs = (await db.prepare('SELECT * FROM webhook_log ORDER BY id DESC LIMIT 200').all()).results;
  const since30 = new Date(now - 30 * 864e5).toISOString(), since7 = new Date(now - 7 * 864e5).toISOString();
  const active = tenants.filter((x) => x.state === 'langganan' || x.state === 'ihsan');
  const priceM = parseFloat(env.PRICE_MONTH) || 20, priceY = parseFloat(env.PRICE_YEAR) || 200;
  const stats = {
    tenants: tenants.length, subscribed: active.length, creditOnly: tenants.filter((x) => x.state === 'kredit').length,
    mrr: Math.round(active.reduce((s, x) => s + (x.plan === 'tahunan' ? priceY / 12 : priceM), 0) * 100) / 100,
    revenue30: Math.round(payments.filter((p) => p.created_at >= since30).reduce((s, p) => s + (p.amount || 0), 0) * 100) / 100,
    docs30: (await db.prepare('SELECT COUNT(*) AS n FROM doc_issues WHERE issued_at >= ?').bind(since30).first('n')),
    failedWebhooks7: logs.filter((l) => !l.ok && l.ts >= since7).length,
    expiring14: tenants.filter((x) => x.state === 'langganan' && x.daysLeft <= 14).length
  };
  return json({ ok: true, today: t, stats, tenants, payments, logs });
}
async function adminSubscription(req, env, deps) {
  const by = await adminAuth(req, env, deps);
  const b = await readJson(req, 4096);
  const email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad('E-mel tidak sah');
  const db = env.DB, c = cfg(env), now = deps.now(), nowIso = new Date(now).toISOString(), t = todayMY(now);
  await ensureTenant(db, email, c, nowIso);
  const cur = await db.prepare('SELECT plan, expires, day FROM subscriptions WHERE email = ?').bind(email).first();
  let expires, day, plan = ['bulanan', 'tahunan', 'pilot'].includes(b.plan) ? b.plan : (cur && cur.plan) || 'bulanan';
  if (b.addMonths != null) {
    const n = Number(b.addMonths);
    if (!Number.isInteger(n) || n < 1 || n > 120) throw bad('addMonths mesti 1 hingga 120');
    const active = cur && cur.expires >= t, base = active ? cur.expires : t;
    day = active && cur.day ? cur.day : Number(base.slice(8));
    expires = addMonths(base, n, day);
    if (n >= 12 && !b.plan) plan = 'tahunan';
  } else if (b.expires) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.expires))) throw bad('expires mesti YYYY-MM-DD');
    expires = String(b.expires); day = Number(expires.slice(8));
  } else throw bad('Beri addMonths atau expires');
  await db.prepare('INSERT INTO subscriptions (email, plan, expires, day, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (email) DO UPDATE SET plan = excluded.plan, expires = excluded.expires, day = excluded.day, updated_at = excluded.updated_at')
    .bind(email, plan, expires, day, nowIso).run();
  await db.prepare('INSERT INTO webhook_log (ts, order_no, ok, detail) VALUES (?, ?, 1, ?)').bind(nowIso, 'admin', JSON.stringify({ admin: by, email, plan, expires })).run();
  return json({ ok: true, email, plan, expires });
}
async function adminCredits(req, env, deps) {
  const by = await adminAuth(req, env, deps);
  const b = await readJson(req, 4096);
  const email = String(b.email || '').trim().toLowerCase(), delta = Number(b.delta), note = String(b.note || '').trim().slice(0, 200);
  if (!EMAIL_RE.test(email)) throw bad('E-mel tidak sah');
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10000) throw bad('delta mesti integer bukan sifar (maks 10000)');
  if (note.length < 3) throw bad('Nyatakan sebab pelarasan');
  const db = env.DB, nowIso = new Date(deps.now()).toISOString();
  await ensureTenant(db, email, cfg(env), nowIso);
  const ref = 'adm-' + deps.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    await db.batch([db.prepare('UPDATE tenants SET credits = credits + ? WHERE email = ?').bind(delta, email),
      db.prepare("INSERT INTO credit_ledger (email, delta, reason, ref, balance_after, note, created_at) SELECT ?, ?, ?, ?, credits, ?, ? FROM tenants WHERE email = ?")
        .bind(email, delta, delta > 0 ? 'adjust' : 'refund', ref, note + ' (oleh ' + by + ')', nowIso, email)]);
  } catch (e) { if (/CHECK|constraint/i.test(String(e.message))) throw bad('Baki tidak boleh negatif'); throw e; }
  return json({ ok: true, email, credits: await db.prepare('SELECT credits FROM tenants WHERE email = ?').bind(email).first('credits') });
}
async function adminVerifyOrder(req, env, deps) {
  await adminAuth(req, env, deps);
  const b = await readJson(req, 2048);
  const order = String(b.order || '').trim();
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(order)) throw bad('No. pesanan tidak sah');
  const r = await processOrder(env, { now: deps.now(), fetch: deps.fetch }, order, { email: String(b.email || '').trim() });
  await env.DB.prepare('INSERT INTO webhook_log (ts, order_no, ok, detail) VALUES (?, ?, ?, ?)').bind(new Date(deps.now()).toISOString(), order, r.ok ? 1 : 0, JSON.stringify(Object.assign({ manual: true }, r))).run();
  return json(r, r.ok ? 200 : 422);
}

// ---------- penghala ----------
export async function handle(req, env, deps) {
  deps = Object.assign({ fetch: (...a) => fetch(...a), now: () => Date.now() }, deps || {});
  const url = new URL(req.url);
  const path = url.pathname;
  const isApi = path.startsWith('/api/') || path.startsWith('/bcl/');

  if (!isApi) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });

  const cors = corsHeaders(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!originOk(req, env)) return json({ ok: false, reason: 'asal-tidak-dibenarkan', error: 'Asal tidak dibenarkan' }, 403, cors);

  try {
    if (path === '/api/ping' && req.method === 'GET') {
      return json({ ok: true, app: APP, time: new Date(deps.now()).toISOString(), db: !!env.DB }, 200, cors);
    }
    if (path === '/api/check' && req.method === 'POST') {
      if (!env.DB) return json({ ok: false, reason: 'tiada-db', error: 'D1 belum disambung pada Worker' }, 500, cors);
      const res = await check(req, env, deps);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }
    if (path.startsWith('/bcl/')) {
      if (!env.DB) return json({ ok: false, reason: 'tiada-db' }, 500);
      return bclWebhook(req, env, deps, path.slice(5));
    }
    const routes = { 'POST /api/issue': issue, 'POST /api/void': voidDoc, 'GET /api/issues': listIssues, 'GET /api/ledger': ledger, 'GET /api/payments': myPayments,
      'GET /api/admin/overview': adminOverview, 'POST /api/admin/subscription': adminSubscription, 'POST /api/admin/credits': adminCredits, 'POST /api/admin/verify-order': adminVerifyOrder };
    const fn = routes[req.method + ' ' + path];
    if (fn) {
      if (!env.DB) return json({ ok: false, reason: 'tiada-db', error: 'D1 belum disambung pada Worker' }, 500, cors);
      const res = await fn(req, env, deps);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }
    return json({ ok: false, reason: 'tiada', error: 'Laluan tidak wujud' }, 404, cors);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(path, e && e.stack || e);
    return json({ ok: false, reason: e.reason || (status === 500 ? 'ralat' : 'gagal'), error: status === 500 ? 'Ralat pelayan' : e.message }, status, cors);
  }
}

export default {
  fetch: (req, env, ctx) => handle(req, env, { waitUntil: ctx && ctx.waitUntil ? (p) => ctx.waitUntil(p) : null })
};
