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

function noteMatchesSearch(note, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [
    note.title,
    ...(note.tags || []),
    ...(note.blocks || []).map(block => block.content || block.text || '')
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

function buildNoteTree(notes) {
  const byParent = new Map()

  notes.forEach(note => {
    const key = note.parent_id || 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(note)
  })

  byParent.forEach(children => {
    children.sort((a, b) => {
      const aOrder = Number.isFinite(a.sort_order) ? a.sort_order : a.created_at || 0
      const bOrder = Number.isFinite(b.sort_order) ? b.sort_order : b.created_at || 0
      return aOrder - bOrder
    })
  })

  function visit(parentId = null, depth = 0) {
    return (byParent.get(parentId || 'root') || []).flatMap(note => ([
      { ...note, depth },
      ...visit(note.id, depth + 1)
    ]))
  }

  return visit()
}

function buildChildrenMap(notes) {
  const byParent = new Map()

  notes.forEach(note => {
    const key = note.parent_id || 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(note)
  })

  byParent.forEach(children => {
    children.sort((a, b) => {
      const aOrder = Number.isFinite(a.sort_order) ? a.sort_order : a.created_at || 0
      const bOrder = Number.isFinite(b.sort_order) ? b.sort_order : b.created_at || 0
      return aOrder - bOrder
    })
  })

  return byParent
}

function buildBreadcrumb(note, allNotes) {
  if (!note) return []
  const byId = new Map(allNotes.map(item => [item.id, item]))
  const chain = []
  let current = note

  while (current) {
    chain.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : null
  }

  return chain
}

function getDescendantIdSet(rootId, notes) {
  const childrenMap = buildChildrenMap(notes)
  const ids = new Set([rootId])
  const stack = [rootId]

  while (stack.length) {
    const currentId = stack.pop()
    const children = childrenMap.get(currentId) || []
    children.forEach(child => {
      if (!ids.has(child.id)) {
        ids.add(child.id)
        stack.push(child.id)
      }
    })
  }

  return ids
}

function getSiblingNotes(notes, parentId, excludeId = null) {
  return notes
    .filter(note => (note.parent_id || null) === (parentId || null) && note.id !== excludeId)
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.sort_order) ? a.sort_order : a.created_at || 0
      const bOrder = Number.isFinite(b.sort_order) ? b.sort_order : b.created_at || 0
      return aOrder - bOrder
    })
}

function getDropPlacement(clientY, rect) {
  const offset = clientY - rect.top
  const third = rect.height / 3
  if (offset < third) return 'before'
  if (offset > third * 2) return 'after'
  return 'inside'
}

function getNextSortOrder(notes, draggedId, target, placement) {
  if (placement === 'inside') {
    const siblings = getSiblingNotes(notes, target.id, draggedId)
    const last = siblings[siblings.length - 1]
    const base = Number.isFinite(last?.sort_order) ? last.sort_order : last?.created_at || 0
    return { parentId: target.id, sortOrder: base + 1 }
  }

  const parentId = target.parent_id || null
  const siblings = getSiblingNotes(notes, parentId, draggedId)
  const targetIndex = siblings.findIndex(item => item.id === target.id)
  const previous = placement === 'before' ? siblings[targetIndex - 1] : siblings[targetIndex]
  const next = placement === 'before' ? siblings[targetIndex] : siblings[targetIndex + 1]
  const previousOrder = previous ? (Number.isFinite(previous.sort_order) ? previous.sort_order : previous.created_at || 0) : null
  const nextOrder = next ? (Number.isFinite(next.sort_order) ? next.sort_order : next.created_at || 0) : null

  if (previousOrder !== null && nextOrder !== null) return { parentId, sortOrder: (previousOrder + nextOrder) / 2 }
  if (previousOrder !== null) return { parentId, sortOrder: previousOrder + 1 }
  if (nextOrder !== null) return { parentId, sortOrder: nextOrder - 1 }
  return { parentId, sortOrder: Date.now() }
}

function formatPlacementLabel(placement) {
  if (placement === 'before') return 'Before target'
  if (placement === 'after') return 'After target'
  return 'Inside target'
}

export default function NotesPanel({ notes, currentId, onSelect, onSaved, onDeleted, onNew, isMobile = false, externalSearch = '' }) {
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [blocks, setBlocks] = useState([])
  const [saving, setSaving] = useState(false)
  const [mobileTagFilter, setMobileTagFilter] = useState('all')
  const [search, setSearch] = useState(externalSearch)
  const [parentId, setParentId] = useState('')
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const [draggedId, setDraggedId] = useState(null)
  const [dropHint, setDropHint] = useState(null)
  const [mobileMoveTargetId, setMobileMoveTargetId] = useState('')
  const [mobileMovePlacement, setMobileMovePlacement] = useState('inside')
  const [mobileMoveOpen, setMobileMoveOpen] = useState(false)
  const titleRef = useRef()

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
  const parentOptions = allTreeNotes.filter(item => item.id !== currentId && !descendantIds.has(item.id))
  const filteredChildrenMap = buildChildrenMap(filteredNotes)
  const collapsibleIds = new Set(
    filteredNotes
      .filter(item => (filteredChildrenMap.get(item.id) || []).length > 0)
      .map(item => item.id)
  )

  useEffect(() => {
    if (note) {
      setTitle(note.title)
      setTags(note.tags || [])
      setBlocks((note.blocks || []).map(b => ({ ...b, text: b.content || b.text || '' })))
      setParentId(note.parent_id || '')
      setMobileMoveTargetId(note.parent_id || '')
    } else {
      setTitle(''); setTags([]); setBlocks([]); setParentId(''); setMobileMoveTargetId('')
    }
  }, [currentId, note])

  useEffect(() => {
    setSearch(externalSearch)
  }, [externalSearch])

  useEffect(() => {
    if (!isMobile) return
    if (!visibleNotes.length) return
    if (!visibleNotes.some(n => n.id === currentId)) {
      onSelect(visibleNotes[0].id)
    }
  }, [isMobile, mobileTagFilter, currentId, visibleNotes, onSelect])

  useEffect(() => {
    if (!breadcrumb.length) return
    const ancestorIds = new Set(breadcrumb.slice(0, -1).map(item => item.id))
    if (!ancestorIds.size) return

    setCollapsedIds(prev => {
      const next = new Set(prev)
      let changed = false

      ancestorIds.forEach(id => {
        if (next.has(id)) {
          next.delete(id)
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [breadcrumb])

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

  function toggleCollapsed(id) {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!currentId) return
    setSaving(true)
    try {
      const resolvedParentId = parentId || null
      await updateNote(currentId, {
        title: title || 'Untitled',
        tags,
        parent_id: resolvedParentId,
        blocks: blocks.map((b, i) => ({
          id: b.id || crypto.randomUUID(),
          type: b.type,
          content: b.text,
          done: b.done,
          position: i
        }))
      })
      onSaved(currentId, { title: title || 'Untitled', tags, parent_id: resolvedParentId, updated_at: Date.now() })
    } catch (e) {
      alert('Save failed: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!currentId || !confirm('Delete this note?')) return
    const result = await deleteNote(currentId)
    onDeleted(result.deleted_ids || [currentId])
  }

  async function handleCreateSubpage() {
    if (!currentId) return
    await onNew(currentId)
  }

  function collapseAll() {
    setCollapsedIds(new Set(collapsibleIds))
  }

  function expandAll() {
    setCollapsedIds(new Set())
  }

  async function moveNoteWithPlacement(noteId, targetNote, placement) {
    const draggedDescendants = getDescendantIdSet(noteId, notes)
    if (placement === 'inside' && draggedDescendants.has(targetNote.id)) {
      throw new Error('Cannot move a page inside its own subpage')
    }

    const { parentId: nextParentId, sortOrder } = getNextSortOrder(notes, noteId, targetNote, placement)
    await updateNote(noteId, {
      parent_id: nextParentId,
      sort_order: sortOrder
    })
    onSaved(noteId, { parent_id: nextParentId, sort_order: sortOrder, updated_at: Date.now() })
    if (noteId === currentId) setParentId(nextParentId || '')
  }

  async function handleDropOnNote(targetNote) {
    if (!draggedId || draggedId === targetNote.id || !dropHint || dropHint.targetId !== targetNote.id) return

    try {
      await moveNoteWithPlacement(draggedId, targetNote, dropHint.placement)
    } catch (e) {
      alert(`Move failed: ${e.message}`)
    } finally {
      setDraggedId(null)
      setDropHint(null)
    }
  }

  async function handleMobileMove() {
    if (!currentId || !mobileMoveTargetId) return
    const targetNote = notes.find(item => item.id === mobileMoveTargetId)
    if (!targetNote || targetNote.id === currentId) return

    try {
      await moveNoteWithPlacement(currentId, targetNote, mobileMovePlacement)
      setMobileMoveOpen(false)
    } catch (e) {
      alert(`Move failed: ${e.message}`)
    }
  }

  function getVisibleDesktopItems(items) {
    const hiddenAncestorDepths = []

    return items.filter(item => {
      while (hiddenAncestorDepths.length && hiddenAncestorDepths[hiddenAncestorDepths.length - 1] >= item.depth) {
        hiddenAncestorDepths.pop()
      }

      const isHidden = hiddenAncestorDepths.length > 0
      if (collapsedIds.has(item.id)) hiddenAncestorDepths.push(item.depth)
      return !isHidden
    })
  }

  function renderDesktopTree(items) {
    return getVisibleDesktopItems(items).map(n => (
      <div key={n.id} style={{ marginBottom: '2px' }}>
        <div
          draggable
          onDragStart={() => setDraggedId(n.id)}
          onDragEnd={() => {
            setDraggedId(null)
            setDropHint(null)
          }}
          onDragOver={event => {
            if (!draggedId || draggedId === n.id) return
            const draggedDescendants = getDescendantIdSet(draggedId, notes)
            const rect = event.currentTarget.getBoundingClientRect()
            const placement = getDropPlacement(event.clientY, rect)
            if (placement === 'inside' && draggedDescendants.has(n.id)) return
            event.preventDefault()
            setDropHint({ targetId: n.id, placement })
          }}
          onDrop={event => {
            event.preventDefault()
            handleDropOnNote(n)
          }}
          style={{
            padding: '8px',
            paddingLeft: `${8 + n.depth * 14}px`,
            borderRadius: '8px',
            cursor: 'pointer',
            background: n.id === currentId ? '#E1F5EE' : 'transparent',
            border: dropHint?.targetId === n.id ? '1px solid #9CCFB9' : '1px solid transparent',
            borderTopColor: dropHint?.targetId === n.id && dropHint.placement === 'before' ? '#1D9E75' : undefined,
            borderBottomColor: dropHint?.targetId === n.id && dropHint.placement === 'after' ? '#1D9E75' : undefined,
            boxShadow: dropHint?.targetId === n.id && dropHint.placement === 'inside' ? 'inset 0 0 0 1px #1D9E75' : 'none',
            opacity: draggedId === n.id ? 0.55 : 1
          }}
        >
          <div style={{
            fontSize: '12px',
            fontWeight: n.id === currentId ? '600' : '500',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: n.id === currentId ? '#085041' : 'var(--color-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {dropHint?.targetId === n.id && (
              <span style={{
                fontSize: '9px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#1D9E75',
                background: '#E1F5EE',
                borderRadius: '999px',
                padding: '2px 6px'
              }}>
                {dropHint.placement}
              </span>
            )}
            <button
              onClick={() => {
                if ((filteredChildrenMap.get(n.id) || []).length > 0) toggleCollapsed(n.id)
              }}
              style={{
                width: '16px',
                height: '16px',
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: (filteredChildrenMap.get(n.id) || []).length > 0 ? 'pointer' : 'default',
                color: 'var(--color-text-tertiary)',
                fontSize: '11px',
                flexShrink: 0
              }}
            >
              {(filteredChildrenMap.get(n.id) || []).length > 0 ? (collapsedIds.has(n.id) ? '▸' : '▾') : (n.depth === 0 ? '•' : '↳')}
            </button>
            <button
              onClick={() => onSelect(n.id)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                minWidth: 0,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {n.title}
            </button>
          </div>
          <div style={{
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            marginTop: '3px',
            marginLeft: '17px',
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap'
          }}>
            {(n.tags || []).map(t => <span key={t} style={{ color: TAG_STYLES[t]?.color || '#888' }}>#{t}</span>)}
          </div>
        </div>
      </div>
    ))
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
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <i
              className="ti ti-search"
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px',
                color: 'var(--color-text-tertiary)'
              }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes"
              style={{
                width: '100%',
                padding: '8px 10px 8px 30px',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '10px',
                fontSize: '12px',
                fontFamily: 'inherit',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
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
                      <option key={n.id} value={n.id}>{`${'— '.repeat(n.depth)}${n.title || 'Untitled note'}`}</option>
                    ))
                  )}
                </select>
              </div>
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: currentId ? '1fr 1fr' : '1fr', gap: '8px' }}>
            <button onClick={() => onNew()} style={{
              width: '100%', padding: '7px 10px', background: '#1D9E75', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: 'inherit'
            }}>
              <i className="ti ti-plus" /> New page
            </button>
            {currentId && (
              <button onClick={handleCreateSubpage} style={{
                width: '100%', padding: '7px 10px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
                border: '0.5px solid var(--color-border-secondary)', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                fontFamily: 'inherit'
              }}>
                <i className="ti ti-indent-increase" /> Subpage
              </button>
            )}
          </div>
          {!isMobile && visibleNotes.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={expandAll}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '0.5px solid var(--color-border-secondary)',
                  borderRadius: '8px',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Expand all
              </button>
              <button
                onClick={collapseAll}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '0.5px solid var(--color-border-secondary)',
                  borderRadius: '8px',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Collapse all
              </button>
            </div>
          )}
        </div>
        <div style={{
          flex: 1,
          overflowY: isMobile ? 'hidden' : 'auto',
          overflowX: 'hidden',
          padding: '0 8px 8px',
          display: isMobile ? 'none' : 'block'
        }}>
          {renderDesktopTree(visibleNotes)}
          {visibleNotes.length === 0 && (
            <div style={{ padding: '10px 8px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
              No notes match this search.
            </div>
          )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                {breadcrumb.map((item, index) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => onSelect(item.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                        color: index === breadcrumb.length - 1 ? '#085041' : 'var(--color-text-tertiary)',
                        fontSize: '11px',
                        fontFamily: 'inherit',
                        fontWeight: index === breadcrumb.length - 1 ? '600' : '500'
                      }}
                    >
                      {item.title || 'Untitled'}
                    </button>
                    {index < breadcrumb.length - 1 && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>/</span>}
                  </div>
                ))}
              </div>

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

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  {note?.parent_id ? 'Subpage in nested notes' : 'Top-level page'}
                </div>
                <button
                  onClick={handleCreateSubpage}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '0.5px solid var(--color-border-secondary)',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="ti ti-indent-increase" /> Add subpage
                </button>
              </div>

              <div style={{ marginBottom: '18px' }}>
                {!isMobile && (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                      Parent Page
                    </div>
                    <select
                      value={parentId}
                      onChange={e => setParentId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '0.5px solid var(--color-border-secondary)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        fontFamily: 'inherit',
                        background: 'var(--color-background-primary)',
                        color: 'var(--color-text-primary)',
                        outline: 'none'
                      }}
                    >
                      <option value="">Top-level page</option>
                      {parentOptions.map(item => (
                        <option key={item.id} value={item.id}>
                          {`${'— '.repeat(item.depth)}${item.title || 'Untitled note'}`}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {isMobile && (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <button
                      onClick={() => setMobileMoveOpen(prev => !prev)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        border: '0.5px solid var(--color-border-secondary)',
                        background: 'var(--color-background-secondary)',
                        color: 'var(--color-text-primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontWeight: '600' }}>Move Page</span>
                      <i className={`ti ${mobileMoveOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: '1.5', padding: '8px 10px', borderRadius: '10px', background: 'var(--color-background-secondary)' }}>
                      {mobileMoveTargetId
                        ? `This page will move ${mobileMovePlacement} ${allTreeNotes.find(item => item.id === mobileMoveTargetId)?.title || 'target page'}.`
                        : 'Open Move Page if you want to move this note.'}
                    </div>
                    {mobileMoveOpen && (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <select
                          value={mobileMoveTargetId}
                          onChange={e => setMobileMoveTargetId(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '0.5px solid var(--color-border-secondary)',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontFamily: 'inherit',
                            background: 'var(--color-background-primary)',
                            color: 'var(--color-text-primary)',
                            outline: 'none'
                          }}
                        >
                          <option value="">Choose target page</option>
                          {parentOptions.map(item => (
                            <option key={`move-${item.id}`} value={item.id}>
                              {`${'— '.repeat(item.depth)}${item.title || 'Untitled note'}`}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          {['before', 'inside', 'after'].map(option => (
                            <button
                              key={option}
                              onClick={() => setMobileMovePlacement(option)}
                              style={{
                                padding: '8px 6px',
                                borderRadius: '10px',
                                border: '0.5px solid var(--color-border-secondary)',
                                background: mobileMovePlacement === option ? '#E1F5EE' : 'var(--color-background-secondary)',
                                color: mobileMovePlacement === option ? '#085041' : 'var(--color-text-secondary)',
                                fontSize: '11px',
                                cursor: 'pointer',
                                fontFamily: 'inherit'
                              }}
                            >
                              {formatPlacementLabel(option)}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={handleMobileMove}
                          disabled={!mobileMoveTargetId}
                          style={{
                            padding: '9px 12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: !mobileMoveTargetId ? '#B9C5C0' : '#173B33',
                            color: 'white',
                            fontSize: '12px',
                            cursor: !mobileMoveTargetId ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          Move current page
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
