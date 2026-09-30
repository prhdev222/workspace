// functions/api/bigfile-upload.js
// POST /api/bigfile-upload  — upload large file to Garage (self-hosted S3) under bigfiles/ prefix
// Returns { url } public URL, served via the Garage S3 API tunnel

import { AwsClient } from 'aws4fetch'
import { getDb } from './_db.js'

const GARAGE_ENDPOINT = 'https://s3.uraree.com'
const GARAGE_REGION = 'garage'
const GARAGE_BUCKET = 'workspace-bigfiles'
const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2GB — the whole point of this endpoint over R2's 200MB cap

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
  if (!env.MINIO_ACCESS_KEY || !env.MINIO_SECRET_KEY) {
    return json({ error: 'Garage credentials not configured' }, 500)
  }

  let formData
  try {
    formData = await request.formData()
  } catch {
    return json({ error: 'Invalid multipart form data' }, 400)
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') return json({ error: 'No file provided' }, 400)

  if (file.size > MAX_SIZE) return json({ error: 'File too large (max 2GB)' }, 413)

  const ext = file.name.split('.').pop().toLowerCase()
  const safeName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9ก-๙\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
  const key = `bigfiles/${Date.now()}-${safeName}.${ext}`

  const aws = new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    region: GARAGE_REGION,
    service: 's3'
  })

  const buffer = await file.arrayBuffer()
  const putUrl = `${GARAGE_ENDPOINT}/${GARAGE_BUCKET}/${key}`
  const putRes = await aws.fetch(putUrl, {
    method: 'PUT',
    body: buffer,
    headers: { 'Content-Type': file.type || 'application/octet-stream' }
  })

  if (!putRes.ok) {
    return json({ error: `Garage upload failed: ${putRes.status}` }, 502)
  }

  const url = `${GARAGE_ENDPOINT}/${GARAGE_BUCKET}/${key}`
  const tagsRaw = formData.get('tags')
  const tags = typeof tagsRaw === 'string'
    ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    : []

  if (env.TURSO_URL) {
    const db = getDb(env)
    await db.execute(
      'INSERT INTO files (id, key, name, url, destination, tags, size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), key, file.name, url, 'garage', JSON.stringify(tags), file.size, Date.now()]
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
