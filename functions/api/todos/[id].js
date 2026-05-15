// functions/api/todos/[id].js
// PUT    /api/todos/:id  → update todo (toggle done, change fields)
// DELETE /api/todos/:id  → delete todo

import { getDb } from '../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestPut({ params, request, env }) {
  try {
    const db = getDb(env)
    const body = await request.json()

    const fields = []
    const values = []

    if ('done' in body) { fields.push('done = ?'); values.push(body.done ? 1 : 0) }
    if ('text' in body) { fields.push('text = ?'); values.push(body.text) }
    if ('priority' in body) { fields.push('priority = ?'); values.push(body.priority) }
    if ('due_label' in body) { fields.push('due_label = ?'); values.push(body.due_label) }
    if ('section' in body) { fields.push('section = ?'); values.push(body.section) }

    if (!fields.length) return json({ error: 'No fields to update' }, 400)

    values.push(params.id)
    await db.execute(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`, values)
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const db = getDb(env)
    await db.execute('DELETE FROM todos WHERE id = ?', [params.id])
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
