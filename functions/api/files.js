// functions/api/files.js
// GET /api/files[?tag=x]  — unified file list across R2 + Garage, tags overlaid from Turso
// DELETE /api/files?key=..&destination=r2|garage

import { AwsClient } from 'aws4fetch'
import { getDb } from './_db.js'

const R2_PUBLIC_URL = 'https://pub-ab79910c37a84799a9cf9f45fe44da06.r2.dev'
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

async function listR2(env) {
  if (!env.R2) return []
  const [rootList, booksList] = await Promise.all([
    env.R2.list({ limit: 500 }),
    env.R2.list({ prefix: 'books/', limit: 500 })
  ])
  const booksKeys = new Set((booksList.objects || []).map(o => o.key))
  return [
    ...(rootList.objects || []).filter(o => !o.key.endsWith('/') && !booksKeys.has(o.key)),
    ...(booksList.objects || []).filter(o => o.key !== 'books/')
  ].map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded?.toISOString?.() || null,
    url: `${R2_PUBLIC_URL}/${obj.key}`,
    destination: 'r2'
  }))
}

async function listGarage(env) {
  if (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) return []
  const aws = new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    region: GARAGE_REGION,
    service: 's3'
  })
  const res = await aws.fetch(`${GARAGE_ENDPOINT}/${GARAGE_BUCKET}?list-type=2&prefix=bigfiles/`)
  if (!res.ok) return []
  const xml = await res.text()
  return parseListXml(xml)
    .filter(o => o.key !== 'bigfiles/')
    .map(obj => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded,
      url: `${GARAGE_ENDPOINT}/${GARAGE_BUCKET}/${obj.key}`,
      destination: 'garage'
    }))
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const tagFilter = url.searchParams.get('tag')

  const [r2Files, garageFiles, tagRows] = await Promise.all([
    listR2(env),
    listGarage(env),
    env.TURSO_URL ? getDb(env).execute('SELECT key, tags FROM files').then(r => r.rows) : Promise.resolve([])
  ])

  const tagsByKey = new Map(tagRows.map(r => [r.key, JSON.parse(r.tags || '[]')]))

  let files = [...r2Files, ...garageFiles].map(obj => ({
    key:      obj.key,
    name:     parseName(obj.key),
    url:      obj.url,
    size:     obj.size,
    type:     detectType(obj.key),
    uploaded: obj.uploaded,
    destination: obj.destination,
    tags:     tagsByKey.get(obj.key) || []
  }))

  if (tagFilter) {
    files = files.filter(f => f.tags.includes(tagFilter))
  }

  files.sort((a, b) => (b.uploaded || '').localeCompare(a.uploaded || ''))

  const allTags = [...new Set([...tagsByKey.values()].flat())].sort()

  return json({ files, allTags })
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  const destination = url.searchParams.get('destination')
  if (!key || !destination) return json({ error: 'Missing key or destination' }, 400)
  if (key.includes('..')) return json({ error: 'Forbidden' }, 403)

  if (destination === 'r2') {
    if (!env.R2) return json({ error: 'R2 not configured' }, 500)
    await env.R2.delete(key)
  } else if (destination === 'garage') {
    if (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) return json({ error: 'Garage not configured' }, 500)
    const aws = new AwsClient({
      accessKeyId: env.MINIO_ACCESS_KEY,
      secretAccessKey: env.MINIO_SECRET_KEY,
      region: GARAGE_REGION,
      service: 's3'
    })
    const delRes = await aws.fetch(`${GARAGE_ENDPOINT}/${GARAGE_BUCKET}/${key}`, { method: 'DELETE' })
    if (!delRes.ok && delRes.status !== 404) return json({ error: `Garage delete failed: ${delRes.status}` }, 502)
  } else {
    return json({ error: 'Unknown destination' }, 400)
  }

  if (env.TURSO_URL) {
    await getDb(env).execute('DELETE FROM files WHERE key = ?', [key])
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
