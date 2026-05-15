// functions/api/todos.js
// GET  /api/todos        → list all todos
// POST /api/todos        → create todo

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
    const { rows } = await db.execute('SELECT * FROM todos ORDER BY created_at DESC')
    return json(rows.map(r => ({ ...r, done: r.done === '1' || r.done === 1 })))
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
      'INSERT INTO todos (id, text, done, priority, due_label, section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, body.text, 0, body.priority || 'med', body.due_label || 'today', body.section || 'today', now]
    )

    return json({ id, text: body.text, done: false, priority: body.priority || 'med', due_label: body.due_label || 'today', section: body.section || 'today', created_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
