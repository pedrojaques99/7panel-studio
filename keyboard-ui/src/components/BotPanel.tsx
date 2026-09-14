import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { API } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

type BotStatus = {
  running: boolean; pid: number | null; video_id: string
  has_oauth_client?: boolean; has_token?: boolean; exit_code?: number | null; log?: string[]
}
type BotConfig = { video_id: string; channel_id: string; banned_words: string[]; has_api_key: boolean; has_obs_pass: boolean }
type Command = { trigger: string; response: string }
type AICfg = {
  enabled: boolean; provider: string; model: string; base_url: string
  system_prompt: string; trigger: string; max_reply_chars: number; cooldown_secs: number
  reply_prefix: string
  has_api_key?: boolean
}

const AI_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-4-8'],
}

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-chassis)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-panel)',
  boxShadow: 'var(--shadow-chassis)',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm)',
  color: 'var(--text-pure)', fontSize: 'var(--fs-lg)', padding: '7px 10px', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--fs-base)', fontWeight: 600, letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4,
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'var(--bg-hover)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 'var(--fs-md)',
  padding: '6px 14px', cursor: 'pointer', width: '100%',
}

export function BotPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('bot', { x: 40, y: 400, w: 320, h: 560 })

  const [tab, setTab] = useState<'run' | 'commands' | 'ai' | 'mod'>('run')
  const [status, setStatus] = useState<BotStatus>({ running: false, pid: null, video_id: '' })
  const [cfg, setCfg] = useState<BotConfig | null>(null)
  const [videoId, setVideoId] = useState('')
  const [banned, setBanned] = useState('')
  const [cmds, setCmds] = useState<Command[]>([])
  const [ai, setAi] = useState<AICfg | null>(null)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [startErr, setStartErr] = useState('')

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/bot/status`)
      setStatus(await r.json())
    } catch { /* backend offline */ }
  }, [])

  // mount: load config + commands, start status polling
  useEffect(() => {
    fetch(`${API}/api/bot/config`).then(r => r.json()).then((c: BotConfig) => {
      setCfg(c); setVideoId(c.video_id || ''); setBanned((c.banned_words || []).join('\n'))
    }).catch(() => {})
    fetch(`${API}/api/bot/commands`).then(r => r.json()).then((list: Command[]) => setCmds(Array.isArray(list) ? list : [])).catch(() => {})
    fetch(`${API}/api/bot/ai-config`).then(r => r.json()).then((a: AICfg) => setAi(a)).catch(() => {})
    refreshStatus()
    const t = setInterval(refreshStatus, 3000)
    return () => clearInterval(t)
  }, [refreshStatus])

  const flash = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1400) }

  async function toggleBot() {
    setBusy(true)
    setStartErr('')
    try {
      const r = await fetch(`${API}/api/bot/toggle`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok && d.error) setStartErr(d.error)
      await refreshStatus()
    } catch { setStartErr('Backend offline (:5000).') }
    setBusy(false)
  }

  async function saveConfig() {
    setBusy(true)
    try {
      await fetch(`${API}/api/bot/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId.trim(), banned_words: banned.split('\n').map(s => s.trim()).filter(Boolean) }),
      })
      flash()
    } catch { /* noop */ }
    setBusy(false)
  }

  async function saveCommands(next: Command[]) {
    setCmds(next)
    try {
      await fetch(`${API}/api/bot/commands`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next.filter(c => c.trigger.trim())),
      })
    } catch { /* noop */ }
  }

  function patchAi(patch: Partial<AICfg>) {
    setAi(prev => prev ? { ...prev, ...patch } : prev)
  }

  async function saveAi() {
    if (!ai) return
    setBusy(true)
    try {
      const body: Record<string, unknown> = { ...ai }
      delete body.has_api_key
      if (aiKeyInput.trim()) body.api_key = aiKeyInput.trim()  // só reenvia se digitou nova
      else delete body.api_key
      await fetch(`${API}/api/bot/ai-config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setAiKeyInput('')
      const fresh = await fetch(`${API}/api/bot/ai-config`).then(r => r.json())
      setAi(fresh)
      flash()
    } catch { /* noop */ }
    setBusy(false)
  }

  const running = status.running

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: geo.h }}
      minWidth={280} minHeight={360}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('bot') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('bot')}
      onDragStop={(_, d) => { saveGeo('bot', { x: d.x, y: d.y }); endDrag('bot') }}
      onResizeStop={(_, __, ref, ___, pos) => saveGeo('bot', { x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })}
      style={{ zIndex: zOf('bot', 100) }}
    >
      <div style={{ ...panelStyle, height: '100%' }}>
        <PanelHeader title="Chat Bot" onClose={onClose} className="drag-handle">
          <span title={running ? 'Rodando' : 'Parado'} style={{ width: 8, height: 8, borderRadius: '50%', background: running ? 'var(--status-ok)' : 'var(--status-neutral)', display: 'inline-block', boxShadow: running ? '0 0 6px var(--status-ok)' : 'none' }} />
        </PanelHeader>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          {([['run', 'Bot'], ['commands', 'Comandos'], ['ai', 'IA'], ['mod', 'Mod']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', fontSize: 'var(--fs-md)', fontWeight: tab === t ? 700 : 400, color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)', borderBottom: `2px solid ${tab === t ? '#00b860' : 'transparent'}`, transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'run' && (
            <>
              <button
                onClick={toggleBot}
                disabled={busy}
                style={{
                  background: running ? 'linear-gradient(135deg,#ef444422,#ef444411)' : 'var(--status-ok)',
                  border: `1px solid ${running ? '#ef444455' : 'transparent'}`,
                  borderRadius: 12, padding: '13px 14px', cursor: busy ? 'wait' : 'pointer',
                  color: running ? '#ef4444' : '#000', fontWeight: 800, fontSize: 'var(--fs-xl)',
                  letterSpacing: '0.05em', opacity: busy ? 0.6 : 1, transition: 'all 0.2s',
                }}
              >{busy ? '...' : running ? '■ Parar Bot' : '▶ Iniciar Bot'}</button>

              {status.pid && running && (
                <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-25)', textAlign: 'center' }}>PID {status.pid}</div>
              )}

              <div>
                <div style={labelStyle}>Video ID da live</div>
                <input value={videoId} onChange={e => setVideoId(e.target.value)} placeholder="Ex: dQw4w9WgXcQ" style={inputStyle} />
                <div style={{ fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-25)', marginTop: 3 }}>Aplica no próximo start do bot.</div>
              </div>

              <div>
                <div style={labelStyle}>Palavras banidas (uma por linha)</div>
                <textarea value={banned} onChange={e => setBanned(e.target.value)} rows={4} placeholder={"spam\nlink proibido"} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
              </div>

              {/* Readiness real: precisa de yt_token.json (helper) OU client_secret.json. */}
              {status.has_token === false && status.has_oauth_client === false && (
                <div style={{ fontSize: 'var(--fs-base)', color: 'var(--status-warn)', lineHeight: 1.6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                  ⚠ <b>Falta autorizar o YouTube.</b> Rode uma vez no terminal:<br />
                  <code style={{ color: '#00b860' }}>cd backend && python yt_auth_helper.py</code><br />
                  <span style={{ color: 'var(--text-40)' }}>Reusa o OAuth client que você já tem (visantlabs/Drive) — não precisa baixar nada.</span>
                </div>
              )}
              {status.has_token && (
                <div style={{ fontSize: 'var(--fs-base)', color: '#00b860' }}>● YouTube autorizado</div>
              )}
              {startErr && (
                <div style={{ fontSize: 'var(--fs-base)', color: '#ef4444', lineHeight: 1.5, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                  {startErr}
                </div>
              )}
              {!running && status.exit_code != null && status.exit_code !== 0 && !!status.log?.length && (() => {
                const logText = status.log!.join('\n')
                const noLive = /Nenhuma live ativa/i.test(logText)
                return (
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ color: '#ef4444', fontSize: 'var(--fs-md)', fontWeight: 700 }}>
                      Bot parou (code {status.exit_code})
                    </div>
                    {noLive ? (
                      <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
                        Nenhuma live ativa no canal. Ou <b>abra a live no YouTube</b>, ou cole o{' '}
                        <b>Video ID</b> acima e clique <b>Salvar config</b> antes de iniciar.
                      </div>
                    ) : (
                      <div style={{ fontSize: 'var(--fs-xs, 10px)', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                        {logText}
                      </div>
                    )}
                  </div>
                )
              })()}

              <button onClick={saveConfig} disabled={busy} style={{ ...ghostBtnStyle, background: savedFlash ? '#00b86022' : 'var(--bg-hover)', color: savedFlash ? '#00b860' : 'rgba(255,255,255,0.5)', borderColor: savedFlash ? '#00b86055' : 'rgba(255,255,255,0.08)' }}>
                {savedFlash ? '✓ Salvo' : 'Salvar config'}
              </button>
            </>
          )}

          {tab === 'commands' && (
            <>
              {cmds.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <input
                    value={c.trigger}
                    onChange={e => saveCommands(cmds.map((x, j) => j === i ? { ...x, trigger: e.target.value } : x))}
                    placeholder="!cmd"
                    style={{ ...inputStyle, width: 90, flexShrink: 0, fontFamily: 'monospace' }}
                  />
                  <input
                    value={c.response}
                    onChange={e => saveCommands(cmds.map((x, j) => j === i ? { ...x, response: e.target.value } : x))}
                    placeholder="Resposta ou __replay__"
                    style={inputStyle}
                  />
                  <button onClick={() => saveCommands(cmds.filter((_, j) => j !== i))} title="Remover" style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: 6, color: '#ef4444', cursor: 'pointer', padding: '7px 9px', fontSize: 'var(--fs-md)', flexShrink: 0 }}>×</button>
                </div>
              ))}
              <button onClick={() => setCmds([...cmds, { trigger: '', response: '' }])} style={ghostBtnStyle}>+ Novo comando</button>
              <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-25)', lineHeight: 1.5 }}>
                Use <code style={{ color: '#00b860' }}>__replay__</code> na resposta pra acionar o Replay Buffer do OBS.
              </div>
            </>
          )}

          {tab === 'ai' && (
            ai ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={labelStyle}>Respostas por IA</span>
                  <LiveToggleBtn on={ai.enabled} onClick={() => patchAi({ enabled: !ai.enabled })} labelOn="Ligado" labelOff="Desligado" />
                </div>

                <div>
                  <div style={labelStyle}>Provider</div>
                  <select value={ai.provider} onChange={e => { const p = e.target.value; patchAi({ provider: p, model: (AI_MODELS[p]?.[0]) || ai.model }) }} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI / compatível</option>
                    <option value="anthropic">Anthropic Claude</option>
                  </select>
                </div>

                <div>
                  <div style={labelStyle}>Modelo</div>
                  <input list="ai-models" value={ai.model} onChange={e => patchAi({ model: e.target.value })} style={inputStyle} />
                  <datalist id="ai-models">
                    {(AI_MODELS[ai.provider] || []).map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>

                {ai.provider === 'openai' && (
                  <div>
                    <div style={labelStyle}>Base URL (opcional — OpenRouter/Groq/local)</div>
                    <input value={ai.base_url} onChange={e => patchAi({ base_url: e.target.value })} placeholder="https://api.openai.com/v1" style={inputStyle} />
                  </div>
                )}

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={labelStyle}>API Key</span>
                    <span style={{ fontSize: 'var(--fs-base)', color: ai.has_api_key ? '#00b860' : 'var(--status-warn)' }}>{ai.has_api_key ? '● salva' : '○ vazia'}</span>
                  </div>
                  <input type="password" value={aiKeyInput} onChange={e => setAiKeyInput(e.target.value)} placeholder={ai.has_api_key ? '•••••• (deixe vazio p/ manter)' : 'Cole a API key'} style={inputStyle} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Gatilho</div>
                    <input value={ai.trigger} onChange={e => patchAi({ trigger: e.target.value })} placeholder="!ai" style={{ ...inputStyle, fontFamily: 'monospace' }} />
                  </div>
                  <div style={{ width: 90 }}>
                    <div style={labelStyle}>Cooldown</div>
                    <input type="number" min={0} value={ai.cooldown_secs} onChange={e => patchAi({ cooldown_secs: Number(e.target.value) })} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={labelStyle}>Marca de bot</span>
                    <span style={{ fontSize: 'var(--fs-base)', color: ai.reply_prefix ? '#00b860' : 'var(--status-warn)' }}>
                      {ai.reply_prefix ? 'identificado' : '⚠ sai como você'}
                    </span>
                  </div>
                  <input value={ai.reply_prefix ?? ''} onChange={e => patchAi({ reply_prefix: e.target.value })} placeholder="🤖" maxLength={8} style={{ ...inputStyle, width: 70, textAlign: 'center', fontSize: 'var(--fs-2xl)' }} />
                  <div style={{ fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-25)', marginTop: 3, lineHeight: 1.5 }}>
                    O bot posta com a sua conta. Sem prefixo, a resposta da IA parece escrita por você.
                  </div>
                </div>

                <div>
                  <div style={labelStyle}>Personalidade (system prompt)</div>
                  <textarea value={ai.system_prompt} onChange={e => patchAi({ system_prompt: e.target.value })} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </div>

                <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-25)', lineHeight: 1.5 }}>
                  No chat: <code style={{ color: '#00b860' }}>{ai.trigger || '!ai'} sua pergunta</code> → resposta via {ai.provider}:<br />
                  <span style={{ color: 'var(--text-40)' }}>{ai.reply_prefix} É a Outfit, bold 700.</span>
                </div>

                <button onClick={saveAi} disabled={busy} style={{ ...ghostBtnStyle, background: savedFlash ? '#00b86022' : 'var(--bg-hover)', color: savedFlash ? '#00b860' : 'rgba(255,255,255,0.5)', borderColor: savedFlash ? '#00b86055' : 'rgba(255,255,255,0.08)' }}>
                  {savedFlash ? '✓ Salvo' : 'Salvar IA'}
                </button>
              </>
            ) : <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-25)', textAlign: 'center', padding: '20px 0' }}>Backend offline.</div>
          )}

          {tab === 'mod' && <ModAlerts />}
        </div>
      </div>
    </Rnd>
  )
}

function LiveToggleBtn({ on, onClick, labelOn, labelOff }: { on: boolean; onClick: () => void; labelOn: string; labelOff: string }) {
  return (
    <button onClick={onClick} style={{
      background: on ? '#00b86022' : 'var(--bg-hover)', border: `1px solid ${on ? '#00b86055' : 'var(--border-light)'}`,
      borderRadius: 'var(--radius-xs)', padding: '3px 12px', cursor: 'pointer', fontSize: 'var(--fs-md)',
      color: on ? '#00b860' : 'rgba(255,255,255,0.4)', fontWeight: 600,
    }}>{on ? labelOn : labelOff}</button>
  )
}

type ModAlert = { id?: string; msg_id?: string; user?: string; text?: string; reason?: string; dismissed?: boolean }

function ModAlerts() {
  const [alerts, setAlerts] = useState<ModAlert[]>([])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/bot/mod-alerts`)
      const list = await r.json()
      setAlerts(Array.isArray(list) ? list.filter((a: ModAlert) => !a.dismissed) : [])
    } catch { /* noop */ }
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])

  async function act(a: ModAlert, action: 'dismiss' | 'delete') {
    const id = a.msg_id || a.id
    if (!id) return
    try { await fetch(`${API}/api/bot/mod-alerts/${id}/${action}`, { method: 'POST' }) } catch { /* noop */ }
    load()
  }

  if (!alerts.length) return <div style={{ fontSize: 'var(--fs-lg)', color: 'var(--text-25)', textAlign: 'center', padding: '20px 0' }}>Sem alertas de moderação.</div>

  return (
    <>
      {alerts.map((a, i) => (
        <div key={a.msg_id || a.id || i} style={{ background: 'var(--bg-input)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 'var(--fs-md)', fontWeight: 700, color: '#ef4444' }}>{a.user || 'viewer'}</div>
          <div style={{ fontSize: 'var(--fs-lg)', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{a.text}</div>
          {a.reason && <div style={{ fontSize: 'var(--fs-base)', color: 'var(--text-40)' }}>motivo: {a.reason}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => act(a, 'delete')} style={{ flex: 1, background: '#ef444422', border: '1px solid #ef444455', borderRadius: 7, color: '#ef4444', cursor: 'pointer', padding: '6px 0', fontSize: 'var(--fs-md)', fontWeight: 600 }}>Deletar msg</button>
            <button onClick={() => act(a, 'dismiss')} style={{ flex: 1, background: 'var(--bg-hover)', border: '1px solid var(--border-light)', borderRadius: 7, color: 'var(--text-40)', cursor: 'pointer', padding: '6px 0', fontSize: 'var(--fs-md)' }}>Ignorar</button>
          </div>
        </div>
      ))}
    </>
  )
}
