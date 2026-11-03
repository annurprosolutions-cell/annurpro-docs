CREATE TABLE IF NOT EXISTS tenants (
  email TEXT PRIMARY KEY,                 -- huruf kecil, daripada token Google yang disahkan
  business_name TEXT NOT NULL DEFAULT '',
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  created_at TEXT NOT NULL,
  last_seen TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  email TEXT PRIMARY KEY REFERENCES tenants(email),
  plan TEXT NOT NULL CHECK (plan IN ('bulanan','tahunan','pilot')),
  expires TEXT NOT NULL,                  -- YYYY-MM-DD
  day INTEGER NOT NULL,                   -- hari dalam bulan untuk tambat pembaharuan
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL REFERENCES tenants(email),
  delta INTEGER NOT NULL,                 -- +kredit / -kredit
  reason TEXT NOT NULL CHECK (reason IN ('trial','pack','issue','adjust','refund')),
  ref TEXT NOT NULL,                      -- 'trial', order_no, doc_id, atau id laras
  balance_after INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (email, reason, ref)             -- idempotensi: tiada potongan/penambahan berganda
);

CREATE TABLE IF NOT EXISTS counters (
  email TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('invoice','quotation','do')),
  prefix TEXT NOT NULL,
  period TEXT NOT NULL,                   -- 'MMYY'
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (email, doc_type, prefix, period)
);

CREATE TABLE IF NOT EXISTS doc_issues (
  doc_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES tenants(email),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('invoice','quotation','do')),
  number TEXT NOT NULL,
  period TEXT NOT NULL,
  seq INTEGER NOT NULL,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  issued_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  voided_at TEXT,
  UNIQUE (email, number)
);
CREATE INDEX IF NOT EXISTS idx_issues_email_time ON doc_issues (email, issued_at);

CREATE TABLE IF NOT EXISTS payments (
  order_no TEXT PRIMARY KEY,              -- idempotensi webhook
  email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('langganan','kredit')),
  item TEXT NOT NULL,
  months INTEGER,
  credits INTEGER,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  order_no TEXT,
  ok INTEGER NOT NULL,
  detail TEXT
);

-- had kadar (juga dicipta automatik oleh Worker jika tiada)
CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT NOT NULL,
  w INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (k, w)
);
