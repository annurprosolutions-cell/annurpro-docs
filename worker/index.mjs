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
