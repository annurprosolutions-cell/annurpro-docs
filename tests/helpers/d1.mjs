// D1 palsu atas node:sqlite untuk ujian. Menjalankan schema.sql sebenar.
// Meniru API D1 yang digunakan: prepare().bind().first()/all()/run(), dan batch() sebagai transaksi.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = fileURLToPath(new URL('../../schema.sql', import.meta.url));

class Stmt {
  constructor(db, sql, args) { this.db = db; this.sql = sql; this.args = args || []; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  _p() { return this.db.prepare(this.sql); }
  async first(col) { const r = this._p().get(...this.args); if (r === undefined) return null; return col ? r[col] : { ...r }; }
  async all() { return { results: this._p().all(...this.args).map((r) => ({ ...r })), success: true }; }
  async run() { const r = this._p().run(...this.args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  _sync() { return this._p().run(...this.args); }
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(SCHEMA, 'utf8'));
  let chain = Promise.resolve();
  const api = {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    // D1 batch: semua atau tiada. Disusun bersiri supaya transaksi tidak bertindih.
    batch: (stmts) => {
      const run = chain.then(() => {
        db.exec('BEGIN');
        try {
          const out = stmts.map((s) => { const r = s._sync(); return { success: true, meta: { changes: Number(r.changes) } }; });
          db.exec('COMMIT');
          return out;
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      });
      chain = run.catch(() => {});
      return run;
    }
  };
  return api;
}
