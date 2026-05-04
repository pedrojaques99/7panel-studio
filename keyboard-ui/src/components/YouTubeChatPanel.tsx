import React, { useState, useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { API } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

export type PinnedMsg = { user: string; text: string; expiresAt: number } | null

export type BotCommand = { trigger: string; response: string }
export type AutoMsg = { text: string; prefix: string; intervalMins: number; enabled: boolean }

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-chassis)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 'var(--radius-panel)',
  boxShadow: 'var(--shadow-chassis)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  height: '100%',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-pure)', fontSize: 'var(--fs-lg)', padding: '7px 10px',
  outline: 'none', width: '100%',
}

export function YouTubeChatPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('ytchat', { x: 20, y: 520, w: 380, h: 500 })

  const [tab, setTab] = useState<'chat' | 'commands'>('chat')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const [modAlerts, setModAlerts] = useState<any[]>([])

  useEffect(() => {
    let active = true
    let delay = 3000
    async function poll() {
      while (active) {
        try {
          const r = await fetch(`${API}/api/bot/mod-alerts`)
          const data = await r.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
setModAlerts(data.filter((a: any) => !a.dismissed))
          delay = 3000
        } catch {
          delay = Math.min(delay * 2, 30_000)
        }
        await new Promise(res => setTimeout(res, delay))
      }
    }
    poll()
    return () => { active = false }
  }, [])

  async function dismissAlert(id: string) {
    await fetch(`${API}/api/bot/mod-alerts/${id}/dismiss`, { method: 'POST' }).catch(() => {})
    setModAlerts(prev => prev.filter(a => a.id !== id))
  }

  async function deleteAlert(id: string) {
    await fetch(`${API}/api/bot/mod-alerts/${id}/delete`, { method: 'POST' }).catch(() => {})
    setModAlerts(prev => prev.filter(a => a.id !== id))
  }
  const [videoId, setVideoId] = useState(() => localStorage.getItem('yt-video-id') || '')
  const [editingId, setEditingId] = useState(false)
  const [tempId, setTempId] = useState(videoId)
  const [pinDuration, setPinDuration] = useState(() => Number(localStorage.getItem('yt-pin-duration') || 30))
  const [pinned, setPinned] = useState<PinnedMsg>(null)
  const pinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function parseVideoId(input: string): string {
    const urlMatch = input.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    if (urlMatch) return urlMatch[1]
    if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim()
    return input.trim()
  }

  function saveVideoId() {
    const id = parseVideoId(tempId)
    setVideoId(id)
    localStorage.setItem('yt-video-id', id)
    setEditingId(false)
  }

  function pinMessage(user: string, text: string) {
    if (pinTimerRef.current) clearTimeout(pinTimerRef.current)
    const msg: PinnedMsg = { user, text, expiresAt: Date.now() + pinDuration * 1000 }
    setPinned(msg)
    localStorage.setItem('overlay:pinned', JSON.stringify(msg))
    pinTimerRef.current = setTimeout(() => {
      setPinned(null)
      localStorage.setItem('overlay:pinned', 'null')
    }, pinDuration * 1000)
  }

  function unpinMessage() {
    if (pinTimerRef.current) clearTimeout(pinTimerRef.current)
    setPinned(null)
    localStorage.setItem('overlay:pinned', 'null')
  }

  useEffect(() => () => { if (pinTimerRef.current) clearTimeout(pinTimerRef.current) }, [])

  const chatUrl = videoId
    ? `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=localhost`
    : null

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: geo.h }}
      minWidth={320} minHeight={380}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('ytchat') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('ytchat')}
      onDragStop={(_, d) => { saveGeo('ytchat', { x: d.x, y: d.y }); endDrag('ytchat') }}
      onResizeStop={(_, __, ref, ___, pos) => saveGeo('ytchat', { x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })}
      style={{ zIndex: zOf('ytchat', 100) }}
    >
      <div style={panelStyle}>
        <PanelHeader title="YouTube Chat" onClose={onClose} className="drag-handle">
          {modAlerts.length > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontSize: 'var(--fs-sm)', fontWeight: 800, borderRadius: 'var(--radius-xs)', padding: '1px 6px' }}>{modAlerts.length}</span>
          )}
        </PanelHeader>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          {([['chat', 'Chat'], ['commands', 'Comandos']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '9px 0', fontSize: 'var(--fs-md)', fontWeight: tab === t ? 700 : 400, color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)', borderBottom: `2px solid ${tab === t ? '#00b860' : 'transparent'}`, transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Mod alerts — sempre visíveis em qualquer tab */}
        {modAlerts.length > 0 && (
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.05)', flexShrink: 0 }}>
            {modAlerts.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 10px' }}>
                <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>!</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: '#ef4444' }}>{a.user}</span>
                  <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.3)', margin: '0 4px' }}>·</span>
                  <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.3)' }}>palavra: <b style={{ color: '#ef4444' }}>{a.word}</b></span>
                  <div style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.7)', marginTop: 2, wordBreak: 'break-word' }}>{a.text}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => deleteAlert(a.id)} style={{ background: '#ef444422', border: '1px solid #ef444444', borderRadius: 6, color: '#ef4444', fontWeight: 700, fontSize: 'var(--fs-base)', padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Deletar</button>
                  <button onClick={() => dismissAlert(a.id)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.3)', fontSize: 'var(--fs-base)', padding: '3px 8px', cursor: 'pointer' }}>Ignorar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'commands' ? (
          <CommandsTab />
        ) : (
          <>
            {/* Video ID bar */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              {editingId ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input autoFocus value={tempId} onChange={e => setTempId(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveVideoId(); if (e.key === 'Escape') setEditingId(false) }}
                    placeholder="ID ou URL da live" style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={saveVideoId} style={{ background: 'var(--status-ok)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#000', fontWeight: 700, fontSize: 'var(--fs-lg)', padding: '0 12px', cursor: 'pointer' }}>OK</button>
                </div>
              ) : (
                <button onClick={() => { setTempId(videoId); setEditingId(true) }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: videoId ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)', fontSize: 'var(--fs-lg)', padding: '6px 12px', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                  {videoId ? videoId : '+ Colar ID ou URL da live'}
                </button>
              )}
            </div>

            {/* Pinned message */}
            {pinned && (
              <div style={{ margin: '10px 16px 0', padding: '10px 12px', background: 'rgba(0,184,96,0.1)', border: '1px solid rgba(0,184,96,0.3)', borderRadius: 10, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 'var(--fs-base)', color: '#00b860', fontWeight: 700, marginBottom: 3 }}>{pinned.user}</div>
                    <div style={{ fontSize: 'var(--fs-lg)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{pinned.text}</div>
                  </div>
                  <button onClick={unpinMessage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 'var(--fs-2xl)', flexShrink: 0 }}>×</button>
                </div>
              </div>
            )}

            <ManualPinForm onPin={pinMessage} pinDuration={pinDuration} onChangeDuration={d => { setPinDuration(d); localStorage.setItem('yt-pin-duration', String(d)) }} />

            {/* Chat iframe */}
            <div style={{ flex: 1, margin: '10px 16px 16px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {chatUrl ? (
                <iframe src={chatUrl} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="YouTube Live Chat" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)', fontSize: 'var(--fs-xl)', textAlign: 'center', padding: 20 }}>
                  Cole o ID da live<br />para ver o chat
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Rnd>
  )
}

// ── Commands Tab ──────────────────────────────────────────────────────────────

const DEFAULT_COMMANDS: BotCommand[] = [
  { trigger: '!replay', response: '__replay__' },
  { trigger: '!discord', response: 'Entre no Discord: discord.gg/LINK' },
  { trigger: '!ig', response: 'Instagram: @seuusuario' },
]

function CommandsTab() {
  const [commands, setCommands] = useState<BotCommand[]>([])
  const [autoMsgs, setAutoMsgs] = useState<AutoMsg[]>([])
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [newTrigger, setNewTrigger] = useState('')
  const [newResponse, setNewResponse] = useState('')
  const [newAutoText, setNewAutoText] = useState('')
  const [newAutoPrefix, setNewAutoPrefix] = useState('💬')
  const [newAutoMins, setNewAutoMins] = useState(15)

  useEffect(() => {
    fetch(`${API}/api/bot/commands`).then(r => r.json()).then(setCommands).catch(() => setCommands(DEFAULT_COMMANDS))
    fetch(`${API}/api/bot/auto-msgs`).then(r => r.json()).then(setAutoMsgs).catch(() => {})
  }, [])

  function flash(ok: boolean) { setStatus(ok ? 'ok' : 'err'); setTimeout(() => setStatus('idle'), 2000) }

  async function saveCommands(updated: BotCommand[]) {
    try {
      await fetch(`${API}/api/bot/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      setCommands(updated); flash(true)
    } catch { flash(false) }
  }

  async function saveAutoMsgs(updated: AutoMsg[]) {
    try {
      await fetch(`${API}/api/bot/auto-msgs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      setAutoMsgs(updated); flash(true)
    } catch { flash(false) }
  }

  function addCommand() {
    const trigger = newTrigger.trim().startsWith('!') ? newTrigger.trim() : '!' + newTrigger.trim()
    if (!trigger || trigger === '!' || !newResponse.trim()) return
    setNewTrigger(''); setNewResponse('')
    saveCommands([...commands, { trigger, response: newResponse.trim() }])
  }

  function addAutoMsg() {
    if (!newAutoText.trim()) return
    setNewAutoText('')
    saveAutoMsgs([...autoMsgs, { text: newAutoText.trim(), prefix: newAutoPrefix.trim(), intervalMins: newAutoMins, enabled: true }])
  }

  const sectionLabel: React.CSSProperties = { fontSize: 'var(--fs-base)', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 2 }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

      {status !== 'idle' && (
        <div style={{ fontSize: 'var(--fs-base)', color: status === 'ok' ? '#00b860' : '#ef4444', textAlign: 'center', fontWeight: 700 }}>
          {status === 'ok' ? '✓ Salvo' : '✗ Erro ao salvar'}
        </div>
      )}

      {/* ── Comandos ── */}
      <div style={sectionLabel}>Comandos do chat</div>

      {commands.map((cmd, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, color: '#00b860', fontFamily: 'monospace' }}>{cmd.trigger}</span>
            <button onClick={() => saveCommands(commands.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 'var(--fs-2xl)' }}>×</button>
          </div>
          {cmd.response === '__replay__'
            ? <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>→ Aciona Replay Buffer do OBS</span>
            : <input value={cmd.response} onChange={e => setCommands(commands.map((c, j) => j === i ? { ...c, response: e.target.value } : c))} onBlur={() => saveCommands(commands)} style={{ ...inputStyle, fontSize: 'var(--fs-md)' }} />
          }
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input value={newTrigger} onChange={e => setNewTrigger(e.target.value)} placeholder="!comando" style={{ ...inputStyle, fontFamily: 'monospace' }} onKeyDown={e => e.key === 'Enter' && document.getElementById('cmd-resp')?.focus()} />
        <input id="cmd-resp" value={newResponse} onChange={e => setNewResponse(e.target.value)} placeholder="Resposta no chat" style={inputStyle} onKeyDown={e => e.key === 'Enter' && addCommand()} />
        <button onClick={addCommand} disabled={!newTrigger.trim() || !newResponse.trim()} style={{ background: '#00b86018', border: '1px solid #00b86044', borderRadius: 8, color: '#00b860', fontWeight: 700, fontSize: 'var(--fs-lg)', padding: '7px 0', cursor: 'pointer', opacity: (!newTrigger.trim() || !newResponse.trim()) ? 0.4 : 1 }}>+ Adicionar comando</button>
      </div>

      {/* ── Auto-mensagens ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
        <div style={sectionLabel}>Mensagens automáticas</div>
      </div>

      {autoMsgs.map((am, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${am.enabled ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => saveAutoMsgs(autoMsgs.map((m, j) => j === i ? { ...m, enabled: !m.enabled } : m))}
              style={{ flexShrink: 0, width: 28, height: 16, borderRadius: 8, border: 'none', cursor: 'pointer', background: am.enabled ? '#f59e0b' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s' }}
            >
              <span style={{ position: 'absolute', top: 2, left: am.enabled ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
            </button>
            <span style={{ fontSize: 'var(--fs-base)', color: am.enabled ? '#f59e0b' : 'rgba(255,255,255,0.25)', fontWeight: 700 }}>a cada {am.intervalMins} min</span>
            <button onClick={() => saveAutoMsgs(autoMsgs.filter((_, j) => j !== i))} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 'var(--fs-2xl)' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={am.prefix ?? ''}
              onChange={e => setAutoMsgs(autoMsgs.map((m, j) => j === i ? { ...m, prefix: e.target.value } : m))}
              onBlur={() => saveAutoMsgs(autoMsgs)}
              placeholder="💬"
              style={{ ...inputStyle, width: 48, textAlign: 'center', fontSize: 'var(--fs-2xl)', flexShrink: 0 }}
              maxLength={4}
            />
            <textarea
              value={am.text}
              onChange={e => setAutoMsgs(autoMsgs.map((m, j) => j === i ? { ...m, text: e.target.value } : m))}
              onBlur={() => saveAutoMsgs(autoMsgs)}
              rows={2}
              style={{ ...inputStyle, resize: 'none', fontSize: 'var(--fs-md)', lineHeight: 1.5, flex: 1 }}
            />
          </div>
          {(am.prefix || am.text) && (
            <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', paddingLeft: 2 }}>
              Preview: {[am.prefix, am.text].filter(Boolean).join(' ')}
            </div>
          )}
          <input
            type="range" min={1} max={60} value={am.intervalMins}
            onChange={e => saveAutoMsgs(autoMsgs.map((m, j) => j === i ? { ...m, intervalMins: Number(e.target.value) } : m))}
            style={{ accentColor: '#f59e0b', cursor: 'pointer' }}
          />
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newAutoPrefix} onChange={e => setNewAutoPrefix(e.target.value)} placeholder="💬" style={{ ...inputStyle, width: 48, textAlign: 'center', fontSize: 'var(--fs-2xl)', flexShrink: 0 }} maxLength={4} />
          <textarea value={newAutoText} onChange={e => setNewAutoText(e.target.value)} placeholder={'Use !club para entrar na nossa comunidade'} rows={2} style={{ ...inputStyle, resize: 'none', lineHeight: 1.5, flex: 1 }} />
        </div>
        {(newAutoPrefix || newAutoText) && (
          <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', paddingLeft: 2 }}>
            Preview: {[newAutoPrefix, newAutoText].filter(Boolean).join(' ')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>a cada</span>
          <input type="number" min={1} max={120} value={newAutoMins} onChange={e => setNewAutoMins(Number(e.target.value))} style={{ ...inputStyle, width: 60, textAlign: 'center' }} />
          <span style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.3)' }}>min</span>
          <button onClick={addAutoMsg} disabled={!newAutoText.trim()} style={{ flex: 1, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, color: '#f59e0b', fontWeight: 700, fontSize: 'var(--fs-lg)', padding: '7px 0', cursor: 'pointer', opacity: !newAutoText.trim() ? 0.4 : 1 }}>+ Adicionar</button>
        </div>
      </div>

    </div>
  )
}

// ── Manual Pin Form ───────────────────────────────────────────────────────────

function ManualPinForm({ onPin, pinDuration, onChangeDuration }: {
  onPin: (user: string, text: string) => void
  pinDuration: number
  onChangeDuration: (d: number) => void
}) {
  const [user, setUser] = useState('')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  function submit() {
    if (!text.trim()) return
    onPin(user.trim() || 'Chat', text.trim())
    setText(''); setUser(''); setOpen(false)
  }

  return (
    <div style={{ padding: '0 16px 10px', flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 'var(--fs-md)', padding: '5px 12px', cursor: 'pointer', width: '100%' }}>
        {open ? 'Fechar' : 'Pin manual'}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="@usuario" style={inputStyle} />
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Mensagem para pinar no overlay..." rows={2} style={{ ...inputStyle, resize: 'none' }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>Duração:</span>
            {[15, 30, 60].map(s => (
              <button key={s} onClick={() => onChangeDuration(s)} style={{ flex: 1, background: pinDuration === s ? 'rgba(0,184,96,0.13)' : 'rgba(255,255,255,0.04)', border: `1px solid ${pinDuration === s ? 'rgba(0,184,96,0.33)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 'var(--radius-xs)', color: pinDuration === s ? 'var(--status-ok)' : 'var(--text-40)', fontSize: 'var(--fs-md)', padding: '4px 0', cursor: 'pointer' }}>{s}s</button>
            ))}
            <button onClick={submit} style={{ flex: 2, background: 'var(--status-ok)', border: 'none', borderRadius: 'var(--radius-xs)', color: '#000', fontWeight: 700, fontSize: 'var(--fs-lg)', padding: '4px 0', cursor: 'pointer' }}>Pinar</button>
          </div>
        </div>
      )}
    </div>
  )
}
