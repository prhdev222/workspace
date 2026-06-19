// src/components/TodoPanel.jsx
import { useEffect, useState } from 'react'
import { createTodo, updateTodo, deleteTodo } from '../lib/api'
import LinkedItemsPanel from './LinkedItemsPanel'
import { EmojiChips } from '../lib/emoji'

const PRIO = {
  high: { bg: '#FCEBEB', color: '#A32D2D' },
  med:  { bg: '#FAEEDA', color: '#854F0B' },
  low:  { bg: '#E1F5EE', color: '#085041' },
}

const TYPE_STYLES = {
  task: { bg: '#EEF3F8', color: '#45607A', label: 'Task', icon: 'ti-checklist' },
  appointment: { bg: '#EAF5F1', color: '#0C5A47', label: 'Appointment', icon: 'ti-calendar-event' },
  health: { bg: '#FDEEF4', color: '#8B2252', label: 'Health', icon: 'ti-heart-rate-monitor' }
}

const HEALTH_QUICK_LOGS = [
  { emoji: '🩸', label: 'Period Start', note: '' },
  { emoji: '🔴', label: 'Period End', note: '' },
  { emoji: '💊', label: 'Medication', note: '' },
  { emoji: '🤒', label: 'Not feeling well', note: '' },
]

function todoMatchesSearch(todo, query) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [todo.text, todo.priority, todo.due_label, todo.section, todo.start_date, todo.due_date, todo.attachment_url]
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

function toIsoDate(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function formatDueLabel(label) {
  if (!label) return 'No date'
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return new Date(`${label}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }
  return label
}

function startOfWeek(date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = (day + 6) % 7
  next.setDate(next.getDate() - diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function getPrimaryDate(todo) {
  return todo.start_date || todo.due_date || (/^\d{4}-\d{2}-\d{2}$/.test(todo.due_label || '') ? todo.due_label : null)
}

function getAgendaSortValue(todo) {
  const date = getPrimaryDate(todo) || '9999-12-31'
  const time = todo.start_time || todo.end_time || '23:59'
  return `${date}T${time}`
}

export default function TodoPanel({ todos, setTodos, isMobile = false, externalSearch = '', selectedTodoId = null, setSelectedTodoId, links = [], setLinks, entities, onNavigate }) {
  const [agendaView, setAgendaView] = useState('today')
  const [agendaDate, setAgendaDate] = useState(toIsoDate())
  const [selectedAgendaItemId, setSelectedAgendaItemId] = useState(null)
  const [newItemType, setNewItemType] = useState('task')
  const [newText, setNewText] = useState('')
  const [newSection, setNewSection] = useState('today')
  const [newPrio, setNewPrio] = useState('med')
  const [newStartDate, setNewStartDate] = useState(toIsoDate())
  const [newDueDate, setNewDueDate] = useState(toIsoDate())
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')
  const [newLocation, setNewLocation] = useState('')
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('')
  const [search, setSearch] = useState(externalSearch)

  const done = todos.filter(t => t.done).length
  const total = todos.length
  const pct = total ? Math.round(done / total * 100) : 0
  const filteredTodos = todos.filter(todo => todoMatchesSearch(todo, search))
  const todayIso = toIsoDate()
  const weekStart = startOfWeek(new Date(`${agendaDate}T00:00:00`))
  const weekDates = Array.from({ length: 7 }, (_, index) => toIsoDate(addDays(weekStart, index)))

  const agendaItems = filteredTodos
    .filter(todo => {
      const itemDate = getPrimaryDate(todo)
      if (!itemDate) return false
      if (agendaView === 'today') return itemDate === todayIso
      if (agendaView === 'date') return itemDate === agendaDate
      return weekDates.includes(itemDate)
    })
    .sort((a, b) => getAgendaSortValue(a).localeCompare(getAgendaSortValue(b)))

  const calendarBase = agendaView === 'today'
    ? new Date(`${todayIso}T00:00:00`)
    : new Date(`${agendaDate}T00:00:00`)
  const calendarStart = startOfWeek(calendarBase)
  const calendarDays = Array.from({ length: 35 }, (_, index) => {
    const date = addDays(calendarStart, index)
    const iso = toIsoDate(date)
    const items = filteredTodos.filter(todo => getPrimaryDate(todo) === iso)
    const hasAppointment = items.some(todo => todo.item_type === 'appointment')
    const hasHealth = items.some(todo => todo.item_type === 'health')
    const hasTask = items.some(todo => todo.item_type !== 'appointment' && todo.item_type !== 'health')
    return { iso, day: date.getDate(), inMonth: date.getMonth() === calendarBase.getMonth(), items, hasAppointment, hasHealth, hasTask }
  })

  useEffect(() => {
    setSearch(externalSearch)
  }, [externalSearch])

  useEffect(() => {
    setSelectedAgendaItemId(agendaItems[0]?.id || null)
  }, [agendaView, agendaDate, filteredTodos.length])

  async function toggle(todo) {
    try {
      await updateTodo(todo.id, { done: !todo.done })
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: !t.done } : t))
    } catch (e) { alert(e.message) }
  }

  async function add() {
    if (!newText.trim()) return
    try {
      const created = await createTodo({
        text: newText.trim(),
        item_type: newItemType,
        priority: newPrio,
        start_date: newStartDate || null,
        due_date: newDueDate || null,
        start_time: newItemType === 'appointment' ? (newStartTime || null) : null,
        end_time: newItemType === 'appointment' ? (newEndTime || null) : null,
        location: newItemType === 'appointment' ? newLocation.trim() : '',
        due_label: newDueDate || 'today',
        attachment_url: newAttachmentUrl.trim(),
        section: newSection
      })
      setTodos(prev => [created, ...prev])
      setNewText('')
      setNewLocation('')
      setNewAttachmentUrl('')
    } catch (e) { alert(e.message) }
  }

  async function quickLog({ emoji, label }) {
    try {
      const created = await createTodo({
        text: `${emoji} ${label}`,
        item_type: 'health',
        priority: 'med',
        start_date: todayIso,
        due_date: todayIso,
        due_label: todayIso,
        section: 'today'
      })
      setTodos(prev => [created, ...prev])
    } catch (e) { alert(e.message) }
  }

  function insertEmoji(emoji) {
    setNewText(prev => prev ? `${prev} ${emoji}` : `${emoji} `)
  }

  async function remove(id) {
    try {
      await deleteTodo(id)
      setTodos(prev => prev.filter(t => t.id !== id))
    } catch (e) { alert(e.message) }
  }

  async function updateDueDate(todo, dueLabel) {
    try {
      await updateTodo(todo.id, { due_label: dueLabel, due_date: dueLabel || null })
      setTodos(prev => prev.map(item => item.id === todo.id ? { ...item, due_label: dueLabel, due_date: dueLabel } : item))
    } catch (e) { alert(e.message) }
  }

  function dateRangeText(todo) {
    const start = todo.start_date ? formatDueLabel(todo.start_date) : null
    const due = todo.due_date ? formatDueLabel(todo.due_date) : formatDueLabel(todo.due_label)
    if (start && due) return `${start} -> ${due}`
    if (due) return due
    return 'No date'
  }

  function timeRangeText(todo) {
    if (!todo.start_time && !todo.end_time) return ''
    if (todo.start_time && todo.end_time) return `${todo.start_time} - ${todo.end_time}`
    return todo.start_time || todo.end_time || ''
  }

  function agendaEmptyText() {
    if (agendaView === 'today') return 'No tasks or appointments scheduled for today.'
    if (agendaView === 'date') return 'No tasks or appointments on this date.'
    return 'No tasks or appointments in this week.'
  }

  function Section({ label, items }) {
    if (!items.length) return null
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontSize: '11px', fontWeight: '500', color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          {label}
          <div style={{ flex: 1, height: '0.5px', background: 'var(--color-border-tertiary)' }} />
        </div>
        {items.map(t => {
          const typeStyle = TYPE_STYLES[t.item_type] || TYPE_STYLES.task
          return (
          <div key={t.id}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px',
            borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)',
            background: selectedTodoId === t.id ? '#F8FCFA' : 'var(--color-background-primary)', marginBottom: '6px',
            opacity: t.done ? 0.55 : 1
          }}
          onClick={() => setSelectedTodoId?.(t.id)}>
            <div onClick={e => { e.stopPropagation(); toggle(t) }} style={{
              width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, marginTop: '1px',
              border: `1.5px solid ${t.done ? '#1D9E75' : t.priority === 'high' ? '#E24B4A' : 'var(--color-border-secondary)'}`,
              background: t.done ? '#1D9E75' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}>
              {t.done && <i className="ti ti-check" style={{ color: 'white', fontSize: '10px' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '2px'
              }}>
                <span style={{
                  fontSize: '10px',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  fontWeight: '600',
                  background: typeStyle.bg,
                  color: typeStyle.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <i className={`ti ${typeStyle.icon}`} style={{ fontSize: '11px' }} />
                  {typeStyle.label}
                </span>
              </div>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-primary)',
                textDecoration: t.done ? 'line-through' : 'none'
              }}>{t.text}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', position: 'relative' }}>
                  <i className="ti ti-calendar" style={{ fontSize: '12px' }} />
                  {dateRangeText(t)}
                  <input
                    type="date"
                    value={/^\d{4}-\d{2}-\d{2}$/.test(t.due_date || t.due_label || '') ? (t.due_date || t.due_label) : ''}
                    onChange={e => updateDueDate(t, e.target.value || 'today')}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                </label>
                <span style={{
                  fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: '500',
                  background: PRIO[t.priority]?.bg, color: PRIO[t.priority]?.color
                }}>{t.priority}</span>
                {t.item_type === 'appointment' && timeRangeText(t) && (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <i className="ti ti-clock-hour-4" style={{ fontSize: '12px' }} />
                    {timeRangeText(t)}
                  </span>
                )}
              </div>
              {t.item_type === 'appointment' && t.location && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className="ti ti-map-pin" style={{ fontSize: '11px' }} />
                  {t.location}
                </div>
              )}
              {t.attachment_url && (
                <a
                  href={t.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '6px',
                    fontSize: '11px',
                    color: '#1D9E75',
                    textDecoration: 'none'
                  }}
                >
                  <i className="ti ti-link" style={{ fontSize: '11px' }} />
                  Attachment
                </a>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); remove(t.id) }} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '13px', opacity: 0.5 }}>
              <i className="ti ti-trash" />
            </button>
          </div>
          {selectedTodoId === t.id && (
            <LinkedItemsPanel
              sourceType="todo"
              sourceId={t.id}
              links={links}
              setLinks={setLinks}
              entities={entities}
              onNavigate={onNavigate}
              compact
            />
          )}
          </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px 14px 24px' : '20px 24px', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? '18px' : '20px', fontWeight: '500' }}>To-Do List</h2>
        <span style={{ fontSize: '12px', color: '#1D9E75', fontWeight: '500' }}>{done} / {total} done · {pct}%</span>
      </div>

      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <i
          className="ti ti-search"
          style={{
            position: 'absolute',
            left: '11px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)'
          }}
        />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks, due date, or priority"
          style={{
            width: '100%',
            padding: '9px 12px 9px 32px',
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

      <div style={{ height: '4px', background: 'var(--color-background-tertiary)', borderRadius: '2px', marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#1D9E75', borderRadius: '2px', transition: 'width 0.3s' }} />
      </div>

      <div style={{ marginBottom: '22px', padding: '14px', borderRadius: '16px', border: '0.5px solid var(--color-border-secondary)', background: 'linear-gradient(180deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Agenda View
            </div>
            <div style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? '18px' : '20px', color: 'var(--color-text-primary)' }}>
              Calendar and schedule
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['today', 'date', 'weekly'].map(view => (
              <button
                key={view}
                onClick={() => setAgendaView(view)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '999px',
                  border: '0.5px solid var(--color-border-secondary)',
                  background: agendaView === view ? '#E1F5EE' : 'var(--color-background-primary)',
                  color: agendaView === view ? '#085041' : 'var(--color-text-secondary)',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                {view}
              </button>
            ))}
          </div>
        </div>

        {agendaView !== 'today' && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '10px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', fontSize: '12px', color: 'var(--color-text-primary)' }}>
              <i className="ti ti-calendar-search" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
              <input
                type="date"
                value={agendaDate}
                onChange={e => setAgendaDate(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-primary)',
                  fontFamily: 'inherit',
                  fontSize: '12px'
                }}
              />
            </label>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 340px) 1fr', gap: '14px', alignItems: 'start' }}>
          <div style={{ padding: '12px', borderRadius: '14px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '8px' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--color-text-tertiary)', fontWeight: '600' }}>{day}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
              {calendarDays.map(day => {
                const isSelected = (agendaView === 'today' ? todayIso : agendaDate) === day.iso
                return (
                  <button
                    key={day.iso}
                    onClick={() => {
                      setAgendaDate(day.iso)
                      setSelectedAgendaItemId(day.items[0]?.id || null)
                      if (agendaView === 'today') setAgendaView('date')
                    }}
                    style={{
                      minHeight: '46px',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid #1D9E75' : '0.5px solid var(--color-border-tertiary)',
                      background: isSelected
                        ? 'linear-gradient(180deg, #E1F5EE 0%, #CFF0E4 100%)'
                        : day.hasAppointment
                          ? 'linear-gradient(180deg, #EEF8F4 0%, #E4F3ED 100%)'
                          : day.hasTask
                            ? 'linear-gradient(180deg, #F9F4E9 0%, #F3E9D5 100%)'
                            : 'var(--color-background-secondary)',
                      color: day.inMonth ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                      position: 'relative',
                      padding: '6px 4px',
                      fontFamily: 'inherit',
                      boxShadow: isSelected ? '0 10px 24px rgba(29, 158, 117, 0.16)' : 'none',
                      transform: isSelected ? 'translateY(-1px)' : 'none'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: isSelected ? '700' : '500' }}>{day.day}</div>
                    <div style={{ fontSize: '11px', marginTop: '4px', lineHeight: 1 }}>
                      {day.hasHealth ? '🩸' : day.hasAppointment && day.hasTask ? '✨' : day.hasAppointment ? '📅' : day.hasTask ? '✅' : ''}
                    </div>
                    {(day.hasAppointment || day.hasTask || day.hasHealth) && (
                      <span style={{
                        position: 'absolute',
                        right: '6px',
                        bottom: '5px',
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: day.hasHealth ? '#C0507A' : day.hasAppointment ? '#1D9E75' : '#D39B3C'
                      }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: '14px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                {agendaView === 'today' ? 'Today agenda' : agendaView === 'date' ? `Agenda for ${formatDayLabel(agendaDate)}` : `Week of ${formatDayLabel(weekDates[0])}`}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                {agendaItems.length} item{agendaItems.length === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '10px' }}>
              Tap a day in the calendar to focus the schedule. Tap a card to spotlight it.
            </div>
            {agendaItems.length === 0 ? (
              <div style={{ padding: '26px 12px', borderRadius: '12px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', fontSize: '12px', textAlign: 'center' }}>
                {agendaEmptyText()}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {agendaItems.map(item => {
                  const typeStyle = TYPE_STYLES[item.item_type] || TYPE_STYLES.task
                  const isSelected = selectedAgendaItemId === item.id
                  return (
                    <button
                      key={`agenda-${item.id}`}
                      onClick={() => setSelectedAgendaItemId(item.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: '14px',
                        background: isSelected ? `linear-gradient(180deg, ${typeStyle.bg} 0%, #ffffff 100%)` : typeStyle.bg,
                        border: `1px solid ${isSelected ? typeStyle.color : `${typeStyle.color}22`}`,
                        boxShadow: isSelected ? `0 14px 26px ${typeStyle.color}22` : 'none',
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: isSelected ? '5px' : '0px',
                          background: typeStyle.color,
                          transition: 'width 0.2s ease'
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', color: typeStyle.color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {typeStyle.label}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{formatDayLabel(getPrimaryDate(item) || todayIso)}</span>
                        {timeRangeText(item) && <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{timeRangeText(item)}</span>}
                        {isSelected && (
                          <span style={{ fontSize: '10px', color: typeStyle.color, fontWeight: '700' }}>
                            Selected
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: '600' }}>{item.text}</div>
                      {item.location && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '5px' }}>at {item.location}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Section label="Current" items={filteredTodos.filter(t => !t.done && t.section === 'today')} />
      <Section label="Upcoming" items={filteredTodos.filter(t => !t.done && t.section === 'upcoming')} />
      <Section label="Done" items={filteredTodos.filter(t => t.done)} />
      {filteredTodos.length === 0 && (
        <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', fontSize: '12px', marginBottom: '16px' }}>
          No tasks match this search.
        </div>
      )}

      {/* Quick Health Log */}
      <div style={{ marginTop: '16px', marginBottom: '12px', padding: '14px', border: '0.5px solid #F0C8DA', borderRadius: '10px', background: 'linear-gradient(135deg, #FEF6F9 0%, #FDF0F5 100%)' }}>
        <div style={{ fontSize: '11px', fontWeight: '600', color: '#8B2252', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="ti ti-heart-rate-monitor" style={{ fontSize: '13px' }} />
          Quick Health Log
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {HEALTH_QUICK_LOGS.map(item => (
            <button
              key={item.label}
              onClick={() => quickLog(item)}
              style={{
                padding: '8px 14px',
                borderRadius: '999px',
                border: '0.5px solid #F0C8DA',
                background: 'white',
                color: '#8B2252',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'box-shadow 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,34,82,0.15)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <span style={{ fontSize: '14px' }}>{item.emoji}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Add new */}
      <div style={{ marginTop: '16px', padding: '14px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '10px', background: 'var(--color-background-secondary)' }}>
        <div style={{ fontSize: '11px', fontWeight: '500', color: 'var(--color-text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Task</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          {['task', 'appointment'].map(type => {
            const style = TYPE_STYLES[type]
            const active = newItemType === type
            return (
              <button
                key={type}
                onClick={() => setNewItemType(type)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '0.5px solid var(--color-border-secondary)',
                  background: active ? style.bg : 'var(--color-background-primary)',
                  color: active ? style.color : 'var(--color-text-secondary)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <i className={`ti ${style.icon}`} />
                {style.label}
              </button>
            )
          })}
        </div>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder={newItemType === 'appointment' ? 'Appointment title…' : 'Task description…'}
          style={{
            width: '100%', padding: '8px 12px', border: '0.5px solid var(--color-border-secondary)',
            borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
            background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
            outline: 'none', marginBottom: '8px', boxSizing: 'border-box'
          }}
        />
        <div style={{ margin: '0 0 10px' }}>
          <EmojiChips onPick={insertEmoji} compact={isMobile} />
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={newSection} onChange={e => setNewSection(e.target.value)} style={{ padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
            <option value="today">Today</option>
            <option value="upcoming">Upcoming</option>
          </select>
          <select value={newPrio} onChange={e => setNewPrio(e.target.value)} style={{ padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
            <option value="high">High priority</option>
            <option value="med">Medium</option>
            <option value="low">Low</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
            <i className="ti ti-calendar-time" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
            <input
              type="date"
              value={newStartDate}
              onChange={e => setNewStartDate(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '12px',
                minWidth: '120px'
              }}
            />
          </label>
          {newItemType === 'appointment' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
                <i className="ti ti-clock-play" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="time"
                  value={newStartTime}
                  onChange={e => setNewStartTime(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'inherit',
                    fontSize: '12px'
                  }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
                <i className="ti ti-clock-pause" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="time"
                  value={newEndTime}
                  onChange={e => setNewEndTime(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'inherit',
                    fontSize: '12px'
                  }}
                />
              </label>
            </>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit' }}>
            <i className="ti ti-calendar" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }} />
            <input
              type="date"
              value={newDueDate}
              onChange={e => setNewDueDate(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                fontSize: '12px',
                minWidth: '120px'
              }}
            />
          </label>
          {newItemType === 'appointment' && (
            <input
              value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              placeholder="Location"
              style={{
                padding: '5px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '0.5px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
                fontFamily: 'inherit',
                minWidth: isMobile ? '100%' : '160px'
              }}
            />
          )}
          <input
            value={newAttachmentUrl}
            onChange={e => setNewAttachmentUrl(e.target.value)}
            placeholder="Attachment link"
            style={{
              padding: '5px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              minWidth: isMobile ? '100%' : '180px'
            }}
          />
          <button onClick={add} style={{
            padding: '6px 16px', background: '#1D9E75', color: 'white', border: 'none',
            borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit',
            marginLeft: isMobile ? '0' : 'auto',
            width: isMobile ? '100%' : 'auto'
          }}>
            <i className="ti ti-plus" /> Add
          </button>
        </div>
      </div>
    </div>
  )
}
