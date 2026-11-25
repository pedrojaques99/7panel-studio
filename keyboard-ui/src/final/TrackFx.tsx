/**
 * Rack da trilha selecionada, no painel de baixo: o mesmo `EffectsRack` da SynthPanel
 * (drive, bite, crush, denoise, cutoff, chorus, phaser, delay, shimmer, reverb) + EQ de
 * três bandas. Composição de peças existentes, nenhuma editada.
 *
 * Um gesto de knob = um ⌘Z: a prévia vai pelo `arrasto` e fecha 300 ms depois do último
 * movimento (os knobs não avisam quando soltam).
 */
import { useCallback, useEffect, useRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { EffectsRack } from '../lib/EffectsRack'
import type { FxParams } from '../lib/fx-rack'
import { estilo } from '../era6/estilo'
import { mudarTrilha, type Eq3, type Projeto, type Trilha } from './modelo'
import { fxDe } from './motor'
import type { Arrasto } from './Arranjo'

const EQ0: Eq3 = { low: 0, mid: 0, high: 0 }
const fmtDb = (v: number) => (Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)

export function TrackFx({ trilha, arrasto, onMudar }: {
  trilha: Trilha; arrasto: Arrasto; onMudar: (p: Projeto) => void
}) {
  const trilhaId = trilha.id
  const base = useRef<Projeto | null>(null)
  const timer = useRef<number | null>(null)

  const fechar = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    if (base.current) arrasto.fim(base.current)
    base.current = null
  }, [arrasto])
  useEffect(() => fechar, [fechar, trilha.id])

  const gesto = useCallback((f: (t: Trilha) => Trilha) => {
    if (!base.current) base.current = arrasto.comecar()
    arrasto.previa(mudarTrilha(arrasto.comecar(), trilhaId, f))
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fechar, 300)
  }, [arrasto, fechar, trilhaId])

  const mudarFx = useCallback((patch: Partial<FxParams>) => gesto(t => ({ ...t, fx: { ...t.fx, ...patch } })), [gesto])
  const mudarEq = (banda: keyof Eq3, v: number) => gesto(t => ({ ...t, eq: { ...EQ0, ...t.eq, [banda]: Math.abs(v) < 0.25 ? 0 : v } }))
  const eq = { ...EQ0, ...trilha.eq }
  const ativo = !!trilha.fx || !!trilha.eq

  return (
    <div aria-label={`track fx ${trilha.nome}`} style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, borderLeft: '1px solid var(--vintage-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderBottom: '1px solid var(--vintage-border)' }}>
        <span style={{ ...estilo.rotulo, color: 'var(--vintage-accent)' }}>track fx</span>
        <span style={{ color: 'var(--vintage-value)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trilha.nome}</span>
        <button type="button" disabled={!ativo} onClick={() => { fechar(); onMudar(mudarTrilha(arrasto.comecar(), trilha.id, t => ({ ...t, fx: undefined, eq: undefined }))) }}
          style={{ ...estilo.botaoIcone(), marginLeft: 'auto', opacity: ativo ? 1 : 0.35 }} aria-label="reset track fx" title="reset fx (bypass)">
          <RotateCcw size={13} />
        </button>
      </div>
      <div style={{ overflow: 'auto', padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center', paddingTop: 6 }}>
          <span style={estilo.rotulo}>eq</span>
          <VintageKnob size={38} label="high" min={-12} max={12} value={eq.high} fmt={fmtDb} onChange={v => mudarEq('high', v)} />
          <VintageKnob size={38} label="mid" min={-12} max={12} value={eq.mid} fmt={fmtDb} onChange={v => mudarEq('mid', v)} />
          <VintageKnob size={38} label="low" min={-12} max={12} value={eq.low} fmt={fmtDb} onChange={v => mudarEq('low', v)} />
        </div>
        <div style={{ minWidth: 360, flex: 1 }}>
          <EffectsRack params={fxDe(trilha)} onChange={mudarFx} knobSize={40} />
        </div>
      </div>
    </div>
  )
}
