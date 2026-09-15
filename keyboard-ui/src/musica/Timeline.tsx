/**
 * A linha do tempo do ciclo: o que está soando agora, e o botão pra mexer nisso.
 *
 * Duas coisas, e elas têm custos muito diferentes:
 *
 * VER é de graça. Cada camada do `stack` é avaliada uma vez (quando o take muda)
 * e consultada uma vez por ciclo (`queryArc(ciclo, ciclo+1)`) — nada disso toca
 * no áudio, é só perguntar ao padrão o que ele faria. A cabeça de leitura anda
 * a 60fps, mas em `<canvas>` e fora do React: nenhum `setState` no rAF, porque
 * um re-render por quadro arrastando oito camadas é exatamente o tipo de coisa
 * que faz o agendador do som perder o horário. O React aqui só sabe QUAIS são as
 * camadas e QUAL está selecionada — coisas que mudam por clique, não por quadro.
 *
 * MEXER custa uma reavaliação, e é por isso que os controles são discretos. Ver
 * `camadas.ts` pro porquê inteiro; o resumo é que não existe barramento de
 * áudio por camada pra grampear (o superdough entrega tudo somado num
 * `destinationGain` só), então FX por camada é mudar o padrão, e mudar o padrão
 * é reescrever o texto. O que a timeline escreve, ela escreve NO CÓDIGO — a
 * pessoa vê `.gain(0)` aparecer na camada que ela mutou. Um botão que mudasse a
 * camada sem o editor dizer isso destruiria a única coisa que essa rota vende,
 * que é confiar no que está escrito.
 *
 * Desenho: `../fabrica/ui`. Sem segunda cor, então ativo é PREENCHIDO e inativo
 * é vazado; a camada selecionada é a mais clara da tela e só existe uma.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESO, ESP, FUNDO_ALTO, LINHA, MONO, t100, t12, t25, t45, t70 } from '../fabrica/ui'
import { carregarRelogio, casaAgora, cicloAgora, type Relogio } from './relogio'
import { Amostras } from './Amostras'
import {
  detectarCamadas,
  reescrever,
  alternarMudo,
  alternarSolo,
  girarFx,
  limparTudo,
  faseDoCiclo,
  xDoCiclo,
  casaDoCiclo,
  arranjoDoTake,
  amostraDaCamada,
  trocarAmostra,
  type Arranjo,
  FX,
  NOMES_FX,
  type Camada,
} from './camadas'

/* ── geometria ───────────────────────────────────────────────────── */
//
// A rota é superfície de trabalho e a variável é iterações ouvidas por hora, então
// cada pixel aqui é altura roubada do editor. Faixa de 12px é o mínimo em que um
// evento de bumbo ainda vira retângulo visível. Seis camadas = 88px de canvas.

const GUTTER = 104
const FAIXA = 12
const REGUA = 12
const TEMPOS = 4 // um ciclo do Strudel são 4 tempos

function alturaCanvas(n: number): number {
  return REGUA + n * FAIXA + 2
}

/* ── o relógio ───────────────────────────────────────────────────── */
//
// A timeline não precisa de nada novo no StrudelService: o relógio do
// @strudel/core já é público. O que ela também não pode ter é uma leitura
// própria — foi ela que fez esta régua dizer "casa 2/8" com a grade de arranjo
// acesa na casa 1.
/* Carregador e contrato do relógio: `relogio.ts`. Esta cópia local saiu daqui
   quando a grade de arranjo e esta régua discordaram sobre a casa — o problema
   não era ler fontes diferentes, era converter de jeitos diferentes. */

/* ── evento desenhável ───────────────────────────────────────────── */
//
// O hap do Strudel carrega Fraction e contexto; nada disso serve pro desenho e
// tudo isso custa a cada quadro. Converte-se uma vez, na consulta do ciclo.
type Evento = { ini: number; fim: number }

const TETO_EVENTOS = 400

function consultar(padrao: any, ciclo: number): Evento[] {
  const haps = padrao.queryArc(ciclo, ciclo + 1)
  const out: Evento[] = []
  for (const h of haps) {
    // sem `whole` é sinal contínuo (perlin, sine): ocuparia a faixa inteira e
    // diria nada. O que se desenha é evento com começo e fim.
    if (!h.whole) continue
    const ini = Number(h.part.begin) - ciclo
    const fim = Number(h.part.end) - ciclo
    if (!Number.isFinite(ini) || !Number.isFinite(fim)) continue
    out.push({ ini, fim })
    if (out.length >= TETO_EVENTOS) break
  }
  return out
}

type Props = {
  /**
   * O código que está SOANDO (`StrudelState.code`), não o buffer do editor.
   * Os dois divergem o tempo todo — é o normal de quem escreve e só depois
   * aperta Ctrl+Enter — e a timeline que mostra o buffer estaria desenhando um
   * som que ninguém está ouvindo.
   */
  codigo: string
  tocando: boolean
  /** O host põe isto no editor E reavalia. A timeline não fala com o serviço. */
  onAplicar: (codigo: string) => void
  /**
   * A camada escolhida — índice no `stack`, e a MESMA da grade de arranjo.
   *
   * Mora no host porque as duas telas a mostram: manter uma cópia aqui faria a
   * pessoa selecionar o bumbo na grade, olhar pra régua logo abaixo e ver os
   * controles de fx apontando pra outra camada. Duas seleções pra uma decisão é
   * a mesma doença do relógio duplicado, uma camada acima.
   *
   * Vale notar que esta tela lê o código que TOCA e a grade lê o BUFFER: quando
   * os dois divergem em número de camadas, o índice é preso no que existe aqui
   * (`Math.min`), e não some nem estoura.
   */
  sel: number
  onSel: (i: number) => void
}

const LS_ABERTA = 'musica-timeline-aberta'

export function Timeline({ codigo, tocando, onAplicar, sel: selecionadaProp, onSel }: Props) {
  const [aberta, setAberta] = useState(() => localStorage.getItem(LS_ABERTA) !== '0')
  /* A seleção não mora aqui: ver o comentário de `sel` nas props. */
  const [largura, setLargura] = useState(600)

  const camadas = useMemo(() => detectarCamadas(codigo), [codigo])
  const n = camadas.length
  const sel = Math.min(selecionadaProp, Math.max(0, n - 1))

  const caixaRef = useRef<HTMLDivElement | null>(null)
  const telaRef = useRef<HTMLCanvasElement | null>(null)

  /* ── os padrões, um por camada ─────────────────────────────────── */
  //
  // Avaliar a expressão crua com `new Function` funciona porque `evalScope` já
  // pendurou o vocabulário do Strudel no `globalThis` — é o mesmo caminho que o
  // repl usa (ele também é `Function` no fim). Construir um padrão é puro: não
  // agenda nada, não toca em AudioContext, não tem efeito colateral.
  const [padroes, falhas] = useMemo(() => {
    const ps: any[] = []
    const fs: boolean[] = []
    for (const c of camadas) {
      try {
        const p = new Function(`return (${c.base})`)()
        const ok = p && typeof p.queryArc === 'function'
        ps.push(ok ? p : null)
        fs.push(!ok)
      } catch {
        ps.push(null)
        fs.push(true)
      }
    }
    return [ps, fs] as const
  }, [camadas])

  /* ── tudo que o loop lê fica em ref ────────────────────────────── */
  //
  // O rAF não pode depender de nada que venha do render, senão ele reinicia a
  // cada clique e perde a fase. Ele lê deste objeto, que os effects atualizam.
  const vivo = useRef({
    padroes: [] as any[],
    camadas: [] as Camada[],
    sel: 0,
    largura: 600,
    eventos: [] as Evento[][],
    ciclo: -1,
    pesado: false,
    arranjo: null as Arranjo | null,
    casa: -1,
    relogio: null as Relogio | null,
    tocando: false,
    precisaEstatico: true,
  })

  useEffect(() => {
    const v = vivo.current
    v.padroes = padroes as any[]
    v.camadas = camadas
    v.ciclo = -1            // força reconsulta com os padrões novos
    v.casa = -1
    v.arranjo = arranjoDoTake(camadas.map(c => c.base))
    // `pesado` é uma MEDIÇÃO deste take, não uma condição da tela. Sem este
    // reset, um take caro contaminava todos os seguintes até dar F5 — e o
    // sintoma (grade parada num take leve) não parecia ter causa nenhuma.
    v.pesado = false
    v.eventos = camadas.map(() => [])
    v.precisaEstatico = true
  }, [padroes, camadas])

  useEffect(() => { vivo.current.sel = sel; vivo.current.precisaEstatico = true }, [sel])
  useEffect(() => { vivo.current.largura = largura; vivo.current.precisaEstatico = true }, [largura])
  useEffect(() => { vivo.current.tocando = tocando; vivo.current.precisaEstatico = true }, [tocando])

  useEffect(() => {
    let morto = false
    carregarRelogio().then(r => { if (!morto) vivo.current.relogio = r }).catch(() => {})
    return () => { morto = true }
  }, [])

  /* ── largura: ResizeObserver, não window.resize ────────────────── */
  useEffect(() => {
    const el = caixaRef.current
    if (!el) return
    const medir = (w: number) => setLargura(prev => (Math.abs(prev - w) < 2 ? prev : Math.max(240, Math.round(w))))
    medir(el.clientWidth)
    // Sem ResizeObserver (jsdom, e navegador antigo) a timeline não some: ela
    // fica com a largura da montagem. Grade um pouco esticada é degradação
    // aceitável; tela em branco não é.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entradas => medir(entradas[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [aberta])

  /* ── o loop ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!aberta) return
    const tela = telaRef.current
    if (!tela) return
    const ctx = tela.getContext('2d')
    if (!ctx) return

    // Camada estática num canvas de memória: rótulo, grade e eventos só mudam
    // quando o ciclo vira. Redesenhar texto de oito faixas a 60fps é trabalho
    // repetido no mesmo thread que agenda o som — desenha uma vez, copia depois.
    const fundo = document.createElement('canvas')
    const fctx = fundo.getContext('2d')
    if (!fctx) return

    let quadro = 0

    const desenharEstatico = (dpr: number, w: number, h: number) => {
      const v = vivo.current
      fundo.width = Math.round(w * dpr)
      fundo.height = Math.round(h * dpr)
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fctx.clearRect(0, 0, w, h)
      fctx.fillStyle = FUNDO_ALTO
      fctx.fillRect(0, 0, w, h)

      // régua: os 4 tempos do ciclo. O tempo 1 é o único mais forte — é o que
      // dá pé pra pessoa saber onde a volta começa.
      for (let t = 0; t < TEMPOS; t++) {
        const x = xDoCiclo(t / TEMPOS, GUTTER, w)
        fctx.fillStyle = t === 0 ? t25 : t12
        fctx.fillRect(Math.round(x), 0, 1, h)
      }
      fctx.fillStyle = t12
      fctx.fillRect(GUTTER, REGUA - 1, w - GUTTER, 1)

      fctx.font = `500 8px ${MONO}`
      fctx.textBaseline = 'middle'
      fctx.fillStyle = t25
      // "grade fixa" sem dizer O QUE ficou fixo não deixa ninguém julgar se
      // aquilo ainda vale. E a casa é o que liga esta régua à grade de arranjo.
      const partes: string[] = []
      if (!v.tocando) partes.push('parado')
      else {
        if (v.pesado && v.ciclo >= 0) partes.push(`grade fixa · ciclo ${v.ciclo}`)
        if (v.casa >= 0 && v.arranjo) partes.push(`casa ${v.casa + 1}/${v.arranjo.casas}`)
      }
      const aviso = partes.join('  ·  ')
      if (aviso) fctx.fillText(aviso, GUTTER + 4, REGUA / 2)

      v.camadas.forEach((c, i) => {
        const y = REGUA + i * FAIXA
        const meio = y + FAIXA / 2
        const escolhida = i === v.sel

        if (escolhida) {
          fctx.fillStyle = 'rgba(217,255,227,0.06)'
          fctx.fillRect(0, y, w, FAIXA)
          fctx.fillStyle = ACESO
          fctx.fillRect(0, y, 2, FAIXA)
        }

        // índice, rótulo, e o estado dito por palavra — não por cor
        fctx.font = `400 8px ${MONO}`
        fctx.fillStyle = t25
        fctx.fillText(String(i + 1), 6, meio)

        fctx.font = `${escolhida ? 500 : 400} 9px ${MONO}`
        fctx.fillStyle = c.fx.mudo ? t25 : escolhida ? t100 : t70
        const nome = c.rotulo.slice(0, 11)
        fctx.fillText(nome, 16, meio)
        if (c.fx.mudo) {
          // riscado: o sinal que sobrevive sem hue e sem espaço pra palavra
          const larg = fctx.measureText(nome).width
          fctx.fillRect(16, Math.round(meio), larg, 1)
        }

        const marca = falhas[i] ? 'ilegível' : resumoFx(c)
        if (marca) {
          fctx.font = `400 8px ${MONO}`
          fctx.fillStyle = t45
          fctx.textAlign = 'right'
          fctx.fillText(marca, GUTTER - 6, meio)
          fctx.textAlign = 'left'
        }

        // eventos: vazados. O preenchimento fica reservado pro que está soando
        // AGORA, que é a única coisa que a linha do tempo tem de especial.
        const evs = v.eventos[i] || []
        const alt = 6
        const topo = Math.round(meio - alt / 2)
        fctx.strokeStyle = c.fx.mudo ? t12 : t45
        fctx.lineWidth = 1
        for (const e of evs) {
          const x0 = xDoCiclo(e.ini, GUTTER, w)
          const x1 = xDoCiclo(e.fim, GUTTER, w)
          const larg = Math.max(2, x1 - x0)
          fctx.strokeRect(Math.round(x0) + 0.5, topo + 0.5, larg, alt)
        }
      })
    }

    const desenhar = () => {
      quadro = requestAnimationFrame(desenhar)
      const v = vivo.current
      const w = v.largura
      const h = alturaCanvas(Math.max(1, v.camadas.length))
      const dpr = Math.min(2, window.devicePixelRatio || 1)

      if (tela.width !== Math.round(w * dpr) || tela.height !== Math.round(h * dpr)) {
        tela.width = Math.round(w * dpr)
        tela.height = Math.round(h * dpr)
        tela.style.height = `${h}px`
        v.precisaEstatico = true
      }

      // Uma leitura só, a mesma da grade de arranjo. `null` é "não começou" —
      // a régua já diz "parado" nesse caso, e a fase cai em 0 sozinha.
      const lido = cicloAgora(v.relogio)
      const andando = lido !== null
      const agora = lido ?? 0

      const ciclo = Math.max(0, Math.floor(agora))

      // A casa é derivada do MESMO relógio que a cabeça de leitura — é isso que
      // faz a régua e a grade de arranjo nunca discordarem sobre o instante.
      const casa = casaAgora(lido, v.arranjo) ?? -1
      if (casa !== v.casa) { v.casa = casa; v.precisaEstatico = true }

      if (ciclo !== v.ciclo && (!v.pesado || v.ciclo < 0)) {
        const t0 = performance.now()
        // Take caro é consultado no ciclo ATUAL, não no 0. Num take com máscara
        // o ciclo 0 é justo onde quase nada toca (na ssba-18, 2 camadas de 8):
        // congelar ali mostrava uma peça vazia enquanto a música estava cheia.
        v.eventos = v.padroes.map(p => {
          if (!p) return []
          try { return consultar(p, ciclo) } catch { return [] }
        })
        // Consulta cara não pode virar hábito no thread do som. Se um take
        // custar mais que um quadro inteiro, a grade CONGELA no ciclo em que
        // estava e a régua passa a dizer "grade fixa" — porque uma grade que
        // parou de acompanhar o `<a b>` sem avisar seria a timeline mentindo
        // sobre o que toca. A cabeça de leitura continua andando: ela lê o
        // relógio, não a consulta.
        if (performance.now() - t0 > 16) v.pesado = true
        v.ciclo = ciclo
        v.precisaEstatico = true
      }

      if (v.precisaEstatico) {
        desenharEstatico(dpr, w, h)
        v.precisaEstatico = false
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, tela.width, tela.height)
      ctx.drawImage(fundo, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!andando) return

      const fase = faseDoCiclo(agora)

      // o que está soando AGORA: preenchido. É o único preenchido da tela.
      v.camadas.forEach((c, i) => {
        if (c.fx.mudo) return
        const evs = v.eventos[i] || []
        const y = REGUA + i * FAIXA + FAIXA / 2
        ctx.fillStyle = t100
        for (const e of evs) {
          if (fase < e.ini || fase >= e.fim) continue
          const x0 = xDoCiclo(e.ini, GUTTER, w)
          const x1 = xDoCiclo(e.fim, GUTTER, w)
          ctx.fillRect(Math.round(x0), Math.round(y - 3), Math.max(2, x1 - x0), 6)
        }
      })

      const xh = xDoCiclo(fase, GUTTER, w)
      ctx.fillStyle = ACESO
      ctx.fillRect(Math.round(xh), 0, 1, h)
    }

    quadro = requestAnimationFrame(desenhar)
    return () => cancelAnimationFrame(quadro)
  }, [aberta, falhas])

  /* ── gestos ────────────────────────────────────────────────────── */

  const aplicar = useCallback((novos: Map<number, any>) => {
    if (!novos.size) return
    onAplicar(reescrever(codigo, camadas, novos))
  }, [codigo, camadas, onAplicar])

  const noCanvas = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    const i = Math.floor((y - REGUA) / FAIXA)
    if (i < 0 || i >= camadas.length) return
    onSel(i)
    const x = e.clientX - r.left
    if (e.altKey) { aplicar(alternarSolo(camadas, i)); return }
    // clicar no NOME muda: é o gesto mais repetido do jam, e obrigar a mirar
    // num botão de 30px depois de selecionar seria duas ações pra uma decisão.
    if (x < GUTTER) aplicar(new Map([[i, alternarMudo(camadas[i].fx)]]))
  }, [camadas, aplicar])

  const alvo: Camada | undefined = camadas[sel]

  /* ── o sample da camada ──────────────────────────────────────────
   *
   * Escrever o `.n()` é caminho separado do `aplicar()` de fx: aquele reescreve
   * o BLOCO de efeitos no fim da camada, este troca um argumento no meio dela.
   * Misturar os dois faria a troca de sample apagar o fx escrito à mão.
   */
  const [escolhendo, setEscolhendo] = useState(false)
  const amostra = alvo ? amostraDaCamada(alvo.base) : null

  const trocarN = useCallback((n: number) => {
    if (!alvo) return
    onAplicar(trocarAmostra(codigo, alvo, n))
  }, [alvo, codigo, onAplicar])

  // Trocar de camada fecha o seletor: ele mostra o banco da camada de ANTES por
  // um quadro, e um seletor que lista o banco errado é pior que nenhum.
  useEffect(() => { setEscolhendo(false) }, [sel])

  return (
    <div ref={caixaRef} style={{ position: 'relative', flexShrink: 0, borderTop: LINHA, background: FUNDO_ALTO }}>
      {/* ── a régua de controle: age na camada selecionada ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: ESP.xs, minHeight: 22,
        padding: `0 ${ESP.sm}px`, borderBottom: aberta ? LINHA : undefined,
      }}>
        <button
          onClick={() => { const v = !aberta; setAberta(v); localStorage.setItem(LS_ABERTA, v ? '1' : '0') }}
          style={botaoTexto}
          title={aberta ? 'recolher a linha do tempo' : 'abrir a linha do tempo'}
        >
          {aberta ? '▾' : '▸'} linha do tempo
        </button>

        {aberta && alvo && (
          <>
            <span style={{ color: t45, font: `400 9px ${MONO}` }}>·</span>
            <span style={{ color: t100, font: `500 9px ${MONO}`, letterSpacing: '0.08em' }}>
              {sel + 1} {alvo.rotulo}
            </span>
            <button
              onClick={() => aplicar(new Map([[sel, alternarMudo(alvo.fx)]]))}
              style={alvo.fx.mudo ? botaoAceso : botaoTexto}
            >mudo</button>
            <button
              onClick={() => aplicar(alternarSolo(camadas, sel))}
              style={botaoTexto}
              title="alt+clique na faixa faz o mesmo"
            >só ela</button>
            {NOMES_FX.map(nome => {
              const nivel = alvo.fx.niveis[nome] ?? 0
              return (
                <button
                  key={nome}
                  onClick={() => aplicar(new Map([[sel, girarFx(alvo.fx, nome)]]))}
                  style={nivel > 0 ? botaoAceso : botaoTexto}
                  title={nivel > 0 ? FX[nome].niveis[nivel - 1] : `${FX[nome].niveis.length} níveis`}
                >
                  {FX[nome].rotulo}{nivel > 0 ? nivel : ''}
                </button>
              )
            })}
            <button onClick={() => aplicar(limparTudo(camadas))} style={botaoTexto}>limpar</button>

            {/* Zero não renderiza: camada que não é sample (nota em oscilador)
                não ganha controle de sample nenhum. */}
            {amostra && (
              <>
                <span style={{ color: t12, font: `400 9px ${MONO}` }}>|</span>
                <button
                  onClick={() => trocarN(Math.max(0, amostra.n - 1))}
                  style={botaoTexto} title="sample anterior"
                >◂</button>
                <button
                  onClick={() => setEscolhendo(v => !v)}
                  style={escolhendo ? botaoAceso : botaoTexto}
                  title={`escolher no banco ${amostra.banco}`}
                >n{amostra.n}</button>
                <button
                  onClick={() => trocarN(amostra.n + 1)}
                  style={botaoTexto} title="próximo sample"
                >▸</button>
              </>
            )}
            <span style={{
              marginLeft: 'auto', color: t25, font: `400 8px ${MONO}`,
              whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              escreve no código e reavalia · clique no nome = mudo
            </span>
          </>
        )}
      </div>

      {escolhendo && amostra && (
        <Amostras
          banco={amostra.banco}
          n={amostra.n}
          onEscolher={trocarN}
          onFechar={() => setEscolhendo(false)}
        />
      )}

      {aberta && (
        n === 0 ? (
          <div style={{ padding: `${ESP.sm}px`, color: t45, font: `400 10px ${MONO}` }}>
            nada tocando ainda — aperte tocar e a linha do tempo se preenche
          </div>
        ) : (
          <canvas
            ref={telaRef}
            onClick={noCanvas}
            style={{ display: 'block', width: '100%', cursor: 'pointer' }}
          />
        )
      )}
    </div>
  )
}

/** O estado da camada em uma palavra, pro gutter. Sem espaço pra duas. */
function resumoFx(c: Camada): string {
  if (c.fx.mudo) return 'mudo'
  const ativos = NOMES_FX.filter(nm => (c.fx.niveis[nm] ?? 0) > 0)
  if (!ativos.length) return ''
  const primeiro = `${FX[ativos[0]].rotulo}${c.fx.niveis[ativos[0]]}`
  return ativos.length > 1 ? `${primeiro}+` : primeiro
}

const botaoTexto: React.CSSProperties = {
  background: 'none', border: 'none', padding: '3px 4px', cursor: 'pointer',
  color: t45, font: `400 9px ${MONO}`, letterSpacing: '0.06em',
}

const botaoAceso: React.CSSProperties = {
  ...botaoTexto,
  color: '#080b07', background: ACESO, borderRadius: 2,
}
