import { getDb } from '../../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
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
  if (!projectNames.has('obsidian_synced')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_synced INTEGER NOT NULL DEFAULT 0')
  if (!projectNames.has('obsidian_path')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_path TEXT')
  if (!projectNames.has('obsidian_sha')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_sha TEXT')
  if (!projectNames.has('obsidian_synced_at')) await db.execute('ALTER TABLE projects ADD COLUMN obsidian_synced_at INTEGER')
}

export async function onRequestGet({ env, params }) {
  try {
    const db = getDb(env)
    await ensureProjectTables(db)
    const { rows: projects } = await db.execute(
      'SELECT * FROM projects WHERE slug = ? AND is_public = 1 LIMIT 1',
      [params.slug]
    )
    if (!projects.length) return json({ error: 'Project not found' }, 404)

    const project = projects[0]
    const { rows: items } = await db.execute(
      'SELECT * FROM project_items WHERE project_id = ? ORDER BY position ASC, created_at ASC',
      [project.id]
    )

    const { rows: notes } = await db.execute('SELECT * FROM notes')
    const { rows: blocks } = await db.execute('SELECT * FROM blocks ORDER BY note_id, position ASC')
    const { rows: todos } = await db.execute('SELECT * FROM todos')
    const { rows: ideas } = await db.execute('SELECT * FROM ideas')
    const { rows: mindmaps } = await db.execute('SELECT * FROM mindmaps')

    const noteMap = new Map(notes.map(note => [note.id, {
      ...note,
      tags: JSON.parse(note.tags || '[]'),
      blocks: blocks
        .filter(block => block.note_id === note.id)
        .map(block => ({ ...block, done: block.done === '1' || block.done === 1 }))
    }]))
    const todoMap = new Map(todos.map(todo => [todo.id, { ...todo, done: todo.done === '1' || todo.done === 1 }]))
    const ideaMap = new Map(ideas.map(idea => [idea.id, idea]))
    const mindMapMap = new Map(mindmaps.map(map => [map.id, map]))

    const hydratedItems = items
      .map(item => {
        const entity =
          item.item_type === 'notes' ? noteMap.get(item.item_id) :
          item.item_type === 'todo' ? todoMap.get(item.item_id) :
          item.item_type === 'ideas' ? ideaMap.get(item.item_id) :
          item.item_type === 'mindmap' ? mindMapMap.get(item.item_id) :
          item.item_type === 'custom' ? item :
          item.item_type === 'library' ? item :
          null
        return entity ? { ...item, entity } : null
      })
      .filter(Boolean)

    return json({
      ...project,
      is_public: true,
      items: hydratedItems
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
