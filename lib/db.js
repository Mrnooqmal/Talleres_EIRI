// Database abstraction: wraps @libsql/client with helpers matching the old node:sqlite API
// Works with both local file (AWS/dev) and remote Turso (Vercel)
const { createClient } = require('@libsql/client')
const path = require('path')

const dbUrl = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'eiri.db')}`
const client = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
})

const db = {
  /** Execute a single SQL statement, returns { rows, lastInsertRowid, rowsAffected } */
  async execute(sql, args = []) {
    const r = await client.execute({ sql, args })
    return { rows: r.rows, lastInsertRowid: Number(r.lastInsertRowid), rowsAffected: r.rowsAffected }
  },

  /** Get a single row or undefined */
  async get(sql, ...args) {
    const { rows } = await db.execute(sql, args)
    return rows[0]
  },

  /** Get all rows as array */
  async all(sql, ...args) {
    const { rows } = await db.execute(sql, args)
    return rows
  },

  /** Insert/Update/Delete — returns { lastInsertRowid, rowsAffected } */
  async run(sql, ...args) {
    return db.execute(sql, args)
  },

  /** Execute multiple DDL statements (no params) */
  async execMultiple(sql) {
    await client.executeMultiple(sql)
  },
}

module.exports = db
