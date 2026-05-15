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

export async function onRequestGet({ env }) {
  try {
    const db = getDb(env)
    const { rows } = await db.execute('SELECT * FROM ideas ORDER BY created_at DESC')
    return json(rows)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = getDb(env)
    const body = await request.json()
    const id = crypto.randomUUID()
    const now = Date.now()
    const emoji = body.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)]

    await db.execute(
      'INSERT INTO ideas (id, content, color, emoji, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, body.content, body.color || 'teal', emoji, now]
    )

    return json({ id, content: body.content, color: body.color || 'teal', emoji, created_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
