// functions/api/notes/[id].js
// GET    /api/notes/:id  → get one note with blocks
// PUT    /api/notes/:id  → update note title, tags, and replace all blocks
// DELETE /api/notes/:id  → delete note and its blocks

import { getDb } from '../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestGet({ params, env }) {
  try {
    const db = getDb(env)
    const { rows: notes } = await db.execute('SELECT * FROM notes WHERE id = ?', [params.id])
    if (!notes.length) return json({ error: 'Not found' }, 404)

    const { rows: blocks } = await db.execute(
      'SELECT * FROM blocks WHERE note_id = ? ORDER BY position ASC',
      [params.id]
    )

    const note = {
      ...notes[0],
      tags: JSON.parse(notes[0].tags || '[]'),
      blocks: blocks.map(b => ({ ...b, done: b.done === '1' || b.done === 1 }))
    }
    return json(note)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPut({ params, request, env }) {
  try {
    const db = getDb(env)
    const body = await request.json()
    const now = Date.now()

    // Update note metadata
    await db.execute(
      'UPDATE notes SET title = ?, tags = ?, updated_at = ? WHERE id = ?',
      [body.title || 'Untitled', JSON.stringify(body.tags || []), now, params.id]
    )

    // Replace all blocks
    await db.execute('DELETE FROM blocks WHERE note_id = ?', [params.id])
    const blocks = body.blocks || []
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      await db.execute(
        'INSERT INTO blocks (id, note_id, type, content, done, position) VALUES (?, ?, ?, ?, ?, ?)',
        [b.id || crypto.randomUUID(), params.id, b.type || 'text', b.content || b.text || '', b.done ? 1 : 0, i]
      )
    }

    return json({ ok: true, updated_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const db = getDb(env)
    await db.execute('DELETE FROM blocks WHERE note_id = ?', [params.id])
    await db.execute('DELETE FROM notes WHERE id = ?', [params.id])
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
