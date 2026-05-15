// src/components/IdeasPanel.jsx
import { useState } from 'react'
import { createIdea, deleteIdea } from '../lib/api'

const COLORS = {
  teal:   { card: '#E1F5EE', border: '#9FE1CB' },
  purple: { card: '#EEEDFE', border: '#AFA9EC' },
  amber:  { card: '#FAEEDA', border: '#FAC775' },
  blue:   { card: '#E6F1FB', border: '#B5D4F4' },
  pink:   { card: '#FBEAF0', border: '#F4C0D1' },
}
const DOT_COLORS = { teal: '#1D9E75', purple: '#7F77DD', amber: '#EF9F27', blue: '#378ADD', pink: '#D4537E' }
const EMOJIS = ['💡','🔬','📌','🧠','⚡','🌱','🔭','🎯','📡','🧪','💊','🩺','📊','🌀','✨']

export default function IdeasPanel({ ideas, setIdeas }) {
  const [text, setText] = useState('')
  const [color, setColor] = useState('teal')

  async function add() {
    if (!text.trim()) return
    try {
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
      const idea = await createIdea({ content: text.trim(), color, emoji })
      setIdeas(prev => [idea, ...prev])
      setText('')
    } catch (e) { alert(e.message) }
  }

  async function remove(id) {
    try {
      await deleteIdea(id)
      setIdeas(prev => prev.filter(i => i.id !== id))
    } catch (e) { alert(e.message) }
  }

  function formatDate(ts) {
    if (!ts) return ''
    return new Date(parseInt(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
      {/* Add row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-start' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
          placeholder="Capture a new idea… (Enter to save)"
          rows={2}
          style={{
            flex: 1, padding: '8px 12px', border: '0.5px solid var(--color-border-secondary)',
            borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'none',
            background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none'
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <button onClick={add} style={{
            padding: '8px 14px', background: '#1D9E75', color: 'white', border: 'none',
            borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <i className="ti ti-plus" /> Add
          </button>
          <div style={{ display: 'flex', gap: '6px' }}>
            {Object.entries(DOT_COLORS).map(([c, hex]) => (
              <div key={c} onClick={() => setColor(c)}
                style={{
                  width: '16px', height: '16px', borderRadius: '50%', background: hex,
                  cursor: 'pointer', border: `2px solid ${color === c ? '#333' : 'transparent'}`,
                  transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.12s'
                }} />
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {ideas.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '40px', color: 'var(--color-text-tertiary)' }}>
          <i className="ti ti-bulb" style={{ fontSize: '32px', display: 'block', marginBottom: '10px' }} />
          <p style={{ fontSize: '13px' }}>No ideas yet. Start capturing!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
          {ideas.map(idea => {
            const c = COLORS[idea.color] || COLORS.teal
            return (
              <div key={idea.id} style={{
                padding: '14px', borderRadius: '12px', border: `0.5px solid ${c.border}`,
                background: c.card, minHeight: '110px', position: 'relative',
                transition: 'transform 0.15s'
              }}>
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>{idea.emoji}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', lineHeight: '1.5' }}>
                  {idea.content}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '8px' }}>
                  {formatDate(idea.created_at)}
                </div>
                <button onClick={() => remove(idea.id)} style={{
                  position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none',
                  color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '13px', opacity: 0.5,
                  lineHeight: 1
                }}>
                  <i className="ti ti-x" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
