// functions/api/ai-assistant.js
// POST /api/ai-assistant  { message: string }
// Protected by _middleware.js session check
// Uses Anthropic API to parse natural language → create Note/Todo/Appointment in Turso

import { getDb } from './_db.js'

const SYSTEM_PROMPT = `You are an AI assistant embedded in a personal workspace app (Notes, To-Do, Calendar, Health Log).
The user speaks Thai and/or English. Your job is to understand their message and extract structured data to create, update, or delete workspace items.
For creates, create one of:
  1. "note"        — a note with title and content blocks
  2. "todo"        — a task with priority and due date
  3. "appointment" — a calendar event with date, time range, location
  4. "health"      — a health log entry (period start/end, vaccination, symptom, medication, etc.)

For appointment updates/deletes, return type "appointment" and action "update" or "delete".
If the request is ambiguous, use type "clarify".

TODAY is: {{TODAY}}

Respond ONLY with valid JSON — no markdown, no backticks, no explanation outside the JSON.

JSON schema:
{
  "type": "note" | "todo" | "appointment" | "health" | "clarify",
  "action": "create" | "update" | "delete",
  "summary": "<Thai/EN short confirmation sentence>",
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
    "color": "teal"|"blue"|"purple"|"orange"|"pink"|"red"|"green" or null,
    "priority": "med",
    "section": "upcoming",

    // For action=update/delete appointment:
    "match_text": "appointment title or search phrase",
    "match_date": "YYYY-MM-DD or null",
    "match_start_time": "HH:MM or null",
    "updates": {
      "text": "new appointment title or null",
      "due_date": "new YYYY-MM-DD or null",
      "start_date": "new YYYY-MM-DD or null",
      "start_time": "new HH:MM or null",
      "end_time": "new HH:MM or null",
      "location": "new location or null",
      "color": "teal"|"blue"|"purple"|"orange"|"pink"|"red"|"green" or null
    },

    // For type=health:
    "text": "string (emoji + label, e.g. '🩸 Period Start')",
    "due_date": "YYYY-MM-DD (default today)",
    "note": "string or null (optional detail, e.g. vaccine name, symptom detail)",

    // For type=clarify:
    "question": "string (ask user what's missing)"
  }
}

Health keyword mapping (detect these in Thai and English):
- "ประจำเดือนมา" | "รอบเดือนมา" | "period start" | "mens" | "menstruation start" | "เริ่มประจำเดือน" → text: "🩸 Period Start"
- "ประจำเดือนหยุด" | "รอบเดือนหยุด" | "period end" | "period stop" | "หมดประจำเดือน" → text: "🔴 Period End"
- "ฉีดวัคซีน" | "วัคซีน" | "vaccination" | "vaccine" | "vaccinated" → text: "💉 Vaccination" (append vaccine name to note if mentioned)
- "ปวดหัว" | "ไม่สบาย" | "not feeling well" | "sick" → text: "🤒 Not feeling well"
- "กินยา" | "ทานยา" | "medication" | "took medicine" → text: "💊 Medication"

Examples:
User: "นัดตรวจเลือด พรุ่งนี้ 10 โมง ที่ lab"
→ { "type": "appointment", "action": "create", "summary": "สร้างนัด ตรวจเลือด วันพรุ่งนี้ 10:00 ที่ lab แล้วค่ะ", "data": { "text": "ตรวจเลือด", "due_date": "{{TOMORROW}}", "start_time": "10:00", "end_time": null, "location": "lab", "color": "teal", "priority": "med", "section": "upcoming" } }

User: "ลบนัดตรวจเลือดพรุ่งนี้"
→ { "type": "appointment", "action": "delete", "summary": "ลบนัด ตรวจเลือด วันพรุ่งนี้แล้วค่ะ", "data": { "match_text": "ตรวจเลือด", "match_date": "{{TOMORROW}}", "match_start_time": null } }

User: "เปลี่ยนสีนัดตรวจเลือดพรุ่งนี้เป็นสีม่วง"
→ { "type": "appointment", "action": "update", "summary": "เปลี่ยนสีนัด ตรวจเลือด เป็นสีม่วงแล้วค่ะ", "data": { "match_text": "ตรวจเลือด", "match_date": "{{TOMORROW}}", "match_start_time": null, "updates": { "color": "purple" } } }

User: "todo ส่ง case report ภายในวันศุกร์ priority สูง"
→ { "type": "todo", "action": "create", "summary": "เพิ่ม task: ส่ง case report ภายในวันศุกร์ priority สูง แล้วค่ะ", "data": { "text": "ส่ง case report", "priority": "high", "due_date": "{{NEXT_FRIDAY}}", "section": "upcoming" } }

User: "note BCR-ABL monitoring: ตรวจ PCR ทุก 3 เดือน หลังได้ imatinib"
→ { "type": "note", "action": "create", "summary": "สร้าง note: BCR-ABL monitoring แล้วค่ะ", "data": { "title": "BCR-ABL monitoring", "content": "ตรวจ PCR ทุก 3 เดือน หลังได้ imatinib", "tags": ["clinical"] } }

User: "ประจำเดือนมาวันนี้"
→ { "type": "health", "action": "create", "summary": "บันทึก 🩸 Period Start วันนี้แล้วค่ะ", "data": { "text": "🩸 Period Start", "due_date": "{{TODAY}}", "note": null } }

User: "period stop"
→ { "type": "health", "action": "create", "summary": "บันทึก 🔴 Period End วันนี้แล้วค่ะ", "data": { "text": "🔴 Period End", "due_date": "{{TODAY}}", "note": null } }

User: "ฉีดวัคซีน COVID วันนี้"
→ { "type": "health", "action": "create", "summary": "บันทึก 💉 Vaccination (COVID) วันนี้แล้วค่ะ", "data": { "text": "💉 Vaccination", "due_date": "{{TODAY}}", "note": "COVID" } }

If unclear, use type=clarify and ask a short question.`

const APPOINTMENT_COLORS = new Set(['teal', 'blue', 'purple', 'orange', 'pink', 'red', 'green'])

const COLOR_ALIASES = {
  turquoise: 'teal',
  cyan: 'blue',
  violet: 'purple',
  lavender: 'purple',
  yellow: 'orange',
  amber: 'orange',
  rose: 'pink',
  fuchsia: 'pink',
  lime: 'green',
  'สีเขียว': 'green',
  'เขียว': 'green',
  'สีฟ้า': 'blue',
  'ฟ้า': 'blue',
  'สีน้ำเงิน': 'blue',
  'น้ำเงิน': 'blue',
  'สีม่วง': 'purple',
  'ม่วง': 'purple',
  'สีส้ม': 'orange',
  'ส้ม': 'orange',
  'สีชมพู': 'pink',
  'ชมพู': 'pink',
  'สีแดง': 'red',
  'แดง': 'red'
}

function normalizeColor(value) {
  if (!value) return null
  const key = String(value).trim().toLowerCase()
  const normalized = COLOR_ALIASES[key] || key
  return APPOINTMENT_COLORS.has(normalized) ? normalized : null
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function rowToTodo(row) {
  return {
    ...row,
    done: row.done === '1' || row.done === 1,
    color: row.color || 'teal'
  }
}

function appointmentDate(row) {
  return row.start_date || row.due_date || (/^\d{4}-\d{2}-\d{2}$/.test(row.due_label || '') ? row.due_label : null)
}

async function findAppointment(db, criteria = {}) {
  const { rows } = await db.execute(
    "SELECT * FROM todos WHERE item_type = 'appointment' AND done = 0 ORDER BY start_date ASC, start_time ASC, created_at DESC"
  )
  let matches = rows.map(rowToTodo)
  const matchText = normalizeText(criteria.match_text || criteria.text || criteria.title)
  const matchDate = criteria.match_date || criteria.start_date || criteria.due_date || null
  const matchStartTime = criteria.match_start_time || criteria.start_time || null

  if (matchText) {
    matches = matches.filter(row => normalizeText(row.text).includes(matchText))
  }
  if (matchDate) {
    matches = matches.filter(row => appointmentDate(row) === matchDate)
  }
  if (matchStartTime) {
    matches = matches.filter(row => row.start_time === matchStartTime)
  }

  return matches
}

function describeAppointment(item) {
  const date = appointmentDate(item) || 'no date'
  const time = item.start_time ? ` ${item.start_time}` : ''
  return `"${item.text}" ${date}${time}`
}

function buildAppointmentUpdates(data = {}) {
  const source = data.updates || {}
  const updates = {}

  if ('text' in source && source.text) updates.text = source.text
  if ('priority' in source && source.priority) updates.priority = source.priority
  if ('start_time' in source) updates.start_time = source.start_time || null
  if ('end_time' in source) updates.end_time = source.end_time || null
  if ('location' in source) updates.location = source.location || ''
  if ('color' in source) {
    const color = normalizeColor(source.color)
    if (color) updates.color = color
  }

  const nextDate = source.start_date || source.due_date
  if (nextDate) {
    updates.start_date = nextDate
    updates.due_date = nextDate
    updates.due_label = nextDate
    updates.section = 'upcoming'
  }

  return updates
}

async function updateTodoFields(db, id, fields) {
  const entries = Object.entries(fields)
  if (!entries.length) return
  await db.execute(
    `UPDATE todos SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
    [...entries.map(([, value]) => value), id]
  )
}

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
    .replaceAll('{{TODAY}}', today)
    .replaceAll('{{TOMORROW}}', tomorrow)
    .replaceAll('{{NEXT_FRIDAY}}', nextFriday)
    .replaceAll('{{NEXT_MONDAY}}', nextMonday)
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

    const { type, summary } = parsed
    const action = parsed.action || 'create'
    const d = parsed.data || {}

    // ── 3. clarify — just return the question, no DB write ────────────────────
    if (type === 'clarify') {
      return json({ type: 'clarify', summary: d.question || summary, action: 'clarify', result: null })
    }

    // ── 4. Write to Turso ─────────────────────────────────────────────────────
    const db = getDb(env)
    const id = crypto.randomUUID()
    const now = Date.now()
    let result = null

    if (type === 'appointment' && (action === 'delete' || action === 'update')) {
      const matches = await findAppointment(db, d)

      if (matches.length === 0) {
        return json({
          type: 'clarify',
          summary: 'ไม่พบนัดที่ตรงกับคำขอค่ะ ช่วยบอกชื่อ วัน หรือเวลาอีกนิดได้ไหมคะ',
          action: 'clarify',
          result: null
        })
      }

      if (matches.length > 1) {
        const choices = matches.slice(0, 5).map(describeAppointment).join(', ')
        return json({
          type: 'clarify',
          summary: `เจอนัดมากกว่า 1 รายการ: ${choices} — ต้องการแก้/ลบรายการไหนคะ`,
          action: 'clarify',
          result: null
        })
      }

      const appointment = matches[0]

      if (action === 'delete') {
        await db.execute('DELETE FROM todos WHERE id = ?', [appointment.id])
        return json({
          type: 'appointment',
          summary: summary || `ลบนัด ${appointment.text} แล้วค่ะ`,
          action: 'deleted_appointment',
          result: appointment
        })
      }

      const updates = buildAppointmentUpdates(d)
      if (!Object.keys(updates).length) {
        return json({
          type: 'clarify',
          summary: 'ต้องการเปลี่ยนข้อมูลอะไรของนัดนี้คะ เช่น เวลา สถานที่ หรือสี',
          action: 'clarify',
          result: null
        })
      }

      await updateTodoFields(db, appointment.id, updates)
      return json({
        type: 'appointment',
        summary: summary || `อัปเดตนัด ${appointment.text} แล้วค่ะ`,
        action: 'updated_appointment',
        result: { ...appointment, ...updates }
      })
    }

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
      const color = isAppt ? (normalizeColor(d.color) || 'teal') : ''
      const dueLabel = dueDate || 'today'
      const section = d.section || (dueDate ? 'upcoming' : 'today')

      await db.execute(
        `INSERT INTO todos
          (id, text, done, item_type, priority, start_date, due_date, start_time, end_time,
           location, attachment_url, color, due_label, section, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, text, 0, itemType, priority, dueDate, dueDate, startTime, endTime,
         location, '', color, dueLabel, section, now]
      )
      result = {
        id, text, done: false, item_type: itemType, priority,
        start_date: dueDate, due_date: dueDate,
        start_time: startTime, end_time: endTime,
        location, attachment_url: '', color, due_label: dueLabel,
        section, created_at: String(now)
      }
    }

    else if (type === 'health') {
      const text = d.text || '🩸 Health Log'
      const dueDate = d.due_date || getTodayStrings().today
      const note = d.note ? ` — ${d.note}` : ''
      const fullText = note ? `${text}${note}` : text

      await db.execute(
        `INSERT INTO todos
          (id, text, done, item_type, priority, start_date, due_date, start_time, end_time,
           location, attachment_url, color, due_label, section, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, fullText, 0, 'health', 'med', dueDate, dueDate, null, null,
         '', '', 'pink', dueDate, 'today', now]
      )
      result = {
        id, text: fullText, done: false, item_type: 'health', priority: 'med',
        start_date: dueDate, due_date: dueDate,
        start_time: null, end_time: null,
        location: '', attachment_url: '', color: 'pink', due_label: dueDate,
        section: 'today', created_at: String(now)
      }
    }

    return json({ type, summary, action: `created_${type}`, result })

  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
