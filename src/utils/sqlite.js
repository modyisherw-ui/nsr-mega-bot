// ═══════════════════════════════════════════════════
//  🗄️ طبقة SQLite — محاكاة better-sqlite3 API
//  المحرك 1: node:sqlite (Node 22.5+ — بدون أي build)
//  المحرك 2: better-sqlite3 (احتياط لـ Node 18/20 — prebuilt)
//  يعمل في DisCloud على أي إصدار Node
// ═══════════════════════════════════════════════════

let DatabaseSync = null;
let driverName = 'none';

try {
  ({ DatabaseSync } = require('node:sqlite'));
  driverName = 'node:sqlite';
} catch {
  try {
    DatabaseSync = require('better-sqlite3');
    driverName = 'better-sqlite3';
  } catch {
    console.error('❌ لا يوجد محرك SQLite متاح. ثبّت better-sqlite3 أو استخدم Node 22.5+');
  }
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  #stmt() {
    return this.db.prepare(this.sql);
  }

  run(...args) {
    const out = this.#stmt().run(...args);
    return {
      changes: Number(out?.changes ?? 0),
      lastInsertRowid: Number(out?.lastInsertRowid ?? 0),
    };
  }

  get(...args) {
    return this.#stmt().get(...args) ?? null;
  }

  all(...args) {
    return this.#stmt().all(...args);
  }

  iterate(...args) {
    return this.all(...args)[Symbol.iterator]();
  }
}

class CompatDatabase {
  constructor(path) {
    this.db = new DatabaseSync(path);
  }

  pragma(sql) {
    try {
      this.db.exec(`PRAGMA ${sql.replace(/^pragma\s*/i, '')}`);
    } catch {
      try { this.db.exec(sql); } catch {}
    }
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  close() {
    this.db.close();
  }
}

module.exports = { CompatDatabase, driverName };
