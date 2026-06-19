// functions/api/drawings/[id].js
// DELETE /api/drawings/:id -> delete drawing

import { getDb } from '../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestDelete({ params, env }) {
  try {
    const db = getDb(env)
    await db.execute('DELETE FROM drawings WHERE id = ?', [params.id])
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
