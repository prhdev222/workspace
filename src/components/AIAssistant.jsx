// src/components/AIAssistant.jsx
// Floating AI chat — พิมพ์ หรือ กด mic พูดได้เลย (Thai/English)
// สร้าง Note · Todo · Appointment ลง Turso ผ่าน /api/ai-assistant
import { useState, useRef, useEffect, useCallback } from 'react'

const EXAMPLES = [
  'นัดตรวจเลือด พรุ่งนี้ 10 โมง ที่ lab',
  'note BCR-ABL monitoring: ตรวจ PCR ทุก 3 เดือน',
  'todo ส่ง case report ภายในวันศุกร์ priority สูง',
  'appointment grand round จันทร์หน้า 8.00-10.00 ห้องประชุม',
]

const TYPE_META = {
  note:        { bg: '#EEEDFE', color: '#534AB7', icon: 'ti-file-text',      label: 'Note' },
  todo:        { bg: '#FAEEDA', color: '#854F0B', icon: 'ti-checklist',      label: 'To-do' },
  appointment: { bg: '#E1F5EE', color: '#085041', icon: 'ti-calendar-event', label: 'Appointment' },
  clarify:     { bg: '#E6F1FB', color: '#185FA5', icon: 'ti-help-circle',    label: 'ต้องการข้อมูลเพิ่ม' },
  error:       { bg: '#FCEBEB', color: '#A32D2D', icon: 'ti-alert-circle',   label: 'Error' },
}

// ─── useSpeechRecognition hook ────────────────────────────────────────────────
function useSpeechRecognition({ onResult, onError }) {
  const recRef = useRef(null)
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    setSupported(true)

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'th-TH'  // Thai primary; auto-fallback to EN on most browsers

    rec.onresult = e => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('')
      onResult(transcript, e.results[e.results.length - 1].isFinal)
    }
    rec.onerror = e => {
      setListening(false)
      if (e.error !== 'no-speech') onError?.(`Mic error: ${e.error}`)
    }
    rec.onend = () => setListening(false)

    recRef.current = rec
    return () => { rec.abort() }
  }, [])

  const start = useCallback(() => {
    if (!recRef.current || listening) return
    try { recRef.current.start(); setListening(true) } catch {}
  }, [listening])

  const stop = useCallback(() => {
    if (!recRef.current || !listening) return
    recRef.current.stop()
    setListening(false)
  }, [listening])

  return { supported, listening, start, stop }
}

// ─── AIAssistant ──────────────────────────────────────────────────────────────
export default function AIAssistant({ setNotes, setTodos, setView, onNoteCreated, onTodoCreated }) {
  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [pulse, setPulse]     = useState(false)
  const [interimText, setInterimText] = useState('')
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)
  const inputRef  = useRef()
  const bottomRef = useRef()
  const textareaRef = useRef()

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── speech ───────────────────────────────────────────────────────────────────
  const { supported: micSupported, listening, start: startMic, stop: stopMic } = useSpeechRecognition({
    onResult: (text, isFinal) => {
      if (isFinal) {
        setInput(text)
        setInterimText('')
      } else {
        setInterimText(text)
      }
    },
    onError: msg => addSystemMsg(msg, 'error'),
  })

  function toggleMic() {
    if (listening) { stopMic() }
    else { setInput(''); setInterimText(''); startMic() }
  }

  // ── helpers ───────────────────────────────────────────────────────────────────
  function addSystemMsg(text, type = 'error') {
    setMessages(prev => [...prev, { role: 'assistant', type, summary: text, ts: Date.now() }])
  }

  useEffect(() => {
    if (messages.length > 0 && !open) { setPulse(true); setTimeout(() => setPulse(false), 2000) }
  }, [messages.length])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, interimText])

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }, [input])

  // ── send ──────────────────────────────────────────────────────────────────────
  async function send() {
    const text = (input || interimText).trim()
    if (!text || loading) return
    if (listening) stopMic()
    setInput(''); setInterimText('')

    setMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI error')

      setMessages(prev => [...prev, {
        role: 'assistant',
        type: data.type,
        summary: data.summary,
        result: data.result,
        ts: Date.now()
      }])

      // update parent state immediately
      if (data.type === 'note' && data.result) {
        setNotes?.(prev => [data.result, ...prev])
        setView?.('notes')
        onNoteCreated?.(data.result)
      }
      if ((data.type === 'todo' || data.type === 'appointment') && data.result) {
        setTodos?.(prev => [data.result, ...prev])
        setView?.('todo')
        onTodoCreated?.(data.result)
      }
    } catch (e) {
      addSystemMsg(`เกิดข้อผิดพลาด: ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const hasInput = (input || interimText).trim().length > 0
  const assistantCount = messages.filter(m => m.role === 'assistant').length

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes ai-bounce { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(-4px);opacity:1} }
        @keyframes ai-pulse-ring { 0%{box-shadow:0 0 0 0 rgba(29,158,117,.45)} 70%{box-shadow:0 0 0 10px rgba(29,158,117,0)} 100%{box-shadow:0 0 0 0 rgba(29,158,117,0)} }
        @keyframes mic-glow { 0%,100%{box-shadow:0 0 0 0 rgba(226,75,74,.4)} 50%{box-shadow:0 0 0 6px rgba(226,75,74,0)} }
      `}</style>

      {/* ── floating trigger button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="AI Assistant"
        style={{
          position: 'fixed',
          bottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 16px)' : 24,
          right: isMobile ? 16 : 24,
          zIndex: 9980,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: open ? '#173B33' : '#1D9E75',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: pulse
            ? '0 0 0 0 rgba(29,158,117,.4)'
            : '0 4px 18px rgba(29,158,117,.38)',
          animation: pulse ? 'ai-pulse-ring 1s ease-out 2' : 'none',
          transition: 'background .2s, transform .15s',
        }}
      >
        <i className={`ti ${open ? 'ti-x' : 'ti-sparkles'}`}
          style={{ color: 'white', fontSize: '22px', transition: 'all .2s' }} />
        {assistantCount > 0 && !open && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 16, height: 16, borderRadius: '50%',
            background: '#E24B4A', border: '2px solid white',
            fontSize: '9px', color: 'white', fontWeight: '700',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>{assistantCount}</span>
        )}
      </button>

      {/* ── chat panel ── */}
      {open && (
        <div style={isMobile ? {
          position: 'fixed',
          left: 8, right: 8,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
          top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          zIndex: 9979,
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: '20px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        } : {
          position: 'fixed', bottom: 88, right: 24, zIndex: 9979,
          width: 'min(390px, calc(100vw - 32px))',
          maxHeight: 'min(560px, calc(100vh - 110px))',
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: '20px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* header */}
          <div style={{ padding: '14px 16px 12px', background: 'linear-gradient(135deg, #0F6E56 0%, #1D9E75 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 32, height: 32, borderRadius: '10px', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="ti ti-sparkles" style={{ color: 'white', fontSize: '16px' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'white' }}>AI Assistant</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.72)' }}>
                  พิมพ์ หรือ กด 🎙️ พูดได้เลย · Note · Todo · นัด
                </div>
              </div>
              <button onClick={() => setMessages([])} title="ล้าง chat"
                style={{ background: 'rgba(255,255,255,.16)', border: 'none', color: 'white', borderRadius: '8px', padding: '5px 8px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>
                <i className="ti ti-trash" />
              </button>
            </div>

            {/* mic status bar */}
            {listening && (
              <div style={{ marginTop: '10px', padding: '7px 12px', borderRadius: '10px', background: 'rgba(226,75,74,.22)', border: '0.5px solid rgba(226,75,74,.4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E24B4A', animation: 'mic-glow 1s ease-in-out infinite', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,.9)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {interimText || 'กำลังฟัง…'}
                </span>
                <button onClick={stopMic} style={{ background: 'rgba(255,255,255,.2)', border: 'none', color: 'white', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', flexShrink: 0 }}>
                  หยุด
                </button>
              </div>
            )}
          </div>

          {/* messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {messages.length === 0 && !listening && (
              <div style={{ paddingTop: '4px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-sparkles" style={{ fontSize: '13px' }} />
                  ตัวอย่างที่พิมพ์หรือพูดได้:
                </div>
                {EXAMPLES.map((ex, i) => (
                  <button key={i}
                    onClick={() => { setInput(ex); setTimeout(() => inputRef.current?.focus(), 50) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: '6px', borderRadius: '10px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.55 }}>
                    {ex}
                  </button>
                ))}
                {micSupported && (
                  <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
                    <i className="ti ti-microphone" style={{ marginRight: '5px' }} />
                    กดปุ่ม 🎙️ ค้างแล้วพูดเป็นภาษาไทยหรืออังกฤษ — รองรับ Chrome, Edge, Safari
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => {
              if (msg.role === 'user') return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '82%', padding: '9px 13px', background: '#1D9E75', color: 'white', borderRadius: '14px 14px 4px 14px', fontSize: '13px', lineHeight: 1.55 }}>
                    {msg.content}
                  </div>
                </div>
              )

              const meta = TYPE_META[msg.type] || TYPE_META.error
              const created = msg.type && !['error','clarify'].includes(msg.type)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ maxWidth: '88%', padding: '10px 13px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '4px 14px 14px 14px', fontSize: '13px', lineHeight: 1.55 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px', marginBottom: '7px', background: meta.bg, color: meta.color, fontSize: '11px', fontWeight: '600' }}>
                      <i className={`ti ${meta.icon}`} style={{ fontSize: '12px' }} />
                      {meta.label}{created ? ' สร้างแล้ว ✓' : ''}
                    </div>
                    <div style={{ color: 'var(--color-text-primary)' }}>{msg.summary}</div>
                  </div>
                </div>
              )
            })}

            {/* interim speech preview bubble */}
            {listening && interimText && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '82%', padding: '9px 13px', background: 'rgba(29,158,117,.15)', border: '1px dashed #1D9E75', borderRadius: '14px 14px 4px 14px', fontSize: '13px', lineHeight: 1.55, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                  {interimText}
                </div>
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '4px 14px 14px 14px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {[0,1,2].map(n => (
                    <div key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: '#1D9E75', animation: `ai-bounce 1s ease-in-out ${n * 0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* input row */}
          <div style={{ padding: '10px 12px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: '6px', alignItems: 'flex-end' }}>

            {/* mic button */}
            {micSupported && (
              <button
                onClick={toggleMic}
                title={listening ? 'หยุดฟัง' : 'พูดเลย (Thai/EN)'}
                style={{
                  width: 38, height: 38, borderRadius: '12px', border: 'none', flexShrink: 0,
                  background: listening ? '#E24B4A' : 'var(--color-background-secondary)',
                  color: listening ? 'white' : 'var(--color-text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: listening ? 'mic-glow 1s ease-in-out infinite' : 'none',
                  transition: 'all .15s',
                }}
              >
                <i className={`ti ${listening ? 'ti-microphone-off' : 'ti-microphone'}`} style={{ fontSize: '17px' }} />
              </button>
            )}

            {/* textarea */}
            <textarea
              ref={el => { inputRef.current = el; textareaRef.current = el }}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={listening ? 'กำลังฟัง…' : 'บอก AI ว่าอยากสร้างอะไร…'}
              rows={1}
              disabled={listening}
              style={{
                flex: 1, padding: '9px 12px',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: '12px', fontSize: '13px', fontFamily: 'inherit',
                background: listening ? 'var(--color-background-tertiary)' : 'var(--color-background-secondary)',
                color: 'var(--color-text-primary)', outline: 'none',
                resize: 'none', lineHeight: 1.55, maxHeight: '96px', overflowY: 'auto',
                transition: 'background .2s',
              }}
            />

            {/* send button */}
            <button
              onClick={send}
              disabled={!hasInput || loading}
              title="ส่ง (Enter)"
              style={{
                width: 38, height: 38, borderRadius: '12px', border: 'none', flexShrink: 0,
                background: hasInput && !loading ? '#1D9E75' : 'var(--color-background-tertiary)',
                color: hasInput && !loading ? 'white' : 'var(--color-text-tertiary)',
                cursor: hasInput && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .15s',
              }}
            >
              <i className="ti ti-send" style={{ fontSize: '16px' }} />
            </button>
          </div>

          {/* footer hint — desktop only */}
          {!isMobile && (
            <div style={{ padding: '5px 14px 10px', fontSize: '10px', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
              Enter ส่ง · Shift+Enter ขึ้นบรรทัด{micSupported ? ' · 🎙️ พูดไทย/EN ได้' : ''}
            </div>
          )}
        </div>
      )}
    </>
  )
}
