import React, { useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { API } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'

type Action = { type?: string; path?: string; args?: string; label?: string; emoji?: string }
type Config = { buttons?: Record<string, Action> }

const field: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff', fontSize: 'var(--fs-xl)', outline: 'none',
  transition: 'border-color 0.15s',
}

const label: React.CSSProperties = {
  fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.15em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
  marginBottom: 4,
}

function Field({ lbl, children }: { lbl: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={label}>{lbl}</div>
      {children}
    </div>
  )
}

interface Props {
  selected: string
  config: Config
  onClose: () => void
  onSaved: (next: Config) => void
}

export function ConfigPanel({ selected, config, onClose, onSaved }: Props) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('config', { x: 460, y: 20, w: 340, h: 0 })

  const existing = config.buttons?.[selected] || {} as Action
  const [actionType, setActionType]   = useState(existing.type  || 'play_audio')
  const [actionPath, setActionPath]   = useState(existing.path  || '')
  const [actionLabel, setActionLabel] = useState(existing.label || '')
  const [actionEmoji, setActionEmoji] = useState(existing.emoji || '')
  const [actionArgs, setActionArgs]   = useState(existing.args  || '')
  const [saveStatus, setSaveStatus]   = useState<'idle'|'saving'|'ok'|'err'>('idle')
  const [previewing, setPreviewing]   = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [convertBitrate, setConvertBitrate] = useState('192k')
  const [convertStatus, setConvertStatus] = useState<'idle'|'converting'|'ok'|'err'>('idle')
  const [convertResult, setConvertResult] = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const keyName = selected.replace('key_', '').toUpperCase()

  async function save() {
    setSaveStatus('saving')
    const action: Action = {
      type: actionType, path: actionPath, args: actionArgs,
      label: actionLabel.trim() || actionPath.split(/[\\/]/).pop(),
      ...(actionEmoji.trim() ? { emoji: actionEmoji.trim() } : {}),
    }
    const next = { ...config, buttons: { ...config.buttons, [selected]: action } }
    try {
      const r = await fetch(`${API}/api/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      })
      if (!r.ok) throw new Error()
      onSaved(next)
      setSaveStatus('ok')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch { setSaveStatus('err') }
  }

  function togglePreview() {
    if (previewing) { audioRef.current?.pause(); audioRef.current = null; setPreviewing(false); return }
    const a = new Audio(`${API}/api/preview?path=${encodeURIComponent(actionPath)}`)
    audioRef.current = a
    a.onended = () => { setPreviewing(false); audioRef.current = null }
    a.play().then(() => setPreviewing(true)).catch(() => setPreviewing(false))
  }

  async function handleUpload(file: File) {
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await fetch(`${API}/api/upload`, { method: 'POST', body: fd })
      const res = await r.json()
      if (res.status === 'success') {
        let type = actionType
        if (file.name.match(/\.(mp3|wav|ogg|flac|m4a|mp4)$/i)) type = 'play_audio'
        if (file.name.endsWith('.ps1')) type = 'run_script'
        setActionType(type); setActionPath(res.path)
      }
    } catch{ /* noop */ }
  }

  async function convertWav() {
    if (!actionPath) return
    setConvertStatus('converting'); setConvertResult('')
    try {
      const r = await fetch(`${API}/api/convert/wav-to-mp3`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: actionPath, bitrate: convertBitrate }),
      })
      const res = await r.json()
      if (!r.ok || res.error) { setConvertStatus('err'); setConvertResult(res.error || 'Error'); return }
      // poll job
      const poll = async (jobId: string): Promise<void> => {
        const sr = await fetch(`${API}/api/convert/status/${jobId}`)
        const job = await sr.json()
        if (job.status === 'done') { setConvertStatus('ok'); setConvertResult(job.path) }
        else if (job.status === 'error') { setConvertStatus('err'); setConvertResult(job.error) }
        else { await new Promise(r => setTimeout(r, 400)); return poll(jobId) }
      }
      await poll(res.job_id)
    } catch (e: unknown) { setConvertStatus('err'); setConvertResult(String(e)) }
  }

  const btnBase: React.CSSProperties = {
    border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 800,
    fontSize: 'var(--fs-md)', letterSpacing: '0.2em', textTransform: 'uppercase',
    padding: '11px 0', transition: 'all 0.12s',
  }

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || 340, height: 'auto' }}
      enableResizing={false}
      bounds={undefined}
      dragHandleClassName="cfg-drag"
      className={`panel-drag${isDragging('config') ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront('config')}
      onDragStop={(_e, d) => { saveGeo('config', { x: d.x, y: d.y }); endDrag('config') }}
      style={{ zIndex: zOf('config', 11) }}
    >
      <div style={{
        borderRadius: 'var(--radius-panel)',
        background: 'var(--bg-chassis)',
        boxShadow: 'var(--shadow-chassis)',
        overflow: 'hidden',
        width: geo.w || 340,
      }}>
        <PanelHeader title={`Config // ${keyName}`} onClose={onClose} className="cfg-drag" />

        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Action type */}
          <Field lbl="Action Type">
            <div style={{ position: 'relative' }}>
              <select
                value={actionType}
                onChange={e => setActionType(e.target.value)}
                style={{ ...field, paddingRight: 36, // eslint-disable-next-line @typescript-eslint/no-explicit-any
appearance: 'none' as any }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              >
                <option value="play_audio">🔈 Play Audio</option>
                <option value="open_app">🚀 Launch App</option>
                <option value="run_script">📜 PowerShell</option>
              </select>
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 'var(--fs-base)' }}>▼</span>
            </div>
          </Field>

          {/* Icon + Label row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Field lbl="Icon">
              <input
                value={actionEmoji} onChange={e => setActionEmoji(e.target.value)}
                placeholder="🎵" maxLength={2}
                style={{ ...field, width: 52, textAlign: 'center', fontSize: 'var(--fs-4xl)', padding: '8px 4px' }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </Field>
            <Field lbl="Label" >
              <input
                value={actionLabel} onChange={e => setActionLabel(e.target.value)}
                placeholder="Display name…"
                style={{ ...field, flex: 1 }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </Field>
          </div>

          {/* Source path */}
          <Field lbl="Source Path">
            <input
              value={actionPath} onChange={e => setActionPath(e.target.value)}
              placeholder="C:\Assets\sound.mp3"
              style={field}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </Field>

          {/* Args */}
          {(actionType === 'open_app' || actionType === 'run_script') && (
            <Field lbl="Execution Args">
              <input
                value={actionArgs} onChange={e => setActionArgs(e.target.value)}
                placeholder="--silent"
                style={field}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </Field>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {actionType === 'play_audio' && (
              <button onClick={togglePreview} disabled={!actionPath} style={{
                ...btnBase, flex: 1,
                background: previewing ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)',
                color: previewing ? '#ef4444' : 'rgba(255,255,255,0.5)',
                opacity: !actionPath ? 0.3 : 1,
              }}>
                {previewing ? '⏹ Stop' : '▶ Preview'}
              </button>
            )}
            <button onClick={() => uploadRef.current?.click()} style={{
              ...btnBase, flex: 1,
              background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)',
            }}>↑ Upload</button>
            <input ref={uploadRef} type="file" accept=".mp3,.mp4,.wav,.ogg,.flac,.m4a,.ps1"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
          </div>

          {/* Advanced */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            <button onClick={() => setShowAdvanced(v => !v)} style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0',
            }}>
              <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>Advanced</span>
              <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.2)' }}>{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>WAV → MP3</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, fontSize: 'var(--fs-md)', padding: '8px 12px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', color: actionPath ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {actionPath ? actionPath.split(/[\\/]/).pop() : 'No file selected'}
                  </div>
                  <select value={convertBitrate} onChange={e => setConvertBitrate(e.target.value)}
                    style={{ ...field, width: 76, padding: '8px 10px', fontSize: 'var(--fs-lg)' }}>
                    <option value="128k">128k</option>
                    <option value="192k">192k</option>
                    <option value="320k">320k</option>
                  </select>
                </div>
                <button onClick={convertWav} disabled={!actionPath || convertStatus === 'converting'} style={{
                  ...btnBase, width: '100%',
                  background: convertStatus === 'ok' ? 'var(--status-ok)' : 'rgba(255,255,255,0.07)',
                  color: convertStatus === 'ok' ? '#000' : 'rgba(255,255,255,0.5)',
                  opacity: !actionPath || convertStatus === 'converting' ? 0.35 : 1,
                }}>
                  {convertStatus === 'converting' ? '// Converting…' : convertStatus === 'ok' ? '✓ Done' : '⇄ Convert to MP3'}
                </button>
                {convertStatus === 'err' && <span style={{ fontSize: 'var(--fs-base)', color: '#ef4444' }}>{convertResult}</span>}
                {convertStatus === 'ok' && convertResult && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{convertResult.split(/[\\/]/).pop()}</span>
                    <button onClick={() => { setActionPath(convertResult); setActionType('play_audio') }}
                      style={{ ...btnBase, padding: '5px 12px', fontSize: 'var(--fs-base)', background: 'var(--bg-btn-silver)', color: '#000' }}>Use</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save */}
          <button onClick={save} disabled={saveStatus === 'saving'} style={{
            ...btnBase, width: '100%', padding: '14px 0', fontSize: 'var(--fs-lg)', letterSpacing: '0.3em',
            background: saveStatus === 'ok' ? 'var(--status-ok)' : 'var(--bg-btn-silver)',
            color: '#000', boxShadow: 'var(--shadow-btn)',
            opacity: saveStatus === 'saving' ? 0.5 : 1,
          }}>
            {saveStatus === 'saving' ? '// Saving…' : saveStatus === 'ok' ? '✓ Saved' : 'Save Config'}
          </button>
        </div>
      </div>
    </Rnd>
  )
}
