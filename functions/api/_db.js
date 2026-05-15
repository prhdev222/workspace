// functions/api/_db.js
// Shared Turso/libSQL client factory for Cloudflare Functions
// Usage: const db = getDb(env); await db.execute(...)

export function getDb(env) {
  // Minimal fetch-based libSQL HTTP client (no npm needed in CF Functions)
  const url = env.TURSO_URL   // e.g. "libsql://mydb.turso.io"
  const token = env.TURSO_TOKEN

  async function execute(sql, args = []) {
    const httpUrl = url.replace('libsql://', 'https://')
    const res = await fetch(`${httpUrl}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql,
              args: args.map(a => {
                if (a === null) return { type: 'null' }
                if (typeof a === 'number') return { type: 'integer', value: String(a) }
                return { type: 'text', value: String(a) }
              })
            }
          },
          { type: 'close' }
        ]
      })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Turso error: ${res.status} ${text}`)
    }

    const data = await res.json()
    const result = data.results?.[0]
    if (result?.type === 'error') throw new Error(result.error.message)

    const cols = result?.response?.result?.cols?.map(c => c.name) || []
    const rows = result?.response?.result?.rows || []
    const rowsAsMaps = rows.map(row =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]?.value ?? null]))
    )

    return {
      rows: rowsAsMaps,
      rowsWritten: result?.response?.result?.rows_written || 0
    }
  }

  return { execute }
}
