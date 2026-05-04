import React, { useState, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import { loadGeo, saveGeo } from '../lib/geo'
import { API } from '../lib/api'
import { usePanelCtx } from '../lib/panel-context'
import { PanelHeader } from '../lib/PanelHeader'

export type BriefingData = {
  client: string; contact: string; deadline: string; budget: string; privateNotes: string
  projectName: string; type: string; forDesc: string; keywords: string
  deliverables: string; phase: string
  visible: boolean
  showName: boolean; showType: boolean; showFor: boolean
  showKeywords: boolean; showDeliverables: boolean; showPhase: boolean
}

export type TickerConfig = {
  speed: number
  logoText: string
  logoUrl: string
  separator: string
  height: number
  bgOpacity: number
  fontSize: number
  fontWeight: number
  textColor: string
  accentColor: string
  extraItems: string   // linhas extras livres, separadas por \n
}

const defaultTicker: TickerConfig = {
  speed: 120,
  logoText: 'jaques',
  logoUrl: '',
  separator: '◆',
  height: 40,
  bgOpacity: 72,
  fontSize: 14,
  fontWeight: 500,
  textColor: '#ffffffa6',
  accentColor: '#00b860',
  extraItems: '',
}

function loadTicker(): TickerConfig {
  try {
    const r = localStorage.getItem('overlay:ticker')
    if (r) return { ...defaultTicker, ...JSON.parse(r) }
  } catch { /* noop */ }
  return defaultTicker
}

function saveTicker(c: TickerConfig) {
  localStorage.setItem('overlay:ticker', JSON.stringify(c))
  fetch(`${API}/api/overlay/ticker`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).catch(() => {})
}

const PHASES = ['Briefing', 'Pesquisa', 'Conceituação', 'Refinamento', 'Apresentação', 'Entrega']
const TYPES = ['Identidade Visual', 'Redesign', 'Campanha', 'Motion', 'Web', 'Embalagem', 'Editorial']

const defaultData: BriefingData = {
  client: '', contact: '', deadline: '', budget: '', privateNotes: '',
  projectName: '', type: 'Identidade Visual', forDesc: '', keywords: '',
  deliverables: '', phase: 'Briefing',
  visible: false,
  showName: true, showType: true, showFor: true,
  showKeywords: true, showDeliverables: true, showPhase: true,
}

function loadBriefing(): BriefingData {
  try { const r = localStorage.getItem('briefing'); if (r) return { ...defaultData, ...JSON.parse(r) } } catch { /* noop */ }
  return defaultData
}

function saveBriefing(d: BriefingData) {
  localStorage.setItem('briefing', JSON.stringify(d))
  localStorage.setItem('overlay:briefing', JSON.stringify(d))
  fetch(`${API}/api/overlay/briefing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }).catch(() => {})
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontSize: 'var(--fs-md)',
  padding: '6px 14px', cursor: 'pointer', width: '100%',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-chassis)',
  border: '1px solid rgba(255,255,255,0.07)',
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

export function BriefingPanel({ onClose }: { onClose: () => void }) {
  const { zOf, bringToFront, endDrag, isDragging, scale } = usePanelCtx()
  const geo = loadGeo('briefing', { x: 460, y: 20, w: 380, h: 620 })
  const [d, setD] = useState<BriefingData>(loadBriefing)
  const [tab, setTab] = useState<'public' | 'private' | 'ticker'>('public')
  const [tk, setTk] = useState<TickerConfig>(loadTicker)

  // Push current state to Flask on mount so overlay is up-to-date after server restart
  useEffect(() => {
    saveBriefing(d)
    saveTicker(tk)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateTicker(patch: Partial<TickerConfig>) {
    const next = { ...tk, ...patch }
    setTk(next)
    saveTicker(next)
  }

  function update(patch: Partial<BriefingData>) {
    const next = { ...d, ...patch }
    setD(next)
    saveBriefing(next)
  }

  const phaseIdx = PHASES.indexOf(d.phase)

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: geo.h }}
      minWidth={340} minHeight={400}
      bounds={undefined}
      scale={scale}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging('briefing') ? ' dragging' : ''}`}
      onDragStart={() => bringToFront('briefing')}
      onDragStop={(_, dd) => { saveGeo('briefing', { x: dd.x, y: dd.y }); endDrag('briefing') }}
      onResizeStop={(_, __, ref, ___, pos) => saveGeo('briefing', { x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })}
      style={{ zIndex: zOf('briefing', 100) }}
    >
      <div style={{ ...panelStyle, height: '100%' }}>
        <PanelHeader title="Briefing" onClose={onClose} className="drag-handle">
          <button
            onClick={() => update({ visible: !d.visible })}
            title={d.visible ? 'Ocultar do overlay' : 'Mostrar no overlay'}
            style={{ background: d.visible ? '#00b86022' : 'rgba(255,255,255,0.06)', border: `1px solid ${d.visible ? '#00b86055' : 'rgba(255,255,255,0.1)'}`, borderRadius: 'var(--radius-xs)', padding: '3px 10px', cursor: 'pointer', fontSize: 'var(--fs-md)', color: d.visible ? '#00b860' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
            {d.visible ? 'Ao vivo' : 'Oculto'}
          </button>
        </PanelHeader>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          {([['public','Público'],['private','Privado'],['ticker','Ticker']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', fontSize: 'var(--fs-md)', fontWeight: tab === t ? 700 : 400, color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)', borderBottom: `2px solid ${tab === t ? '#00b860' : 'transparent'}`, transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'private' ? (
            <>
              <Field label="Cliente" value={d.client} onChange={v => update({ client: v })} placeholder="Nome do cliente" />
              <Field label="Contato" value={d.contact} onChange={v => update({ contact: v })} placeholder="Email ou WhatsApp" />
              <Field label="Prazo" value={d.deadline} onChange={v => update({ deadline: v })} placeholder="Ex: 15/05/2025" />
              <Field label="Valor" value={d.budget} onChange={v => update({ budget: v })} placeholder="R$ 0.000" />
              <div>
                <div style={labelStyle}>Notas privadas</div>
                <textarea
                  value={d.privateNotes}
                  onChange={e => update({ privateNotes: e.target.value })}
                  placeholder="Observações, restrições, pedidos especiais..."
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
            </>
          ) : tab === 'public' ? (
            <>
              {/* Phase bar */}
              <div>
                <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>Fase atual</span>
                  <span style={{ color: '#00b860', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{d.phase}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {PHASES.map((p, i) => (
                    <button key={p} onClick={() => update({ phase: p })} title={p} style={{ flex: 1, height: 6, borderRadius: 4, cursor: 'pointer', border: 'none', background: i <= phaseIdx ? '#00b860' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }} />
                  ))}
                </div>
              </div>

              <ToggleField label="Nome do projeto" value={d.projectName} show={d.showName} onToggle={() => update({ showName: !d.showName })} onChange={v => update({ projectName: v })} placeholder="Ex: Projeto Moda SS25" />

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={labelStyle}>Tipo</span>
                  <EyeToggle show={d.showType} onToggle={() => update({ showType: !d.showType })} />
                </div>
                <select value={d.type} onChange={e => update({ type: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <ToggleField label="Para quem" value={d.forDesc} show={d.showFor} onToggle={() => update({ showFor: !d.showFor })} onChange={v => update({ forDesc: v })} placeholder="Ex: marca de moda sustentável" />
              <ToggleField label="Keywords visuais" value={d.keywords} show={d.showKeywords} onToggle={() => update({ showKeywords: !d.showKeywords })} onChange={v => update({ keywords: v })} placeholder="Ex: moderno, bold, feminino" />
              <ToggleField label="Entregáveis" value={d.deliverables} show={d.showDeliverables} onToggle={() => update({ showDeliverables: !d.showDeliverables })} onChange={v => update({ deliverables: v })} placeholder="Ex: Logo, Manual, Papelaria" />
            </>
          ) : tab === 'ticker' ? (
            <>
              <SliderField label="Velocidade (px/s)" value={tk.speed} min={10} max={200} step={5} onChange={v => updateTicker({ speed: v })} />
              <SliderField label="Altura (px)" value={tk.height} min={28} max={80} step={2} onChange={v => updateTicker({ height: v })} />
              <SliderField label="Fonte (px)" value={tk.fontSize} min={9} max={20} step={1} onChange={v => updateTicker({ fontSize: v })} />
              <SliderField label="Peso da fonte" value={tk.fontWeight} min={300} max={800} step={100} onChange={v => updateTicker({ fontWeight: v })} />
              <SliderField label="Fundo opacidade (%)" value={tk.bgOpacity} min={0} max={100} step={5} onChange={v => updateTicker({ bgOpacity: v })} />
              <Field label="Separador" value={tk.separator} onChange={v => updateTicker({ separator: v })} placeholder="◆" />
              <Field label="Texto do logo" value={tk.logoText} onChange={v => updateTicker({ logoText: v })} placeholder="seu nome" />
              <Field label="Logo (URL imagem)" value={tk.logoUrl} onChange={v => updateTicker({ logoUrl: v })} placeholder="http://... ou deixe vazio" />
              <ColorField label="Cor do texto" value={tk.textColor} onChange={v => updateTicker({ textColor: v })} />
              <ColorField label="Cor de destaque" value={tk.accentColor} onChange={v => updateTicker({ accentColor: v })} />
              <div>
                <div style={labelStyle}>Itens extras (um por linha)</div>
                <textarea
                  value={tk.extraItems}
                  onChange={e => updateTicker({ extraItems: e.target.value })}
                  placeholder={"Twitch: /seucanal\nDiscord: discord.gg/xxx"}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
              <button onClick={() => updateTicker(defaultTicker)} style={ghostBtnStyle}>Restaurar padrões</button>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <button onClick={() => update({ ...defaultData, visible: false })} style={ghostBtnStyle}>Novo projeto</button>
        </div>
      </div>
    </Rnd>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </div>
  )
}

function ToggleField({ label, value, show, onToggle, onChange, placeholder }: { label: string; value: string; show: boolean; onToggle: () => void; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={labelStyle}>{label}</span>
        <EyeToggle show={show} onToggle={onToggle} />
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, opacity: show ? 1 : 0.4 }} />
    </div>
  )
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={show ? 'Visível no overlay' : 'Oculto no overlay'} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-md)', opacity: show ? 1 : 0.35, padding: 0, color: show ? '#00b860' : 'rgba(255,255,255,0.6)', fontWeight: 600, letterSpacing: '0.04em' }}>
      {show ? '●' : '○'}
    </button>
  )
}

function SliderField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: '#00b860', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#00b860', cursor: 'pointer' }}
      />
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={value.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#ffffff'} onChange={e => onChange(e.target.value)}
          style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'none', cursor: 'pointer', padding: 2 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 'var(--fs-lg)' }} placeholder="#ffffff" />
      </div>
    </div>
  )
}
