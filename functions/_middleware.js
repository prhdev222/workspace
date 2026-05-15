// functions/_middleware.js
// Runs on every request to Cloudflare Pages Functions
// Protects /api/* routes with session cookie check

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url)

  // Only protect /api routes
  if (!url.pathname.startsWith('/api')) {
    return next()
  }

  // Allow login endpoint without auth
  if (url.pathname === '/api/auth/login') {
    return next()
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
