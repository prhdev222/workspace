import { useMemo, useState } from 'react'
import { createLink, deleteLink } from '../lib/api'

const TYPE_META = {
  notes: { command: '/note', label: 'Note', color: '#185FA5', bg: '#E6F1FB', icon: 'ti-file-text' },
  todo: { command: '/todo', label: 'To-Do', color: '#854F0B', bg: '#FAEEDA', icon: 'ti-checklist' },
  ideas: { command: '/idea', label: 'Idea', color: '#534AB7', bg: '#EEEDFE', icon: 'ti-bulb' },
  mindmap: { command: '/mindmap', label: 'Mind Map', color: '#085041', bg: '#E1F5EE', icon: 'ti-git-fork' }
}

function entityTitle(type, entity) {
  if (!entity) return 'Missing item'
  if (type === 'notes') return entity.title || 'Untitled note'
  if (type === 'todo') return entity.text || 'Untitled task'
  if (type === 'ideas') return entity.content || 'Untitled idea'
  return entity.title || 'Untitled map'
}

function entitySubtitle(type, entity) {
  if (!entity) return ''
  if (type === 'notes') return (entity.tags || []).map(tag => `#${tag}`).join(' ')
  if (type === 'todo') return entity.item_type === 'appointment' ? 'Appointment' : 'Task'
  if (type === 'ideas') return `${entity.emoji || '💡'} ${entity.color || ''}`.trim()
  return 'Saved mind map'
}

function buildIndex(entities) {
  return {
    notes: new Map((entities.notes || []).map(item => [item.id, item])),
    todo: new Map((entities.todos || []).map(item => [item.id, item])),
    ideas: new Map((entities.ideas || []).map(item => [item.id, item])),
    mindmap: new Map((entities.mindMaps || []).map(item => [item.id, item]))
  }
}

function parseQuickCommand(value) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return { type: null, query: trimmed }

  const [command, ...rest] = trimmed.split(/\s+/)
  const query = rest.join(' ').trim()
  const type = Object.entries(TYPE_META).find(([, meta]) => meta.command === command)?.[0] || null
  return { type, query }
}

export default function LinkedItemsPanel({
  sourceType,
  sourceId,
  links,
  setLinks,
  entities,
  onNavigate,
  compact = false
}) {
  const [quickInput, setQuickInput] = useState('')
  const [saving, setSaving] = useState(false)
  const index = useMemo(() => buildIndex(entities), [entities])
  const sourceLinks = links.filter(link => link.from_type === sourceType && link.from_id === sourceId)
  const { type: quickType, query } = parseQuickCommand(quickInput)

  const suggestions = quickType && query
    ? [...(index[quickType]?.values() || [])]
        .filter(item => entityTitle(quickType, item).toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
    : []

  async function handleCreate(targetType, targetId, label = '') {
    if (!sourceId || !targetId) return
    setSaving(true)
    try {
      const created = await createLink({
        from_type: sourceType,
        from_id: sourceId,
        to_type: targetType,
        to_id: targetId,
        label
      })
      setLinks(prev => [created, ...prev])
      setQuickInput('')
    } catch (e) {
      alert(`Link failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteLink(id)
      setLinks(prev => prev.filter(link => link.id !== id))
    } catch (e) {
      alert(`Delete link failed: ${e.message}`)
    }
  }

  return (
    <div style={{
      marginTop: compact ? '10px' : '18px',
      padding: compact ? '10px' : '12px',
      borderRadius: '14px',
      border: '0.5px solid var(--color-border-tertiary)',
      background: 'var(--color-background-secondary)'
    }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
        Linked Items
      </div>
      <input
        value={quickInput}
        onChange={e => setQuickInput(e.target.value)}
        placeholder="Quick link: /note stroke or /todo follow up"
        style={{
          width: '100%',
          padding: '9px 10px',
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
      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px', lineHeight: '1.5' }}>
        Use /note, /todo, /idea, or /mindmap then type a search word.
      </div>

      {suggestions.length > 0 && (
        <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
          {suggestions.map(item => {
            const meta = TYPE_META[quickType]
            return (
              <button
                key={`${quickType}-${item.id}`}
                onClick={() => handleCreate(quickType, item.id)}
                disabled={saving}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${meta.color}22`,
                  background: 'var(--color-background-primary)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: meta.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>{entityTitle(quickType, item)}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>{entitySubtitle(quickType, item)}</div>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
        {sourceLinks.length === 0 ? (
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            No linked items yet.
          </div>
        ) : (
          sourceLinks.map(link => {
            const meta = TYPE_META[link.to_type]
            const entity = index[link.to_type]?.get(link.to_id)
            return (
              <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '12px', background: 'var(--color-background-primary)', minWidth: 0 }}>
                <button
                  onClick={() => onNavigate(link.to_type, link.to_id)}
                  style={{
                    border: 'none',
                    background: meta.bg,
                    color: meta.color,
                    borderRadius: '999px',
                    padding: '4px 8px',
                    fontSize: '10px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0
                  }}
                >
                  <i className={`ti ${meta.icon}`} style={{ fontSize: '11px' }} />
                  {meta.label}
                </button>
                <button
                  onClick={() => onNavigate(link.to_type, link.to_id)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    minWidth: 0,
                    fontFamily: 'inherit'
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entityTitle(link.to_type, entity)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                    {link.label || entitySubtitle(link.to_type, entity)}
                  </div>
                </button>
                <button
                  onClick={() => handleDelete(link.id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#A24646',
                    cursor: 'pointer',
                    fontSize: '12px',
                    flexShrink: 0
                  }}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
