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
    const routes = { 'POST /api/issue': issue, 'POST /api/void': voidDoc, 'GET /api/issues': listIssues, 'GET /api/ledger': ledger };
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
