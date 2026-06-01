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

const TOOLS = [
  {
    name: 'add_appointment',
    description: 'บันทึกนัดหมาย/appointment ในปฏิทิน',
    inputSchema: {
      type: 'object',
      properties: {
        text:       { type: 'string', description: 'ชื่อนัดหมาย' },
        start_date: { type: 'string', description: 'วันที่ รูปแบบ YYYY-MM-DD' },
        start_time: { type: 'string', description: 'เวลาเริ่ม รูปแบบ HH:MM (optional)' },
        end_time:   { type: 'string', description: 'เวลาสิ้นสุด รูปแบบ HH:MM (optional)' },
        location:   { type: 'string', description: 'สถานที่ (optional)' }
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
  }
]

async function handleTool(name, input, env) {
  const db = getDb(env)

  if (name === 'add_appointment') {
    const id = crypto.randomUUID()
    const now = Date.now()
    await db.execute(
      'INSERT INTO todos (id, text, done, item_type, priority, start_date, due_date, start_time, end_time, location, attachment_url, due_label, section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, input.text, 0, 'appointment', 'med', input.start_date, input.start_date, input.start_time || null, input.end_time || null, input.location || '', '', input.start_date, 'upcoming', now]
    )
    return `✅ บันทึกนัดหมาย "${input.text}" วันที่ ${input.start_date}${input.start_time ? ' เวลา ' + input.start_time : ''}${input.location ? ' ที่ ' + input.location : ''} แล้วค่ะ`
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
