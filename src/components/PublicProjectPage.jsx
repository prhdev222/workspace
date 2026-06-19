import { useEffect, useState } from 'react'
import Login from './Login'
import { getPrivateProject, getPublicProject } from '../lib/api'

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
      fontFamily: 'DM Sans, sans-serif'
    }
  })
  return mermaidInstance
}

function MermaidBlock({ code, id, isMobile = false }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setError('')
    loadMermaid()
      .then(instance => instance.render(`public-diagram-${id}`, code || 'flowchart TD\n  A[Empty diagram]'))
      .then(result => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch(e => {
        if (!cancelled) setError(e.message || 'Diagram could not render')
      })
    return () => { cancelled = true }
  }, [code, id])

  if (error) {
    return (
      <pre style={{ whiteSpace: 'pre-wrap', padding: isMobile ? '10px' : '12px', borderRadius: '10px', background: '#F8F1EF', color: '#8B2F25', fontSize: isMobile ? '11px' : '12px', overflowX: 'auto' }}>
        {code}
      </pre>
    )
  }

  return (
    <div style={{
      overflowX: 'auto',
      padding: isMobile ? '8px 0 4px' : '10px 0',
      WebkitOverflowScrolling: 'touch'
    }}>
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div style={{ color: '#7C8A85', fontSize: '13px' }}>Rendering diagram…</div>}
    </div>
  )
}

function formatDate(value) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return value
}

function NoteItem({ note, isMobile = false }) {
  return (
    <article style={itemStyle(isMobile)}>
      <div style={labelStyle('#185FA5', '#E6F1FB')}><i className="ti ti-file-text" /> Note</div>
      <h2 style={itemTitleStyle(isMobile)}>{note.title || 'Untitled note'}</h2>
      {(note.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {note.tags.map(tag => <span key={tag} style={tagStyle}>#{tag}</span>)}
        </div>
      )}
      <div style={{ display: 'grid', gap: '8px' }}>
        {(note.blocks || []).map((block, index) => {
          if (block.type === 'image') return block.content ? <img key={block.id || index} src={block.content} alt="" style={{ maxWidth: '100%', borderRadius: '10px' }} /> : null
          const text = block.content || block.text || ''
          const isHeading = block.type === 'heading'
          return (
            <div key={block.id || index} style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              color: block.done ? '#8A9691' : '#27362F',
              textDecoration: block.done ? 'line-through' : 'none',
              fontFamily: isHeading ? "'Lora', serif" : 'inherit',
              fontSize: isHeading ? (isMobile ? '18px' : '19px') : (isMobile ? '15px' : '15px'),
              lineHeight: isHeading ? 1.35 : 1.75,
              fontWeight: isHeading ? 500 : 400,
              borderLeft: block.type === 'quote' ? '3px solid #1D9E75' : 'none',
              paddingLeft: block.type === 'quote' ? '12px' : 0,
              fontStyle: block.type === 'quote' ? 'italic' : 'normal'
            }}>
              {block.type === 'todo' && <i className={`ti ${block.done ? 'ti-circle-check' : 'ti-circle'}`} style={{ color: block.done ? '#1D9E75' : '#9AA9A3', marginTop: '5px' }} />}
              {block.type === 'bullet' && <span style={{ color: '#1D9E75', marginTop: '2px' }}>•</span>}
              <div dangerouslySetInnerHTML={{ __html: text }} />
            </div>
          )
        })}
      </div>
    </article>
  )
}

function TodoItem({ todo, isMobile = false }) {
  const attachment = todo.attachment_url || ''
  const isImage = /^data:image\//.test(attachment) || /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(attachment)

  return (
    <article style={itemStyle(isMobile)}>
      <div style={labelStyle('#854F0B', '#FAEEDA')}><i className="ti ti-checklist" /> Todo</div>
      <h2 style={itemTitleStyle(isMobile)}>{todo.text}</h2>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', color: '#66756F', fontSize: '13px' }}>
        <span>{todo.done ? 'Done' : 'Open'}</span>
        <span>{todo.priority || 'med'} priority</span>
        {(todo.start_date || todo.due_date || todo.due_label) && <span>{formatDate(todo.start_date || todo.due_date || todo.due_label)}</span>}
        {todo.location && <span>{todo.location}</span>}
      </div>
      {attachment && (
        <div style={{ marginTop: '12px' }}>
          {isImage ? (
            <a href={attachment} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
              <img src={attachment} alt="" style={{ width: isMobile ? '100%' : 'auto', maxWidth: '100%', maxHeight: isMobile ? '320px' : '420px', objectFit: 'contain', borderRadius: '12px', border: '0.5px solid #DDE5E1' }} />
            </a>
          ) : (
            <a href={attachment} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '6px', color: '#0C5A47', fontSize: '13px', fontWeight: 700, textDecoration: 'none', padding: isMobile ? '10px 12px' : 0, borderRadius: isMobile ? '10px' : 0, background: isMobile ? '#EAF5F1' : 'transparent', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}>
              <i className="ti ti-link" /> Open attachment
            </a>
          )}
        </div>
      )}
    </article>
  )
}

function IdeaItem({ idea, isMobile = false }) {
  return (
    <article style={itemStyle(isMobile)}>
      <div style={labelStyle('#534AB7', '#EEEDFE')}><i className="ti ti-bulb" /> Idea</div>
      <p style={{ margin: '8px 0 0', fontSize: isMobile ? '15px' : '16px', lineHeight: 1.75, color: '#27362F' }}>
        <span style={{ fontSize: isMobile ? '20px' : '22px', marginRight: '7px' }}>{idea.emoji || '💡'}</span>
        {idea.content}
      </p>
      {idea.image_url && (
        <img src={idea.image_url} alt="" style={{ width: isMobile ? '100%' : 'auto', maxWidth: '100%', maxHeight: isMobile ? '320px' : '420px', objectFit: 'contain', borderRadius: '12px', border: '0.5px solid #DDE5E1', marginTop: '12px' }} />
      )}
    </article>
  )
}

function DiagramItem({ diagram, itemId, isMobile = false }) {
  return (
    <article style={itemStyle(isMobile)}>
      <div style={labelStyle('#0C5A47', '#EAF5F1')}><i className="ti ti-chart-arrows" /> Diagram</div>
      <h2 style={itemTitleStyle(isMobile)}>{diagram.title || 'Untitled diagram'}</h2>
      {isMobile && <div style={{ fontSize: '12px', color: '#7C8A85', marginBottom: '4px' }}>Swipe sideways if the diagram is wider than the screen.</div>}
      <MermaidBlock code={diagram.content} id={itemId} isMobile={isMobile} />
    </article>
  )
}

function CustomItem({ item, isMobile = false }) {
  const title = item.title || (item.display_type === 'image' ? 'Image' : item.display_type === 'link' ? 'Link' : 'Text')
  const url = item.url || item.item_id || ''
  const isImage = item.display_type === 'image' || /^data:image\//.test(url) || /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(url)
  return (
    <article style={itemStyle(isMobile)}>
      <div style={labelStyle('#6A4710', '#FBF1DE')}><i className="ti ti-pencil" /> Custom</div>
      <h2 style={itemTitleStyle(isMobile)}>{title}</h2>
      {item.content && <p style={{ margin: '0 0 12px', fontSize: isMobile ? '15px' : '16px', lineHeight: 1.75, color: '#27362F', whiteSpace: 'pre-wrap' }}>{item.content}</p>}
      {url && (
        isImage ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
            <img src={url} alt={title} style={{ width: isMobile ? '100%' : 'auto', maxWidth: '100%', maxHeight: isMobile ? '340px' : '520px', objectFit: 'contain', borderRadius: '12px', border: '0.5px solid #DDE5E1' }} />
          </a>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '6px', color: '#0C5A47', fontSize: '13px', fontWeight: 700, textDecoration: 'none', padding: isMobile ? '10px 12px' : '8px 0', borderRadius: isMobile ? '10px' : 0, background: isMobile ? '#EAF5F1' : 'transparent', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}>
            <i className="ti ti-link" /> Open link
          </a>
        )
      )}
    </article>
  )
}

function LibraryItem({ item, isMobile = false }) {
  const url = item.url || item.item_id || ''
  const title = item.title || 'Library file'
  const isImage = item.display_type === 'image' || /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(url)
  return (
    <article style={itemStyle(isMobile)}>
      <div style={labelStyle('#6A4710', '#FBF1DE')}><i className="ti ti-books" /> Library</div>
      <h2 style={itemTitleStyle(isMobile)}>{title}</h2>
      {item.content && <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#5E6D67', lineHeight: 1.6 }}>{item.content}</p>}
      {isImage ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-block' }}>
          <img src={url} alt={title} style={{ width: isMobile ? '100%' : 'auto', maxWidth: '100%', maxHeight: isMobile ? '340px' : '520px', objectFit: 'contain', borderRadius: '12px', border: '0.5px solid #DDE5E1' }} />
        </a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-start', gap: '6px', color: '#0C5A47', fontSize: '13px', fontWeight: 700, textDecoration: 'none', padding: isMobile ? '10px 12px' : '8px 0', borderRadius: isMobile ? '10px' : 0, background: isMobile ? '#EAF5F1' : 'transparent', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}>
          <i className="ti ti-external-link" /> Open library file
        </a>
      )}
    </article>
  )
}

function ProjectItem({ item, isMobile = false }) {
  if (item.item_type === 'notes') return <NoteItem note={item.entity} isMobile={isMobile} />
  if (item.item_type === 'todo') return <TodoItem todo={item.entity} isMobile={isMobile} />
  if (item.item_type === 'ideas') return <IdeaItem idea={item.entity} isMobile={isMobile} />
  if (item.item_type === 'mindmap') return <DiagramItem diagram={item.entity} itemId={item.id} isMobile={isMobile} />
  if (item.item_type === 'custom') return <CustomItem item={item.entity || item} isMobile={isMobile} />
  if (item.item_type === 'library') return <LibraryItem item={item.entity || item} isMobile={isMobile} />
  return null
}

export default function PublicProjectPage({ slug }) {
  const [project, setProject] = useState(null)
  const [error, setError] = useState('')
  const [needsLogin, setNeedsLogin] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640)

  useEffect(() => {
    setProject(null)
    setError('')
    setNeedsLogin(false)
    getPublicProject(slug)
      .then(setProject)
      .catch(async publicError => {
        if (publicError?.status !== 404) {
          setError(publicError.message)
          return
        }
        try {
          const privateProject = await getPrivateProject(slug)
          setProject(privateProject)
        } catch (privateError) {
          if (privateError?.status === 401) setNeedsLogin(true)
          else setError(privateError.message)
        }
      })
  }, [slug, retryKey])

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 640)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (needsLogin) {
    return <Login onLogin={() => { setNeedsLogin(false); setRetryKey(value => value + 1) }} />
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '80px 20px', color: '#8B2F25' }}>
          Project not found.
        </div>
      </div>
    )
  }

  if (!project) {
    return <div style={pageStyle}><div style={{ padding: '80px 20px', textAlign: 'center', color: '#7C8A85' }}>Loading project…</div></div>
  }

  return (
    <div style={pageStyle}>
      <main style={{ maxWidth: '840px', margin: '0 auto', padding: isMobile ? '28px 16px 52px' : '46px 18px 72px' }}>
        <header style={{ marginBottom: isMobile ? '20px' : '28px', borderBottom: '0.5px solid #DDE5E1', paddingBottom: isMobile ? '18px' : '22px' }}>
          <div style={{ fontSize: isMobile ? '34px' : '42px', marginBottom: '10px' }}>{project.emoji || '📚'}</div>
          <h1 style={{ fontFamily: "'Lora', serif", fontWeight: 500, fontSize: isMobile ? '34px' : 'clamp(32px, 6vw, 52px)', lineHeight: isMobile ? 1.12 : 1.08, margin: '0 0 12px', color: '#173B33', overflowWrap: 'anywhere' }}>
            {project.title}
          </h1>
          {project.description && <p style={{ margin: 0, color: '#5E6D67', fontSize: isMobile ? '15px' : '16px', lineHeight: 1.7 }}>{project.description}</p>}
          <div style={{ marginTop: '16px', fontSize: '12px', color: '#7C8A85' }}>
            {project.items.length} item{project.items.length === 1 ? '' : 's'} · {project.is_public ? 'Public' : 'Private'} knowledge page
          </div>
        </header>
        <div style={{ display: 'grid', gap: isMobile ? '12px' : '16px' }}>
          {project.items.length === 0 ? (
            <div style={{ padding: '24px 0', color: '#7C8A85' }}>This project has no public items yet.</div>
          ) : project.items.map(item => <ProjectItem key={item.id} item={item} isMobile={isMobile} />)}
        </div>
      </main>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: '#FBFCFA',
  color: '#27362F',
  fontFamily: "'DM Sans', sans-serif"
}

function itemStyle(isMobile = false) {
  return {
  padding: isMobile ? '15px 0' : '18px 0',
  borderBottom: '0.5px solid #DDE5E1'
  }
}

function itemTitleStyle(isMobile = false) {
  return {
  fontFamily: "'Lora', serif",
  fontSize: isMobile ? '21px' : '24px',
  lineHeight: 1.25,
  fontWeight: 500,
  color: '#173B33',
  margin: '8px 0 10px',
  overflowWrap: 'anywhere'
  }
}

const tagStyle = {
  padding: '3px 8px',
  borderRadius: '999px',
  background: '#EAF5F1',
  color: '#0C5A47',
  fontSize: '12px',
  fontWeight: 600
}

function labelStyle(color, bg) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 8px',
    borderRadius: '999px',
    background: bg,
    color,
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  }
}
