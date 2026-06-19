import { getDb } from '../../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  })
}

async function hydrateProject(db, project) {
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

  return {
    ...project,
    is_public: project.is_public === '1' || project.is_public === 1,
    items: items.map(item => {
      const entity =
        item.item_type === 'notes' ? noteMap.get(item.item_id) :
        item.item_type === 'todo' ? todoMap.get(item.item_id) :
        item.item_type === 'ideas' ? ideaMap.get(item.item_id) :
        item.item_type === 'mindmap' ? mindMapMap.get(item.item_id) :
        item
      return entity ? { ...item, entity } : null
    }).filter(Boolean)
  }
}

export async function onRequestGet({ env, params }) {
  try {
    const db = getDb(env)
    const { rows } = await db.execute('SELECT * FROM projects WHERE slug = ? LIMIT 1', [params.slug])
    if (!rows.length) return json({ error: 'Project not found' }, 404)
    return json(await hydrateProject(db, rows[0]))
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
