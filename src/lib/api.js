// src/lib/api.js
// Thin fetch wrapper for all backend API calls

const BASE = '/api'

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(BASE + path, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || res.statusText)
    err.status = res.status
    throw err
  }
  return data
}

// Auth
export const login = (password) => req('POST', '/auth/login', { password })
export const logout = () => req('DELETE', '/auth/login')

// Notes
export const getNotes = () => req('GET', '/notes')
export const createNote = (data) => req('POST', '/notes', data)
export const updateNote = (id, data) => req('PUT', `/notes/${id}`, data)
export const deleteNote = (id) => req('DELETE', `/notes/${id}`)

// Todos
export const getTodos = () => req('GET', '/todos')
export const createTodo = (data) => req('POST', '/todos', data)
export const updateTodo = (id, data) => req('PUT', `/todos/${id}`, data)
export const deleteTodo = (id) => req('DELETE', `/todos/${id}`)

// Ideas
export const getIdeas = () => req('GET', '/ideas')
export const createIdea = (data) => req('POST', '/ideas', data)
export const deleteIdea = (id) => req('DELETE', `/ideas/${id}`)

// Init DB tables (run once)
export const initDb = () => req('GET', '/init')
