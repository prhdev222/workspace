import { getDb } from './_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `project-${Date.now()}`
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

export async function onRequestGet({ env }) {
  try {
    const db = getDb(env)
    await ensureProjectTables(db)
    const { rows: projects } = await db.execute('SELECT * FROM projects ORDER BY updated_at DESC')
    const { rows: items } = await db.execute('SELECT * FROM project_items ORDER BY project_id, position ASC, created_at ASC')
    return json(projects.map(project => ({
      ...project,
      is_public: project.is_public === '1' || project.is_public === 1,
      items: items.filter(item => item.project_id === project.id)
    })))
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = getDb(env)
    await ensureProjectTables(db)
    const body = await request.json()
    const id = crypto.randomUUID()
    const now = Date.now()
    const title = body.title || 'Untitled project'
    const slug = slugify(body.slug || title)

    const { rows: existing } = await db.execute('SELECT id FROM projects WHERE slug = ? LIMIT 1', [slug])
    if (existing.length) return json({ error: 'Project slug already exists' }, 409)

    await db.execute(
      'INSERT INTO projects (id, title, slug, description, emoji, is_public, obsidian_synced, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, slug, body.description || '', body.emoji || '📚', body.is_public === false ? 0 : 1, 0, now, now]
    )

    return json({
      id,
      title,
      slug,
      description: body.description || '',
      emoji: body.emoji || '📚',
      is_public: body.is_public === false ? false : true,
      obsidian_synced: 0,
      obsidian_auto_sync: 0,
      obsidian_path: null,
      obsidian_synced_at: null,
      created_at: now,
      updated_at: now,
      items: []
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
