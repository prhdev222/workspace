import { getDb } from '../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function ensureProjectTables(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '📚',
    is_public INTEGER NOT NULL DEFAULT 1,
    obsidian_synced INTEGER NOT NULL DEFAULT 0,
    obsidian_auto_sync INTEGER NOT NULL DEFAULT 0,
    obsidian_path TEXT,
    obsidian_sha TEXT,
    obsidian_synced_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  await db.execute(`CREATE TABLE IF NOT EXISTS project_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    display_type TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`)
  const { rows: columns } = await db.execute('PRAGMA table_info(project_items)')
  const names = new Set(columns.map(column => column.name))
  if (!names.has('title')) await db.execute("ALTER TABLE project_items ADD COLUMN title TEXT NOT NULL DEFAULT ''")
  if (!names.has('content')) await db.execute("ALTER TABLE project_items ADD COLUMN content TEXT NOT NULL DEFAULT ''")
  if (!names.has('url')) await db.execute("ALTER TABLE project_items ADD COLUMN url TEXT NOT NULL DEFAULT ''")
  if (!names.has('display_type')) await db.execute("ALTER TABLE project_items ADD COLUMN display_type TEXT NOT NULL DEFAULT ''")
  const { rows: projectColumns } = await db.execute('PRAGMA table_info(projects)')
  const projectNames = new Set(projectColumns.map(column => column.name))
  if (!projectNames.has('obsidian_auto_sync')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_auto_sync INTEGER NOT NULL DEFAULT 0')
  if (!projectNames.has('obsidian_synced')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_synced INTEGER NOT NULL DEFAULT 0')
  if (!projectNames.has('obsidian_path')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_path TEXT')
  if (!projectNames.has('obsidian_sha')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_sha TEXT')
  if (!projectNames.has('obsidian_synced_at')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_synced_at INTEGER')
}

export async function onRequestDelete({ env, params }) {
  try {
    const db = getDb(env)
    await ensureProjectTables(db)
    const { rows } = await db.execute('SELECT project_id FROM project_items WHERE id = ? LIMIT 1', [params.id])
    await db.execute('DELETE FROM project_items WHERE id = ?', [params.id])
    if (rows[0]?.project_id) {
      await db.execute('UPDATE projects SET updated_at = ? WHERE id = ?', [Date.now(), rows[0].project_id])
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPut({ request, env, params }) {
  try {
    const db = getDb(env)
    await ensureProjectTables(db)
    const body = await request.json()
    const fields = []
    const values = []
    for (const [key, value] of Object.entries({
      position: Number.isFinite(body.position) ? body.position : undefined,
      title: body.title,
      content: body.content,
      url: body.url,
      display_type: body.display_type
    })) {
      if (value !== undefined) {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }
    if (!fields.length) return json({ error: 'No fields to update' }, 400)
    values.push(params.id)
    const { rows } = await db.execute('SELECT project_id FROM project_items WHERE id = ? LIMIT 1', [params.id])
    await db.execute(`UPDATE project_items SET ${fields.join(', ')} WHERE id = ?`, values)
    if (rows[0]?.project_id) {
      await db.execute('UPDATE projects SET updated_at = ? WHERE id = ?', [Date.now(), rows[0].project_id])
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
