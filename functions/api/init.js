// functions/api/init.js
// GET /api/init  → creates all tables (run once after deploy)
// Protected by middleware session check

import { getDb } from './_db.js'

export async function onRequestGet({ env }) {
  try {
    const db = getDb(env)

    const statements = [
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled',
        tags TEXT NOT NULL DEFAULT '[]',
        parent_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(parent_id) REFERENCES notes(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL DEFAULT '',
        done INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        item_type TEXT NOT NULL DEFAULT 'task',
        priority TEXT NOT NULL DEFAULT 'med',
        start_date TEXT,
        due_date TEXT,
        start_time TEXT,
        end_time TEXT,
        location TEXT NOT NULL DEFAULT '',
        attachment_url TEXT NOT NULL DEFAULT '',
        due_label TEXT NOT NULL DEFAULT 'today',
        section TEXT NOT NULL DEFAULT 'today',
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'teal',
        emoji TEXT NOT NULL DEFAULT '💡',
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS mindmaps (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        from_type TEXT NOT NULL,
        from_id TEXT NOT NULL,
        to_type TEXT NOT NULL,
        to_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      )`
    ]

    for (const sql of statements) {
      await db.execute(sql)
    }

    const { rows: noteColumns } = await db.execute('PRAGMA table_info(notes)')
    const noteColumnNames = new Set(noteColumns.map(column => column.name))

    if (!noteColumnNames.has('parent_id')) {
      await db.execute('ALTER TABLE notes ADD COLUMN parent_id TEXT')
    }

    if (!noteColumnNames.has('sort_order')) {
      await db.execute('ALTER TABLE notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
      await db.execute('UPDATE notes SET sort_order = created_at WHERE sort_order = 0')
    }

    const { rows: todoColumns } = await db.execute('PRAGMA table_info(todos)')
    const todoColumnNames = new Set(todoColumns.map(column => column.name))

    if (!todoColumnNames.has('start_date')) {
      await db.execute('ALTER TABLE todos ADD COLUMN start_date TEXT')
    }

    if (!todoColumnNames.has('item_type')) {
      await db.execute("ALTER TABLE todos ADD COLUMN item_type TEXT NOT NULL DEFAULT 'task'")
    }

    if (!todoColumnNames.has('due_date')) {
      await db.execute('ALTER TABLE todos ADD COLUMN due_date TEXT')
      await db.execute("UPDATE todos SET due_date = due_label WHERE due_label GLOB '????-??-??' AND (due_date IS NULL OR due_date = '')")
    }

    if (!todoColumnNames.has('start_time')) {
      await db.execute('ALTER TABLE todos ADD COLUMN start_time TEXT')
    }

    if (!todoColumnNames.has('end_time')) {
      await db.execute('ALTER TABLE todos ADD COLUMN end_time TEXT')
    }

    if (!todoColumnNames.has('location')) {
      await db.execute("ALTER TABLE todos ADD COLUMN location TEXT NOT NULL DEFAULT ''")
    }

    if (!todoColumnNames.has('attachment_url')) {
      await db.execute("ALTER TABLE todos ADD COLUMN attachment_url TEXT NOT NULL DEFAULT ''")
    }

    return json({ ok: true, message: 'Tables created successfully' })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
