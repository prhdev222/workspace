import assert from 'node:assert/strict'
import test from 'node:test'

import { onRequestPost } from '../functions/api/mcp.js'

function tursoSuccessResponse() {
  return {
    ok: true,
    json: async () => ({
      results: [
        {
          type: 'ok',
          response: {
            result: {
              cols: [],
              rows: [],
              rows_written: 1
            }
          }
        }
      ]
    })
  }
}

function tursoRowsResponse(cols, rows) {
  return {
    ok: true,
    json: async () => ({
      results: [
        {
          type: 'ok',
          response: {
            result: {
              cols: cols.map(name => ({ name })),
              rows: rows.map(row => cols.map(name => {
                const value = row[name]
                if (value === null || value === undefined) return { type: 'null' }
                if (typeof value === 'number') return { type: 'integer', value: String(value) }
                return { type: 'text', value: String(value) }
              })),
              rows_written: 0
            }
          }
        }
      ]
    })
  }
}

const TODO_COLS = [
  'id',
  'text',
  'done',
  'item_type',
  'priority',
  'start_date',
  'due_date',
  'start_time',
  'end_time',
  'location',
  'attachment_url',
  'color',
  'due_label',
  'section',
  'created_at'
]

const APPOINTMENT_ROW = {
  id: 'appt-1',
  text: 'ตรวจเลือด',
  done: 0,
  item_type: 'appointment',
  priority: 'med',
  start_date: '2026-07-05',
  due_date: '2026-07-05',
  start_time: '10:00',
  end_time: null,
  location: 'lab',
  attachment_url: '',
  color: 'teal',
  due_label: '2026-07-05',
  section: 'upcoming',
  created_at: 1
}

test('MCP create_note writes blocks using the current blocks schema', async () => {
  const originalFetch = globalThis.fetch
  const executed = []

  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body)
    executed.push(body.requests[0].stmt)
    return tursoSuccessResponse()
  }

  try {
    const request = new Request('https://workspace.test/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'create_note',
          arguments: {
            title: 'MCP note',
            content: '# Heading\n- Bullet\nPlain text',
            tags: ['clinical']
          }
        }
      })
    })

    const response = await onRequestPost({
      request,
      env: {
        TURSO_URL: 'libsql://example.turso.io',
        TURSO_TOKEN: 'token'
      }
    })
    const data = await response.json()

    assert.equal(data.result?.isError, undefined)
    assert.match(data.result.content[0].text, /สร้าง note "MCP note"/)

    const blockStatements = executed.filter(stmt => stmt.sql.startsWith('INSERT INTO blocks'))
    assert.equal(blockStatements.length, 3)

    for (const stmt of blockStatements) {
      assert.equal(
        stmt.sql,
        'INSERT INTO blocks (id, note_id, type, content, done, position) VALUES (?, ?, ?, ?, ?, ?)'
      )
      assert.deepEqual(
        stmt.args.map(arg => arg.type),
        ['text', 'text', 'text', 'text', 'integer', 'integer']
      )
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCP create_diagram saves Mermaid content to the diagram table', async () => {
  const originalFetch = globalThis.fetch
  const executed = []

  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body)
    executed.push(body.requests[0].stmt)
    return tursoSuccessResponse()
  }

  try {
    const mermaid = 'flowchart TD\n  A[Anemia] --> B[Check MCV]'
    const request = new Request('https://workspace.test/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_diagram',
          arguments: {
            title: 'Approach to Anemia',
            diagram_type: 'algorithm',
            mermaid
          }
        }
      })
    })

    const response = await onRequestPost({
      request,
      env: {
        TURSO_URL: 'libsql://example.turso.io',
        TURSO_TOKEN: 'token'
      }
    })
    const data = await response.json()

    assert.equal(data.result?.isError, undefined)
    assert.match(data.result.content[0].text, /สร้าง diagram "Approach to Anemia"/)

    const diagramStatement = executed.find(stmt => stmt.sql.startsWith('INSERT INTO mindmaps'))
    assert.ok(diagramStatement)
    assert.equal(
      diagramStatement.sql,
      'INSERT INTO mindmaps (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    assert.equal(diagramStatement.args[1].value, 'Approach to Anemia')
    assert.equal(diagramStatement.args[2].value, mermaid)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCP update_appointment changes the matched appointment color', async () => {
  const originalFetch = globalThis.fetch
  const executed = []

  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body)
    const stmt = body.requests[0].stmt
    executed.push(stmt)
    if (stmt.sql.startsWith('SELECT * FROM todos')) {
      return tursoRowsResponse(TODO_COLS, [APPOINTMENT_ROW])
    }
    return tursoSuccessResponse()
  }

  try {
    const request = new Request('https://workspace.test/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'update_appointment',
          arguments: {
            match_text: 'ตรวจเลือด',
            match_date: '2026-07-05',
            color: 'purple'
          }
        }
      })
    })

    const response = await onRequestPost({
      request,
      env: {
        TURSO_URL: 'libsql://example.turso.io',
        TURSO_TOKEN: 'token'
      }
    })
    const data = await response.json()

    assert.equal(data.result?.isError, undefined)
    assert.match(data.result.content[0].text, /แก้ไขนัดหมาย/)

    const updateStatement = executed.find(stmt => stmt.sql.startsWith('UPDATE todos SET'))
    assert.ok(updateStatement)
    assert.equal(updateStatement.sql, 'UPDATE todos SET color = ? WHERE id = ?')
    assert.equal(updateStatement.args[0].value, 'purple')
    assert.equal(updateStatement.args[1].value, 'appt-1')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MCP delete_appointment deletes the single matched appointment', async () => {
  const originalFetch = globalThis.fetch
  const executed = []

  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body)
    const stmt = body.requests[0].stmt
    executed.push(stmt)
    if (stmt.sql.startsWith('SELECT * FROM todos')) {
      return tursoRowsResponse(TODO_COLS, [APPOINTMENT_ROW])
    }
    return tursoSuccessResponse()
  }

  try {
    const request = new Request('https://workspace.test/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'delete_appointment',
          arguments: {
            match_text: 'ตรวจเลือด',
            match_date: '2026-07-05'
          }
        }
      })
    })

    const response = await onRequestPost({
      request,
      env: {
        TURSO_URL: 'libsql://example.turso.io',
        TURSO_TOKEN: 'token'
      }
    })
    const data = await response.json()

    assert.equal(data.result?.isError, undefined)
    assert.match(data.result.content[0].text, /ลบนัดหมาย/)

    const deleteStatement = executed.find(stmt => stmt.sql.startsWith('DELETE FROM todos'))
    assert.ok(deleteStatement)
    assert.equal(deleteStatement.sql, 'DELETE FROM todos WHERE id = ?')
    assert.equal(deleteStatement.args[0].value, 'appt-1')
  } finally {
    globalThis.fetch = originalFetch
  }
})
