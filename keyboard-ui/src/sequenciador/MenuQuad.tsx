/**
 * Menu em quatro quadrantes em volta do cursor (hotbox): glifo em cima, acento à direita,
 * duração embaixo, apagar/fechar à esquerda. Abre num clique ou segurando ~350 ms na célula.
 */
import { useEffect, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import { FORMAS, desenharForma } from '@jaques/padroes'
import { Button } from '@/components/ui/button'
import { DURACOES } from './estado'

export interface AlvoMenu {
  x: number
  y: number
  col: number
  row: number
  /** índice da nota existente, ou -1 se a célula está vazia */
  indice: number
  glifo: number
  acento: boolean
  dur: (typeof DURACOES)[number]['id']
}

interface Props {
  alvo: AlvoMenu
  onGlifo: (g: number) => void
  onAcento: (a: boolean) => void
  onDur: (d: AlvoMenu['dur']) => void
  onApagar: () => void
  onFechar: () => void
}

/** prévia da forma do motor (traço fino), na cor do texto do botão */
export function IconeForma({ indice, tamanho = 22 }: { indice: number; tamanho?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const dpr = window.devicePixelRatio || 1, lado = tamanho * dpr
    cv.width = cv.height = Math.round(lado)
    const cor = getComputedStyle(cv).color
    ctx.clearRect(0, 0, lado, lado)
    ctx.strokeStyle = cor; ctx.fillStyle = cor
    desenharForma(ctx, indice, lado / 2, lado / 2, lado * 0.92, 1, Math.max(1, dpr))
  })
  return <canvas ref={ref} aria-hidden style={{ width: tamanho, height: tamanho }} />
}

const quad = 'seq-quad absolute w-max flex gap-1 p-1.5 border border-[var(--seq-linha)] bg-black'

export function MenuQuad({ alvo, onGlifo, onAcento, onDur, onApagar, onFechar }: Props) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onFechar])

  const existe = alvo.indice >= 0
  return (
    <div className="fixed inset-0 z-50" onPointerDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="absolute" style={{ left: alvo.x, top: alvo.y }} role="menu" aria-label={`célula ${alvo.col + 1}, linha ${alvo.row + 1}`}>
        {/* mira no centro */}
        <div className="absolute -left-2 top-0 w-4 h-px bg-[var(--seq-ciano)]" />
        <div className="absolute left-0 -top-2 w-px h-4 bg-[var(--seq-ciano)]" />
        {/* cima: glifo */}
        <div className={`${quad} -translate-x-1/2 bottom-10 flex-col items-center`} style={{ left: 0 }}>
          <span className="seq-rotulo">forma</span>
          <div className="grid grid-cols-4 gap-1">
            {FORMAS.map((g, i) => (
              <Button key={g.nome} variant="ghost" size="icon" title={g.nome} aria-pressed={existe && alvo.glifo === i}
                className={existe && alvo.glifo === i ? 'seq-ativo' : ''} onClick={() => onGlifo(i)}>
                <IconeForma indice={i} />
              </Button>
            ))}
          </div>
        </div>
        {/* direita: acento */}
        <div className={`${quad} left-6 -translate-y-1/2 flex-col`} style={{ top: 0 }}>
          <span className="seq-rotulo">acento</span>
          <Button variant="ghost" size="sm" aria-pressed={alvo.acento} className={alvo.acento ? 'seq-ativo' : ''} onClick={() => onAcento(!alvo.acento)}>
            {alvo.acento ? 'ligado' : 'desligado'}
          </Button>
        </div>
        {/* baixo: duração */}
        <div className={`${quad} top-10 -translate-x-1/2 flex-col items-center`} style={{ left: 0 }}>
          <span className="seq-rotulo">duração</span>
          <div className="flex gap-1">
            {DURACOES.map((d) => (
              <Button key={d.id} variant="ghost" size="sm" aria-pressed={alvo.dur === d.id} className={alvo.dur === d.id ? 'seq-ativo' : ''} onClick={() => onDur(d.id)}>
                {d.rotulo}
              </Button>
            ))}
          </div>
        </div>
        {/* esquerda: apagar / fechar */}
        <div className={`${quad} right-6 -translate-y-1/2 flex-col`} style={{ top: 0 }}>
          <span className="seq-rotulo">{existe ? 'nota' : 'célula'}</span>
          {existe && (
            <Button variant="ghost" size="sm" onClick={onApagar}><Trash2 /> apagar</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onFechar}><X /> fechar</Button>
        </div>
      </div>
    </div>
  )
}
