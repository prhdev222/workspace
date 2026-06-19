import { useEffect, useMemo, useRef, useState } from 'react'
import { createMindMap, deleteMindMap, updateMindMap } from '../lib/api'
import LinkedItemsPanel from './LinkedItemsPanel'
import { EmojiChips } from '../lib/emoji'

const DEFAULT_DIAGRAM = `flowchart TD
  A[🩺 Clinical question] --> B[🔎 Assess key features]
  B --> C{🚨 High risk?}
  C -->|Yes| D[⚡ Act now]
  C -->|No| E[👀 Observe and follow up]`

const TEMPLATES = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    icon: 'ti-git-branch',
    title: '🧭 New Flowchart',
    content: `flowchart TD
  A[🚀 Start] --> B[🔎 Step 1]
  B --> C[🧪 Step 2]
  C --> D[✅ Done]`
  },
  {
    id: 'algorithm',
    label: 'Clinical algorithm',
    icon: 'ti-stethoscope',
    title: '🩺 Clinical Algorithm',
    content: `flowchart TD
  A[🩺 Patient problem] --> B[📋 History and exam]
  B --> C[🧪 Initial tests]
  C --> D{🚨 Red flags?}
  D -->|Yes| E[⚡ Urgent management]
  D -->|No| F[✅ Standard pathway]`
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: 'ti-timeline',
    title: '📅 Timeline',
    content: `timeline
  title 💊 Treatment Timeline
  Day 0 : 🩺 Diagnosis
  Day 1 : 💊 Start treatment
  Week 2 : 🔎 Assess response
  Month 3 : 📌 Follow-up`
  },
  {
    id: 'sequence',
    label: 'Process',
    icon: 'ti-arrows-exchange',
    title: '🔁 Process Diagram',
    content: `sequenceDiagram
  participant User as 👤 User
  participant App as 🧭 App
  participant Database as 🗄️ Database
  User->>App: Create diagram
  App->>Database: Save Mermaid
  Database-->>App: ✅ Saved`
  }
]

let mermaidInstance = null

async function loadMermaid() {
  if (mermaidInstance) return mermaidInstance

  const module = await import('mermaid')
  mermaidInstance = module.default
  mermaidInstance.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      primaryColor: '#E1F5EE',
      primaryTextColor: '#173B33',
      primaryBorderColor: '#1D9E75',
      lineColor: '#5E766E',
      secondaryColor: '#F4F0E8',
      tertiaryColor: '#EEF3F8',
      fontFamily: 'DM Sans, system-ui, sans-serif'
    }
  })
  return mermaidInstance
}

function diagramMatchesSearch(item, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return [item.title, item.content].join(' ').toLowerCase().includes(normalized)
}

function looksLikeMermaid(text) {
  return /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|timeline|mindmap|quadrantChart|requirementDiagram|gitGraph)\b/i.test(text.trim())
}

function escapeMermaidLabel(text) {
  return String(text || '')
    .replace(/"/g, "'")
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .trim()
}

function simpleTextToMermaid(raw) {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) return DEFAULT_DIAGRAM
  if (looksLikeMermaid(lines.join('\n'))) return lines.join('\n')

  const title = lines[0].includes('->') ? 'Diagram' : lines[0]
  const pathLines = lines[0].includes('->') ? lines : lines.slice(1)

  if (!pathLines.length) {
    return `flowchart TD\n  A["${escapeMermaidLabel(title)}"]`
  }

  const nodeIds = new Map()
  let counter = 0

  function idFor(label) {
    const key = label.toLowerCase()
    if (!nodeIds.has(key)) {
      counter += 1
      nodeIds.set(key, `N${counter}`)
    }
    return nodeIds.get(key)
  }

  const edges = []
  pathLines.forEach(line => {
    const parts = line
      .replace(/--?>/g, '->')
      .split('->')
      .map(part => part.trim())
      .filter(Boolean)

    for (let i = 0; i < parts.length - 1; i += 1) {
      const from = parts[i]
      const to = parts[i + 1]
      edges.push(`  ${idFor(from)}["${escapeMermaidLabel(from)}"] --> ${idFor(to)}["${escapeMermaidLabel(to)}"]`)
    }
  })

  return ['flowchart TD', ...new Set(edges)].join('\n')
}

function MermaidPreview({ code }) {
  const ref = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      setError('')
      if (!ref.current) return

      try {
        const mermaid = await loadMermaid()
        const id = `diagram-${crypto.randomUUID()}`
        const { svg } = await mermaid.render(id, code || DEFAULT_DIAGRAM)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not render diagram')
          if (ref.current) ref.current.innerHTML = ''
        }
      }
    }

    renderDiagram()
    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div style={{
        padding: '16px',
        borderRadius: '12px',
        background: '#FCEBEB',
        color: '#A32D2D',
        fontSize: '12px',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap'
      }}>
        Mermaid error: {error}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      style={{
        minHeight: '280px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    />
  )
}

export default function MindMapPanel({
  isMobile = false,
  savedMaps = [],
  setSavedMaps,
  externalSearch = '',
  openMapId = null,
  links = [],
  setLinks,
  entities,
  onNavigate
}) {
  const [draft, setDraft] = useState(DEFAULT_DIAGRAM)
  const [currentMapId, setCurrentMapId] = useState(null)
  const [diagramTitle, setDiagramTitle] = useState('Clinical Diagram')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState(externalSearch)
  const [fullscreenPreview, setFullscreenPreview] = useState(false)

  useEffect(() => {
    setSearch(externalSearch)
  }, [externalSearch])

  useEffect(() => {
    if (!openMapId) return
    const target = savedMaps.find(item => item.id === openMapId)
    if (target) handleLoad(target)
  }, [openMapId, savedMaps])

  const mermaidCode = useMemo(() => simpleTextToMermaid(draft), [draft])
  const filteredSavedMaps = savedMaps.filter(item => diagramMatchesSearch(item, search))

  function applyTemplate(template) {
    setDiagramTitle(template.title)
    setDraft(template.content)
    setCurrentMapId(null)
  }

  function insertEmoji(emoji) {
    setDraft(prev => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') ? '' : ' '}${emoji} `)
  }

  function clearAll() {
    setDraft(DEFAULT_DIAGRAM)
    setDiagramTitle('Clinical Diagram')
    setCurrentMapId(null)
  }

  async function handleSave() {
    const content = draft.trim()
    if (!content) return

    setSaving(true)
    try {
      const title = diagramTitle.trim() || 'Untitled diagram'
      if (currentMapId) {
        await updateMindMap(currentMapId, { title, content })
        setSavedMaps(prev => prev.map(item => item.id === currentMapId ? { ...item, title, content, updated_at: Date.now() } : item))
      } else {
        const created = await createMindMap({ title, content })
        setCurrentMapId(created.id)
        setSavedMaps(prev => [created, ...prev])
      }
    } catch (e) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  function handleLoad(saved) {
    setCurrentMapId(saved.id)
    setDiagramTitle(saved.title || 'Untitled diagram')
    setDraft(saved.content || DEFAULT_DIAGRAM)
    if (isMobile) setFullscreenPreview(false)
  }

  async function handleDeleteSaved(id) {
    if (!confirm('Delete this saved diagram?')) return
    try {
      await deleteMindMap(id)
      setSavedMaps(prev => prev.filter(item => item.id !== id))
      if (currentMapId === id) clearAll()
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    }
  }

  function copyMermaid() {
    navigator.clipboard?.writeText(mermaidCode).catch(() => {})
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      background: 'var(--color-background-primary)'
    }}>
      <div style={{
        padding: isMobile ? '12px' : '14px 16px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap',
        background: 'var(--color-background-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <i className="ti ti-chart-arrows" style={{ fontSize: '17px', color: '#1D9E75' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)' }}>Diagrams</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Mermaid diagrams for algorithms, timelines, and workflows</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {TEMPLATES.map(template => (
          <button
            key={template.id}
            onClick={() => applyTemplate(template)}
            style={{
              padding: '7px 10px',
              borderRadius: '8px',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <i className={`ti ${template.icon}`} style={{ fontSize: '13px' }} />
            {!isMobile && template.label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 430px) minmax(0, 1fr)',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
      }}>
        {!(isMobile && fullscreenPreview) && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'auto',
            borderRight: isMobile ? 'none' : '0.5px solid var(--color-border-tertiary)',
            padding: isMobile ? '12px' : '16px'
          }}>
            <input
              value={diagramTitle}
              onChange={e => setDiagramTitle(e.target.value)}
              placeholder="Diagram title"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '10px',
                fontSize: '13px',
                fontFamily: 'inherit',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '10px'
              }}
            />
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={isMobile ? 12 : 18}
              placeholder={'Write Mermaid, or simple arrows:\n🩸 Anemia -> 🔎 Check MCV -> Microcytic'}
              style={{
                width: '100%',
                padding: '13px 14px',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '12px',
                fontSize: '13px',
                lineHeight: '1.6',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                resize: 'vertical',
                background: 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
                minHeight: isMobile ? '220px' : '360px'
              }}
            />
            <div style={{ marginTop: '8px' }}>
              <EmojiChips onPick={insertEmoji} compact={isMobile} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                style={{
                  padding: '9px 14px',
                  background: saving ? '#82CBB4' : '#1D9E75',
                  color: 'white',
                  border: 'none',
                  borderRadius: '9px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                {saving ? 'Saving...' : currentMapId ? 'Update' : 'Save'}
              </button>
              <button onClick={copyMermaid} style={secondaryButtonStyle}>Copy Mermaid</button>
              <button onClick={clearAll} style={secondaryButtonStyle}>Reset</button>
              {isMobile && <button onClick={() => setFullscreenPreview(true)} style={secondaryButtonStyle}>Preview</button>}
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
              Tip: add emoji directly in any node. Hermes/MCP can create emoji Mermaid too.
            </div>

            {currentMapId && (
              <LinkedItemsPanel
                sourceType="mindmap"
                sourceId={currentMapId}
                links={links}
                setLinks={setLinks}
                entities={entities}
                onNavigate={onNavigate}
                compact
              />
            )}

            <div style={{ marginTop: '18px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>
                Saved Diagrams
              </div>
              <div style={{ position: 'relative', marginBottom: '10px' }}>
                <i className="ti ti-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search diagrams"
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
              <div style={{ display: 'grid', gap: '8px' }}>
                {filteredSavedMaps.length === 0 ? (
                  <div style={{ padding: '12px', borderRadius: '10px', background: 'var(--color-background-secondary)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    {savedMaps.length === 0 ? 'No saved diagrams yet.' : 'No diagrams match this search.'}
                  </div>
                ) : filteredSavedMaps.map(saved => (
                  <div key={saved.id} style={{
                    padding: '10px',
                    borderRadius: '10px',
                    background: saved.id === currentMapId ? '#E1F5EE' : 'var(--color-background-secondary)',
                    border: saved.id === currentMapId ? '0.5px solid #9FE1CB' : '0.5px solid var(--color-border-tertiary)'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: saved.id === currentMapId ? '#085041' : 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {saved.title || 'Untitled diagram'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: '48px', overflow: 'hidden' }}>
                      {(saved.content || '').slice(0, 120)}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button onClick={() => handleLoad(saved)} style={smallButtonStyle}>Open</button>
                      <button onClick={() => handleDeleteSaved(saved.id)} style={{ ...smallButtonStyle, color: '#A32D2D' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{
          minHeight: 0,
          overflow: 'auto',
          padding: isMobile ? '12px' : '18px',
          background: 'var(--color-background-primary)'
        }}>
          {isMobile && fullscreenPreview && (
            <button onClick={() => setFullscreenPreview(false)} style={{ ...secondaryButtonStyle, marginBottom: '10px' }}>
              Back to editor
            </button>
          )}
          <div style={{
            minWidth: isMobile ? '680px' : 0,
            borderRadius: '14px',
            border: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-secondary)',
            padding: isMobile ? '12px' : '18px',
            overflow: 'auto'
          }}>
            <MermaidPreview code={mermaidCode} />
          </div>
        </div>
      </div>
    </div>
  )
}

const secondaryButtonStyle = {
  padding: '9px 12px',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-secondary)',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: '9px',
  fontSize: '12px',
  fontWeight: '600',
  cursor: 'pointer',
  fontFamily: 'inherit'
}

const smallButtonStyle = {
  padding: '6px 9px',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-secondary)',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: '8px',
  fontSize: '11px',
  cursor: 'pointer',
  fontFamily: 'inherit'
}
