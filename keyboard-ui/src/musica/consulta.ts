/**
 * A consulta de eventos, com cache e orçamento.
 *
 * ## O problema que a `Timeline.tsx` não tinha
 *
 * Ela desenhava UM ciclo, então consultar era 8 chamadas quando o ciclo virava.
 * Esta tela desenha a peça inteira: 8 camadas × 64 ciclos são 512 consultas, e
 * `queryArc` roda no MESMO thread que agenda o som. Feito de uma vez, isso é um
 * engasgo audível — o defeito que a rota inteira existe pra não ter.
 *
 * Duas defesas, e as duas já estavam certas na `Timeline.tsx`; o que muda aqui
 * é a granularidade:
 *
 * 1. **cache por (camada, ciclo)** — um ciclo consultado nunca é reconsultado
 *    enquanto o padrão for o mesmo. Rolar pra frente e voltar é de graça.
 * 2. **orçamento por quadro** — gastou o orçamento, para de consultar e DIZ que
 *    parou. A tela desenha o que já tem e volta a preencher no quadro seguinte.
 *
 * A diferença pro `v.pesado` de hoje: aquele congelava a peça INTEIRA num ciclo
 * e só destravava na troca de take. Aqui o congelamento é por ciclo, e os que já
 * couberam continuam certos e desenhados — degradação que perde resolução em vez
 * de perder a verdade.
 *
 * ## Por que "parcial" é estado público e não detalhe interno
 *
 * Porque uma grade que parou de acompanhar sem avisar é a timeline mentindo
 * sobre o que toca, e é a mesma espinha do `relogio.ts` e da degradação `pesado`
 * original. Quem desenha PRECISA saber que aquele trecho ainda não é a peça, pra
 * escrever isso na régua.
 */

/** O evento desenhável: o `hap` do Strudel já convertido, sem Fraction nem contexto. */
export type Evento = { ini: number; fim: number }

/**
 * O contrato mínimo de um padrão do Strudel — só o que esta tela consome.
 *
 * `any` seria mais curto e é o que a `Timeline.tsx` faz, mas aqui o padrão
 * atravessa três funções e um cache: sem tipo, trocar `queryArc` por outro nome
 * compilaria e só quebraria em runtime, no thread do som. `begin`/`end` são
 * `unknown` porque o Strudel devolve `Fraction`, não número — quem lê é obrigado
 * a passar por `Number()`, que é justamente a conversão que precisa acontecer.
 */
export type Hap = { whole?: unknown; part: { begin: unknown; end: unknown } }
export type Padrao = { queryArc: (ini: number, fim: number) => Hap[] }

/** Teto por ciclo. O mesmo da `Timeline.tsx`: além disso não cabe em pixel nenhum. */
export const TETO_EVENTOS = 400

/**
 * Orçamento por quadro, em ms.
 *
 * 8ms é metade de um quadro de 60fps. Não é "quase um quadro" de propósito: o
 * resto do quadro ainda tem o desenho do canvas e o que o Strudel estiver
 * agendando. Consulta que come o quadro inteiro é o engasgo que o teto existe
 * pra impedir.
 */
export const ORCAMENTO_MS = 8

/**
 * Converte os `hap` de um ciclo em eventos desenháveis.
 *
 * Sinal contínuo (`perlin`, `sine`) não tem `whole` e é DESCARTADO: ele ocuparia
 * a faixa inteira e diria nada. O que se desenha é evento com começo e fim.
 */
export function eventosDoCiclo(padrao: Padrao, ciclo: number): Evento[] {
  const haps = padrao.queryArc(ciclo, ciclo + 1)
  const out: Evento[] = []
  for (const h of haps) {
    if (!h.whole) continue
    const ini = Number(h.part.begin)
    const fim = Number(h.part.end)
    if (!Number.isFinite(ini) || !Number.isFinite(fim)) continue
    // Absoluto, em ciclos — não relativo ao ciclo consultado como na
    // `Timeline.tsx`. Ela desenhava sempre o mesmo ciclo esticado na tela; aqui
    // o mesmo evento tem que cair no lugar certo de um eixo de 64 ciclos, e
    // guardar relativo obrigaria quem desenha a somar o ciclo de volta — uma
    // conversão a mais, no lugar em que as conversões já divergiram uma vez.
    out.push({ ini, fim })
    if (out.length >= TETO_EVENTOS) break
  }
  return out
}

export type Resultado = {
  /** `eventos[camada][ciclo]` — ausente quando ainda não coube no orçamento. */
  porCiclo: Map<number, Evento[]>[]
  /** Sobrou ciclo por consultar neste quadro? A régua escreve isso. */
  parcial: boolean
  /** Camadas cujo texto não avaliou. Índice no `stack`. */
  ilegiveis: boolean[]
}

/**
 * O cache. Vive fora do React (a tela guarda num `useRef`) porque ele é
 * atualizado dentro do `requestAnimationFrame`, e `setState` por quadro
 * arrastando oito camadas é exatamente o que faz o agendador do som perder o
 * horário.
 */
export class CacheEventos {
  private mapas: Map<number, Evento[]>[] = []
  private padroes: (Padrao | null)[] = []
  private ilegiveis: boolean[] = []

  /**
   * Troca os padrões e joga o cache fora.
   *
   * Chamado quando o código que TOCA muda. Não dá pra reaproveitar por camada
   * mesmo que o texto dela pareça igual: mudar uma camada pode mudar o que as
   * outras fazem (o `stack` inteiro é reavaliado), e cache que sobrevive à
   * reavaliação desenha o take de antes.
   */
  trocar(padroes: (Padrao | null)[], ilegiveis: boolean[]): void {
    this.padroes = padroes
    this.ilegiveis = ilegiveis
    this.mapas = padroes.map(() => new Map<number, Evento[]>())
  }

  /** Só pro teste e pra métrica: quantos ciclos já estão em cache. */
  get tamanho(): number {
    return this.mapas.reduce((s, m) => s + m.size, 0)
  }

  /**
   * Garante que a faixa `[ini, fim)` esteja consultada, dentro do orçamento.
   *
   * `agora` é injetado (e não `performance.now()` chamado aqui dentro) pra o
   * teste conseguir provar o comportamento do orçamento sem depender de a
   * máquina de CI estar lenta naquele segundo.
   */
  garantir(
    ini: number, fim: number,
    agora: () => number = () => performance.now(),
    orcamento = ORCAMENTO_MS,
  ): Resultado {
    const t0 = agora()
    let parcial = false

    for (let c = ini; c < fim; c++) {
      for (let i = 0; i < this.padroes.length; i++) {
        const m = this.mapas[i]
        if (!m || m.has(c)) continue
        const p = this.padroes[i]
        if (!p) { m.set(c, []); continue }
        if (agora() - t0 > orcamento) {
          // Para no ciclo em que estava. O que já entrou continua válido e
          // desenhado; o resto entra nos próximos quadros. Sair aqui em vez de
          // marcar e seguir é o ponto: seguir gastaria o quadro assim mesmo.
          parcial = true
          return { porCiclo: this.mapas, parcial, ilegiveis: this.ilegiveis }
        }
        try {
          m.set(c, eventosDoCiclo(p, c))
        } catch {
          // Padrão que estoura em UM ciclo (um `.mask()` com índice fora, por
          // exemplo) não pode derrubar a tela nem virar "ilegível": o texto
          // avaliou, só este arco não deu. Ciclo vazio é a leitura honesta.
          m.set(c, [])
        }
      }
    }
    return { porCiclo: this.mapas, parcial, ilegiveis: this.ilegiveis }
  }

  /** Os eventos já conhecidos de uma camada num ciclo. `null` = ainda não consultado. */
  ler(camada: number, ciclo: number): Evento[] | null {
    return this.mapas[camada]?.get(ciclo) ?? null
  }
}

/**
 * Avalia as camadas e devolve os padrões.
 *
 * `new Function` funciona porque o `evalScope` do repl já pendurou o vocabulário
 * do Strudel no `globalThis` — é o mesmo caminho que o repl usa (ele também é
 * `Function` no fim). Construir um padrão é PURO: não agenda, não toca em
 * AudioContext, não tem efeito colateral. É por isso que dá pra fazer isso pra
 * desenhar sem interferir no que está soando.
 */
export function avaliarCamadas(bases: string[]): { padroes: (Padrao | null)[]; ilegiveis: boolean[] } {
  const padroes: (Padrao | null)[] = []
  const ilegiveis: boolean[] = []
  for (const base of bases) {
    try {
      const p = new Function(`return (${base})`)()
      const ok = p && typeof p.queryArc === 'function'
      padroes.push(ok ? p : null)
      ilegiveis.push(!ok)
    } catch {
      padroes.push(null)
      ilegiveis.push(true)
    }
  }
  return { padroes, ilegiveis }
}

/* ── o som existe mesmo? ──────────────────────────────────────────── */

/**
 * Quais camadas pedem um som que o motor não tem.
 *
 * ## O defeito que isto fecha
 *
 * Um take com `s("dirt_dr55")` — banco que não está carregado — desenhava a
 * faixa CHEIA de eventos, porque `queryArc` funciona: o padrão é válido e os
 * eventos existem. O que não existe é o som. A faixa ficava idêntica à de uma
 * camada que toca, e o único aviso era `sound dirt_dr55 not found!` no console,
 * onde ninguém está olhando enquanto compõe.
 *
 * ## As três respostas, e por que não são duas
 *
 * `conhecidos` nulo ou vazio devolve conjunto VAZIO — "ainda não sei", não
 * "nenhum toca". Enquanto o banco carrega, marcar todas as camadas como mudas
 * seria a tela inventando um defeito que provavelmente não existe; e essa
 * janela é real, porque os bancos chegam por rede depois do primeiro render.
 *
 * Camada sem `s("...")` (nota em oscilador, por exemplo) também não é marcada:
 * não há banco pra conferir, e chutar seria a mesma invenção.
 *
 * As chaves do `soundMap` do superdough são minúsculas (`registerSound` faz
 * `toLowerCase()`), então a comparação é minúscula dos dois lados — senão um
 * take com `s("Dirt_DR55")` apareceria como mudo sem ser.
 */
export function camadasSemSom(
  bases: string[],
  conhecidos: Set<string> | null,
  bancoDa: (base: string) => { banco: string } | null,
): Set<number> {
  const fora = new Set<number>()
  if (!conhecidos || !conhecidos.size) return fora
  bases.forEach((base, i) => {
    const a = bancoDa(base)
    if (!a) return
    if (!conhecidos.has(a.banco.toLowerCase())) fora.add(i)
  })
  return fora
}
