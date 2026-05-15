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
    const now = Date.now()

    await db.execute(
      'UPDATE mindmaps SET title = ?, content = ?, updated_at = ? WHERE id = ?',
      [body.title || 'Untitled map', body.content || '', now, params.id]
    )

    return json({ ok: true, updated_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const db = getDb(env)
    await db.execute('DELETE FROM mindmaps WHERE id = ?', [params.id])
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
