import { useEffect, useState } from 'react'
import { createMindMap, deleteMindMap, getMindMaps, updateMindMap } from '../lib/api'

const BRANCH_COLORS = ['#1D9E75', '#378ADD', '#7F77DD', '#EF9F27', '#E24B4A', '#D4537E']
const INITIAL_TEXT = ''

function splitLabel(text, maxChars = 14) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return ['']

  const lines = []
  let current = ''

  words.forEach(word => {
    if (!current || `${current} ${word}`.length <= maxChars) {
      current = current ? `${current} ${word}` : word
    } else {
      lines.push(current)
      current = word
    }
  })

  if (current) lines.push(current)
  return lines.slice(0, 3)
}

function parseMindMap(raw) {
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) return null

  let title = 'Mind Map'
  let pathLines = lines

  if (!lines[0].includes('->')) {
    title = lines[0]
    pathLines = lines.slice(1)
  }

  if (!pathLines.length) {
    return {
      title,
      nodes: [{ id: 'root', label: title, depth: 0, parentId: null, color: BRANCH_COLORS[0] }],
      links: []
    }
  }

  const nodesByKey = new Map()
  const nodes = []
  const links = []

  function ensureNode(label, depth, parentId, color, key) {
    if (nodesByKey.has(key)) return nodesByKey.get(key)

    const node = {
      id: key,
      label,
      depth,
      parentId,
      color
    }
    nodesByKey.set(key, node)
    nodes.push(node)
    return node
  }

  const root = ensureNode(title, 0, null, BRANCH_COLORS[0], 'root')

  pathLines.forEach((line, lineIndex) => {
    let parts = line
      .replace(/--?>/g, '->')
      .split('->')
      .map(part => part.trim())
      .filter(Boolean)

    if (!parts.length) return

    if (parts[0].toLowerCase() === title.toLowerCase()) {
      parts = parts.slice(1)
    }

    if (!parts.length) return

    let parent = root
    let pathKey = 'root'

    parts.forEach((label, index) => {
      pathKey = `${pathKey}__${label.toLowerCase()}`
      const color = BRANCH_COLORS[lineIndex % BRANCH_COLORS.length]
      const node = ensureNode(label, index + 1, parent.id, color, pathKey)

      if (!links.some(link => link.from === parent.id && link.to === node.id)) {
        links.push({ from: parent.id, to: node.id, color })
      }

      parent = node
    })
  })

  return { title, nodes, links }
}

function layoutMindMap(map) {
  const nodesByDepth = new Map()

  map.nodes.forEach(node => {
    if (!nodesByDepth.has(node.depth)) nodesByDepth.set(node.depth, [])
    nodesByDepth.get(node.depth).push(node)
  })

  const depths = [...nodesByDepth.keys()].sort((a, b) => a - b)
  const positionedNodes = []
  const positions = new Map()

  const colWidth = 230
  const rowHeight = 108
  const marginX = 48
  const marginY = 40
  const nodeWidth = 156
  const nodeHeight = 62

  depths.forEach(depth => {
    const columnNodes = nodesByDepth.get(depth)
    const totalHeight = columnNodes.length * rowHeight
    const startY = marginY + Math.max(0, (520 - totalHeight) / 2)

    columnNodes.forEach((node, index) => {
      const x = marginX + depth * colWidth
      const y = startY + index * rowHeight
      const positioned = { ...node, x, y, width: nodeWidth, height: nodeHeight }
      positionedNodes.push(positioned)
      positions.set(node.id, positioned)
    })
  })

  const maxDepth = depths.length ? Math.max(...depths) : 0
  const width = marginX * 2 + (maxDepth + 1) * colWidth
  const lowestNodeEdge = positionedNodes.length
    ? Math.max(...positionedNodes.map(node => node.y + node.height))
    : 0
  const height = Math.max(560, lowestNodeEdge + marginY + 36)

  return {
    nodes: positionedNodes,
    links: map.links.map(link => ({
      ...link,
      fromNode: positions.get(link.from),
      toNode: positions.get(link.to)
    })),
    width,
    height
  }
}

export default function MindMapPanel({ isMobile = false }) {
  const [draft, setDraft] = useState(INITIAL_TEXT)
  const [map, setMap] = useState(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [savedMaps, setSavedMaps] = useState([])
  const [currentMapId, setCurrentMapId] = useState(null)
  const [mapTitle, setMapTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getMindMaps().then(setSavedMaps).catch(console.error)
  }, [])

  function generate() {
    const parsed = parseMindMap(draft)
    setMap(parsed)
    if (parsed && !mapTitle.trim()) setMapTitle(parsed.title || 'Untitled map')
  }

  function clearAll() {
    setDraft('')
    setMap(null)
    setMapTitle('')
    setCurrentMapId(null)
  }

  async function handleSave() {
    const content = draft.trim()
    if (!content) return

    setSaving(true)
    try {
      const title = mapTitle.trim() || parseMindMap(draft)?.title || 'Untitled map'
      if (currentMapId) {
        await updateMindMap(currentMapId, { title, content })
        setSavedMaps(prev => prev.map(item => item.id === currentMapId ? { ...item, title, content, updated_at: Date.now() } : item))
      } else {
        const created = await createMindMap({ title, content })
        setCurrentMapId(created.id)
        setSavedMaps(prev => [created, ...prev])
      }
      setMapTitle(title)
    } catch (e) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  function handleLoad(saved) {
    setCurrentMapId(saved.id)
    setMapTitle(saved.title || '')
    setDraft(saved.content || '')
    setMap(parseMindMap(saved.content || ''))
    if (isMobile) setIsExpanded(true)
  }

  async function handleDeleteSaved(id) {
    if (!confirm('Delete this saved mind map?')) return
    try {
      await deleteMindMap(id)
      setSavedMaps(prev => prev.filter(item => item.id !== id))
      if (currentMapId === id) clearAll()
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
    }
  }

  const layout = map ? layoutMindMap(map) : null
  const showBuilder = !isMobile || !isExpanded
  const canvasPadding = isMobile ? '10px' : '20px 22px 24px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {showBuilder && (
        <div
          style={{
            padding: isMobile ? '12px' : '14px 16px',
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '360px 1fr',
            gap: '14px',
            alignItems: 'start'
          }}
        >
        <div
          style={{
            padding: '16px',
            borderRadius: '18px',
            background: 'linear-gradient(145deg, #eef7f3 0%, #f5f0e8 100%)',
            border: '0.5px solid rgba(17, 71, 59, 0.12)'
          }}
        >
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6F7B74', marginBottom: '8px' }}>
            Mind Map Builder
          </div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? '21px' : '24px', color: '#24332D', marginBottom: '10px' }}>
            Build nodes with real links.
          </div>
          <input
            value={mapTitle}
            onChange={e => setMapTitle(e.target.value)}
            placeholder="Map title"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid rgba(36, 51, 45, 0.12)',
              borderRadius: '12px',
              fontSize: '13px',
              fontFamily: 'inherit',
              background: 'rgba(255,255,255,0.82)',
              color: '#24332D',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '10px'
            }}
          />
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                generate()
              }
            }}
            rows={11}
            placeholder={'Project Plan\nProject Plan -> Research -> Users\nProject Plan -> Design -> Wireframes\nProject Plan -> Build -> Frontend\nProject Plan -> Build -> Backend'}
            style={{
              width: '100%',
              padding: '14px 15px',
              border: '1px solid rgba(36, 51, 45, 0.12)',
              borderRadius: '14px',
              fontSize: '13px',
              lineHeight: '1.7',
              fontFamily: 'inherit',
              resize: 'vertical',
              background: 'rgba(255,255,255,0.84)',
              color: '#24332D',
              outline: 'none',
              boxSizing: 'border-box',
              minHeight: '210px'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={generate}
              style={{
                padding: '8px 16px',
                background: '#1D9E75',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Generate map
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.trim()}
              style={{
                padding: '8px 16px',
                background: saving ? '#82CBB4' : '#173B33',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit'
              }}
            >
              {saving ? 'Saving...' : currentMapId ? 'Update save' : 'Save map'}
            </button>
            <button
              onClick={clearAll}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                color: '#5B6660',
                border: '0.5px solid rgba(36, 51, 45, 0.14)',
                borderRadius: '10px',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Clear
            </button>
            {isMobile && (
              <button
                onClick={() => setIsExpanded(true)}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  color: '#24453D',
                  border: '0.5px solid rgba(36, 69, 61, 0.18)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Full map
              </button>
            )}
          </div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: '#73807A', lineHeight: '1.6' }}>
            First line can be the map title.
            <br />
            Each next line creates a linked path using {'`->`'}.
            <br />
            Example: {'`Stroke -> Assessment -> NIHSS`'}
            <br />
            Press {'`Cmd/Ctrl + Enter`'} to generate quickly.
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
            Saved Maps
          </div>
          {savedMaps.length === 0 ? (
            <div style={{ padding: '14px', borderRadius: '14px', background: 'var(--color-background-primary)', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
              No saved maps yet. Generate and save one from the editor.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {savedMaps.map(saved => (
                <div key={saved.id} style={{ padding: '12px', borderRadius: '14px', background: 'var(--color-background-primary)', border: saved.id === currentMapId ? '1px solid #1D9E75' : '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {saved.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px', lineHeight: '1.5' }}>
                        {(saved.content || '').slice(0, 90) || 'No content'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLoad(saved)}
                      style={{
                        padding: '6px 10px',
                        background: '#E1F5EE',
                        color: '#085041',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleDeleteSaved(saved.id)}
                      style={{
                        padding: '6px 9px',
                        background: 'transparent',
                        color: '#A24646',
                        border: '0.5px solid rgba(162,70,70,0.18)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: canvasPadding, background: isExpanded ? 'var(--color-background-secondary)' : 'var(--color-background-primary)' }}>
        {isMobile && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Map View
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              {!isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  style={{
                    padding: '7px 10px',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-secondary)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Expand
                </button>
              )}
              {isExpanded && (
                <button
                  onClick={() => setIsExpanded(false)}
                  style={{
                    padding: '7px 10px',
                    background: 'var(--color-background-primary)',
                    color: 'var(--color-text-secondary)',
                    border: '0.5px solid var(--color-border-secondary)',
                    borderRadius: '10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Back to editor
                </button>
              )}
            </div>
          </div>
        )}
        {layout ? (
          <div
            style={{
              minWidth: isMobile ? `${Math.max(layout.width, 760)}px` : `${layout.width}px`,
              background: 'radial-gradient(circle at top left, rgba(29,158,117,0.06), transparent 30%), var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: '24px',
              overflow: 'hidden'
            }}
          >
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              style={{
                width: isMobile ? `${Math.max(layout.width, 760)}px` : '100%',
                minWidth: `${layout.width}px`,
                height: `${layout.height}px`,
                display: 'block'
              }}
              xmlns="http://www.w3.org/2000/svg"
            >
              {layout.links.map((link, index) => {
                if (!link.fromNode || !link.toNode) return null
                const x1 = link.fromNode.x + link.fromNode.width
                const y1 = link.fromNode.y + link.fromNode.height / 2
                const x2 = link.toNode.x
                const y2 = link.toNode.y + link.toNode.height / 2
                const cx1 = x1 + 48
                const cx2 = x2 - 48

                return (
                  <path
                    key={`${link.from}-${link.to}-${index}`}
                    d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={link.color}
                    strokeWidth="3"
                    strokeOpacity="0.32"
                  />
                )
              })}

              {layout.nodes.map(node => {
                const lines = splitLabel(node.label, node.depth === 0 ? 16 : 14)
                const fill = node.depth === 0 ? '#173B33' : 'white'
                const textColor = node.depth === 0 ? 'white' : '#23312D'
                const stroke = node.depth === 0 ? '#173B33' : node.color
                const chipFill = node.depth === 0 ? 'rgba(255,255,255,0.16)' : `${node.color}18`

                return (
                  <g key={node.id}>
                    <rect
                      x={node.x}
                      y={node.y}
                      rx="18"
                      ry="18"
                      width={node.width}
                      height={node.height}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth="1.5"
                    />
                    <rect
                      x={node.x + 12}
                      y={node.y + 10}
                      rx="999"
                      ry="999"
                      width="34"
                      height="18"
                      fill={chipFill}
                    />
                    <text
                      x={node.x + 29}
                      y={node.y + 23}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={node.depth === 0 ? 'white' : node.color}
                      fontFamily="'DM Sans', sans-serif"
                      fontWeight="700"
                    >
                      {node.depth === 0 ? 'ROOT' : `L${node.depth}`}
                    </text>
                    {lines.map((line, index) => (
                      <text
                        key={`${node.id}-${index}`}
                        x={node.x + node.width / 2}
                        y={node.y + 36 + index * 14}
                        textAnchor="middle"
                        fontSize={node.depth === 0 ? '12.5' : '12'}
                        fill={textColor}
                        fontFamily="'DM Sans', sans-serif"
                        fontWeight={node.depth === 0 ? '700' : '600'}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                )
              })}
            </svg>
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: isMobile ? '42px 18px' : '64px 24px',
              borderRadius: '24px',
              border: '0.5px dashed var(--color-border-secondary)',
              background: 'linear-gradient(180deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)',
              color: 'var(--color-text-tertiary)'
            }}
          >
            <i className="ti ti-git-fork" style={{ fontSize: '36px', display: 'block', marginBottom: '12px' }} />
            <div style={{ fontFamily: "'Lora', serif", fontSize: '24px', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              No map yet
            </div>
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
              Type connected paths on the left, then generate the map.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
