// functions/api/ai-assistant.js
// POST /api/ai-assistant  { message: string }
// Protected by _middleware.js session check
// Uses Anthropic API to parse natural language → create Note/Todo/Appointment in Turso

import { getDb } from './_db.js'

const SYSTEM_PROMPT = `You are an AI assistant embedded in a personal workspace app (Notes, To-Do, Calendar).
The user speaks Thai and/or English. Your job is to understand their message and extract structured data to create one of:
  1. "note"        — a note with title and content blocks
  2. "todo"        — a task with priority and due date
  3. "appointment" — a calendar event with date, time range, location

TODAY is: {{TODAY}}

Respond ONLY with valid JSON — no markdown, no backticks, no explanation outside the JSON.

JSON schema:
{
  "type": "note" | "todo" | "appointment" | "clarify",
  "summary": "<Thai/EN short confirmation sentence, e.g. 'สร้างนัดตรวจเลือดวันพรุ่งนี้ 10:00 ที่ lab แล้วค่ะ'>",
  "data": {
    // For type=note:
    "title": "string",
    "content": "string (full text content)",
    "tags": ["clinical"|"lecture"|"idea"|"todo"],

    // For type=todo:
    "text": "string (task description)",
    "priority": "high"|"med"|"low",
    "due_date": "YYYY-MM-DD or null",
    "section": "today"|"upcoming",

    // For type=appointment:
    "text": "string (appointment title)",
    "due_date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM or null",
    "location": "string or null",
    "priority": "med",
    "section": "upcoming",

    // For type=clarify:
    "question": "string (ask user what's missing)"
  }
}

Examples:
User: "นัดตรวจเลือด พรุ่งนี้ 10 โมง ที่ lab"
→ { "type": "appointment", "summary": "สร้างนัด ตรวจเลือด วันพรุ่งนี้ 10:00 ที่ lab แล้วค่ะ", "data": { "text": "ตรวจเลือด", "due_date": "{{TOMORROW}}", "start_time": "10:00", "end_time": null, "location": "lab", "priority": "med", "section": "upcoming" } }

User: "todo ส่ง case report ภายในวันศุกร์ priority สูง"
→ { "type": "todo", "summary": "เพิ่ม task: ส่ง case report ภายในวันศุกร์ priority สูง แล้วค่ะ", "data": { "text": "ส่ง case report", "priority": "high", "due_date": "{{NEXT_FRIDAY}}", "section": "upcoming" } }

User: "note BCR-ABL monitoring: ตรวจ PCR ทุก 3 เดือน หลังได้ imatinib"
→ { "type": "note", "summary": "สร้าง note: BCR-ABL monitoring แล้วค่ะ", "data": { "title": "BCR-ABL monitoring", "content": "ตรวจ PCR ทุก 3 เดือน หลังได้ imatinib", "tags": ["clinical"] } }

If unclear, use type=clarify and ask a short question.`

function getTodayStrings() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

  const today = fmt(now)
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = fmt(tomorrow)

  // next friday
  const dayOfWeek = now.getDay() // 0=sun, 5=fri
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7
  const nextFriday = new Date(now); nextFriday.setDate(nextFriday.getDate() + daysUntilFriday)
  const nextFridayStr = fmt(nextFriday)

  // next monday
  const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7
  const nextMonday = new Date(now); nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
  const nextMondayStr = fmt(nextMonday)

  return { today, tomorrow: tomorrowStr, nextFriday: nextFridayStr, nextMonday: nextMondayStr }
}

function buildSystemPrompt() {
  const { today, tomorrow, nextFriday, nextMonday } = getTodayStrings()
  return SYSTEM_PROMPT
    .replace('{{TODAY}}', today)
    .replace('{{TOMORROW}}', tomorrow)
    .replace('{{NEXT_FRIDAY}}', nextFriday)
    .replace('{{NEXT_MONDAY}}', nextMonday)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function onRequestPost({ request, env }) {
  try {
    const { message } = await request.json()
    if (!message?.trim()) return json({ error: 'No message' }, 400)

    const anthropicKey = env.ANTHROPIC_API_KEY
    if (!anthropicKey) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

    // ── 1. Call Claude API ────────────────────────────────────────────────────
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',  // fast + cheap for this parsing task
        max_tokens: 512,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: message.trim() }]
      })
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      throw new Error(`Anthropic API error ${aiRes.status}: ${errText}`)
    }

    const aiData = await aiRes.json()
    const rawText = aiData.content?.[0]?.text || ''

    // ── 2. Parse JSON from Claude ─────────────────────────────────────────────
    let parsed
    try {
      // Claude sometimes wraps in ```json ... ``` even when asked not to
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error(`Could not parse AI response: ${rawText.slice(0, 200)}`)
    }

    const { type, summary, data: d } = parsed

    // ── 3. clarify — just return the question, no DB write ────────────────────
    if (type === 'clarify') {
      return json({ type: 'clarify', summary: d.question || summary, action: 'clarify', result: null })
    }

    // ── 4. Write to Turso ─────────────────────────────────────────────────────
    const db = getDb(env)
    const id = crypto.randomUUID()
    const now = Date.now()
    let result = null

    if (type === 'note') {
      const title = d.title || 'Untitled note'
      const tags = JSON.stringify(d.tags || [])
      await db.execute(
        'INSERT INTO notes (id, title, tags, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, title, tags, null, now, now, now]
      )
      // Insert a single text block with the content
      if (d.content?.trim()) {
        const blockId = crypto.randomUUID()
        await db.execute(
          'INSERT INTO blocks (id, note_id, type, content, done, position) VALUES (?, ?, ?, ?, ?, ?)',
          [blockId, id, 'text', d.content.trim(), 0, 0]
        )
      }
      result = {
        id, title,
        tags: d.tags || [],
        parent_id: null,
        sort_order: now,
        created_at: String(now),
        updated_at: String(now),
        blocks: d.content?.trim()
          ? [{ id: crypto.randomUUID(), note_id: id, type: 'text', content: d.content.trim(), done: false, position: 0 }]
          : []
      }
    }

    else if (type === 'todo' || type === 'appointment') {
      const isAppt = type === 'appointment'
      const itemType = isAppt ? 'appointment' : 'task'
      const text = d.text || 'Untitled'
      const priority = d.priority || 'med'
      const dueDate = d.due_date || null
      const startTime = isAppt ? (d.start_time || null) : null
      const endTime = isAppt ? (d.end_time || null) : null
      const location = isAppt ? (d.location || '') : ''
      const dueLabel = dueDate || 'today'
      const section = d.section || (dueDate ? 'upcoming' : 'today')

      await db.execute(
        `INSERT INTO todos
          (id, text, done, item_type, priority, start_date, due_date, start_time, end_time,
           location, attachment_url, due_label, section, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, text, 0, itemType, priority, dueDate, dueDate, startTime, endTime,
         location, '', dueLabel, section, now]
      )
      result = {
        id, text, done: false, item_type: itemType, priority,
        start_date: dueDate, due_date: dueDate,
        start_time: startTime, end_time: endTime,
        location, attachment_url: '', due_label: dueLabel,
        section, created_at: String(now)
      }
    }

    return json({ type, summary, action: `created_${type}`, result })

  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
