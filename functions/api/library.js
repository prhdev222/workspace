// functions/api/library.js
// GET /api/library  — list files stored in R2 under books/ prefix

const R2_PUBLIC_URL = 'https://pub-ab79910c37a84799a9cf9f45fe44da06.r2.dev'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}

function detectType(key) {
  const ext = key.split('.').pop().toLowerCase()
  if (['pdf'].includes(ext))                    return 'pdf'
  if (['epub'].includes(ext))                   return 'epub'
  if (['doc', 'docx'].includes(ext))            return 'doc'
  if (['ppt', 'pptx'].includes(ext))            return 'ppt'
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext))  return 'audio'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (['zip', 'rar', '7z'].includes(ext))       return 'archive'
  return 'file'
}

function parseName(key) {
  // key format: books/1717123456789-safe-name.pdf
  const filename = key.replace('books/', '')
  // strip leading timestamp (digits + dash)
  return filename.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\.[^.]+$/, m => m)
}

export async function onRequestGet({ env }) {
  if (!env.R2) return json({ error: 'R2 not configured' }, 500)

  const list = await env.R2.list({ prefix: 'books/', limit: 500 })

  const files = (list.objects || [])
    .filter(obj => obj.key !== 'books/')
    .map(obj => ({
      key:      obj.key,
      name:     parseName(obj.key),
      url:      `${R2_PUBLIC_URL}/${obj.key}`,
      size:     obj.size,
      type:     detectType(obj.key),
      uploaded: obj.uploaded?.toISOString?.() || null
    }))
    .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''))

  return json({ files })
}

export async function onRequestDelete({ request, env }) {
  if (!env.R2) return json({ error: 'R2 not configured' }, 500)

  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!key) return json({ error: 'Missing key' }, 400)

  // safety: only allow deleting from books/ prefix
  if (!key.startsWith('books/')) return json({ error: 'Forbidden' }, 403)

  await env.R2.delete(key)
  return json({ ok: true })
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
