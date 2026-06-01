#!/usr/bin/env node
/**
 * Workspace MCP Server — for Hermes Telegram bot
 * Exposes calendar/todo tools via MCP protocol
 *
 * Usage: node mcp-server.js
 * Env:   WORKSPACE_URL, BOT_API_KEY
 */

import { createServer } from 'node:net'
import { createInterface } from 'node:readline'

const WORKSPACE_URL = process.env.WORKSPACE_URL || 'https://workspace.pages.dev'
const BOT_API_KEY = process.env.BOT_API_KEY || ''

if (!BOT_API_KEY) {
  console.error('[mcp] ERROR: BOT_API_KEY not set')
  process.exit(1)
}

async function callApi(method, path, body) {
  const res = await fetch(`${WORKSPACE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BOT_API_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${method} ${path} → ${res.status}: ${err}`)
  }
  return res.json()
}

// Tool definitions
const TOOLS = [
  {
    name: 'add_appointment',
    description: 'บันทึกนัดหมาย/appointment ในปฏิทิน',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'ชื่อนัดหมาย เช่น "หมอฟัน รพ.สมิติเวช"' },
        start_date: { type: 'string', description: 'วันที่ รูปแบบ YYYY-MM-DD' },
        start_time: { type: 'string', description: 'เวลาเริ่ม รูปแบบ HH:MM' },
        end_time: { type: 'string', description: 'เวลาสิ้นสุด รูปแบบ HH:MM (optional)' },
        location: { type: 'string', description: 'สถานที่ (optional)' }
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
        text: { type: 'string', description: 'ชื่องาน' },
        due_date: { type: 'string', description: 'วันครบกำหนด รูปแบบ YYYY-MM-DD (optional)' },
        priority: { type: 'string', enum: ['high', 'med', 'low'], description: 'ความสำคัญ (default: med)' },
        section: { type: 'string', enum: ['today', 'upcoming', 'someday'], description: 'หมวด (default: today)' }
      },
      required: ['text']
    }
  },
  {
    name: 'list_agenda',
    description: 'ดูกำหนดการและ tasks ของวันนี้หรือสัปดาห์นี้',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'วันที่ต้องการดู รูปแบบ YYYY-MM-DD (default: วันนี้)' }
      }
    }
  },
  {
    name: 'list_todos',
    description: 'ดูรายการ todos/tasks ทั้งหมดที่ยังไม่เสร็จ',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
]

async function handleTool(name, input) {
  if (name === 'add_appointment') {
    const item = await callApi('POST', '/api/todos', {
      ...input,
      item_type: 'appointment',
      section: 'upcoming',
      due_date: input.start_date,
      due_label: input.start_date
    })
    return `✅ บันทึกนัดหมาย "${input.text}" วันที่ ${input.start_date}${input.start_time ? ' เวลา ' + input.start_time : ''}${input.location ? ' ที่ ' + input.location : ''} แล้วค่ะ`
  }

  if (name === 'add_task') {
    const item = await callApi('POST', '/api/todos', {
      ...input,
      item_type: 'task',
      due_label: input.due_date || 'today'
    })
    return `✅ เพิ่ม task "${input.text}"${input.due_date ? ' (ครบกำหนด ' + input.due_date + ')' : ''} แล้วค่ะ`
  }

  if (name === 'list_agenda') {
    const todos = await callApi('GET', '/api/todos')
    const targetDate = input.date || new Date().toISOString().slice(0, 10)
    const items = todos.filter(t =>
      !t.done && (t.start_date === targetDate || t.due_date === targetDate || t.due_label === 'today')
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
    const todos = await callApi('GET', '/api/todos')
    const pending = todos.filter(t => !t.done)
    if (pending.length === 0) return '✅ ไม่มี todo ที่ค้างอยู่'
    const lines = pending.slice(0, 10).map(t => `• ${t.text}`)
    return `📋 Todo (${pending.length} รายการ):\n${lines.join('\n')}${pending.length > 10 ? '\n...' : ''}`
  }

  throw new Error(`Unknown tool: ${name}`)
}

// MCP JSON-RPC over stdio
const rl = createInterface({ input: process.stdin, terminal: false })

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

rl.on('line', async (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }

  const { id, method, params } = msg

  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'workspace-mcp', version: '1.0.0' }
    }})
  }

  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params
    try {
      const result = await handleTool(name, args || {})
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: result }]
      }})
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: `❌ Error: ${e.message}` }],
        isError: true
      }})
    }
  }

  if (id != null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })
  }
})

console.error(`[mcp] Workspace MCP server ready → ${WORKSPACE_URL}`)
