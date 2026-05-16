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
    const itemType = body.item_type || 'task'
    const startDate = body.start_date || null
    const dueDate = body.due_date || body.due_label || null
    const dueLabel = body.due_label || dueDate || 'today'
    const startTime = body.start_time || null
    const endTime = body.end_time || null
    const location = body.location || ''
    const attachmentUrl = body.attachment_url || ''

    await db.execute(
      'INSERT INTO todos (id, text, done, item_type, priority, start_date, due_date, start_time, end_time, location, attachment_url, due_label, section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, body.text, 0, itemType, body.priority || 'med', startDate, dueDate, startTime, endTime, location, attachmentUrl, dueLabel, body.section || 'today', now]
    )

    return json({
      id,
      text: body.text,
      done: false,
      item_type: itemType,
      priority: body.priority || 'med',
      start_date: startDate,
      due_date: dueDate,
      start_time: startTime,
      end_time: endTime,
      location,
      attachment_url: attachmentUrl,
      due_label: dueLabel,
      section: body.section || 'today',
      created_at: now
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
