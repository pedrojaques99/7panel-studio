import React, { useState, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import { resolveUrl } from '../lib/api'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { retroLedStyle } from '../lib/retro-tokens'
import { VintageMeter } from '../lib/vintage-components/VintageMeter'
import { publishStretch, subscribeStretch, type StretchReceita } from '../lib/stretch-bus'

const PANEL_ID = 'triagem'
const DEFAULT_GEO = { x: 220, y: 90, w: 560, h: 0 }

const PHOSPHOR = '#33ff66'
const PHOSPHOR_DIM = '#1a9940'
const AMBER = '#ffaa22'
const RED = '#ef4444'
const SCREEN_BG = '#0a0e08'

/* ── contrato do backend ─────────────────────────────────────────── */

type PortaoStatus = 'ok' | 'aviso' | 'reprova'

type Portao = {
  nome: string
  rotulo: string
  valor: number
  limiar: number
  status: PortaoStatus
  unidade: string
  obs: string
}

type Destino = 'eno' | 'aphex' | 'mount-shrine'

type Receita = StretchReceita & {
  ambiencia?: string
  nivel_ambiencia?: number
}

type Triagem = {
  arquivo: string
  dur_s: number
  pulso: number
  pulso_proxy: boolean
  apito_hz: number
  apito_x: number
  apito_estab: number
  cpp: number
  centroid_hz: number
  flatness: number
  corr: number
  veredito: string
  destino: Destino
  receita: Receita
  portoes: Portao[]
  af_notch: string
  erros: string[]
}

type AssetFile = { name: string; path: string }

const DESTINOS: { id: Destino; label: string }[] = [
  { id: 'eno', label: 'ENO' },
  { id: 'aphex', label: 'APHEX' },
  { id: 'mount-shrine', label: 'MOUNT-SHRINE' },
]

/* ── formatação pt-BR de terminal ────────────────────────────────── */

function num(v: number, casas = 2): string {
  if (!isFinite(v)) return '—'
  return v.toFixed(casas).replace('.', ',')
}

/** 4500 → "4,5k" · 13000 → "13k" · 800 → "800" */
function khz(v: number): string {
  if (!isFinite(v)) return '—'
  if (v < 1000) return String(Math.round(v))
  const k = v / 1000
  const s = (Math.round(k * 10) / 10).toFixed(1).replace('.', ',')
  return `${s.endsWith(',0') ? s.slice(0, -2) : s}k`
}

function linhaReceita(r: Receita): string {
  return `→ esticar x${r.esticar} · janela ${num(r.janela)} s · −${num(r.escuro_db, 0)} dB @${khz(r.escuro_hz)} · teto ${khz(r.teto_hz)}`
}

function corDoStatus(s: PortaoStatus): string {
  return s === 'ok' ? PHOSPHOR : s === 'aviso' ? AMBER : RED
}

/** O VintageMeter só fala 0–10. Ancoramos o limiar no meio da escala. */
function paraEscalaMeter(valor: number, limiar: number): number {
  if (!isFinite(valor)) return 0
  const v = limiar > 0 ? (valor / limiar) * 5 : valor
  return Math.max(0, Math.min(10, v))
}

/* ── veredito ────────────────────────────────────────────────────── */

const VEREDITOS: Record<string, { cor: string; rotulo: string; obs: string; bloqueia: boolean }> = {
  'pronto': { cor: PHOSPHOR, rotulo: 'PRONTO', obs: 'fonte limpa — pode esticar', bloqueia: false },
  'achatar': { cor: AMBER, rotulo: 'ACHATAR', obs: 'tem ressaca de amplitude — achate antes de mandar pro destino', bloqueia: false },
  'notchar': { cor: AMBER, rotulo: 'NOTCHAR', obs: 'tem apito na fonte — o notch entra junto com o esticar', bloqueia: false },
  'nao-estica': { cor: RED, rotulo: 'NÃO ESTICA', obs: 'a fonte reprova nos portões — esticar só vai amplificar o defeito', bloqueia: true },
}

function vereditoInfo(v: string) {
  return VEREDITOS[v] ?? { cor: AMBER, rotulo: v.toUpperCase(), obs: 'veredito desconhecido', bloqueia: false }
}

/* ── painel ──────────────────────────────────────────────────────── */

export function TriagemPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo(PANEL_ID, DEFAULT_GEO)

  const [path, setPath] = useState('')
  const [estado, setEstado] = useState<'idle' | 'loading' | 'done' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [res, setRes] = useState<Triagem | null>(null)

  const [assets, setAssets] = useState<AssetFile[]>([])
  const [showAssets, setShowAssets] = useState(false)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetQuery, setAssetQuery] = useState('')

  /* esteira: SEED manda o arquivo pra cá */
  useEffect(() => subscribeStretch(msg => {
    if (msg.stage !== 'triagem') return
    setPath(msg.path)
    setRes(null)
    setEstado('idle')
  }), [])

  const carregarAcervo = useCallback(async () => {
    setAssetsLoading(true)
    try {
      const r = await fetch(resolveUrl('/api/assets/list'))
      const data = await r.json()
      setAssets(Array.isArray(data) ? data as AssetFile[] : [])
    } catch { setAssets([]) }
    setAssetsLoading(false)
  }, [])

  function toggleAssets() {
    setShowAssets(v => {
      if (!v && assets.length === 0) void carregarAcervo()
      return !v
    })
  }

  async function triar() {
    const p = path.trim()
    if (!p || estado === 'loading') return
    setEstado('loading'); setErrMsg(''); setRes(null)
    try {
      const r = await fetch(resolveUrl('/api/triagem'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }),
      })
      const data = await r.json()
      if (data?.error) { setEstado('err'); setErrMsg(String(data.error)); return }
      setRes(data as Triagem)
      setEstado('done')
    } catch (e) {
      setEstado('err'); setErrMsg(String(e))
    }
  }

  function esticar() {
    if (!res) return
    if (vereditoInfo(res.veredito).bloqueia) return
    publishStretch({
      stage: 'esticar',
      path: path.trim(),
      destino: res.destino,
      receita: {
        esticar: res.receita.esticar,
        janela: res.receita.janela,
        escuro_hz: res.receita.escuro_hz,
        escuro_db: res.receita.escuro_db,
        teto_hz: res.receita.teto_hz,
      },
    })
  }

  const info = res ? vereditoInfo(res.veredito) : null
  const bloqueado = !res || estado !== 'done' || !!info?.bloqueia
  const assetsFiltrados = assets.filter(a =>
    a.name.toLowerCase().includes(assetQuery.toLowerCase())
  ).slice(0, 120)

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w || DEFAULT_GEO.w, height: 'auto' }}
      minWidth={480} maxWidth={720}
      enableResizing={{ right: true, left: true }}
      bounds={undefined}
      dragHandleClassName="triagem-drag"
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
        <PanelHeader title="// Triagem" onClose={onClose} className="triagem-drag">
          <div onMouseDown={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={retroLedStyle(estado === 'loading', AMBER, '#332800')} title="medindo" />
            <div style={retroLedStyle(estado === 'done' && !info?.bloqueia, PHOSPHOR, '#1a3320')} title="pronto" />
            <div style={retroLedStyle(estado === 'err' || !!info?.bloqueia, RED, '#331111')} title="reprova" />
          </div>
        </PanelHeader>

        {/* ── 1. Barra de entrada ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              value={path}
              onChange={e => setPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void triar() }}
              placeholder="caminho do arquivo no disco"
              style={inp}
            />
            <button onClick={toggleAssets} style={{ ...actionBtn, color: showAssets ? PHOSPHOR : 'var(--text-40)' }} title="Acervo">📁</button>
            <button
              onClick={() => void triar()}
              disabled={!path.trim() || estado === 'loading'}
              style={{
                ...actionBtn, width: 'auto', padding: '0 14px',
                background: estado === 'loading' ? 'rgba(255,170,34,0.15)' : 'rgba(26,153,64,0.18)',
                color: estado === 'loading' ? AMBER : PHOSPHOR,
                opacity: path.trim() ? 1 : 0.4,
                fontFamily: 'monospace', letterSpacing: '0.14em', fontSize: 'var(--fs-sm)',
              }}
            >
              {estado === 'loading' ? '⏳' : 'TRIAR'}
            </button>
          </div>

          {showAssets && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 4, padding: 8, borderRadius: 8,
              background: SCREEN_BG, border: '1px solid rgba(51,255,102,0.12)',
            }}>
              <input
                value={assetQuery}
                onChange={e => setAssetQuery(e.target.value)}
                placeholder="filtrar acervo…"
                style={{ ...inp, fontSize: 'var(--fs-sm)' }}
              />
              <div onWheel={e => e.stopPropagation()} style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {assetsLoading && <span style={mono}>carregando acervo…</span>}
                {!assetsLoading && assetsFiltrados.length === 0 && <span style={mono}>nada no acervo</span>}
                {assetsFiltrados.map(a => (
                  <button
                    key={a.path}
                    onClick={() => { setPath(a.path); setShowAssets(false) }}
                    style={{
                      textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer',
                      color: PHOSPHOR_DIM, fontFamily: 'monospace', fontSize: 'var(--fs-sm)',
                      padding: '3px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >{a.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── carregando ── */}
        {estado === 'loading' && (
          <div style={{ ...telaStyle, alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
            <span style={{ ...mono, color: AMBER, animation: 'triagem-pulse 1.2s ease-in-out infinite' }}>
              medindo a fonte… (~5 s)
            </span>
          </div>
        )}

        {/* ── erro de requisição ── */}
        {estado === 'err' && (
          <div style={{ margin: '0 16px', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span style={{ ...mono, color: RED }}>{errMsg.slice(0, 300)}</span>
          </div>
        )}

        {res && estado === 'done' && (
          <>
            {/* ── erros do backend (não quebram o resto) ── */}
            {res.erros?.length > 0 && (
              <div style={{ margin: '0 16px', padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {res.erros.map((er, i) => (
                  <span key={i} style={{ ...mono, color: RED }}>! {er}</span>
                ))}
              </div>
            )}

            {/* ── o veredito é UMA COR ── */}
            <div style={{
              margin: '0 16px', padding: '10px 14px', borderRadius: 8,
              background: `${info!.cor}14`, border: `1px solid ${info!.cor}55`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                background: info!.cor, boxShadow: `0 0 12px ${info!.cor}`,
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-lg)', fontWeight: 900, letterSpacing: '0.2em', color: info!.cor }}>
                  {info!.rotulo}
                </span>
                <span style={{ ...mono, color: 'var(--text-40)' }}>{info!.obs}</span>
              </div>
              <span style={{ ...mono, marginLeft: 'auto', flexShrink: 0, textAlign: 'right' }}>
                {res.arquivo}<br />{num(res.dur_s, 1)} s
              </span>
            </div>

            {/* ── 2. Quatro medidores ── */}
            <div style={{ ...telaStyle, gap: 10 }}>
              {res.portoes.map(p => {
                const cor = corDoStatus(p.status)
                return (
                  <div key={p.nome} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 76, flexShrink: 0, fontFamily: 'monospace', fontSize: 'var(--fs-sm)',
                      fontWeight: 900, letterSpacing: '0.14em', color: cor, textShadow: `0 0 8px ${cor}55`,
                    }}>{p.rotulo}</span>

                    <div style={{
                      flexShrink: 0, borderRadius: 10, padding: 2,
                      border: `1px solid ${cor}55`, boxShadow: `0 0 10px ${cor}22`,
                    }}>
                      <VintageMeter label={p.rotulo} value={paraEscalaMeter(p.valor, p.limiar)} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-lg)', fontWeight: 900, color: cor }}>
                        {num(p.valor)}{p.unidade}
                      </span>
                      <span style={{ ...mono }}>limiar {num(p.limiar)}{p.unidade}</span>
                      <span style={{ ...mono, color: 'var(--text-40)', whiteSpace: 'normal' }}>{p.obs}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── 3. Destino ── */}
            <div style={{ display: 'flex', gap: 6, padding: '0 16px', flexWrap: 'wrap' }}>
              {DESTINOS.map(d => {
                const on = d.id === res.destino
                return (
                  <span key={d.id} style={{
                    padding: '4px 12px', borderRadius: 99,
                    fontFamily: 'monospace', fontSize: 'var(--fs-sm)', fontWeight: 900, letterSpacing: '0.16em',
                    background: on ? 'rgba(51,255,102,0.14)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${on ? `${PHOSPHOR}66` : 'rgba(255,255,255,0.07)'}`,
                    color: on ? PHOSPHOR : '#555',
                    boxShadow: on ? `0 0 10px ${PHOSPHOR}33` : 'none',
                  }}>{d.label}</span>
                )
              })}
            </div>

            {/* ── 4. Receita ── */}
            <div style={{ margin: '0 16px', padding: '8px 12px', borderRadius: 8, background: SCREEN_BG, border: '1px solid rgba(51,255,102,0.1)' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 'var(--fs-base)', color: PHOSPHOR, letterSpacing: '0.04em' }}>
                {linhaReceita(res.receita)}
              </div>
              {(res.receita.ambiencia || res.af_notch) && (
                <div style={{ ...mono, marginTop: 4 }}>
                  {res.receita.ambiencia && <>ambiência {res.receita.ambiencia} @ {num(res.receita.nivel_ambiencia ?? 0, 0)} dB<br /></>}
                  {res.af_notch && <span style={{ wordBreak: 'break-all' }}>notch {res.af_notch}</span>}
                </div>
              )}
            </div>

            {/* ── 5. Botão grande ── */}
            <div style={{ padding: '0 16px' }}>
              <button
                onClick={esticar}
                disabled={bloqueado}
                title={info!.bloqueia ? info!.obs : undefined}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 8, border: `1px solid ${info!.cor}66`,
                  background: info!.bloqueia ? 'rgba(239,68,68,0.08)' : `${info!.cor}1f`,
                  color: info!.cor, cursor: info!.bloqueia ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace', fontSize: 'var(--fs-lg)', fontWeight: 900, letterSpacing: '0.28em',
                  opacity: info!.bloqueia ? 0.65 : 1,
                  boxShadow: info!.bloqueia ? 'none' : `0 0 16px ${info!.cor}22`,
                }}
              >
                {info!.bloqueia ? 'NÃO ESTICA' : 'ESTICAR →'}
              </button>
              <div style={{ ...mono, marginTop: 5, textAlign: 'center', color: info!.bloqueia ? RED : 'var(--text-40)' }}>
                {info!.bloqueia
                  ? info!.obs
                  : res.veredito === 'pronto'
                    ? `manda pro ${res.destino}`
                    : `⚠ ${info!.obs}`}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes triagem-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </Rnd>
  )
}

/* ── estilos locais (mesmo vocabulário de PaulstretchPanel) ──────── */

const inp: React.CSSProperties = {
  flex: 1, padding: '6px 9px', borderRadius: 'var(--radius-input)',
  border: '1px solid rgba(0,0,0,0.8)', background: 'var(--bg-input)',
  color: 'var(--text-pure)', fontSize: 'var(--fs-md)', outline: 'none',
  boxShadow: 'var(--shadow-input)', fontFamily: 'monospace', minWidth: 0,
}

const actionBtn: React.CSSProperties = {
  width: 34, height: 30, border: 'none', borderRadius: 'var(--radius-input)',
  cursor: 'pointer', background: 'var(--bg-key-off)', color: 'var(--text-40)',
  fontSize: 'var(--fs-lg)', fontWeight: 800, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
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
