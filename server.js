require('dotenv').config()

const express          = require('express')
const compression      = require('compression')
const cookieParser    = require('cookie-parser')
const jwt             = require('jsonwebtoken')
const bcrypt           = require('bcryptjs')
const nunjucks         = require('nunjucks')
const multer           = require('multer')
const path             = require('path')
const fs               = require('fs')
const crypto           = require('crypto')

const app = express()
const db  = require('./lib/db')

nunjucks.configure(path.join(__dirname, 'templates'), { autoescape: true, express: app })

// Almacenamiento de archivos: S3 si esta configurado, disco local en desarrollo
const S3_BUCKET     = process.env.S3_BUCKET || ''
const S3_REGION     = process.env.AWS_REGION || 'sa-east-1'
const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '')
const ALLOWED_FILES = /\.(png|jpg|jpeg|gif|webp|svg|pdf|ino|c|cpp|h|hpp|py|js|ts|json|txt|md|csv)$/i

const uploadsDir = path.join(__dirname, 'static', 'uploads')
// Solo se usa disco local cuando NO hay S3 (en produccion las subidas van a S3)
if (!S3_BUCKET && !fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const fileFilter = (_, file, cb) => cb(null, ALLOWED_FILES.test(file.originalname))
const uploadLimits = { fileSize: 25 * 1024 * 1024 }
const newKey = (file) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`

let s3Client = null
let upload
if (S3_BUCKET) {
  const { S3Client } = require('@aws-sdk/client-s3')
  s3Client = new S3Client({ region: S3_REGION })
  upload = multer({ storage: multer.memoryStorage(), limits: uploadLimits, fileFilter })
} else {
  upload = multer({
    storage: multer.diskStorage({
      destination: (_, __, cb) => cb(null, uploadsDir),
      filename:    (_, file, cb) => cb(null, newKey(file)),
    }),
    limits: uploadLimits,
    fileFilter,
  })
}

// Sube el buffer a S3 y devuelve la URL publica (CloudFront si esta definido)
async function putToS3(file) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3')
  const key = `uploads/${newKey(file)}`
  await s3Client.send(new PutObjectCommand({
    Bucket:      S3_BUCKET,
    Key:         key,
    Body:        file.buffer,
    ContentType: file.mimetype,
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return S3_PUBLIC_URL
    ? `${S3_PUBLIC_URL}/${key}`
    : `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`
}

app.set('trust proxy', 1)
app.use(compression())
app.use(express.json())
app.use('/static', express.static(path.join(__dirname, 'static'), {
  maxAge: '7d',
  immutable: false,
  etag: true,
  lastModified: true,
}))
app.use(cookieParser())

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
app.use((req, _res, next) => { req.auth = getAuth(req); next() })

// ─── Init (async: schema + seeds + migrations) ─────
async function initDB() {
  // PRAGMAs (solo archivo local)
  if (!process.env.TURSO_DATABASE_URL) {
    try { await db.run('PRAGMA journal_mode = WAL') } catch {}
    try { await db.run('PRAGMA foreign_keys = ON') } catch {}
  }

  await db.execMultiple(`
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
  `)

  // Migrations
  try { await db.run("ALTER TABLE projects ADD COLUMN tags TEXT DEFAULT ''") } catch {}
  try { await db.run("ALTER TABLE admin_users ADD COLUMN is_super INTEGER DEFAULT 0") } catch {}
  try { await db.run("ALTER TABLE teams ADD COLUMN logo TEXT DEFAULT ''") } catch {}

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
    await db.run(`INSERT OR REPLACE INTO tutor_ips (ip, username)
      SELECT ip, user FROM activity_logs
      WHERE event = 'admin_login' AND ip != '' AND user != 'anon'
      GROUP BY ip HAVING created_at = MAX(created_at)`)
    await db.run(`UPDATE activity_logs
      SET user = (SELECT username FROM tutor_ips WHERE tutor_ips.ip = activity_logs.ip)
      WHERE user = 'anon' AND ip != ''
        AND EXISTS (SELECT 1 FROM tutor_ips WHERE tutor_ips.ip = activity_logs.ip)`)
  } catch (e) { console.error('IP migration:', e.message) }

  // Config defaults
  const configDefaults = {
    site_title: 'EIRI Talleres de Robótica', subtitle: 'Battlebots 2026',
    hero_description: 'Construye, programa y combate. Aprende electrónica, mecánica y código mientras diseñas tu propio robot de batalla.',
    year: '2026', contact: '',
    about_description: 'El Equipo Interdisciplinario de Robótica e Innovación de la Universidad del Desarrollo organiza talleres para estudiantes apasionados por la tecnología, la ingeniería y el diseño.',
    stat_sessions: '6', stat_participants: '30', stat_robots: '8',
    social_instagram: '', social_github: '', social_email: '', social_discord: '',
    bracket_title: 'Llave del torneo',
    bracket_subtitle: 'El camino hacia la corona Battlebots',
    // Estructura del bracket de eliminación simple. Se regenera al cambiar el tamaño.
    // { size, rounds: [ [ {a,b,scoreA,scoreB,winner}, ... ], ... ] }
    bracket_data: JSON.stringify({ size: 8, rounds: emptyBracketRounds(8) }),
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

// ─── Helpers ─────────────────────────────────────────

async function getConfig() {
  const rows = await db.all('SELECT key, value FROM site_config')
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

async function log(req, event, detail = '') {
  let user = req.auth?.adminUser || 'anon'
  const ip = req.ip || ''
  if (user === 'anon' && ip) {
    const known = await db.get('SELECT username FROM tutor_ips WHERE ip=?', ip)
    if (known) user = known.username
  }
  await db.run('INSERT INTO activity_logs (event, detail, user, ip) VALUES (?,?,?,?)', event, detail, user, ip)
}

function requireAdmin(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'No autorizado' })
  next()
}

function requireSuper(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'No autorizado' })
  if (!req.auth.adminSuper) return res.status(403).json({ error: 'Solo el administrador principal puede gestionar cuentas' })
  next()
}

// ─── Bracket helpers ─────────────────────────────────
const BRACKET_SIZES = [4, 8, 16]

// Crea las rondas vacías de un bracket de eliminación simple para `size` equipos.
// Ronda 0 = primera ronda (size/2 partidos); última ronda = final (1 partido).
function emptyBracketRounds(size) {
  const rounds = []
  let matches = size / 2
  while (matches >= 1) {
    rounds.push(Array.from({ length: matches }, () => ({ a: null, b: null, scoreA: '', scoreB: '', winner: null })))
    matches = Math.floor(matches / 2)
  }
  return rounds
}

// Propaga los ganadores: el ganador del partido i de la ronda r ocupa el slot
// (a si i es par, b si impar) del partido floor(i/2) de la ronda r+1.
function resolveBracket(bracket) {
  const rounds = bracket.rounds || []
  for (let r = 0; r < rounds.length - 1; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const m = rounds[r][i]
      const winnerTeam = m.winner === 'a' ? m.a : m.winner === 'b' ? m.b : null
      const next = rounds[r + 1][Math.floor(i / 2)]
      if (!next) continue
      if (i % 2 === 0) next.a = winnerTeam
      else            next.b = winnerTeam
    }
  }
  return bracket
}

// Normaliza/valida un bracket entrante desde el admin.
function sanitizeBracket(raw) {
  let size = parseInt(raw?.size, 10)
  if (!BRACKET_SIZES.includes(size)) size = 8
  const base = emptyBracketRounds(size)
  const inRounds = Array.isArray(raw?.rounds) ? raw.rounds : []
  for (let r = 0; r < base.length; r++) {
    for (let i = 0; i < base[r].length; i++) {
      const src = inRounds[r]?.[i] || {}
      const m = base[r][i]
      // Solo la primera ronda acepta asignación directa de equipos; el resto se propaga.
      if (r === 0) {
        m.a = src.a != null ? parseInt(src.a, 10) : null
        m.b = src.b != null ? parseInt(src.b, 10) : null
      }
      m.scoreA = String(src.scoreA ?? '').slice(0, 6)
      m.scoreB = String(src.scoreB ?? '').slice(0, 6)
      m.winner = src.winner === 'a' || src.winner === 'b' ? src.winner : null
    }
  }
  return resolveBracket({ size, rounds: base })
}

// ─── Pages ───────────────────────────────────────────

app.get('/', async (req, res) => res.render('index.html', { config: await getConfig() }))
app.get('/galeria', async (req, res) => res.render('galeria.html', { config: await getConfig() }))

// Serializa a JSON seguro para incrustar dentro de un bloque <script>.
// Sin esto, un asset que contenga "</script>", "<!--" o separadores unicode
// cierra el script antes de tiempo y vuelca HTML crudo en la página.
function jsonForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

const SES_TYPE_LABELS = { code: 'Código', slides: 'Presentación', diagram: 'Imágenes', video: 'Video', markdown: 'Notas', link: 'Enlace', model3d: 'Modelo 3D' }
const SES_TYPE_ICONS  = { code: 'code-2', slides: 'file-text', diagram: 'image', video: 'play-circle', markdown: 'align-left', link: 'link-2', model3d: 'package' }

app.get('/sesiones/:id', async (req, res) => {
  const session = await db.get('SELECT * FROM workshop_sessions WHERE id=?', req.params.id)
  if (!session) return res.status(404).send('Sesión no encontrada')
  const projects = await db.all('SELECT * FROM projects WHERE session_id=? ORDER BY display_order', session.id)
  for (const p of projects) {
    p.assets    = await db.all('SELECT * FROM assets WHERE project_id=? AND is_locked=0 ORDER BY display_order', p.id)
    p.locked    = await db.all('SELECT * FROM assets WHERE project_id=? AND is_locked=1 ORDER BY display_order', p.id)
    p.tags_list = p.tags ? p.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    p.asset_count = p.assets.length + p.locked.length
    // Agrupar tipos para el índice del sidebar
    const typeSeen = [], typeCounts = {}
    for (const a of p.assets) {
      if (!typeCounts[a.type]) typeSeen.push(a.type)
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
    }
    p.type_summary = typeSeen.map(type => ({
      type, count: typeCounts[type],
      icon:  SES_TYPE_ICONS[type]  || 'file',
      label: SES_TYPE_LABELS[type] || type,
      anchor: `project-${p.id}-${type}`,
    }))
    if (p.locked.length) p.type_summary.push({ type: 'locked', count: p.locked.length, icon: 'lock', label: 'Bloqueado', anchor: `project-${p.id}-locked` })
  }
  session.projects   = projects
  session.num_padded = String(session.number).padStart(2, '0')
  await log(req, 'view_session', session.id)
  res.render('sesion.html', {
    config: await getConfig(),
    session,
    // JSON serializado de forma segura para incrustar dentro de <script>:
    // escapamos las secuencias que cerrarían el tag o iniciarían un comentario HTML.
    projects_json: jsonForScript(projects),
  })
})

app.get('/admin/login', async (req, res) => {
  if (req.auth) return res.redirect('/admin')
  res.render('admin_login.html')
})

app.get(['/admin', '/admin/*'], async (req, res) => {
  if (!req.auth) return res.redirect('/admin/login')
  res.render('admin.html', { username: req.auth.adminUser })
})

// Upload (S3 o disco local segun configuracion)

app.post('/api/admin/upload', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sin archivo o tipo no permitido' })
  try {
    const url = S3_BUCKET
      ? await putToS3(req.file)
      : `/static/uploads/${req.file.filename}`
    await log(req, 'upload_file', req.file.originalname)
    res.json({ url, name: req.file.originalname })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: 'No se pudo subir el archivo' })
  }
})

// ─── Public API ──────────────────────────────────────

app.get('/api/config', async (req, res) => res.json(await getConfig()))

app.get('/api/sessions', async (req, res) => {
  const sessions = await db.all(
    'SELECT * FROM workshop_sessions ORDER BY display_order, number'
  )
  for (const s of sessions) {
    const projects = await db.all(
      'SELECT * FROM projects WHERE session_id=? ORDER BY display_order'
    , s.id)
    for (const p of projects) {
      p.assets = await db.all(
        'SELECT * FROM assets WHERE project_id=? ORDER BY display_order'
      , p.id)
    }
    s.projects = projects
  }
  await log(req, 'view_sessions')
  res.json(sessions)
})

// ─── Auth ────────────────────────────────────────────

app.post('/api/admin/login', async (req, res) => {
  const { username = '', password = '' } = req.body
  const user = await db.get('SELECT * FROM admin_users WHERE username=?', username)
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    signAuth(res, { adminId: user.id, adminUser: user.username, adminSuper: !!user.is_super })
    const loginIp = req.ip || ''
    if (loginIp) {
      await db.run('INSERT OR REPLACE INTO tutor_ips (ip, username) VALUES (?,?)', loginIp, user.username)
    }
    await log(req, 'admin_login')
    return res.json({ ok: true, username: user.username, is_super: !!user.is_super })
  }
  await log(req, 'login_failed', username)
  res.status(401).json({ error: 'Credenciales incorrectas' })
})

app.post('/api/admin/logout', async (req, res) => {
  await log(req, 'admin_logout')
  res.clearCookie('auth', COOKIE_OPTS); res.json({ ok: true })
})

app.get('/api/admin/me', async (req, res) => {
  req.auth
    ? res.json({ logged_in: true, username: req.auth.adminUser, is_super: !!req.auth.adminSuper })
    : res.json({ logged_in: false })
})

// Cambio de contraseña desde el login, sin sesión: valida credenciales actuales
app.post('/api/admin/change-password', async (req, res) => {
  const { username = '', current = '', new: newPw = '' } = req.body
  const user = await db.get('SELECT * FROM admin_users WHERE username=?', username)
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'Usuario o contraseña actual incorrectos' })
  }
  if (newPw.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
  await db.run('UPDATE admin_users SET password_hash=? WHERE id=?', bcrypt.hashSync(newPw, 10), user.id)
  await log(req, 'change_password_login', username)
  res.json({ ok: true })
})

// ─── Sessions CRUD ───────────────────────────────────

app.get('/api/admin/sessions', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM workshop_sessions ORDER BY display_order, number'))
})

app.post('/api/admin/sessions', requireAdmin, async (req, res) => {
  const { number, title, date_text = 'Por definir', status = 'upcoming', description = '', display_order } = req.body
  const r = await db.run('INSERT INTO workshop_sessions (number,title,date_text,status,description,display_order) VALUES (?,?,?,?,?,?)', number, title, date_text, status, description, display_order ?? number)
  await log(req, 'create_session', `${r.lastInsertRowid}:${title}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/sessions/:id', requireAdmin, async (req, res) => {
  const { number, title, date_text = 'Por definir', status = 'upcoming', description = '', display_order } = req.body
  await db.run("UPDATE workshop_sessions SET number=?,title=?,date_text=?,status=?,description=?,display_order=?,updated_at=datetime('now') WHERE id=?", number, title, date_text, status, description, display_order ?? number, req.params.id)
  await log(req, 'update_session', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/sessions/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM workshop_sessions WHERE id=?', req.params.id)
  await log(req, 'delete_session', req.params.id)
  res.json({ ok: true })
})

app.patch('/api/admin/sessions/reorder', requireAdmin, async (req, res) => {
  for (const { id, display_order } of (req.body || [])) {
    await db.run('UPDATE workshop_sessions SET display_order=? WHERE id=?', display_order, id)
  }
  res.json({ ok: true })
})

app.patch('/api/admin/sessions/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body
  await db.run("UPDATE workshop_sessions SET status=?,updated_at=datetime('now') WHERE id=?", status, req.params.id)
  await log(req, 'update_session_status', req.params.id)
  res.json({ ok: true })
})

// ─── Projects CRUD ───────────────────────────────────

app.get('/api/admin/projects', requireAdmin, async (req, res) => {
  const { session_id } = req.query
  const rows = session_id
    ? await db.all('SELECT * FROM projects WHERE session_id=? ORDER BY display_order', session_id)
    : await db.all('SELECT * FROM projects ORDER BY display_order')
  res.json(rows)
})

app.post('/api/admin/projects', requireAdmin, async (req, res) => {
  const { session_id, title, description = '', tags = '', display_order = 0 } = req.body
  const r = await db.run('INSERT INTO projects (session_id,title,description,tags,display_order) VALUES (?,?,?,?,?)', session_id, title, description, tags, display_order)
  await log(req, 'create_project', `${r.lastInsertRowid}:${title}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  const { title, description = '', tags = '', display_order = 0 } = req.body
  await db.run('UPDATE projects SET title=?,description=?,tags=?,display_order=? WHERE id=?', title, description, tags, display_order, req.params.id)
  await log(req, 'update_project', req.params.id)
  res.json({ ok: true })
})

app.patch('/api/admin/projects/reorder', requireAdmin, async (req, res) => {
  for (const { id, display_order } of (req.body || [])) {
    await db.run('UPDATE projects SET display_order=? WHERE id=?', display_order, id)
  }
  res.json({ ok: true })
})

app.delete('/api/admin/projects/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM projects WHERE id=?', req.params.id)
  await log(req, 'delete_project', req.params.id)
  res.json({ ok: true })
})

// ─── Assets CRUD ─────────────────────────────────────

app.get('/api/admin/assets', requireAdmin, async (req, res) => {
  const { project_id } = req.query
  const rows = project_id
    ? await db.all('SELECT * FROM assets WHERE project_id=? ORDER BY display_order', project_id)
    : await db.all('SELECT * FROM assets ORDER BY display_order')
  res.json(rows)
})

app.post('/api/admin/assets', requireAdmin, async (req, res) => {
  const { project_id, type, label, content = '', language = '', is_locked = false, display_order = 0 } = req.body
  const r = await db.run('INSERT INTO assets (project_id,type,label,content,language,is_locked,display_order) VALUES (?,?,?,?,?,?,?)', project_id, type, label, content, language, is_locked ? 1 : 0, display_order)
  await log(req, 'create_asset', `${r.lastInsertRowid}:${label}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/assets/:id', requireAdmin, async (req, res) => {
  const { type, label, content = '', language = '', is_locked = false, display_order = 0 } = req.body
  await db.run('UPDATE assets SET type=?,label=?,content=?,language=?,is_locked=?,display_order=? WHERE id=?', type, label, content, language, is_locked ? 1 : 0, display_order, req.params.id)
  await log(req, 'update_asset', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/assets/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM assets WHERE id=?', req.params.id)
  await log(req, 'delete_asset', req.params.id)
  res.json({ ok: true })
})

// ─── Config ──────────────────────────────────────────

app.put('/api/admin/config', requireAdmin, async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) await db.run('INSERT OR REPLACE INTO site_config (key, value) VALUES (?,?)', k, String(v))
  await log(req, 'update_config')
  res.json({ ok: true })
})

// ─── Password ────────────────────────────────────────

app.put('/api/admin/password', requireAdmin, async (req, res) => {
  const { current, new: newPw } = req.body
  const user = await db.get('SELECT * FROM admin_users WHERE id=?', req.auth.adminId)
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'Contraseña actual incorrecta' })
  }
  await db.run('UPDATE admin_users SET password_hash=? WHERE id=?', bcrypt.hashSync(newPw, 10), req.auth.adminId)
  await log(req, 'change_password')
  res.json({ ok: true })
})

// ─── Tutores ─────────────────────────────────────────

app.get('/api/admin/tutores', requireSuper, async (req, res) => {
  res.json(await db.all('SELECT id, username, is_super, created_at FROM admin_users ORDER BY id'))
})

app.put('/api/admin/tutores/:id/username', requireSuper, async (req, res) => {
  const username = (req.body.username || '').trim()
  if (!username) return res.status(400).json({ error: 'Nombre de usuario requerido' })
  const id   = parseInt(req.params.id)
  const user = await db.get('SELECT id FROM admin_users WHERE id=?', id)
  if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' })
  try {
    await db.run('UPDATE admin_users SET username=? WHERE id=?', username, id)
    if (id === req.auth.adminId) signAuth(res, { ...req.auth, adminUser: username })
    await log(req, 'rename_tutor', `${id}:${username}`)
    res.json({ ok: true })
  } catch {
    res.status(400).json({ error: 'Ese nombre de usuario ya existe' })
  }
})

app.post('/api/admin/tutores', requireSuper, async (req, res) => {
  const { username = '', password = '' } = req.body
  if (!username.trim() || password.length < 6) {
    return res.status(400).json({ error: 'Usuario requerido y contraseña mínimo 6 caracteres' })
  }
  try {
    const r = await db.run('INSERT INTO admin_users (username, password_hash) VALUES (?,?)', username.trim(), bcrypt.hashSync(password, 10))
    await log(req, 'create_tutor', username.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch {
    res.status(400).json({ error: 'Ese nombre de usuario ya existe' })
  }
})

app.put('/api/admin/tutores/:id/password', requireSuper, async (req, res) => {
  const { password = '' } = req.body
  if (password.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' })
  await db.run('UPDATE admin_users SET password_hash=? WHERE id=?', bcrypt.hashSync(password, 10), req.params.id)
  await log(req, 'reset_tutor_password', req.params.id)
  res.json({ ok: true })
})

app.put('/api/admin/tutores/:id/super', requireSuper, async (req, res) => {
  const id   = parseInt(req.params.id)
  const user = await db.get('SELECT id, username FROM admin_users WHERE id=?', id)
  if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' })
  await db.run('UPDATE admin_users SET is_super=1 WHERE id=?', id)
  if (id === req.auth.adminId) signAuth(res, { ...req.auth, adminSuper: true })
  await log(req, 'make_super_admin', `${id}:${user.username}`)
  res.json({ ok: true })
})

app.delete('/api/admin/tutores/:id', requireSuper, async (req, res) => {
  const id   = parseInt(req.params.id)
  const user = await db.get('SELECT is_super FROM admin_users WHERE id=?', id)
  if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' })
  if (user.is_super) {
    const supers = await db.get('SELECT COUNT(*) AS c FROM admin_users WHERE is_super=1', )
    if (supers.c <= 1) return res.status(400).json({ error: 'Debe existir al menos un administrador principal' })
  }
  await db.run('DELETE FROM admin_users WHERE id=?', id)
  await log(req, 'delete_tutor', id)
  res.json({ ok: true })
})

// ─── Teams public ────────────────────────────────────

app.get('/api/teams', async (req, res) => {
  res.json(await db.all('SELECT * FROM teams ORDER BY id'))
})

// ─── Teams admin CRUD ─────────────────────────────────

app.get('/api/admin/teams', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM teams ORDER BY id'))
})

app.post('/api/admin/teams', requireAdmin, async (req, res) => {
  const { name, logo = '' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    const r = await db.run('INSERT INTO teams (name, logo) VALUES (?,?)', name.trim(), logo)
    await log(req, 'create_team', name.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch {
    res.status(400).json({ error: 'Ya existe un equipo con ese nombre' })
  }
})

app.put('/api/admin/teams/:id', requireAdmin, async (req, res) => {
  const { name, logo = '' } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    await db.run('UPDATE teams SET name=?, logo=? WHERE id=?', name.trim(), logo, req.params.id)
    await log(req, 'update_team', req.params.id)
    res.json({ ok: true })
  } catch {
    res.status(400).json({ error: 'Ya existe un equipo con ese nombre' })
  }
})

app.delete('/api/admin/teams/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM teams WHERE id=?', req.params.id)
  await log(req, 'delete_team', req.params.id)
  res.json({ ok: true })
})

// ─── Bracket ──────────────────────────────────────────

// Devuelve el bracket resuelto junto con los equipos (para resolver logos/nombres).
async function getBracketPayload() {
  const cfg = await getConfig()
  let data
  try { data = JSON.parse(cfg.bracket_data || '{}') } catch { data = {} }
  if (!Array.isArray(data.rounds)) data = { size: 8, rounds: emptyBracketRounds(8) }
  const teams = await db.all('SELECT id, name, logo FROM teams ORDER BY id')
  return {
    title:    cfg.bracket_title || 'Llave del torneo',
    subtitle: cfg.bracket_subtitle || '',
    size:     data.size,
    rounds:   resolveBracket(data).rounds,
    teams,
  }
}

app.get('/api/bracket', async (req, res) => {
  res.json(await getBracketPayload())
})

app.put('/api/admin/bracket', requireAdmin, async (req, res) => {
  const clean = sanitizeBracket(req.body)
  await db.run('INSERT OR REPLACE INTO site_config (key, value) VALUES (?,?)', 'bracket_data', JSON.stringify(clean))
  if (typeof req.body.title === 'string')
    await db.run('INSERT OR REPLACE INTO site_config (key, value) VALUES (?,?)', 'bracket_title', req.body.title.slice(0, 120))
  if (typeof req.body.subtitle === 'string')
    await db.run('INSERT OR REPLACE INTO site_config (key, value) VALUES (?,?)', 'bracket_subtitle', req.body.subtitle.slice(0, 200))
  await log(req, 'update_bracket', `size=${clean.size}`)
  res.json({ ok: true })
})

// ─── Feedback ─────────────────────────────────────────

app.post('/api/feedback', async (req, res) => {
  const name    = (req.body.name || '').toString().trim().slice(0, 80)
  const message = (req.body.message || '').toString().trim().slice(0, 2000)
  if (!message) return res.status(400).json({ error: 'El comentario no puede estar vacío' })
  const r = await db.run('INSERT INTO feedback (name, message) VALUES (?,?)', name, message)
  await log(req, 'feedback', name || 'anónimo')
  res.status(201).json({ id: r.lastInsertRowid })
})

app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM feedback ORDER BY created_at DESC, id DESC'))
})

app.delete('/api/admin/feedback/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM feedback WHERE id=?', req.params.id)
  await log(req, 'delete_feedback', req.params.id)
  res.json({ ok: true })
})

// ─── Gallery public ──────────────────────────────────

app.get('/api/gallery', async (req, res) => {
  res.json(await db.all('SELECT * FROM gallery ORDER BY order_index, id'))
})

// ─── Gallery admin CRUD ───────────────────────────────

app.get('/api/admin/gallery', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM gallery ORDER BY order_index, id'))
})

app.post('/api/admin/gallery', requireAdmin, async (req, res) => {
  const { title, url, type = 'image', caption = '', order_index = 0 } = req.body
  const r = await db.run('INSERT INTO gallery (title,url,type,caption,order_index) VALUES (?,?,?,?,?)', title, url, type, caption, order_index)
  await log(req, 'create_gallery', `${r.lastInsertRowid}:${title}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/gallery/:id', requireAdmin, async (req, res) => {
  const { title, url, type = 'image', caption = '', order_index = 0 } = req.body
  await db.run('UPDATE gallery SET title=?,url=?,type=?,caption=?,order_index=? WHERE id=?', title, url, type, caption, order_index, req.params.id)
  await log(req, 'update_gallery', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/gallery/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM gallery WHERE id=?', req.params.id)
  await log(req, 'delete_gallery', req.params.id)
  res.json({ ok: true })
})

app.patch('/api/admin/gallery/reorder', requireAdmin, async (req, res) => {
  for (const { id, display_order } of (req.body || [])) {
    await db.run('UPDATE gallery SET order_index=? WHERE id=?', display_order, id)
  }
  res.json({ ok: true })
})

// ─── Rankings public ──────────────────────────────────

app.get('/api/rankings', async (req, res) => {
  const { scope } = req.query
  const rows = scope === 'global'
    ? await db.all('SELECT * FROM rankings WHERE session_id IS NULL ORDER BY position')
    : scope === 'sessions'
      ? await db.all('SELECT * FROM rankings WHERE session_id IS NOT NULL ORDER BY session_id, position')
      : await db.all('SELECT * FROM rankings ORDER BY session_id, position')
  res.json(rows)
})

// ─── Rankings admin CRUD ──────────────────────────────

app.get('/api/admin/rankings', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM rankings ORDER BY session_id, position'))
})

app.post('/api/admin/rankings', requireAdmin, async (req, res) => {
  const { session_id, activity_label = 'Actividad', team_name, score = '', position } = req.body
  const sid = session_id ? parseInt(session_id) : null
  const r = await db.run('INSERT INTO rankings (session_id,activity_label,team_name,score,position) VALUES (?,?,?,?,?)', sid, activity_label, team_name, score, position)
  await log(req, 'create_ranking', `${r.lastInsertRowid}:${team_name}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/rankings/:id', requireAdmin, async (req, res) => {
  const { session_id, activity_label = 'Actividad', team_name, score = '', position } = req.body
  const sid = session_id ? parseInt(session_id) : null
  await db.run('UPDATE rankings SET session_id=?,activity_label=?,team_name=?,score=?,position=? WHERE id=?', sid, activity_label, team_name, score, position, req.params.id)
  await log(req, 'update_ranking', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/rankings/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM rankings WHERE id=?', req.params.id)
  await log(req, 'delete_ranking', req.params.id)
  res.json({ ok: true })
})

// ─── Logs ────────────────────────────────────────────

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500)
  res.json(await db.all('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?', limit))
})

// ─── Start ───────────────────────────────────────────

const PORT = parseInt(process.env.PORT) || 3000

initDB().then(() => {
  if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`EIRI running on :${PORT}`))
  }
}).catch(err => {
  console.error('Init failed:', err)
  process.exit(1)
})

module.exports = app
