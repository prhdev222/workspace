// src/App.jsx
import { useState, useEffect } from 'react'
import Login from './components/Login'
import NotesPanel from './components/NotesPanel'
import TodoPanel from './components/TodoPanel'
import MindMapPanel from './components/MindMapPanel'
import IdeasPanel from './components/IdeasPanel'
import { getNotes, getTodos, getIdeas, createNote, logout } from './lib/api'

const VIEWS = [
  { id: 'notes',   label: 'Notes',    icon: 'ti-file-text' },
  { id: 'todo',    label: 'To-Do',    icon: 'ti-check' },
  { id: 'mindmap', label: 'Mind Map', icon: 'ti-git-fork' },
  { id: 'ideas',   label: 'Ideas',    icon: 'ti-bulb' },
]

export default function App() {
  const [authed, setAuthed] = useState(null)   // null = loading, false = login, true = app
  const [view, setView] = useState('notes')
  const [notes, setNotes] = useState([])
  const [todos, setTodos] = useState([])
  const [ideas, setIdeas] = useState([])
  const [currentNoteId, setCurrentNoteId] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Check if already authed by trying to load data
  useEffect(() => {
    getNotes()
      .then(data => { setNotes(data); setCurrentNoteId(data[0]?.id || null); setAuthed(true) })
      .catch(() => setAuthed(false))
  }, [])

  useEffect(() => {
    if (!authed) return
    getTodos()
      .then(setTodos)
      .catch(err => {
        if (err?.status === 401) setAuthed(false)
        else console.error(err)
      })
    getIdeas()
      .then(setIdeas)
      .catch(err => {
        if (err?.status === 401) setAuthed(false)
        else console.error(err)
      })
  }, [authed])

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 900)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isMobile) setMobileMenuOpen(false)
  }, [isMobile])

  async function handleLogin() {
    const data = await getNotes()
    setNotes(data)
    setCurrentNoteId(data[0]?.id || null)
    const [td, id] = await Promise.all([getTodos(), getIdeas()])
    setTodos(td); setIdeas(id)
    setAuthed(true)
  }

  async function handleLogout() {
    await logout()
    setAuthed(false)
    setNotes([]); setTodos([]); setIdeas([])
  }

  async function handleNewNote() {
    const note = await createNote({ title: 'Untitled note', tags: [], blocks: [] })
    setNotes(prev => [note, ...prev])
    setCurrentNoteId(note.id)
    setView('notes')
  }

  function handleNoteSaved(id, title, tags) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title, tags } : n))
  }

  function handleNoteDeleted(id) {
    const remaining = notes.filter(n => n.id !== id)
    setNotes(remaining)
    setCurrentNoteId(remaining[0]?.id || null)
  }

  if (authed === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
        Loading…
      </div>
    )
  }

  if (!authed) return <Login onLogin={handleLogin} />

  const noteDone = todos.filter(t => t.done).length
  const totalTodos = todos.length
  const currentView = VIEWS.find(v => v.id === view)

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      height: '100vh',
      fontFamily: "'DM Sans', sans-serif",
      background: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)'
    }}>
      {/* Sidebar */}
      <div style={{
        width: isMobile ? '100%' : '200px',
        background: 'var(--color-background-secondary)',
        borderRight: isMobile ? 'none' : '0.5px solid var(--color-border-tertiary)',
        borderBottom: isMobile ? '0.5px solid var(--color-border-tertiary)' : 'none',
        display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        {/* Workspace header */}
        <div style={{ padding: isMobile ? '12px 14px 10px' : '16px 14px 12px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '26px', height: '26px', borderRadius: '7px', background: '#1D9E75',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <i className="ti ti-leaf" style={{ color: 'white', fontSize: '13px' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: '500' }}>My Workspace</div>
              {isMobile && (
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                  {currentView?.label}
                </div>
              )}
            </div>
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(prev => !prev)}
                style={{
                  marginLeft: 'auto',
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  border: '0.5px solid var(--color-border-secondary)',
                  background: mobileMenuOpen ? '#E1F5EE' : 'var(--color-background-primary)',
                  color: mobileMenuOpen ? '#085041' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Toggle menu"
              >
                <i className={`ti ${mobileMenuOpen ? 'ti-x' : 'ti-menu-2'}`} style={{ fontSize: '18px' }} />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        {(!isMobile || mobileMenuOpen) && (
          <div style={{ padding: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: '500', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 6px 6px' }}>Views</div>
          <div style={{ display: 'flex', gap: isMobile ? '6px' : '0', flexDirection: isMobile ? 'column' : 'column', minWidth: 0 }}>
            {VIEWS.map(v => {
              const isActive = view === v.id
              const badge = v.id === 'todo' ? totalTodos - noteDone : v.id === 'notes' ? notes.length : v.id === 'ideas' ? ideas.length : null
              return (
                <div key={v.id} onClick={() => { setView(v.id); setMobileMenuOpen(false) }} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '9px 10px' : '7px 8px',
                  borderRadius: '10px', cursor: 'pointer', fontSize: '13px', marginBottom: isMobile ? '0' : '1px',
                  background: isActive ? '#E1F5EE' : 'transparent',
                  color: isActive ? '#085041' : 'var(--color-text-secondary)',
                  fontWeight: isActive ? '500' : '400',
                  minWidth: 0
                }}>
                  <i className={`ti ${v.icon}`} style={{ fontSize: '15px' }} />
                  {v.label}
                  {badge !== null && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '11px', padding: '1px 6px', borderRadius: '10px',
                      background: isActive ? '#9FE1CB' : 'var(--color-border-tertiary)',
                      color: isActive ? '#085041' : 'var(--color-text-secondary)'
                    }}>{badge}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Footer */}
        <div style={{ padding: '8px', borderTop: '0.5px solid var(--color-border-tertiary)', display: isMobile ? (mobileMenuOpen ? 'flex' : 'none') : 'block', gap: isMobile ? '8px' : '0' }}>
          <button onClick={handleNewNote} style={{
            width: isMobile ? 'auto' : '100%', flex: isMobile ? 1 : 'none', padding: '7px 10px', background: '#1D9E75', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontFamily: 'inherit', marginBottom: isMobile ? '0' : '4px'
          }}>
            <i className="ti ti-plus" /> New note
          </button>
          <button onClick={handleLogout} style={{
            width: isMobile ? 'auto' : '100%', flex: isMobile ? 1 : 'none', padding: '6px', background: 'transparent', color: 'var(--color-text-tertiary)',
            border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px'
          }}>
            <i className="ti ti-logout" style={{ fontSize: '13px' }} /> Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'notes' && (
          <NotesPanel
            notes={notes}
            currentId={currentNoteId}
            onSelect={setCurrentNoteId}
            onSaved={handleNoteSaved}
            onDeleted={handleNoteDeleted}
            onNew={handleNewNote}
            isMobile={isMobile}
          />
        )}
        {view === 'todo' && <TodoPanel todos={todos} setTodos={setTodos} isMobile={isMobile} />}
        {view === 'mindmap' && <MindMapPanel isMobile={isMobile} />}
        {view === 'ideas' && <IdeasPanel ideas={ideas} setIdeas={setIdeas} isMobile={isMobile} />}
      </div>
    </div>
  )
}
