// src/components/Login.jsx
import { useState } from 'react'
import { login } from '../lib/api'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 900 : false

  function setTheme(nextTheme) {
    document.documentElement.dataset.theme = nextTheme
    localStorage.setItem('workspace-theme', nextTheme)
  }

  function adjustFontScale(nextScale) {
    const clamped = Math.max(0.9, Math.min(1.2, nextScale))
    document.documentElement.style.setProperty('--font-scale', String(clamped))
    localStorage.setItem('workspace-font-scale', String(clamped))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(password)
      onLogin()
    } catch {
      setError('Wrong password. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-background-tertiary)'
    }}>
      <div style={{
        background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)',
        borderRadius: '16px', padding: isMobile ? '28px 20px' : '40px 36px', width: '100%', maxWidth: isMobile ? 'calc(100vw - 24px)' : '360px'
      }}>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginBottom: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => adjustFontScale(parseFloat(localStorage.getItem('workspace-font-scale') || '1') - 0.1)} style={{ padding: '5px 8px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>A-</button>
          <button onClick={() => adjustFontScale(1)} style={{ padding: '5px 8px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>A</button>
          <button onClick={() => adjustFontScale(parseFloat(localStorage.getItem('workspace-font-scale') || '1') + 0.1)} style={{ padding: '5px 8px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>A+</button>
          <button onClick={() => setTheme((document.documentElement.dataset.theme || 'light') === 'dark' ? 'light' : 'dark')} style={{ padding: '5px 8px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer' }}>Theme</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px', background: '#1D9E75',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <i className="ti ti-leaf" style={{ color: 'white', fontSize: '16px' }} />
          </div>
          <span style={{ fontSize: '17px', fontWeight: '500' }}>My Workspace</span>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
          Enter your password to access your workspace.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%', padding: '10px 14px', border: '0.5px solid var(--color-border-secondary)',
              borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
              background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
              outline: 'none', marginBottom: '12px', boxSizing: 'border-box'
            }}
          />
          {error && (
            <p style={{ fontSize: '12px', color: '#E24B4A', marginBottom: '10px' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px', background: '#1D9E75', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
