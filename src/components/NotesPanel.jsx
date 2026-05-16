// src/components/NotesPanel.jsx
import { useState, useEffect, useRef } from 'react'
import { updateNote, deleteNote } from '../lib/api'

const TAG_STYLES = {
  lecture: { bg: '#E6F1FB', color: '#185FA5', label: '📖 Lecture' },
  idea:    { bg: '#EEEDFE', color: '#534AB7', label: '💡 Idea' },
  clinical:{ bg: '#E1F5EE', color: '#085041', label: '🩺 Clinical' },
  todo:    { bg: '#FAEEDA', color: '#854F0B', label: '✅ Todo' },
}

const BLOCK_ICONS = {
  heading: 'ti-heading',
  text:    'ti-align-left',
  todo:    'ti-circle',
  quote:   'ti-quote',
  bullet:  'ti-point',
}

export default function NotesPanel({ notes, currentId, onSelect, onSaved, onDeleted, onNew, isMobile = false }) {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [blocks, setBlocks] = useState([])
  const [saving, setSaving] = useState(false)
  const [mobileTagFilter, setMobileTagFilter] = useState('all')
  const titleRef = useRef()

  const note = notes.find(n => n.id === currentId)
  const availableTags = [...new Set(notes.flatMap(n => n.tags || []))]
  const visibleNotes = isMobile && mobileTagFilter !== 'all'
    ? notes.filter(n => (n.tags || []).includes(mobileTagFilter))
    : notes

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setTags(note.tags || [])
      setBlocks((note.blocks || []).map(b => ({ ...b, text: b.content || b.text || '' })))
    } else {
      setTitle(''); setTags([]); setBlocks([])
    }
  }, [currentId])

  useEffect(() => {
    if (!isMobile) return
    if (!visibleNotes.length) return
    if (!visibleNotes.some(n => n.id === currentId)) {
      onSelect(visibleNotes[0].id)
    }
  }, [isMobile, mobileTagFilter, currentId, visibleNotes, onSelect])

  function addBlock(type) {
    setBlocks(prev => [...prev, { id: crypto.randomUUID(), type, text: '', done: false }])
  }

  function updateBlockText(idx, text) {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, text } : b))
  }

  function toggleBlockDone(idx) {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, done: !b.done } : b))
  }

  function toggleTag(tag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  async function save() {
    if (!currentId) return
    setSaving(true)
    try {
      await updateNote(currentId, {
        title: title || 'Untitled',
        tags,
        blocks: blocks.map((b, i) => ({
          id: b.id || crypto.randomUUID(),
          type: b.type,
          content: b.text,
          done: b.done,
          position: i
        }))
      })
      onSaved(currentId, title, tags)
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentId || !confirm('Delete this note?')) return
    await deleteNote(currentId)
    onDeleted(currentId)
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
      {/* Sidebar note list */}
      <div style={{
        width: isMobile ? '100%' : '220px',
        maxHeight: isMobile ? '154px' : 'none',
        borderRight: isMobile ? 'none' : '0.5px solid var(--color-border-tertiary)',
        borderBottom: isMobile ? '0.5px solid var(--color-border-tertiary)' : 'none',
        display: 'flex', flexDirection: 'column', background: 'var(--color-background-secondary)'
      }}>
        <div style={{ padding: isMobile ? '8px' : '10px 8px' }}>
          {isMobile && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 2px 8px' }}>
                <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Notes ({visibleNotes.length})
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  Mobile picker
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: availableTags.length ? '110px 1fr' : '1fr', gap: '8px', marginBottom: '8px' }}>
                {availableTags.length > 0 && (
                  <select
                    value={mobileTagFilter}
                    onChange={e => setMobileTagFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '0.5px solid var(--color-border-secondary)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      background: 'var(--color-background-primary)',
                      color: 'var(--color-text-primary)',
                      outline: 'none'
                    }}
                  >
                    <option value="all">All tags</option>
                    {availableTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                )}
                <select
                  value={currentId || ''}
                  onChange={e => onSelect(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '0.5px solid var(--color-border-secondary)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)',
                    outline: 'none'
                  }}
                >
                  {visibleNotes.length === 0 ? (
                    <option value="">No notes</option>
                  ) : (
                    visibleNotes.map(n => (
                      <option key={n.id} value={n.id}>{n.title || 'Untitled note'}</option>
                    ))
                  )}
                </select>
              </div>
            </>
          )}
          <button onClick={onNew} style={{
            width: '100%', padding: '7px 10px', background: '#1D9E75', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontFamily: 'inherit'
          }}>
            <i className="ti ti-plus" /> New note
          </button>
        </div>
        <div style={{
          flex: 1,
          overflowY: isMobile ? 'hidden' : 'auto',
          overflowX: 'hidden',
          padding: '0 8px 8px',
          display: isMobile ? 'none' : 'block'
        }}>
          {notes.map(n => (
            <div key={n.id} onClick={() => onSelect(n.id)}
              style={{
                padding: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '2px',
                background: n.id === currentId ? '#E1F5EE' : 'transparent',
                border: 'none'
              }}>
              <div style={{
                fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden',
                textOverflow: 'ellipsis', color: n.id === currentId ? '#085041' : 'var(--color-text-primary)'
              }}>{n.title}</div>
              <div style={{
                fontSize: '10px',
                color: 'var(--color-text-tertiary)',
                marginTop: '3px',
                display: 'flex',
                gap: '4px',
                flexWrap: 'wrap',
                maxHeight: 'none',
                overflow: 'visible'
              }}>
                {(n.tags || []).map(t => <span key={t} style={{ color: TAG_STYLES[t]?.color || '#888' }}>#{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          padding: isMobile ? '8px 12px' : '8px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)',
          display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap'
        }}>
          {[['heading','ti-heading'],['text','ti-text-size'],['todo','ti-checkbox'],['quote','ti-quote'],['bullet','ti-list']].map(([type, icon]) => (
            <button key={type} onClick={() => addBlock(type)} title={type} style={{
              padding: '4px 8px', border: 'none', background: 'transparent',
              color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: '4px',
              fontSize: '13px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px'
            }}>
              <i className={`ti ${icon}`} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={save} disabled={saving || !currentId} style={{
            padding: '4px 12px', background: saving ? '#9FE1CB' : '#1D9E75', color: 'white',
            border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleDelete} disabled={!currentId} style={{
            padding: '4px 8px', background: 'transparent', color: '#E24B4A',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
          }}>
            <i className="ti ti-trash" />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 14px 22px' : '24px 32px' }}>
          {currentId ? (
            <>
              <input
                ref={titleRef}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Untitled note…"
                style={{
                  fontFamily: "'Lora', serif", fontSize: isMobile ? '22px' : '26px', fontWeight: '500',
                  color: 'var(--color-text-primary)', border: 'none', outline: 'none',
                  background: 'transparent', width: '100%', marginBottom: '10px', lineHeight: 1.3
                }}
              />

              {/* Tags */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
                {Object.entries(TAG_STYLES).map(([tag, s]) => (
                  <span key={tag} onClick={() => toggleTag(tag)} style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500',
                    cursor: 'pointer', background: tags.includes(tag) ? s.bg : 'var(--color-background-secondary)',
                    color: tags.includes(tag) ? s.color : 'var(--color-text-tertiary)',
                    border: `0.5px solid ${tags.includes(tag) ? s.color + '44' : 'var(--color-border-tertiary)'}`
                  }}>{s.label}</span>
                ))}
              </div>

              {/* Blocks */}
              {blocks.map((b, i) => (
                <div key={b.id || i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px',
                  padding: '6px 8px', borderRadius: '8px',
                  background: b.type === 'quote' ? '#E1F5EE' : 'transparent',
                  borderLeft: b.type === 'quote' ? '3px solid #1D9E75' : 'none'
                }}>
                  <i
                    className={`ti ${b.done ? 'ti-circle-check' : BLOCK_ICONS[b.type] || 'ti-align-left'}`}
                    onClick={b.type === 'todo' ? () => toggleBlockDone(i) : undefined}
                    style={{
                      fontSize: '15px', color: b.done ? '#1D9E75' : 'var(--color-text-secondary)',
                      cursor: b.type === 'todo' ? 'pointer' : 'default', flexShrink: 0, paddingTop: '2px'
                    }}
                  />
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => updateBlockText(i, e.target.innerText)}
                    style={{
                      flex: 1, fontSize: b.type === 'heading' ? '18px' : '14px',
                      fontFamily: b.type === 'heading' ? "'Lora', serif" : 'inherit',
                      fontWeight: b.type === 'heading' ? '500' : '400',
                      fontStyle: b.type === 'quote' ? 'italic' : 'normal',
                      color: b.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                      textDecoration: b.done ? 'line-through' : 'none',
                      outline: 'none', lineHeight: 1.7, minHeight: '22px'
                    }}
                    dangerouslySetInnerHTML={{ __html: b.text }}
                  />
                  <button onClick={() => setBlocks(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '12px', opacity: 0.5, paddingTop: '2px' }}>
                    <i className="ti ti-x" />
                  </button>
                </div>
              ))}

              <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '12px' }}>
                Use toolbar above to add blocks · <kbd style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '4px', padding: '1px 5px', fontSize: '11px' }}>Save</kbd> to persist
              </p>
            </>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: '60px', color: 'var(--color-text-tertiary)' }}>
              <i className="ti ti-file-text" style={{ fontSize: '36px', display: 'block', marginBottom: '10px' }} />
              <p style={{ fontSize: '13px' }}>Select a note or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
