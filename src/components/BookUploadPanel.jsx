import { useState, useRef, useCallback } from 'react'

const DIGITAL_LIBRARY_URL = 'https://digital-library.uraree.com'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function BookUploadPanel({ isMobile }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null) // { url, name, size }
  const [error, setError] = useState('')
  const inputRef = useRef()

  const ACCEPTED = '.pdf,.epub,.doc,.docx,.ppt,.pptx,.mp3,.mp4,.zip'

  async function uploadFile(f) {
    setFile(f)
    setResult(null)
    setError('')
    setUploading(true)
    setProgress(0)

    try {
      const form = new FormData()
      form.append('file', f)

      // Use XHR for progress tracking
      const url = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText)
            resolve(data.url)
          } else {
            const data = JSON.parse(xhr.responseText || '{}')
            reject(new Error(data.error || `Upload failed (${xhr.status})`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(form)
      })

      setResult({ url, name: f.name, size: f.size })
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) uploadFile(f)
  }, [])

  const onDragOver = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  function openInLibrary() {
    const params = new URLSearchParams({ fileUrl: result.url, fileName: result.name })
    window.open(`${DIGITAL_LIBRARY_URL}/admin/books/add?${params}`, '_blank')
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError('')
    setProgress(0)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', maxWidth: '640px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: 'var(--color-text-primary)' }}>
          Library Upload
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
          อัปโหลดไฟล์ขึ้น R2 แล้วเพิ่มหนังสือใน Digital Library
        </p>
      </div>

      {/* Drop zone */}
      {!result && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !uploading && inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#1D9E75' : 'var(--color-border-secondary)'}`,
            borderRadius: '16px',
            padding: '40px 24px',
            textAlign: 'center',
            cursor: uploading ? 'default' : 'pointer',
            background: dragging ? '#E1F5EE' : 'var(--color-background-secondary)',
            transition: 'all 0.15s ease',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            style={{ display: 'none' }}
            onChange={e => e.target.files[0] && uploadFile(e.target.files[0])}
          />

          {uploading ? (
            <>
              <i className="ti ti-loader-2" style={{ fontSize: '32px', color: '#1D9E75', display: 'block', marginBottom: '12px', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                กำลังอัปโหลด {file?.name}
              </div>
              <div style={{ background: 'var(--color-border-tertiary)', borderRadius: '99px', height: '6px', overflow: 'hidden', width: '200px', margin: '0 auto' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: '#1D9E75', borderRadius: '99px', transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>{progress}%</div>
            </>
          ) : (
            <>
              <i className="ti ti-cloud-upload" style={{ fontSize: '36px', color: '#1D9E75', display: 'block', marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                วาง หรือ คลิกเพื่อเลือกไฟล์
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                PDF, EPUB, DOCX, PPTX, MP3, MP4, ZIP — สูงสุด 200MB
              </div>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <i className="ti ti-alert-circle" />
          {error}
          <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: '13px' }}>ลองใหม่</button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ borderRadius: '16px', border: '1px solid var(--color-border-secondary)', overflow: 'hidden' }}>
          {/* Success header */}
          <div style={{ padding: '16px', background: '#E1F5EE', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize: '20px', color: '#1D9E75' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#085041' }}>อัปโหลดสำเร็จ</div>
              <div style={{ fontSize: '11px', color: '#1D9E75' }}>{result.name} · {formatSize(result.size)}</div>
            </div>
            <button onClick={reset} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#1D9E75', padding: '4px' }}>
              <i className="ti ti-x" style={{ fontSize: '16px' }} />
            </button>
          </div>

          {/* URL */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-tertiary)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>R2 URL</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                readOnly
                value={result.url}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-border-secondary)',
                  background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)',
                  fontSize: '11px', fontFamily: 'monospace', outline: 'none'
                }}
              />
              <button
                onClick={() => navigator.clipboard.writeText(result.url)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', cursor: 'pointer', fontSize: '12px', color: 'var(--color-text-secondary)' }}
                title="Copy URL"
              >
                <i className="ti ti-copy" />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: '14px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={openInLibrary}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                background: '#1D9E75', color: 'white', fontSize: '13px', fontWeight: '500',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                fontFamily: 'inherit'
              }}
            >
              <i className="ti ti-books" />
              เพิ่มใน Digital Library
            </button>
            <button
              onClick={reset}
              style={{
                padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)',
                fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              <i className="ti ti-upload" /> อัปโหลดอีก
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
