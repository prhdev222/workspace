# My Workspace App

A personal Notion-like workspace with Notes, To-Do, Mind Map, and Ideas.
Built with React + Vite, deployed on Cloudflare Pages, data in Turso (libSQL).

---

## Stack

| Layer      | Tech                          |
|------------|-------------------------------|
| Frontend   | React 18 + Vite               |
| Deployment | Cloudflare Pages              |
| API        | Cloudflare Pages Functions    |
| Database   | Turso (libSQL)                |
| Auth       | Session cookie (CF secret)    |
| Icons      | Tabler Icons webfont          |
| Fonts      | DM Sans + Lora (Google Fonts) |

---

## File Structure

```
workspace-app/
├── index.html                    ← App shell with fonts/icons
├── vite.config.js
├── wrangler.toml                 ← CF Pages config
├── package.json
├── public/
│   ├── _redirects                ← SPA fallback
│   └── _routes.json              ← CF Pages function routing
├── functions/
│   ├── _middleware.js            ← Auth guard for /api/*
│   └── api/
│       ├── _db.js                ← Turso HTTP client (shared)
│       ├── init.js               ← GET /api/init → create tables
│       ├── auth/
│       │   └── login.js          ← POST/DELETE /api/auth/login
│       ├── notes.js              ← GET /api/notes, POST /api/notes
│       ├── notes/[id].js         ← GET/PUT/DELETE /api/notes/:id
│       ├── todos.js              ← GET /api/todos, POST /api/todos
│       ├── todos/[id].js         ← PUT/DELETE /api/todos/:id
│       ├── ideas.js              ← GET /api/ideas, POST /api/ideas
│       └── ideas/[id].js         ← DELETE /api/ideas/:id
└── src/
    ├── main.jsx
    ├── App.jsx                   ← Root: auth + sidebar + view routing
    ├── lib/
    │   └── api.js                ← Fetch wrapper for all API calls
    └── components/
        ├── Login.jsx
        ├── NotesPanel.jsx        ← Block-based note editor
        ├── TodoPanel.jsx         ← Todo list with sections + progress
        ├── MindMapPanel.jsx      ← SVG mind map generator
        └── IdeasPanel.jsx        ← Sticky note idea board
```

---

## Setup: Step by Step

### 1. Create a Turso database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create DB
turso db create my-workspace

# Get URL and token
turso db show my-workspace        # → copy the URL (libsql://...)
turso db tokens create my-workspace  # → copy the token
```

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/workspace-app
cd workspace-app
npm install
```

### 3. Local dev with secrets

Create `.dev.vars` (never commit this):
```
TURSO_URL=libsql://my-workspace-yourname.turso.io
TURSO_TOKEN=your-turso-token-here
SESSION_SECRET=any-long-random-string-here-min-32-chars
APP_PASSWORD=your-login-password-here
```

Run locally:
```bash
npm run build
npm run dev:pages
```

### 4. Create DB tables (one-time)

After starting locally or after first deploy, visit:
```
http://localhost:8788/api/init   # local
https://your-app.pages.dev/api/init   # after deploy (must be logged in)
```

You'll see: `{"ok":true,"message":"Tables created successfully"}`

### 5. Deploy to Cloudflare Pages

```bash
# Push to GitHub first
git add . && git commit -m "initial" && git push

# In Cloudflare Dashboard:
# Pages → Create project → Connect GitHub repo → your-workspace-app
# Build command: npm run build
# Build output directory: dist
```

### 6. Set environment secrets in Cloudflare Dashboard

Go to: **Pages → your-workspace → Settings → Environment Variables**

Add these as **Encrypted**:
| Variable        | Value                          |
|-----------------|--------------------------------|
| `TURSO_URL`     | `libsql://your-db.turso.io`    |
| `TURSO_TOKEN`   | your Turso auth token          |
| `SESSION_SECRET`| a long random string (32+ chars)|
| `APP_PASSWORD`  | your login password            |

### 7. Init tables on production

Visit `https://your-app.pages.dev/api/init` after logging in once.

---

## Usage

- **Notes**: Create notes, add blocks (heading/text/quote/bullet/todo), tag them, save
- **To-Do**: Add tasks with priority + due date, toggle done, track progress
- **Mind Map**: Type any topic → Generate (presets: Hematology, Stroke)
- **Ideas**: Capture ideas with color-coded sticky notes

---

## Adding Mind Map Presets

Edit `src/components/MindMapPanel.jsx`, add to the `PRESETS` object:

```js
cml: {
  center: 'CML Management',
  branches: [
    { label: 'Diagnosis', color: '#7F77DD', children: ['BCR-ABL PCR','FISH','BM Biopsy','Sokal Score'] },
    { label: 'Treatment', color: '#1D9E75', children: ['Imatinib','Dasatinib','Nilotinib','Ponatinib'] },
    { label: 'Monitoring', color: '#EF9F27', children: ['BCR-ABL 3mo','CCyR','MMR','CMR/TFR'] },
    { label: 'Response', color: '#E24B4A', children: ['Optimal','Warning','Failure','Progression'] },
  ]
}
```

Then add a keyword match in `getPreset()`:
```js
if (t.includes('cml') || t.includes('leukemia')) return PRESETS.cml
```

---

## Security Notes

- All `/api/*` routes are protected by session cookie check in `_middleware.js`
- Only `/api/auth/login` is public
- Turso credentials never touch the frontend — only Cloudflare Functions
- Session cookie is `HttpOnly` + `Secure` + `SameSite=Strict`, and is remembered for 30 days
- Rotate `SESSION_SECRET` in CF dashboard to instantly invalidate all sessions
- For extra security: enable **Cloudflare Access** (Zero Trust) on your Pages domain

---

## Backup (optional)

Add a Cloudflare Cron Trigger in `wrangler.toml` to export to R2 daily:

```toml
[triggers]
crons = ["0 2 * * *"]   # 2am daily
```

Then add `functions/scheduled.js` that exports all data to R2.
