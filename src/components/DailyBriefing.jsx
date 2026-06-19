// src/components/DailyBriefing.jsx
import { useMemo } from 'react'

function extractUrls(text) {
  if (!text) return { clean: '', urls: [] }
  const urls = []
  const clean = text
    .replace(/https?:\/\/[^\s|]+/g, m => { urls.push(m.replace(/[|.,)]+$/, '')); return '' })
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { clean, urls }
}

function urlLabel(url) {
  if (/maps\.google|goo\.gl\/maps/i.test(url)) return '🗺 Maps'
  if (/notes\.uraree|notion\.so/i.test(url)) return '📝 Note'
  try { return `🔗 ${new URL(url).hostname.replace('www.', '')}` }
  catch { return '🔗 Link' }
}

function today() { return new Date().toISOString().slice(0, 10) }

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
}

function getTaskDate(task) {
  return task.start_date || task.due_date || (isIsoDate(task.due_label) ? task.due_label : null)
}

function formatDate(d) {
  if (!d) return ''
  const diff = Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000)
  if (diff === 0) return 'วันนี้'
  if (diff === 1) return 'พรุ่งนี้'
  if (diff === 2) return 'มะรืน'
  if (diff > 0 && diff <= 7) return `+${diff}วัน`
  return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'อรุณสวัสดิ์ ☀️'
  if (h < 17) return 'สวัสดีตอนบ่าย 🌤'
  return 'สวัสดีตอนเย็น 🌙'
}

export default function DailyBriefing({ todos, onClose, onDeleteTodo }) {
  const todayStr = today()
  const isMobile = window.innerWidth <= 640

  const { appointments, tasks } = useMemo(() => {
    const pending = todos.filter(t => !t.done)
    const seen = new Set()
    const appointments = pending
      .filter(t => t.item_type === 'appointment' && t.start_date >= todayStr)
      .sort((a, b) => ((a.start_date || '') + (a.start_time || '')).localeCompare((b.start_date || '') + (b.start_time || '')))
      .filter(t => { const k = `${t.start_date}|${t.text}`; if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 5)
    const tasks = pending
      .filter(t => {
        if (t.item_type === 'appointment' || t.item_type === 'health') return false
        const taskDate = getTaskDate(t)
        return taskDate ? taskDate === todayStr : (t.due_label === 'today' || t.section === 'today')
      })
      .slice(0, 6)
    return { appointments, tasks }
  }, [todos])

  const totalPending = todos.filter(t => !t.done).length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: isMobile ? '18px 18px 0 0' : '18px',
          width: '100%',
          maxWidth: isMobile ? '100%' : '520px',
          maxHeight: isMobile ? '88vh' : '85vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          padding: isMobile ? '12px 16px 36px' : '24px 24px 20px',
          position: 'relative',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.15)',
        }}
      >
        {/* drag handle */}
        {isMobile && (
          <div style={{ width: '32px', height: '4px', borderRadius: '2px', background: 'var(--color-border-secondary)', margin: '0 auto 16px' }} />
        )}

        {/* close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: isMobile ? '12px' : '16px', right: '16px',
          width: '30px', height: '30px', borderRadius: '50%',
          border: '0.5px solid var(--color-border-secondary)',
          background: 'var(--color-background-secondary)',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'
        }}>
          <i className="ti ti-x" />
        </button>

        {/* header */}
        <div style={{ paddingRight: '40px', marginBottom: '16px' }}>
          <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '600' }}>{greet()}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
            {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
            {totalPending > 0 && ` · ${totalPending} รายการ`}
          </div>
        </div>

        {/* appointments */}
        {appointments.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              📍 นัดหมาย
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {appointments.map(a => {
                const { clean: cleanText, urls: textUrls } = extractUrls(a.text)
                const { clean: cleanLoc, urls: locUrls } = extractUrls(a.location)
                const allUrls = [...new Set([...textUrls, ...locUrls])]
                return (
                  <div key={a.id} style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: a.start_date === todayStr ? '#E1F5EE' : 'var(--color-background-secondary)',
                    border: `0.5px solid ${a.start_date === todayStr ? '#9FE1CB' : 'var(--color-border-tertiary)'}`,
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    boxSizing: 'border-box', width: '100%', overflow: 'hidden',
                  }}>
                    {/* date badge */}
                    <div style={{
                      flexShrink: 0, textAlign: 'center',
                      padding: '4px 6px', borderRadius: '8px', minWidth: '44px',
                      background: a.start_date === todayStr ? '#1D9E75' : 'var(--color-background-primary)',
                      color: a.start_date === todayStr ? 'white' : 'var(--color-text-secondary)',
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: '600' }}>{formatDate(a.start_date)}</div>
                      {a.start_time && <div style={{ fontSize: '12px', fontWeight: '700' }}>{a.start_time}</div>}
                    </div>

                    {/* content */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{
                        fontSize: '13px', fontWeight: '500',
                        color: 'var(--color-text-primary)',
                        wordBreak: 'break-word', overflowWrap: 'break-word',
                        lineHeight: 1.5,
                        marginBottom: (allUrls.length || cleanLoc) ? '6px' : 0,
                      }}>
                        {cleanText || a.text}
                      </div>
                      {cleanLoc && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: allUrls.length ? '6px' : 0 }}>
                          <i className="ti ti-map-pin" style={{ fontSize: '10px' }} /> {cleanLoc}
                        </div>
                      )}
                      {allUrls.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {allUrls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                padding: '4px 10px', borderRadius: '20px',
                                background: '#085041', color: 'white',
                                fontSize: '11px', fontWeight: '500',
                                textDecoration: 'none', whiteSpace: 'nowrap',
                              }}>
                              {urlLabel(url)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* tasks */}
        {tasks.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              ✅ งานวันนี้
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {tasks.map(t => (
                <div key={t.id} style={{
                  padding: '9px 10px 9px 12px', borderRadius: '10px',
                  background: 'var(--color-background-secondary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  boxSizing: 'border-box', overflow: 'hidden',
                }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
                    background: t.priority === 'high' ? '#E53E3E' : t.priority === 'med' ? '#DD6B20' : '#A0AEC0' }} />
                  <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', flex: 1, minWidth: 0,
                    wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    {t.text}
                  </div>
                  {onDeleteTodo && (
                    <button
                      type="button"
                      aria-label={`Delete ${t.text}`}
                      title="Delete"
                      onClick={async e => {
                        e.stopPropagation()
                        await onDeleteTodo(t.id)
                      }}
                      style={{
                        minWidth: '58px',
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '0.5px solid #F3B4B4',
                        background: '#FCEBEB',
                        color: '#A32D2D',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        fontFamily: 'inherit',
                        flexShrink: 0
                      }}
                    >
                      <i className="ti ti-trash" style={{ fontSize: '13px' }} />
                      ลบ
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {appointments.length === 0 && tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-tertiary)', fontSize: '14px' }}>
            ไม่มีกำหนดการวันนี้ 🎉
          </div>
        )}

        <button onClick={onClose} style={{
          marginTop: '16px', width: '100%',
          padding: isMobile ? '13px' : '11px',
          background: '#1D9E75', color: 'white',
          border: 'none', borderRadius: '12px',
          fontSize: '14px', fontWeight: '500',
          cursor: 'pointer', fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}>
          เริ่มทำงาน →
        </button>
      </div>
    </div>
  )
}
