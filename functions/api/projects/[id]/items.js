import { getDb } from '../../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const TYPES = new Set(['notes', 'todo', 'ideas', 'mindmap', 'custom', 'library'])

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

export async function onRequestPost({ request, env, params }) {
  try {
    const db = getDb(env)
    await ensureProjectTables(db)
    const body = await request.json()
    if (!TYPES.has(body.item_type)) return json({ error: 'Invalid project item' }, 400)
    const itemId = body.item_id || body.url || crypto.randomUUID()
    if (!itemId && body.item_type !== 'custom') return json({ error: 'Invalid project item' }, 400)

    if (!['custom'].includes(body.item_type)) {
      const { rows: existing } = await db.execute(
        'SELECT id FROM project_items WHERE project_id = ? AND item_type = ? AND item_id = ? LIMIT 1',
        [params.id, body.item_type, itemId]
      )
      if (existing.length) return json({ error: 'Item already in project' }, 409)
    }

    const id = crypto.randomUUID()
    const now = Date.now()
    const position = Number.isFinite(body.position) ? body.position : now
    await db.execute(
      'INSERT INTO project_items (id, project_id, item_type, item_id, title, content, url, display_type, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, params.id, body.item_type, itemId, body.title || '', body.content || '', body.url || '', body.display_type || '', position, now]
    )
    await db.execute('UPDATE projects SET updated_at = ? WHERE id = ?', [now, params.id])

    return json({
      id,
      project_id: params.id,
      item_type: body.item_type,
      item_id: itemId,
      title: body.title || '',
      content: body.content || '',
      url: body.url || '',
      display_type: body.display_type || '',
      position,
      created_at: now
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
