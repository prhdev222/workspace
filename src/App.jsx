// src/App.jsx
import { useState, useEffect } from 'react'
import Login from './components/Login'
import NotesPanel from './components/NotesPanel'
import TodoPanel from './components/TodoPanel'
import MindMapPanel from './components/MindMapPanel'
import IdeasPanel from './components/IdeasPanel'
import AIAssistant from './components/AIAssistant'
import { getNotes, getTodos, getIdeas, getMindMaps, getLinks, createNote, logout } from './lib/api'

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
  const [mindMaps, setMindMaps] = useState([])
  const [links, setLinks] = useState([])
  const [currentNoteId, setCurrentNoteId] = useState(null)
  const [selectedTodoId, setSelectedTodoId] = useState(null)
  const [selectedIdeaId, setSelectedIdeaId] = useState(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const [openMindMapId, setOpenMindMapId] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('workspace-theme') || 'light')
  const [fontScale, setFontScale] = useState(() => {
    const saved = parseFloat(localStorage.getItem('workspace-font-scale') || '1')
    return Number.isFinite(saved) ? saved : 1
  })

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
    getMindMaps()
      .then(setMindMaps)
      .catch(err => {
        if (err?.status === 401) setAuthed(false)
        else console.error(err)
      })
    getLinks()
      .then(setLinks)
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('workspace-theme', theme)
  }, [theme])

  useEffect(() => {
    const nextScale = Math.max(0.9, Math.min(1.2, fontScale))
    document.documentElement.style.setProperty('--font-scale', String(nextScale))
    localStorage.setItem('workspace-font-scale', String(nextScale))
  }, [fontScale])

  async function handleLogin() {
    const data = await getNotes()
    setNotes(data)
    setCurrentNoteId(data[0]?.id || null)
    const [td, id, mm, lk] = await Promise.all([getTodos(), getIdeas(), getMindMaps(), getLinks()])
    setTodos(td); setIdeas(id); setMindMaps(mm); setLinks(lk)
    setAuthed(true)
  }

  async function handleLogout() {
    await logout()
    setAuthed(false)
    setNotes([]); setTodos([]); setIdeas([]); setMindMaps([]); setLinks([])
  }

  async function handleNewNote(parentId = null) {
    const note = await createNote({ title: 'Untitled note', tags: [], blocks: [], parent_id: parentId })
    setNotes(prev => [note, ...prev])
    setCurrentNoteId(note.id)
    setView('notes')
  }

  function handleNoteSaved(id, updates) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
  }

  function handleNoteDeleted(ids) {
    const removedIds = Array.isArray(ids) ? ids : [ids]
    const remaining = notes.filter(n => !removedIds.includes(n.id))
    setNotes(remaining)
    setCurrentNoteId(prev => removedIds.includes(prev) ? (remaining[0]?.id || null) : prev)
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
  const normalizedSearch = globalSearch.trim().toLowerCase()

  function noteSearchText(note) {
    return [
      note.title,
      ...(note.tags || []),
      ...(note.blocks || []).map(block => block.content || block.text || '')
    ].join(' ').toLowerCase()
  }

  function todoSearchText(todo) {
    return [todo.text, todo.priority, todo.due_label, todo.section].join(' ').toLowerCase()
  }

  function ideaSearchText(idea) {
    return [idea.content, idea.color, idea.emoji].join(' ').toLowerCase()
  }

  function mindMapSearchText(item) {
    return [item.title, item.content].join(' ').toLowerCase()
  }

  const globalResults = normalizedSearch
    ? [
        ...notes
          .filter(note => noteSearchText(note).includes(normalizedSearch))
          .slice(0, 4)
          .map(note => ({ id: `note-${note.id}`, type: 'notes', title: note.title || 'Untitled note', subtitle: (note.tags || []).map(tag => `#${tag}`).join(' '), targetId: note.id })),
        ...todos
          .filter(todo => todoSearchText(todo).includes(normalizedSearch))
          .slice(0, 4)
          .map(todo => ({ id: `todo-${todo.id}`, type: 'todo', title: todo.text, subtitle: `${todo.section} · ${todo.due_label || 'No due date'}`, targetId: todo.id })),
        ...ideas
          .filter(idea => ideaSearchText(idea).includes(normalizedSearch))
          .slice(0, 4)
          .map(idea => ({ id: `idea-${idea.id}`, type: 'ideas', title: idea.content, subtitle: `${idea.emoji || '💡'} ${idea.color || 'idea'}`, targetId: idea.id })),
        ...mindMaps
          .filter(item => mindMapSearchText(item).includes(normalizedSearch))
          .slice(0, 4)
          .map(item => ({ id: `mindmap-${item.id}`, type: 'mindmap', title: item.title || 'Untitled map', subtitle: (item.content || '').split('\n')[0] || 'Saved mind map', targetId: item.id }))
      ]
    : []

  function openSearchResult(result) {
    setView(result.type)
    setMobileMenuOpen(false)

    if (result.type === 'notes') {
      setCurrentNoteId(result.targetId)
    }
    if (result.type === 'todo') {
      setSelectedTodoId(result.targetId)
    }
    if (result.type === 'ideas') {
      setSelectedIdeaId(result.targetId)
    }

    if (result.type === 'mindmap') {
      setOpenMindMapId(result.targetId)
    } else {
      setOpenMindMapId(null)
    }
  }

  function navigateToEntity(type, id) {
    setView(type === 'ideas' ? 'ideas' : type)
    setMobileMenuOpen(false)

    if (type === 'notes') setCurrentNoteId(id)
    if (type === 'todo') setSelectedTodoId(id)
    if (type === 'ideas') setSelectedIdeaId(id)
    if (type === 'mindmap') setOpenMindMapId(id)
  }

  function controlButtonStyle(isActive = false) {
    return {
      padding: '6px 8px',
      borderRadius: '8px',
      border: '0.5px solid var(--color-border-secondary)',
      background: isActive ? '#E1F5EE' : 'var(--color-background-primary)',
      color: isActive ? '#085041' : 'var(--color-text-secondary)',
      fontSize: '11px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      minWidth: '34px'
    }
  }

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
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setFontScale(prev => Math.max(0.9, +(prev - 0.1).toFixed(2)))} style={controlButtonStyle()}>
              A-
            </button>
            <button onClick={() => setFontScale(1)} style={controlButtonStyle(fontScale === 1)}>
              A
            </button>
            <button onClick={() => setFontScale(prev => Math.min(1.2, +(prev + 0.1).toFixed(2)))} style={controlButtonStyle()}>
              A+
            </button>
            <button onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')} style={controlButtonStyle(theme === 'dark')}>
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
          <div style={{ marginTop: '10px' }}>
            <div style={{ position: 'relative' }}>
              <i
                className="ti ti-search"
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '13px',
                  color: 'var(--color-text-tertiary)'
                }}
              />
              <input
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                placeholder="Search all menus"
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 32px',
                  borderRadius: '10px',
                  border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            {normalizedSearch && (
              <div style={{ marginTop: '8px', display: 'grid', gap: '6px', maxHeight: isMobile ? '180px' : '220px', overflowY: 'auto' }}>
                {globalResults.length === 0 ? (
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--color-background-primary)', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    No results in notes, todos, ideas, or mind maps.
                  </div>
                ) : (
                  globalResults.map(result => (
                    <button
                      key={result.id}
                      onClick={() => openSearchResult(result)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '0.5px solid var(--color-border-tertiary)',
                        background: 'var(--color-background-primary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '10px', color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{result.type}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {result.title}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {result.subtitle || 'Open result'}
                      </div>
                    </button>
                  ))
                )}
              </div>
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

      <AIAssistant
        setNotes={setNotes}
        setTodos={setTodos}
        setView={setView}
        onNoteCreated={note => setCurrentNoteId(note.id)}
        onTodoCreated={() => {}}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: isMobile ? 'auto' : 'hidden', minHeight: 0 }}>
        {view === 'notes' && (
          <NotesPanel
            notes={notes}
            currentId={currentNoteId}
            onSelect={setCurrentNoteId}
            onSaved={handleNoteSaved}
            onDeleted={handleNoteDeleted}
            onNew={handleNewNote}
            isMobile={isMobile}
            externalSearch={globalSearch}
            links={links}
            setLinks={setLinks}
            entities={{ notes, todos, ideas, mindMaps }}
            onNavigate={navigateToEntity}
          />
        )}
        {view === 'todo' && <TodoPanel todos={todos} setTodos={setTodos} isMobile={isMobile} externalSearch={globalSearch} selectedTodoId={selectedTodoId} setSelectedTodoId={setSelectedTodoId} links={links} setLinks={setLinks} entities={{ notes, todos, ideas, mindMaps }} onNavigate={navigateToEntity} />}
        {view === 'mindmap' && <MindMapPanel isMobile={isMobile} savedMaps={mindMaps} setSavedMaps={setMindMaps} externalSearch={globalSearch} openMapId={openMindMapId} links={links} setLinks={setLinks} entities={{ notes, todos, ideas, mindMaps }} onNavigate={navigateToEntity} />}
        {view === 'ideas' && <IdeasPanel ideas={ideas} setIdeas={setIdeas} isMobile={isMobile} externalSearch={globalSearch} selectedIdeaId={selectedIdeaId} setSelectedIdeaId={setSelectedIdeaId} links={links} setLinks={setLinks} entities={{ notes, todos, ideas, mindMaps }} onNavigate={navigateToEntity} />}
      </div>
    </div>
  )
}
