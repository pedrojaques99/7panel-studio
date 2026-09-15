import React, { useState, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import { resolveUrl } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { retroLedStyle } from '../lib/retro-tokens'
import { VintageMeter } from '../lib/vintage-components/VintageMeter'
import { subscribeStretch } from '../lib/stretch-bus'

const PANEL_ID = 'domar'
const DEFAULT_GEO = { x: 300, y: 120, w: 700, h: 0 }

const PHOSPHOR = '#33ff66'
const PHOSPHOR_DIM = '#1a9940'
const AMBER = '#ffaa22'
const RED = '#ef4444'
const SCREEN_BG = '#0a0e08'

/* ── contrato do backend ─────────────────────────────────────────── */

type Medidas = {
  faixa_db: number
  periodo_s: number
  apito_x: number
  tremolo_x: number
}

type Domar = {
  antes: Medidas
  depois: Medidas
  notas: string[]
  af: string
  out: string
  lufs: number
}

type MedidaKey = keyof Medidas

/** O achatador só entra na faixa de ressaca. Fora dela, não mexer é o certo. */
const RESSACA_MIN_S = 1
const RESSACA_MAX_S = 60

const LINHAS: { key: MedidaKey; rotulo: string; escala: number; unidade: string; casas: number }[] = [
  { key: 'faixa_db', rotulo: 'onda', escala: 20, unidade: ' dB', casas: 1 },
  { key: 'apito_x', rotulo: 'apito', escala: 20, unidade: 'x', casas: 1 },
  { key: 'tremolo_x', rotulo: 'tremolo', escala: 10, unidade: 'x', casas: 1 },
  { key: 'periodo_s', rotulo: 'período', escala: 60, unidade: 's', casas: 1 },
]

function num(v: number, casas = 1): string {
  if (!isFinite(v)) return '—'
  return v.toFixed(casas).replace('.', ',')
}

function paraEscalaMeter(v: number, escala: number): number {
  if (!isFinite(v) || escala <= 0) return 0
  return Math.max(0, Math.min(10, (v / escala) * 10))
}

type Julgamento = { cor: string; nota: string }

/**
 * Cor do "depois". Menor é melhor nas quatro medidas — mas em `periodo_s`,
 * e em `faixa_db` quando o período está fora da faixa de ressaca, NÃO mudar
 * é o resultado certo: períodos longos são a respiração da cama e achatar
 * isso deixaria a cama chapada.
 */
function julgar(key: MedidaKey, antes: number, depois: number, periodoS: number): Julgamento {
  const foraDaRessaca = !(periodoS >= RESSACA_MIN_S && periodoS <= RESSACA_MAX_S)
  const igual = Math.abs(depois - antes) <= Math.max(1e-6, Math.abs(antes) * 0.02)
  const melhorou = depois < antes && !igual

  if (key === 'periodo_s') {
    return igual
      ? { cor: PHOSPHOR, nota: 'não mudou — o certo' }
      : { cor: AMBER, nota: 'o período mudou' }
  }

  if (key === 'faixa_db' && foraDaRessaca && igual) {
    return { cor: PHOSPHOR, nota: 'fora da ressaca — não mexer é o certo' }
  }

  if (melhorou) return { cor: PHOSPHOR, nota: 'domou' }
  if (igual) return { cor: AMBER, nota: 'ficou igual' }
  return { cor: RED, nota: 'piorou' }
}

/* ── painel ──────────────────────────────────────────────────────── */

export function DomarPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo(PANEL_ID, DEFAULT_GEO)

  const [path, setPath] = useState('')
  const [out, setOut] = useState('')
  const [estado, setEstado] = useState<'idle' | 'loading' | 'done' | 'err'>('idle')
  const [modo, setModo] = useState<'medir' | 'domar'>('domar')
  const [errMsg, setErrMsg] = useState('')
  const [res, setRes] = useState<Domar | null>(null)

  /* esteira: ESTICAR manda o arquivo pra cá */
  useEffect(() => subscribeStretch(msg => {
    if (msg.stage !== 'domar') return
    setPath(msg.path)
    setRes(null)
    setEstado('idle')
  }), [])

  async function rodar(soMedir: boolean) {
    const p = path.trim()
    if (!p || estado === 'loading') return
    setEstado('loading'); setErrMsg(''); setRes(null); setModo(soMedir ? 'medir' : 'domar')
    try {
      const body: { path: string; out?: string; so_medir?: boolean } = { path: p }
      if (out.trim()) body.out = out.trim()
      if (soMedir) body.so_medir = true
      const r = await fetch(resolveUrl('/api/domar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (data?.error) { setEstado('err'); setErrMsg(String(data.error)); return }
      setRes(data as Domar)
      setEstado('done')
    } catch (e) {
      setEstado('err'); setErrMsg(String(e))
    }
  }

  const periodoS = res?.antes.periodo_s ?? 0
  const foraDaRessaca = res ? !(periodoS >= RESSACA_MIN_S && periodoS <= RESSACA_MAX_S) : false

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || DEFAULT_GEO.w, height: 'auto' }}
      minWidth={640} maxWidth={860}
      enableResizing={{ right: true, left: true }}
      bounds={undefined}
      dragHandleClassName="domar-drag"
      className={`panel-drag${isDragging(PANEL_ID) ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront(PANEL_ID)}
      onDragStop={(_e, d) => { saveGeo(PANEL_ID, { x: d.x, y: d.y }); endDrag(PANEL_ID) }}
      onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo(PANEL_ID, { w: ref.offsetWidth, x: pos.x, y: pos.y })}
      style={{ zIndex: zOf(PANEL_ID, 15) }}
    >
      <div
        onKeyDown={e => e.stopPropagation()}
        onKeyUp={e => e.stopPropagation()}
        style={{
          borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)',
          boxShadow: 'var(--shadow-chassis)', padding: '0 0 16px',
          display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
        }}
      >
        <PanelHeader title="// Domar" onClose={onClose} className="domar-drag">
          <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={retroLedStyle(estado === 'loading', AMBER, '#332800')} title="medindo" />
            <div style={retroLedStyle(estado === 'done', PHOSPHOR, '#1a3320')} title="medido" />
            <div style={retroLedStyle(estado === 'err', RED, '#331111')} title="erro" />
            {res && estado === 'done' && (
              <span style={{ ...mono, color: PHOSPHOR_DIM }}>{num(res.lufs)} LUFS</span>
            )}
          </div>
        </PanelHeader>

        {/* ── Entrada ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 16px' }}>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void rodar(false) }}
            placeholder="caminho do esticado (ou chega pela esteira)"
            style={inp}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              value={out}
              onChange={e => setOut(e.target.value)}
              placeholder="saída (opcional)"
              style={{ ...inp, fontSize: 'var(--fs-sm)' }}
            />
            <button
              onClick={() => void rodar(true)}
              disabled={!path.trim() || estado === 'loading'}
              style={{
                ...btn, opacity: path.trim() ? 1 : 0.4,
                background: 'rgba(255,255,255,0.05)', color: 'var(--text-40)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >SÓ MEDIR</button>
            <button
              onClick={() => void rodar(false)}
              disabled={!path.trim() || estado === 'loading'}
              style={{
                ...btn, opacity: path.trim() ? 1 : 0.4,
                background: 'rgba(26,153,64,0.18)', color: PHOSPHOR,
                border: `1px solid ${PHOSPHOR}55`,
              }}
            >DOMAR</button>
          </div>
        </div>

        {estado === 'loading' && (
          <div style={{ ...telaStyle, alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
            <span style={{ ...mono, color: AMBER, animation: 'domar-pulse 1.2s ease-in-out infinite' }}>
              {modo === 'medir' ? 'medindo…' : 'domando…'}
            </span>
          </div>
        )}

        {estado === 'err' && (
          <div style={{ margin: '0 16px', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span style={{ ...mono, color: RED }}>{errMsg.slice(0, 300)}</span>
          </div>
        )}

        {res && estado === 'done' && (
          <>
            {/* ── A tela É o antes/depois ── */}
            <div style={{ ...telaStyle, gap: 12 }}>
              {LINHAS.map(l => {
                const antes = res.antes[l.key]
                const depois = res.depois[l.key]
                const j = julgar(l.key, antes, depois, periodoS)
                return (
                  <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 66, flexShrink: 0, fontFamily: 'monospace', fontSize: 'var(--fs-sm)',
                      fontWeight: 900, letterSpacing: '0.14em', color: 'var(--text-40)',
                    }}>{l.rotulo}</span>

                    {/* antes */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <VintageMeter label="ANTES" value={paraEscalaMeter(antes, l.escala)} />
                      <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-md)', fontWeight: 900, color: 'var(--text-40)' }}>
                        {num(antes, l.casas)}{l.unidade}
                      </span>
                    </div>

                    <span style={{ flexShrink: 0, fontFamily: 'monospace', fontSize: 'var(--fs-lg)', color: j.cor }}>→</span>

                    {/* depois */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0,
                      borderRadius: 10, padding: 2, border: `1px solid ${j.cor}55`, boxShadow: `0 0 10px ${j.cor}22`,
                    }}>
                      <VintageMeter label="DEPOIS" value={paraEscalaMeter(depois, l.escala)} />
                      <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-md)', fontWeight: 900, color: j.cor }}>
                        {num(depois, l.casas)}{l.unidade}
                      </span>
                    </div>

                    <span style={{ ...mono, color: j.cor, flex: 1, minWidth: 0, whiteSpace: 'normal' }}>{j.nota}</span>
                  </div>
                )
              })}
            </div>

            {/* ── a faixa de ressaca, dita em uma linha ── */}
            <div style={{
              margin: '0 16px', padding: '7px 12px', borderRadius: 8,
              background: 'rgba(51,255,102,0.05)', border: '1px solid rgba(51,255,102,0.14)',
            }}>
              <span style={{ ...mono, color: PHOSPHOR_DIM, whiteSpace: 'normal' }}>
                o achatador só entra na faixa de ressaca ({RESSACA_MIN_S} s – {RESSACA_MAX_S} s).
                {foraDaRessaca
                  ? ` período de ${num(periodoS)} s está fora dela — é a respiração da cama, achatar deixaria a cama chapada. Não mudar é o resultado certo.`
                  : ` período de ${num(periodoS)} s está dentro dela — a onda foi achatada.`}
              </span>
            </div>

            {/* ── log de terminal ── */}
            {res.notas?.length > 0 && (
              <div style={{ ...telaStyle, gap: 2 }}>
                {res.notas.map((n, i) => (
                  <span key={i} style={{ fontFamily: 'monospace', fontSize: 'var(--fs-sm)', color: PHOSPHOR, whiteSpace: 'normal' }}>
                    · {n}
                  </span>
                ))}
              </div>
            )}

            {/* ── saída ── */}
            {(res.out || res.af) && (
              <div style={{ margin: '0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {res.out && (
                  <span
                    onClick={() => navigator.clipboard.writeText(res.out)}
                    title="copiar caminho"
                    style={{ ...mono, color: PHOSPHOR_DIM, cursor: 'pointer', wordBreak: 'break-all', whiteSpace: 'normal' }}
                  >out → {res.out}</span>
                )}
                {res.af && (
                  <span style={{ ...mono, wordBreak: 'break-all', whiteSpace: 'normal' }}>af → {res.af}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes domar-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </Rnd>
  )
}

/* ── estilos locais ──────────────────────────────────────────────── */

const inp: React.CSSProperties = {
  flex: 1, padding: '6px 9px', borderRadius: 'var(--radius-input)',
  border: '1px solid rgba(0,0,0,0.8)', background: 'var(--bg-input)',
  color: 'var(--text-pure)', fontSize: 'var(--fs-md)', outline: 'none',
  boxShadow: 'var(--shadow-input)', fontFamily: 'monospace', minWidth: 0,
}

const btn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 'var(--radius-input)', cursor: 'pointer',
  fontFamily: 'monospace', fontSize: 'var(--fs-sm)', fontWeight: 900,
  letterSpacing: '0.16em', flexShrink: 0,
}

const mono: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 'var(--fs-xs)', color: 'var(--text-20)',
  overflow: 'hidden', textOverflow: 'ellipsis',
}

const telaStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  margin: '0 16px', padding: '12px 14px', borderRadius: 8,
  background: SCREEN_BG, border: '1px solid rgba(255,255,255,0.05)',
}
