// functions/api/upload.js
// POST /api/upload  — upload file to R2 under books/ prefix
// Returns { url } public URL

import { getDb } from './_db.js'

const R2_PUBLIC_URL = 'https://pub-ab79910c37a84799a9cf9f45fe44da06.r2.dev'
const MAX_SIZE = 200 * 1024 * 1024 // 200MB

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

export async function onRequestPost({ request, env }) {
  if (!env.R2) return json({ error: 'R2 not configured' }, 500)

  let formData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: 'Invalid multipart form data' }, 400)
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') return json({ error: 'No file provided' }, 400)

  if (file.size > MAX_SIZE) return json({ error: 'File too large (max 200MB)' }, 413)

  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9ก-๙\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
  const key = `books/${Date.now()}-${safeName}.${ext}`

  const buffer = await file.arrayBuffer()
  await env.R2.put(key, buffer, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' }
  })

  const url = `${R2_PUBLIC_URL}/${key}`
  const tagsRaw = formData.get('tags')
  const tags = typeof tagsRaw === 'string'
    ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    : []

  if (env.TURSO_URL) {
    const db = getDb(env)
    await db.execute(
      'INSERT INTO files (id, key, name, url, destination, tags, size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), key, file.name, url, 'r2', JSON.stringify(tags), file.size, Date.now()]
    )
  }

  return json({ url, key, name: file.name, size: file.size, tags })
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
