import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import OBSWebSocket from 'obs-websocket-js'
import { loadGeo, saveGeo } from '../lib/geo'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

type Status = 'disconnected' | 'connecting' | 'connected' | 'error'

const STATUS_COLOR: Record<Status, string> = {
  disconnected: 'var(--status-neutral)',
  connecting: 'var(--status-warn)',
  connected: 'var(--status-ok)',
  error: 'var(--status-err)',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-chassis)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 'var(--radius-panel)',
  boxShadow: 'var(--shadow-chassis)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

export function OBSControlPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('obs', { x: 860, y: 20, w: 220, h: 420 })

  const obsRef = useRef<OBSWebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectingRef = useRef(false)

  const [status, setStatus] = useState<Status>('disconnected')
  const [isLive, setIsLive] = useState(false)
  const [isBRB, setIsBRB] = useState(false)
  const [prevScene, setPrevScene] = useState('')
  const [replayFeedback, setReplayFeedback] = useState(false)
  const [stopConfirm, setStopConfirm] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem('obs-url') || 'ws://localhost:4455')
  const [wsPass, setWsPass] = useState(() => localStorage.getItem('obs-pass') || '')
  const [brbScene, setBrbScene] = useState(() => localStorage.getItem('obs-brb-scene') || 'Já Volto')

  const connect = useCallback(async () => {
    if (connectingRef.current) return
    connectingRef.current = true

    if (obsRef.current) { try { await obsRef.current.disconnect() } catch{ /* noop */ } }
    const obs = new OBSWebSocket()
    obsRef.current = obs

    obs.on('ConnectionClosed', () => {
      setStatus('disconnected')
      reconnectRef.current = setTimeout(() => connect(), 5000)
    })

    setStatus('connecting')
    try {
      await obs.connect(wsUrl, wsPass || undefined)
      setStatus('connected')
      connectingRef.current = false
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null }

      const { outputActive } = await obs.call('GetStreamStatus')
      setIsLive(outputActive)
    } catch {
      connectingRef.current = false
      setStatus('error')
      reconnectRef.current = setTimeout(() => connect(), 5000)
    }
  }, [wsUrl, wsPass])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      obsRef.current?.disconnect()
    }
  }, [connect])

  async function saveReplay() {
    if (!obsRef.current || status !== 'connected') return
    try {
      await obsRef.current.call('SaveReplayBuffer')
      setReplayFeedback(true)
      setTimeout(() => setReplayFeedback(false), 2000)
    } catch (e) { console.error('Replay error:', e) }
  }

  async function toggleBRB() {
    if (!obsRef.current || status !== 'connected') return
    try {
      if (!isBRB) {
        const { currentProgramSceneName } = await obsRef.current.call('GetCurrentProgramScene')
        setPrevScene(currentProgramSceneName)
        await obsRef.current.call('SetCurrentProgramScene', { sceneName: brbScene })
        setIsBRB(true)
      } else {
        if (prevScene) await obsRef.current.call('SetCurrentProgramScene', { sceneName: prevScene })
        setIsBRB(false)
      }
    } catch (e) { console.error('Scene error:', e) }
  }

  async function toggleStream() {
    if (!obsRef.current || status !== 'connected') return
    if (isLive && !stopConfirm) { setStopConfirm(true); return }
    setStopConfirm(false)
    try {
      if (isLive) {
        await obsRef.current.call('StopStream')
        setIsLive(false)
      } else {
        await obsRef.current.call('StartStream')
        setIsLive(true)
      }
    } catch (e) { console.error('Stream error:', e) }
  }

  function saveConfig() {
    localStorage.setItem('obs-url', wsUrl)
    localStorage.setItem('obs-pass', wsPass)
    localStorage.setItem('obs-brb-scene', brbScene)
    setShowConfig(false)
    connect()
  }

  const disabled = status !== 'connected'

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: 'auto' }}
      minWidth={200}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('obs') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('obs')}
      onDragStop={(_, d) => { saveGeo('obs', { x: d.x, y: d.y }); endDrag('obs') }}
      onResizeStop={(_, __, ref, ___, pos) => saveGeo('obs', { x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })}
      style={{ zIndex: zOf('obs', 100) }}
      enableResizing={false}
    >
      <div style={panelStyle}>
        <PanelHeader title="OBS" onClose={onClose} className="drag-handle">
          <span title={status} style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[status], display: 'inline-block', boxShadow: status === 'connected' ? '0 0 6px var(--status-ok)' : 'none' }} />
          <button onClick={() => setShowConfig(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-40)', fontSize: 'var(--fs-2xl)', padding: '0 2px' }}>⚙</button>
        </PanelHeader>
        {showConfig && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              { label: 'WS URL', value: wsUrl, set: setWsUrl, ph: 'ws://localhost:4455', type: 'text' as const },
              { label: 'Senha', value: wsPass, set: setWsPass, ph: '(opcional)', type: 'password' as const },
              { label: 'Cena BRB', value: brbScene, set: setBrbScene, ph: 'Já Volto', type: 'text' as const },
            ]).map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{f.label}</div>
                <input
                  type={f.type}
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.ph}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-sm)', color: 'var(--text-pure)', fontSize: 'var(--fs-lg)', padding: '6px 10px', outline: 'none', boxShadow: 'var(--shadow-input)' }}
                />
              </div>
            ))}
            <button onClick={saveConfig} style={{ marginTop: 4, background: 'var(--status-ok)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#000', fontWeight: 700, fontSize: 'var(--fs-lg)', padding: '7px 0', cursor: 'pointer' }}>
              Salvar & Reconectar
            </button>
          </div>
        )}

        {/* Buttons */}
        <div style={{ padding: '16px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ObsBtn
            label="Replay 60s"
            disabled={disabled}
            active={replayFeedback}
            activeColor="#00b860"
            onClick={saveReplay}
          />

          <ObsBtn
            label={isBRB ? 'Voltar' : 'Já Volto'}
            sublabel={isBRB ? `← ${prevScene}` : undefined}
            disabled={disabled}
            active={isBRB}
            activeColor="#f59e0b"
            onClick={toggleBRB}
          />

          <ObsBtn
            label={stopConfirm ? 'Confirmar?' : isLive ? 'Ao Vivo' : 'Iniciar Live'}
            sublabel={stopConfirm ? 'Clique novamente' : undefined}
            disabled={disabled}
            active={isLive}
            activeColor="#ef4444"
            pulse={isLive}
            onClick={toggleStream}
          />
        </div>
      </div>
    </Rnd>
  )
}

function ObsBtn({ label, sublabel, disabled, active, activeColor, pulse, onClick }: {
  label: string; sublabel?: string
  disabled: boolean; active: boolean; activeColor: string
  pulse?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active
          ? `linear-gradient(135deg, ${activeColor}22, ${activeColor}11)`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? activeColor + '55' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12, padding: '12px 14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', gap: 10,
        transition: 'all 0.2s',
        animation: pulse ? 'obs-pulse 2s ease-in-out infinite' : 'none',
        textAlign: 'left',
      }}
    >
      <div>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: active ? activeColor : 'rgba(255,255,255,0.85)' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 'var(--fs-base)', color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{sublabel}</div>}
      </div>
    </button>
  )
}
