// functions/_middleware.js
// Runs on every request to Cloudflare Pages Functions
// Protects /api/* routes with session cookie check

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url)

  // Only protect /api routes
  if (!url.pathname.startsWith('/api')) {
    return next()
  }

  // Allow login and public read-only endpoints without auth
  if (url.pathname === '/api/auth/login' || url.pathname.startsWith('/api/public/')) {
    return next()
  }

  // Allow bot via API key (for Hermes MCP server)
  const authHeader = request.headers.get('Authorization') || ''
  if (authHeader.startsWith('Bearer ') && env.BOT_API_KEY) {
    const key = authHeader.slice(7)
    if (key === env.BOT_API_KEY) return next()
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Check session cookie
  const cookie = request.headers.get('Cookie') || ''
  const sessionMatch = cookie.match(/ws_session=([^;]+)/)
  if (!sessionMatch) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Verify session token matches our secret
  const token = sessionMatch[1]
  const expected = env.SESSION_SECRET
  if (token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return next()
}
