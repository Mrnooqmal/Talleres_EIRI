#!/usr/bin/env node
// Import data from local SQLite backup to remote Turso DB
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/import_to_turso.js [path-to-db]
//
// This script:
//  1. Reads all data from the local SQLite backup
//  2. Creates the schema on Turso (same as server.js initDB)
//  3. Inserts all rows

require('dotenv').config()
const { createClient } = require('@libsql/client')
const fs = require('fs')
const path = require('path')

const localDbPath = process.argv[2] || path.join(__dirname, '..', 'backups', 'eiri_prod.db')

if (!fs.existsSync(localDbPath)) {
  console.error(`Local DB not found: ${localDbPath}`)
  process.exit(1)
}

if (!process.env.TURSO_DATABASE_URL) {
  console.error('Missing TURSO_DATABASE_URL env var')
  console.error('Usage: TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/import_to_turso.js')
  process.exit(1)
}

const local = createClient({ url: `file:${localDbPath}` })
const remote = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_super      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workshop_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  date_text     TEXT DEFAULT 'Por definir',
  status        TEXT DEFAULT 'upcoming',
  description   TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES workshop_sessions(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  tags          TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS assets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  label         TEXT NOT NULL,
  content       TEXT DEFAULT '',
  language      TEXT DEFAULT '',
  is_locked     INTEGER DEFAULT 0,
  display_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event      TEXT NOT NULL,
  detail     TEXT DEFAULT '',
  user       TEXT DEFAULT 'anon',
  ip         TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS gallery (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  type        TEXT DEFAULT 'image',
  caption     TEXT DEFAULT '',
  order_index INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rankings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     INTEGER,
  activity_label TEXT DEFAULT 'Actividad',
  team_name      TEXT NOT NULL,
  score          TEXT DEFAULT '',
  position       INTEGER NOT NULL,
  created_at     TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  logo       TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT DEFAULT '',
  message    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tutor_ips (
  ip         TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
`

// Tables in dependency order (parents before children)
const TABLES_ORDER = [
  { name: 'admin_users',      cols: ['id','username','password_hash','is_super','created_at'] },
  { name: 'workshop_sessions', cols: ['id','number','title','date_text','status','description','display_order','updated_at'] },
  { name: 'projects',          cols: ['id','session_id','title','description','tags','display_order'] },
  { name: 'assets',            cols: ['id','project_id','type','label','content','language','is_locked','display_order'] },
  { name: 'site_config',       cols: ['key','value'] },
  { name: 'gallery',           cols: ['id','title','url','type','caption','order_index','created_at'] },
  { name: 'rankings',          cols: ['id','session_id','activity_label','team_name','score','position','created_at'] },
  { name: 'teams',             cols: ['id','name','logo','created_at'] },
  { name: 'feedback',          cols: ['id','name','message','created_at'] },
  { name: 'activity_logs',     cols: ['id','event','detail','user','ip','created_at'] },
  { name: 'tutor_ips',         cols: ['ip','username','updated_at'] },
]

async function main() {
  console.log('📦 Creating schema on Turso...')
  await remote.executeMultiple(SCHEMA)
  console.log('  ✓ Schema created\n')

  for (const { name, cols } of TABLES_ORDER) {
    try {
      // Read from local
      const { rows } = await local.execute(`SELECT * FROM ${name}`)
      if (rows.length === 0) {
        console.log(`  ⏭  ${name}: 0 rows (skipped)`)
        continue
      }

      // Insert in batches of 20 (Turso has a transaction size limit)
      const BATCH = 20
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const stmts = batch.map(row => {
          const values = cols.map(c => row[c] !== undefined ? row[c] : null)
          const placeholders = cols.map(() => '?').join(',')
          return {
            sql: `INSERT OR REPLACE INTO ${name} (${cols.join(',')}) VALUES (${placeholders})`,
            args: values,
          }
        })
        await remote.batch(stmts)
        inserted += batch.length
      }
      console.log(`  ✓ ${name}: ${inserted} rows imported`)
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`)
    }
  }

  // Verify counts
  console.log('\n── Verification ──')
  for (const { name } of TABLES_ORDER) {
    try {
      const localCount = (await local.execute(`SELECT COUNT(*) as c FROM ${name}`)).rows[0].c
      const remoteCount = (await remote.execute(`SELECT COUNT(*) as c FROM ${name}`)).rows[0].c
      const match = localCount === remoteCount ? '✓' : '✗ MISMATCH'
      console.log(`  ${match} ${name}: local=${localCount} remote=${remoteCount}`)
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`)
    }
  }

  console.log('\n✅ Import complete!')
}

main().catch(e => { console.error(e); process.exit(1) })
