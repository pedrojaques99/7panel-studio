import React, { useEffect, useRef, useState } from 'react'
import { API } from '../lib/api'

function PanelRow({ p, onTogglePanel, onClose }: { p: PanelDef; onTogglePanel: (id: PanelId) => void; onClose: () => void }) {
  return (
    <div
      onClick={() => { onTogglePanel(p.id); onClose() }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
        borderRadius: 10, cursor: 'pointer',
        background: p.visible ? 'rgba(0,184,96,0.07)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!p.visible) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = p.visible ? 'rgba(0,184,96,0.07)' : 'transparent' }}
    >
      <span style={{ fontSize: 'var(--fs-4xl)', width: 28, textAlign: 'center' }}>{p.icon}</span>
      <span style={{ flex: 1, fontSize: 'var(--fs-xl)', color: p.visible ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: p.visible ? 600 : 400 }}>{p.label}</span>
      <span style={{
        fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 5,
        background: p.visible ? 'rgba(0,184,96,0.15)' : 'rgba(255,255,255,0.05)',
        color: p.visible ? '#00b860' : 'rgba(255,255,255,0.25)',
      }}>{p.visible ? 'Open' : 'Closed'}</span>
    </div>
  )
}

export type PanelId =
  | 'keys' | 'mixer' | 'soundboard' | 'obs' | 'briefing'
  | 'ytchat' | 'timer' | 'drone' | 'paul' | 'synth' | 'exporter' | 'converter' | 'looplab' | 'session'

export type PanelDef = {
  id: PanelId
  label: string
  icon: string
  sidebar: boolean   // show toggle in sidebar
  visible: boolean   // currently open
}

type AssetFile = { name: string; path: string }

interface Props {
  panels: PanelDef[]
  onTogglePanel: (id: PanelId) => void
  onChangeSidebar: (id: PanelId, sidebar: boolean) => void
  onClose: () => void
}

export function CommandPalette({ panels, onTogglePanel, onChangeSidebar, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'panels' | 'files' | 'sidebar'>('panels')
  const [assets, setAssets] = useState<AssetFile[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // load assets when switching to files tab
  useEffect(() => {
    if (tab !== 'files') return
    setLoadingAssets(true)
    fetch(`${API}/api/assets/list`)
      .then(r => r.json())
      .then(data => setAssets(Array.isArray(data) ? data : []))
      .catch(() => setAssets([]))
      .finally(() => setLoadingAssets(false))
  }, [tab])

  const q = query.toLowerCase()

  const filteredPanels = panels.filter(p =>
    p.label.toLowerCase().includes(q) || p.icon.includes(q)
  )

  const GROUPS: { label: string; ids: PanelId[] }[] = [
    { label: 'Core',  ids: ['keys', 'mixer', 'soundboard'] },
    { label: 'Live',  ids: ['obs', 'ytchat', 'briefing', 'session', 'timer'] },
    { label: 'Audio', ids: ['drone', 'paul', 'synth', 'looplab'] },
    { label: 'Tools', ids: ['converter', 'exporter'] },
  ]

  const filteredAssets = assets.filter(a =>
    a.name.toLowerCase().includes(q)
  )

  function copyPath(path: string) {
    navigator.clipboard.writeText(path).catch(() => {})
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99990,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
      }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 480, maxHeight: '70vh',
          background: 'linear-gradient(160deg,#242527,#1a1b1d)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          boxShadow: '0 40px 120px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 'var(--fs-3xl)', opacity: 0.4 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === 'files' ? 'Search assets...' : tab === 'sidebar' ? 'Filter panels...' : 'Toggle panels...'}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 'var(--fs-2xl)', fontFamily: "'Outfit', sans-serif",
            }}
          />
          <kbd style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.07)', padding: '3px 7px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)' }}>ESC</kbd>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {([['panels', 'Panels'], ['files', 'Assets'], ['sidebar', 'Sidebar Config']] as const).map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); setQuery('') }} style={{
              flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
              fontSize: 'var(--fs-md)', fontWeight: tab === t ? 700 : 400, letterSpacing: '0.1em', textTransform: 'uppercase',
              background: tab === t ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)',
              borderBottom: tab === t ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent',
              transition: 'all 0.12s',
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* Panels tab */}
          {tab === 'panels' && (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredPanels.length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 'var(--fs-lg)' }}>No panels found</div>
              )}

              {/* Grouped view when no query */}
              {!q && GROUPS.map(group => {
                const groupPanels = group.ids.map(id => panels.find(p => p.id === id)).filter(Boolean) as PanelDef[]
                return (
                  <div key={group.label}>
                    <div style={{ padding: '10px 12px 4px', fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.22)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {group.label}
                    </div>
                    {groupPanels.map(p => <PanelRow key={p.id} p={p} onTogglePanel={onTogglePanel} onClose={onClose} />)}
                  </div>
                )
              })}

              {/* Flat filtered view when searching */}
              {!!q && filteredPanels.map(p => <PanelRow key={p.id} p={p} onTogglePanel={onTogglePanel} onClose={onClose} />)}
            </div>
          )}

          {/* Files tab */}
          {tab === 'files' && (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {loadingAssets && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 'var(--fs-lg)' }}>Loading...</div>
              )}
              {!loadingAssets && filteredAssets.length === 0 && (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 'var(--fs-lg)' }}>
                  {assets.length === 0 ? 'No assets found' : 'No results'}
                </div>
              )}
              {filteredAssets.map(a => {
                const ext = a.name.split('.').pop()?.toLowerCase() || ''
                const icon = ['mp3','wav','ogg','flac','m4a'].includes(ext) ? '🎵' : ext === 'ps1' ? '📜' : '📄'
                return (
                  <div
                    key={a.path}
                    onClick={() => copyPath(a.path)}
                    title="Click to copy path"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
                      borderRadius: 10, cursor: 'pointer', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 'var(--fs-3xl)', width: 28, textAlign: 'center' }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--fs-lg)', color: 'rgba(255,255,255,0.8)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                      <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{a.path}</div>
                    </div>
                    <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>copy</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Sidebar config tab */}
          {tab === 'sidebar' && (
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ padding: '8px 12px 4px', fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Toggle which panels show as icons in the sidebar
              </div>
              {panels.filter(p => p.label.toLowerCase().includes(q)).map(p => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10 }}
                >
                  <span style={{ fontSize: 'var(--fs-4xl)', width: 28, textAlign: 'center' }}>{p.icon}</span>
                  <span style={{ flex: 1, fontSize: 'var(--fs-xl)', color: 'rgba(255,255,255,0.7)' }}>{p.label}</span>
                  <button
                    onClick={() => onChangeSidebar(p.id, !p.sidebar)}
                    style={{
                      padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                      fontSize: 'var(--fs-md)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      background: p.sidebar ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                      color: p.sidebar ? '#fff' : 'rgba(255,255,255,0.25)',
                      border: "1px solid rgba(255,255,255,0.07)",
                      transition: 'all 0.12s',
                    }}
                  >{p.sidebar ? '● Sidebar' : '○ Hidden'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[['↵', 'toggle panel'], ['click', 'copy path (assets)'], ['ESC', 'close']].map(([k, v]) => (
            <span key={k} style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.2)' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 5px', marginRight: 5 }}>{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
