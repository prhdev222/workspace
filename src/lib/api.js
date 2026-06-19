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

// Mind maps
export const getMindMaps = () => req('GET', '/mindmaps')
export const createMindMap = (data) => req('POST', '/mindmaps', data)
export const updateMindMap = (id, data) => req('PUT', `/mindmaps/${id}`, data)
export const deleteMindMap = (id) => req('DELETE', `/mindmaps/${id}`)

// Projects
export const getProjects = () => req('GET', '/projects')
export const createProject = (data) => req('POST', '/projects', data)
export const updateProject = (id, data) => req('PUT', `/projects/${id}`, data)
export const deleteProject = (id) => req('DELETE', `/projects/${id}`)
export const addProjectItem = (projectId, data) => req('POST', `/projects/${projectId}/items`, data)
export const updateProjectItem = (id, data) => req('PUT', `/project-items/${id}`, data)
export const deleteProjectItem = (id) => req('DELETE', `/project-items/${id}`)
export const syncProjectToObsidian = (id) => req('POST', `/projects/${id}/obsidian`)
export const getPublicProject = async (slug) => {
  const res = await fetch(`${BASE}/public/projects/${encodeURIComponent(slug)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || res.statusText)
    err.status = res.status
    throw err
  }
  return data
}
export const getPrivateProject = (slug) => req('GET', `/projects/by-slug/${encodeURIComponent(slug)}`)

// Library
export const getLibraryFiles = async () => {
  const res = await fetch('/api/library', { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || res.statusText)
    err.status = res.status
    throw err
  }
  return data
}

// Links
export const getLinks = (params) => {
  const search = params
    ? `?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null)).toString()}`
    : ''
  return req('GET', `/links${search}`)
}
export const createLink = (data) => req('POST', '/links', data)
export const deleteLink = (id) => req('DELETE', `/links/${id}`)

// Init DB tables (run once)
export const initDb = () => req('GET', '/init')

// Obsidian sync
export const syncToObsidian    = (id) => req('POST',   `/obsidian/${id}`)
export const pullFromObsidian  = (id) => req('GET',    `/obsidian/${id}`)
export const unsyncFromObsidian = (id) => req('DELETE', `/obsidian/${id}`)
