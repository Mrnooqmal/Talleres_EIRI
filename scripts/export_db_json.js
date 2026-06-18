#!/usr/bin/env node
// Export all tables from the production SQLite backup to JSON
// Usage: node scripts/export_db_json.js [path-to-db]

const { createClient } = require('@libsql/client')
const fs = require('fs')
const path = require('path')

const dbPath = process.argv[2] || path.join(__dirname, '..', 'backups', 'eiri_prod.db')

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`)
  process.exit(1)
}

const client = createClient({ url: `file:${dbPath}` })

const TABLES = [
  'admin_users',
  'workshop_sessions',
  'projects',
  'assets',
  'site_config',
  'gallery',
  'rankings',
  'teams',
  'feedback',
  'activity_logs',
  'tutor_ips',
]

async function main() {
  const backup = {
    exported_at: new Date().toISOString(),
    source: dbPath,
    tables: {},
  }

  for (const table of TABLES) {
    try {
      const { rows } = await client.execute(`SELECT * FROM ${table}`)
      // For admin_users, redact password hashes
      const safe = table === 'admin_users'
        ? rows.map(r => ({ ...r, password_hash: '[REDACTED]' }))
        : rows
      backup.tables[table] = { count: rows.length, rows: safe }
      console.log(`  ✓ ${table}: ${rows.length} rows`)
    } catch (e) {
      console.log(`  ✗ ${table}: ${e.message}`)
      backup.tables[table] = { count: 0, rows: [], error: e.message }
    }
  }

  const outPath = path.join(__dirname, '..', 'backups', 'db_export.json')
  fs.writeFileSync(outPath, JSON.stringify(backup, null, 2))
  console.log(`\n✅ Exported to ${outPath}`)

  // Print summary
  console.log('\n── Summary ──')
  for (const [t, data] of Object.entries(backup.tables)) {
    console.log(`  ${t}: ${data.count} records`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
