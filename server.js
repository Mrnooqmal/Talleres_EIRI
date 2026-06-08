require('dotenv').config()

const express          = require('express')
const session          = require('express-session')
const bcrypt           = require('bcryptjs')
const { DatabaseSync } = require('node:sqlite')
const nunjucks         = require('nunjucks')
const multer           = require('multer')
const path             = require('path')
const fs               = require('fs')
const crypto           = require('crypto')

const app = express()
const db  = new DatabaseSync(path.join(__dirname, 'eiri.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

nunjucks.configure(path.join(__dirname, 'templates'), { autoescape: true, express: app })

// Almacenamiento de archivos: S3 si esta configurado, disco local en desarrollo
const S3_BUCKET     = process.env.S3_BUCKET || ''
const S3_REGION     = process.env.AWS_REGION || 'sa-east-1'
const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '')
const ALLOWED_FILES = /\.(png|jpg|jpeg|gif|webp|svg|pdf)$/i

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
app.use(express.json())
app.use('/static', express.static(path.join(__dirname, 'static')))
app.use(session({
  secret:            process.env.SECRET_KEY || 'eiri-dev-secret-change-in-prod',
  resave:            false,
  saveUninitialized: false,
  cookie:            { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}))

// ─── Schema ──────────────────────────────────────────

db.exec(`
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

// ─── Seeds ───────────────────────────────────────────

if (!db.prepare('SELECT 1 FROM admin_users').get()) {
  db.prepare('INSERT INTO admin_users (username, password_hash, is_super) VALUES (?,?,1)')
    .run('admin', bcrypt.hashSync('eiri2026', 10))
}

try { db.exec("ALTER TABLE projects ADD COLUMN tags TEXT DEFAULT ''") } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN is_super INTEGER DEFAULT 0") } catch {}

// Migración: poblar tutor_ips desde logins históricos y resolver entradas anon existentes
try {
  // Por cada IP, tomar el usuario del login más reciente desde esa IP
  db.exec(`
    INSERT OR REPLACE INTO tutor_ips (ip, username)
    SELECT ip, user FROM activity_logs
    WHERE event = 'admin_login' AND ip != '' AND user != 'anon'
    GROUP BY ip
    HAVING created_at = MAX(created_at)
  `)
  // Reescribir las entradas anon cuya IP ya conocemos
  db.exec(`
    UPDATE activity_logs
    SET user = (SELECT username FROM tutor_ips WHERE tutor_ips.ip = activity_logs.ip)
    WHERE user = 'anon'
      AND ip  != ''
      AND EXISTS (SELECT 1 FROM tutor_ips WHERE tutor_ips.ip = activity_logs.ip)
  `)
} catch (e) { console.error('IP migration:', e.message) }

// Garantiza que exista al menos un administrador principal (super)
if (!db.prepare('SELECT 1 FROM admin_users WHERE is_super=1').get()) {
  const first = db.prepare("SELECT id FROM admin_users WHERE username='admin'").get()
            || db.prepare('SELECT id FROM admin_users ORDER BY id LIMIT 1').get()
  if (first) db.prepare('UPDATE admin_users SET is_super=1 WHERE id=?').run(first.id)
}

const configDefaults = {
  site_title:          'EIRI Talleres de Robótica',
  subtitle:            'Battlebots 2026',
  hero_description:    'Construye, programa y combate. Aprende electrónica, mecánica y código mientras diseñas tu propio robot de batalla.',
  year:                '2026',
  contact:             '',
  about_description:   'El Equipo Interdisciplinario de Robótica e Innovación de la Universidad del Desarrollo organiza talleres para estudiantes apasionados por la tecnología, la ingeniería y el diseño.',
  social_instagram:    '',
  social_github:       '',
  social_email:        '',
  social_discord:      '',
}
const upsertCfg = db.prepare('INSERT OR IGNORE INTO site_config (key, value) VALUES (?,?)')
for (const [k, v] of Object.entries(configDefaults)) upsertCfg.run(k, v)

if (!db.prepare('SELECT 1 FROM workshop_sessions').get()) {
  const ins = db.prepare('INSERT INTO workshop_sessions (number, title, display_order) VALUES (?,?,?)')
  const seeds = [
    [1, 'Introducción a Battlebots'],
    [2, 'Electrónica Básica'],
    [3, 'Programación del Robot'],
    [4, 'Diseño Mecánico'],
    [5, 'Construcción y Pruebas'],
    [6, 'La Batalla Final'],
  ]
  for (const [n, t] of seeds) ins.run(n, t, n)
}

// ─── Helpers ─────────────────────────────────────────

function getConfig() {
  return Object.fromEntries(
    db.prepare('SELECT key, value FROM site_config').all().map(r => [r.key, r.value])
  )
}

function log(req, event, detail = '') {
  let user = req.session.adminUser || 'anon'
  const ip = req.ip || ''
  if (user === 'anon' && ip) {
    const known = db.prepare('SELECT username FROM tutor_ips WHERE ip=?').get(ip)
    if (known) user = known.username
  }
  db.prepare('INSERT INTO activity_logs (event, detail, user, ip) VALUES (?,?,?,?)')
    .run(event, detail, user, ip)
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'No autorizado' })
  next()
}

function requireSuper(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'No autorizado' })
  if (!req.session.adminSuper) return res.status(403).json({ error: 'Solo el administrador principal puede gestionar cuentas' })
  next()
}

// ─── Pages ───────────────────────────────────────────

app.get('/', (req, res) => res.render('index.html', { config: getConfig() }))
app.get('/galeria', (req, res) => res.render('galeria.html', { config: getConfig() }))

const SES_TYPE_LABELS = { code: 'Código', slides: 'Presentación', diagram: 'Imágenes', video: 'Video', markdown: 'Notas', link: 'Enlace', model3d: 'Modelo 3D' }
const SES_TYPE_ICONS  = { code: 'code-2', slides: 'file-text', diagram: 'image', video: 'play-circle', markdown: 'align-left', link: 'link-2', model3d: 'package' }

app.get('/sesiones/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM workshop_sessions WHERE id=?').get(req.params.id)
  if (!session) return res.status(404).send('Sesión no encontrada')
  const projects = db.prepare('SELECT * FROM projects WHERE session_id=? ORDER BY display_order').all(session.id)
  for (const p of projects) {
    p.assets    = db.prepare('SELECT * FROM assets WHERE project_id=? AND is_locked=0 ORDER BY display_order').all(p.id)
    p.locked    = db.prepare('SELECT * FROM assets WHERE project_id=? AND is_locked=1 ORDER BY display_order').all(p.id)
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
  log(req, 'view_session', session.id)
  res.render('sesion.html', { config: getConfig(), session })
})

app.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin')
  res.render('admin_login.html')
})

app.get(['/admin', '/admin/*'], (req, res) => {
  if (!req.session.adminId) return res.redirect('/admin/login')
  res.render('admin.html', { username: req.session.adminUser })
})

// Upload (S3 o disco local segun configuracion)

app.post('/api/admin/upload', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sin archivo o tipo no permitido' })
  try {
    const url = S3_BUCKET
      ? await putToS3(req.file)
      : `/static/uploads/${req.file.filename}`
    log(req, 'upload_file', req.file.originalname)
    res.json({ url, name: req.file.originalname })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: 'No se pudo subir el archivo' })
  }
})

// ─── Public API ──────────────────────────────────────

app.get('/api/config', (req, res) => res.json(getConfig()))

app.get('/api/sessions', (req, res) => {
  const sessions = db.prepare(
    'SELECT * FROM workshop_sessions ORDER BY display_order, number'
  ).all()
  for (const s of sessions) {
    const projects = db.prepare(
      'SELECT * FROM projects WHERE session_id=? ORDER BY display_order'
    ).all(s.id)
    for (const p of projects) {
      p.assets = db.prepare(
        'SELECT * FROM assets WHERE project_id=? ORDER BY display_order'
      ).all(p.id)
    }
    s.projects = projects
  }
  log(req, 'view_sessions')
  res.json(sessions)
})

// ─── Auth ────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { username = '', password = '' } = req.body
  const user = db.prepare('SELECT * FROM admin_users WHERE username=?').get(username)
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    req.session.adminId    = user.id
    req.session.adminUser  = user.username
    req.session.adminSuper = !!user.is_super
    const loginIp = req.ip || ''
    if (loginIp) {
      db.prepare('INSERT OR REPLACE INTO tutor_ips (ip, username) VALUES (?,?)')
        .run(loginIp, user.username)
    }
    log(req, 'admin_login')
    return res.json({ ok: true, username: user.username, is_super: !!user.is_super })
  }
  log(req, 'login_failed', username)
  res.status(401).json({ error: 'Credenciales incorrectas' })
})

app.post('/api/admin/logout', (req, res) => {
  log(req, 'admin_logout')
  req.session.destroy(() => res.json({ ok: true }))
})

app.get('/api/admin/me', (req, res) => {
  req.session.adminId
    ? res.json({ logged_in: true, username: req.session.adminUser, is_super: !!req.session.adminSuper })
    : res.json({ logged_in: false })
})

// Cambio de contraseña desde el login, sin sesión: valida credenciales actuales
app.post('/api/admin/change-password', (req, res) => {
  const { username = '', current = '', new: newPw = '' } = req.body
  const user = db.prepare('SELECT * FROM admin_users WHERE username=?').get(username)
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'Usuario o contraseña actual incorrectos' })
  }
  if (newPw.length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' })
  db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(newPw, 10), user.id)
  log(req, 'change_password_login', username)
  res.json({ ok: true })
})

// ─── Sessions CRUD ───────────────────────────────────

app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM workshop_sessions ORDER BY display_order, number').all())
})

app.post('/api/admin/sessions', requireAdmin, (req, res) => {
  const { number, title, date_text = 'Por definir', status = 'upcoming', description = '', display_order } = req.body
  const r = db.prepare(
    'INSERT INTO workshop_sessions (number,title,date_text,status,description,display_order) VALUES (?,?,?,?,?,?)'
  ).run(number, title, date_text, status, description, display_order ?? number)
  log(req, 'create_session', `${r.lastInsertRowid}:${title}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/sessions/:id', requireAdmin, (req, res) => {
  const { number, title, date_text = 'Por definir', status = 'upcoming', description = '', display_order } = req.body
  db.prepare(
    "UPDATE workshop_sessions SET number=?,title=?,date_text=?,status=?,description=?,display_order=?,updated_at=datetime('now') WHERE id=?"
  ).run(number, title, date_text, status, description, display_order ?? number, req.params.id)
  log(req, 'update_session', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/sessions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM workshop_sessions WHERE id=?').run(req.params.id)
  log(req, 'delete_session', req.params.id)
  res.json({ ok: true })
})

app.patch('/api/admin/sessions/reorder', requireAdmin, (req, res) => {
  for (const { id, display_order } of (req.body || [])) {
    db.prepare('UPDATE workshop_sessions SET display_order=? WHERE id=?').run(display_order, id)
  }
  res.json({ ok: true })
})

app.patch('/api/admin/sessions/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body
  db.prepare("UPDATE workshop_sessions SET status=?,updated_at=datetime('now') WHERE id=?").run(status, req.params.id)
  log(req, 'update_session_status', req.params.id)
  res.json({ ok: true })
})

// ─── Projects CRUD ───────────────────────────────────

app.get('/api/admin/projects', requireAdmin, (req, res) => {
  const { session_id } = req.query
  const rows = session_id
    ? db.prepare('SELECT * FROM projects WHERE session_id=? ORDER BY display_order').all(session_id)
    : db.prepare('SELECT * FROM projects ORDER BY display_order').all()
  res.json(rows)
})

app.post('/api/admin/projects', requireAdmin, (req, res) => {
  const { session_id, title, description = '', tags = '', display_order = 0 } = req.body
  const r = db.prepare(
    'INSERT INTO projects (session_id,title,description,tags,display_order) VALUES (?,?,?,?,?)'
  ).run(session_id, title, description, tags, display_order)
  log(req, 'create_project', `${r.lastInsertRowid}:${title}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/projects/:id', requireAdmin, (req, res) => {
  const { title, description = '', tags = '', display_order = 0 } = req.body
  db.prepare('UPDATE projects SET title=?,description=?,tags=?,display_order=? WHERE id=?')
    .run(title, description, tags, display_order, req.params.id)
  log(req, 'update_project', req.params.id)
  res.json({ ok: true })
})

app.patch('/api/admin/projects/reorder', requireAdmin, (req, res) => {
  for (const { id, display_order } of (req.body || [])) {
    db.prepare('UPDATE projects SET display_order=? WHERE id=?').run(display_order, id)
  }
  res.json({ ok: true })
})

app.delete('/api/admin/projects/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id)
  log(req, 'delete_project', req.params.id)
  res.json({ ok: true })
})

// ─── Assets CRUD ─────────────────────────────────────

app.get('/api/admin/assets', requireAdmin, (req, res) => {
  const { project_id } = req.query
  const rows = project_id
    ? db.prepare('SELECT * FROM assets WHERE project_id=? ORDER BY display_order').all(project_id)
    : db.prepare('SELECT * FROM assets ORDER BY display_order').all()
  res.json(rows)
})

app.post('/api/admin/assets', requireAdmin, (req, res) => {
  const { project_id, type, label, content = '', language = '', is_locked = false, display_order = 0 } = req.body
  const r = db.prepare(
    'INSERT INTO assets (project_id,type,label,content,language,is_locked,display_order) VALUES (?,?,?,?,?,?,?)'
  ).run(project_id, type, label, content, language, is_locked ? 1 : 0, display_order)
  log(req, 'create_asset', `${r.lastInsertRowid}:${label}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/assets/:id', requireAdmin, (req, res) => {
  const { type, label, content = '', language = '', is_locked = false, display_order = 0 } = req.body
  db.prepare('UPDATE assets SET type=?,label=?,content=?,language=?,is_locked=?,display_order=? WHERE id=?')
    .run(type, label, content, language, is_locked ? 1 : 0, display_order, req.params.id)
  log(req, 'update_asset', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/assets/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM assets WHERE id=?').run(req.params.id)
  log(req, 'delete_asset', req.params.id)
  res.json({ ok: true })
})

// ─── Config ──────────────────────────────────────────

app.put('/api/admin/config', requireAdmin, (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?,?)')
  for (const [k, v] of Object.entries(req.body)) upsert.run(k, String(v))
  log(req, 'update_config')
  res.json({ ok: true })
})

// ─── Password ────────────────────────────────────────

app.put('/api/admin/password', requireAdmin, (req, res) => {
  const { current, new: newPw } = req.body
  const user = db.prepare('SELECT * FROM admin_users WHERE id=?').get(req.session.adminId)
  if (!user || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(400).json({ error: 'Contraseña actual incorrecta' })
  }
  db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(newPw, 10), req.session.adminId)
  log(req, 'change_password')
  res.json({ ok: true })
})

// ─── Tutores ─────────────────────────────────────────

app.get('/api/admin/tutores', requireSuper, (req, res) => {
  res.json(db.prepare('SELECT id, username, is_super, created_at FROM admin_users ORDER BY id').all())
})

app.put('/api/admin/tutores/:id/username', requireSuper, (req, res) => {
  const username = (req.body.username || '').trim()
  if (!username) return res.status(400).json({ error: 'Nombre de usuario requerido' })
  const id   = parseInt(req.params.id)
  const user = db.prepare('SELECT id FROM admin_users WHERE id=?').get(id)
  if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' })
  try {
    db.prepare('UPDATE admin_users SET username=? WHERE id=?').run(username, id)
    if (id === req.session.adminId) req.session.adminUser = username
    log(req, 'rename_tutor', `${id}:${username}`)
    res.json({ ok: true })
  } catch {
    res.status(400).json({ error: 'Ese nombre de usuario ya existe' })
  }
})

app.post('/api/admin/tutores', requireSuper, (req, res) => {
  const { username = '', password = '' } = req.body
  if (!username.trim() || password.length < 6) {
    return res.status(400).json({ error: 'Usuario requerido y contraseña mínimo 6 caracteres' })
  }
  try {
    const r = db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?,?)')
      .run(username.trim(), bcrypt.hashSync(password, 10))
    log(req, 'create_tutor', username.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch {
    res.status(400).json({ error: 'Ese nombre de usuario ya existe' })
  }
})

app.put('/api/admin/tutores/:id/password', requireSuper, (req, res) => {
  const { password = '' } = req.body
  if (password.length < 6) return res.status(400).json({ error: 'Mínimo 6 caracteres' })
  db.prepare('UPDATE admin_users SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(password, 10), req.params.id)
  log(req, 'reset_tutor_password', req.params.id)
  res.json({ ok: true })
})

app.put('/api/admin/tutores/:id/super', requireSuper, (req, res) => {
  const id   = parseInt(req.params.id)
  const user = db.prepare('SELECT id, username FROM admin_users WHERE id=?').get(id)
  if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' })
  db.prepare('UPDATE admin_users SET is_super=1 WHERE id=?').run(id)
  if (id === req.session.adminId) req.session.adminSuper = true
  log(req, 'make_super_admin', `${id}:${user.username}`)
  res.json({ ok: true })
})

app.delete('/api/admin/tutores/:id', requireSuper, (req, res) => {
  const id   = parseInt(req.params.id)
  const user = db.prepare('SELECT is_super FROM admin_users WHERE id=?').get(id)
  if (!user) return res.status(404).json({ error: 'Cuenta no encontrada' })
  if (user.is_super) {
    const supers = db.prepare('SELECT COUNT(*) AS c FROM admin_users WHERE is_super=1').get()
    if (supers.c <= 1) return res.status(400).json({ error: 'Debe existir al menos un administrador principal' })
  }
  db.prepare('DELETE FROM admin_users WHERE id=?').run(id)
  log(req, 'delete_tutor', id)
  res.json({ ok: true })
})

// ─── Teams public ────────────────────────────────────

app.get('/api/teams', (req, res) => {
  res.json(db.prepare('SELECT * FROM teams ORDER BY id').all())
})

// ─── Teams admin CRUD ─────────────────────────────────

app.get('/api/admin/teams', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM teams ORDER BY id').all())
})

app.post('/api/admin/teams', requireAdmin, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    const r = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name.trim())
    log(req, 'create_team', name.trim())
    res.status(201).json({ id: r.lastInsertRowid })
  } catch {
    res.status(400).json({ error: 'Ya existe un equipo con ese nombre' })
  }
})

app.put('/api/admin/teams/:id', requireAdmin, (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    db.prepare('UPDATE teams SET name=? WHERE id=?').run(name.trim(), req.params.id)
    log(req, 'update_team', req.params.id)
    res.json({ ok: true })
  } catch {
    res.status(400).json({ error: 'Ya existe un equipo con ese nombre' })
  }
})

app.delete('/api/admin/teams/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM teams WHERE id=?').run(req.params.id)
  log(req, 'delete_team', req.params.id)
  res.json({ ok: true })
})

// ─── Feedback ─────────────────────────────────────────

app.post('/api/feedback', (req, res) => {
  const name    = (req.body.name || '').toString().trim().slice(0, 80)
  const message = (req.body.message || '').toString().trim().slice(0, 2000)
  if (!message) return res.status(400).json({ error: 'El comentario no puede estar vacío' })
  const r = db.prepare('INSERT INTO feedback (name, message) VALUES (?,?)').run(name, message)
  log(req, 'feedback', name || 'anónimo')
  res.status(201).json({ id: r.lastInsertRowid })
})

app.get('/api/admin/feedback', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM feedback ORDER BY created_at DESC, id DESC').all())
})

app.delete('/api/admin/feedback/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM feedback WHERE id=?').run(req.params.id)
  log(req, 'delete_feedback', req.params.id)
  res.json({ ok: true })
})

// ─── Gallery public ──────────────────────────────────

app.get('/api/gallery', (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery ORDER BY order_index, id').all())
})

// ─── Gallery admin CRUD ───────────────────────────────

app.get('/api/admin/gallery', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM gallery ORDER BY order_index, id').all())
})

app.post('/api/admin/gallery', requireAdmin, (req, res) => {
  const { title, url, type = 'image', caption = '', order_index = 0 } = req.body
  const r = db.prepare('INSERT INTO gallery (title,url,type,caption,order_index) VALUES (?,?,?,?,?)')
    .run(title, url, type, caption, order_index)
  log(req, 'create_gallery', `${r.lastInsertRowid}:${title}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/gallery/:id', requireAdmin, (req, res) => {
  const { title, url, type = 'image', caption = '', order_index = 0 } = req.body
  db.prepare('UPDATE gallery SET title=?,url=?,type=?,caption=?,order_index=? WHERE id=?')
    .run(title, url, type, caption, order_index, req.params.id)
  log(req, 'update_gallery', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/gallery/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id=?').run(req.params.id)
  log(req, 'delete_gallery', req.params.id)
  res.json({ ok: true })
})

// ─── Rankings public ──────────────────────────────────

app.get('/api/rankings', (req, res) => {
  const { scope } = req.query
  const rows = scope === 'global'
    ? db.prepare('SELECT * FROM rankings WHERE session_id IS NULL ORDER BY position').all()
    : scope === 'sessions'
      ? db.prepare('SELECT * FROM rankings WHERE session_id IS NOT NULL ORDER BY session_id, position').all()
      : db.prepare('SELECT * FROM rankings ORDER BY session_id, position').all()
  res.json(rows)
})

// ─── Rankings admin CRUD ──────────────────────────────

app.get('/api/admin/rankings', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM rankings ORDER BY session_id, position').all())
})

app.post('/api/admin/rankings', requireAdmin, (req, res) => {
  const { session_id, activity_label = 'Actividad', team_name, score = '', position } = req.body
  const sid = session_id ? parseInt(session_id) : null
  const r = db.prepare('INSERT INTO rankings (session_id,activity_label,team_name,score,position) VALUES (?,?,?,?,?)')
    .run(sid, activity_label, team_name, score, position)
  log(req, 'create_ranking', `${r.lastInsertRowid}:${team_name}`)
  res.status(201).json({ id: r.lastInsertRowid })
})

app.put('/api/admin/rankings/:id', requireAdmin, (req, res) => {
  const { session_id, activity_label = 'Actividad', team_name, score = '', position } = req.body
  const sid = session_id ? parseInt(session_id) : null
  db.prepare('UPDATE rankings SET session_id=?,activity_label=?,team_name=?,score=?,position=? WHERE id=?')
    .run(sid, activity_label, team_name, score, position, req.params.id)
  log(req, 'update_ranking', req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/rankings/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM rankings WHERE id=?').run(req.params.id)
  log(req, 'delete_ranking', req.params.id)
  res.json({ ok: true })
})

// ─── Logs ────────────────────────────────────────────

app.get('/api/admin/logs', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 500)
  res.json(db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit))
})

// ─── Start ───────────────────────────────────────────

const PORT = parseInt(process.env.PORT) || 3000
app.listen(PORT, () => console.log(`EIRI running on :${PORT}`))
