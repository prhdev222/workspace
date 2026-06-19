// functions/api/ideas.js
// GET  /api/ideas        → list all ideas
// POST /api/ideas        → create idea

import { getDb } from './_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const EMOJIS = ['💡','🔬','📌','🧠','⚡','🌱','🔭','🎯','📡','🧪','💊','🩺','📊','🌀','✨']

async function ensureIdeaColumns(db) {
  const { rows: columns } = await db.execute('PRAGMA table_info(ideas)')
  const names = new Set(columns.map(column => column.name))
  if (!names.has('image_url')) {
    await db.execute("ALTER TABLE ideas ADD COLUMN image_url TEXT NOT NULL DEFAULT ''")
  }
}

export async function onRequestGet({ env }) {
  try {
    const db = getDb(env)
    await ensureIdeaColumns(db)
    const { rows } = await db.execute('SELECT * FROM ideas ORDER BY created_at DESC')
    return json(rows)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = getDb(env)
    await ensureIdeaColumns(db)
    const body = await request.json()
    const id = crypto.randomUUID()
    const now = Date.now()
    const emoji = body.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
    const imageUrl = body.image_url || ''

    await db.execute(
      'INSERT INTO ideas (id, content, color, emoji, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, body.content, body.color || 'teal', emoji, imageUrl, now]
    )

    return json({ id, content: body.content, color: body.color || 'teal', emoji, image_url: imageUrl, created_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
