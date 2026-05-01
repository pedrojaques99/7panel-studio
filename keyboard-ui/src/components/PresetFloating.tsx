import React, { useEffect, useRef, useState } from 'react'
import {
  loadPresets, savePreset, deletePreset, autoName,
  type Preset, type PanelVisibility,
} from '../lib/presets'

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
  { key: 'exporter',  label: '⏺', color: '#fb923c' },
  { key: 'converter', label: '⇄', color: '#38bdf8' },
  { key: 'looplab',   label: '🔁', color: '#00b860' },
]

interface Props {
  visibility: PanelVisibility
  scale: number
  onLoad: (preset: Preset) => void
}

export function PresetFloating({ visibility, scale, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<Preset[]>(loadPresets)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ preset: Preset; x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  function refresh() { setPresets(loadPresets()) }

  // Close on outside click
  useEffect(() => {
    if (!open && !ctxMenu) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, ctxMenu])

  function handleSave() {
    const saved = savePreset(null, autoName(visibility), visibility, scale)
    refresh()
    setEditId(saved.id)
    setEditName(saved.name)
  }

  function handleOverwrite(preset: Preset) {
    savePreset(preset.id, preset.name, visibility, scale)
    refresh()
    setCtxMenu(null)
  }

  function handleDelete(id: string) {
    deletePreset(id)
    refresh()
    setCtxMenu(null)
  }

  function commitRename(id: string) {
    const all = loadPresets()
    const p = all.find(x => x.id === id)
    if (!p) return
    savePreset(id, editName.trim() || p.name, p.visibility, p.scale)
    refresh()
    setEditId(null)
  }

  return (
    <>
      {/* Floating anchor — fixed bottom-right of the viewport */}
      <div
        ref={wrapRef}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        {/* Preset strip — appears above button */}
        {open && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 6,
            padding: '10px 12px',
            borderRadius: 14,
            background: 'linear-gradient(160deg,#242527,#1a1b1d)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)',
            maxWidth: '80vw',
            flexWrap: 'wrap',
          }}>
            {presets.length === 0 && (
              <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.2)', padding: '4px 8px' }}>
                No presets yet
              </span>
            )}

            {presets.map(preset => {
              const activePanels = PANEL_DOTS.filter(d => preset.visibility[d.key])
              const isEditing = editId === preset.id

              return (
                <div key={preset.id} style={{ position: 'relative' }}>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => commitRename(preset.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitRename(preset.id) }}
                      style={{
                        width: 64, padding: '4px 6px', borderRadius: 7,
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'var(--bg-input)', color: '#fff',
                        fontSize: 'var(--fs-base)', outline: 'none', fontWeight: 700, textAlign: 'center',
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => { onLoad(preset); setOpen(false) }}
                      onContextMenu={e => { e.preventDefault(); setCtxMenu({ preset, x: e.clientX, y: e.clientY }) }}
                      title={`Load: ${preset.name}\nRight-click for options`}
                      style={{
                        padding: '6px 8px', borderRadius: 9, cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.04)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all 0.12s', minWidth: 52,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', width: 30 }}>
                        {activePanels.slice(0, 6).map(d => (
                          <div key={d.key} style={{ width: 5, height: 5, borderRadius: 2, background: d.color, opacity: 0.85 }} />
                        ))}
                        {activePanels.length === 0 && (
                          <div style={{ width: 5, height: 5, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
                        )}
                      </div>
                      <span style={{
                        fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'rgba(255,255,255,0.45)',
                        maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', letterSpacing: '0.04em',
                      }}>
                        {preset.name}
                      </span>
                    </button>
                  )}
                </div>
              )
            })}

            {/* Save current */}
            <button
              onClick={handleSave}
              title="Save current layout as preset"
              style={{
                width: 32, height: 52, borderRadius: 9, border: '1px dashed rgba(255,255,255,0.15)',
                background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                fontSize: 'var(--fs-4xl)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
            >+</button>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setOpen(v => !v)}
          title="Layout Presets"
          style={{
            width: 40, height: 40, borderRadius: 12,
            border: `1px solid ${open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.09)'}`,
            background: open ? 'rgba(255,255,255,0.12)' : 'rgba(18,19,21,0.9)',
            backdropFilter: 'blur(12px)',
            color: open ? '#fff' : 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontSize: 'var(--fs-3xl)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.color = open ? '#fff' : 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.09)' }}
        >
          ⊞
        </button>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: 'fixed', left: ctxMenu.x + 6, top: ctxMenu.y - 6, zIndex: 99999,
            background: 'linear-gradient(160deg,#242527,#1a1b1d)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
            borderRadius: 10, padding: 6, minWidth: 170,
            display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          <CtxItem onClick={() => { onLoad(ctxMenu.preset); setOpen(false); setCtxMenu(null) }}>▶ Load preset</CtxItem>
          <CtxItem onClick={() => handleOverwrite(ctxMenu.preset)}>↺ Overwrite with current</CtxItem>
          <CtxItem onClick={() => { setEditId(ctxMenu.preset.id); setEditName(ctxMenu.preset.name); setCtxMenu(null); setOpen(true) }}>✎ Rename</CtxItem>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
          <CtxItem danger onClick={() => handleDelete(ctxMenu.preset.id)}>✕ Delete</CtxItem>
        </div>
      )}
    </>
  )
}

function CtxItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '7px 10px', border: 'none', borderRadius: 6,
        cursor: 'pointer', textAlign: 'left',
        background: 'transparent',
        color: danger ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.7)',
        fontSize: 'var(--fs-md)', fontWeight: 700, transition: 'all 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}
