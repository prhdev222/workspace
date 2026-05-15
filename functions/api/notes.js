// functions/api/notes.js
// GET  /api/notes       → list all notes (with blocks)
// POST /api/notes       → create note

import { getDb } from './_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestGet({ env }) {
  try {
    const db = getDb(env)
    const { rows: notes } = await db.execute(
      'SELECT * FROM notes ORDER BY updated_at DESC'
    )
    const { rows: blocks } = await db.execute(
      'SELECT * FROM blocks ORDER BY note_id, position ASC'
    )

    const result = notes.map(n => ({
      ...n,
      tags: JSON.parse(n.tags || '[]'),
      blocks: blocks
        .filter(b => b.note_id === n.id)
        .map(b => ({ ...b, done: b.done === '1' || b.done === 1 }))
    }))

    return json(result)
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

    await db.execute(
      'INSERT INTO notes (id, title, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, body.title || 'Untitled', JSON.stringify(body.tags || []), now, now]
    )

    return json({ id, title: body.title || 'Untitled', tags: body.tags || [], blocks: [], created_at: now, updated_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
