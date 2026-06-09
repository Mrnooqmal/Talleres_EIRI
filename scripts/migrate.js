#!/usr/bin/env node
// One-time migration script: transforms server.js from node:sqlite sync → lib/db.js async + JWT auth
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'server.js')
let code = fs.readFileSync(file, 'utf8')

// 1. Replace imports
code = code.replace(
  /const session\s*=\s*require\('express-session'\)\n/,
  "const cookieParser    = require('cookie-parser')\nconst jwt             = require('jsonwebtoken')\n"
)
code = code.replace(
  /const \{ DatabaseSync \} = require\('node:sqlite'\)\n/,
  ''
)

// 2. Replace DB init
code = code.replace(
  /const app = express\(\)\nconst db  = new DatabaseSync\(path\.join\(__dirname, 'eiri\.db'\)\)\ndb\.exec\('PRAGMA journal_mode = WAL'\)\ndb\.exec\('PRAGMA foreign_keys = ON'\)/,
  `const app = express()
const db  = require('./lib/db')`
)

// 3. Replace session middleware with cookie-parser + JWT helpers
code = code.replace(
  /app\.use\(session\(\{[\s\S]*?\}\)\)/,
  `app.use(cookieParser())

// ─── JWT Auth ────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || 'eiri-dev-jwt-secret'
const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 24*60*60*1000, path: '/' }

function signAuth(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.cookie('auth', token, COOKIE_OPTS)
  return token
}

function getAuth(req) {
  try { return jwt.verify(req.cookies?.auth || '', JWT_SECRET) } catch { return null }
}

// Attach auth to every request
app.use((req, _res, next) => { req.auth = getAuth(req); next() })`
)

// 4. Replace schema db.exec with async init
code = code.replace(
  /\/\/ ─── Schema ──────[\s\S]*?\/\/ ─── Helpers/,
  `// ─── Init (async: schema + seeds + migrations) ─────
async function initDB() {
  // PRAGMAs (solo archivo local)
  if (!process.env.TURSO_DATABASE_URL) {
    try { await db.run('PRAGMA journal_mode = WAL') } catch {}
    try { await db.run('PRAGMA foreign_keys = ON') } catch {}
  }

  await db.execMultiple(\`
  CREATE TABLE IF NOT EXISTS admin_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
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
  \`)

  // Migrations
  try { await db.run("ALTER TABLE projects ADD COLUMN tags TEXT DEFAULT ''") } catch {}
  try { await db.run("ALTER TABLE admin_users ADD COLUMN is_super INTEGER DEFAULT 0") } catch {}

  // Seed admin user
  const hasUsers = await db.get('SELECT 1 FROM admin_users LIMIT 1')
  if (!hasUsers) {
    const bcrypt = require('bcryptjs')
    await db.run('INSERT INTO admin_users (username, password_hash, is_super) VALUES (?,?,1)',
      'admin', bcrypt.hashSync('eiri2026', 10))
  }

  // Ensure at least one super admin
  const hasSuper = await db.get('SELECT 1 FROM admin_users WHERE is_super=1 LIMIT 1')
  if (!hasSuper) {
    const first = await db.get("SELECT id FROM admin_users WHERE username='admin'")
               || await db.get('SELECT id FROM admin_users ORDER BY id LIMIT 1')
    if (first) await db.run('UPDATE admin_users SET is_super=1 WHERE id=?', first.id)
  }

  // Migrate tutor IPs
  try {
    await db.run(\`INSERT OR REPLACE INTO tutor_ips (ip, username)
      SELECT ip, user FROM activity_logs
      WHERE event = 'admin_login' AND ip != '' AND user != 'anon'
      GROUP BY ip HAVING created_at = MAX(created_at)\`)
    await db.run(\`UPDATE activity_logs
      SET user = (SELECT username FROM tutor_ips WHERE tutor_ips.ip = activity_logs.ip)
      WHERE user = 'anon' AND ip != ''
        AND EXISTS (SELECT 1 FROM tutor_ips WHERE tutor_ips.ip = activity_logs.ip)\`)
  } catch (e) { console.error('IP migration:', e.message) }

  // Config defaults
  const configDefaults = {
    site_title: 'EIRI Talleres de Robótica', subtitle: 'Battlebots 2026',
    hero_description: 'Construye, programa y combate. Aprende electrónica, mecánica y código mientras diseñas tu propio robot de batalla.',
    year: '2026', contact: '',
    about_description: 'El Equipo Interdisciplinario de Robótica e Innovación de la Universidad del Desarrollo organiza talleres para estudiantes apasionados por la tecnología, la ingeniería y el diseño.',
    social_instagram: '', social_github: '', social_email: '', social_discord: '',
  }
  for (const [k, v] of Object.entries(configDefaults)) {
    await db.run('INSERT OR IGNORE INTO site_config (key, value) VALUES (?,?)', k, v)
  }

  // Seed sessions
  const hasSessions = await db.get('SELECT 1 FROM workshop_sessions LIMIT 1')
  if (!hasSessions) {
    const seeds = [[1,'Introducción a Battlebots'],[2,'Electrónica Básica'],[3,'Programación del Robot'],[4,'Diseño Mecánico'],[5,'Construcción y Pruebas'],[6,'La Batalla Final']]
    for (const [n, t] of seeds) await db.run('INSERT INTO workshop_sessions (number, title, display_order) VALUES (?,?,?)', n, t, n)
  }
}

// ─── Helpers`
)

// 5. Remove the old seeds/config/migrations block (already in initDB)
code = code.replace(
  /\/\/ ─── Seeds ───────[\s\S]*?for \(const \[n, t\] of seeds\) ins\.run\(n, t, n\)\n\}/,
  ''
)

// 6. Replace helpers: getConfig, log, requireAdmin, requireSuper
code = code.replace(
  /function getConfig\(\) \{[\s\S]*?return Object\.fromEntries\(\s*db\.prepare\('SELECT key, value FROM site_config'\)\.all\(\)\.map\(r => \[r\.key, r\.value\]\)\s*\)\s*\}/,
  `async function getConfig() {
  const rows = await db.all('SELECT key, value FROM site_config')
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}`
)

code = code.replace(
  /function log\(req, event, detail = ''\) \{[\s\S]*?\.run\(event, detail, user, ip\)\s*\}/,
  `async function log(req, event, detail = '') {
  let user = req.auth?.adminUser || 'anon'
  const ip = req.ip || ''
  if (user === 'anon' && ip) {
    const known = await db.get('SELECT username FROM tutor_ips WHERE ip=?', ip)
    if (known) user = known.username
  }
  await db.run('INSERT INTO activity_logs (event, detail, user, ip) VALUES (?,?,?,?)', event, detail, user, ip)
}`
)

code = code.replace(
  /function requireAdmin\(req, res, next\) \{\s*if \(!req\.session\.adminId\)[^}]*\}/,
  `function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'No autorizado' })
  next()
}`
)

code = code.replace(
  /function requireSuper\(req, res, next\) \{[\s\S]*?next\(\)\s*\}/,
  `function requireSuper(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'No autorizado' })
  if (!req.auth.adminSuper) return res.status(403).json({ error: 'Solo el administrador principal puede gestionar cuentas' })
  next()
}`
)

// 7. Make ALL route handlers async and replace db.prepare().xxx with await db.xxx
// This is the bulk transformation

// Pattern: db.prepare('SQL').all(args) → await db.all('SQL', args)
code = code.replace(/db\.prepare\(([^)]+)\)\.all\(([^)]*)\)/g, (_, sql, args) => {
  return args ? `await db.all(${sql}, ${args})` : `await db.all(${sql})`
})

// Pattern: db.prepare('SQL').get(args) → await db.get('SQL', args)
code = code.replace(/db\.prepare\(([^)]+)\)\.get\(([^)]*)\)/g, (_, sql, args) => {
  return args ? `await db.get(${sql}, ${args})` : `await db.get(${sql})`
})

// Pattern: db.prepare('SQL').run(args) → await db.run('SQL', args)
code = code.replace(/db\.prepare\(([^)]+)\)\.run\(([^)]*)\)/g, (_, sql, args) => {
  return args ? `await db.run(${sql}, ${args})` : `await db.run(${sql})`
})

// Pattern: db.exec('SQL') → await db.run('SQL')  (single statements left over)
code = code.replace(/db\.exec\(([^)]+)\)/g, 'await db.run($1)')

// 8. Make all route callbacks async (only non-async ones)
code = code.replace(/\(req, res\) => \{/g, 'async (req, res) => {')
code = code.replace(/\(req, res, next\) => \{/g, 'async (req, res, next) => {')
// Fix double-async
code = code.replace(/async async/g, 'async')

// 9. Replace session references with JWT auth
// Login
code = code.replace(
  /req\.session\.adminId\s*=\s*user\.id\s*\n\s*req\.session\.adminUser\s*=\s*user\.username\s*\n\s*req\.session\.adminSuper\s*=\s*!!user\.is_super/,
  `signAuth(res, { adminId: user.id, adminUser: user.username, adminSuper: !!user.is_super })`
)

// Logout
code = code.replace(
  /req\.session\.destroy\(\(\) => res\.json\(\{ ok: true \}\)\)/,
  `res.clearCookie('auth', COOKIE_OPTS); res.json({ ok: true })`
)

// /api/admin/me
code = code.replace(
  /req\.session\.adminId\s*\n\s*\? res\.json\(\{ logged_in: true, username: req\.session\.adminUser, is_super: !!req\.session\.adminSuper \}\)/,
  `req.auth
    ? res.json({ logged_in: true, username: req.auth.adminUser, is_super: !!req.auth.adminSuper })`
)

// Admin page routes
code = code.replace(
  /if \(req\.session\.adminId\) return res\.redirect\('\/admin'\)/,
  `if (req.auth) return res.redirect('/admin')`
)
code = code.replace(
  /if \(!req\.session\.adminId\) return res\.redirect\('\/admin\/login'\)\s*\n\s*res\.render\('admin\.html', \{ username: req\.session\.adminUser \}\)/,
  `if (!req.auth) return res.redirect('/admin/login')
  res.render('admin.html', { username: req.auth.adminUser })`
)

// Password change: req.session.adminId → req.auth.adminId
code = code.replace(/req\.session\.adminId/g, 'req.auth.adminId')
code = code.replace(/req\.session\.adminUser/g, 'req.auth.adminUser')
code = code.replace(/req\.session\.adminSuper/g, 'req.auth.adminSuper')

// Tutor rename: update JWT if self
code = code.replace(
  /if \(id === req\.auth\.adminId\) req\.auth\.adminUser = username/,
  `if (id === req.auth.adminId) signAuth(res, { ...req.auth, adminUser: username })`
)

// Make super: update JWT if self
code = code.replace(
  /if \(id === req\.auth\.adminId\) req\.auth\.adminSuper = true/,
  `if (id === req.auth.adminId) signAuth(res, { ...req.auth, adminSuper: true })`
)

// 10. Fix lastInsertRowid — const r = await db.run returns { lastInsertRowid }
// Already works since db.run returns { lastInsertRowid: Number(...) }

// 11. Replace the server start to await initDB first + export for Vercel
code = code.replace(
  /\/\/ ─── Start ───────[\s\S]*$/,
  `// ─── Start ───────────────────────────────────────────

const PORT = parseInt(process.env.PORT) || 3000

initDB().then(() => {
  if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(\`EIRI running on :\${PORT}\`))
  }
}).catch(err => {
  console.error('Init failed:', err)
  process.exit(1)
})

module.exports = app
`
)

// 12. Add await before log() calls (log is now async)
code = code.replace(/(\s+)log\(req,/g, '$1await log(req,')
// Fix double-await
code = code.replace(/await await/g, 'await')

// 13. Wrap route handlers that use await but aren't async yet (safety pass)
// Already handled above

fs.writeFileSync(file, code, 'utf8')
console.log('✅ server.js migrated successfully!')
console.log('Changes:')
console.log('  - node:sqlite → lib/db.js (@libsql/client)')
console.log('  - express-session → JWT in httpOnly cookies')
console.log('  - All DB calls now async/await')
console.log('  - Init wrapped in async initDB()')
console.log('  - module.exports = app (for Vercel)')
