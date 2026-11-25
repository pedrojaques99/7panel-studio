/** Forma de onda de um trecho do arquivo, em canvas (os picos vêm prontos do motor). */
import { useEffect, useRef } from 'react'
import { PICOS_POR_S } from './motor'

/** Canvas não lê `var()` nem `color-mix()`: resolve pela folha de estilo antes de pintar. */
const cacheCor = new Map<string, string>()
function corResolvida(cor: string): string {
  let c = cacheCor.get(cor)
  if (!c) {
    const el = document.createElement('span')
    el.style.color = cor
    document.body.appendChild(el)
    c = getComputedStyle(el).color
    el.remove()
    cacheCor.set(cor, c)
  }
  return c
}

export function Onda({ picos, offset, dur, largura, altura, cor }: {
  picos: Float32Array | null; offset: number; dur: number; largura: number; altura: number; cor: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv || !picos) return
    const dpr = window.devicePixelRatio || 1
    // canvas gigante estoura a memória da GPU: desenha no máximo 8k px e estica
    const w = Math.max(1, Math.min(8192, Math.round(largura)))
    cv.width = w * dpr
    cv.height = altura * dpr
    const g = cv.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    g.clearRect(0, 0, w, altura)
    g.fillStyle = corResolvida(cor)
    const meio = altura / 2
    const i0 = offset * PICOS_POR_S
    const porPx = (dur * PICOS_POR_S) / w
    for (let x = 0; x < w; x++) {
      const a = Math.floor(i0 + x * porPx)
      const b = Math.max(a + 1, Math.floor(i0 + (x + 1) * porPx))
      let m = 0
      for (let i = a; i < b && i < picos.length; i++) if (picos[i] > m) m = picos[i]
      const h = Math.max(0.5, Math.sqrt(m) * meio * 0.95)   // raiz: ambiência baixa ainda aparece
      g.fillRect(x, meio - h, 1, h * 2)
    }
  }, [picos, offset, dur, largura, altura, cor])
  return <canvas ref={ref} aria-hidden style={{ width: largura, height: altura, display: 'block', pointerEvents: 'none' }} />
}
