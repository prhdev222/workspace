// src/components/TodoPanel.jsx
import { useState } from 'react'
import { createTodo, updateTodo, deleteTodo } from '../lib/api'

const PRIO = {
  high: { bg: '#FCEBEB', color: '#A32D2D' },
  med:  { bg: '#FAEEDA', color: '#854F0B' },
  low:  { bg: '#E1F5EE', color: '#085041' },
}

export default function TodoPanel({ todos, setTodos }) {
  const [newText, setNewText] = useState('')
  const [newSection, setNewSection] = useState('today')
  const [newPrio, setNewPrio] = useState('med')
  const [newDue, setNewDue] = useState('today')

  const done = todos.filter(t => t.done).length
  const total = todos.length
  const pct = total ? Math.round(done / total * 100) : 0

  async function toggle(todo) {
    try {
      await updateTodo(todo.id, { done: !todo.done })
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: !t.done } : t))
    } catch (e) { alert(e.message) }
  }

  async function add() {
    if (!newText.trim()) return
    try {
      const created = await createTodo({ text: newText.trim(), priority: newPrio, due_label: newDue, section: newSection })
      setTodos(prev => [created, ...prev])
      setNewText('')
    } catch (e) { alert(e.message) }
  }

  async function remove(id) {
    try {
      await deleteTodo(id)
      setTodos(prev => prev.filter(t => t.id !== id))
    } catch (e) { alert(e.message) }
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
        {items.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px',
            borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)',
            background: 'var(--color-background-primary)', marginBottom: '6px',
            opacity: t.done ? 0.55 : 1
          }}>
            <div onClick={() => toggle(t)} style={{
              width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, marginTop: '1px',
              border: `1.5px solid ${t.done ? '#1D9E75' : t.priority === 'high' ? '#E24B4A' : 'var(--color-border-secondary)'}`,
              background: t.done ? '#1D9E75' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
            }}>
              {t.done && <i className="ti ti-check" style={{ color: 'white', fontSize: '10px' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '13px', color: 'var(--color-text-primary)',
                textDecoration: t.done ? 'line-through' : 'none'
              }}>{t.text}</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <i className="ti ti-calendar" style={{ fontSize: '12px' }} />
                  {t.due_label}
                </span>
                <span style={{
                  fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: '500',
                  background: PRIO[t.priority]?.bg, color: PRIO[t.priority]?.color
                }}>{t.priority}</span>
              </div>
            </div>
            <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '13px', opacity: 0.5 }}>
              <i className="ti ti-trash" />
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontFamily: "'Lora', serif", fontSize: '20px', fontWeight: '500' }}>To-Do List</h2>
        <span style={{ fontSize: '12px', color: '#1D9E75', fontWeight: '500' }}>{done} / {total} done · {pct}%</span>
      </div>

      <div style={{ height: '4px', background: 'var(--color-background-tertiary)', borderRadius: '2px', marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#1D9E75', borderRadius: '2px', transition: 'width 0.3s' }} />
      </div>

      <Section label="Today" items={todos.filter(t => !t.done && t.section === 'today')} />
      <Section label="Upcoming" items={todos.filter(t => !t.done && t.section === 'upcoming')} />
      <Section label="Done" items={todos.filter(t => t.done)} />

      {/* Add new */}
      <div style={{ marginTop: '16px', padding: '14px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '10px', background: 'var(--color-background-secondary)' }}>
        <div style={{ fontSize: '11px', fontWeight: '500', color: 'var(--color-text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Task</div>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Task description…"
          style={{
            width: '100%', padding: '8px 12px', border: '0.5px solid var(--color-border-secondary)',
            borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
            background: 'var(--color-background-primary)', color: 'var(--color-text-primary)',
            outline: 'none', marginBottom: '8px', boxSizing: 'border-box'
          }}
        />
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
          <input value={newDue} onChange={e => setNewDue(e.target.value)} placeholder="Due (e.g. May 20)" style={{ padding: '5px 8px', fontSize: '12px', borderRadius: '6px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'inherit', width: '120px' }} />
          <button onClick={add} style={{
            padding: '6px 16px', background: '#1D9E75', color: 'white', border: 'none',
            borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit',
            marginLeft: 'auto'
          }}>
            <i className="ti ti-plus" /> Add
          </button>
        </div>
      </div>
    </div>
  )
}
