// src/components/Login.jsx
import { useState } from 'react'
import { login } from '../lib/api'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
        borderRadius: '16px', padding: '40px 36px', width: '100%', maxWidth: '360px'
      }}>
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
