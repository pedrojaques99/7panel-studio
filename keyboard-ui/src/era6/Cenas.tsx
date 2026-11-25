/**
 * Cenas A/B/C. Cada slot é um botão só: vazio guarda, cheio faz o morph até ele. Regravar é o
 * ícone que aparece no hover/foco do slot, com o botão direito de atalho (mesma convenção da deriva). Dentro do slot fica a "digital" da cena:
 * 6 barras com a densidade de cada camada, na cor do sample. Duas cenas diferentes se
 * reconhecem de relance, sem nome nem texto.
 */
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { FIBO, FAIXA, type Cena } from './modelo'
import type { RGB } from './pintura'
import { estilo } from './estilo'

const TEMPOS = FIBO.slice(2)   // 3 … 55 s

function Digital({ cena, cores }: { cena: Cena; cores: RGB[] }) {
  const { min, max } = FAIXA.dens
  return (
    <svg viewBox="0 0 60 22" width="100%" height={22} aria-hidden>
      {cena.map((c, i) => {
        // altura = densidade (log); camada calada vira traço mínimo
        const h = c.nivel <= -45 ? 1 : 2 + 18 * (Math.log(c.dens / min) / Math.log(max / min))
        const [r, g, b] = cores[i] ?? [120, 120, 120]
        return <rect key={i} x={i * 10 + 1} y={22 - h} width={7} height={h} fill={`rgb(${r | 0},${g | 0},${b | 0})`} opacity={0.85} />
      })}
    </svg>
  )
}

export function Cenas({ cenas, cores, morphS, progresso, alvo, onGuardar, onIr, onTempo }: {
  cenas: (Cena | null)[]
  cores: (RGB[] | null)[]
  morphS: number
  progresso: number | null
  alvo: number | null
  onGuardar: (k: number) => void
  onIr: (k: number) => void
  onTempo: (s: number) => void
}) {
  const i = TEMPOS.indexOf(morphS as (typeof TEMPOS)[number])
  const passo = (d: number) => onTempo(TEMPOS[Math.min(TEMPOS.length - 1, Math.max(0, i + d))])
  return (
    <section style={estilo.painel}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ ...estilo.rotulo, flex: 1 }}>scenes</span>
        <button type="button" aria-label="shorter morph" onClick={() => passo(-1)} style={estilo.botaoIcone()}><ChevronLeft size={12} /></button>
        <span style={{ ...estilo.rotulo, color: 'var(--vintage-value)', minWidth: 64, textAlign: 'center' }}>morph {morphS}s</span>
        <button type="button" aria-label="longer morph" onClick={() => passo(1)} style={estilo.botaoIcone()}><ChevronRight size={12} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {['A', 'B', 'C'].map((l, k) => {
          const cena = cenas[k]
          const indo = alvo === k && progresso !== null
          return (
            <div key={l} className="era6-item" style={{ position: 'relative' }}>
              <button type="button"
                title={cena ? `morph to ${l} (right-click to overwrite)` : `store the desk in ${l}`}
                onClick={() => (cena ? onIr(k) : onGuardar(k))}
                onContextMenu={e => { e.preventDefault(); onGuardar(k) }}
                style={{
                  ...estilo.botao(!!cena), width: '100%', display: 'grid', gap: 6, padding: 8, position: 'relative', overflow: 'hidden',
                  borderStyle: cena ? 'solid' : 'dashed', justifyItems: 'stretch',
                }}>
                <span style={{ font: '600 13px/1 var(--font-vintage-display, sans-serif)', textAlign: 'left' }}>{l}</span>
                {cena
                  ? <Digital cena={cena} cores={cores[k] ?? []} />
                  : <span style={{ ...estilo.rotulo, fontSize: 9, height: 22, display: 'flex', alignItems: 'end' }}>store</span>}
                {indo && (
                  <span style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${progresso! * 100}%`, background: 'var(--vintage-accent)' }} />
                )}
              </button>
              {cena && (
                <button type="button" className="era6-so-hover" aria-label={`overwrite ${l}`} title={`overwrite ${l} with the current desk`}
                  onClick={() => onGuardar(k)} style={{ ...estilo.botaoIcone(), position: 'absolute', top: 3, right: 3 }}>
                  <RotateCcw size={11} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
