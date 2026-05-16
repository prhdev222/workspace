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

async function getDescendantIds(db, rootId) {
  const ids = [rootId]
  let cursor = 0

  while (cursor < ids.length) {
    const currentId = ids[cursor]
    const { rows: children } = await db.execute('SELECT id FROM notes WHERE parent_id = ?', [currentId])
    children.forEach(child => {
      if (!ids.includes(child.id)) ids.push(child.id)
    })
    cursor += 1
  }

  return ids
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
    const nextParentId = body.parent_id || null
    const { rows: currentRows } = await db.execute('SELECT * FROM notes WHERE id = ?', [params.id])

    if (!currentRows.length) {
      return json({ error: 'Not found' }, 404)
    }

    const current = currentRows[0]

    if (nextParentId === params.id) {
      return json({ error: 'A page cannot be its own parent' }, 400)
    }

    if (nextParentId) {
      const descendantIds = await getDescendantIds(db, params.id)
      if (descendantIds.includes(nextParentId)) {
        return json({ error: 'Cannot move a page inside its own subpage' }, 400)
      }
    }

    // Update note metadata
    await db.execute(
      'UPDATE notes SET title = ?, tags = ?, parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
      [
        body.title ?? current.title ?? 'Untitled',
        JSON.stringify(body.tags ?? JSON.parse(current.tags || '[]')),
        body.parent_id !== undefined ? nextParentId : current.parent_id,
        body.sort_order ?? current.sort_order ?? current.created_at ?? now,
        now,
        params.id
      ]
    )

    if (Array.isArray(body.blocks)) {
      await db.execute('DELETE FROM blocks WHERE note_id = ?', [params.id])
      for (let i = 0; i < body.blocks.length; i++) {
        const b = body.blocks[i]
        await db.execute(
          'INSERT INTO blocks (id, note_id, type, content, done, position) VALUES (?, ?, ?, ?, ?, ?)',
          [b.id || crypto.randomUUID(), params.id, b.type || 'text', b.content || b.text || '', b.done ? 1 : 0, i]
        )
      }
    }

    return json({
      ok: true,
      updated_at: now,
      parent_id: body.parent_id !== undefined ? nextParentId : current.parent_id,
      sort_order: body.sort_order ?? current.sort_order ?? current.created_at ?? now
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const db = getDb(env)
    const ids = await getDescendantIds(db, params.id)

    for (const id of ids) {
      await db.execute('DELETE FROM blocks WHERE note_id = ?', [id])
    }
    for (const id of ids.slice().reverse()) {
      await db.execute('DELETE FROM notes WHERE id = ?', [id])
    }

    return json({ ok: true, deleted_ids: ids })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
