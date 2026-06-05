import { useState, useRef, useCallback, useEffect } from 'react'

const DIGITAL_LIBRARY_URL = 'https://digital-library.uraree.com'
const R2_PUBLIC_URL = 'https://pub-ab79910c37a84799a9cf9f45fe44da06.r2.dev'

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

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function FileViewer({ file, onClose, onDelete, isMobile }) {
  if (!file) return null

  function addToLibrary() {
    const params = new URLSearchParams({ fileUrl: file.url, fileName: file.name })
    window.open(`${DIGITAL_LIBRARY_URL}/admin/books/add?${params}`, '_blank')
  }

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
      {/* Viewer header */}
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
            {formatSize(file.size)} · {formatDate(file.uploaded)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button onClick={addToLibrary} title="เพิ่มใน Digital Library" style={btnStyle('#1D9E75', 'white')}>
            <i className="ti ti-books" style={{ fontSize: '13px' }} />
            {!isMobile && <span style={{ fontSize: '11px' }}>Add to Library</span>}
          </button>
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

      {/* Viewer body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#1a1a1a' }}>
        {file.type === 'pdf' && (
          <iframe
            src={file.url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={file.name}
          />
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
      </div>
    </div>
  )
}

function btnStyle(bg, color) {
  return {
    padding: '6px 10px', borderRadius: '8px', border: '0.5px solid var(--color-border-secondary)',
    background: bg, color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
    fontFamily: 'inherit'
  }
}

export default function BookUploadPanel({ isMobile }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [search, setSearch] = useState('')
  const inputRef = useRef()

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    setLoading(true)
    try {
      const res = await fetch('/api/library')
      const data = await res.json()
      setFiles(data.files || [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  async function uploadFile(f) {
    setUploadError('')
    setUploading(true)
    setProgress(0)
    try {
      const form = new FormData()
      form.append('file', f)
      const url = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)) }
        xhr.onload = () => {
          if (xhr.status === 200) resolve(JSON.parse(xhr.responseText))
          else reject(new Error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed'))
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(form)
      })
      await loadFiles()
      setShowUpload(false)
      // select the newly uploaded file
      setSelected({ name: f.name, url: url.url, type: detectTypeFromName(f.name), size: f.size, uploaded: new Date().toISOString() })
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function detectTypeFromName(name) {
    const ext = name.split('.').pop().toLowerCase()
    if (ext === 'pdf') return 'pdf'
    if (['mp4','webm','mov'].includes(ext)) return 'video'
    if (['mp3','wav','m4a'].includes(ext)) return 'audio'
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image'
    return 'file'
  }

  async function handleDelete(file) {
    if (!confirm(`ลบ "${file.name}" ออกจาก R2?\nไม่สามารถกู้คืนได้`)) return
    try {
      await fetch(`/api/library?key=${encodeURIComponent(file.key)}`, { method: 'DELETE' })
      setSelected(null)
      await loadFiles()
    } catch {
      alert('ลบไม่ได้ กรุณาลองใหม่')
    }
  }

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) uploadFile(f)
  }, [])

  const filtered = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  const splitView = !isMobile && selected

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
        borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', flexShrink: 0
      }}>
        <i className="ti ti-books" style={{ fontSize: '16px', color: '#1D9E75' }} />
        <span style={{ fontSize: '14px', fontWeight: '600' }}>Library</span>
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

      {/* Upload zone (collapsible) */}
      {showUpload && (
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', flexShrink: 0 }}>
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => !uploading && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#1D9E75' : 'var(--color-border-secondary)'}`,
              borderRadius: '12px', padding: '20px', textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              background: dragging ? '#E1F5EE' : 'transparent', transition: 'all 0.15s'
            }}
          >
            <input ref={inputRef} type="file" accept=".pdf,.epub,.doc,.docx,.ppt,.pptx,.mp3,.mp4,.jpg,.jpeg,.png,.zip"
              style={{ display: 'none' }} onChange={e => e.target.files[0] && uploadFile(e.target.files[0])} />
            {uploading ? (
              <div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>กำลังอัปโหลด... {progress}%</div>
                <div style={{ background: 'var(--color-border-tertiary)', borderRadius: '99px', height: '5px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: '#1D9E75', borderRadius: '99px', transition: 'width 0.2s' }} />
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                <i className="ti ti-cloud-upload" style={{ fontSize: '20px', display: 'block', marginBottom: '6px', color: '#1D9E75' }} />
                วางไฟล์ที่นี่ หรือคลิกเพื่อเลือก — PDF, EPUB, DOCX, MP3, MP4, ZIP (สูงสุด 200MB)
              </div>
            )}
          </div>
          {uploadError && <div style={{ marginTop: '8px', fontSize: '12px', color: '#DC2626' }}>{uploadError}</div>}
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* File list */}
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
                      </div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Viewer */}
        {selected && (
          <FileViewer
            file={selected}
            onClose={() => setSelected(null)}
            onDelete={handleDelete}
            isMobile={isMobile}
          />
        )}

        {/* Empty viewer placeholder (desktop only) */}
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
