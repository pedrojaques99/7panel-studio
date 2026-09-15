import React, { useCallback, useEffect, useRef, useState } from 'react'
import { rotuloTom, type Tom } from './tom'

/**
 * TomControl — régua de semitons.
 *
 * ── POR QUE RÉGUA E NÃO SLIDER ──────────────────────────────────────────
 * Slider tem cabeça que anda e trilho parado: você mira num ponto. Aqui o alvo
 * é sempre o mesmo (a mira do centro) e o que anda é a régua embaixo — é o
 * picker do iOS deitado. Ganha duas coisas: o zero nunca sai do lugar de
 * referência, e o gesto vira "puxar o material", não "acertar a posição". Num
 * controle de 25 passos discretos isso importa, porque cada semitom é um
 * destino e não um valor contínuo que se arredonda no fim.
 *
 * ── A ANATOMIA (a ordem é a mesma em todo elemento de acabamento) ────────
 *   rótulo        TOM
 *   valor         Am                 <- o que decide, maior peso do bloco
 *   qualificador  de F♯m · +3 st     <- a régua que dá sentido ao valor
 *   evidência     a régua desenhada  <- o valor contra a régua
 *
 * Os quatro dividem UMA linha de 22 px, e a ordem de leitura vira da esquerda
 * pra direita. Anatomia é sequência, não empilhamento — e a sequência cabe
 * deitada.
 *
 * A altura não é gosto: este componente mora no transporte da /musica, uma
 * faixa de controles de 22 px. Nas primeiras versões ele tinha 48 px em duas
 * linhas, e numa janela de 697 px de altura isso empurrou o TRANSPORTE INTEIRO
 * pra fora da tela — play, bpm e exportar sumiram por causa de um controle
 * novo. Um elemento que quebra o ritmo da faixa onde mora não está burilado,
 * está grande.
 *
 * Nenhum número sem régua: "+3" sozinho é trivia. O que a pessoa quer saber é
 * em que tom a peça FICOU, e de onde ela saiu. Quando o take não declara
 * tonalidade, o bloco de tom some em vez de chutar um palpite.
 *
 * ── CONTRATO DE SIMULAÇÃO ───────────────────────────────────────────────
 * Transpor é simulação: o arquivo do take não muda. Daí as quatro regras:
 *   1. o valor real fica sempre na tela, marcado na própria trilha (o traço do
 *      zero é o único com legenda fixa: "real");
 *   2. as paradas que importam são desenhadas — quarta (±5), quinta (±7) e
 *      oitava (±12), que são os intervalos onde uma peça continua sendo ela;
 *   3. voltar ao real é UM clique, e o botão só existe quando há simulação;
 *   4. nada persiste — quem salva é o botão de salvar, com o código original.
 *
 * ── MOTION ──────────────────────────────────────────────────────────────
 * Valor que a mão está produzindo não anima: durante o arrasto a régua segue o
 * dedo em 1:1, sem amortecimento (atraso durante gesto lê como travamento). O
 * que anima é o que muda POR CONSEQUÊNCIA — o rótulo do tom, uma vez, curto,
 * quando o resultado troca. Easing e duração saem do SSoT (`--ease-*`,
 * `--dur-*` em index.css), nunca escritos aqui.
 */

const RAIO = 12            // ±12 semitons: uma oitava para cada lado
const PASSO = 11           // px por semitom

/** Intervalos que valem um traço mais alto. Ver regra 2 do contrato. */
const MARCOS: Record<number, string> = { 5: '4ª', 7: '5ª', 12: '8ª' }

export const TomControl = React.memo(function TomControl({
  semitons, onChange, tom = null, accent = 'var(--status-ok)', largura = 116,
}: {
  semitons: number
  onChange: (v: number) => void
  /** tonalidade lida do take (`tomDoTake`); `null` esconde o bloco de tom */
  tom?: Tom | null
  accent?: string
  largura?: number
}) {
  const [arrastando, setArrastando] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const val = useRef(semitons)
  val.current = semitons

  const limitar = (v: number) => Math.max(-RAIO, Math.min(RAIO, Math.round(v)))

  /** Detente: um toque de 1 ms a cada traço vencido. No-op onde não existe. */
  const detente = useCallback(() => {
    try { navigator.vibrate?.(1) } catch { /* sem vibração, sem problema */ }
  }, [])

  const mudar = useCallback((v: number) => {
    const novo = limitar(v)
    if (novo !== val.current) { detente(); onChange(novo) }
  }, [onChange, detente])

  // wheel nativo com passive:false — sem isso o preventDefault não pega e a
  // página rola junto (mesma armadilha do BpmControl)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault(); e.stopPropagation()
      const passo = e.shiftKey ? 12 : 1
      mudar(val.current + (e.deltaY < 0 ? passo : -passo))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [mudar])

  const aoArrastar = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    // Captura é melhoria, não requisito — e num handler ela é o passo que pode
    // matar todos os seguintes. Onde `setPointerCapture` não existe (jsdom) ou
    // recusa o id (ponteiro sintético), o arrasto tem que continuar existindo.
    try { el.setPointerCapture?.(e.pointerId) } catch { /* sem captura, segue */ }

    const x0 = e.clientX
    const v0 = val.current
    setArrastando(true)
    // Os listeners vão na JANELA e não no elemento: sem captura, um elemento de
    // 30 px de altura para de receber `pointermove` no instante em que o dedo
    // sai dele — que é o primeiro pixel de qualquer arrasto de verdade.
    const mover = (ev: PointerEvent) => mudar(v0 - (ev.clientX - x0) / PASSO)
    const soltar = () => {
      setArrastando(false)
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
  }, [mudar])

  const de = rotuloTom(tom, 0)
  const para = rotuloTom(tom, semitons)
  const sinal = semitons > 0 ? `+${semitons}` : String(semitons)
  const marco = MARCOS[Math.abs(semitons)]
  const simulando = semitons !== 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, height: 22,
      fontFamily: 'monospace', lineHeight: 1, whiteSpace: 'nowrap', userSelect: 'none',
    }}>
      {/* rótulo */}
      <span style={{
        fontSize: 'var(--fs-2xs)', color: 'var(--text-20)',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>tom</span>

      {/* ── evidência: a régua ──────────────────────────────────────── */}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Tom"
        aria-valuemin={-RAIO}
        aria-valuemax={RAIO}
        aria-valuenow={semitons}
        aria-valuetext={para
          ? `${para}${simulando ? `, ${sinal} semitons de ${de}` : ', tom original'}`
          : `${sinal} semitons`}
        onPointerDown={aoArrastar}
        onDoubleClick={e => { e.stopPropagation(); onChange(0) }}
        onKeyDown={e => {
          const passo = e.shiftKey ? 12 : 1
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); mudar(semitons + passo) }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); mudar(semitons - passo) }
          if (e.key === 'Home' || e.key === '0') { e.preventDefault(); onChange(0) }
        }}
        title="Arraste · Scroll ±1 · Shift ±12 · Duplo clique volta ao original"
        style={{
          position: 'relative', width: largura, height: 22, flexShrink: 0,
          overflow: 'hidden', borderRadius: 'var(--radius-xs)',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          cursor: arrastando ? 'grabbing' : 'grab',
          outline: 'none', touchAction: 'none',
        }}
      >
        {/* a régua: é ela que anda, o alvo fica parado */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: `translateX(${-semitons * PASSO}px)`,
          transition: arrastando ? 'none' : 'transform var(--dur-fast) var(--ease-drawer)',
          willChange: 'transform',
        }}>
          {Array.from({ length: RAIO * 2 + 1 }, (_, i) => {
            const v = i - RAIO
            const zero = v === 0
            const alto = MARCOS[Math.abs(v)] !== undefined
            return (
              <span key={v} style={{
                position: 'absolute',
                left: `calc(50% + ${v * PASSO}px)`,
                top: zero ? 3 : alto ? 6 : 8,
                height: zero ? 16 : alto ? 10 : 6,
                width: zero ? 1.5 : 1,
                transform: 'translateX(-50%)', borderRadius: 1,
                /* o traço do zero é o valor REAL na trilha: ele é o mais alto e o
                   mais claro, e é o único que continua visível de longe. */
                background: zero ? 'var(--text-50)' : alto ? 'var(--text-25)' : 'var(--text-10)',
              }} />
            )
          })}
        </div>

        {/* a mira: sempre no centro. É o que transforma "acertar" em "puxar". */}
        <div style={{
          position: 'absolute', left: '50%', top: 2, bottom: 2, width: 2,
          transform: 'translateX(-50%)', borderRadius: 1,
          background: simulando ? accent : 'var(--text-40)',
          boxShadow: simulando ? `0 0 6px ${accent}` : 'none',
          transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
        }} />

        {/* as bordas somem: sem isso a régua parece cortada com tesoura */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(90deg, var(--bg-input) 0%, transparent 22%, transparent 78%, var(--bg-input) 100%)',
        }} />
      </div>

      {/* ── valor · qualificador ────────────────────────────────────── */}
      {/* a key força o remount, e o remount É a animação de consequência: o tom
          novo entra uma vez, curto. Sem key ele trocaria de texto no lugar, que
          é a diferença entre "mudou" e "nunca mudou". */}
      <span key={para ?? sinal} style={{
        fontSize: 'var(--fs-md)', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color: simulando ? accent : 'var(--text-70)',
        animation: 'tom-entra var(--dur-base) var(--ease-out)',
      }}>{para ?? (simulando ? `${sinal} st` : '—')}</span>

      <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-25)' }}>
        {!simulando ? 'original'
          : para ? `de ${de} · ${sinal} st${marco ? ` · ${marco}` : ''}`
          : `${marco ?? ''}`}
      </span>

      {/* voltar ao real é UM clique, e só existe quando há simulação */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onChange(0) }}
        onMouseDown={e => e.stopPropagation()}
        tabIndex={simulando ? 0 : -1}
        aria-hidden={!simulando}
        title="Voltar ao tom original"
        style={{
          border: 'none', background: 'none', padding: 0, cursor: 'pointer',
          fontSize: 'var(--fs-2xs)', fontFamily: 'monospace', letterSpacing: '0.04em',
          color: 'var(--text-40)',
          opacity: simulando ? 1 : 0,
          pointerEvents: simulando ? 'auto' : 'none',
          transition: 'opacity var(--dur-fast) var(--ease-out)',
        }}>voltar</button>
    </div>
  )
})
