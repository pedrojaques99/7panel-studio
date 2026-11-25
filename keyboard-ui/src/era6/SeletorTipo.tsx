/**
 * Tipo da camada: textura, melodia ou percussão (PLANO-tipos-camada-era6.md). Três botões
 * colados, feitos com o `estilo.botao` da era6. Não é peça do design system.
 */
import type { TipoCamada } from './modelo'
import { estilo } from './estilo'

const OPCOES: { tipo: TipoCamada; curto: string; nome: string }[] = [
  { tipo: 'textura', curto: 'tex', nome: 'texture: a cloud of grains' },
  { tipo: 'melodia', curto: 'mel', nome: 'melody: notes on a scale, played from the sample' },
  { tipo: 'percussao', curto: 'perc', nome: 'percussion: euclidean hits cut from the sample' },
]

export function SeletorTipo({ tipo, onTipo }: { tipo: TipoCamada; onTipo: (t: TipoCamada) => void }) {
  return (
    <div role="radiogroup" aria-label="layer type" style={{ display: 'flex', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      {OPCOES.map((o, k) => (
        <button key={o.tipo} type="button" role="radio" aria-checked={tipo === o.tipo} title={o.nome}
          onClick={() => onTipo(o.tipo)}
          style={{ ...estilo.botao(tipo === o.tipo), ...estilo.rotulo, fontSize: 9, padding: '6px 7px', marginLeft: k ? -1 : 0, color: tipo === o.tipo ? 'var(--vintage-value)' : undefined }}>
          {o.curto}
        </button>
      ))}
    </div>
  )
}
