// functions/api/mcp.js
// HTTP MCP endpoint for Hermes Telegram bot
// POST /api/mcp  — MCP JSON-RPC over HTTP

import { getDb } from './_db.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
}

const R2_PUBLIC_URL = 'https://pub-ab79910c37a84799a9cf9f45fe44da06.r2.dev'

const TOOLS = [
  {
    name: 'upload_file',
    description: 'อัปโหลดไฟล์ (PDF, รูป) ขึ้น R2 แล้วได้ URL สำหรับแนบใน appointment',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'ชื่อไฟล์ เช่น meeting.pdf' },
        data:     { type: 'string', description: 'base64 encoded file content' },
        mime_type:{ type: 'string', description: 'เช่น application/pdf หรือ image/jpeg' }
      },
      required: ['filename', 'data']
    }
  },
  {
    name: 'add_appointment',
    description: 'บันทึกนัดหมาย/appointment ในปฏิทิน',
    inputSchema: {
      type: 'object',
      properties: {
        text:           { type: 'string', description: 'ชื่อนัดหมาย' },
        start_date:     { type: 'string', description: 'วันที่ รูปแบบ YYYY-MM-DD' },
        start_time:     { type: 'string', description: 'เวลาเริ่ม รูปแบบ HH:MM (optional)' },
        end_time:       { type: 'string', description: 'เวลาสิ้นสุด รูปแบบ HH:MM (optional)' },
        location:       { type: 'string', description: 'สถานที่ (optional)' },
        attachment_url: { type: 'string', description: 'URL ของไฟล์แนบ จาก upload_file (optional)' }
      },
      required: ['text', 'start_date']
    }
  },
  {
    name: 'add_task',
    description: 'เพิ่ม task/งานที่ต้องทำ',
    inputSchema: {
      type: 'object',
      properties: {
        text:     { type: 'string', description: 'ชื่องาน' },
        due_date: { type: 'string', description: 'วันครบกำหนด YYYY-MM-DD (optional)' },
        priority: { type: 'string', enum: ['high', 'med', 'low'], description: 'ความสำคัญ' },
        section:  { type: 'string', enum: ['today', 'upcoming', 'someday'], description: 'หมวด' }
      },
      required: ['text']
    }
  },
  {
    name: 'list_agenda',
    description: 'ดูกำหนดการและ tasks ของวันที่ระบุ',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'วันที่ YYYY-MM-DD (default: วันนี้)' }
      }
    }
  },
  {
    name: 'list_todos',
    description: 'ดูรายการ todos ทั้งหมดที่ยังไม่เสร็จ',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'create_idea',
    description: 'โพสต์ idea ใหม่ใน workspace',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'เนื้อหา idea' },
        emoji:   { type: 'string', description: 'emoji เช่น 💡 🔬 🧠 (optional)' },
        color:   { type: 'string', enum: ['teal', 'blue', 'purple', 'orange', 'pink'], description: 'สีการ์ด (default: teal)' }
      },
      required: ['content']
    }
  },
  {
    name: 'create_note',
    description: 'สร้าง note ใหม่ใน workspace พร้อมเนื้อหา',
    inputSchema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'ชื่อ note' },
        content: { type: 'string', description: 'เนื้อหา note (plain text หรือ markdown-style)' },
        tags:    { type: 'array', items: { type: 'string' }, description: 'tags เช่น ["research", "clinical"]' }
      },
      required: ['title']
    }
  },
  {
    name: 'add_book',
    description: 'เพิ่มหนังสือเข้า Digital Library (digital-library.uraree.com)',
    inputSchema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'ชื่อหนังสือ' },
        author:      { type: 'string', description: 'ชื่อผู้แต่ง (optional)' },
        description: { type: 'string', description: 'คำอธิบายหนังสือ (optional)' },
        category:    { type: 'string', description: 'หมวดหมู่ เช่น Medicine, Research, Anatomy (optional)' },
        links: {
          type: 'array',
          description: 'ลิงก์ต่างๆ (YouTube, Google Drive, MEGA, ฯลฯ) — label จะ auto-detect จาก URL',
          items: {
            type: 'object',
            properties: {
              url:   { type: 'string', description: 'URL ลิงก์' },
              label: { type: 'string', description: 'ชื่อลิงก์ (optional — auto-detect ได้)' }
            },
            required: ['url']
          }
        }
      },
      required: ['title']
    }
  },
  {
    name: 'add_book_link',
    description: 'เพิ่มลิงก์ให้หนังสือที่มีอยู่แล้วใน Digital Library',
    inputSchema: {
      type: 'object',
      properties: {
        book_title: { type: 'string', description: 'ชื่อหนังสือที่ต้องการเพิ่มลิงก์' },
        url:        { type: 'string', description: 'URL ลิงก์ (YouTube, Google Drive, MEGA, ฯลฯ)' },
        label:      { type: 'string', description: 'ชื่อลิงก์ (optional — auto-detect จาก URL)' }
      },
      required: ['book_title', 'url']
    }
  },
  {
    name: 'search_books',
    description: 'ค้นหาหนังสือใน Digital Library',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'คำค้นหา ชื่อหนังสือหรือผู้แต่ง' },
        limit: { type: 'number', description: 'จำนวนผลลัพธ์สูงสุด (default: 5)' }
      },
      required: ['query']
    }
  }
]

function detectLinkLabel(url) {
  if (/youtube\.com|youtu\.be/.test(url))        return 'YouTube'
  if (/drive\.google\.com/.test(url))            return 'Google Drive'
  if (/docs\.google\.com/.test(url))             return 'Google Docs'
  if (/mega\.nz|mega\.co\.nz/.test(url))         return 'MEGA'
  if (/dropbox\.com/.test(url))                  return 'Dropbox'
  if (/github\.com/.test(url))                   return 'GitHub'
  if (/onedrive\.live\.com|1drv\.ms/.test(url))  return 'OneDrive'
  if (/mediafire\.com/.test(url))                return 'MediaFire'
  if (/archive\.org/.test(url))                  return 'Archive.org'
  if (/\.(pdf)(\?|$)/i.test(url))               return 'ดาวน์โหลด PDF'
  return 'ดาวน์โหลด'
}

async function pbAuth(env) {
  const pbUrl = env.PB_URL || 'https://pb.uraree.com'
  const res = await fetch(`${pbUrl}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASSWORD })
  })
  if (!res.ok) throw new Error(`PocketBase auth failed: ${res.status}`)
  const data = await res.json()
  return { token: data.token, pbUrl }
}

async function handleTool(name, input, env) {
  const db = getDb(env)

  if (name === 'upload_file') {
    if (!env.R2) throw new Error('R2 binding not configured')
    const { filename, data, mime_type = 'application/octet-stream' } = input
    const ext = filename.split('.').pop().toLowerCase()
    const key = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
    const binary = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    await env.R2.put(key, binary, { httpMetadata: { contentType: mime_type } })
    const url = `${R2_PUBLIC_URL}/${key}`
    return `✅ อัปโหลดสำเร็จ\nURL: ${url}`
  }

  if (name === 'add_appointment') {
    const id = crypto.randomUUID()
    const now = Date.now()
    await db.execute(
      'INSERT INTO todos (id, text, done, item_type, priority, start_date, due_date, start_time, end_time, location, attachment_url, due_label, section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.text, 0, 'appointment', 'med', input.start_date, input.start_date, input.start_time || null, input.end_time || null, input.location || '', input.attachment_url || '', input.start_date, 'upcoming', now]
    )
    return `✅ บันทึกนัดหมาย "${input.text}" วันที่ ${input.start_date}${input.start_time ? ' เวลา ' + input.start_time : ''}${input.location ? ' ที่ ' + input.location : ''}${input.attachment_url ? ' 📎' : ''} แล้วค่ะ`
  }

  if (name === 'add_task') {
    const id = crypto.randomUUID()
    const now = Date.now()
    const dueDate = input.due_date || null
    await db.execute(
      'INSERT INTO todos (id, text, done, item_type, priority, start_date, due_date, start_time, end_time, location, attachment_url, due_label, section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.text, 0, 'task', input.priority || 'med', dueDate, dueDate, null, null, '', '', dueDate || 'today', input.section || 'today', now]
    )
    return `✅ เพิ่ม task "${input.text}"${dueDate ? ' (ครบกำหนด ' + dueDate + ')' : ''} แล้วค่ะ`
  }

  if (name === 'list_agenda') {
    const targetDate = input.date || new Date().toISOString().slice(0, 10)
    const { rows } = await db.execute('SELECT * FROM todos WHERE done = 0 ORDER BY start_time ASC, created_at DESC')
    const items = rows.filter(t =>
      t.start_date === targetDate || t.due_date === targetDate || (targetDate === new Date().toISOString().slice(0, 10) && t.due_label === 'today')
    )
    if (items.length === 0) return `📅 ไม่มีกำหนดการสำหรับ ${targetDate}`
    const lines = items.map(t => {
      const time = t.start_time ? ` ${t.start_time}` : ''
      const loc = t.location ? ` @ ${t.location}` : ''
      const icon = t.item_type === 'appointment' ? '📍' : '✅'
      return `${icon}${time} ${t.text}${loc}`
    })
    return `📅 กำหนดการ ${targetDate}:\n${lines.join('\n')}`
  }

  if (name === 'list_todos') {
    const { rows } = await db.execute('SELECT * FROM todos WHERE done = 0 ORDER BY created_at DESC LIMIT 20')
    if (rows.length === 0) return '✅ ไม่มี todo ที่ค้างอยู่'
    const lines = rows.map(t => {
      const icon = t.item_type === 'appointment' ? '📍' : '✅'
      return `${icon} ${t.text}${t.due_date ? ' (' + t.due_date + ')' : ''}`
    })
    return `📋 Todo (${rows.length} รายการ):\n${lines.join('\n')}`
  }

  if (name === 'create_idea') {
    const id = crypto.randomUUID()
    const now = Date.now()
    const EMOJIS = ['💡','🔬','📌','🧠','⚡','🌱','🔭','🎯','📡','🧪','💊','🩺','📊','🌀','✨']
    const emoji = input.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
    await db.execute(
      'INSERT INTO ideas (id, content, color, emoji, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, input.content, input.color || 'teal', emoji, now]
    )
    return `${emoji} โพสต์ idea แล้วค่ะ: "${input.content}"`
  }

  if (name === 'create_note') {
    const id = crypto.randomUUID()
    const now = Date.now()
    const tags = Array.isArray(input.tags) ? input.tags : []
    await db.execute(
      'INSERT INTO notes (id, title, tags, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, input.title || 'Untitled', JSON.stringify(tags), null, now, now, now]
    )
    if (input.content) {
      const lines = input.content.split('\n').filter(l => l.trim())
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const type = line.startsWith('# ') ? 'heading' : line.startsWith('- ') ? 'bullet' : 'text'
        const text = line.replace(/^#+\s/, '').replace(/^-\s/, '')
        await db.execute(
          'INSERT INTO blocks (id, note_id, type, content, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), id, type, text, i, now]
        )
      }
    }
    return `📝 สร้าง note "${input.title}" แล้วค่ะ${tags.length ? ' tags: ' + tags.join(', ') : ''}\nURL: https://space.uraree.com`
  }

  if (name === 'add_book') {
    const { token, pbUrl } = await pbAuth(env)
    const headers = { 'Content-Type': 'application/json', 'Authorization': token }

    // find or create category
    let categoryId = null
    if (input.category) {
      const catFilter = encodeURIComponent(`name="${input.category}"`)
      const catRes = await fetch(`${pbUrl}/api/collections/categories/records?filter=${catFilter}&perPage=1`, { headers })
      const catData = await catRes.json()
      if (catData.items?.length > 0) {
        categoryId = catData.items[0].id
      } else {
        const newCat = await fetch(`${pbUrl}/api/collections/categories/records`, {
          method: 'POST', headers,
          body: JSON.stringify({ name: input.category })
        })
        const newCatData = await newCat.json()
        categoryId = newCatData.id
      }
    }

    // create book record
    const bookBody = {
      title: input.title,
      author: input.author || '',
      description: input.description || '',
      ...(categoryId && { category: categoryId })
    }
    const bookRes = await fetch(`${pbUrl}/api/collections/books/records`, {
      method: 'POST', headers,
      body: JSON.stringify(bookBody)
    })
    const book = await bookRes.json()
    if (!bookRes.ok) throw new Error(`สร้างหนังสือไม่ได้: ${JSON.stringify(book)}`)

    // create book_links
    const links = Array.isArray(input.links) ? input.links : []
    for (const link of links) {
      await fetch(`${pbUrl}/api/collections/book_links/records`, {
        method: 'POST', headers,
        body: JSON.stringify({ book: book.id, url: link.url, label: link.label || detectLinkLabel(link.url) })
      })
    }

    const linkSummary = links.map(l => `🔗 ${l.label || detectLinkLabel(l.url)}`).join(' ')
    return `📚 เพิ่มหนังสือ "${input.title}"${input.author ? ' โดย ' + input.author : ''} เข้า Digital Library แล้วค่ะ${input.category ? ' (หมวด: ' + input.category + ')' : ''}${linkSummary ? '\n' + linkSummary : ''}\nhttps://digital-library.uraree.com`
  }

  if (name === 'add_book_link') {
    const { token, pbUrl } = await pbAuth(env)
    const headers = { 'Content-Type': 'application/json', 'Authorization': token }

    // find book by title
    const filter = encodeURIComponent(`title~"${input.book_title}"`)
    const res = await fetch(`${pbUrl}/api/collections/books/records?filter=${filter}&perPage=1`, { headers })
    const data = await res.json()
    if (!data.items?.length) throw new Error(`ไม่พบหนังสือ "${input.book_title}" ในระบบ`)

    const book = data.items[0]
    const label = input.label || detectLinkLabel(input.url)
    await fetch(`${pbUrl}/api/collections/book_links/records`, {
      method: 'POST', headers,
      body: JSON.stringify({ book: book.id, url: input.url, label })
    })

    return `🔗 เพิ่มลิงก์ ${label} ให้หนังสือ "${book.title}" แล้วค่ะ\nhttps://digital-library.uraree.com`
  }

  if (name === 'search_books') {
    const pbUrl = env.PB_URL || 'https://pb.uraree.com'
    const q = input.query
    const limit = input.limit || 5
    const filter = encodeURIComponent(`title~"${q}" || author~"${q}"`)
    const res = await fetch(
      `${pbUrl}/api/collections/books/records?filter=${filter}&perPage=${limit}&expand=category`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`ค้นหาไม่ได้: ${res.status}`)
    const data = await res.json()
    if (!data.items?.length) return `🔍 ไม่พบหนังสือที่ค้นหา "${q}"`
    const lines = data.items.map(b => {
      const cat = b.expand?.category?.name || ''
      return `📖 ${b.title}${b.author ? ' — ' + b.author : ''}${cat ? ' [' + cat + ']' : ''}`
    })
    return `🔍 พบ ${data.items.length} รายการ สำหรับ "${q}":\n${lines.join('\n')}\nhttps://digital-library.uraree.com`
  }

  throw new Error(`Unknown tool: ${name}`)
}

export async function onRequestPost({ request, env }) {
  let msg
  try { msg = await request.json() } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }

  const { id, method, params } = msg

  if (method === 'initialize') {
    return json({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'workspace-mcp', version: '1.0.0' }
    }})
  }

  if (method === 'tools/list') {
    return json({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params
    try {
      const result = await handleTool(name, args || {}, env)
      return json({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: result }]
      }})
    } catch (e) {
      return json({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `❌ Error: ${e.message}` }],
        isError: true
      }})
    }
  }

  return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })
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
