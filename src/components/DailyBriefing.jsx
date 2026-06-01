// src/components/DailyBriefing.jsx
// Landing overlay after login — shows upcoming appointments + today's tasks

import { useMemo } from 'react'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d - new Date(today() + 'T00:00:00')) / 86400000)
  if (diff === 0) return 'วันนี้'
  if (diff === 1) return 'พรุ่งนี้'
  if (diff === 2) return 'มะรืนนี้'
  if (diff > 0 && diff <= 7) return `อีก ${diff} วัน`
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'อรุณสวัสดิ์ ☀️'
  if (h < 17) return 'สวัสดีตอนบ่าย 🌤'
  return 'สวัสดีตอนเย็น 🌙'
}

export default function DailyBriefing({ todos, onClose }) {
  const todayStr = today()

  const { appointments, tasks } = useMemo(() => {
    const pending = todos.filter(t => !t.done)

    const appointments = pending
      .filter(t => t.item_type === 'appointment' && t.start_date >= todayStr)
      .sort((a, b) => {
        const da = (a.start_date || '') + (a.start_time || '')
        const db = (b.start_date || '') + (b.start_time || '')
        return da.localeCompare(db)
      })
      .slice(0, 6)

    const tasks = pending
      .filter(t => t.item_type !== 'appointment' && (t.due_label === 'today' || t.due_date === todayStr || t.section === 'today'))
      .slice(0, 8)

    return { appointments, tasks }
  }, [todos])

  const totalPending = todos.filter(t => !t.done).length

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-background-primary)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
          padding: '28px 28px 24px',
          position: 'relative'
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            width: '32px', height: '32px', borderRadius: '50%',
            border: '0.5px solid var(--color-border-secondary)',
            background: 'var(--color-background-secondary)',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer', fontSize: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <i className="ti ti-x" />
        </button>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '22px', fontWeight: '600', marginBottom: '4px' }}>
            {greet()}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
            {new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {totalPending > 0 && ` · ${totalPending} รายการรออยู่`}
          </div>
        </div>

        {/* Appointments */}
        {appointments.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              📍 นัดหมายที่ใกล้มาถึง
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {appointments.map(a => (
                <div
                  key={a.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
                    background: a.start_date === todayStr ? '#E1F5EE' : 'var(--color-background-secondary)',
                    border: `0.5px solid ${a.start_date === todayStr ? '#9FE1CB' : 'var(--color-border-tertiary)'}`,
                    display: 'flex', alignItems: 'center', gap: '12px'
                  }}
                >
                  <div style={{
                    minWidth: '52px',
                    textAlign: 'center',
                    padding: '6px 8px',
                    borderRadius: '10px',
                    background: a.start_date === todayStr ? '#1D9E75' : 'var(--color-background-primary)',
                    color: a.start_date === todayStr ? 'white' : 'var(--color-text-secondary)',
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '500' }}>{formatDate(a.start_date)}</div>
                    {a.start_time && <div style={{ fontSize: '13px', fontWeight: '600' }}>{a.start_time}</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
                      {a.text}
                    </div>
                    {a.location && (
                      <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        <i className="ti ti-map-pin" style={{ fontSize: '11px' }} /> {a.location}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's tasks */}
        {tasks.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
              ✅ งานวันนี้
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {tasks.map(t => (
                <div
                  key={t.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'var(--color-background-secondary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    display: 'flex', alignItems: 'center', gap: '10px'
                  }}
                >
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                    background: t.priority === 'high' ? '#E53E3E' : t.priority === 'med' ? '#DD6B20' : '#718096'
                  }} />
                  <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', flex: 1 }}>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {appointments.length === 0 && tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)', fontSize: '14px' }}>
            ไม่มีกำหนดการวันนี้ 🎉
          </div>
        )}

        {/* Footer */}
        <button
          onClick={onClose}
          style={{
            marginTop: '20px', width: '100%', padding: '12px',
            background: '#1D9E75', color: 'white',
            border: 'none', borderRadius: '12px',
            fontSize: '14px', fontWeight: '500',
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          เริ่มทำงาน →
        </button>
      </div>
    </div>
  )
}
