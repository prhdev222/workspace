import { getDb } from '../../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function slugify(input) {
  return String(input || 'untitled')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

function isImageUrl(value) {
  return /^data:image\//.test(value || '') || /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value || '')
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

async function githubGet(env, path) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'workspace-app'
      }
    }
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`)
  return res.json()
}

async function githubPut(env, path, content, sha, message) {
  const body = { message: message || 'Sync project from workspace', content: toBase64(content) }
  if (sha) body.sha = sha
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'workspace-app',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  )
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`)
  return res.json()
}

async function loadProject(db, id) {
  const { rows: projects } = await db.execute('SELECT * FROM projects WHERE id = ? LIMIT 1', [id])
  if (!projects.length) return null
  const project = projects[0]
  const { rows: items } = await db.execute('SELECT * FROM project_items WHERE project_id = ? ORDER BY position ASC, created_at ASC', [id])
  const { rows: notes } = await db.execute('SELECT * FROM notes')
  const { rows: blocks } = await db.execute('SELECT * FROM blocks ORDER BY note_id, position ASC')
  const { rows: todos } = await db.execute('SELECT * FROM todos')
  const { rows: ideas } = await db.execute('SELECT * FROM ideas')
  const { rows: mindmaps } = await db.execute('SELECT * FROM mindmaps')

  const noteMap = new Map(notes.map(note => [note.id, {
    ...note,
    tags: JSON.parse(note.tags || '[]'),
    blocks: blocks.filter(block => block.note_id === note.id)
  }]))
  const todoMap = new Map(todos.map(todo => [todo.id, { ...todo, done: todo.done === '1' || todo.done === 1 }]))
  const ideaMap = new Map(ideas.map(idea => [idea.id, idea]))
  const mindMapMap = new Map(mindmaps.map(map => [map.id, map]))

  project.items = items.map(item => ({
    ...item,
    entity:
      item.item_type === 'notes' ? noteMap.get(item.item_id) :
      item.item_type === 'todo' ? todoMap.get(item.item_id) :
      item.item_type === 'ideas' ? ideaMap.get(item.item_id) :
      item.item_type === 'mindmap' ? mindMapMap.get(item.item_id) :
      item
  })).filter(item => item.entity)
  return project
}

function projectToMarkdown(project) {
  const lines = [
    '---',
    `workspace_project_id: ${project.id}`,
    `slug: ${project.slug}`,
    `visibility: ${project.is_public === 1 || project.is_public === '1' ? 'public' : 'private'}`,
    `updated: ${new Date().toISOString()}`,
    '---',
    '',
    `# ${project.emoji || '📚'} ${project.title || 'Untitled project'}`,
    ''
  ]

  if (project.description) lines.push(project.description, '')

  for (const item of project.items || []) {
    const entity = item.entity
    if (item.item_type === 'notes') {
      lines.push(`## 📝 ${entity.title || 'Untitled note'}`, '')
      for (const block of entity.blocks || []) {
        const text = stripHtml(block.content || block.text || '')
        if (!text) continue
        if (block.type === 'heading') lines.push(`### ${text}`)
        else if (block.type === 'todo') lines.push(`- [${block.done ? 'x' : ' '}] ${text}`)
        else if (block.type === 'quote') lines.push(`> ${text}`)
        else if (block.type === 'bullet') lines.push(`- ${text}`)
        else lines.push(text)
      }
      lines.push('')
    } else if (item.item_type === 'todo') {
      lines.push(`## ✅ ${entity.text || 'Todo'}`)
      lines.push(`- Status: ${entity.done ? 'done' : 'open'}`)
      if (entity.due_date || entity.due_label) lines.push(`- Date: ${entity.due_date || entity.due_label}`)
      if (entity.location) lines.push(`- Location: ${entity.location}`)
      if (entity.attachment_url) lines.push(isImageUrl(entity.attachment_url) ? `![Attachment](${entity.attachment_url})` : `- Attachment: ${entity.attachment_url}`)
      lines.push('')
    } else if (item.item_type === 'ideas') {
      lines.push(`## ${entity.emoji || '💡'} Idea`, '')
      lines.push(entity.content || '', '')
      if (entity.image_url) lines.push(`![Idea image](${entity.image_url})`, '')
    } else if (item.item_type === 'mindmap') {
      lines.push(`## 📊 ${entity.title || 'Diagram'}`, '')
      lines.push('```mermaid', entity.content || '', '```', '')
    } else if (item.item_type === 'custom') {
      lines.push(`## ${item.title || 'Custom'}`, '')
      if (item.content) lines.push(item.content, '')
      if (item.url) lines.push(item.display_type === 'image' ? `![${item.title || 'image'}](${item.url})` : `[${item.title || item.url}](${item.url})`, '')
    } else if (item.item_type === 'library') {
      lines.push(`## 📚 ${item.title || 'Library file'}`, '')
      if (item.content) lines.push(item.content, '')
      if (item.url || item.item_id) lines.push(`[Open file](${item.url || item.item_id})`, '')
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

export async function onRequestPost({ params, env }) {
  try {
    const db = getDb(env)
    const project = await loadProject(db, params.id)
    if (!project) return json({ error: 'Project not found' }, 404)

    let filePath = project.obsidian_path
    if (!filePath) filePath = `Projects/${slugify(project.slug || project.title)}-${params.id.slice(0, 8)}.md`

    const existing = await githubGet(env, filePath)
    const markdown = projectToMarkdown(project)
    const result = await githubPut(env, filePath, markdown, existing?.sha || null, `Update project: ${project.title}`)
    const now = Date.now()
    await db.execute(
      'UPDATE projects SET obsidian_synced = 1, obsidian_path = ?, obsidian_sha = ?, obsidian_synced_at = ?, updated_at = ? WHERE id = ?',
      [filePath, result.content?.sha || null, now, now, params.id]
    )

    return json({ ok: true, path: filePath, sha: result.content?.sha || null, synced_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
