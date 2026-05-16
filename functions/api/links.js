import { getDb } from './_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestGet({ request, env }) {
  try {
    const db = getDb(env)
    const url = new URL(request.url)
    const fromType = url.searchParams.get('from_type')
    const fromId = url.searchParams.get('from_id')

    if (fromType && fromId) {
      const { rows } = await db.execute(
        'SELECT * FROM links WHERE from_type = ? AND from_id = ? ORDER BY created_at DESC',
        [fromType, fromId]
      )
      return json(rows)
    }

    const { rows } = await db.execute('SELECT * FROM links ORDER BY created_at DESC')
    return json(rows)
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = getDb(env)
    const body = await request.json()

    if (!body.from_type || !body.from_id || !body.to_type || !body.to_id) {
      return json({ error: 'Missing link fields' }, 400)
    }

    const { rows: existing } = await db.execute(
      'SELECT id FROM links WHERE from_type = ? AND from_id = ? AND to_type = ? AND to_id = ? LIMIT 1',
      [body.from_type, body.from_id, body.to_type, body.to_id]
    )

    if (existing.length) {
      return json({ error: 'Link already exists' }, 409)
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    await db.execute(
      'INSERT INTO links (id, from_type, from_id, to_type, to_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, body.from_type, body.from_id, body.to_type, body.to_id, body.label || '', now]
    )

    return json({
      id,
      from_type: body.from_type,
      from_id: body.from_id,
      to_type: body.to_type,
      to_id: body.to_id,
      label: body.label || '',
      created_at: now
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
