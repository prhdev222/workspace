import { useState } from 'react'
import { createIdea, deleteIdea } from '../lib/api'

const COLORS = {
  teal: {
    card: '#E4F4EE',
    panel: '#D3EDE1',
    border: '#9CCFB9',
    dot: '#1D9E75',
    title: '#0E4B3D',
    body: '#1C3F37',
    meta: '#4E6E65'
  },
  purple: {
    card: '#F1EEFE',
    panel: '#E4DDFC',
    border: '#B5AAEF',
    dot: '#6B5FD2',
    title: '#3B327E',
    body: '#4A418F',
    meta: '#756DAB'
  },
  amber: {
    card: '#FBF1DE',
    panel: '#F7E4BF',
    border: '#E6C47A',
    dot: '#C68A17',
    title: '#6A4710',
    body: '#765319',
    meta: '#95713A'
  },
  blue: {
    card: '#E9F2FC',
    panel: '#D8E7F8',
    border: '#A9C9EA',
    dot: '#2F7BCC',
    title: '#1D4F87',
    body: '#2A5D92',
    meta: '#5B7FA7'
  },
  pink: {
    card: '#FCECF1',
    panel: '#F8DCE5',
    border: '#E8B3C7',
    dot: '#C04F7A',
    title: '#7A2747',
    body: '#8E3C5C',
    meta: '#A0657D'
  }
}

const EMOJIS = ['💡', '🔬', '📌', '🧠', '⚡', '🌱', '🔭', '🎯', '📡', '🧪', '💊', '🩺', '📊', '🌀', '✨']

function formatDate(ts) {
  if (!ts) return ''
  return new Date(parseInt(ts, 10)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function summarize(text) {
  const trimmed = text.trim()
  if (trimmed.length <= 84) return trimmed
  return `${trimmed.slice(0, 84).trim()}...`
}

export default function IdeasPanel({ ideas, setIdeas, isMobile = false }) {
  const [text, setText] = useState('')
  const [color, setColor] = useState('teal')

  async function add() {
    if (!text.trim()) return
    try {
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
      const idea = await createIdea({ content: text.trim(), color, emoji })
      setIdeas(prev => [idea, ...prev])
      setText('')
    } catch (e) {
      alert(e.message)
    }
  }

  async function remove(id) {
    try {
      await deleteIdea(id)
      setIdeas(prev => prev.filter(idea => idea.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div style={{ padding: isMobile ? '14px 12px 20px' : '18px 22px 22px', overflowY: 'auto', flex: 1 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 420px) 1fr',
          gap: '16px',
          alignItems: 'start',
          marginBottom: '18px'
        }}
      >
        <div
          style={{
            padding: '16px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, #f4f0e8 0%, #ece7dd 100%)',
            border: '0.5px solid rgba(77, 57, 27, 0.12)'
          }}
        >
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7E6C57', marginBottom: '8px' }}>
            Capture Idea
          </div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? '21px' : '24px', color: '#32281C', marginBottom: '10px' }}>
            Write first. Organize later.
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                add()
              }
            }}
            placeholder="Type an idea in full sentences. Use as much detail as you need."
            rows={7}
            style={{
              width: '100%',
              padding: '14px 15px',
              border: '1px solid rgba(77, 57, 27, 0.15)',
              borderRadius: '14px',
              fontSize: '14px',
              lineHeight: '1.7',
              fontFamily: 'inherit',
              resize: 'vertical',
              background: 'rgba(255,255,255,0.82)',
              color: '#2E261D',
              outline: 'none',
              boxSizing: 'border-box',
              minHeight: '160px'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {Object.entries(COLORS).map(([name, palette]) => (
                <button
                  key={name}
                  onClick={() => setColor(name)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: color === name ? `2px solid ${palette.title}` : '2px solid transparent',
                    background: palette.dot,
                    boxShadow: color === name ? `0 0 0 3px ${palette.panel}` : 'none',
                    cursor: 'pointer'
                  }}
                  aria-label={name}
                />
              ))}
            </div>
            <div style={{ fontSize: '11px', color: '#7E6C57' }}>{text.trim().length} characters</div>
            <button
              onClick={add}
              style={{
                marginLeft: isMobile ? '0' : 'auto',
                padding: '9px 16px',
                background: '#1D9E75',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: 'inherit',
                width: isMobile ? '100%' : 'auto'
              }}
            >
              Save idea
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#8E7E69', marginTop: '10px', lineHeight: '1.5' }}>
            Press `Cmd/Ctrl + Enter` to save quickly.
          </div>
        </div>

        <div
          style={{
            padding: '16px',
            borderRadius: '18px',
            border: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-secondary)'
          }}
        >
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
            Board Summary
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'var(--color-background-primary)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: '6px' }}>Total</div>
              <div style={{ fontSize: '24px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{ideas.length}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'var(--color-background-primary)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: '6px' }}>Latest</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)', lineHeight: '1.5' }}>
                {ideas[0] ? summarize(ideas[0].content) : 'No ideas yet'}
              </div>
            </div>
            <div style={{ padding: '12px', borderRadius: '14px', background: 'var(--color-background-primary)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: '6px' }}>Palette</div>
              <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                {Object.values(COLORS).map(palette => (
                  <span
                    key={palette.dot}
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: palette.dot,
                      display: 'inline-block'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {ideas.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            color: 'var(--color-text-tertiary)',
            border: '0.5px dashed var(--color-border-secondary)',
            borderRadius: '18px',
            background: 'var(--color-background-secondary)'
          }}
        >
          <i className="ti ti-bulb" style={{ fontSize: '34px', display: 'block', marginBottom: '12px' }} />
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>No ideas yet. Start with one detailed thought.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {ideas.map(idea => {
            const palette = COLORS[idea.color] || COLORS.teal
            return (
              <article
                key={idea.id}
                style={{
                  padding: '16px',
                  borderRadius: '18px',
                  border: `1px solid ${palette.border}`,
                  background: `linear-gradient(180deg, ${palette.panel} 0%, ${palette.card} 100%)`,
                  minHeight: '210px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 12px 24px rgba(0,0,0,0.04)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingRight: '28px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(255,255,255,0.62)',
                      fontSize: '20px'
                    }}
                  >
                    {idea.emoji}
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: palette.meta, marginBottom: '3px' }}>
                      Idea note
                    </div>
                    <div style={{ fontSize: '12px', color: palette.meta }}>{formatDate(idea.created_at)}</div>
                  </div>
                </div>

                <div style={{ fontSize: '16px', lineHeight: '1.75', color: palette.body, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {idea.content}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: '600',
                      color: palette.title,
                      padding: '5px 9px',
                      borderRadius: '999px',
                      background: 'rgba(255,255,255,0.58)'
                    }}
                  >
                    {idea.color}
                  </span>
                  <button
                    onClick={() => remove(idea.id)}
                    style={{
                      background: 'rgba(255,255,255,0.58)',
                      border: 'none',
                      color: palette.title,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                      borderRadius: '10px',
                      padding: '6px 10px',
                      fontFamily: 'inherit'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
