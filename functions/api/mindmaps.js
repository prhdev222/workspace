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
    const { rows } = await db.execute('SELECT * FROM mindmaps ORDER BY updated_at DESC')
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

    await db.execute(
      'INSERT INTO mindmaps (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, body.title || 'Untitled map', body.content || '', now, now]
    )

    return json({ id, title: body.title || 'Untitled map', content: body.content || '', created_at: now, updated_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
