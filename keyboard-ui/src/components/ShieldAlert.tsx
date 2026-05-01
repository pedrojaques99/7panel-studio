import React, { useState, useEffect, useRef, useCallback } from 'react'
import OBSWebSocket from 'obs-websocket-js'
import { API } from '../lib/api'

type ShieldState = { alert: boolean; pattern: string; title: string }
type ObsMode = 'scene' | 'blackout' | 'off'

export function ShieldAlert() {
  const [state, setState] = useState<ShieldState>({ alert: false, pattern: '', title: '' })
  const [dismissed, setDismissed] = useState(false)
  const [obsMode] = useState<ObsMode>(() => (localStorage.getItem('shield-obs-mode') as ObsMode) || 'scene')

  const esRef = useRef<EventSource | null>(null)
  const obsRef = useRef<OBSWebSocket | null>(null)
  const prevSceneRef = useRef<string>('')
  const obsReadyRef = useRef(false)

  // Connect to OBS silently using same config as OBSControlPanel
  const connectOBS = useCallback(async () => {
    const url = localStorage.getItem('obs-url') || 'ws://localhost:4455'
    const pass = localStorage.getItem('obs-pass') || ''
    const obs = new OBSWebSocket()
    obsRef.current = obs
    try {
      await obs.connect(url, pass || undefined)
      obsReadyRef.current = true
      obs.on('ConnectionClosed', () => { obsReadyRef.current = false })
    } catch {
      obsReadyRef.current = false
    }
  }, [])

  useEffect(() => { connectOBS() }, [connectOBS])

  const triggerShield = useCallback(async () => {
    const shieldScene = localStorage.getItem('obs-brb-scene') || 'Já Volto'

    if (obsMode === 'scene' && obsReadyRef.current && obsRef.current) {
      try {
        const { currentProgramSceneName } = await obsRef.current.call('GetCurrentProgramScene')
        prevSceneRef.current = currentProgramSceneName
        await obsRef.current.call('SetCurrentProgramScene', { sceneName: shieldScene })
      } catch { /* OBS unavailable — fallback to blackout handled by render */ }
    }
  }, [obsMode])

  const releaseShield = useCallback(async () => {
    if (obsMode === 'scene' && obsReadyRef.current && obsRef.current && prevSceneRef.current) {
      try {
        await obsRef.current.call('SetCurrentProgramScene', { sceneName: prevSceneRef.current })
        prevSceneRef.current = ''
      } catch {}
    }
  }, [obsMode])

  // SSE listener
  useEffect(() => {
    function connect() {
      const es = new EventSource(`${API}/api/shield/stream`)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.heartbeat) return
          const wasAlert = state.alert
          setState(data)
          if (data.alert && !wasAlert) {
            setDismissed(false)
            triggerShield()
          }
          if (!data.alert && wasAlert) {
            releaseShield()
          }
        } catch {}
      }
      es.onerror = () => { es.close(); setTimeout(connect, 5000) }
    }
    connect()
    return () => esRef.current?.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerShield, releaseShield])

  function handleDismiss() {
    setDismissed(true)
    releaseShield()
  }

  // Blackout overlay — covers this app window when OBS mode is off or OBS not connected
  const showBlackout = state.alert && !dismissed && (obsMode === 'blackout' || (obsMode === 'scene' && !obsReadyRef.current))

  return (
    <>
      {/* Full-screen blackout fallback */}
      {showBlackout && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99998,
            background: '#000',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 16, fontFamily: "'Outfit', sans-serif",
          }}
        >
          <span style={{ fontSize: 'var(--fs-9xl)' }}>🔒</span>
          <div style={{ fontSize: 'var(--fs-4xl)', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Tela protegida</div>
          <div style={{ fontSize: 'var(--fs-xl)', color: 'rgba(255,255,255,0.4)' }}>
            Arquivo sensível detectado: <code style={{ color: '#ef4444' }}>{state.pattern}</code>
          </div>
          <button
            onClick={handleDismiss}
            style={{ marginTop: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: '#fff', fontSize: 'var(--fs-xl)', fontWeight: 600, padding: '10px 28px', cursor: 'pointer' }}
          >
            Liberar tela
          </button>
        </div>
      )}

      {/* Top bar warning (always shows on alert, even when OBS handled it) */}
      {state.alert && !dismissed && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
            background: 'linear-gradient(90deg,#ef444488,#dc262688)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #ef444455',
            padding: '10px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
            fontFamily: "'Outfit', sans-serif",
            animation: 'shield-slide-down 0.3s ease',
          }}
        >
          <span style={{ fontSize: 'var(--fs-5xl)' }}>🚨</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, color: '#fff' }}>
              Arquivo sensível —{' '}
              <span style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.35)', padding: '1px 7px', borderRadius: 4, fontSize: 'var(--fs-lg)' }}>
                {state.pattern}
              </span>
              {obsMode === 'scene' && obsReadyRef.current && (
                <span style={{ marginLeft: 10, fontSize: 'var(--fs-md)', color: '#00b860', fontWeight: 600 }}>· OBS → {localStorage.getItem('obs-brb-scene') || 'Já Volto'}</span>
              )}
            </div>
            <div style={{ fontSize: 'var(--fs-md)', color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
              Feche o arquivo para liberar automaticamente
            </div>
          </div>
          <button
            onClick={handleDismiss}
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, color: '#fff', fontSize: 'var(--fs-lg)', fontWeight: 600, padding: '6px 16px', cursor: 'pointer' }}
          >
            Liberar agora
          </button>
        </div>
      )}

      <style>{`
        @keyframes shield-slide-down {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
