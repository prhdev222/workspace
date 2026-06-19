import { useEffect, useMemo, useState } from 'react'
import { addProjectItem, createProject, deleteProject, deleteProjectItem, syncProjectToObsidian, updateProject, updateProjectItem } from '../lib/api'
import { EmojiChips } from '../lib/emoji'

function makeSlug(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function getItemTitle(type, item) {
  if (!item) return 'Missing item'
  if (type === 'notes') return item.title || 'Untitled note'
  if (type === 'todo') return item.text || 'Untitled task'
  if (type === 'ideas') return item.content || 'Untitled idea'
  if (type === 'mindmap') return item.title || 'Untitled diagram'
  if (type === 'library') return item.name || item.title || 'Library file'
  if (type === 'custom') return item.title || item.content || 'Custom block'
  return 'Untitled'
}

function getTypeStyle(type) {
  if (type === 'notes') return { label: 'Note', icon: 'ti-file-text', color: '#185FA5', bg: '#E6F1FB' }
  if (type === 'todo') return { label: 'Todo', icon: 'ti-checklist', color: '#854F0B', bg: '#FAEEDA' }
  if (type === 'ideas') return { label: 'Idea', icon: 'ti-bulb', color: '#534AB7', bg: '#EEEDFE' }
  if (type === 'mindmap') return { label: 'Diagram', icon: 'ti-chart-arrows', color: '#0C5A47', bg: '#EAF5F1' }
  if (type === 'library') return { label: 'Library', icon: 'ti-books', color: '#6A4710', bg: '#FBF1DE' }
  return { label: 'Custom', icon: 'ti-pencil', color: '#45607A', bg: '#EEF3F8' }
}

export default function ProjectsPanel({
  projects,
  setProjects,
  entities,
  isMobile = false,
  onNavigate
}) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id || '')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('📚')
  const [isPublic, setIsPublic] = useState(true)
  const [editingProject, setEditingProject] = useState(false)
  const [projectDraft, setProjectDraft] = useState({ title: '', slug: '', description: '', emoji: '📚', is_public: true })
  const [editingItemId, setEditingItemId] = useState('')
  const [itemDraft, setItemDraft] = useState({ title: '', content: '', url: '', display_type: 'text' })
  const [candidateKey, setCandidateKey] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customContent, setCustomContent] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [customDisplayType, setCustomDisplayType] = useState('text')
  const [libraryKey, setLibraryKey] = useState('')
  const [libraryTitle, setLibraryTitle] = useState('')
  const [libraryDescription, setLibraryDescription] = useState('')
  const [projectSyncing, setProjectSyncing] = useState(false)

  useEffect(() => {
    if (!selectedId && projects[0]?.id) setSelectedId(projects[0].id)
    if (selectedId && !projects.some(project => project.id === selectedId)) setSelectedId(projects[0]?.id || '')
  }, [projects, selectedId])

  useEffect(() => {
    if (!selectedProject) return
    setProjectDraft({
      title: selectedProject.title || '',
      slug: selectedProject.slug || '',
      description: selectedProject.description || '',
      emoji: selectedProject.emoji || '📚',
      is_public: Boolean(selectedProject.is_public)
    })
    setEditingProject(false)
    setEditingItemId('')
  }, [selectedId])

  const selectedProject = projects.find(project => project.id === selectedId) || projects[0] || null
  const selectedItems = [...(selectedProject?.items || [])].sort((a, b) => (a.position || 0) - (b.position || 0) || (a.created_at || 0) - (b.created_at || 0))
  const usedKeys = new Set(selectedItems.map(item => `${item.item_type}:${item.item_id}`))
  const projectStats = useMemo(() => ({
    total: projects.length,
    publicCount: projects.filter(project => project.is_public).length,
    privateCount: projects.filter(project => !project.is_public).length,
    syncedCount: projects.filter(project => project.obsidian_synced).length,
    blockCount: projects.reduce((sum, project) => sum + (project.items || []).length, 0)
  }), [projects])

  const candidates = useMemo(() => {
    return [
      ...(entities.notes || []).map(item => ({ key: `notes:${item.id}`, type: 'notes', id: item.id, title: item.title || 'Untitled note' })),
      ...(entities.todos || []).map(item => ({ key: `todo:${item.id}`, type: 'todo', id: item.id, title: item.text || 'Untitled task' })),
      ...(entities.ideas || []).map(item => ({ key: `ideas:${item.id}`, type: 'ideas', id: item.id, title: item.content || 'Untitled idea' })),
      ...(entities.mindMaps || []).map(item => ({ key: `mindmap:${item.id}`, type: 'mindmap', id: item.id, title: item.title || 'Untitled diagram' })),
      ...(entities.libraryFiles || []).map(item => ({ key: `library:${item.url}`, type: 'library', id: item.url, title: item.name || 'Library file', file: item }))
    ].filter(item => !usedKeys.has(item.key))
  }, [entities, selectedProject?.id, selectedItems.length])

  const entityMaps = useMemo(() => ({
    notes: new Map((entities.notes || []).map(item => [item.id, item])),
    todo: new Map((entities.todos || []).map(item => [item.id, item])),
    ideas: new Map((entities.ideas || []).map(item => [item.id, item])),
    mindmap: new Map((entities.mindMaps || []).map(item => [item.id, item])),
    library: new Map((entities.libraryFiles || []).map(item => [item.url, item]))
  }), [entities])

  async function handleCreateProject() {
    if (!title.trim()) return
    try {
      const created = await createProject({
        title: title.trim(),
        slug: slug.trim() || makeSlug(title),
        description: description.trim(),
        emoji,
        is_public: isPublic
      })
      setProjects(prev => [created, ...prev])
      setSelectedId(created.id)
      setTitle('')
      setSlug('')
      setDescription('')
      setEmoji('📚')
      setIsPublic(true)
    } catch (e) {
      alert(e.message)
    }
  }

  async function pushProjectToObsidian(projectId, { silent = false } = {}) {
    if (!projectId) return false
    setProjectSyncing(true)
    try {
      const result = await syncProjectToObsidian(projectId)
      setProjects(prev => prev.map(project => project.id === projectId
        ? {
            ...project,
            obsidian_synced: 1,
            obsidian_path: result.path,
            obsidian_sha: result.sha,
            obsidian_synced_at: result.synced_at,
            updated_at: Date.now()
          }
        : project
      ))
      return true
    } catch (e) {
      if (!silent) alert(`Push Project to Obsidian failed: ${e.message}`)
      return false
    } finally {
      setProjectSyncing(false)
    }
  }

  async function maybeAutoSyncProject(projectId, enabled = selectedProject?.obsidian_auto_sync) {
    if (!enabled) return false
    return pushProjectToObsidian(projectId)
  }

  async function handleAddItem() {
    if (!selectedProject || !candidateKey) return
    const separator = candidateKey.indexOf(':')
    const itemType = candidateKey.slice(0, separator)
    const itemId = candidateKey.slice(separator + 1)
    const libraryFile = itemType === 'library' ? entityMaps.library.get(itemId) : null
    try {
      const item = await addProjectItem(selectedProject.id, {
        item_type: itemType,
        item_id: itemId,
        title: libraryFile?.name || '',
        url: libraryFile?.url || '',
        display_type: libraryFile?.type || ''
      })
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, items: [...(project.items || []), item], updated_at: Date.now() }
        : project
      ))
      setCandidateKey('')
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleAddCustomItem() {
    if (!selectedProject || (!customTitle.trim() && !customContent.trim() && !customUrl.trim())) return
    try {
      const item = await addProjectItem(selectedProject.id, {
        item_type: 'custom',
        title: customTitle.trim(),
        content: customContent.trim(),
        url: customUrl.trim(),
        display_type: customDisplayType
      })
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, items: [...(project.items || []), item], updated_at: Date.now() }
        : project
      ))
      setCustomTitle('')
      setCustomContent('')
      setCustomUrl('')
      setCustomDisplayType('text')
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleAddLibraryItem() {
    if (!selectedProject || !libraryKey) return
    const file = entityMaps.library.get(libraryKey)
    if (!file) return
    try {
      const item = await addProjectItem(selectedProject.id, {
        item_type: 'library',
        item_id: file.url,
        title: libraryTitle.trim() || file.name,
        content: libraryDescription.trim(),
        url: file.url,
        display_type: file.type
      })
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, items: [...(project.items || []), item], updated_at: Date.now() }
        : project
      ))
      setLibraryKey('')
      setLibraryTitle('')
      setLibraryDescription('')
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleRemoveItem(itemId) {
    try {
      await deleteProjectItem(itemId)
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, items: (project.items || []).filter(item => item.id !== itemId), updated_at: Date.now() }
        : project
      ))
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject || !confirm(`Delete project "${selectedProject.title}"? The original notes, todos, ideas, and diagrams will stay.`)) return
    try {
      await deleteProject(selectedProject.id)
      setProjects(prev => prev.filter(project => project.id !== selectedProject.id))
      setSelectedId('')
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleToggleVisibility() {
    if (!selectedProject) return
    const nextPublic = !selectedProject.is_public
    try {
      await updateProject(selectedProject.id, { is_public: nextPublic })
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, is_public: nextPublic, updated_at: Date.now() }
        : project
      ))
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleSaveProjectDetails() {
    if (!selectedProject || !projectDraft.title.trim()) return
    try {
      const payload = {
        title: projectDraft.title.trim(),
        slug: projectDraft.slug.trim() || makeSlug(projectDraft.title),
        description: projectDraft.description.trim(),
        emoji: projectDraft.emoji || '📚',
        is_public: projectDraft.is_public
      }
      const result = await updateProject(selectedProject.id, payload)
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, ...payload, updated_at: result.updated_at || Date.now() }
        : project
      ))
      setEditingProject(false)
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleSyncProject() {
    if (!selectedProject) return
    await pushProjectToObsidian(selectedProject.id)
  }

  async function handleToggleProjectAutoSync() {
    if (!selectedProject) return
    const nextValue = !selectedProject.obsidian_auto_sync
    try {
      const result = await updateProject(selectedProject.id, { obsidian_auto_sync: nextValue })
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? { ...project, obsidian_auto_sync: nextValue, updated_at: result.updated_at || Date.now() }
        : project
      ))
      if (nextValue) {
        await pushProjectToObsidian(selectedProject.id)
      }
    } catch (e) {
      alert(`Auto-sync update failed: ${e.message}`)
    }
  }

  function startEditingItem(item, entity) {
    setEditingItemId(item.id)
    setItemDraft({
      title: item.title || getItemTitle(item.item_type, entity),
      content: item.content || '',
      url: item.url || item.item_id || '',
      display_type: item.display_type || (item.item_type === 'library' ? entity?.type || 'image' : 'text')
    })
  }

  async function handleSaveItem(itemId) {
    if (!selectedProject || !itemId) return
    try {
      const payload = {
        title: itemDraft.title.trim(),
        content: itemDraft.content.trim(),
        url: itemDraft.url.trim(),
        display_type: itemDraft.display_type
      }
      await updateProjectItem(itemId, payload)
      setProjects(prev => prev.map(project => project.id === selectedProject.id
        ? {
            ...project,
            items: (project.items || []).map(item => item.id === itemId ? { ...item, ...payload } : item),
            updated_at: Date.now()
          }
        : project
      ))
      setEditingItemId('')
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(e.message)
    }
  }

  async function moveItem(index, direction) {
    if (!selectedProject) return
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= selectedItems.length) return
    const nextItems = [...selectedItems]
    const [moved] = nextItems.splice(index, 1)
    nextItems.splice(nextIndex, 0, moved)
    const positioned = nextItems.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }))

    setProjects(prev => prev.map(project => project.id === selectedProject.id
      ? { ...project, items: positioned, updated_at: Date.now() }
      : project
    ))

    try {
      await Promise.all(positioned.map(item => updateProjectItem(item.id, { position: item.position })))
      await maybeAutoSyncProject(selectedProject.id)
    } catch (e) {
      alert(`Move failed: ${e.message}`)
    }
  }

  const publicUrl = selectedProject ? `${window.location.origin}/${selectedProject.slug}` : ''

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 14px 28px' : '22px 26px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>
            Knowledge Projects
          </div>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: isMobile ? '23px' : '28px', fontWeight: '500', margin: 0 }}>
            Publish a project page
          </h2>
        </div>
        {selectedProject && (
          <a
            href={`/${selectedProject.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '9px 13px',
              borderRadius: '10px',
              background: '#1D9E75',
              color: 'white',
              textDecoration: 'none',
              fontSize: '12px',
              fontWeight: '600',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="ti ti-world" /> Open public page
          </a>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))',
        gap: '10px',
        marginBottom: '16px'
      }}>
        {[
          { label: 'Projects', value: projectStats.total, icon: 'ti-stack-2', color: '#185FA5', bg: '#E6F1FB' },
          { label: 'Public', value: projectStats.publicCount, icon: 'ti-world', color: '#0C5A47', bg: '#EAF5F1' },
          { label: 'Private', value: projectStats.privateCount, icon: 'ti-lock', color: '#45607A', bg: '#EEF3F8' },
          { label: 'Synced', value: projectStats.syncedCount, icon: 'ti-brand-obsidian', color: '#6A4710', bg: '#FBF1DE' },
          { label: 'Blocks', value: projectStats.blockCount, icon: 'ti-layout-grid', color: '#854F0B', bg: '#FAEEDA' }
        ].map(card => (
          <div key={card.label} style={{
            padding: '12px',
            borderRadius: '12px',
            border: '0.5px solid var(--color-border-secondary)',
            background: 'var(--color-background-primary)',
            minWidth: 0
          }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '9px',
              background: card.bg,
              color: card.color,
              marginBottom: '10px'
            }}>
              <i className={`ti ${card.icon}`} />
            </span>
            <div style={{ fontSize: '22px', fontWeight: '700', lineHeight: 1, marginBottom: '4px' }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 360px) minmax(0, 1fr)',
        gap: '16px',
        alignItems: 'start'
      }}>
        <div style={{ display: 'grid', gap: '14px' }}>
          <div style={{ padding: '14px', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', marginBottom: '10px' }}>New project</div>
            <input value={title} onChange={e => { setTitle(e.target.value); if (!slug) setSlug(makeSlug(e.target.value)) }} placeholder="Project title"
              style={inputStyle} />
            <div style={helpTextStyle}>Title is the public page name people will see at the top.</div>
            <input value={slug} onChange={e => setSlug(makeSlug(e.target.value))} placeholder="project-name"
              style={{ ...inputStyle, marginTop: '8px' }} />
            <div style={helpTextStyle}>Slug is the URL name, for example <code>/cat</code> or <code>/anemia</code>.</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Short public description"
              rows={3}
              style={{ ...inputStyle, marginTop: '8px', resize: 'vertical', lineHeight: 1.5 }} />
            <div style={helpTextStyle}>Description explains what this knowledge project is about.</div>
            <div style={{ marginTop: '10px' }}>
              <EmojiChips onPick={setEmoji} compact />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {[true, false].map(value => (
                <button
                  key={value ? 'public' : 'private'}
                  type="button"
                  onClick={() => setIsPublic(value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '9px',
                    border: '0.5px solid var(--color-border-secondary)',
                    background: isPublic === value ? '#E1F5EE' : 'var(--color-background-primary)',
                    color: isPublic === value ? '#085041' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}
                >
                  <i className={`ti ${value ? 'ti-world' : 'ti-lock'}`} /> {value ? 'Public' : 'Private'}
                </button>
              ))}
            </div>
            <button onClick={handleCreateProject} disabled={!title.trim()}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px 12px',
                border: 'none',
                borderRadius: '10px',
                background: title.trim() ? '#1D9E75' : '#B9C5C0',
                color: 'white',
                fontSize: '12px',
                fontWeight: '600',
                cursor: title.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit'
              }}>
              {emoji} Create project
            </button>
          </div>

          <div style={{ padding: '10px', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '2px 4px 8px' }}>Projects</div>
            <div style={{ display: 'grid', gap: '6px' }}>
              {projects.length === 0 ? (
                <div style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>No projects yet.</div>
              ) : projects.map(project => (
                <button key={project.id} onClick={() => setSelectedId(project.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px',
                    borderRadius: '10px',
                    border: '0.5px solid var(--color-border-tertiary)',
                    background: selectedProject?.id === project.id ? '#E1F5EE' : 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '3px' }}>{project.emoji || '📚'} {project.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>/{project.slug} · {(project.items || []).length} blocks</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <span style={{ fontSize: '10px', color: project.is_public ? '#085041' : '#45607A' }}>
                      {project.is_public ? 'Public' : 'Private'}
                    </span>
                    {project.obsidian_synced ? <span style={{ fontSize: '10px', color: '#6A4710' }}>Synced</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {!selectedProject ? (
            <div style={{ padding: '32px 16px', borderRadius: '12px', background: 'var(--color-background-secondary)', color: 'var(--color-text-tertiary)', textAlign: 'center', fontSize: '13px' }}>
              Create a project to start publishing knowledge.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ padding: '16px', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: 'linear-gradient(180deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)' }}>
                {editingProject ? (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <input
                      value={projectDraft.title}
                      onChange={e => setProjectDraft(prev => ({ ...prev, title: e.target.value, slug: prev.slug || makeSlug(e.target.value) }))}
                      placeholder="Project title"
                      style={inputStyle}
                    />
                    <input
                      value={projectDraft.slug}
                      onChange={e => setProjectDraft(prev => ({ ...prev, slug: makeSlug(e.target.value) }))}
                      placeholder="project-name"
                      style={inputStyle}
                    />
                    <textarea
                      value={projectDraft.description}
                      onChange={e => setProjectDraft(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Project description"
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        value={projectDraft.emoji}
                        onChange={e => setProjectDraft(prev => ({ ...prev, emoji: e.target.value || '📚' }))}
                        placeholder="📚"
                        style={{ ...inputStyle, width: '74px', margin: 0 }}
                      />
                      <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '180px' }}>
                        {[true, false].map(value => (
                          <button
                            key={value ? 'project-public' : 'project-private'}
                            type="button"
                            onClick={() => setProjectDraft(prev => ({ ...prev, is_public: value }))}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: '9px',
                              border: '0.5px solid var(--color-border-secondary)',
                              background: projectDraft.is_public === value ? '#E1F5EE' : 'var(--color-background-primary)',
                              color: projectDraft.is_public === value ? '#085041' : 'var(--color-text-secondary)',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}
                          >
                            <i className={`ti ${value ? 'ti-world' : 'ti-lock'}`} /> {value ? 'Public' : 'Private'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '30px', marginBottom: '8px' }}>{selectedProject.emoji || '📚'}</div>
                    <h3 style={{ fontFamily: "'Lora', serif", fontSize: '24px', fontWeight: '500', margin: '0 0 6px' }}>{selectedProject.title}</h3>
                    {selectedProject.description && <p style={{ margin: '0 0 12px', color: 'var(--color-text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>{selectedProject.description}</p>}
                  </>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 8px',
                    borderRadius: '999px',
                    background: selectedProject.is_public ? '#E1F5EE' : '#EEF3F8',
                    color: selectedProject.is_public ? '#085041' : '#45607A',
                    fontSize: '11px',
                    fontWeight: '700'
                  }}>
                    <i className={`ti ${selectedProject.is_public ? 'ti-world' : 'ti-lock'}`} />
                    {selectedProject.is_public ? 'Public' : 'Private'}
                  </span>
                  {selectedProject.obsidian_synced ? (
                    <span style={{ fontSize: '11px', color: '#1D9E75', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <i className="ti ti-cloud-check" /> Synced to {selectedProject.obsidian_path}
                    </span>
                  ) : null}
                  <button onClick={handleToggleProjectAutoSync}
                    style={{ ...secondaryButtonStyle, padding: '4px 8px', background: selectedProject.obsidian_auto_sync ? '#E1F5EE' : 'transparent', color: selectedProject.obsidian_auto_sync ? '#085041' : 'var(--color-text-secondary)' }}>
                    <i className={`ti ${selectedProject.obsidian_auto_sync ? 'ti-toggle-right' : 'ti-toggle-left'}`} />
                    {selectedProject.obsidian_auto_sync ? 'Auto-sync on' : 'Auto-sync off'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <code style={{ fontSize: '12px', padding: '7px 9px', borderRadius: '8px', background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-tertiary)' }}>
                    {publicUrl}
                  </code>
                  <button onClick={() => navigator.clipboard?.writeText(publicUrl)}
                    style={secondaryButtonStyle}>
                    <i className="ti ti-copy" /> Copy
                  </button>
                  <button onClick={handleToggleVisibility}
                    style={secondaryButtonStyle}>
                    <i className={`ti ${selectedProject.is_public ? 'ti-lock' : 'ti-world'}`} />
                    Make {selectedProject.is_public ? 'private' : 'public'}
                  </button>
                  {editingProject ? (
                    <>
                      <button onClick={handleSaveProjectDetails} disabled={!projectDraft.title.trim()}
                        style={{ ...secondaryButtonStyle, background: '#173B33', color: 'white', border: 'none', cursor: projectDraft.title.trim() ? 'pointer' : 'not-allowed' }}>
                        <i className="ti ti-device-floppy" /> Save details
                      </button>
                      <button onClick={() => {
                        setProjectDraft({
                          title: selectedProject.title || '',
                          slug: selectedProject.slug || '',
                          description: selectedProject.description || '',
                          emoji: selectedProject.emoji || '📚',
                          is_public: Boolean(selectedProject.is_public)
                        })
                        setEditingProject(false)
                      }}
                        style={secondaryButtonStyle}>
                        <i className="ti ti-x" /> Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditingProject(true)}
                      style={secondaryButtonStyle}>
                      <i className="ti ti-edit" /> Edit details
                    </button>
                  )}
                  <button onClick={handleSyncProject} disabled={projectSyncing}
                    style={{ ...secondaryButtonStyle, background: projectSyncing ? '#B9C5C0' : '#1D9E75', color: 'white', border: 'none', cursor: projectSyncing ? 'not-allowed' : 'pointer' }}>
                    <i className={`ti ${projectSyncing ? 'ti-loader-2' : 'ti-brand-obsidian'}`} /> {projectSyncing ? 'Pushing…' : 'Push Project to Obsidian'}
                  </button>
                  <button onClick={handleDeleteProject}
                    style={{ ...secondaryButtonStyle, color: '#E24B4A', marginLeft: 'auto' }}>
                    <i className="ti ti-trash" /> Delete project
                  </button>
                </div>
              </div>

              <div style={{ padding: '14px', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '10px' }}>Add saved content</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select value={candidateKey} onChange={e => setCandidateKey(e.target.value)} style={{ ...inputStyle, flex: '1 1 260px', margin: 0 }}>
                    <option value="">Choose note, todo, idea, diagram, or library file</option>
                    {candidates.map(item => {
                      const style = getTypeStyle(item.type)
                      return <option key={item.key} value={item.key}>{style.label}: {item.title}</option>
                    })}
                  </select>
                  <button onClick={handleAddItem} disabled={!candidateKey} style={{
                    ...secondaryButtonStyle,
                    background: candidateKey ? '#173B33' : '#B9C5C0',
                    color: 'white',
                    border: 'none',
                    cursor: candidateKey ? 'pointer' : 'not-allowed'
                  }}>
                    <i className="ti ti-plus" /> Add
                  </button>
                </div>
              </div>

              <div style={{ padding: '14px', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '10px' }}>Write directly on this project</div>
                <input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Section title"
                  style={inputStyle} />
                <textarea value={customContent} onChange={e => setCustomContent(e.target.value)} placeholder="Write extra explanation for this public page"
                  rows={4}
                  style={{ ...inputStyle, marginTop: '8px', resize: 'vertical', lineHeight: 1.5 }} />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <select value={customDisplayType} onChange={e => setCustomDisplayType(e.target.value)} style={{ ...inputStyle, flex: '0 0 130px', margin: 0 }}>
                    <option value="text">Text</option>
                    <option value="link">Link</option>
                    <option value="image">Image</option>
                  </select>
                  <input value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="Optional image/link URL"
                    style={{ ...inputStyle, flex: '1 1 220px', margin: 0 }} />
                </div>
                <button onClick={handleAddCustomItem} style={{ ...secondaryButtonStyle, marginTop: '10px', background: '#173B33', color: 'white', border: 'none' }}>
                  <i className="ti ti-plus" /> Add custom block
                </button>
              </div>

              <div style={{ padding: '14px', borderRadius: '12px', border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '10px' }}>Add from R2 Library</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select value={libraryKey} onChange={e => setLibraryKey(e.target.value)} style={{ ...inputStyle, flex: '1 1 260px', margin: 0 }}>
                    <option value="">Choose a library file</option>
                    {(entities.libraryFiles || []).map(file => (
                      <option key={file.url} value={file.url}>{file.type}: {file.name}</option>
                    ))}
                  </select>
                  <input
                    value={libraryTitle}
                    onChange={e => setLibraryTitle(e.target.value)}
                    placeholder="Display title, optional"
                    style={{ ...inputStyle, flex: '1 1 220px', margin: 0 }}
                  />
                  <textarea
                    value={libraryDescription}
                    onChange={e => setLibraryDescription(e.target.value)}
                    placeholder="Caption or description, optional"
                    rows={2}
                    style={{ ...inputStyle, flex: '1 1 100%', margin: 0, resize: 'vertical', lineHeight: 1.5 }}
                  />
                  <button onClick={handleAddLibraryItem} disabled={!libraryKey} style={{
                    ...secondaryButtonStyle,
                    background: libraryKey ? '#173B33' : '#B9C5C0',
                    color: 'white',
                    border: 'none',
                    cursor: libraryKey ? 'pointer' : 'not-allowed'
                  }}>
                    <i className="ti ti-books" /> Add file
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {selectedItems.length === 0 ? (
                  <div style={{ padding: '22px 14px', borderRadius: '12px', border: '0.5px dashed var(--color-border-secondary)', color: 'var(--color-text-tertiary)', fontSize: '13px', textAlign: 'center' }}>
                    Add notes, todos, ideas, and diagrams to build this public page.
                  </div>
                ) : selectedItems.map((item, index) => {
                  const entity = item.item_type === 'custom' ? item : item.item_type === 'library' ? (entityMaps.library.get(item.item_id) || item) : entityMaps[item.item_type]?.get(item.item_id)
                  const style = getTypeStyle(item.item_type)
                  const itemIsEditable = item.item_type === 'custom' || item.item_type === 'library'
                  const itemTitle = item.item_type === 'custom' || item.item_type === 'library'
                    ? (item.title || getItemTitle(item.item_type, entity))
                    : getItemTitle(item.item_type, entity)
                  return (
                    <div key={item.id} style={{ padding: '12px', borderRadius: '12px', border: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ display: 'grid', gap: '4px', flexShrink: 0 }}>
                        <button onClick={() => moveItem(index, -1)} disabled={index === 0} title="Move up" style={moveButtonStyle(index === 0)}>
                          <i className="ti ti-chevron-up" />
                        </button>
                        <button onClick={() => moveItem(index, 1)} disabled={index === selectedItems.length - 1} title="Move down" style={moveButtonStyle(index === selectedItems.length - 1)}>
                          <i className="ti ti-chevron-down" />
                        </button>
                      </div>
                      <span style={{ padding: '4px 8px', borderRadius: '999px', background: style.bg, color: style.color, fontSize: '11px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                        <i className={`ti ${style.icon}`} /> {style.label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {editingItemId === item.id ? (
                          <div style={{ display: 'grid', gap: '8px' }}>
                            <input
                              value={itemDraft.title}
                              onChange={e => setItemDraft(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="Block title"
                              style={inputStyle}
                            />
                            <textarea
                              value={itemDraft.content}
                              onChange={e => setItemDraft(prev => ({ ...prev, content: e.target.value }))}
                              placeholder="Block description"
                              rows={3}
                              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                            />
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <select
                                value={itemDraft.display_type}
                                onChange={e => setItemDraft(prev => ({ ...prev, display_type: e.target.value }))}
                                style={{ ...inputStyle, flex: '0 0 130px', margin: 0 }}
                              >
                                <option value="text">Text</option>
                                <option value="link">Link</option>
                                <option value="image">Image</option>
                                {item.item_type === 'library' ? <option value="pdf">PDF</option> : null}
                              </select>
                              <input
                                value={itemDraft.url}
                                onChange={e => setItemDraft(prev => ({ ...prev, url: e.target.value }))}
                                placeholder="Image or link URL"
                                style={{ ...inputStyle, flex: '1 1 240px', margin: 0 }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button onClick={() => handleSaveItem(item.id)}
                                style={{ ...secondaryButtonStyle, background: '#173B33', color: 'white', border: 'none' }}>
                                <i className="ti ti-device-floppy" /> Save block
                              </button>
                              <button onClick={() => setEditingItemId('')}
                                style={secondaryButtonStyle}>
                                <i className="ti ti-x" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => {
                              if (item.item_type === 'library') window.open(item.url || item.item_id, '_blank', 'noopener,noreferrer')
                              else if (item.item_type !== 'custom' && entity) onNavigate?.(item.item_type, item.item_id)
                            }}
                              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: entity ? 'pointer' : 'default', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: '13px', lineHeight: 1.5 }}>
                              {itemTitle}
                              {(item.item_type === 'custom' || item.item_type === 'library') && item.content && <div style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginTop: '3px' }}>{item.content.slice(0, 120)}</div>}
                              {item.item_type === 'library' && (item.url || item.item_id) && <div style={{ color: 'var(--color-text-tertiary)', fontSize: '11px', marginTop: '3px' }}>{item.url || item.item_id}</div>}
                            </button>
                            {!itemIsEditable && (
                              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>
                                Edit the original {style.label.toLowerCase()} from its own page.
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {itemIsEditable && editingItemId !== item.id ? (
                        <button onClick={() => startEditingItem(item, entity)} style={{ border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
                          <i className="ti ti-edit" />
                        </button>
                      ) : null}
                      <button onClick={() => handleRemoveItem(item.id)} style={{ border: 'none', background: 'transparent', color: '#E24B4A', cursor: 'pointer', fontSize: '14px' }}>
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '9px 10px',
  border: '0.5px solid var(--color-border-secondary)',
  borderRadius: '9px',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  fontSize: '12px',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box'
}

const secondaryButtonStyle = {
  padding: '8px 11px',
  borderRadius: '9px',
  border: '0.5px solid var(--color-border-secondary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: '600',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px'
}

function moveButtonStyle(disabled = false) {
  return {
    width: '24px',
    height: '24px',
    borderRadius: '7px',
    border: '0.5px solid var(--color-border-secondary)',
    background: disabled ? 'var(--color-background-secondary)' : 'var(--color-background-primary)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px'
  }
}

const helpTextStyle = {
  fontSize: '11px',
  color: 'var(--color-text-tertiary)',
  lineHeight: 1.45,
  marginTop: '5px'
}
