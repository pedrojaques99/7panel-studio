import { useState, useRef, useEffect } from 'react'
import {
  loadPresets, savePreset, deletePreset, autoName,
  type Preset, type PanelVisibility,
} from '../lib/presets'

interface Props {
  visibility: PanelVisibility
  scale: number
  onLoad: (preset: Preset) => void
}

const PANEL_DOTS: { key: keyof PanelVisibility; label: string; color: string }[] = [
  { key: 'keys',       label: '⌨',  color: 'rgba(255,255,255,0.5)' },
  { key: 'mixer',      label: '🎚', color: '#7c9ef5' },
  { key: 'soundboard', label: '🎹', color: '#a78bfa' },
  { key: 'obs',        label: '🎬', color: '#f87171' },
  { key: 'briefing',   label: '📋', color: '#fbbf24' },
  { key: 'ytchat',     label: '💬', color: '#34d399' },
  { key: 'timer',      label: '⏱',  color: '#60a5fa' },
  { key: 'drone',      label: '🌊', color: '#818cf8' },
  { key: 'paul',       label: '∿',  color: '#e879f9' },
  { key: 'synth',      label: '🎛', color: '#a78bfa' },
]

export function PresetBar({ visibility, scale, onLoad }: Props) {
  const [presets, setPresets] = useState<Preset[]>(loadPresets)
  const [menu, setMenu] = useState<{ preset: Preset | null; x: number; y: number } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menu])

  function refresh() { setPresets(loadPresets()) }

  function handleSave(existing: Preset | null) {
    const name = existing?.name ?? autoName(visibility)
    const saved = savePreset(existing?.id ?? null, name, visibility, scale)
    refresh()
    setMenu(null)
    // immediately open rename if new
    if (!existing) {
      setEditId(saved.id)
      setEditName(saved.name)
    }
  }

  function handleDelete(id: string) {
    deletePreset(id)
    refresh()
    setMenu(null)
  }

  function commitRename(id: string) {
    const presets = loadPresets()
    const p = presets.find(x => x.id === id)
    if (!p) return
    savePreset(id, editName.trim() || p.name, p.visibility, p.scale)
    refresh()
    setEditId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%', paddingBottom: 4 }}>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.15)', marginBottom: 2 }}>
        PRESETS
      </span>

      {presets.map(preset => (
        <PresetSlot
          key={preset.id}
          preset={preset}
          editId={editId}
          editName={editName}
          onEditName={setEditName}
          onCommitRename={commitRename}
          onLoad={() => { onLoad(preset); setMenu(null) }}
          onRightClick={(e) => {
            e.preventDefault()
            setMenu({ preset, x: e.clientX, y: e.clientY })
          }}
        />
      ))}

      {/* Add new preset button */}
      <button
        onClick={() => handleSave(null)}
        title="Save current layout as preset"
        style={{
          width: 36, height: 20, borderRadius: 6, border: '1px dashed rgba(255,255,255,0.12)',
          background: 'transparent', color: 'rgba(255,255,255,0.25)', cursor: 'pointer',
          fontSize: 'var(--fs-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
      >+</button>

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed', left: menu.x + 8, top: menu.y - 8, zIndex: 99999,
            background: 'var(--bg-popup)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
            borderRadius: 8, padding: 6, minWidth: 160,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {menu.preset && (
            <>
              <CtxItem onClick={() => { onLoad(menu.preset!); setMenu(null) }}>▶ Load preset</CtxItem>
              <CtxItem onClick={() => handleSave(menu.preset)}>↺ Overwrite with current</CtxItem>
              <CtxItem onClick={() => { setEditId(menu.preset!.id); setEditName(menu.preset!.name); setMenu(null) }}>✎ Rename</CtxItem>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
              <CtxItem danger onClick={() => handleDelete(menu.preset!.id)}>✕ Delete</CtxItem>
            </>
          )}
        </div>
      )}

      {/* Panel dots legend - hidden, just for visual reference */}
      <div style={{ display: 'none' }}>
        {PANEL_DOTS.map(d => <span key={d.key}>{d.label}</span>)}
      </div>
    </div>
  )
}

function PresetSlot({ preset, editId, editName, onEditName, onCommitRename, onLoad, onRightClick }: {
  preset: Preset
  editId: string | null
  editName: string
  onEditName: (n: string) => void
  onCommitRename: (id: string) => void
  onLoad: () => void
  onRightClick: (e: React.MouseEvent) => void
}) {
  const isEditing = editId === preset.id
  const activePanels = PANEL_DOTS.filter(d => preset.visibility[d.key])

  return (
    <div
      title={`Load: ${preset.name}`}
      style={{ width: 44, position: 'relative' }}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editName}
          onChange={e => onEditName(e.target.value)}
          onBlur={() => onCommitRename(preset.id)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onCommitRename(preset.id) }}
          style={{
            width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.2)',
            background: 'var(--bg-input)', color: '#fff', fontSize: 'var(--fs-sm)', outline: 'none',
            fontWeight: 700, textAlign: 'center',
          }}
        />
      ) : (
        <button
          onClick={onLoad}
          onContextMenu={onRightClick}
          style={{
            width: '100%', padding: '4px 2px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        >
          {/* Active panel indicator dots */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', width: 28 }}>
            {activePanels.slice(0, 6).map(d => (
              <div
                key={d.key}
                title={d.key}
                style={{ width: 5, height: 5, borderRadius: 2, background: d.color, opacity: 0.8 }}
              />
            ))}
            {activePanels.length === 0 && (
              <div style={{ width: 5, height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
            )}
          </div>
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'rgba(255,255,255,0.4)', maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
            {preset.name}
          </span>
        </button>
      )}
    </div>
  )
}

function CtxItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '6px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
        background: 'transparent', color: danger ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.7)',
        fontSize: 'var(--fs-md)', fontWeight: 700, transition: 'all 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}
