/**
 * A linha do tempo: a peça INTEIRA, todas as camadas, com zoom contínuo.
 *
 * ## O que ela substitui, e por que era uma coisa só
 *
 * `GradeArranjo.tsx` desenhava a peça a 64 ciclos (as casas da `.mask()`) e
 * `Timeline.tsx` desenhava a peça a 1 ciclo (os eventos do `queryArc`). As duas
 * já eram a MESMA vista em dois zooms — o que faltava entre elas era a escala.
 * Aqui a escala existe (`escala.ts`, sobre `d3-scale`/`d3-zoom`) e o nível de
 * detalhe troca sozinho: aberto mostra casas, fechado mostra eventos, e o fim do
 * curso do zoom é exatamente o que a `Timeline.tsx` mostrava.
 *
 * As duas continuam no repositório e ligáveis pelo botão `clássica` — esta tela
 * é nova e a sincronia daquelas é o que funciona hoje. Backup que não roda não é
 * backup.
 *
 * ## A decisão difícil: buffer × tocando
 *
 * Aquelas duas telas resolviam isto por SEREM duas, e estava escrito nas duas:
 *
 *     GradeArranjo  ← code          (buffer; funciona antes do 1º play)
 *     Timeline      ← strudel.code  (o que SOA; eventos precisam do padrão real)
 *
 * Uma tela só precisa das duas leituras, e fundir sem decidir seria criar o bug
 * que `relogio.ts` existe pra impedir, um andar acima. A regra:
 *
 *   - FORMA (casas, rótulos, quantas camadas) vem do BUFFER — é texto, e tem que
 *     desenhar com o som parado, que é justamente pra que a forma serve;
 *   - EVENTOS vêm do que TOCA — é o único padrão que existe avaliado;
 *   - quando os dois divergem, a tela DIZ: as casas passam a ser vazadas em vez
 *     de preenchidas e a régua escreve `editado · ctrl+enter`.
 *
 * Nunca se escolhe uma das duas em silêncio. O único jeito de esta tela estar
 * errada é ela afirmar que sabe o que não sabe.
 *
 * ## Desenho
 *
 * Tudo de `fabrica/ui.ts`, nenhum componente novo do design system — a mesma
 * regra das duas telas que ela substitui. Monocromático: significado por PESO e
 * PREENCHIMENTO, nunca por hue. Casa acesa é preenchida (sobrevive a print em
 * P&B e a daltonismo), o que soa AGORA é o único preenchido claro da tela.
 *
 * O canvas anda fora do React: nenhum `setState` no `requestAnimationFrame`,
 * porque um re-render por quadro arrastando oito camadas é o tipo de coisa que
 * faz o agendador do som perder o horário. O React aqui só sabe quais são as
 * camadas e qual está selecionada — coisas que mudam por clique, não por quadro.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { ACESO, ESP, FUNDO_ALTO, LINHA, MONO, t100, t12, t25, t45, t70 } from '../fabrica/ui'
import { carregarRelogio, cicloAgora, type Relogio } from './relogio'
import { Amostras } from './Amostras'
import { CacheEventos, avaliarCamadas, camadasSemSom } from './consulta'
import {
  GUTTER, ciclosDoArranjo, zoomMaximo, escalaBase, escalaComZoom, limitesDePan,
  ciclosVisiveis, pxPorCiclo, detalheDe, enquadrar, pecaInteira, segundosPorCiclo,
} from './escala'
import {
  detectarCamadas, gradeDoTake, alternarCasa, sincronizarGrade, removerCasa,
  alternarMudo, alternarSolo, girarFx, limparTudo, reescrever,
  amostraDaCamada, trocarAmostra, FX, NOMES_FX,
  type Camada, type Arranjo, type Grade, type EstadoFx,
} from './camadas'
import { mmss } from './exportacao'

/* ── geometria ───────────────────────────────────────────────────── */
//
// A rota é superfície de trabalho e a variável é iterações ouvidas por hora, então
// cada pixel é altura roubada do editor. 18px por faixa é o meio-termo entre os
// 12 da Timeline (bom pra ver, pequeno demais pra acertar com o dedo) e os 22 da
// grade (bom pra clicar, caro com 8 camadas).

export const FAIXA = 18
// 26 e nao 20: a regua e o unico alvo de scrub da tela, e 20px no topo de um
// canvas de 200 dava um alvo que a pessoa nao achava — o gesto existia e nao
// era alcancado, que na pratica e o mesmo que nao existir.
export const REGUA = 26
const MINIMAPA = 14
const VAO_MINIMAPA = 4

function altura(n: number): number {
  return REGUA + Math.max(1, n) * FAIXA + VAO_MINIMAPA + MINIMAPA
}

const LS_ABERTA = 'musica-linha-aberta'

/**
 * O que o filtro do `d3-zoom` precisa saber do evento.
 *
 * O d3 entrega `any` porque o mesmo filtro atende wheel, mouse e touch. Nomear
 * só os campos lidos aqui é mais honesto que `any` e mais barato que discriminar
 * a união inteira: se amanhã o filtro passar a olhar `e.touches`, o compilador
 * cobra o campo em vez de deixar passar `undefined`.
 */
type GestoBruto = {
  type: string
  ctrlKey?: boolean
  shiftKey?: boolean
  button?: number
  clientY?: number
}

type Props = {
  /** O BUFFER do editor. Manda na FORMA e é o que a escrita altera. */
  codigo: string
  /** O que está SOANDO (`strudel.code`). Manda nos EVENTOS. Ver o cabeçalho. */
  codigoTocando: string
  bpm: number
  tocando: boolean
  onAplicar: (codigo: string) => void
  /** A camada escolhida — índice no `stack`. Mora no host, como nas telas velhas. */
  sel: number
  onSel: (i: number) => void
  /**
   * Tudo que o motor de áudio sabe tocar. `null` = ainda não sei.
   *
   * A distinção entre `null` e conjunto vazio é o ponto: enquanto o banco
   * carrega, NENHUMA faixa pode ser marcada como muda — marcar seria a tela
   * inventando um defeito que talvez não exista. Ver `sonsConhecidos` no
   * `strudel-service`.
   */
  sonsConhecidos?: Set<string> | null
  /** Leva o relógio pro ciclo pedido. Ausente = este scheduler não sabe. */
  onMoverAgulha?: (ciclo: number) => void
}

export function LinhaDoTempo({
  codigo, codigoTocando, bpm, tocando, onAplicar, sel: selProp, onSel,
  sonsConhecidos = null, onMoverAgulha,
}: Props) {
  const [aberta, setAberta] = useState(() => localStorage.getItem(LS_ABERTA) !== '0')
  const [largura, setLargura] = useState(800)
  /**
   * O seletor de sample: guarda PRA QUAL camada está aberto, não um booleano.
   *
   * A `Timeline.tsx` guardava `boolean` e fechava num `useEffect([sel])`. Isso
   * funciona, mas é sincronizar em vez de derivar: existe um quadro em que o
   * seletor ainda está aberto listando o banco da camada de ANTES, e um seletor
   * que lista o banco errado é pior que nenhum. Guardando o índice, `escolhendo`
   * é uma comparação — trocar de camada fecha o seletor sem effect nenhum.
   */
  const [escolhendoPara, setEscolhendoPara] = useState<number | null>(null)
  /* Só pra rotular o botão de voltar; o transform de verdade mora no ref. */
  const [zoomAtual, setZoomAtual] = useState(1)

  /* ── as duas leituras ──────────────────────────────────────────── */
  const camadas = useMemo(() => detectarCamadas(codigo), [codigo])
  const grade = useMemo(() => gradeDoTake(camadas), [camadas])
  const arranjo: Arranjo | null = grade.ok ? grade.arranjo : null
  const n = camadas.length
  const sel = Math.min(selProp, Math.max(0, n - 1))

  const camadasTocando = useMemo(() => detectarCamadas(codigoTocando), [codigoTocando])
  /**
   * Divergiu? Compara o TEXTO das camadas, não o código inteiro: mexer num
   * comentário ou na indentação não muda o que soa, e acender o aviso nesse
   * caso ensinaria a pessoa a ignorá-lo.
   */
  const divergente = useMemo(() => {
    if (!codigoTocando) return false
    if (camadas.length !== camadasTocando.length) return true
    return camadas.some((c, i) => c.base.trim() !== camadasTocando[i].base.trim())
  }, [camadas, camadasTocando, codigoTocando])

  /* A regra mora em `consulta.ts`, com o porquê. */
  const semSom = useMemo(
    () => camadasSemSom(camadas.map(c => c.base), sonsConhecidos, amostraDaCamada),
    [camadas, sonsConhecidos],
  )

  const caixaRef = useRef<HTMLDivElement | null>(null)
  /**
   * O canvas vem por CALLBACK REF, e o motivo custou uma sessão de depuração.
   *
   * Os dois effects que dão vida a esta tela (o `requestAnimationFrame` e o
   * `d3-zoom`) estavam presos em `[aberta]` e liam `telaRef.current`. Só que o
   * elemento pode REMONTAR sem `aberta` mudar: quando o take recarrega, `n` cai
   * a zero por um render (a tela mostra "nada no editor ainda"), o `<canvas>` é
   * destruído e um novo nasce no render seguinte. Nenhum dos dois effects
   * re-roda nesse caminho, então o canvas novo ficava com os atributos
   * originais (300×150), sem loop e sem zoom — a tela aparecia gigante e vazia,
   * e a roda rolava a página porque não havia handler nenhum.
   *
   * Com o nó em estado, "o canvas mudou" vira uma dependência de verdade e os
   * dois effects reatam sozinhos. `telaRef` continua pros callbacks de gesto,
   * que precisam do nó sem querer re-render.
   */
  const telaRef = useRef<HTMLCanvasElement | null>(null)
  const [tela, setTela] = useState<HTMLCanvasElement | null>(null)
  const pegarTela = useCallback((el: HTMLCanvasElement | null) => {
    telaRef.current = el
    setTela(el)
  }, [])
  const cacheRef = useRef(new CacheEventos())
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)

  /* ── tudo que o rAF lê fica em ref ─────────────────────────────── */
  //
  // O loop não pode depender de nada vindo do render, senão ele reinicia a cada
  // clique e perde a fase.
  const vivo = useRef({
    camadas: [] as Camada[],
    grade: null as Grade | null,
    arranjo: null as Arranjo | null,
    sel: 0,
    largura: 800,
    bpm: 120,
    tocando: false,
    divergente: false,
    ilegiveis: [] as boolean[],
    semSom: new Set<number>(),
    parcial: false,
    relogio: null as Relogio | null,
    agulhaParada: null as number | null,
    transform: zoomIdentity as ZoomTransform,
    precisaEstatico: true,
  })

  /* Os padrões vêm do que TOCA; a forma vem do buffer. */
  useEffect(() => {
    const bases = camadasTocando.map(c => c.base)
    const { padroes, ilegiveis } = avaliarCamadas(bases)
    cacheRef.current.trocar(padroes, ilegiveis)
    vivo.current.ilegiveis = ilegiveis
    vivo.current.precisaEstatico = true
  }, [camadasTocando])

  useEffect(() => {
    const v = vivo.current
    v.camadas = camadas
    v.grade = grade
    v.arranjo = arranjo
    v.divergente = divergente
    v.semSom = semSom
    v.precisaEstatico = true
  }, [camadas, grade, arranjo, divergente, semSom])

  useEffect(() => { vivo.current.sel = sel; vivo.current.precisaEstatico = true }, [sel])
  useEffect(() => { vivo.current.largura = largura; vivo.current.precisaEstatico = true }, [largura])
  useEffect(() => { vivo.current.bpm = bpm; vivo.current.precisaEstatico = true }, [bpm])
  useEffect(() => { vivo.current.tocando = tocando; vivo.current.precisaEstatico = true }, [tocando])

  useEffect(() => {
    let morto = false
    carregarRelogio().then(r => { if (!morto) vivo.current.relogio = r }).catch(() => {})
    return () => { morto = true }
  }, [])

  /* ── largura ───────────────────────────────────────────────────── */
  useEffect(() => {
    const el = caixaRef.current
    if (!el) return
    const medir = (w: number) => setLargura(p => (Math.abs(p - w) < 2 ? p : Math.max(320, Math.round(w))))
    medir(el.clientWidth)
    // Sem ResizeObserver (jsdom, navegador antigo) a tela não some: fica com a
    // largura da montagem. Grade esticada é degradação; tela em branco não é.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(es => medir(es[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [aberta])

  /* ── escrita: o mesmo contrato da GradeArranjo ─────────────────── */
  //
  // O estado das casas NÃO vive em React: vive no `.js` e é lido de volta dele.
  // Um botão que muda o arranjo sem o código dizer isso transforma o editor em
  // mentiroso. E o ref existe porque no arrasto vários edits saem antes do
  // primeiro re-render do pai — usar a prop perderia as casas do meio do gesto.
  const codigoRef = useRef(codigo)
  useEffect(() => { codigoRef.current = codigo }, [codigo])

  const pintarCasa = useCallback((linha: number, casa: number, ligado: boolean) => {
    const antes = codigoRef.current
    const cs = detectarCamadas(antes)
    const g = gradeDoTake(cs)
    if (!g.ok || !cs[linha]) return
    const comMascara = alternarCasa(antes, cs[linha], casa, g.arranjo, ligado)
    if (comMascara === antes) return
    // Os dois no mesmo edit, sempre. Escrever a máscara sem redesenhar o
    // comentário recriaria, em um clique, a divergência que `camadas.ts` fechou.
    const depois = sincronizarGrade(comMascara, detectarCamadas(comMascara))
    codigoRef.current = depois
    onAplicar(depois)
  }, [onAplicar])

  const apagarCasa = useCallback((casa: number) => {
    const antes = codigoRef.current
    const cs = detectarCamadas(antes)
    const g = gradeDoTake(cs)
    if (!g.ok) return
    const depois = removerCasa(antes, cs, casa, g.arranjo)
    if (depois === antes) return
    codigoRef.current = depois
    onAplicar(depois)
  }, [onAplicar])

  const aplicarFx = useCallback((novos: Map<number, EstadoFx>) => {
    if (!novos.size) return
    onAplicar(reescrever(codigo, camadas, novos))
  }, [codigo, camadas, onAplicar])

  /* ── zoom: d3 no canvas ────────────────────────────────────────── */
  //
  // O comportamento fica preso ao elemento e o transform vira estado do próprio
  // d3 — é isso que faz o gesto seguinte partir de onde o anterior parou. Um
  // `{k,x,y}` guardado à mão faz a tela pular na primeira roda depois do clique.
  useEffect(() => {
    if (!tela || !aberta) return

    const zb = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, zoomMaximo(vivo.current.arranjo)])
      .translateExtent(limitesDePan(vivo.current.largura))
      .extent([[0, 0], [vivo.current.largura, 1]])
      // Arrastar na FAIXA pinta casa; arrastar na RÉGUA (ou com shift) faz pan.
      // Sem este filtro os dois gestos brigam e o mais usado — pintar — perde.
      .filter((e: GestoBruto) => {
        if (e.type === 'wheel') return true
        if (e.ctrlKey && e.type !== 'wheel') return false
        // Antes a REGUA era a zona de pan. Deixou de ser: ali o gesto virou
        // mover a agulha, que e o que se procura numa regua desde o Premiere.
        // Pan sobrou pro shift e pro botao do meio — e pro minimapa, que e o
        // jeito mais rapido de atravessar a peca de qualquer forma.
        return !!(e.shiftKey || e.button === 1)
      })
      .on('zoom', (e: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        vivo.current.transform = e.transform
        vivo.current.precisaEstatico = true
        setZoomAtual(e.transform.k)
      })

    zoomRef.current = zb
    const s = select(tela)
    s.call(zb)
    // O duplo-clique do d3 dá zoom; aqui ele volta pra peça inteira, que é o
    // gesto que a pessoa procura quando se perdeu.
    s.on('dblclick.zoom', null)
    return () => { s.on('.zoom', null) }
  }, [aberta, tela])

  /* Peça e largura mudam os limites — reaplicados, não recriados, senão o
     transform atual seria descartado a cada tecla digitada no editor. */
  useEffect(() => {
    const zb = zoomRef.current
    if (!tela || !zb) return
    zb.scaleExtent([1, zoomMaximo(arranjo)])
      .translateExtent(limitesDePan(largura))
      .extent([[0, 0], [largura, 1]])
  }, [arranjo, largura, tela])

  const irPara = useCallback((t: ZoomTransform) => {
    const tela = telaRef.current
    const zb = zoomRef.current
    if (!tela || !zb) return
    select(tela).call(zb.transform, t)
  }, [])

  const voltarInteira = useCallback(() => irPara(pecaInteira()), [irPara])

  /* ── o loop ────────────────────────────────────────────────────── */
  useEffect(() => {
    // O NO vem do ref, nao do estado: dentro do laco a gente escreve em
    // `el.width`, e escrever num objeto que veio do estado e mutar estado depois
    // do render (o compilador do React reprova, com razao). O estado `tela` fica
    // como o SINAL de "o canvas trocou" — que e do que a dependencia precisa.
    const el = telaRef.current
    if (!aberta || !el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    // Camada estática num canvas de memória: rótulo, régua, casas e eventos só
    // mudam quando o zoom, o texto ou o cache mudam. Redesenhar texto de oito
    // faixas a 60fps é trabalho repetido no thread que agenda o som.
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

      const esc = escalaComZoom(v.arranjo, w, v.transform)
      const px = pxPorCiclo(esc)
      const detalhe = detalheDe(px)
      const total = ciclosDoArranjo(v.arranjo)
      const porCasa = v.arranjo?.porCasa ?? 8
      const spc = segundosPorCiclo(v.bpm)
      const fim = REGUA + Math.max(1, v.camadas.length) * FAIXA

      /* ── régua ── */
      // Passo escolhido pelo espaço disponível, não fixo: régua que escreve por
      // cima de si mesma é pior que régua com menos marcas.
      const passo = escolherPasso(px, porCasa)
      fctx.font = `400 8px ${MONO}`
      fctx.textBaseline = 'middle'
      for (let c = 0; c <= total; c += passo) {
        const x = esc(c)
        if (x < GUTTER - 1 || x > w + 1) continue
        const naCasa = c % porCasa === 0
        fctx.fillStyle = naCasa ? t25 : t12
        fctx.fillRect(Math.round(x), naCasa ? 0 : REGUA - 4, 1, naCasa ? fim : 4)
        if (naCasa) {
          fctx.fillStyle = t45
          fctx.fillText(`${c / porCasa + 1}`, Math.round(x) + 3, 6)
          fctx.fillStyle = t25
          fctx.fillText(mmss(c * spc), Math.round(x) + 3, 14)
        }
      }
      fctx.fillStyle = t12
      fctx.fillRect(GUTTER, REGUA - 1, w - GUTTER, 1)

      /* ── o que a el sabe e o que não sabe ── */
      const partes: string[] = []
      if (!v.tocando) partes.push('parado')
      if (v.divergente) partes.push('editado · ctrl+enter')
      if (v.parcial) partes.push('grade parcial')
      if (!v.grade?.ok) partes.push(v.grade?.motivo ?? 'sem grade')
      if (v.semSom.size) {
        // O NOME do banco, nao so a contagem: "1 camada sem som" manda procurar,
        // "sem som: dirt_dr55" ja diz o que consertar.
        const faltando = [...v.semSom].map(i => amostraDaCamada(v.camadas[i]?.base ?? '')?.banco).filter(Boolean)
        partes.push(`sem som: ${faltando.slice(0, 2).join(', ')}${faltando.length > 2 ? '…' : ''}`)
      }
      if (partes.length) {
        fctx.font = `500 8px ${MONO}`
        fctx.fillStyle = t45
        fctx.textAlign = 'right'
        fctx.fillText(partes.join('  ·  '), w - 4, 6)
        fctx.textAlign = 'left'
      }

      /* ── faixas ── */
      const linhas = v.grade?.ok ? v.grade.linhas : []
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
        fctx.fillStyle = t12
        fctx.fillRect(GUTTER, y + FAIXA - 1, w - GUTTER, 1)

        /* gutter: índice, rótulo, estado por palavra — nunca por cor */
        fctx.font = `400 8px ${MONO}`
        fctx.fillStyle = t25
        fctx.fillText(String(i + 1), 6, meio)
        fctx.font = `${escolhida ? 500 : 400} 9px ${MONO}`
        fctx.fillStyle = (c.fx.mudo || v.semSom.has(i)) ? t25 : escolhida ? t100 : t70
        const nome = c.rotulo.slice(0, 11)
        fctx.fillText(nome, 16, meio)
        if (c.fx.mudo || v.semSom.has(i)) {
          // riscado: o sinal que sobrevive sem hue e sem espaço pra palavra
          fctx.fillRect(16, Math.round(meio), fctx.measureText(nome).width, 1)
        }
        // `sem som` ganha de tudo no gutter: uma camada com fx e sample
        // inexistente tem um problema so, e nao e o fx.
        const marca = v.semSom.has(i) ? 'sem som' : v.ilegiveis[i] ? 'ilegível' : resumoFx(c)
        if (marca) {
          fctx.font = `400 8px ${MONO}`
          fctx.fillStyle = t45
          fctx.textAlign = 'right'
          fctx.fillText(marca, GUTTER - 6, meio)
          fctx.textAlign = 'left'
        }

        /* ── as casas: a FORMA, sempre desenhada, vinda do buffer ── */
        const casas = linhas[i]?.casas
        if (casas) {
          for (let k = 0; k < casas.length; k++) {
            if (!casas[k]) continue
            const x0 = esc(k * porCasa)
            const x1 = esc((k + 1) * porCasa)
            if (x1 < GUTTER || x0 > w) continue
            const a = Math.max(GUTTER, x0)
            const b = Math.min(w, x1)
            if (v.divergente) {
              // Divergiu: vazado. A forma do buffer ainda não é o que soa, e
              // preencher afirmaria que é.
              fctx.strokeStyle = t25
              fctx.lineWidth = 1
              fctx.strokeRect(a + 0.5, y + 1.5, Math.max(1, b - a - 1), FAIXA - 4)
            } else {
              // 0.18 e nao 0.10: a 0.10 as casas acesas e apagadas ficavam a um
              // passo de cinza uma da outra e o arranjo nao se lia de relance —
              // que e exatamente a queixa que esta tela existe pra resolver.
              // Muda continua marcada por opacidade, nao por hue.
              fctx.fillStyle = (c.fx.mudo || v.semSom.has(i))
                ? 'rgba(217,255,227,0.05)' : 'rgba(217,255,227,0.18)'
              fctx.fillRect(a, y + 1, Math.max(1, b - a - 1), FAIXA - 3)
            }
          }
        }

        /* ── os eventos: só quando o zoom os torna legíveis ── */
        if (detalhe === 'casas') return
        const alt = detalhe === 'eventos' ? 7 : 5
        const topo = Math.round(meio - alt / 2)
        // Camada que pede som inexistente desenha com o peso de muda: os
        // eventos EXISTEM (o queryArc devolve), mas nenhum deles vai soar, e
        // desenhar cheio afirmaria que vao.
        const inerte = c.fx.mudo || v.semSom.has(i)
        fctx.strokeStyle = inerte ? t12 : t45
        fctx.fillStyle = inerte ? t12 : t45
        fctx.lineWidth = 1
        const { ini: cIni, fim: cFim } = ciclosVisiveis(esc, v.arranjo, w)
        for (let cic = cIni; cic < cFim; cic++) {
          const evs = cacheRef.current.ler(i, cic)
          if (!evs) continue
          if (detalhe === 'densidade') {
            // Nesta faixa dois eventos caem no mesmo pixel; desenhar os dois é
            // gastar quadro pra mentir sobre resolução. Densidade é a leitura
            // honesta: quão cheio esse ciclo está.
            if (!evs.length) continue
            const x0 = Math.max(GUTTER, esc(cic))
            const x1 = Math.min(w, esc(cic + 1))
            const cheio = Math.min(1, evs.length / 16)
            const hh = Math.max(1, Math.round(alt * cheio))
            fctx.fillRect(x0, Math.round(meio - hh / 2), Math.max(1, x1 - x0 - 1), hh)
            continue
          }
          for (const e of evs) {
            const x0 = esc(e.ini)
            const x1 = esc(e.fim)
            if (x1 < GUTTER || x0 > w) continue
            fctx.strokeRect(Math.round(Math.max(GUTTER, x0)) + 0.5, topo + 0.5,
              Math.max(2, Math.min(w, x1) - Math.max(GUTTER, x0)), alt)
          }
        }
      })

      /* ── minimapa: a peça inteira, sempre, e onde a janela está ── */
      const my = fim + VAO_MINIMAPA
      fctx.fillStyle = 'rgba(217,255,227,0.03)'
      fctx.fillRect(GUTTER, my, w - GUTTER, MINIMAPA)
      const mBase = escalaBase(v.arranjo, w)
      // Sai das CASAS, não dos eventos: é texto, custa zero, e existe com o som
      // parado — o minimapa nunca fica vazio esperando o primeiro play.
      linhas.forEach((l, i) => {
        const hh = Math.max(1, Math.floor(MINIMAPA / Math.max(1, linhas.length)))
        const yy = my + i * hh
        fctx.fillStyle = t25
        for (let k = 0; k < l.casas.length; k++) {
          if (!l.casas[k]) continue
          const x0 = mBase(k * porCasa)
          const x1 = mBase((k + 1) * porCasa)
          fctx.fillRect(x0, yy, Math.max(1, x1 - x0 - 1), Math.max(1, hh - 1))
        }
      })
      /**
       * A janela: escurece o que esta FORA, nao contorna o que esta dentro.
       *
       * A primeira versao desenhava um retangulo `ACESO` em volta do visivel, e
       * com a peca inteira na el (que e como ela abre) esse retangulo cobria a
       * largura toda — virava a coisa mais berrante da el pra dizer "voce esta
       * vendo tudo", que e a informacao menos util que existe. O veu e o idioma
       * do Premiere e se resolve sozinho: sem nada fora, nada e desenhado.
       */
      const jIni = Math.max(GUTTER, mBase(esc.invert(GUTTER)))
      const jFim = Math.min(w, mBase(esc.invert(w)))
      if (jIni > GUTTER + 1 || jFim < w - 1) {
        fctx.fillStyle = 'rgba(8,11,7,0.72)'
        fctx.fillRect(GUTTER, my, jIni - GUTTER, MINIMAPA)
        fctx.fillRect(jFim, my, w - jFim, MINIMAPA)
        // as duas bordas da janela, e so elas: e o que a mao procura pra arrastar
        fctx.fillStyle = ACESO
        fctx.fillRect(Math.round(jIni), my, 1, MINIMAPA)
        fctx.fillRect(Math.round(jFim) - 1, my, 1, MINIMAPA)
      }
    }

    // `desenhar` NAO se reagenda: o rAF entrega um timestamp ao callback, que
    // cairia no parametro e faria o laco depender de um numero. Quem agenda e
    // `laco`; assim o quadro sincrono da montagem chama `desenhar` direto.
    const desenhar = () => {
      const v = vivo.current
      const w = v.largura
      const h = altura(v.camadas.length)
      const dpr = Math.min(2, window.devicePixelRatio || 1)

      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
        el.style.height = `${h}px`
        v.precisaEstatico = true
      }

      /* Consulta só o visível, e só quando o zoom pede evento. Com a peça
         aberta em `casas` isto não roda: zero `queryArc`. */
      const esc = escalaComZoom(v.arranjo, w, v.transform)
      const detalhe = detalheDe(pxPorCiclo(esc))
      if (detalhe !== 'casas') {
        const { ini, fim } = ciclosVisiveis(esc, v.arranjo, w)
        const antes = cacheRef.current.tamanho
        const r = cacheRef.current.garantir(ini, fim)
        if (r.parcial !== v.parcial) { v.parcial = r.parcial; v.precisaEstatico = true }
        if (cacheRef.current.tamanho !== antes) v.precisaEstatico = true
      } else if (v.parcial) {
        v.parcial = false
        v.precisaEstatico = true
      }

      if (v.precisaEstatico) { desenharEstatico(dpr, w, h) ; v.precisaEstatico = false }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.drawImage(fundo, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      /* ── a agulha ── */
      /**
       * Parado, a agulha some — e some justo depois de a pessoa clicar pra
       * posiciona-la, que e quando ela mais precisa de resposta. O ponto
       * escolhido nao e ficcao: `startClock` do clockworker NAO reseta o ciclo,
       * entao o proximo play comeca exatamente ali. Desenhar e dizer a verdade.
       */
      const lido = cicloAgora(v.relogio) ?? v.agulhaParada
      if (lido === null) return
      const total = ciclosDoArranjo(v.arranjo)
      // O relógio cresce pra sempre; a peça dá a volta. O resto é a posição
      // DENTRO da peça — a mesma aritmética de `casaDoCiclo`.
      const pos = lido % total
      const xh = esc(pos)

      // o que soa AGORA: preenchido. É o único preenchido claro da el.
      if (detalhe === 'eventos') {
        const cic = Math.floor(pos)
        v.camadas.forEach((c, i) => {
          if (c.fx.mudo || v.semSom.has(i)) return
          const evs = cacheRef.current.ler(i, cic)
          if (!evs) return
          const y = REGUA + i * FAIXA + FAIXA / 2
          ctx.fillStyle = t100
          for (const e of evs) {
            if (pos < e.ini || pos >= e.fim) continue
            const x0 = Math.max(GUTTER, esc(e.ini))
            const x1 = Math.min(w, esc(e.fim))
            ctx.fillRect(Math.round(x0), Math.round(y - 3.5), Math.max(2, x1 - x0), 7)
          }
        })
      }

      if (xh >= GUTTER && xh <= w) {
        ctx.fillStyle = ACESO
        ctx.fillRect(Math.round(xh), 0, 1, REGUA + Math.max(1, v.camadas.length) * FAIXA)
      }
      // no minimapa a agulha aparece SEMPRE, mesmo com a janela longe dela —
      // é o que responde "onde a peça está" sem desfazer o zoom.
      const mBase = escalaBase(v.arranjo, w)
      const my = REGUA + Math.max(1, v.camadas.length) * FAIXA + VAO_MINIMAPA
      ctx.fillStyle = ACESO
      ctx.fillRect(Math.round(mBase(pos)), my, 1, MINIMAPA)
    }

    /**
     * UM quadro sincrono antes de agendar o rAF.
     *
     * `requestAnimationFrame` nao dispara em aba de fundo — medido: zero quadros
     * em 800 ms com `document.hidden`. Como era o loop que dimensionava o canvas,
     * a el ficava nos 300x150 de fabrica e o `width:100%` esticava isso pelo
     * aspect-ratio intrinseco (2:1) ate virar um bloco vazio de 847px de altura.
     * Quem voltava pra aba encontrava esse monstro ate cair o primeiro quadro.
     *
     * Tamanho e desenho inicial sao LAYOUT, nao animacao. O rAF so anima a
     * agulha; a el ja nasce certa mesmo que nenhum quadro chegue.
     */
    const laco = () => { desenhar(); quadro = requestAnimationFrame(laco) }
    desenhar()
    quadro = requestAnimationFrame(laco)
    return () => cancelAnimationFrame(quadro)
  }, [aberta, tela])

  /* ── gestos de ponteiro ────────────────────────────────────────── */
  //
  // O modo (ligar/desligar) é decidido na PRIMEIRA célula e as seguintes
  // obedecem — alternar cada uma sob o dedo inverteria casas alternadas e o
  // desenho viraria ruído. É por isso que `alternarCasa` aceita `ligado`.
  const pintando = useRef<null | boolean>(null)
  const arrastandoMini = useRef(false)
  const arrastandoAgulha = useRef(false)

  useEffect(() => {
    const soltar = () => {
      pintando.current = null
      arrastandoMini.current = false
      arrastandoAgulha.current = false
    }
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [])

  /** Onde o ponteiro caiu: qual camada, qual casa, e em que zona. */
  const alvoEm = useCallback((cx: number, cy: number) => {
    const tela = telaRef.current
    if (!tela) return null
    const r = tela.getBoundingClientRect()
    const x = cx - r.left
    const y = cy - r.top
    const w = vivo.current.largura
    const fim = REGUA + Math.max(1, camadas.length) * FAIXA
    if (y >= fim + VAO_MINIMAPA) return { zona: 'minimapa' as const, x, y }
    if (y < REGUA) return { zona: 'regua' as const, x, y }
    const linha = Math.floor((y - REGUA) / FAIXA)
    if (linha < 0 || linha >= camadas.length) return null
    if (x < GUTTER) return { zona: 'gutter' as const, linha, x, y }
    const esc = escalaComZoom(vivo.current.arranjo, w, vivo.current.transform)
    const porCasa = vivo.current.arranjo?.porCasa ?? 8
    const casa = Math.floor(esc.invert(x) / porCasa)
    const casas = vivo.current.arranjo?.casas ?? 0
    if (casa < 0 || casa >= casas) return { zona: 'vazio' as const, linha, x, y }
    return { zona: 'casa' as const, linha, casa, x, y }
  }, [camadas.length])

  /** Move a janela pro ponto do minimapa, mantendo o zoom. */
  const moverPeloMinimapa = useCallback((x: number) => {
    const v = vivo.current
    const w = v.largura
    const total = ciclosDoArranjo(v.arranjo)
    const mBase = escalaBase(v.arranjo, w)
    const alvo = Math.max(0, Math.min(total, mBase.invert(x)))
    const esc = escalaComZoom(v.arranjo, w, v.transform)
    const janela = esc.invert(w) - esc.invert(GUTTER)
    irPara(enquadrar(v.arranjo, w, alvo - janela / 2, alvo + janela / 2))
  }, [irPara])

  /**
   * Leva o relogio pro ciclo sob o ponteiro.
   *
   * O ciclo e ABSOLUTO na peca (0..casas*porCasa), que e exatamente o que o
   * `setCycle` do NeoCyclist quer — o arranjo se repete nesse periodo, entao
   * cair no ciclo 20 cai no mesmo lugar do arranjo em toda volta.
   */
  const moverAgulha = useCallback((x: number) => {
    if (!onMoverAgulha) return
    const v = vivo.current
    const esc = escalaComZoom(v.arranjo, v.largura, v.transform)
    const total = ciclosDoArranjo(v.arranjo)
    const alvo = Math.max(0, Math.min(total, esc.invert(x)))
    v.agulhaParada = alvo
    v.precisaEstatico = true
    onMoverAgulha(alvo)
  }, [onMoverAgulha])

  const noPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // shift é pan (o d3 cuida) e não deve pintar nada
    if (e.shiftKey || e.button === 1) return
    const a = alvoEm(e.clientX, e.clientY)
    if (!a) return
    if (a.zona === 'minimapa') {
      e.preventDefault()
      arrastandoMini.current = true
      moverPeloMinimapa(a.x)
      return
    }
    if (a.zona === 'regua') {
      // Sem `onMoverAgulha` a regua nao faz NADA, e e melhor assim: um clique
      // que parece mover e nao move e pior que um clique inerte. Quem desenha a
      // dica embaixo tambem le essa condicao e nao anuncia o gesto.
      if (!onMoverAgulha) return
      e.preventDefault()
      arrastandoAgulha.current = true
      moverAgulha(a.x)
      return
    }
    e.preventDefault()                       // não rouba foco do editor
    onSel(a.linha)
    if (a.zona === 'gutter') {
      // clicar no NOME muda: é o gesto mais repetido do jam, e obrigar a mirar
      // num botão depois de selecionar seria duas ações pra uma decisão.
      if (e.altKey) aplicarFx(alternarSolo(camadas, a.linha))
      else aplicarFx(new Map([[a.linha, alternarMudo(camadas[a.linha].fx)]]))
      return
    }
    if (a.zona !== 'casa') return
    if (e.altKey) { apagarCasa(a.casa); return }
    const ligada = (grade.ok ? grade.linhas[a.linha]?.casas[a.casa] : false) ?? false
    pintando.current = !ligada
    pintarCasa(a.linha, a.casa, !ligada)
  }, [alvoEm, camadas, grade, onSel, aplicarFx, apagarCasa, pintarCasa, moverPeloMinimapa, moverAgulha, onMoverAgulha])

  const noPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    /**
     * O cursor conta o que aquela faixa de pixels faz, ANTES do clique.
     *
     * Numa tela desenhada em canvas nao ha `<button>` pra herdar affordance:
     * tudo e um retangulo. Sem isto, a regua e indistinguivel do resto e o
     * scrub so e descoberto por quem leu a linha de ajuda — foi assim que o
     * gesto existiu sem ser encontrado.
     */
    if (!pintando.current && !arrastandoMini.current && !arrastandoAgulha.current) {
      const z = alvoEm(e.clientX, e.clientY)
      const alvo = e.currentTarget
      const cursor = !z ? 'default'
        : z.zona === 'regua' ? (onMoverAgulha ? 'ew-resize' : 'default')
        : z.zona === 'minimapa' ? 'ew-resize'
        : z.zona === 'casa' || z.zona === 'gutter' ? 'pointer'
        : 'default'
      if (alvo.style.cursor !== cursor) alvo.style.cursor = cursor
    }
    if (arrastandoAgulha.current) {
      const r = e.currentTarget.getBoundingClientRect()
      moverAgulha(e.clientX - r.left)
      return
    }
    if (arrastandoMini.current) {
      const a = alvoEm(e.clientX, e.clientY)
      if (a) moverPeloMinimapa(a.x)
      return
    }
    if (pintando.current === null) return
    const a = alvoEm(e.clientX, e.clientY)
    if (a && a.zona === 'casa') pintarCasa(a.linha, a.casa, pintando.current)
  }, [alvoEm, moverPeloMinimapa, pintarCasa, moverAgulha, onMoverAgulha])

  /* ── teclado ───────────────────────────────────────────────────── */
  const noTeclado = useCallback((e: React.KeyboardEvent) => {
    const v = vivo.current
    const w = v.largura
    const esc = escalaComZoom(v.arranjo, w, v.transform)
    const a = esc.invert(GUTTER), b = esc.invert(w)
    const jan = b - a
    if (e.key === '0') { e.preventDefault(); voltarInteira() }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); irPara(enquadrar(v.arranjo, w, a + jan / 4, b - jan / 4)) }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); irPara(enquadrar(v.arranjo, w, a - jan / 2, b + jan / 2)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(enquadrar(v.arranjo, w, a - jan / 4, b - jan / 4)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); irPara(enquadrar(v.arranjo, w, a + jan / 4, b + jan / 4)) }
  }, [irPara, voltarInteira])

  /* ── o sample da camada ────────────────────────────────────────── */
  //
  // Caminho separado do `aplicarFx`: aquele reescreve o BLOCO de efeitos no fim
  // da camada, este troca um argumento no meio dela. Misturar faria a troca de
  // sample apagar o fx escrito à mão.
  const alvo: Camada | undefined = camadas[sel]
  const amostra = alvo ? amostraDaCamada(alvo.base) : null
  const trocarN = useCallback((k: number) => {
    if (!alvo) return
    onAplicar(trocarAmostra(codigo, alvo, k))
  }, [alvo, codigo, onAplicar])
  const escolhendo = escolhendoPara === sel

  const ciclos = ciclosDoArranjo(arranjo)
  const durSeg = ciclos * segundosPorCiclo(bpm)

  return (
    <div ref={caixaRef} style={{ position: 'relative', flexShrink: 0, borderTop: LINHA, background: FUNDO_ALTO }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: ESP.xs, minHeight: 22,
        padding: `0 ${ESP.sm}px`, borderBottom: aberta ? LINHA : undefined, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => { const v = !aberta; setAberta(v); localStorage.setItem(LS_ABERTA, v ? '1' : '0') }}
          style={botaoTexto}
          title={aberta ? 'recolher' : 'abrir'}
        >{aberta ? '▾' : '▸'} linha do tempo</button>

        {aberta && (
          <>
            <span style={{ color: t25, font: `400 8px ${MONO}` }}>
              {grade.ok ? `${grade.arranjo.casas}×${grade.arranjo.porCasa}` : '—'} · {ciclos}c · {mmss(durSeg)}
            </span>
            <span style={{ color: t12, font: `400 9px ${MONO}` }}>|</span>
            <button onClick={voltarInteira} style={zoomAtual > 1.01 ? botaoAceso : botaoTexto}
              title="a peça inteira (tecla 0)">peça</button>
            <span style={{ color: t45, font: `400 8px ${MONO}`, minWidth: 26 }}>{zoomAtual.toFixed(1)}×</span>

            {alvo && (
              <>
                <span style={{ color: t12, font: `400 9px ${MONO}` }}>|</span>
                <span style={{ color: t100, font: `500 9px ${MONO}`, letterSpacing: '0.08em' }}>
                  {sel + 1} {alvo.rotulo}
                </span>
                <button onClick={() => aplicarFx(new Map([[sel, alternarMudo(alvo.fx)]]))}
                  style={alvo.fx.mudo ? botaoAceso : botaoTexto}>mudo</button>
                <button onClick={() => aplicarFx(alternarSolo(camadas, sel))} style={botaoTexto}
                  title="alt+clique no nome faz o mesmo">só ela</button>
                {NOMES_FX.map(nome => {
                  const nivel = alvo.fx.niveis[nome] ?? 0
                  return (
                    <button key={nome} onClick={() => aplicarFx(new Map([[sel, girarFx(alvo.fx, nome)]]))}
                      style={nivel > 0 ? botaoAceso : botaoTexto}
                      title={nivel > 0 ? FX[nome].niveis[nivel - 1] : `${FX[nome].niveis.length} níveis`}>
                      {FX[nome].rotulo}{nivel > 0 ? nivel : ''}
                    </button>
                  )
                })}
                <button onClick={() => aplicarFx(limparTudo(camadas))} style={botaoTexto}>limpar</button>
                {amostra && (
                  <>
                    <span style={{ color: t12, font: `400 9px ${MONO}` }}>|</span>
                    <button onClick={() => trocarN(Math.max(0, amostra.n - 1))} style={botaoTexto}>◂</button>
                    <button onClick={() => setEscolhendoPara(v => (v === sel ? null : sel))} style={escolhendo ? botaoAceso : botaoTexto}
                      title={`escolher no banco ${amostra.banco}`}>n{amostra.n}</button>
                    <button onClick={() => trocarN(amostra.n + 1)} style={botaoTexto}>▸</button>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      {escolhendo && amostra && (
        <Amostras banco={amostra.banco} n={amostra.n} onEscolher={trocarN} onFechar={() => setEscolhendoPara(null)} />
      )}

      {aberta && (
        n === 0 ? (
          <div style={{ padding: `${ESP.sm}px`, color: t45, font: `400 10px ${MONO}` }}>
            nada no editor ainda — escreva um `stack` e a peça aparece aqui
          </div>
        ) : (
          <>
            <canvas
              ref={pegarTela}
              tabIndex={0}
              onPointerDown={noPointerDown}
              onPointerMove={noPointerMove}
              onDoubleClick={voltarInteira}
              onKeyDown={noTeclado}
              /* A altura vem do React, que sabe quantas camadas existem sem
                 precisar de quadro nenhum. Sem ela o canvas cai no 300x150 de
                 fabrica e o `width:100%` estica pelo aspect-ratio intrinseco. */
              style={{
                display: 'block', width: '100%', height: altura(n),
                cursor: 'default', outline: 'none', touchAction: 'none',
              }}
            />
            {/* Gesto com modificador que ninguém conta é gesto que não existe. */}
            <div style={{
              padding: `2px ${ESP.sm}px 4px`, color: t25, font: `400 8px ${MONO}`,
              whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              roda = zoom · shift+arrasta = anda · arrasta na faixa = pinta casa ·
              alt+clique na casa = remove · clique no nome = mudo · 0 = peça inteira ·
              {onMoverAgulha ? ' clique na régua = leva a agulha ·' : ''} escreve no código
            </div>
          </>
        )
      )}
    </div>
  )
}

/**
 * O passo da régua: quantos ciclos entre marcas.
 *
 * Régua com passo fixo escreve por cima de si mesma quando o zoom abre e fica
 * vazia quando ele fecha. Sobe pela casa (que é a unidade que o autor pensa) e
 * desce por divisores dela.
 */
function escolherPasso(px: number, porCasa: number): number {
  if (px >= 60) return 1
  if (px * porCasa >= 90) return Math.max(1, Math.floor(porCasa / 4)) || 1
  if (px * porCasa >= 45) return Math.max(1, Math.floor(porCasa / 2)) || 1
  let p = porCasa
  while (px * p < 45 && p < porCasa * 64) p *= 2
  return p
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
  ...botaoTexto, color: '#080b07', background: ACESO, borderRadius: 2,
}
