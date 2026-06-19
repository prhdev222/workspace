// functions/api/obsidian/[id].js
// POST   /api/obsidian/:id  → push note to GitHub (sync to Obsidian vault)
// GET    /api/obsidian/:id  → pull latest from GitHub → update Turso
// DELETE /api/obsidian/:id  → unsync note (remove link, keep file in GitHub)

import { getDb } from '../_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────

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

function slugify(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w฀-๿-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50) || 'untitled'
}

function noteToMarkdown(note) {
  const tags = note.tags || []
  const header = [
    '---',
    `workspace_id: ${note.id}`,
    `tags: [${tags.join(', ')}]`,
    `created: ${new Date(parseInt(note.created_at)).toISOString()}`,
    `updated: ${new Date(Date.now()).toISOString()}`,
    '---',
    '',
    `# ${note.title || 'Untitled'}`,
    ''
  ].join('\n')

  const bodyLines = (note.blocks || []).map(b => {
    const text = stripHtml(b.content || b.text || '')
    switch (b.type) {
      case 'heading': return `## ${text}`
      case 'todo':    return `- [${b.done ? 'x' : ' '}] ${text}`
      case 'quote':   return `> ${text}`
      case 'bullet':  return `- ${text}`
      default:        return text
    }
  })

  return header + bodyLines.join('\n\n')
}

function markdownToBlocks(markdown) {
  const body = markdown
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/^# .+\n?/, '')
    .trim()

  const blocks = []
  for (const line of body.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('## '))            blocks.push({ type: 'heading', content: t.slice(3),  done: false })
    else if (/^- \[x\] /i.test(t))     blocks.push({ type: 'todo',    content: t.slice(6),  done: true  })
    else if (/^- \[ \] /.test(t))      blocks.push({ type: 'todo',    content: t.slice(6),  done: false })
    else if (t.startsWith('> '))        blocks.push({ type: 'quote',   content: t.slice(2),  done: false })
    else if (t.startsWith('- '))        blocks.push({ type: 'bullet',  content: t.slice(2),  done: false })
    else                                blocks.push({ type: 'text',    content: t,           done: false })
  }
  return blocks
}

function extractTitle(markdown) {
  const m = markdown.match(/^# (.+)$/m)
  return m ? m[1].trim() : 'Untitled'
}

// UTF-8 safe base64 encode/decode (supports Thai + emoji)
function toBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  bytes.forEach(b => (binary += String.fromCharCode(b)))
  return btoa(binary)
}
function fromBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// ── GitHub API ────────────────────────────────────────────────────────────────

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
  const body = {
    message: message || 'Sync from workspace',
    content: toBase64(content)
  }
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

async function githubDelete(env, path, sha, message) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'workspace-app',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message || 'Remove old synced note path',
        sha
      })
    }
  )
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── route handlers ────────────────────────────────────────────────────────────

// POST /api/obsidian/:id  → push note → GitHub
export async function onRequestPost({ params, env }) {
  try {
    const db = getDb(env)

    // Load note
    const { rows: notes } = await db.execute('SELECT * FROM notes WHERE id = ?', [params.id])
    if (!notes.length) return json({ error: 'Note not found' }, 404)
    const note = { ...notes[0], tags: JSON.parse(notes[0].tags || '[]') }

    // Load blocks
    const { rows: blocks } = await db.execute(
      'SELECT * FROM blocks WHERE note_id = ? ORDER BY position ASC',
      [params.id]
    )
    note.blocks = blocks.map(b => ({ ...b, done: b.done === '1' || b.done === 1 }))

    const slug = slugify(note.title)
    const shortId = params.id.slice(0, 8)
    const desiredPath = `workspace/${slug}-${shortId}.md`
    const previousPath = note.obsidian_path || null
    const filePath = desiredPath

    // Get existing SHA (needed for update)
    const existing = await githubGet(env, filePath)
    const sha = existing?.sha || null

    // Push to GitHub
    const markdown = noteToMarkdown(note)
    const result = await githubPut(env, filePath, markdown, sha, `Update: ${note.title}`)
    const newSha = result.content?.sha

    // If the title changed and the note moved, remove the old GitHub file.
    if (previousPath && previousPath !== filePath) {
      const previous = await githubGet(env, previousPath)
      if (previous?.sha) {
        await githubDelete(env, previousPath, previous.sha, `Rename note: ${note.title}`)
      }
    }

    // Save sync state to Turso
    const now = Date.now()
    await db.execute(
      'UPDATE notes SET obsidian_synced = 1, obsidian_path = ?, obsidian_sha = ?, obsidian_synced_at = ? WHERE id = ?',
      [filePath, newSha, now, params.id]
    )

    return json({ ok: true, path: filePath, sha: newSha, synced_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

// GET /api/obsidian/:id  → pull from GitHub → update Turso
export async function onRequestGet({ params, env }) {
  try {
    const db = getDb(env)

    const { rows: notes } = await db.execute('SELECT * FROM notes WHERE id = ?', [params.id])
    if (!notes.length) return json({ error: 'Note not found' }, 404)
    const note = notes[0]

    if (!note.obsidian_path) return json({ error: 'Note not synced to Obsidian yet' }, 400)

    const file = await githubGet(env, note.obsidian_path)
    if (!file) return json({ error: 'File not found in GitHub repo' }, 404)

    const markdown = fromBase64(file.content)
    const title = extractTitle(markdown)
    const blocks = markdownToBlocks(markdown)
    const now = Date.now()

    // Update note title + sync state
    await db.execute(
      'UPDATE notes SET title = ?, obsidian_sha = ?, obsidian_synced_at = ?, updated_at = ? WHERE id = ?',
      [title, file.sha, now, now, params.id]
    )

    // Replace blocks
    await db.execute('DELETE FROM blocks WHERE note_id = ?', [params.id])
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      await db.execute(
        'INSERT INTO blocks (id, note_id, type, content, done, position) VALUES (?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), params.id, b.type, b.content, b.done ? 1 : 0, i]
      )
    }

    return json({ ok: true, title, blocks, sha: file.sha, synced_at: now })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

// DELETE /api/obsidian/:id  → unsync (remove link in Turso, keep file in GitHub)
export async function onRequestDelete({ params, env }) {
  try {
    const db = getDb(env)
    await db.execute(
      'UPDATE notes SET obsidian_synced = 0, obsidian_auto_sync = 0, obsidian_path = NULL, obsidian_sha = NULL, obsidian_synced_at = NULL WHERE id = ?',
      [params.id]
    )
    return json({ ok: true })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
