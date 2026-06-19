// functions/api/drawings.js
// GET  /api/drawings        -> list drawings
// POST /api/drawings        -> create drawing

import { getDb } from './_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function ensureDrawingsTable(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS drawings (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    image_url TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)
}

function parseTags(value) {
  if (!Array.isArray(value)) return []
  return value.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8)
}

export async function onRequestGet({ env }) {
  try {
    const db = getDb(env)
    await ensureDrawingsTable(db)
    const { rows } = await db.execute('SELECT * FROM drawings ORDER BY created_at DESC')
    return json(rows.map(row => ({ ...row, tags: JSON.parse(row.tags || '[]') })))
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = getDb(env)
    await ensureDrawingsTable(db)
    const body = await request.json()
    const imageUrl = body.image_url || ''

    if (!imageUrl) return json({ error: 'Drawing image is required' }, 400)

    const id = crypto.randomUUID()
    const now = Date.now()
    const tags = parseTags(body.tags)
    const label = String(body.label || '').trim()

    await db.execute(
      'INSERT INTO drawings (id, label, tags, image_url, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, label, JSON.stringify(tags), imageUrl, now]
    )

    return json({ id, label, tags, image_url: imageUrl, created_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
