// src/components/NotesPanel.jsx
// v2: slash commands · drag-to-reorder · rich formatting · keyboard shortcuts · mobile-optimised
import { useState, useEffect, useRef } from 'react'
import { updateNote, deleteNote, syncToObsidian, pullFromObsidian, unsyncFromObsidian } from '../lib/api'
import LinkedItemsPanel from './LinkedItemsPanel'
import { EmojiChips, QUICK_EMOJIS } from '../lib/emoji'

// ─── constants ───────────────────────────────────────────────────────────────

const TAG_STYLES = {
  lecture:  { bg: '#E6F1FB', color: '#185FA5', label: '📖 Lecture' },
  idea:     { bg: '#EEEDFE', color: '#534AB7', label: '💡 Idea' },
  clinical: { bg: '#E1F5EE', color: '#085041', label: '🩺 Clinical' },
  todo:     { bg: '#FAEEDA', color: '#854F0B', label: '✅ Todo' },
}

const BLOCK_ICONS = {
  heading: 'ti-heading',
  text:    'ti-align-left',
  todo:    'ti-circle',
  quote:   'ti-quote',
  bullet:  'ti-point',
  image:   'ti-photo',
}

const SLASH_COMMANDS = [
  { type: 'heading', icon: 'ti-heading',    label: 'Heading',  desc: 'Large section title' },
  { type: 'text',    icon: 'ti-align-left', label: 'Text',     desc: 'Plain paragraph' },
  { type: 'todo',    icon: 'ti-checkbox',   label: 'To-do',    desc: 'Checkable task' },
  { type: 'quote',   icon: 'ti-quote',      label: 'Quote',    desc: 'Highlighted callout' },
  { type: 'bullet',  icon: 'ti-list',       label: 'Bullet',   desc: 'List item' },
  { type: 'image',   icon: 'ti-photo',      label: 'Image',    desc: 'Drag & drop or paste image' },
]

// keyboard shortcut map shown in help panel
const SHORTCUTS = [
  { keys: ['⌘','B'],  action: 'Bold' },
  { keys: ['⌘','K'],  action: 'Insert link' },
  { keys: ['⌘','E'],  action: 'Inline code' },
  { keys: ['⌘','/'],  action: 'Slash menu' },
  { keys: ['⌘','S'],  action: 'Save note' },
  { keys: ['⌘','⏎'],  action: 'New block below' },
]

const STARTER_TEMPLATES = [
  {
    id: 'blank',
    label: 'Start writing',
    icon: 'ti-pencil',
    blocks: [
      { type: 'text', text: '', done: false }
    ]
  },
  {
    id: 'lecture',
    label: 'Lecture note',
    icon: 'ti-school',
    tag: 'lecture',
    blocks: [
      { type: 'heading', text: 'Key points', done: false },
      { type: 'bullet', text: '', done: false },
      { type: 'heading', text: 'Questions', done: false },
      { type: 'todo', text: '', done: false }
    ]
  },
  {
    id: 'clinical',
    label: 'Clinical note',
    icon: 'ti-stethoscope',
    tag: 'clinical',
    blocks: [
      { type: 'heading', text: 'Summary', done: false },
      { type: 'text', text: '', done: false },
      { type: 'heading', text: 'Plan', done: false },
      { type: 'todo', text: '', done: false }
    ]
  },
  {
    id: 'tasks',
    label: 'Task list',
    icon: 'ti-list-check',
    tag: 'todo',
    blocks: [
      { type: 'todo', text: '', done: false },
      { type: 'todo', text: '', done: false },
      { type: 'todo', text: '', done: false }
    ]
  }
]

const DRAW_COLORS = ['#173B33', '#1D9E75', '#185FA5', '#E24B4A', '#854F0B', '#111827']

// ─── tree / sort helpers ─────────────────────────────────────────────────────

function noteMatchesSearch(note, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [note.title, ...(note.tags || []), ...(note.blocks || []).map(b => b.content || b.text || '')]
    .join(' ').toLowerCase().includes(q)
}

function buildNoteTree(notes) {
  const byParent = new Map()
  notes.forEach(n => {
    const key = n.parent_id || 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(n)
  })
  byParent.forEach(ch => ch.sort((a, b) => {
    const ao = Number.isFinite(a.sort_order) ? a.sort_order : a.created_at || 0
    const bo = Number.isFinite(b.sort_order) ? b.sort_order : b.created_at || 0
    return ao - bo
  }))
  function visit(parentId = null, depth = 0) {
    return (byParent.get(parentId || 'root') || []).flatMap(n => [
      { ...n, depth }, ...visit(n.id, depth + 1)
    ])
  }
  return visit()
}

function buildChildrenMap(notes) {
  const m = new Map()
  notes.forEach(n => {
    const key = n.parent_id || 'root'
    if (!m.has(key)) m.set(key, [])
    m.get(key).push(n)
  })
  return m
}

function buildBreadcrumb(note, allNotes) {
  if (!note) return []
  const byId = new Map(allNotes.map(n => [n.id, n]))
  const chain = []
  let cur = note
  while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : null }
  return chain
}

function getDescendantIdSet(rootId, notes) {
  const cm = buildChildrenMap(notes)
  const ids = new Set([rootId])
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop();
    (cm.get(cur) || []).forEach(c => { if (!ids.has(c.id)) { ids.add(c.id); stack.push(c.id) } })
  }
  return ids
}

function getSiblingNotes(notes, parentId, excludeId = null) {
  return notes
    .filter(n => (n.parent_id || null) === (parentId || null) && n.id !== excludeId)
    .sort((a, b) => {
      const ao = Number.isFinite(a.sort_order) ? a.sort_order : a.created_at || 0
      const bo = Number.isFinite(b.sort_order) ? b.sort_order : b.created_at || 0
      return ao - bo
    })
}

function getDropPlacement(clientY, rect) {
  const off = clientY - rect.top
  const third = rect.height / 3
  if (off < third) return 'before'
  if (off > third * 2) return 'after'
  return 'inside'
}

function getNextSortOrder(notes, draggedId, target, placement) {
  if (placement === 'inside') {
    const siblings = getSiblingNotes(notes, target.id, draggedId)
    const last = siblings[siblings.length - 1]
    return { parentId: target.id, sortOrder: (Number.isFinite(last?.sort_order) ? last.sort_order : last?.created_at || 0) + 1 }
  }
  const parentId = target.parent_id || null
  const siblings = getSiblingNotes(notes, parentId, draggedId)
  const ti = siblings.findIndex(n => n.id === target.id)
  const prev = placement === 'before' ? siblings[ti - 1] : siblings[ti]
  const next = placement === 'before' ? siblings[ti] : siblings[ti + 1]
  const po = prev ? (Number.isFinite(prev.sort_order) ? prev.sort_order : prev.created_at || 0) : null
  const no = next ? (Number.isFinite(next.sort_order) ? next.sort_order : next.created_at || 0) : null
  if (po !== null && no !== null) return { parentId, sortOrder: (po + no) / 2 }
  if (po !== null) return { parentId, sortOrder: po + 1 }
  if (no !== null) return { parentId, sortOrder: no - 1 }
  return { parentId, sortOrder: Date.now() }
}

// ─── execCommand helpers ─────────────────────────────────────────────────────

function execBold() { document.execCommand('bold', false) }

function execCode() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const text = sel.toString()
  const code = document.createElement('code')
  code.style.cssText = 'background:rgba(0,0,0,0.08);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.9em'
  code.textContent = text
  const range = sel.getRangeAt(0)
  range.deleteContents()
  range.insertNode(code)
  sel.removeAllRanges()
}

function execLink(url) {
  if (!url) return
  const full = url.startsWith('http') ? url : `https://${url}`
  document.execCommand('createLink', false, full)
  document.querySelectorAll('[contenteditable] a').forEach(a => {
    a.target = '_blank'; a.rel = 'noopener noreferrer'
  })
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ─── FloatingToolbar (desktop) ───────────────────────────────────────────────

function FloatingToolbar({ onTriggerLink }) {
  const [pos, setPos] = useState(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const inputRef = useRef()
  const savedRange = useRef(null)

  // show on mouseup selection (desktop only — touch handled separately)
  useEffect(() => {
    function onMouseUp(e) {
      if (e.target.closest('[data-float-toolbar]')) return
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.toString().trim()) { setPos(null); setLinkMode(false); return }
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        setPos({ top: rect.top - 48, left: rect.left + rect.width / 2 })
        setLinkMode(false)
      }, 10)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])

  // allow Cmd+K from outside to open link mode
  useEffect(() => {
    if (onTriggerLink) onTriggerLink.current = openLink
  })

  function openLink() {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) savedRange.current = sel.getRangeAt(0).cloneRange()
    // synthesise a position if toolbar not visible yet
    if (!pos && savedRange.current) {
      const rect = savedRange.current.getBoundingClientRect()
      setPos({ top: rect.top - 48, left: rect.left + rect.width / 2 })
    }
    setLinkMode(true)
    setLinkUrl('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function applyLink() {
    if (savedRange.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    execLink(linkUrl)
    setPos(null); setLinkMode(false)
  }

  if (!pos) return null

  const divider = <div style={{ width: '0.5px', height: '16px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
  const btn = (onClick, icon, title) => (
    <button
      title={title}
      onClick={onClick}
      onMouseDown={e => e.preventDefault()}
      style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '5px 8px', borderRadius: '5px', fontSize: '14px', display: 'flex', alignItems: 'center' }}
    >
      <i className={`ti ${icon}`} />
    </button>
  )

  return (
    <div
      data-float-toolbar
      style={{
        position: 'fixed', top: pos.top, left: pos.left,
        transform: 'translateX(-50%)', zIndex: 9999,
        background: '#18181b', borderRadius: '9px',
        padding: '3px 5px', display: 'flex', alignItems: 'center', gap: '1px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {!linkMode ? (
        <>
          {btn(() => { execBold(); setPos(null) }, 'ti-bold', 'Bold (⌘B)')}
          {divider}
          {btn(() => { execCode(); setPos(null) }, 'ti-code', 'Inline code (⌘E)')}
          {divider}
          {btn(openLink, 'ti-link', 'Link (⌘K)')}
          {divider}
          {btn(() => { document.execCommand('removeFormat'); setPos(null) }, 'ti-clear-formatting', 'Clear format')}
        </>
      ) : (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '1px 2px' }}>
          <input
            ref={inputRef}
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setLinkMode(false) }}
            placeholder="Paste URL…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '12px', width: '180px', padding: '2px 4px' }}
          />
          <button onClick={applyLink} onMouseDown={e => e.preventDefault()}
            style={{ background: '#1D9E75', border: 'none', color: 'white', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', fontFamily: 'inherit' }}>
            Apply
          </button>
          <button onClick={() => setLinkMode(false)} onMouseDown={e => e.preventDefault()}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' }}>
            <i className="ti ti-x" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── MobileFormatBar (fixed bottom bar, shown when a block is focused) ───────

function MobileFormatBar({ activeBlockRef, onAddBlock, onSave, saving, hasNote }) {
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [show, setShow] = useState(false)
  const savedRange = useRef(null)
  const inputRef = useRef()

  // show bar when any contenteditable inside editor is focused
  useEffect(() => {
    function onFocus(e) {
      if (e.target.closest('[data-editor-area]') && e.target.isContentEditable) setShow(true)
    }
    function onBlur(e) {
      // delay so tap on bar doesn't hide it before action fires
      setTimeout(() => {
        const active = document.activeElement
        if (!active?.closest('[data-mobile-format-bar]') && !active?.isContentEditable) setShow(false)
      }, 150)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur) }
  }, [])

  function doExecOnSaved(fn) {
    if (savedRange.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    fn()
  }

  function saveSelRange() {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  function applyLink() {
    doExecOnSaved(() => execLink(linkUrl))
    setLinkMode(false); setLinkUrl('')
  }

  if (!show) return null

  const btn = (onPress, icon, label) => (
    <button
      onPointerDown={e => { e.preventDefault(); saveSelRange(); onPress() }}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 4px', fontSize: '11px' }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: '18px' }} />
      <span style={{ fontSize: '10px' }}>{label}</span>
    </button>
  )

  return (
    <div
      data-mobile-format-bar
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 9990,
        background: 'var(--color-background-primary)',
        borderTop: '0.5px solid var(--color-border-secondary)',
        padding: '0 4px env(safe-area-inset-bottom, 8px)',
        display: 'flex', alignItems: 'stretch',
      }}
    >
      {linkMode ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, padding: '8px 12px' }}>
          <input
            ref={inputRef}
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="Paste URL…"
            autoFocus
            style={{
              flex: 1, padding: '8px 12px', border: '0.5px solid var(--color-border-secondary)',
              borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit',
              background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', outline: 'none'
            }}
          />
          <button onPointerDown={e => { e.preventDefault(); applyLink() }}
            style={{ padding: '8px 14px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', fontFamily: 'inherit', cursor: 'pointer' }}>
            Apply
          </button>
          <button onPointerDown={e => { e.preventDefault(); setLinkMode(false) }}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', fontSize: '18px', cursor: 'pointer', padding: '6px' }}>
            <i className="ti ti-x" />
          </button>
        </div>
      ) : (
        <>
          {btn(() => doExecOnSaved(execBold), 'ti-bold', 'Bold')}
          {btn(() => doExecOnSaved(execCode), 'ti-code', 'Code')}
          {btn(() => { saveSelRange(); setLinkMode(true); setTimeout(() => inputRef.current?.focus(), 50) }, 'ti-link', 'Link')}
          {btn(() => doExecOnSaved(() => document.execCommand('removeFormat')), 'ti-clear-formatting', 'Clear')}
          <div style={{ width: '0.5px', background: 'var(--color-border-tertiary)', margin: '6px 2px' }} />
          {btn(() => onAddBlock('text'), 'ti-plus', 'Add')}
          {btn(() => onAddBlock('todo'), 'ti-checkbox', 'Todo')}
          {btn(() => onAddBlock('heading'), 'ti-heading', 'H')}
          <div style={{ width: '0.5px', background: 'var(--color-border-tertiary)', margin: '6px 2px' }} />
          <button
            onPointerDown={e => { e.preventDefault(); if (hasNote) onSave() }}
            disabled={!hasNote}
            style={{ flex: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', background: 'transparent', border: 'none', color: saving ? '#1D9E75' : '#085041', cursor: 'pointer', padding: '6px 4px', fontSize: '11px', fontWeight: '600' }}
          >
            <i className="ti ti-device-floppy" style={{ fontSize: '18px' }} />
            <span style={{ fontSize: '10px' }}>{saving ? 'Saving…' : 'Save'}</span>
          </button>
        </>
      )}
    </div>
  )
}

// ─── ShortcutHelpPanel ───────────────────────────────────────────────────────

function ShortcutHelpPanel({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--color-background-primary)', borderRadius: '16px',
        padding: '20px 24px', width: '320px',
        border: '0.5px solid var(--color-border-secondary)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.18)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' }}>Keyboard shortcuts</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: '16px' }}>
            <i className="ti ti-x" />
          </button>
        </div>
        {SHORTCUTS.map(s => (
          <div key={s.action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{s.action}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {s.keys.map(k => (
                <kbd key={k} style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '5px', padding: '2px 7px', fontSize: '12px', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>{k}</kbd>
              ))}
            </div>
          </div>
        ))}
        <div style={{ marginTop: '14px', padding: '10px 12px', borderRadius: '10px', background: 'var(--color-background-secondary)', fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: '1.6' }}>
          Type <kbd style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '3px', padding: '1px 5px', fontSize: '10px' }}>/</kbd> in any block to open the block-type menu.
        </div>
      </div>
    </div>
  )
}

// ─── SlashMenu ───────────────────────────────────────────────────────────────

function SlashMenu({ position, query, onSelect, onClose, isMobile }) {
  const [active, setActive] = useState(0)
  const filtered = SLASH_COMMANDS.filter(c =>
    !query || c.label.toLowerCase().startsWith(query.toLowerCase())
  )

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter')     { e.preventDefault(); if (filtered[active]) onSelect(filtered[active].type) }
      if (e.key === 'Escape')    { onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, filtered, onSelect, onClose])

  if (!filtered.length) return null

  // on mobile: anchor above keyboard (bottom sheet style)
  const style = isMobile
    ? {
        position: 'fixed', bottom: 56, left: 12, right: 12, zIndex: 9998,
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: '16px', boxShadow: '0 -4px 24px rgba(0,0,0,0.14)',
        padding: '8px', display: 'flex', gap: '8px', overflowX: 'auto',
      }
    : {
        position: 'fixed', top: position.top, left: position.left,
        zIndex: 9998, background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-secondary)',
        borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        padding: '6px', minWidth: '200px'
      }

  if (isMobile) return (
    <div style={style}>
      {filtered.map((cmd, i) => (
        <button key={cmd.type} onPointerDown={e => { e.preventDefault(); onSelect(cmd.type) }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: i === active ? '#E1F5EE' : 'var(--color-background-secondary)',
            color: i === active ? '#085041' : 'var(--color-text-primary)',
            flexShrink: 0, fontFamily: 'inherit'
          }}>
          <i className={`ti ${cmd.icon}`} style={{ fontSize: '20px' }} />
          <span style={{ fontSize: '11px', fontWeight: '500' }}>{cmd.label}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div style={style}>
      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Block type
      </div>
      {filtered.map((cmd, i) => (
        <div key={cmd.type}
          onMouseDown={e => { e.preventDefault(); onSelect(cmd.type) }}
          onMouseEnter={() => setActive(i)}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
            background: i === active ? '#E1F5EE' : 'transparent',
            color: i === active ? '#085041' : 'var(--color-text-primary)',
          }}>
          <i className={`ti ${cmd.icon}`} style={{ fontSize: '15px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '500' }}>{cmd.label}</div>
            <div style={{ fontSize: '11px', color: i === active ? '#3a9e7a' : 'var(--color-text-tertiary)' }}>{cmd.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── DrawingPad ──────────────────────────────────────────────────────────────

function DrawingPad({ isMobile, noteTags = [], onInsert, onCancel }) {
  const canvasRef = useRef()
  const drawingRef = useRef(false)
  const [color, setColor] = useState(DRAW_COLORS[0])
  const [size, setSize] = useState(4)
  const [label, setLabel] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = Math.min(840, Math.max(300, canvas.parentElement?.clientWidth || 640))
    const height = isMobile ? 300 : 360
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [isMobile])

  function getPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDrawing(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture?.(e.pointerId)
    const ctx = canvas.getContext('2d')
    const p = getPoint(e)
    drawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function draw(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = getPoint(e)
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function stopDrawing(e) {
    drawingRef.current = false
    canvasRef.current?.releasePointerCapture?.(e.pointerId)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, rect.width, rect.height)
  }

  function insertDrawing() {
    const canvas = canvasRef.current
    if (!canvas) return
    onInsert(canvas.toDataURL('image/png'), label.trim())
  }

  return (
    <div style={{
      border: '0.5px solid #9FE1CB',
      background: 'linear-gradient(180deg, #F5FFFB 0%, #FFFFFF 100%)',
      borderRadius: '16px',
      padding: isMobile ? '12px' : '14px',
      marginBottom: '16px',
      boxShadow: '0 10px 30px rgba(8,80,65,0.08)'
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#085041', fontSize: '13px', fontWeight: '700' }}>
          <i className="ti ti-pencil" style={{ fontSize: '16px' }} />
          Draw in note
        </div>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Drawing tag / label"
          style={{
            flex: '1 1 180px',
            minWidth: 0,
            padding: '8px 10px',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: '9px',
            background: 'var(--color-background-primary)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            fontSize: '12px',
            fontFamily: 'inherit'
          }}
        />
        {noteTags.slice(0, 4).map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => setLabel(tag)}
            style={{
              padding: '6px 9px',
              borderRadius: '999px',
              border: '0.5px solid #1D9E7540',
              background: label === tag ? '#E1F5EE' : '#FFFFFF',
              color: '#085041',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: 'inherit'
            }}
          >
            #{tag}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: '#FFFFFF' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerLeave={stopDrawing}
          style={{
            display: 'block',
            maxWidth: '100%',
            touchAction: 'none',
            cursor: 'crosshair'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {DRAW_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title={c}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '999px',
                border: color === c ? '2px solid #085041' : '1px solid rgba(0,0,0,0.12)',
                background: c,
                cursor: 'pointer'
              }}
            />
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Size
          <input type="range" min="2" max="16" value={size} onChange={e => setSize(Number(e.target.value))} />
        </label>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={clearCanvas}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: '#FFFFFF', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
          Clear
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: '#FFFFFF', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button type="button" onClick={insertDrawing}
          style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#1D9E75', color: '#FFFFFF', cursor: 'pointer', fontSize: '12px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="ti ti-plus" /> Insert drawing
        </button>
      </div>
    </div>
  )
}

// ─── RichBlock ───────────────────────────────────────────────────────────────

function RichBlock({
  block, index, isMobile,
  onTextChange, onToggleDone, onDelete, onTypeChange, onAddBelow,
  onDragStart, onDragOver, onDrop,
  isDragging, isDropTarget, dropPosition,
  triggerLinkRef,
  onFocus,
}) {
  const ref = useRef()
  const [slashMenu, setSlashMenu] = useState(null)
  const slashStart = useRef(-1)

  // Set content once on mount — never use dangerouslySetInnerHTML on a contentEditable
  // because React re-renders reset innerHTML and jump the cursor to the start
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = block.text || ''
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getTextStyle() {
    const base = { flex: 1, outline: 'none', lineHeight: 1.75, minHeight: '22px', wordBreak: 'break-word', fontFamily: 'inherit' }
    if (block.type === 'heading') return { ...base, fontSize: '18px', fontFamily: "'Lora', serif", fontWeight: '500' }
    if (block.type === 'quote')   return { ...base, fontSize: '14px', fontStyle: 'italic' }
    if (block.type === 'todo')    return { ...base, fontSize: '14px', color: block.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', textDecoration: block.done ? 'line-through' : 'none' }
    return { ...base, fontSize: '14px' }
  }

  function handleKeyDown(e) {
    const isMac = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.includes('Mac')
    const mod = isMac ? e.metaKey : e.ctrlKey

    // ── keyboard shortcuts ──────────────────────────────────────────────────
    if (mod && e.key === 'b') { e.preventDefault(); execBold(); return }
    if (mod && e.key === 'e') { e.preventDefault(); execCode(); return }
    if (mod && e.key === 'k') {
      e.preventDefault()
      // save selection then open link via FloatingToolbar
      if (triggerLinkRef?.current) triggerLinkRef.current()
      return
    }
    if (mod && e.key === '/') {
      e.preventDefault()
      const el = ref.current
      if (el) {
        const rect = el.getBoundingClientRect()
        slashStart.current = el.innerText.length
        setSlashMenu({ top: rect.bottom + 4, left: rect.left, query: '' })
      }
      return
    }
    if (mod && e.key === 'Enter') {
      e.preventDefault()
      onAddBelow(index)
      return
    }

    // ── slash command trigger ───────────────────────────────────────────────
    if (e.key === '/') {
      const el = ref.current
      if (el) {
        const rect = el.getBoundingClientRect()
        slashStart.current = el.innerText.length
        setSlashMenu({ top: rect.bottom + 4, left: rect.left, query: '' })
      }
      return
    }

    // update slash query while typing
    if (slashMenu) {
      if (e.key === 'Backspace') {
        const pos = window.getSelection()?.getRangeAt(0)?.startOffset ?? 0
        if (pos <= slashStart.current) { setSlashMenu(null); slashStart.current = -1 }
        else setSlashMenu(m => ({ ...m, query: m.query.slice(0, -1) }))
      } else if (e.key.length === 1 && !mod) {
        setSlashMenu(m => ({ ...m, query: m.query + e.key }))
      }
    }
  }

  function handleInput(e) {
    if (slashMenu) {
      const cur = e.target.innerText
      const si = cur.lastIndexOf('/')
      if (si === -1) { setSlashMenu(null); slashStart.current = -1 }
      else setSlashMenu(m => ({ ...m, query: cur.slice(si + 1) }))
    }
    onTextChange(index, e.target.innerHTML)
  }

  function selectSlashType(type) {
    setSlashMenu(null); slashStart.current = -1
    const el = ref.current
    if (el) {
      const si = el.innerHTML.lastIndexOf('/')
      if (si !== -1) {
        el.innerHTML = el.innerHTML.slice(0, si)
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(el); range.collapse(false)
        sel.removeAllRanges(); sel.addRange(range)
      }
      onTextChange(index, el.innerHTML)
    }
    onTypeChange(index, type)
  }

  const dropStyle = isDropTarget ? {
    borderTop: dropPosition === 'before' ? '2px solid #1D9E75' : undefined,
    borderBottom: dropPosition === 'after' ? '2px solid #1D9E75' : undefined,
    boxShadow: dropPosition === 'inside' ? 'inset 0 0 0 1.5px #1D9E75' : undefined,
  } : {}

  return (
    <>
      {slashMenu && (
        <SlashMenu
          position={{ top: slashMenu.top, left: slashMenu.left }}
          query={slashMenu.query}
          onSelect={selectSlashType}
          onClose={() => { setSlashMenu(null); slashStart.current = -1 }}
          isMobile={isMobile}
        />
      )}
      <div
        draggable={!isMobile}
        onDragStart={() => !isMobile && onDragStart(index)}
        onDragOver={e => { if (!isMobile) { e.preventDefault(); onDragOver(e, index) } }}
        onDrop={e => { if (!isMobile) { e.preventDefault(); onDrop(index) } }}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: '6px',
          marginBottom: '4px', padding: '5px 6px 5px 2px', borderRadius: '8px',
          borderLeft: block.type === 'quote' ? '3px solid #1D9E75' : 'none',
          background: block.type === 'quote' ? 'rgba(29,158,117,0.05)' : 'transparent',
          opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s',
          ...dropStyle, position: 'relative',
        }}
        className="block-row"
      >
        {/* drag handle — desktop only */}
        {!isMobile && (
          <div title="Drag to reorder" className="drag-handle"
            style={{ cursor: 'grab', padding: '3px 2px', opacity: 0.25, flexShrink: 0, color: 'var(--color-text-tertiary)', fontSize: '14px', paddingTop: '4px', userSelect: 'none' }}>
            <i className="ti ti-grip-vertical" />
          </div>
        )}

        {/* icon / checkbox — hidden for image blocks */}
        {block.type !== 'image' && (
          <i
            className={`ti ${block.done ? 'ti-circle-check' : BLOCK_ICONS[block.type] || 'ti-align-left'}`}
            onClick={block.type === 'todo' ? () => onToggleDone(index) : undefined}
            style={{ fontSize: '14px', color: block.done ? '#1D9E75' : 'var(--color-text-secondary)', cursor: block.type === 'todo' ? 'pointer' : 'default', flexShrink: 0, paddingTop: '3px' }}
          />
        )}

        {block.type === 'bullet' && (
          <span style={{ color: '#1D9E75', paddingTop: '2px', flexShrink: 0, fontSize: '16px', lineHeight: '22px' }}>•</span>
        )}

        {/* image block */}
        {block.type === 'image' ? (
          block.text ? (
            <div style={{ flex: 1, position: 'relative' }}>
              <img
                src={block.text}
                alt=""
                style={{ maxWidth: '100%', borderRadius: '10px', display: 'block', cursor: 'pointer' }}
                onClick={() => window.open(block.text, '_blank')}
              />
            </div>
          ) : (
            <div style={{ flex: 1, padding: '28px', border: '1.5px dashed var(--color-border-secondary)', borderRadius: '10px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              <i className="ti ti-photo" style={{ fontSize: '24px', display: 'block', marginBottom: '6px' }} />
              ลากรูปมาวางที่นี่ หรือ paste
            </div>
          )
        ) : (
          /* editable content */
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            data-editor-area
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => onFocus?.(index)}
            onBlur={e => onTextChange(index, e.target.innerHTML)}
            style={getTextStyle()}
            data-placeholder={
              block.type === 'heading' ? 'Heading…' :
              block.type === 'quote'   ? 'Quote…' :
              block.type === 'bullet'  ? 'List item…' :
              block.type === 'todo'    ? 'Task…' :
              isMobile ? 'Write… (/ for menu)' : 'Write, or type / for commands…'
            }
          />
        )}

        {/* delete */}
        <button onClick={() => onDelete(index)} className="block-delete-btn"
          style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '12px', opacity: 0, flexShrink: 0, paddingTop: '3px', transition: 'opacity 0.1s' }}>
          <i className="ti ti-x" />
        </button>
      </div>
    </>
  )
}

// ─── Main NotesPanel ─────────────────────────────────────────────────────────

export default function NotesPanel({
  notes, currentId, onSelect, onSaved, onDeleted, onNew,
  isMobile = false, externalSearch = '',
  links = [], setLinks, entities, onNavigate
}) {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [blocks, setBlocks] = useState([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [obsidianSyncing, setObsidianSyncing] = useState(false)
  const [mobileTagFilter, setMobileTagFilter] = useState('all')
  const [search, setSearch] = useState(externalSearch)
  const [parentId, setParentId] = useState('')
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const [draggedNoteId, setDraggedNoteId] = useState(null)
  const [dropHint, setDropHint] = useState(null)
  const [mobileMoveTargetId, setMobileMoveTargetId] = useState('')
  const [mobileMovePlacement, setMobileMovePlacement] = useState('inside')
  const [mobileMoveOpen, setMobileMoveOpen] = useState(false)
  const [draggedBlockIdx, setDraggedBlockIdx] = useState(null)
  const [blockDropTarget, setBlockDropTarget] = useState(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [readMode, setReadMode] = useState(false)
  const [mobileFocusMode, setMobileFocusMode] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)
  const [metaHidden, setMetaHidden] = useState(false)
  const [activeBlockIdx, setActiveBlockIdx] = useState(null)
  const [drawingOpen, setDrawingOpen] = useState(false)
  const triggerLinkRef = useRef(null)
  const titleRef = useRef()
  const imageInputRef = useRef()

  const note = notes.find(n => n.id === currentId)
  const availableTags = [...new Set(notes.flatMap(n => n.tags || []))]
  const filteredNotes = notes.filter(n => {
    const tagPass = !isMobile || mobileTagFilter === 'all' || (n.tags || []).includes(mobileTagFilter)
    return tagPass && noteMatchesSearch(n, search)
  })
  const visibleNotes = buildNoteTree(filteredNotes)
  const allTreeNotes = buildNoteTree(notes)
  const breadcrumb = buildBreadcrumb(note, notes)
  const descendantIds = note ? getDescendantIdSet(note.id, notes) : new Set()
  const parentOptions = allTreeNotes.filter(n => n.id !== currentId && !descendantIds.has(n.id))
  const filteredChildrenMap = buildChildrenMap(filteredNotes)
  const collapsibleIds = new Set(
    filteredNotes.filter(n => (filteredChildrenMap.get(n.id) || []).length > 0).map(n => n.id)
  )

  useEffect(() => {
    if (note) {
      setTitle(note.title); setTags(note.tags || [])
      setBlocks((note.blocks || []).map(b => ({ ...b, text: b.content || b.text || '' })))
      setParentId(note.parent_id || ''); setMobileMoveTargetId(note.parent_id || '')
      setDirty(false); setLastSavedAt(null)
      setDrawingOpen(false)
    } else { setTitle(''); setTags([]); setBlocks([]); setParentId(''); setMobileMoveTargetId(''); setDirty(false); setLastSavedAt(null); setDrawingOpen(false) }
  }, [currentId, note])

  useEffect(() => { setSearch(externalSearch) }, [externalSearch])

  useEffect(() => {
    if (!isMobile || !visibleNotes.length) return
    if (!visibleNotes.some(n => n.id === currentId)) onSelect(visibleNotes[0].id)
  }, [isMobile, mobileTagFilter, currentId])

  useEffect(() => {
    if (!breadcrumb.length) return
    const ancestorIds = new Set(breadcrumb.slice(0, -1).map(n => n.id))
    if (!ancestorIds.size) return
    setCollapsedIds(prev => {
      const next = new Set(prev); let changed = false
      ancestorIds.forEach(id => { if (next.has(id)) { next.delete(id); changed = true } })
      return changed ? next : prev
    })
  }, [breadcrumb])

  // global Cmd+S to save
  useEffect(() => {
    function onKey(e) {
      const isMac = navigator.platform.toLowerCase().includes('mac') || navigator.userAgent.includes('Mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === 's') { e.preventDefault(); if (currentId) saveNote() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [currentId, title, tags, blocks, parentId])

  // ── block ops ──────────────────────────────────────────────────────────────

  function addBlock(type) {
    setBlocks(prev => [...prev, { id: crypto.randomUUID(), type, text: '', done: false }])
    setDirty(true)
    // Auto-focus the new block on mobile so the keyboard and format bar appear
    if (isMobile) {
      setTimeout(() => {
        const all = document.querySelectorAll('[contenteditable="true"]')
        if (all.length) all[all.length - 1].focus()
      }, 80)
    }
  }

  function addBlockBelow(idx) {
    setBlocks(prev => {
      const next = [...prev]
      next.splice(idx + 1, 0, { id: crypto.randomUUID(), type: 'text', text: '', done: false })
      return next
    })
    setDirty(true)
  }

  function updateBlockText(idx, html) {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, text: html } : b))
    setDirty(true)
  }

  function insertEmoji(emoji) {
    const active = document.activeElement
    if (active === titleRef.current) {
      const start = active.selectionStart ?? title.length
      const end = active.selectionEnd ?? title.length
      const next = `${title.slice(0, start)}${emoji}${title.slice(end)}`
      setTitle(next)
      setDirty(true)
      setTimeout(() => {
        titleRef.current?.focus()
        titleRef.current?.setSelectionRange(start + emoji.length, start + emoji.length)
      }, 0)
      return
    }

    if (active?.isContentEditable) {
      active.focus()
      document.execCommand('insertText', false, emoji)
      if (activeBlockIdx !== null) updateBlockText(activeBlockIdx, active.innerHTML)
      return
    }

    if (activeBlockIdx !== null && blocks[activeBlockIdx]) {
      setBlocks(prev => prev.map((block, index) => index === activeBlockIdx ? { ...block, text: `${block.text || ''}${emoji}` } : block))
    } else if (blocks.length) {
      setBlocks(prev => prev.map((block, index) => index === prev.length - 1 ? { ...block, text: `${block.text || ''}${emoji}` } : block))
      setActiveBlockIdx(blocks.length - 1)
    } else {
      setBlocks([{ id: crypto.randomUUID(), type: 'text', text: emoji, done: false }])
      setActiveBlockIdx(0)
    }
    setDirty(true)
  }

  function toggleBlockDone(idx) {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, done: !b.done } : b))
    setDirty(true)
  }

  function changeBlockType(idx, type) {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, type } : b))
    setDirty(true)
  }

  function deleteBlock(idx) {
    setBlocks(prev => prev.filter((_, i) => i !== idx))
    setDirty(true)
  }

  // ── block drag-reorder (desktop only) ─────────────────────────────────────

  function handleBlockDragStart(idx) { setDraggedBlockIdx(idx) }

  function handleBlockDragOver(e, idx) {
    if (draggedBlockIdx === null || draggedBlockIdx === idx) return
    const rect = e.currentTarget.getBoundingClientRect()
    setBlockDropTarget({ idx, position: (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after' })
  }

  function handleBlockDrop(idx) {
    if (draggedBlockIdx === null || draggedBlockIdx === idx) { setDraggedBlockIdx(null); setBlockDropTarget(null); return }
    setBlocks(prev => {
      const next = [...prev]
      const [moved] = next.splice(draggedBlockIdx, 1)
      const target = idx > draggedBlockIdx ? idx - 1 : idx
      const pos = blockDropTarget?.position === 'after' ? target + 1 : target
      next.splice(pos, 0, moved)
      return next
    })
    setDraggedBlockIdx(null); setBlockDropTarget(null)
    setDirty(true)
  }

  // ── image drop / paste ────────────────────────────────────────────────────

  function insertImageBlock(dataUrl) {
    setBlocks(prev => [...prev, { id: crypto.randomUUID(), type: 'image', text: dataUrl, done: false }])
    setDirty(true)
  }

  function insertDrawingBlock(dataUrl, label) {
    setBlocks(prev => {
      const next = [...prev]
      if (label) {
        next.push({
          id: crypto.randomUUID(),
          type: 'text',
          text: `<strong>Drawing:</strong> ${escapeHtml(label)}`,
          done: false
        })
      }
      next.push({ id: crypto.randomUUID(), type: 'image', text: dataUrl, done: false })
      return next
    })
    setDrawingOpen(false)
    setDirty(true)
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleEditorDrop(e) {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file)
      insertImageBlock(dataUrl)
    }
  }

  async function handleEditorPaste(e) {
    const items = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/'))
    if (items.length === 0) return
    e.preventDefault()
    for (const item of items) {
      const file = item.getAsFile()
      if (!file) continue
      const dataUrl = await readFileAsDataUrl(file)
      insertImageBlock(dataUrl)
    }
  }

  async function handleImageFiles(files) {
    for (const file of Array.from(files || []).filter(f => f.type.startsWith('image/'))) {
      const dataUrl = await readFileAsDataUrl(file)
      insertImageBlock(dataUrl)
    }
  }

  async function handleImageUpload(e) {
    await handleImageFiles(e.target.files)
    e.target.value = ''
  }

  // ── note ops ───────────────────────────────────────────────────────────────

  function toggleTag(tag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
    setDirty(true)
  }

  function toggleCollapsed(id) {
    setCollapsedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function applyStarterTemplate(template) {
    setBlocks(template.blocks.map(block => ({ ...block, id: crypto.randomUUID() })))
    if (template.tag) setTags(prev => prev.includes(template.tag) ? prev : [...prev, template.tag])
    setDirty(true)
    setTimeout(() => {
      const firstEditable = document.querySelector('[contenteditable="true"]')
      firstEditable?.focus()
    }, 80)
  }

  async function pushNoteToObsidian({ silent = false } = {}) {
    if (!currentId) return false
    setObsidianSyncing(true)
    try {
      const result = await syncToObsidian(currentId)
      onSaved(currentId, { obsidian_synced: 1, obsidian_path: result.path, obsidian_synced_at: result.synced_at, updated_at: Date.now() })
      return true
    } catch (e) {
      if (!silent) alert('Sync to Obsidian failed: ' + e.message)
      return false
    } finally {
      setObsidianSyncing(false)
    }
  }

  async function saveNote({ skipAutoSync = false, showAutoSyncErrors = true } = {}) {
    if (!currentId) return false
    setSaving(true)
    try {
      const resolvedParentId = parentId || null
      const savedBlocks = blocks.map((b, i) => ({ id: b.id || crypto.randomUUID(), type: b.type, content: b.text, done: b.done, position: i }))
      await updateNote(currentId, {
        title: title || 'Untitled', tags, parent_id: resolvedParentId,
        blocks: savedBlocks
      })
      onSaved(currentId, { title: title || 'Untitled', tags, parent_id: resolvedParentId, blocks: savedBlocks, updated_at: Date.now() })
      setDirty(false)
      setLastSavedAt(new Date())
      if (!skipAutoSync && note?.obsidian_auto_sync) {
        await pushNoteToObsidian({ silent: !showAutoSyncErrors })
      }
      return true
    } catch (e) {
      alert('Save failed: ' + e.message)
      return false
    } finally { setSaving(false) }
  }

  async function save() {
    return saveNote()
  }

  useEffect(() => {
    if (!currentId || !dirty || saving) return
    const timer = setTimeout(() => { saveNote({ showAutoSyncErrors: false }) }, 1200)
    return () => clearTimeout(timer)
  }, [currentId, dirty, saving, title, tags, blocks, parentId])

  async function handleDelete() {
    if (!currentId || !confirm('Delete this note?')) return
    const result = await deleteNote(currentId)
    onDeleted(result.deleted_ids || [currentId])
  }

  async function handleSyncToObsidian() {
    if (!currentId) return
    const saved = await saveNote({ skipAutoSync: true })
    if (!saved) return
    await pushNoteToObsidian()
  }

  async function handlePullFromObsidian() {
    if (!currentId) return
    setObsidianSyncing(true)
    try {
      const result = await pullFromObsidian(currentId)
      setTitle(result.title)
      setBlocks(result.blocks.map(b => ({ ...b, id: crypto.randomUUID(), text: b.content || '' })))
      onSaved(currentId, { title: result.title, obsidian_synced_at: result.synced_at, updated_at: result.synced_at })
    } catch (e) { alert('Pull from Obsidian failed: ' + e.message) }
    finally { setObsidianSyncing(false) }
  }

  async function handleUnsyncObsidian() {
    if (!currentId || !confirm('Disconnect this note from Obsidian? (The file in Obsidian will stay)')) return
    try {
      await unsyncFromObsidian(currentId)
      onSaved(currentId, { obsidian_synced: 0, obsidian_auto_sync: 0, obsidian_path: null, obsidian_synced_at: null })
    } catch (e) { alert('Unsync failed: ' + e.message) }
  }

  async function handleToggleAutoSync() {
    if (!currentId) return
    const nextValue = !note?.obsidian_auto_sync
    try {
      await updateNote(currentId, { obsidian_auto_sync: nextValue })
      onSaved(currentId, { obsidian_auto_sync: nextValue, updated_at: Date.now() })
      if (nextValue && !dirty) {
        await pushNoteToObsidian()
      }
    } catch (e) {
      alert('Auto-sync update failed: ' + e.message)
    }
  }

  async function handleCreateSubpage() { if (currentId) await onNew(currentId) }

  function collapseAll() { setCollapsedIds(new Set(collapsibleIds)) }
  function expandAll() { setCollapsedIds(new Set()) }

  // ── note drag-reorder (sidebar, desktop only) ──────────────────────────────

  async function moveNoteWithPlacement(noteId, targetNote, placement) {
    const desc = getDescendantIdSet(noteId, notes)
    if (placement === 'inside' && desc.has(targetNote.id)) throw new Error('Cannot move a page inside its own subpage')
    const { parentId: nextParentId, sortOrder } = getNextSortOrder(notes, noteId, targetNote, placement)
    await updateNote(noteId, { parent_id: nextParentId, sort_order: sortOrder })
    onSaved(noteId, { parent_id: nextParentId, sort_order: sortOrder, updated_at: Date.now() })
    if (noteId === currentId) setParentId(nextParentId || '')
  }

  async function handleDropOnNote(targetNote) {
    if (!draggedNoteId || draggedNoteId === targetNote.id || !dropHint || dropHint.targetId !== targetNote.id) return
    try { await moveNoteWithPlacement(draggedNoteId, targetNote, dropHint.placement) }
    catch (e) { alert(`Move failed: ${e.message}`) }
    finally { setDraggedNoteId(null); setDropHint(null) }
  }

  async function handleMobileMove() {
    if (!currentId || !mobileMoveTargetId) return
    const targetNote = notes.find(n => n.id === mobileMoveTargetId)
    if (!targetNote || targetNote.id === currentId) return
    try { await moveNoteWithPlacement(currentId, targetNote, mobileMovePlacement); setMobileMoveOpen(false) }
    catch (e) { alert(`Move failed: ${e.message}`) }
  }

  // ── sidebar tree ───────────────────────────────────────────────────────────

  function getVisibleItems(items) {
    const hiddenDepths = []
    return items.filter(item => {
      while (hiddenDepths.length && hiddenDepths[hiddenDepths.length - 1] >= item.depth) hiddenDepths.pop()
      const hidden = hiddenDepths.length > 0
      if (collapsedIds.has(item.id)) hiddenDepths.push(item.depth)
      return !hidden
    })
  }

  function renderDesktopTree(items) {
    return getVisibleItems(items).map(n => (
      <div key={n.id} style={{ marginBottom: '2px' }}>
        <div
          draggable
          onDragStart={() => setDraggedNoteId(n.id)}
          onDragEnd={() => { setDraggedNoteId(null); setDropHint(null) }}
          onDragOver={e => {
            if (!draggedNoteId || draggedNoteId === n.id) return
            const desc = getDescendantIdSet(draggedNoteId, notes)
            const rect = e.currentTarget.getBoundingClientRect()
            const placement = getDropPlacement(e.clientY, rect)
            if (placement === 'inside' && desc.has(n.id)) return
            e.preventDefault(); setDropHint({ targetId: n.id, placement })
          }}
          onDrop={e => { e.preventDefault(); handleDropOnNote(n) }}
          style={{
            padding: '8px', paddingLeft: `${8 + n.depth * 14}px`,
            borderRadius: '8px', cursor: 'pointer',
            background: n.id === currentId ? '#E1F5EE' : 'transparent',
            border: dropHint?.targetId === n.id ? '1px solid #9CCFB9' : '1px solid transparent',
            borderTopColor: dropHint?.targetId === n.id && dropHint.placement === 'before' ? '#1D9E75' : undefined,
            borderBottomColor: dropHint?.targetId === n.id && dropHint.placement === 'after' ? '#1D9E75' : undefined,
            boxShadow: dropHint?.targetId === n.id && dropHint.placement === 'inside' ? 'inset 0 0 0 1px #1D9E75' : 'none',
            opacity: draggedNoteId === n.id ? 0.55 : 1,
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: n.id === currentId ? '600' : '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: n.id === currentId ? '#085041' : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {dropHint?.targetId === n.id && (
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1D9E75', background: '#E1F5EE', borderRadius: '999px', padding: '2px 6px' }}>{dropHint.placement}</span>
            )}
            <button onClick={() => { if ((filteredChildrenMap.get(n.id) || []).length > 0) toggleCollapsed(n.id) }}
              style={{ width: '16px', height: '16px', border: 'none', background: 'transparent', padding: 0, cursor: (filteredChildrenMap.get(n.id) || []).length > 0 ? 'pointer' : 'default', color: 'var(--color-text-tertiary)', fontSize: '11px', flexShrink: 0 }}>
              {(filteredChildrenMap.get(n.id) || []).length > 0 ? (collapsedIds.has(n.id) ? '▸' : '▾') : (n.depth === 0 ? '•' : '↳')}
            </button>
            <button onClick={() => onSelect(n.id)}
              style={{ border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {n.title}
            </button>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '3px', marginLeft: '17px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {(n.tags || []).map(t => <span key={t} style={{ color: TAG_STYLES[t]?.color || '#888' }}>#{t}</span>)}
          </div>
        </div>
      </div>
    ))
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .block-row:hover .block-delete-btn { opacity: 0.5 !important; }
        .block-row:hover .drag-handle { opacity: 0.6 !important; }
        [contenteditable]:empty:before { content: attr(data-placeholder); color: var(--color-text-tertiary); pointer-events: none; font-style: italic; }
        [contenteditable] a { color: #1D9E75; text-decoration: underline; }
        [contenteditable] strong, [contenteditable] b { font-weight: 600; }
        [contenteditable] code { background: rgba(0,0,0,0.08); padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
      `}</style>

      {showShortcuts && <ShortcutHelpPanel onClose={() => setShowShortcuts(false)} />}
      {!isMobile && <FloatingToolbar onTriggerLink={triggerLinkRef} />}
      {isMobile && (
        <MobileFormatBar
          onAddBlock={addBlock}
          onSave={saveNote}
          saving={saving}
          hasNote={!!currentId}
        />
      )}

      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        flexDirection: isMobile ? 'column' : 'row',
        position: isMobile && mobileFocusMode ? 'fixed' : 'relative',
        inset: isMobile && mobileFocusMode ? 0 : 'auto',
        zIndex: isMobile && mobileFocusMode ? 9965 : 'auto',
        background: 'var(--color-background-primary)'
      }}>

        {/* sidebar toggle button — desktop only */}
        {!isMobile && (
          <button onClick={() => setSidebarHidden(p => !p)} title={sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}
            style={{
              position: 'absolute', left: sidebarHidden ? '0' : '220px', top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10, width: '18px', height: '40px',
              background: 'var(--color-background-secondary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderLeft: sidebarHidden ? '0.5px solid var(--color-border-tertiary)' : 'none',
              borderRadius: sidebarHidden ? '0 6px 6px 0' : '0 6px 6px 0',
              cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: '11px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'left 0.2s'
            }}>
            <i className={`ti ${sidebarHidden ? 'ti-chevron-right' : 'ti-chevron-left'}`} />
          </button>
        )}

        {/* ── sidebar ── */}
        <div style={{
          width: isMobile ? '100%' : sidebarHidden ? '0' : '220px',
          maxHeight: isMobile ? '154px' : 'none',
          borderRight: isMobile ? 'none' : '0.5px solid var(--color-border-tertiary)',
          borderBottom: isMobile ? '0.5px solid var(--color-border-tertiary)' : 'none',
          display: isMobile && mobileFocusMode ? 'none' : 'flex', flexDirection: 'column', background: 'var(--color-background-secondary)',
          overflow: 'hidden', flexShrink: 0,
          transition: 'width 0.2s'
        }}>
          <div style={{ padding: isMobile ? '8px' : '10px 8px' }}>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes"
                style={{ width: '100%', padding: '8px 10px 8px 30px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '10px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {isMobile && (
              <>
                <div style={{ fontSize: '10px', fontWeight: '600', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 2px 8px' }}>
                  Notes ({visibleNotes.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: availableTags.length ? '110px 1fr' : '1fr', gap: '8px', marginBottom: '8px' }}>
                  {availableTags.length > 0 && (
                    <select value={mobileTagFilter} onChange={e => setMobileTagFilter(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '10px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }}>
                      <option value="all">All tags</option>
                      {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  <select value={currentId || ''} onChange={e => onSelect(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '10px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }}>
                    {visibleNotes.length === 0
                      ? <option value="">No notes</option>
                      : visibleNotes.map(n => <option key={n.id} value={n.id}>{`${'— '.repeat(n.depth)}${n.title || 'Untitled note'}`}</option>)}
                  </select>
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: currentId ? '1fr 1fr' : '1fr', gap: '8px' }}>
              <button onClick={() => onNew()} style={{ width: '100%', padding: '7px 10px', background: '#1D9E75', color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'inherit' }}>
                <i className="ti ti-plus" /> New page
              </button>
              {currentId && (
                <button onClick={handleCreateSubpage} style={{ width: '100%', padding: '7px 10px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'inherit' }}>
                  <i className="ti ti-indent-increase" /> Subpage
                </button>
              )}
            </div>

            {!isMobile && visibleNotes.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={expandAll} style={{ flex: 1, padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Expand all</button>
                <button onClick={collapseAll} style={{ flex: 1, padding: '6px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Collapse all</button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: isMobile ? 'hidden' : 'auto', overflowX: 'hidden', padding: '0 8px 8px', display: isMobile ? 'none' : 'block' }}>
            {renderDesktopTree(visibleNotes)}
            {visibleNotes.length === 0 && (
              <div style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>No notes match this search.</div>
            )}
          </div>
        </div>

        {/* ── editor ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* toolbar — desktop only (mobile uses bottom bar) */}
          {!isMobile && (
            <div style={{ padding: '8px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginRight: '2px' }}>Add:</span>
              {[['heading','ti-heading'],['text','ti-text-size'],['todo','ti-checkbox'],['quote','ti-quote'],['bullet','ti-list'],['image','ti-photo']].map(([type, icon]) => (
                <button key={type} onClick={() => addBlock(type)}
                  style={{ padding: '4px 8px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className={`ti ${icon}`} />
                  <span style={{ textTransform: 'capitalize', fontSize: '11px' }}>{type}</span>
                </button>
              ))}
              <button onClick={() => setDrawingOpen(true)} disabled={!currentId}
                style={{ padding: '4px 8px', border: '0.5px solid #1D9E7540', background: '#F0FBF7', color: '#085041', cursor: currentId ? 'pointer' : 'not-allowed', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="ti ti-pencil" />
                <span style={{ fontSize: '11px' }}>Draw</span>
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts"
                style={{ padding: '4px 8px', border: '0.5px solid var(--color-border-tertiary)', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="ti ti-keyboard" />
                <span style={{ fontSize: '11px' }}>Shortcuts</span>
              </button>
              <button onClick={saveNote} disabled={saving || !currentId}
                style={{ padding: '4px 12px', background: saving ? '#9FE1CB' : '#1D9E75', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save'}
              </button>
              {currentId && (
                <span style={{ fontSize: '11px', color: dirty ? '#854F0B' : 'var(--color-text-tertiary)', marginLeft: '4px' }}>
                  {saving ? 'Saving…' : dirty ? 'Unsaved changes' : lastSavedAt ? 'Saved' : 'Auto-save on'}
                </span>
              )}
              <button onClick={handleDelete} disabled={!currentId}
                style={{ padding: '4px 8px', background: 'transparent', color: '#E24B4A', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <i className="ti ti-trash" />
              </button>

              {/* Obsidian sync buttons */}
              <div style={{ width: '1px', height: '20px', background: 'var(--color-border-tertiary)', margin: '0 2px' }} />
              {note?.obsidian_synced ? (
                <>
                  <button onClick={handlePullFromObsidian} disabled={obsidianSyncing || !currentId}
                    title="Pull latest from Obsidian"
                    style={{ padding: '4px 8px', background: 'transparent', color: '#7F77DD', border: '0.5px solid #7F77DD55', borderRadius: '6px', cursor: obsidianSyncing ? 'not-allowed' : 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}>
                    <i className="ti ti-cloud-download" />
                    <span style={{ fontSize: '11px' }}>{obsidianSyncing ? '…' : 'Pull'}</span>
                  </button>
                  <button onClick={handleSyncToObsidian} disabled={obsidianSyncing || !currentId}
                    title="Push to Obsidian vault"
                    style={{ padding: '4px 8px', background: 'transparent', color: '#1D9E75', border: '0.5px solid #1D9E7555', borderRadius: '6px', cursor: obsidianSyncing ? 'not-allowed' : 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}>
                    <i className="ti ti-cloud-upload" />
                    <span style={{ fontSize: '11px' }}>{obsidianSyncing ? '…' : 'Push'}</span>
                  </button>
                </>
              ) : (
                <button onClick={handleSyncToObsidian} disabled={obsidianSyncing || !currentId}
                  title="Connect this note to your Obsidian vault"
                  style={{ padding: '4px 8px', background: 'transparent', color: 'var(--color-text-tertiary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '6px', cursor: obsidianSyncing ? 'not-allowed' : 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }}>
                  <i className="ti ti-brand-obsidian" />
                  <span style={{ fontSize: '11px' }}>{obsidianSyncing ? 'Syncing…' : 'Obsidian'}</span>
                </button>
              )}
            </div>
          )}

          {/* mobile top mini-bar */}
          {isMobile && (
            <div style={{
              padding: mobileFocusMode ? 'calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px' : '8px 12px',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--color-background-primary)',
              flexShrink: 0
            }}>
              <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {saving ? 'Saving…' : dirty ? 'Unsaved changes' : (note?.title || 'No note selected')}
              </span>
              {currentId && note?.obsidian_synced && (
                <button onClick={handlePullFromObsidian} disabled={obsidianSyncing}
                  style={{ background: 'transparent', color: '#7F77DD', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
                  title="Pull from Obsidian">
                  <i className={obsidianSyncing ? 'ti ti-loader-2' : 'ti ti-cloud-download'} />
                </button>
              )}
              {currentId && (
                <button onClick={handleSyncToObsidian} disabled={obsidianSyncing}
                  style={{ background: 'transparent', color: note?.obsidian_synced ? '#1D9E75' : 'var(--color-text-tertiary)', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
                  title={note?.obsidian_synced ? 'Push to Obsidian' : 'Connect to Obsidian'}>
                  <i className={obsidianSyncing ? 'ti ti-loader-2' : 'ti ti-cloud-upload'} />
                </button>
              )}
              {currentId && (
                <button
                  onClick={() => setMobileFocusMode(value => !value)}
                  style={{
                    background: mobileFocusMode ? '#E1F5EE' : 'transparent',
                    color: '#085041',
                    border: mobileFocusMode ? '0.5px solid #9FE1CB' : 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '6px 9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontFamily: 'inherit'
                  }}
                >
                  <i className={`ti ${mobileFocusMode ? 'ti-minimize' : 'ti-pencil'}`} style={{ fontSize: '14px' }} />
                  {mobileFocusMode ? 'Done' : 'Write'}
                </button>
              )}
              {currentId && !mobileFocusMode && (
                <button onClick={() => setReadMode(true)}
                  style={{ background: 'transparent', color: '#1D9E75', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>
                  <i className="ti ti-maximize" />
                </button>
              )}
              {!mobileFocusMode && <button onClick={handleDelete} disabled={!currentId}
                style={{ background: 'transparent', color: '#E24B4A', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>
                <i className="ti ti-trash" />
              </button>}
            </div>
          )}

          {/* content */}
          <div
            data-editor-area
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isMobile
                ? mobileFocusMode
                  ? '18px 18px calc(env(safe-area-inset-bottom, 0px) + 96px)'
                  : '16px 14px 88px'
                : '24px 32px'
            }}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
            onDrop={handleEditorDrop}
            onPaste={handleEditorPaste}
          >
            {currentId ? (
              <>
                {/* breadcrumb + meta toggle */}
                {!(isMobile && mobileFocusMode) && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {breadcrumb.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button onClick={() => onSelect(item.id)}
                        style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: idx === breadcrumb.length - 1 ? '#085041' : 'var(--color-text-tertiary)', fontSize: '11px', fontFamily: 'inherit', fontWeight: idx === breadcrumb.length - 1 ? '600' : '500' }}>
                        {item.title || 'Untitled'}
                      </button>
                      {idx < breadcrumb.length - 1 && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>/</span>}
                    </div>
                  ))}
                  <button onClick={() => setMetaHidden(p => !p)}
                    title={metaHidden ? 'Show page info' : 'Hide page info'}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', borderRadius: '6px' }}>
                    <i className={`ti ${metaHidden ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: '13px' }} />
                    {metaHidden ? 'Show info' : 'Hide info'}
                  </button>
                </div>}

                {/* title */}
                <input ref={titleRef} value={title} onFocus={() => setActiveBlockIdx(null)} onChange={e => { setTitle(e.target.value); setDirty(true) }} placeholder="Untitled note…"
                  style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? (mobileFocusMode ? '24px' : '22px') : '26px', fontWeight: '500', color: 'var(--color-text-primary)', border: 'none', outline: 'none', background: 'transparent', width: '100%', marginBottom: mobileFocusMode ? '14px' : '12px', lineHeight: 1.3 }} />

                <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />

                {!(isMobile && mobileFocusMode) && (
                  <div style={{
                    display: 'grid',
                    gap: '10px',
                    padding: '10px 12px',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: '12px',
                    background: 'var(--color-background-secondary)',
                    marginBottom: '14px'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => imageInputRef.current?.click()}
                        style={{ padding: '7px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="ti ti-photo-plus" /> Picture
                      </button>
                      <button onClick={() => setDrawingOpen(true)}
                        style={{ padding: '7px 10px', borderRadius: '8px', border: '0.5px solid #1D9E7540', background: drawingOpen ? '#E1F5EE' : 'var(--color-background-primary)', color: '#085041', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}>
                        <i className="ti ti-pencil" /> Draw
                      </button>
                      <button onClick={handleCreateSubpage}
                        style={{ padding: '7px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="ti ti-indent-increase" /> Subpage
                      </button>
                      <div style={{ width: '1px', height: '26px', background: 'var(--color-border-tertiary)' }} />
                      <EmojiChips emojis={QUICK_EMOJIS.slice(0, 8)} onPick={insertEmoji} compact />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {Object.entries(TAG_STYLES).map(([tag, s]) => (
                        <button key={tag} onClick={() => toggleTag(tag)}
                          style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', background: tags.includes(tag) ? s.bg : 'var(--color-background-primary)', color: tags.includes(tag) ? s.color : 'var(--color-text-tertiary)', border: `0.5px solid ${tags.includes(tag) ? s.color + '44' : 'var(--color-border-secondary)'}`, fontFamily: 'inherit' }}>
                          {s.label}
                        </button>
                      ))}
                      {!metaHidden && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: isMobile ? 0 : 'auto', flex: isMobile ? '1 1 100%' : '0 1 360px', minWidth: isMobile ? '100%' : '260px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                            <i className="ti ti-corner-down-right" /> In
                          </span>
                          <select value={parentId} onChange={e => { setParentId(e.target.value); setDirty(true) }}
                            style={{ flex: 1, minWidth: 0, padding: '7px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none' }}>
                            <option value="">Top-level</option>
                            {parentOptions.map(n => <option key={n.id} value={n.id}>{`${'— '.repeat(n.depth)}${n.title || 'Untitled note'}`}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Obsidian sync status */}
                {note?.obsidian_synced ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '10px', background: '#F0FBF7', border: '0.5px solid #1D9E7530', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#085041', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <i className="ti ti-circle-check-filled" style={{ color: '#1D9E75' }} />
                      <strong>Synced to Obsidian</strong>
                      {note.obsidian_synced_at && (
                        <span style={{ color: '#1D9E75', fontWeight: 400 }}>
                          · {new Date(parseInt(note.obsidian_synced_at)).toLocaleString()}
                        </span>
                      )}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={handleToggleAutoSync}
                      style={{ padding: '3px 8px', border: '0.5px solid #1D9E7540', borderRadius: '6px', background: note?.obsidian_auto_sync ? '#E1F5EE' : 'transparent', color: '#085041', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {note?.obsidian_auto_sync ? 'Auto-sync on' : 'Auto-sync off'}
                    </button>
                    <button onClick={handleUnsyncObsidian}
                      style={{ padding: '3px 8px', border: '0.5px solid #1D9E7540', borderRadius: '6px', background: 'transparent', color: '#085041', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '10px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      Not connected to Obsidian yet.
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={handleToggleAutoSync}
                      style={{ padding: '3px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', background: note?.obsidian_auto_sync ? '#E1F5EE' : 'transparent', color: note?.obsidian_auto_sync ? '#085041' : 'var(--color-text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {note?.obsidian_auto_sync ? 'Auto-sync on' : 'Auto-sync off'}
                    </button>
                  </div>
                )}

                {/* linked items */}
                <LinkedItemsPanel sourceType="notes" sourceId={currentId} links={links} setLinks={setLinks} entities={entities} onNavigate={onNavigate} isMobile={true} />
                {drawingOpen && (
                  <DrawingPad
                    isMobile={isMobile}
                    noteTags={tags}
                    onInsert={insertDrawingBlock}
                    onCancel={() => setDrawingOpen(false)}
                  />
                )}
                <div style={{ marginTop: '16px' }}>
                  {blocks.length === 0 && (
                    <div style={{ padding: isMobile ? '14px 0 6px' : '18px 0 8px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                        Choose a starter or just begin with a blank paragraph.
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(120px, 1fr))',
                        gap: '8px',
                        maxWidth: '720px'
                      }}>
                        {STARTER_TEMPLATES.map(template => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applyStarterTemplate(template)}
                            style={{
                              padding: '12px 10px',
                              borderRadius: '10px',
                              border: '0.5px solid var(--color-border-secondary)',
                              background: 'var(--color-background-secondary)',
                              color: 'var(--color-text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '12px',
                              fontWeight: '600',
                              fontFamily: 'inherit',
                              textAlign: 'left'
                            }}
                          >
                            <i className={`ti ${template.icon}`} style={{ fontSize: '15px', color: '#1D9E75', flexShrink: 0 }} />
                            <span>{template.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {blocks.map((b, i) => (
                    <RichBlock
                      key={b.id || i}
                      block={b} index={i} isMobile={isMobile}
                      onTextChange={updateBlockText}
                      onToggleDone={toggleBlockDone}
                      onDelete={deleteBlock}
                      onTypeChange={changeBlockType}
                      onAddBelow={addBlockBelow}
                      onDragStart={handleBlockDragStart}
                      onDragOver={handleBlockDragOver}
                      onDrop={handleBlockDrop}
                      isDragging={draggedBlockIdx === i}
                      isDropTarget={blockDropTarget?.idx === i}
                      dropPosition={blockDropTarget?.idx === i ? blockDropTarget.position : null}
                      triggerLinkRef={triggerLinkRef}
                      onFocus={setActiveBlockIdx}
                    />
                  ))}
                </div>

                {!isMobile && (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '16px' }}>
                    Select text → format toolbar · Drag <i className="ti ti-grip-vertical" style={{ fontSize: '11px' }} /> to reorder · <kbd style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: '4px', padding: '1px 5px', fontSize: '11px' }}>⌘S</kbd> to save
                  </p>
                )}
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

      {/* ── Read Mode overlay (mobile) ── */}
      {readMode && isMobile && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'var(--color-background-primary)',
          overflowY: 'auto',
          padding: '0 18px 80px',
        }}>
          {/* top bar with back button */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 502,
            background: 'var(--color-background-primary)',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            padding: '10px 0', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <button onClick={() => setReadMode(false)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'transparent', border: 'none',
              color: '#1D9E75', fontSize: '14px', fontWeight: '500',
              cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0'
            }}>
              <i className="ti ti-arrow-left" style={{ fontSize: '16px' }} />
              กลับ
            </button>
          </div>

          <div style={{ fontFamily: "'Lora', serif", fontSize: '24px', fontWeight: '500', lineHeight: 1.3, marginBottom: '20px', color: 'var(--color-text-primary)' }}>
            {title || 'Untitled note'}
          </div>

          <div>
            {blocks.map((block, i) => {
              if (block.type === 'image') return (
                <div key={block.id || i} style={{ marginBottom: '12px' }}>
                  {block.text && <img src={block.text} alt="" style={{ maxWidth: '100%', borderRadius: '10px' }} />}
                </div>
              )
              return (
                <div key={block.id || i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                  {block.type === 'bullet' && <span style={{ color: '#1D9E75', flexShrink: 0, fontSize: '16px', lineHeight: '26px' }}>•</span>}
                  {block.type === 'todo' && <i className={`ti ${block.done ? 'ti-circle-check' : 'ti-circle'}`} style={{ color: block.done ? '#1D9E75' : 'var(--color-text-tertiary)', flexShrink: 0, paddingTop: '4px' }} />}
                  <div style={{
                    lineHeight: 1.75, wordBreak: 'break-word',
                    fontSize: block.type === 'heading' ? '20px' : '15px',
                    fontFamily: block.type === 'heading' ? "'Lora', serif" : 'inherit',
                    fontWeight: block.type === 'heading' ? '500' : '400',
                    fontStyle: block.type === 'quote' ? 'italic' : 'normal',
                    borderLeft: block.type === 'quote' ? '3px solid #1D9E75' : 'none',
                    paddingLeft: block.type === 'quote' ? '12px' : '0',
                    color: block.done ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                    textDecoration: block.done ? 'line-through' : 'none',
                  }} dangerouslySetInnerHTML={{ __html: block.text || '' }} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
