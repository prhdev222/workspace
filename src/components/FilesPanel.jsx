import { useState, useRef, useCallback, useEffect } from 'react'

const TYPE_ICON = {
  pdf:     'ti-file-type-pdf',
  epub:    'ti-book',
  doc:     'ti-file-type-doc',
  ppt:     'ti-presentation',
  video:   'ti-movie',
  audio:   'ti-music',
  image:   'ti-photo',
  archive: 'ti-file-zip',
  file:    'ti-file',
}

const TYPE_COLOR = {
  pdf:   '#E53E3E',
  epub:  '#6B46C1',
  doc:   '#2B6CB0',
  ppt:   '#C05621',
  video: '#2C7A7B',
  audio: '#276749',
  image: '#B7791F',
}

const DESTINATIONS = {
  r2:     { label: 'R2 (≤200MB)', endpoint: '/api/upload' },
  garage: { label: 'Garage (≤2GB)', endpoint: '/api/bigfile-upload' },
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function btnStyle(bg, color) {
  return {
    padding: '6px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)',
    background: bg, color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
    fontFamily: 'inherit'
  }
}

function FileViewer({ file, onClose, onDelete, isMobile }) {
  if (!file) return null

  const viewerStyle = {
    position: isMobile ? 'fixed' : 'relative',
    inset: isMobile ? 0 : 'auto',
    zIndex: isMobile ? 100 : 'auto',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-background-primary)',
    flex: 1,
    minHeight: 0,
  }

  return (
    <div style={viewerStyle}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-secondary)', flexShrink: 0
      }}>
        <i className={`ti ${TYPE_ICON[file.type] || 'ti-file'}`}
           style={{ fontSize: '16px', color: TYPE_COLOR[file.type] || 'var(--color-text-secondary)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {file.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            {formatSize(file.size)} · {formatDate(file.uploaded)} · {DESTINATIONS[file.destination]?.label || file.destination}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <a href={file.url} download={file.name} title="Download" style={{ ...btnStyle('var(--color-background-primary)', 'var(--color-text-secondary)'), textDecoration: 'none' }}>
            <i className="ti ti-download" style={{ fontSize: '13px' }} />
          </a>
          <button onClick={() => onDelete(file)} title="ลบไฟล์" style={btnStyle('var(--color-background-primary)', '#DC2626')}>
            <i className="ti ti-trash" style={{ fontSize: '13px' }} />
          </button>
          <button onClick={onClose} style={btnStyle('var(--color-background-primary)', 'var(--color-text-secondary)')}>
            <i className="ti ti-x" style={{ fontSize: '13px' }} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#1a1a1a' }}>
        {file.type === 'pdf' && (
          <iframe src={file.url} style={{ width: '100%', height: '100%', border: 'none' }} title={file.name} />
        )}
        {file.type === 'image' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
            <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
        )}
        {file.type === 'video' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video controls src={file.url} style={{ maxWidth: '100%', maxHeight: '100%' }} />
          </div>
        )}
        {file.type === 'audio' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', boxSizing: 'border-box' }}>
            <div style={{ textAlign: 'center' }}>
              <i className="ti ti-music" style={{ fontSize: '48px', color: '#4ade80', display: 'block', marginBottom: '16px' }} />
              <div style={{ color: 'white', fontSize: '14px', marginBottom: '16px' }}>{file.name}</div>
              <audio controls src={file.url} style={{ width: '280px' }} />
            </div>
          </div>
        )}
        {!['pdf', 'image', 'video', 'audio'].includes(file.type) && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <i className={`ti ${TYPE_ICON[file.type] || 'ti-file'}`} style={{ fontSize: '56px', color: TYPE_COLOR[file.type] || '#888' }} />
            <div style={{ color: '#ccc', fontSize: '14px' }}>{file.name}</div>
            <a href={file.url} download={file.name}
               style={{ padding: '10px 20px', borderRadius: '10px', background: '#1D9E75', color: 'white', textDecoration: 'none', fontSize: '13px', fontWeight: '500' }}>
              <i className="ti ti-download" style={{ marginRight: '6px' }} />
              ดาวน์โหลด
            </a>
          </div>
        )}
        {file.tags?.length > 0 && (
          <div style={{ position: 'absolute', bottom: '16px', left: '16px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {file.tags.map(t => (
              <span key={t} style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '99px', background: 'rgba(29,158,117,0.85)', color: 'white' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function FilesPanel({ isMobile }) {
  const [files, setFiles] = useState([])
  const [allTags, setAllTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [destination, setDestination] = useState('r2')
  const [pendingTags, setPendingTags] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const inputRef = useRef()

  useEffect(() => { loadFiles() }, [tagFilter])

  async function loadFiles() {
    setLoading(true)
    try {
      const qs = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : ''
      const res = await fetch(`/api/files${qs}`)
      const data = await res.json()
      setFiles(data.files || [])
      setAllTags(data.allTags || [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  function pickFile(f) {
    setPendingFile(f)
    setPendingTags('')
  }

  async function confirmUpload() {
    if (!pendingFile) return
    setUploadError('')
    setUploading(true)
    setProgress(0)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      form.append('tags', pendingTags)
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', DESTINATIONS[destination].endpoint)
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)) }
        xhr.onload = () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText))
          else reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(form)
      })
      setPendingFile(null)
      setPendingTags('')
      await loadFiles()
      setShowUpload(false)
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(file) {
    if (!confirm(`ลบ "${file.name}" ออกจาก ${DESTINATIONS[file.destination]?.label || file.destination}?\nไม่สามารถกู้คืนได้`)) return
    try {
      await fetch(`/api/files?key=${encodeURIComponent(file.key)}&destination=${file.destination}`, { method: 'DELETE' })
      setSelected(null)
      await loadFiles()
    } catch {
      alert('ลบไม่ได้ กรุณาลองใหม่')
    }
  }

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pickFile(f)
  }, [])

  const allTypes = [...new Set(files.map(f => f.type))].sort()
  const filtered = files
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    .filter(f => !typeFilter || f.type === typeFilter)
  const splitView = !isMobile && selected

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
        borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', flexShrink: 0
      }}>
        <i className="ti ti-files" style={{ fontSize: '16px', color: '#1D9E75' }} />
        <span style={{ fontSize: '14px', fontWeight: '600' }}>Files</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', background: 'var(--color-border-tertiary)', padding: '1px 7px', borderRadius: '99px' }}>
          {files.length}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา..."
            style={{
              padding: '6px 10px 6px 26px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
              fontSize: '12px', outline: 'none', width: isMobile ? '120px' : '160px', fontFamily: 'inherit'
            }}
          />
        </div>
        <button onClick={() => setShowUpload(v => !v)} style={{ ...btnStyle('#1D9E75', 'white'), flexShrink: 0 }}>
          <i className="ti ti-upload" style={{ fontSize: '13px' }} />
          {!isMobile && <span style={{ fontSize: '12px' }}>Upload</span>}
        </button>
        <button onClick={loadFiles} title="Refresh" style={btnStyle('var(--color-background-primary)', 'var(--color-text-secondary)')}>
          <i className="ti ti-refresh" style={{ fontSize: '13px' }} />
        </button>
      </div>

      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
          <button
            onClick={() => setTagFilter('')}
            style={{
              fontSize: '11px', padding: '3px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer',
              background: tagFilter === '' ? '#1D9E75' : 'var(--color-border-tertiary)',
              color: tagFilter === '' ? 'white' : 'var(--color-text-secondary)'
            }}
          >ทั้งหมด</button>
          {allTags.map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              style={{
                fontSize: '11px', padding: '3px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: tagFilter === t ? '#1D9E75' : 'var(--color-border-tertiary)',
                color: tagFilter === t ? 'white' : 'var(--color-text-secondary)'
              }}
            >{t}</button>
          ))}
        </div>
      )}

      {allTypes.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', flexShrink: 0 }}>
          <button
            onClick={() => setTypeFilter('')}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', padding: '3px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer',
              background: typeFilter === '' ? '#1D9E75' : 'var(--color-border-tertiary)',
              color: typeFilter === '' ? 'white' : 'var(--color-text-secondary)'
            }}
          >ทุกประเภท</button>
          {allTypes.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', padding: '3px 10px', borderRadius: '99px', border: 'none', cursor: 'pointer',
                background: typeFilter === t ? '#1D9E75' : 'var(--color-border-tertiary)',
                color: typeFilter === t ? 'white' : 'var(--color-text-secondary)'
              }}
            >
              <i className={`ti ${TYPE_ICON[t] || 'ti-file'}`} style={{ fontSize: '12px' }} />
              {t}
            </button>
          ))}
        </div>
      )}

      {showUpload && (
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {Object.entries(DESTINATIONS).map(([key, d]) => (
              <button
                key={key}
                onClick={() => setDestination(key)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)',
                  cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
                  background: destination === key ? '#1D9E75' : 'var(--color-background-primary)',
                  color: destination === key ? 'white' : 'var(--color-text-secondary)'
                }}
              >{d.label}</button>
            ))}
          </div>

          {pendingFile ? (
            <div>
              <div style={{ fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                <i className="ti ti-paperclip" style={{ marginRight: '4px' }} />
                {pendingFile.name} · {formatSize(pendingFile.size)}
              </div>
              <input
                value={pendingTags}
                onChange={e => setPendingTags(e.target.value)}
                placeholder="tags คั่นด้วย comma เช่น chula, slides"
                disabled={uploading}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px',
                  border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)', fontSize: '12px', outline: 'none', fontFamily: 'inherit', marginBottom: '8px'
                }}
              />
              {uploading ? (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>กำลังอัปโหลด... {progress}%</div>
                  <div style={{ background: 'var(--color-border-tertiary)', borderRadius: '99px', height: '5px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', background: '#1D9E75', borderRadius: '99px', transformOrigin: 'left', transform: `scaleX(${progress / 100})`, transition: 'transform 0.2s' }} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={confirmUpload} style={{ ...btnStyle('#1D9E75', 'white'), flex: 1, justifyContent: 'center', fontSize: '12px' }}>
                    <i className="ti ti-upload" style={{ fontSize: '13px' }} />
                    อัปโหลดไป {DESTINATIONS[destination].label}
                  </button>
                  <button onClick={() => setPendingFile(null)} style={{ ...btnStyle('var(--color-background-primary)', 'var(--color-text-secondary)'), fontSize: '12px' }}>
                    ยกเลิก
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#1D9E75' : 'var(--color-border-secondary)'}`,
                borderRadius: '12px', padding: '20px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? '#E1F5EE' : 'transparent', transition: 'all 0.15s'
              }}
            >
              <input ref={inputRef} type="file"
                style={{ display: 'none' }} onChange={e => e.target.files[0] && pickFile(e.target.files[0])} />
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: '20px', display: 'block', marginBottom: '6px', color: '#1D9E75' }} />
                วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก — เลือกปลายทางด้านบนก่อนอัปโหลด
              </div>
            </div>
          )}
          {uploadError && <div style={{ marginTop: '8px', fontSize: '12px', color: '#DC2626' }}>{uploadError}</div>}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <div style={{
          width: splitView ? '280px' : '100%', flexShrink: 0,
          overflowY: 'auto', borderRight: splitView ? '0.5px solid var(--color-border-tertiary)' : 'none'
        }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              <i className="ti ti-loader-2" style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }} />
              กำลังโหลด...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
              {files.length === 0 ? 'ยังไม่มีไฟล์ กด Upload เพื่อเพิ่ม' : 'ไม่พบไฟล์ที่ค้นหา'}
            </div>
          ) : (
            <div style={{ padding: '8px' }}>
              {filtered.map(f => {
                const isSelected = selected?.url === f.url
                return (
                  <div
                    key={f.key}
                    onClick={() => setSelected(isSelected && !isMobile ? null : f)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px',
                      borderRadius: '10px', cursor: 'pointer', marginBottom: '2px',
                      background: isSelected ? '#E1F5EE' : 'transparent',
                      color: isSelected ? '#085041' : 'var(--color-text-primary)',
                    }}
                  >
                    <i className={`ti ${TYPE_ICON[f.type] || 'ti-file'}`}
                       style={{ fontSize: '18px', color: isSelected ? '#1D9E75' : (TYPE_COLOR[f.type] || 'var(--color-text-tertiary)'), flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: '10px', color: isSelected ? '#1D9E75' : 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        {formatSize(f.size)} · {formatDate(f.uploaded)}
                        {f.tags?.length > 0 && ` · ${f.tags.join(', ')}`}
                      </div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {selected && (
          <FileViewer file={selected} onClose={() => setSelected(null)} onDelete={handleDelete} isMobile={isMobile} />
        )}

        {!selected && !isMobile && files.length > 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: 'var(--color-text-tertiary)' }}>
            <i className="ti ti-file-search" style={{ fontSize: '40px' }} />
            <div style={{ fontSize: '13px' }}>เลือกไฟล์เพื่อเปิดอ่าน</div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
