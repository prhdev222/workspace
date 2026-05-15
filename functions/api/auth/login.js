// functions/api/auth/login.js
// POST /api/auth/login  { password: "..." }
// DELETE /api/auth/login  → logout

export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json()

    if (!password || password !== env.APP_PASSWORD) {
      return json({ error: 'Wrong password' }, 401)
    }

    const token = env.SESSION_SECRET
    const cookie = [
      `ws_session=${token}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      'Max-Age=86400' // 1 day
    ].join('; ')

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie
      }
    })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}

export async function onRequestDelete() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'ws_session=; Max-Age=0; Path=/'
    }
  })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
