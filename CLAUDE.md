# My Workspace App — Personal Notion-like App
**Stack:** React 18 + Vite + Cloudflare Pages + Turso (libSQL)
**Deploy:** Cloudflare Pages (auto-deploy from GitHub)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite (`src/`) |
| API | Cloudflare Pages Functions (`functions/`) |
| Database | Turso (libSQL / SQLite-compatible) |
| Auth | Session cookie (`HttpOnly`, `SameSite=Strict`) — single password |
| Icons | Tabler Icons webfont |
| Deploy | Cloudflare Pages → `npm run build` → `dist/` |

---

## โครงสร้างไฟล์

```
workspace/
├── index.html
├── vite.config.js
├── wrangler.toml
├── public/
│   ├── _redirects          ← SPA fallback
│   └── _routes.json        ← CF Pages function routing
├── functions/
│   ├── _middleware.js      ← Auth guard for all /api/* routes
│   └── api/
│       ├── _db.js          ← Turso HTTP client (shared)
│       ├── init.js         ← GET /api/init → create tables
│       ├── auth/login.js   ← POST/DELETE /api/auth/login
│       ├── notes.js        ← GET/POST /api/notes
│       ├── notes/[id].js   ← GET/PUT/DELETE /api/notes/:id
│       ├── todos.js        ← GET/POST /api/todos
│       ├── todos/[id].js   ← PUT/DELETE /api/todos/:id
│       ├── ideas.js        ← GET/POST /api/ideas
│       └── ideas/[id].js   ← DELETE /api/ideas/:id
└── src/
    ├── main.jsx
    ├── App.jsx             ← Root: auth state + sidebar + view routing
    ├── lib/api.js          ← Fetch wrapper for all API calls
    └── components/
        ├── Login.jsx
        ├── NotesPanel.jsx      ← Block-based note editor
        ├── TodoPanel.jsx       ← Todo list with sections + progress
        ├── MindMapPanel.jsx    ← SVG mind map generator + presets
        ├── IdeasPanel.jsx      ← Sticky note idea board
        ├── AIAssistant.jsx     ← AI assistant panel
        └── LinkedItemsPanel.jsx
```

---

## Commands

```bash
npm run dev      # Vite dev server (frontend only, no functions)
npm run build    # Build to dist/
npm run preview  # Preview built output

# Local dev with CF Functions + secrets:
npx wrangler pages dev --compatibility-date=2024-01-01 -- npm run dev
```

**Local secrets** — เก็บใน `.dev.vars` (ห้าม commit):
```
TURSO_URL=libsql://...
TURSO_TOKEN=...
SESSION_SECRET=...   # min 32 chars
APP_PASSWORD=...
```

**Production secrets** — ตั้งใน Cloudflare Dashboard → Pages → Settings → Environment Variables (Encrypted):
| Variable | ค่า |
|---|---|
| `TURSO_URL` | `libsql://your-db.turso.io` |
| `TURSO_TOKEN` | Turso auth token |
| `SESSION_SECRET` | random string 32+ chars |
| `APP_PASSWORD` | login password |

---

## Database

ตาราง init ด้วย `GET /api/init` (ต้อง login ก่อน):
- `notes` — block-based notes with tags
- `todos` — tasks with priority + due date
- `ideas` — sticky notes with color

Turso client อยู่ใน `functions/api/_db.js` — ทุก function import จากนี้

---

## Auth Flow

1. `POST /api/auth/login` → set session cookie
2. `functions/_middleware.js` ตรวจ cookie ทุก `/api/*` request (ยกเว้น `/api/auth/login`)
3. `DELETE /api/auth/login` → logout (clear cookie)
4. Cookie: `HttpOnly`, `SameSite=Strict`, `Secure` (production)

---

## Pitfalls & Constraints

- **`npm run dev` ใช้ Vite เท่านั้น** — ไม่มี CF Functions → ใช้ `wrangler pages dev` สำหรับ full stack local
- **`/api/init` ต้องรัน 1 ครั้ง** หลัง deploy ครั้งแรกหรือ DB ใหม่
- **Session secret rotation** — เปลี่ยน `SESSION_SECRET` ใน CF dashboard จะ invalidate sessions ทั้งหมดทันที
- **Turso credentials ไม่ออก frontend** — อยู่ใน Functions เท่านั้น
- **Mind map presets** — เพิ่มใน `src/components/MindMapPanel.jsx` ที่ `PRESETS` object + `getPreset()` function
- **SPA routing** — `public/_redirects` + `public/_routes.json` จัดการ fallback ให้ React Router
