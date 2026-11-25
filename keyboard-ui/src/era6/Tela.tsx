/**
 * A partitura pintada, ao vivo, na versão leve. Dois canvas pequenos: a pintura (512 px,
 * quadrada) e a cicatriz (1024 × 300, uma faixa por camada). Quem pinta é o `Pintor`,
 * alimentado pelos ganchos do motor em Era6.tsx. Sem laço de animação e sem overlay: a tela
 * só muda quando chega grão ou tick. O wow e o chiado ficam no áudio e na capa exportada,
 * que repinta offline em 2048 px.
 */
import { useEffect, useRef } from 'react'
import { estilo } from './estilo'

export const LADO_VIVO = 512
export const CICATRIZ_VIVO = { largura: 1024, altura: 300 }
export const CICATRIZ_ALTURA = 600

export function Tela({ onPronto }: {
  onPronto: (tela: HTMLCanvasElement, cicatriz: HTMLCanvasElement) => void
}) {
  const tela = useRef<HTMLCanvasElement>(null)
  const cicatriz = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (tela.current && cicatriz.current) onPronto(tela.current, cicatriz.current)
  }, [onPronto])

  // teto de altura: a pintura não pode comer a dobra e esconder os knobs (AUDIT-UI-era6.md)
  const alto = 'min(360px, 38vh)'
  return (
    // abaixo de 640 px pintura e cicatriz empilham; acima, lado a lado. A moldura é o recolhível "visual" (Era6.tsx)
    <div className="grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)]" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={estilo.rotulo} title="x is pan, y is pitch, each stroke is one grain">painted score</span>
        <canvas ref={tela} width={LADO_VIVO} height={LADO_VIVO} title="x is pan, y is pitch, each stroke is one grain"
          style={{ height: alto, aspectRatio: '1 / 1', display: 'block', border: '1px solid var(--vintage-border)' }} />
      </div>
      <div style={{ display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 }}>
        <span style={estilo.rotulo} title="one strip per layer: the waveform, and where the grains read it">sample scars</span>
        <canvas ref={cicatriz} width={CICATRIZ_VIVO.largura} height={CICATRIZ_VIVO.altura}
          style={{ width: '100%', height: alto, display: 'block', border: '1px solid var(--vintage-border)' }} />
      </div>
    </div>
  )
}
