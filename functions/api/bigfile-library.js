// functions/api/bigfile-library.js
// GET /api/bigfile-library     — list files stored in Garage under bigfiles/ prefix
// DELETE /api/bigfile-library  — delete a file by key

import { AwsClient } from 'aws4fetch'

const GARAGE_ENDPOINT = 'https://s3.uraree.com'
const GARAGE_REGION = 'garage'
const GARAGE_BUCKET = 'workspace-bigfiles'

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
  const filename = key.includes('/') ? key.split('/').pop() : key
  return filename
    .replace(/^\d{10,}-[a-f0-9]+-/, '')
    .replace(/^\d{10,}-/, '')
    .replace(/-/g, ' ')
    || filename
}

// Minimal ListBucketResult XML parser — only the fields we use (Key, Size, LastModified)
function parseListXml(xml) {
  const objects = []
  const contentsRe = /<Contents>([\s\S]*?)<\/Contents>/g
  let m
  while ((m = contentsRe.exec(xml))) {
    const block = m[1]
    const key = (block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1]
    const size = (block.match(/<Size>([\s\S]*?)<\/Size>/) || [])[1]
    const lastModified = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1]
    if (key) objects.push({ key, size: Number(size) || 0, uploaded: lastModified || null })
  }
  return objects
}

function getClient(env) {
  return new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    region: GARAGE_REGION,
    service: 's3'
  })
}

export async function onRequestGet({ env }) {
  if (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) {
    return json({ error: 'Garage credentials not configured' }, 500)
  }

  const aws = getClient(env)
  const listUrl = `${GARAGE_ENDPOINT}/${GARAGE_BUCKET}?list-type=2&prefix=bigfiles/`
  const res = await aws.fetch(listUrl)
  if (!res.ok) return json({ error: `Garage list failed: ${res.status}` }, 502)

  const xml = await res.text()
  const objects = parseListXml(xml).filter(o => o.key !== 'bigfiles/')

  const files = objects
    .map(obj => ({
      key:      obj.key,
      name:     parseName(obj.key),
      url:      `${GARAGE_ENDPOINT}/${GARAGE_BUCKET}/${obj.key}`,
      size:     obj.size,
      type:     detectType(obj.key),
      uploaded: obj.uploaded
    }))
    .sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''))

  return json({ files })
}

export async function onRequestDelete({ request, env }) {
  if (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) {
    return json({ error: 'Garage credentials not configured' }, 500)
  }

  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!key) return json({ error: 'Missing key' }, 400)
  if (key.includes('..')) return json({ error: 'Forbidden' }, 403)

  const aws = getClient(env)
  const delRes = await aws.fetch(`${GARAGE_ENDPOINT}/${GARAGE_BUCKET}/${key}`, { method: 'DELETE' })
  if (!delRes.ok && delRes.status !== 404) {
    return json({ error: `Garage delete failed: ${delRes.status}` }, 502)
  }

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
