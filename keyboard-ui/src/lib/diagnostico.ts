/**
 * O que quebrou ENQUANTO tocava — em português, na tela, não no console.
 *
 * ## O defeito que isto fecha
 *
 * Um take com um som que o motor não tem toca mudo e cospe, uma vez por evento:
 *
 *   [getTrigger] error: sound vhulto_..._kick not found! Is it loaded?
 *
 * Na tela, nada. O relógio anda, a linha do tempo desenha, e não sai som. Quem
 * não é dev procura o defeito no volume, no take, na placa — em tudo menos no
 * lugar certo, porque o único sinal está num painel que ninguém abre enquanto
 * compõe.
 *
 * ## Por que `strudel.log`, e não macaquear `console.error`
 *
 * `@strudel/core/logger.mjs` faz, em TODO `errorLogger`:
 *
 *   document.dispatchEvent(new CustomEvent('strudel.log', { detail: {...} }))
 *
 * É gancho público do próprio motor — a mesma porta que o REPL oficial usa pra
 * desenhar o log dele. Trocar `console.error` por um espião nosso pegaria o
 * mesmo texto e de quebra todo `console.error` de terceiro, roubaria o
 * stacktrace do DevTools e quebraria calado quando a lib mudar de canal. Este
 * evento é contrato; `console` é efeito colateral.
 *
 * O erro do agendador NÃO sobe por `onEvalError`: `getTrigger` o engole num
 * `try/catch` e só o registra. Sem este ouvinte não existe outro caminho.
 *
 * ## Agrupado e contado, não empilhado
 *
 * O mesmo erro chega uma vez por evento — dezenas por volta. Uma lista crua
 * viraria papel de parede em dois segundos e esconderia o segundo problema
 * atrás de trezentas cópias do primeiro. Então: uma chave por defeito, e `vezes`
 * conta. "42×" é informação (está acontecendo AGORA, em todo evento); quarenta
 * e duas linhas iguais são ruído.
 */

/** Um problema distinto, já agrupado. */
export type Problema = {
  /**
   * Chave de agrupamento.
   *
   * Pro som ausente é `som:<nome>`, e NÃO a mensagem crua: o mesmo defeito
   * chega por duas portas — o log do runtime (`[getTrigger] error: sound X
   * not found!`) e a conferência do texto, que não tem prefixo nenhum. Chavear
   * pela mensagem faria a tela mostrar duas linhas dizendo a mesma coisa, uma
   * em dialeto de dev. Pro resto, a mensagem crua serve.
   */
  chave: string
  /** `som-ausente` tem conserto conhecido; `motor` é qualquer outro erro. */
  tipo: 'som-ausente' | 'motor'
  /** Só em `som-ausente`: o nome pedido no take. */
  som?: string
  /** Frase pronta pra tela, em português. */
  texto: string
  /** Quantas vezes aconteceu desde a última limpeza. */
  vezes: number
  /** `performance.now()` da última ocorrência. */
  quando: number
}

/** `[getTrigger] error: sound X not found! Is it loaded?` → `X`. */
const RE_SOM_AUSENTE = /sound\s+(\S+)\s+not found/i

/**
 * O prefixo `[origem] error: ` que o `errorLogger` põe. Tirar deixa a frase
 * legível pra quem não sabe o que é um `getTrigger`.
 */
const RE_PREFIXO = /^\[[^\]]+\]\s*error:\s*/i

/**
 * Ruído conhecido que NÃO é problema do take.
 *
 * `skip hap: still loading` acontece uma vez quando um sample entra no meio da
 * volta — é o motor funcionando, não falhando. Subir isso pra tela treinaria a
 * pessoa a ignorar a faixa, e faixa ignorada não avisa de nada.
 */
const IGNORAR = [/skip hap/i, /still loading/i]

/** Lê um `detail` de `strudel.log`. `null` = não é erro, ou é ruído conhecido. */
export function lerLog(detail: unknown): Problema | null {
  const d = detail as { message?: unknown } | null
  const bruto = typeof d?.message === 'string' ? d.message : ''
  if (!bruto) return null
  // Só o que o `errorLogger` marcou como erro. O `logger` comum carrega o
  // relatório de vida do motor e não cabe numa faixa de alerta.
  if (!/\berror:/i.test(bruto)) return null
  if (IGNORAR.some(re => re.test(bruto))) return null

  const limpo = bruto.replace(RE_PREFIXO, '').trim()
  const m = RE_SOM_AUSENTE.exec(limpo)
  if (m) {
    return {
      chave: `som:${m[1].toLowerCase()}`,
      tipo: 'som-ausente',
      som: m[1],
      texto: `o som “${m[1]}” não existe no motor`,
      vezes: 1,
      quando: 0,
    }
  }
  return { chave: bruto, tipo: 'motor', texto: limpo, vezes: 1, quando: 0 }
}

type Ouvinte = (p: Problema[]) => void

/**
 * O caderno. Um por aba (o `document` também é um só), criado na primeira
 * chamada de `diagnostico()`.
 */
export class Diagnostico {
  private mapa = new Map<string, Problema>()
  private ouvintes = new Set<Ouvinte>()
  private solto: (() => void) | null = null

  /** Começa a ouvir. Idempotente — chamar duas vezes não duplica contagem. */
  ligar(alvo: Pick<Document, 'addEventListener' | 'removeEventListener'>): void {
    if (this.solto) return
    const on = (e: Event) => this.registrar((e as CustomEvent).detail)
    alvo.addEventListener('strudel.log', on as EventListener)
    this.solto = () => alvo.removeEventListener('strudel.log', on as EventListener)
  }

  desligar(): void {
    this.solto?.()
    this.solto = null
  }

  /** Entrada manual — usada pela conferência do código, que não passa pelo log. */
  registrar(detail: unknown): void {
    const novo = lerLog(detail)
    if (!novo) return
    this.somar(novo)
  }

  /**
   * Põe um problema que a TELA descobriu (nome inexistente no código, antes de
   * tocar). Mesma fila do runtime de propósito: pra quem lê, é o mesmo defeito
   * — e ver dois painéis dizendo a mesma coisa por caminhos diferentes é pior
   * que ver um.
   */
  anotarSomAusente(som: string): void {
    this.somar({
      chave: `som:${som.toLowerCase()}`,
      tipo: 'som-ausente',
      som,
      texto: `o som “${som}” não existe no motor`,
      vezes: 1,
      quando: 0,
    })
  }

  private somar(novo: Problema) {
    const agora = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const velho = this.mapa.get(novo.chave)
    if (velho) {
      velho.vezes += 1
      velho.quando = agora
    } else {
      this.mapa.set(novo.chave, { ...novo, quando: agora })
    }
    this.avisar()
  }

  /**
   * Zera. Chamado a cada avaliação: o ciclo desta rota é corrigir→ouvir, e erro
   * da tentativa anterior colado na tela depois do conserto é a tela mentindo.
   */
  limpar(): void {
    if (!this.mapa.size) return
    this.mapa.clear()
    this.avisar()
  }

  /** Tira um problema só — o som que acabou de ser corrigido no código. */
  esquecerSom(som: string): void {
    let mexeu = false
    for (const [k, p] of this.mapa) {
      if (p.tipo === 'som-ausente' && p.som?.toLowerCase() === som.toLowerCase()) { this.mapa.delete(k); mexeu = true }
    }
    if (mexeu) this.avisar()
  }

  /** Mais recente primeiro: o que acabou de acontecer é o que se está caçando. */
  problemas(): Problema[] {
    return [...this.mapa.values()].sort((a, b) => b.quando - a.quando)
  }

  assinar(cb: Ouvinte): () => void {
    this.ouvintes.add(cb)
    cb(this.problemas())
    return () => { this.ouvintes.delete(cb) }
  }

  private avisar() {
    const lista = this.problemas()
    this.ouvintes.forEach(cb => { try { cb(lista) } catch { /* ouvinte morto */ } })
  }
}

let unico: Diagnostico | null = null

/** O caderno da aba. Liga no `document` na primeira chamada. */
export function diagnostico(): Diagnostico {
  if (!unico) {
    unico = new Diagnostico()
    if (typeof document !== 'undefined') unico.ligar(document)
  }
  return unico
}
