/**
 * Grade da melodia escrita à mão (camada `mel`). Linhas = graus da escala da camada + a oitava,
 * então não existe nota errada; colunas = 16 batidas no bpm da camada.
 * - clicar numa célula vazia cria a nota; clicar numa nota apaga
 * - arrastar pra direita a partir de uma célula vazia estica a nota
 * - teclado do PC (A S D F G H J K = graus de baixo pra cima) toca na hora e segura enquanto apertada;
 *   com `rec`, grava no loop: `snap` encaixa na batida, `free` guarda o tempo exato da mão
 * Só tokens `--vintage-*` e `estilo.ts` (peça da era6, aprovada em 2026-09-30).
 */
import { useEffect, useRef, useState } from 'react'
import { Circle, Eraser } from 'lucide-react'
import { ESCALAS, NOMES_NOTA, PASSOS_FRASE, TECLAS, semitomDoGrau, type NotaFrase } from './modelo'
import { estilo } from './estilo'

export function GradeMelodia({ frase, raiz, escala, atual, gravando, encaixe, onAlternar, onEscrever, onLimpar, onRec, onEncaixe, onPrevia }: {
  frase: NotaFrase[]
  raiz: number
  escala: number
  atual: number                  // passo tocando (-1 = parado)
  gravando: boolean
  encaixe: boolean               // rec no tempo da batida (true) ou do jeito que a mão tocou (false)
  onEncaixe: () => void
  onAlternar: (passo: number, grau: number) => void
  onEscrever: (passo: number, grau: number, len: number) => void
  onLimpar: () => void
  onRec: () => void
  onPrevia: (grau: number) => void
}) {
  const n = (ESCALAS[escala] ?? ESCALAS[0]).semitons.length
  const graus = Array.from({ length: Math.min(n + 1, TECLAS.length) }, (_, g) => g).reverse()   // agudo em cima
  const [arraste, setArraste] = useState<{ passo: number; grau: number; ate: number } | null>(null)
  const arrRef = useRef(arraste)
  useEffect(() => { arrRef.current = arraste }, [arraste])
  // nota solta começa no meio da batida: a célula acende se a nota encosta nela
  const coberta = (passo: number, grau: number) => frase.find(nf => nf.grau === grau && passo + 1 > nf.passo && passo < nf.passo + nf.len)
  const soltar = () => {
    const a = arrRef.current
    if (a) onEscrever(a.passo, a.grau, a.ate - a.passo + 1)
    setArraste(null)
  }

  return (
    <div onClick={e => e.stopPropagation()} onPointerUp={soltar} onPointerLeave={soltar}
      style={{ display: 'grid', gap: 6, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...estilo.rotulo, fontSize: 9 }}>
          {frase.length ? 'your melody' : 'generative: click the grid, or play the keys (free, any time)'}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ ...estilo.rotulo, fontSize: 9, color: 'var(--vintage-text-dim)' }} title="computer keys play the scale, low to high">
          keys {TECLAS.slice(0, graus.length).join(' ').toUpperCase()}
        </span>
        <button type="button" onClick={onEncaixe} aria-pressed={encaixe}
          title={encaixe ? 'snap: rec lands on the beat. Click for free timing' : 'free: rec keeps your exact timing. Click to snap to the beat'}
          style={{ ...estilo.botao(!encaixe), padding: '3px 8px' }}>
          {encaixe ? 'snap' : 'free'}
        </button>
        <button type="button" onClick={onRec} aria-pressed={gravando} title="record from the computer keyboard into the loop"
          style={{ ...estilo.botao(gravando), padding: '3px 8px', color: gravando ? 'var(--vintage-meter-red)' : undefined }}>
          <Circle size={9} fill={gravando ? 'currentColor' : 'none'} /> rec
        </button>
        {frase.length > 0 && (
          <button type="button" onClick={onLimpar} title="clear: back to the generative melody" style={{ ...estilo.botao(false), padding: '3px 8px' }}>
            <Eraser size={11} /> clear
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${PASSOS_FRASE}, minmax(0, 1fr))`, gap: 2 }}>
        {graus.map(g => (
          <div key={g} style={{ display: 'contents' }}>
            <button type="button" onClick={() => onPrevia(g)} title={`hear it (key ${TECLAS[g].toUpperCase()})`}
              style={{ ...estilo.rotulo, fontSize: 9, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', color: g % n === 0 ? 'var(--vintage-value)' : undefined }}>
              {NOMES_NOTA[(raiz + semitomDoGrau(escala, g)) % 12]}
            </button>
            {Array.from({ length: PASSOS_FRASE }, (_, k) => {
              const nf = coberta(k, g)
              const noArraste = arraste && arraste.grau === g && k >= arraste.passo && k <= arraste.ate
              const aceso = !!nf || !!noArraste
              const inicio = (nf && Math.floor(nf.passo) === k) || arraste?.passo === k
              return (
                <button key={k} type="button" aria-label={`step ${k + 1}, ${NOMES_NOTA[(raiz + semitomDoGrau(escala, g)) % 12]}`}
                  aria-pressed={aceso}
                  onPointerDown={e => {
                    e.preventDefault()
                    if (nf) { onAlternar(k, g); return }
                    onPrevia(g)
                    setArraste({ passo: k, grau: g, ate: k })
                  }}
                  onPointerEnter={() => setArraste(a => (a && a.grau === g && k >= a.passo ? { ...a, ate: k } : a))}
                  style={{
                    height: 13, padding: 0, cursor: 'pointer', minWidth: 0,
                    // a cada 4 batidas um respiro: dá pra contar o compasso de olho
                    marginLeft: k && k % 4 === 0 ? 3 : 0,
                    background: aceso ? (k === atual ? 'var(--vintage-accent)' : 'var(--vintage-value)') : k === atual ? 'var(--vintage-surface-3)' : 'transparent',
                    border: `1px solid ${aceso ? 'var(--vintage-value)' : k === atual ? 'var(--vintage-accent)' : 'var(--vintage-border)'}`,
                    borderLeftWidth: aceso && !inicio ? 0 : 1,
                    opacity: aceso ? 1 : 0.6,
                  }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
