/**
 * Agarrar o número no código e arrastar pra mudar o valor.
 *
 * POR QUE ISSO EXISTE: `.lpf(300)` é um filtro, não um texto. Quem está compondo
 * quer OUVIR 280, 320, 400 — não digitar três vezes, apagar, digitar de novo.
 * Selecionar-apagar-digitar-Ctrl+Enter é um ciclo de uns quatro segundos; o
 * arrasto é contínuo e a orelha decide sozinha onde parar.
 *
 * POR QUE NÃO USEI PRONTO (a regra da casa é não reinventar):
 *
 * - `@strudel/codemirror/slider.mjs` (já está no node_modules): o widget dele só
 *   aparece se a pessoa TROCAR `0.5` por `slider(0.5, 0, 1)` no código. Isso
 *   sujaria o patch e mudaria o texto que vai pro acervo/exportação. Fora do
 *   pedido. Serviu de referência de como eles montam decoration/widget.
 * - `@replit/codemirror-interact` (v6.3.1, 30 KB, MIT, mantido): é EXATAMENTE
 *   esta ideia e cheguei a instalar. Descartei por três coisas que não dá pra
 *   configurar: (1) exige tecla modificadora obrigatória — `interactModKey` cai
 *   em `alt` e não aceita "nenhuma", e o pedido é agarrar o número direto;
 *   (2) por consequência, alt/shift ficam ocupados pelo armar e não sobram pra
 *   granularidade fina/grossa; (3) ele despacha uma transação crua por
 *   mousemove, sem annotation, então o Ctrl+Z desfaz o arrasto em N passos.
 *   A arquitetura dele (StateField com o alvo + contentAttributes pro cursor)
 *   é boa e está reusada aqui; o que mudou foi o gesto.
 *
 * O QUE ESTE ARQUIVO GARANTE, e são as partes que doem se estiverem erradas:
 *
 * 1. PASSO SAI DO QUE A PESSOA ESCREVEU. Quem digitou `0.8` não quer receber
 *    `0.8137`; quem digitou `6` num `.n()` não quer `6.3`, que é índice de
 *    sample e viraria outro som (ou nenhum). O número diz sua própria
 *    granularidade pelas casas decimais.
 * 2. SÓ VIRA ARRASTO DEPOIS DO LIMIAR. Antes disso é clique, e clique posiciona
 *    o cursor como sempre.
 * 3. ÁUDIO É SAGRADO. Reavaliar o padrão a cada pixel derruba o som. A
 *    reavaliação é estrangulada por tempo e sempre acontece uma última vez ao
 *    soltar, pra ninguém ficar ouvindo um valor que o código não tem mais.
 * 4. UM ARRASTO = UM CTRL+Z. As transações do meio do caminho ficam FORA do
 *    histórico; ao soltar, o arrasto inteiro entra como um passo só.
 */
import { EditorView, ViewPlugin, Decoration, type PluginValue } from '@codemirror/view'
import { StateEffect, StateField, Transaction, type Extension } from '@codemirror/state'

// ---------------------------------------------------------------------------
// Parte pura: achar o número e decidir quanto ele anda por pixel.
// Fica separada da parte de mouse porque é ela que tem teste — jsdom não faz
// layout, então arrasto de verdade não se testa, mas a matemática sim.
// ---------------------------------------------------------------------------

export type Achado = { inicio: number; fim: number; texto: string }

/**
 * `12.5`, `.5` e `12` — nesta ordem, senão `12.5` sairia partido em `12` e `5`.
 * Sem expoente de propósito: `1e3` no meio de um patch é raro e um arrasto que
 * transforma notação científica em decimal seria uma surpresa ruim.
 */
const NUMERO = /\d+\.\d+|\.\d+|\d+/g

/**
 * Qual número está sob a coluna `coluna` desta linha.
 *
 * Duas recusas deliberadas, porque nem todo dígito é um valor:
 * - dígito colado num identificador (`lpf2`, `s3`) é NOME, não valor: mexer ali
 *   quebraria o código em vez de mudar o som;
 * - o `-` só entra no número quando é sinal (`gain(-0.5)`); em `x-1` ele é
 *   subtração, e engolir o operador viraria `x-2` sem querer... ou pior, `x`
 *   com o menos comido.
 */
export function acharNumeroNaLinha(linha: string, coluna: number): Achado | null {
  for (const m of linha.matchAll(NUMERO)) {
    if (m.index === undefined) continue
    let inicio = m.index
    const fim = inicio + m[0].length
    if (/[A-Za-z_$]/.test(linha[inicio - 1] ?? '')) continue
    if (linha[inicio - 1] === '-' && !/[\w)\]]/.test(linha[inicio - 2] ?? '')) inicio -= 1
    // `<= fim` de propósito: encostar logo depois do número ainda é "nele",
    // senão a última coluna vira um buraco morto de 1px na hora de agarrar.
    if (coluna >= inicio && coluna <= fim) return { inicio, fim, texto: linha.slice(inicio, fim) }
  }
  return null
}

export type Granularidade = {
  /** Quanto o valor anda por pixel, sem modificador. */
  passo: number
  /** Casas decimais que a PESSOA escreveu — o formato de saída respeita isso. */
  escritas: number
  /** Índice, contador, número de repetições: nunca pode virar fracionário. */
  inteiro: boolean
}

/**
 * Deduz a granularidade do jeito que o número foi escrito.
 *
 * `0.375` (delaytime) anda em milésimos, `0.8` (gain) em centésimos, `300` (lpf)
 * em unidades, `6` (índice de sample) em unidades e inteiro pra sempre.
 *
 * O piso de 2 casas é o que faz `0.8` ser arrastável: em décimos, cada pixel
 * pularia 10% do gain e o controle seria inútil. O teto de 3 é o que impede o
 * `0.8137` do enunciado.
 *
 * Inteiro grande (>= 1000, tipo `.lpf(4000)`) anda de 10 em 10: em passo 1,
 * atravessar o espectro audível custaria 4000 pixels de tela.
 */
export function granularidadeDe(texto: string): Granularidade {
  const semSinal = texto.startsWith('-') ? texto.slice(1) : texto
  const ponto = semSinal.indexOf('.')
  if (ponto === -1) {
    const magnitude = Math.abs(Number(texto)) || 0
    return { passo: magnitude >= 1000 ? 10 : 1, escritas: 0, inteiro: true }
  }
  const escritas = semSinal.length - ponto - 1
  return { passo: 10 ** -Math.min(3, Math.max(2, escritas)), escritas, inteiro: false }
}

/** Shift = fino (1/10). Alt ou Ctrl = grosso (x10). Shift ganha se vierem juntos. */
export type Modificadores = { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean }

export function passoEfetivo(g: Granularidade, mods: Modificadores = {}): number {
  // Fino num inteiro continua 1: `.n(6)` com Shift não pode virar `6.5`, porque
  // não existe meio sample.
  if (mods.shiftKey) return g.inteiro ? g.passo : g.passo / 10
  if (mods.altKey || mods.ctrlKey) return g.passo * 10
  return g.passo
}

/** Casas em que o resultado é quantizado — nunca menos do que a pessoa escreveu. */
export function casasEfetivas(g: Granularidade, passo: number): number {
  if (g.inteiro) return 0
  return Math.min(4, Math.max(g.escritas, Math.round(-Math.log10(passo))))
}

/**
 * Formata sem inventar precisão: corta zero à direita, mas nunca abaixo das
 * casas que a pessoa escreveu. `0.8` arrastado e voltado continua `0.8`, não
 * `0.80` — se mudasse, o próximo arrasto teria outra granularidade e o controle
 * mudaria de sensibilidade sozinho.
 */
export function formatar(valor: number, casas: number, minimas: number): string {
  if (casas === 0) return String(Math.round(valor))
  let s = valor.toFixed(casas)
  const ponto = s.indexOf('.')
  let fim = s.length
  while (fim - ponto - 1 > Math.max(1, minimas) && s[fim - 1] === '0') fim -= 1
  return s.slice(0, fim)
}

/**
 * O valor depois de arrastar `deltaPx` pixels a partir do texto ORIGINAL.
 *
 * Sempre a partir do original, nunca acumulando sobre o último resultado: assim
 * voltar o mouse pro lugar devolve exatamente o número de partida, e o erro de
 * ponto flutuante não se soma ao longo de 300 quadros.
 * Direita aumenta, que é a convenção de DevTools, Blender e After Effects.
 */
export function valorArrastado(texto: string, deltaPx: number, mods: Modificadores = {}): string {
  const base = Number(texto)
  if (!Number.isFinite(base)) return texto
  const g = granularidadeDe(texto)
  const passo = passoEfetivo(g, mods)
  // Passo inteiro de pixel vezes o passo do número: o valor anda na grade que a
  // própria escrita definiu, e é isso que impede o `0.8137`. A grade é relativa
  // ao valor de partida, não ao zero absoluto — arrastar grosso a partir de `6`
  // tem que dar `16`, não pousar no múltiplo de 10 mais próximo e comer o 6.
  const bruto = base + Math.round(deltaPx) * passo
  return formatar(bruto, casasEfetivas(g, passo), g.inteiro ? 0 : g.escritas)
}

// ---------------------------------------------------------------------------
// Parte de interface: o gesto no CodeMirror.
// ---------------------------------------------------------------------------

type Alvo = { de: number; ate: number }

const definirAlvo = StateEffect.define<Alvo | null>()

/**
 * Guarda só o número sob o mouse. É um StateField (e não estado do plugin)
 * porque decoration e cursor precisam ser derivados do estado — desenhar por
 * fora faria o realce sobreviver a uma edição que moveu o texto.
 */
const campoAlvo = StateField.define<Alvo | null>({
  create: () => null,
  update(valor, tr) {
    for (const e of tr.effects) if (e.is(definirAlvo)) return e.value
    if (!valor) return null
    if (tr.changes.empty) return valor
    return { de: tr.changes.mapPos(valor.de, -1), ate: tr.changes.mapPos(valor.ate, 1) }
  },
  provide: campo => [
    EditorView.decorations.from(campo, alvo =>
      alvo && alvo.ate > alvo.de
        ? Decoration.set(Decoration.mark({ class: 'cm-numero-arrastavel' }).range(alvo.de, alvo.ate))
        : Decoration.none,
    ),
    // O cursor vai no conteúdo inteiro, não numa span: trocar o cursor de um
    // elemento sob o mouse dispararia relayout de hover. Aqui é só um atributo.
    EditorView.contentAttributes.from(campo, alvo => ({ style: alvo ? 'cursor: ew-resize' : '' })),
  ],
})

/**
 * Realce discreto: o número precisa parecer agarrável sem MEXER NO LAYOUT.
 * Nada de borda, padding ou peso de fonte — qualquer um desses reflui a linha e
 * o código "pula" quando o mouse passa. Fundo e sublinhado não medem nada.
 */
const tema = EditorView.theme({
  '.cm-numero-arrastavel': {
    background: 'rgba(120, 200, 255, 0.16)',
    borderRadius: '3px',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'rgba(120, 200, 255, 0.7)',
  },
})

/** O valor do ViewPlugin: só os handlers, que o spec `eventHandlers` chama por `this`. */
type PluginoArrasto = PluginValue & {
  _handlers: {
    mousemove(e: MouseEvent): void
    mouseleave(): void
    mousedown(e: MouseEvent): void
  }
}

export type OpcoesArrasto = {
  /** Reavaliar o padrão pra OUVIR a mudança. Já vem estrangulado por tempo. */
  aoReavaliar?: () => void
  /** Teto de reavaliações durante o arrasto. 150 ms = ~7/s, que o áudio aguenta. */
  intervaloReavaliacaoMs?: number
  /** Pixels de folga antes de virar arrasto, pra não roubar clique nem seleção. */
  limiarPx?: number
}

type EmCurso = {
  de: number
  original: string
  atual: string
  x0: number
  posClique: number
  arrastando: boolean
  ultimaEval: number
  mudou: boolean
}

/**
 * A extensão. Some sozinha se o editor for destruído no meio do arrasto porque
 * os listeners moram no window e são removidos no destroy().
 */
export function arrastarNumero(opcoes: OpcoesArrasto = {}): Extension {
  const intervalo = opcoes.intervaloReavaliacaoMs ?? 150
  const limiar = opcoes.limiarPx ?? 4

  const plugin = ViewPlugin.define<PluginoArrasto>(
    view => {
      let curso: EmCurso | null = null

      /** Traduz coordenada de tela em número do documento. */
      const alvoEm = (x: number, y: number) => {
        const pos = view.posAtCoords({ x, y })
        if (pos === null) return null
        const linha = view.state.doc.lineAt(pos)
        const achado = acharNumeroNaLinha(linha.text, pos - linha.from)
        if (!achado) return null
        return { de: linha.from + achado.inicio, ate: linha.from + achado.fim, texto: achado.texto }
      }

      const mostrarAlvo = (alvo: Alvo | null) => {
        const atual = view.state.field(campoAlvo, false)
        if ((atual?.de ?? -1) === (alvo?.de ?? -1) && (atual?.ate ?? -1) === (alvo?.ate ?? -1)) return
        view.dispatch({ effects: definirAlvo.of(alvo) })
      }

      const reavaliar = () => {
        if (curso) curso.ultimaEval = performance.now()
        try { opcoes.aoReavaliar?.() } catch { /* padrão inválido no meio do arrasto não é erro */ }
      }

      const escrever = (texto: string) => {
        if (!curso || texto === curso.atual) return
        view.dispatch({
          changes: { from: curso.de, to: curso.de + curso.atual.length, insert: texto },
          // Fora do histórico: o Ctrl+Z não pode desfazer pixel por pixel. O
          // arrasto inteiro entra como um passo só quando o mouse solta.
          annotations: Transaction.addToHistory.of(false),
        })
        curso.atual = texto
        curso.mudou = true
        mostrarAlvo({ de: curso.de, ate: curso.de + texto.length })
        if (performance.now() - curso.ultimaEval >= intervalo) reavaliar()
      }

      const aoMover = (e: PointerEvent) => {
        if (!curso) return
        const dx = e.clientX - curso.x0
        if (!curso.arrastando) {
          if (Math.abs(dx) < limiar) return
          curso.arrastando = true
        }
        e.preventDefault()
        escrever(valorArrastado(curso.original, Math.round(dx), e))
      }

      const aoSoltar = () => {
        window.removeEventListener('pointermove', aoMover)
        window.removeEventListener('pointerup', aoSoltar)
        const c = curso
        curso = null
        if (!c) return
        if (!c.arrastando) {
          // Não passou do limiar: era clique. Devolve o comportamento normal,
          // que o preventDefault do mousedown tinha tirado.
          view.dispatch({ selection: { anchor: c.posClique } })
          return
        }
        if (c.mudou && c.atual !== c.original) {
          // Duas transações separadas de propósito: o CodeMirror funde specs
          // passadas no mesmo dispatch numa transação só, e aí as duas mudanças
          // cairiam sobre o mesmo trecho. Aqui a primeira volta o texto ao
          // original SEM histórico e a segunda aplica o valor final COM — o
          // resultado é um único passo de desfazer pro arrasto inteiro.
          const fim = c.de + c.atual.length
          view.dispatch({
            changes: { from: c.de, to: fim, insert: c.original },
            annotations: Transaction.addToHistory.of(false),
          })
          view.dispatch({
            changes: { from: c.de, to: c.de + c.original.length, insert: c.atual },
            annotations: Transaction.userEvent.of('input.arrastarNumero'),
          })
        }
        // Sempre uma última vez: o que se ouve tem que ser o que está escrito.
        reavaliar()
      }

      return {
        destroy() {
          window.removeEventListener('pointermove', aoMover)
          window.removeEventListener('pointerup', aoSoltar)
        },
        _handlers: {
          mousemove(e: MouseEvent) {
            if (curso) return
            mostrarAlvo(alvoEm(e.clientX, e.clientY))
          },
          mouseleave() {
            if (!curso) mostrarAlvo(null)
          },
          mousedown(e: MouseEvent) {
            if (curso || e.button !== 0) return
            const alvo = alvoEm(e.clientX, e.clientY)
            if (!alvo) return
            const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
            // preventDefault aqui é o preço de agarrar sem tecla modificadora:
            // sem ele o navegador começa uma seleção de texto e o arrasto pinta
            // a linha inteira de azul. Em troca, o clique curto reposiciona o
            // cursor na mão (ver aoSoltar). Seleção que COMEÇA em cima de um
            // número é o que se perde; começar ao lado e passar por cima segue
            // funcionando.
            e.preventDefault()
            curso = {
              de: alvo.de,
              original: alvo.texto,
              atual: alvo.texto,
              x0: e.clientX,
              posClique: pos ?? alvo.de,
              arrastando: false,
              ultimaEval: 0,
              mudou: false,
            }
            mostrarAlvo({ de: alvo.de, ate: alvo.ate })
            window.addEventListener('pointermove', aoMover)
            window.addEventListener('pointerup', aoSoltar)
          },
        },
      }
    },
    {
      // O ViewPlugin liga os handlers pelo spec; o objeto acima só os carrega.
      eventHandlers: {
        mousemove(e) { this._handlers.mousemove(e) },
        mouseleave() { this._handlers.mouseleave() },
        mousedown(e) { this._handlers.mousedown(e) },
      },
    },
  )

  return [campoAlvo, tema, plugin]
}
