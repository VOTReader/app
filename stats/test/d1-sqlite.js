/* A D1-shaped adapter over Node's built-in SQLite, so the Worker's real SQL runs in
   the repo's own vitest (no workerd, no extra dependency). Covers the calls the
   Worker makes: prepare().bind().run()/all()/first() and batch(). */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  run() {
    const r = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  all() { return { success: true, results: this.db.prepare(this.sql).all(...this.args) }; }
  first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = dirname(fileURLToPath(import.meta.url));
  db.exec(readFileSync(join(dir, '..', 'migrations', '0001_init.sql'), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    batch: (stmts) => {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
