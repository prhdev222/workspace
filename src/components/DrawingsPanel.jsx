import { useEffect, useRef, useState } from 'react'
import { createDrawing, deleteDrawing } from '../lib/api'

const PEN_COLORS = ['#173B33', '#1D9E75', '#185FA5', '#E24B4A', '#854F0B', '#111827']
const QUICK_TAGS = ['lecture', 'clinical', 'idea', 'todo', 'diagram', 'patient']
const TRIM_PADDING = 28

function formatDate(ts) {
  if (!ts) return ''
  return new Date(parseInt(ts, 10)).toLocaleString()
}

function trimCanvasToContent(sourceCanvas, padding = TRIM_PADDING) {
  const ctx = sourceCanvas.getContext('2d')
  const { width, height } = sourceCanvas
  const pixels = ctx.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = pixels.data[i]
      const g = pixels.data[i + 1]
      const b = pixels.data[i + 2]
      const a = pixels.data[i + 3]
      if (a <= 8 || (r >= 245 && g >= 245 && b >= 245)) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return sourceCanvas

  minX = Math.max(0, minX - padding)
  minY = Math.max(0, minY - padding)
  maxX = Math.min(width - 1, maxX + padding)
  maxY = Math.min(height - 1, maxY + padding)

  const trimmed = document.createElement('canvas')
  trimmed.width = maxX - minX + 1
  trimmed.height = maxY - minY + 1
  const trimmedCtx = trimmed.getContext('2d')
  trimmedCtx.fillStyle = '#FFFFFF'
  trimmedCtx.fillRect(0, 0, trimmed.width, trimmed.height)
  trimmedCtx.drawImage(sourceCanvas, minX, minY, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height)
  return trimmed
}

export default function DrawingsPanel({ drawings, setDrawings, isMobile = false, externalSearch = '' }) {
  const canvasRef = useRef()
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const [label, setLabel] = useState('')
  const [tags, setTags] = useState([])
  const [tagDraft, setTagDraft] = useState('')
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [penSize, setPenSize] = useState(4)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState(externalSearch)

  useEffect(() => {
    setSearch(externalSearch)
  }, [externalSearch])

  useEffect(() => {
    resetCanvas()
  }, [isMobile])

  const filteredDrawings = drawings.filter(item => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return true
    return [item.label, ...(item.tags || [])].join(' ').toLowerCase().includes(normalized)
  })

  function resetCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return

    const containerWidth = canvas.parentElement?.clientWidth || 720
    const width = Math.min(1000, Math.max(320, containerWidth))
    const height = isMobile ? Math.max(420, window.innerHeight - 360) : 520
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
  }

  function getPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDrawing(e) {
    e.preventDefault()
    canvasRef.current?.setPointerCapture?.(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
  }

  function draw(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const current = getPoint(e)
    const previous = lastPointRef.current || current
    const mid = { x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 }

    ctx.strokeStyle = penColor
    ctx.lineWidth = penSize
    ctx.beginPath()
    ctx.moveTo(previous.x, previous.y)
    ctx.quadraticCurveTo(previous.x, previous.y, mid.x, mid.y)
    ctx.stroke()
    lastPointRef.current = current
  }

  function stopDrawing(e) {
    drawingRef.current = false
    lastPointRef.current = null
    canvasRef.current?.releasePointerCapture?.(e.pointerId)
  }

  function toggleTag(tag) {
    setTags(prev => prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag])
  }

  function addCustomTag() {
    const next = tagDraft.trim().replace(/^#/, '')
    if (!next) return
    setTags(prev => prev.includes(next) ? prev : [...prev, next])
    setTagDraft('')
  }

  async function saveDrawing() {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    try {
      const trimmed = trimCanvasToContent(canvas)
      const created = await createDrawing({
        label: label.trim() || 'Untitled drawing',
        tags,
        image_url: trimmed.toDataURL('image/png')
      })
      setDrawings(prev => [created, ...prev])
      setLabel('')
      setTags([])
      resetCanvas()
    } catch (e) {
      alert(`Save drawing failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function removeDrawing(id) {
    try {
      await deleteDrawing(id)
      setDrawings(prev => prev.filter(item => item.id !== id))
    } catch (e) {
      alert(`Delete drawing failed: ${e.message}`)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 12px 96px' : '18px 22px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(340px, 1fr) 260px', gap: '16px', alignItems: 'start' }}>
        <section style={{ borderRadius: '20px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', padding: isMobile ? '12px' : '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>Draw</div>
              <div style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? '24px' : '30px', color: 'var(--color-text-primary)' }}>Sketch only. Tag later.</div>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={resetCanvas} style={{ padding: '8px 11px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
              Clear
            </button>
            <button onClick={saveDrawing} disabled={saving} style={{ padding: '9px 14px', borderRadius: '10px', border: 'none', background: saving ? '#9FE1CB' : '#1D9E75', color: 'white', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '700', fontFamily: 'inherit' }}>
              {saving ? 'Saving...' : 'Save drawing'}
            </button>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: '16px', background: '#FFFFFF', border: '0.5px solid var(--color-border-secondary)' }}>
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
              style={{ display: 'block', maxWidth: '100%', touchAction: 'none', cursor: 'crosshair' }}
            />
          </div>

          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {PEN_COLORS.map(color => (
              <button key={color} onClick={() => setPenColor(color)} aria-label={color}
                style={{ width: '28px', height: '28px', borderRadius: '999px', border: penColor === color ? '2px solid #085041' : '1px solid rgba(0,0,0,0.14)', background: color, cursor: 'pointer' }}
              />
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
              Stroke
              <input type="range" min="2" max="18" value={penSize} onChange={e => setPenSize(Number(e.target.value))} />
            </label>
          </div>
        </section>

        <aside style={{ borderRadius: '18px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', padding: '14px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: '10px' }}>Tag picture</div>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Label this drawing"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none', fontSize: '13px', fontFamily: 'inherit', marginBottom: '10px' }}
          />
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {QUICK_TAGS.map(tag => (
              <button key={tag} onClick={() => toggleTag(tag)}
                style={{ padding: '6px 9px', borderRadius: '999px', border: '0.5px solid var(--color-border-secondary)', background: tags.includes(tag) ? '#E1F5EE' : 'var(--color-background-primary)', color: tags.includes(tag) ? '#085041' : 'var(--color-text-secondary)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                #{tag}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
              placeholder="custom tag"
              style={{ flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none', fontSize: '12px', fontFamily: 'inherit' }}
            />
            <button onClick={addCustomTag} style={{ padding: '9px 10px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>Add</button>
          </div>
          {tags.length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {tags.map(tag => <span key={tag} style={{ fontSize: '11px', color: '#085041', background: '#E1F5EE', borderRadius: '999px', padding: '5px 8px' }}>#{tag}</span>)}
            </div>
          )}
        </aside>
      </div>

      <div style={{ marginTop: '18px', position: 'relative' }}>
        <i className="ti ti-search" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search drawings by label or tag"
          style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 32px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', outline: 'none', fontSize: '12px', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
        {filteredDrawings.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '48px 20px', borderRadius: '18px', border: '0.5px dashed var(--color-border-secondary)', background: 'var(--color-background-secondary)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <i className="ti ti-pencil" style={{ fontSize: '34px', display: 'block', marginBottom: '10px' }} />
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>No drawings yet.</div>
          </div>
        ) : filteredDrawings.map(item => (
          <article key={item.id} style={{ borderRadius: '18px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', overflow: 'hidden' }}>
            <img src={item.image_url} alt="" style={{ width: '100%', display: 'block', background: '#FFFFFF' }} />
            <div style={{ padding: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '5px' }}>{item.label || 'Untitled drawing'}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '10px' }}>{formatDate(item.created_at)}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {(item.tags || []).map(tag => <span key={tag} style={{ fontSize: '10px', color: '#085041', background: '#E1F5EE', borderRadius: '999px', padding: '4px 7px' }}>#{tag}</span>)}
              </div>
              <button onClick={() => removeDrawing(item.id)} style={{ padding: '7px 10px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: '#A33A3A', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
