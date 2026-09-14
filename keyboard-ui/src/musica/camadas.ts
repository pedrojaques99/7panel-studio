/**
 * O motor da linha do tempo: ler o `stack(...)` como CAMADAS, e escrever FX de volta nele.
 *
 * O DADO DURO que decide o desenho inteiro: neste app o Strudel roda SEM
 * transpiler (`strudel-service.ts` chama `createRepl` sem passar `transpiler`),
 * então `meta.miniLocations` vem vazio e os `hap.context.locations` que o mini
 * anexa são relativos à string mini, não ao arquivo. Ou seja: NÃO dá pra olhar
 * um evento tocando e dizer de qual linha do código ele veio. O caminho que
 * parecia óbvio está fechado.
 *
 * O que sobra, e é honesto: as camadas de um take são os argumentos de primeiro
 * nível do `stack(...)`. Este módulo os RECORTA do texto e o componente avalia
 * cada um separadamente, consultando um por um. Cada faixa da tela é literalmente
 * o padrão daquele argumento — não é uma adivinhação sobre um monte de eventos
 * já misturados.
 *
 * ## Por que o FX é reescrita de código, e não um nó de áudio
 *
 * O grafo de áudio do `StrudelService` intercepta o `destinationGain` do
 * superdough, que é UM só: todas as vozes já chegam ali somadas. LPF, delay e
 * volume de lá valem pro take inteiro e não têm como valer pra uma camada — não
 * existe barramento por camada pra grampear. Por camada, o único ponto de
 * controle é o padrão, e mexer no padrão é reavaliar.
 *
 * Reavaliar é barato e, o que importa mais, é EM FASE: `evaluate` chama
 * `scheduler.setPattern`, que não mexe em `lastEnd` (só `stop()` zera — ver
 * `exportacao.ts`). O padrão troca no meio da volta sem o relógio pular.
 *
 * E então a regra que não se negocia: se o FX mora no padrão, ele tem que morar
 * no TEXTO. Um botão que abafa a camada sem o código dizer isso transforma o
 * editor em mentiroso — a pessoa salva a versão, reabre amanhã e o take soa
 * diferente do que está escrito. Por isso o estado dos botões não vive em
 * React: vive no código, atrás de um marcador (a constante MARCA, logo abaixo),
 * e é lido de volta dele. O código é a única fonte da verdade, salvar já guarda
 * o FX de graça, e o usuário pode apagar o trecho na mão que a tela obedece.
 */

/** Marcador do bloco que a timeline escreve. O que vem depois dele é dela. */
export const MARCA = '/*fx*/'

/**
 * O vocabulário de FX por camada.
 *
 * Níveis DISCRETOS, não knob contínuo, e isso é decisão de custo: cada mudança
 * é uma reavaliação, e reavaliar a 60fps num arrasto de knob põe transpilação
 * no mesmo thread que agenda o som. Knob contínuo só existe onde não custa
 * reavaliação — no master, que é do painel AnalogBrain. Aqui, clique.
 */
export const FX = {
  abafa: { rotulo: 'abafa', niveis: ['.lpf(1200)', '.lpf(400)', '.lpf(150)'] },
  corta: { rotulo: 'corta', niveis: ['.hpf(300)', '.hpf(900)'] },
  eco: { rotulo: 'eco', niveis: ['.room(0.4)', '.room(0.9)'] },
  rala: { rotulo: 'rala', niveis: ['.degradeBy(0.35)', '.degradeBy(0.7)'] },
} as const

export type NomeFx = keyof typeof FX

export const NOMES_FX = Object.keys(FX) as NomeFx[]

/** Estado de uma camada. `niveis[nome]` é 1-based; ausente = desligado. */
export type EstadoFx = {
  mudo: boolean
  niveis: Partial<Record<NomeFx, number>>
}

export type Camada = {
  indice: number
  rotulo: string
  /** [inicio, fim) do texto da camada no código, sem espaço nem comentário na ponta */
  inicio: number
  fim: number
  /** o que o autor escreveu, sem o bloco de fx — é isto que vai pro avaliador */
  base: string
  fx: EstadoFx
}

export function fxVazio(): EstadoFx {
  return { mudo: false, niveis: {} }
}

function temFx(e: EstadoFx): boolean {
  return e.mudo || NOMES_FX.some(n => (e.niveis[n] ?? 0) > 0)
}

/* ── varredura do texto ──────────────────────────────────────────── */
//
// Um scanner de mão, não um parser de JS. Justificativa: a única pergunta é
// "onde começa e termina cada argumento de primeiro nível do stack", e pra isso
// basta saber contar parênteses sem se enganar com aspas e comentários. Puxar
// acorn/babel pra isso seria caro (bundle) e não responderia melhor.

function fimDeLiteral(code: string, i: number): number {
  const aspas = code[i]
  let j = i + 1
  while (j < code.length) {
    const c = code[j]
    if (c === '\\') { j += 2; continue }
    if (c === aspas) return j + 1
    // template literal com `${}` dentro: a interpolação é código, e código pode
    // ter outra crase. Sem isto, um `${x`y`}` desalinha tudo daí pra frente.
    if (aspas === '`' && c === '$' && code[j + 1] === '{') { j = fimDeInterpolacao(code, j + 2); continue }
    j++
  }
  return code.length
}

function fimDeInterpolacao(code: string, i: number): number {
  let prof = 1
  let j = i
  while (j < code.length && prof > 0) {
    const c = code[j]
    if (c === '"' || c === "'" || c === '`') { j = fimDeLiteral(code, j); continue }
    if (c === '{') prof++
    else if (c === '}') prof--
    j++
  }
  return j
}

function pulaComentario(code: string, j: number): number {
  if (code[j] === '/' && code[j + 1] === '/') {
    const e = code.indexOf('\n', j)
    return e < 0 ? code.length : e
  }
  const e = code.indexOf('*/', j + 2)
  return e < 0 ? code.length : e + 2
}

function ehComentario(code: string, j: number): boolean {
  return code[j] === '/' && (code[j + 1] === '/' || code[j + 1] === '*')
}

const IDENT = /[A-Za-z0-9_$]/

/** Acha o `stack(` de primeiro nível. Devolve o índice do `(`. */
function acharStack(code: string): number {
  let j = 0
  while (j < code.length) {
    if (ehComentario(code, j)) { j = pulaComentario(code, j); continue }
    const c = code[j]
    if (c === '"' || c === "'" || c === '`') { j = fimDeLiteral(code, j); continue }
    if (c === 's' && code.startsWith('stack', j)) {
      const antes = code[j - 1]
      const depois = code[j + 5]
      // `.stack(` ou `mystack(` não são a chamada global que interessa
      const colado = (antes !== undefined && (IDENT.test(antes) || antes === '.')) || (depois !== undefined && IDENT.test(depois))
      if (!colado) {
        let k = j + 5
        while (k < code.length && /\s/.test(code[k])) k++
        if (code[k] === '(') return k
      }
    }
    j++
  }
  return -1
}

type Fatia = { ini: number; fim: number }

/** Recorta os argumentos de primeiro nível a partir do `(` em `iAbre`. */
function fatiar(code: string, iAbre: number): Fatia[] {
  const partes: Fatia[] = []
  let prof = 0
  let j = iAbre
  let ini = -1
  // Último caractere que é CÓDIGO. É ele que define o fim, não a vírgula: em
  // `s("bd").n(4)   // KICK` a vírgula vem depois do comentário, e pendurar
  // `.gain(0)` ali comentaria o FX inteiro sem avisar ninguém.
  let ultimo = -1

  const marcar = (a: number, b: number) => {
    if (prof < 1) return
    if (ini < 0) ini = a
    ultimo = b
  }
  const fechar = () => {
    if (ini >= 0 && ultimo >= ini) partes.push({ ini, fim: ultimo + 1 })
    ini = -1
    ultimo = -1
  }

  while (j < code.length) {
    if (ehComentario(code, j)) { j = pulaComentario(code, j); continue }
    const c = code[j]
    if (/\s/.test(c)) { j++; continue }
    if (c === '"' || c === "'" || c === '`') {
      const e = fimDeLiteral(code, j)
      marcar(j, e - 1)
      j = e
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      marcar(j, j)
      prof++
      j++
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      prof--
      if (prof === 0) { fechar(); return partes }
      marcar(j, j)
      j++
      continue
    }
    if (prof === 1 && c === ',') { fechar(); j++; continue }
    marcar(j, j)
    j++
  }
  fechar()
  return partes
}

/* ── rótulo ──────────────────────────────────────────────────────── */

/**
 * O nome da faixa, na ordem em que ele é mais confiável.
 *
 * 1. Comentário EM CAIXA ALTA (`// KICK - MALADO`). É a convenção que o autor já
 *    usa nos takes de `patterns/`, então respeitar isso é de graça. A exigência
 *    de caixa alta é o que separa rótulo de prosa: `// Kit VHULTO (indice via…)`
 *    é explicação, não nome, e vira rótulo ruim.
 * 2. O nome do som (`.s("...")`). Funciona pra sample e pra oscilador.
 * 3. A posição. Que é o que a tela mostra de qualquer jeito.
 */
function rotuloBruto(bruto: string): { comentario: string | null; som: string | null } {
  let comentario: string | null = null
  const mc = bruto.match(/\/\/\s*([A-Z0-9][A-Z0-9_-]{1,13})\b/)
  if (mc) comentario = mc[1].toLowerCase()

  let som: string | null = null
  const ms = bruto.match(/\bs(?:ound)?\(\s*["'`]([^"'`]+)/)
  if (ms) som = ms[1].split(/[\s<>[\]*!@,]/)[0] || null

  return { comentario, som }
}

/** Prefixo de banco que todas as camadas repetem não distingue nada — some. */
function prefixoComum(nomes: string[]): string {
  const reais = nomes.filter(Boolean)
  if (reais.length < 2) return ''
  let p = reais[0]
  for (const n of reais.slice(1)) {
    let i = 0
    while (i < p.length && i < n.length && p[i] === n[i]) i++
    p = p.slice(0, i)
    if (!p) return ''
  }
  const corte = p.lastIndexOf('_')
  return corte > 3 ? p.slice(0, corte + 1) : ''
}

/* ── fx: ler e escrever ──────────────────────────────────────────── */

export function escreverFx(e: EstadoFx): string {
  if (!temFx(e)) return ''
  let s = MARCA
  if (e.mudo) s += '.gain(0)'
  for (const nome of NOMES_FX) {
    const n = e.niveis[nome] ?? 0
    if (n > 0) s += FX[nome].niveis[n - 1]
  }
  return s
}

/**
 * Lê de volta o que está escrito. Casamento por string exata, porque quem
 * escreveu foi `escreverFx`. Trecho que não bate é descartado na próxima
 * escrita — é o preço de o marcador significar "daqui pra frente é da timeline".
 */
export function lerFx(texto: string): { base: string; fx: EstadoFx } {
  const i = texto.indexOf(MARCA)
  if (i < 0) return { base: texto, fx: fxVazio() }
  const cauda = texto.slice(i + MARCA.length)
  const fx = fxVazio()
  if (cauda.includes('.gain(0)')) fx.mudo = true
  for (const nome of NOMES_FX) {
    const niveis = FX[nome].niveis as readonly string[]
    // de trás pra frente: o nível mais forte ganha se dois estiverem escritos
    for (let n = niveis.length; n >= 1; n--) {
      if (cauda.includes(niveis[n - 1])) { fx.niveis[nome] = n; break }
    }
  }
  return { base: texto.slice(0, i), fx }
}

/* ── a leitura do take ───────────────────────────────────────────── */

/**
 * As camadas de um take.
 *
 * Sem `stack(...)`, o take inteiro é UMA camada — e isso não é degradação, é a
 * verdade: um take de uma linha tem uma coisa tocando. Devolve lista vazia só
 * pra código vazio, e o componente diz isso com palavra em vez de desenhar uma
 * grade vazia que parece defeito.
 */
export function detectarCamadas(codigo: string): Camada[] {
  const code = codigo ?? ''
  if (!code.trim()) return []

  const iAbre = acharStack(code)
  const fatias: Fatia[] = iAbre < 0 ? [fatiaUnica(code)] : fatiar(code, iAbre)
  const validas = fatias.filter(f => f.fim > f.ini)
  if (!validas.length) return []

  const lidos = validas.map(f => lerFx(code.slice(f.ini, f.fim)))
  // Pro RÓTULO a janela vai até o fim da linha, não até `fim`: o comentário que
  // nomeia a camada (`s("x").n(4),   // KICK`) mora depois da vírgula, ou seja
  // fora do trecho que vira código. Duas janelas diferentes porque as duas
  // perguntas são diferentes — uma é "o que eu avalio", a outra é "como se chama".
  const marcas = validas.map(f => {
    const quebra = code.indexOf('\n', f.fim)
    return rotuloBruto(code.slice(f.ini, quebra < 0 ? code.length : quebra))
  })
  const prefixo = prefixoComum(marcas.map(m => m.som ?? ''))

  // O nome da camada, decidido AQUI e em nenhum outro lugar.
  //
  // Precedencia, do que nomeia a PARTE pro que nomeia o material:
  //   1. o rotulo que o autor escreveu na grade de ARRANJO (`bumbo`);
  //   2. comentario na propria linha da camada (`// KICK - PLANT, mole`);
  //   3. o nome do sample, sem o prefixo comum (`vhulto_samp`).
  //
  // O comentario da linha perde de proposito. Em `xtal-vidro` ele diz
  // `// KICK - PLANT, mole`: isso descreve a ESCOLHA DO SAMPLE — qual kit, que
  // caracter — e nao o nome da parte. O nome da parte e `bumbo`, esta escrito
  // no desenho tres linhas acima da grade, e e o que a pessoa esta lendo
  // enquanto clica.
  //
  // O (2) existia so dentro da `GradeArranjo`, e por isso a grade dizia `bumbo`
  // enquanto a `Timeline` dizia `vhulto_samp` pra MESMA camada. Nome e um dado
  // da camada, nao um detalhe de quem desenha — dois donos do nome era a mesma
  // duplicacao que a `.mask()` e o desenho tinham.
  //
  // So vale parear por indice porque o portao de `patterns.test.ts` garante
  // linha `n` do desenho = camada `n` do stack.
  const doDesenho = rotulosDoDesenho(code)
  const usarDesenho = doDesenho.length === validas.length

  return validas.map((f, i) => {
    const { comentario, som } = marcas[i]
    const limpo = som && prefixo && som.startsWith(prefixo) ? som.slice(prefixo.length) : som
    const doAutor = usarDesenho && doDesenho[i] ? doDesenho[i] : null
    const rotulo = doAutor ?? comentario ?? (limpo ? limpo.slice(0, 12) : `camada ${i + 1}`)
    return {
      indice: i,
      rotulo,
      inicio: f.ini,
      fim: f.fim,
      base: lidos[i].base,
      fx: lidos[i].fx,
    }
  })
}

/** Take sem `stack`: o arquivo todo, sem comentário nem espaço nas pontas. */
function fatiaUnica(code: string): Fatia {
  let ini = 0
  let ultimo = -1
  let j = 0
  while (j < code.length) {
    if (ehComentario(code, j)) { j = pulaComentario(code, j); continue }
    const c = code[j]
    if (/\s/.test(c)) { j++; continue }
    if (c === '"' || c === "'" || c === '`') {
      const e = fimDeLiteral(code, j)
      if (ultimo < 0) ini = j
      ultimo = e - 1
      j = e
      continue
    }
    if (ultimo < 0) ini = j
    ultimo = j
    j++
  }
  return { ini, fim: ultimo + 1 }
}

/* ── escrever de volta ───────────────────────────────────────────── */

/**
 * Reescreve o código com os estados novos.
 *
 * De trás pra frente, sempre: substituir da esquerda pra direita muda o
 * comprimento do texto e invalida os offsets das camadas seguintes — que foram
 * medidos no texto ANTIGO. É o bug clássico deste tipo de função e ele só
 * aparece quando duas camadas mudam juntas, que é exatamente o caso do solo.
 */
export function reescrever(codigo: string, camadas: Camada[], novos: Map<number, EstadoFx>): string {
  let out = codigo
  const ordenadas = [...camadas].sort((a, b) => b.inicio - a.inicio)
  for (const c of ordenadas) {
    const novo = novos.get(c.indice)
    if (!novo) continue
    const trecho = codigo.slice(c.inicio, c.fim)
    const { base } = lerFx(trecho)
    out = out.slice(0, c.inicio) + base.trimEnd() + escreverFx(novo) + out.slice(c.fim)
  }
  return out
}

/* ── os gestos ───────────────────────────────────────────────────── */

export function alternarMudo(e: EstadoFx): EstadoFx {
  return { ...e, mudo: !e.mudo }
}

/** Gira o nível: desligado → 1 → 2 → … → desligado. */
export function girarFx(e: EstadoFx, nome: NomeFx): EstadoFx {
  const total = FX[nome].niveis.length
  const atual = e.niveis[nome] ?? 0
  const proximo = atual >= total ? 0 : atual + 1
  const niveis = { ...e.niveis }
  if (proximo === 0) delete niveis[nome]
  else niveis[nome] = proximo
  return { ...e, niveis }
}

/**
 * Solo. Segundo clique desfaz, porque solo sem volta é armadilha: no meio de um
 * take a pessoa esquece qual camada estava muda antes e perde a mixagem.
 */
export function alternarSolo(camadas: Camada[], indice: number): Map<number, EstadoFx> {
  const jaEmSolo = camadas.every(c => (c.indice === indice ? !c.fx.mudo : c.fx.mudo))
  const novos = new Map<number, EstadoFx>()
  for (const c of camadas) {
    const mudo = jaEmSolo ? false : c.indice !== indice
    if (mudo !== c.fx.mudo) novos.set(c.indice, { ...c.fx, mudo })
  }
  return novos
}

/** Tira todo mudo/fx de todas as camadas. A saída de emergência. */
export function limparTudo(camadas: Camada[]): Map<number, EstadoFx> {
  const novos = new Map<number, EstadoFx>()
  for (const c of camadas) {
    if (c.fx.mudo || Object.keys(c.fx.niveis).length) novos.set(c.indice, fxVazio())
  }
  return novos
}

/* ── tempo → pixel ───────────────────────────────────────────────── */

/** Posição no ciclo (0..1) → x. Uma função só, pra desenho e clique não divergirem. */
export function xDoCiclo(pos: number, gutter: number, largura: number): number {
  const util = Math.max(0, largura - gutter)
  return gutter + Math.min(1, Math.max(0, pos)) * util
}

/* ── a amostra da camada ─────────────────────────────────────────── */
//
// `s("banco").n(27)`. O 27 é índice alfabético dentro da pasta — escolher no
// escuro é o gesto mais caro do repertório, e até aqui só dava pra resolver
// rodando `backend/tools/sample_probe.py` fora do app e voltando pra editar.
//
// Reconhece UMA camada de sample: `s("um_banco_só")`. Mini-notation com vários
// bancos (`s("bd sd")`) devolve null de propósito — trocar "o" índice de uma
// camada que tem dois bancos é uma pergunta sem resposta, e adivinhar aqui
// escreveria código que o autor não pediu.

export type Amostra = { banco: string; n: number }

const RE_S = /\bs\(\s*"([A-Za-z0-9_]+)"\s*\)/

/** `{banco, n}` da camada. Sem `.n()` o superdough usa 0, então 0 é o certo. */
export function amostraDaCamada(base: string): Amostra | null {
  const m = RE_S.exec(base)
  if (!m) return null
  const depois = base.slice(m.index + m[0].length)
  const mn = /^\s*\.n\(\s*(\d+)\s*\)/.exec(depois)
  return { banco: m[1], n: mn ? Number(mn[1]) : 0 }
}

/**
 * Troca o `.n()` da camada NO CÓDIGO — mesmo contrato do mudo e do fx: o que a
 * timeline muda, a pessoa vê aparecer escrito.
 *
 * Só mexe no `.n()` que vem IMEDIATAMENTE depois do `s(...)`, que é a convenção
 * do repertório inteiro. Um `.n()` mais adiante (dentro de um `sometimesBy`,
 * por exemplo) é de outra coisa e fica onde está — trocar o primeiro `.n(` que
 * aparecesse no texto reescreveria a camada errada sem avisar.
 */
export function trocarAmostra(codigo: string, c: Camada, n: number): string {
  const trecho = codigo.slice(c.inicio, c.fim)
  const m = RE_S.exec(trecho)
  if (!m) return codigo
  const fimS = m.index + m[0].length
  const mn = /^(\s*)\.n\(\s*\d+\s*\)/.exec(trecho.slice(fimS))
  const novo = mn
    ? trecho.slice(0, fimS) + mn[1] + `.n(${n})` + trecho.slice(fimS + mn[0].length)
    : trecho.slice(0, fimS) + `.n(${n})` + trecho.slice(fimS)
  return codigo.slice(0, c.inicio) + novo + codigo.slice(c.fim)
}

/* ── arranjo: a grade de casas ───────────────────────────────────── */
//
// A `.mask("<0 1 1 0>/8")` é a forma da peça: cada casa vale `porCasa` ciclos.
// A timeline mostra UM ciclo; a grade de arranjo mostra 64. Pra as duas vistas
// nomearem o mesmo instante, a casa é DERIVADA do mesmo relógio, nunca contada
// por evento — contador acumula erro, e casa errada aos 3 min de live é o bug
// que só aparece na hora.

/** Em que casa do arranjo (0-based) o ciclo cai. Derivação pura do relógio. */
export function casaDoCiclo(ciclo: number, casas: number, porCasa: number): number {
  if (!Number.isFinite(ciclo) || casas <= 0 || porCasa <= 0) return 0
  return Math.floor(Math.max(0, ciclo) / porCasa) % casas
}

export type Arranjo = { casas: number; porCasa: number }

/** `.mask("<0 1 1 0>/8")` → `{casas: 4, porCasa: 8}`. Sem máscara, `null`. */
export function arranjoDaCamada(base: string): Arranjo | null {
  const m = /\.mask\(\s*"\s*<([^>]*)>\s*\/\s*(\d+)\s*"/.exec(base)
  if (!m) return null
  const casas = m[1].trim().split(/\s+/).filter(Boolean).length
  const porCasa = Number(m[2])
  return casas > 0 && porCasa > 0 ? { casas, porCasa } : null
}

/**
 * O arranjo do take inteiro — só quando as camadas CONCORDAM.
 *
 * Recusa, não adivinha (a mesma regra do `save` com nome inválido). Se uma
 * camada diz `/8` com 8 casas e outra diz `/4` com 6, não existe "a casa" do
 * take: qualquer número que a régua mostrasse estaria errado pra metade das
 * camadas. Nesse caso a régua não fala de casa — zero não renderiza.
 */
export function arranjoDoTake(bases: string[]): Arranjo | null {
  let achado: Arranjo | null = null
  for (const b of bases) {
    const a = arranjoDaCamada(b)
    if (!a) continue
    if (!achado) achado = a
    else if (a.casas !== achado.casas || a.porCasa !== achado.porCasa) return null
  }
  return achado
}

/**
 * Há grade escrita, mas as camadas não concordam sobre ela?
 *
 * `arranjoDoTake` devolve `null` em dois casos que parecem um só: ninguém
 * escreveu `.mask()`, e escreveram grades diferentes. Pra régua dá no mesmo —
 * ela só não fala de casa. Pro exportador não dá: um é "desenhe o arranjo", o
 * outro é "acerte o arranjo que você já desenhou". Dizer qual é o conserto é o
 * que separa recusa de defeito.
 */
export function conflitoDeArranjo(bases: string[]): boolean {
  let achado: Arranjo | null = null
  for (const b of bases) {
    const a = arranjoDaCamada(b)
    if (!a) continue
    if (!achado) achado = a
    else if (a.casas !== achado.casas || a.porCasa !== achado.porCasa) return true
  }
  return false
}

/* ── arranjo: escrever de volta ──────────────────────────────────── */
//
// A RAIZ do problema que este bloco resolve: o arranjo existia DUAS vezes — o
// desenho ASCII no comentário e a `.mask()` no código — e as duas podiam
// discordar sem ninguém perceber. Medido no repertório: em `entropia.js` o
// desenho lista `bumbo` em 2º e o `stack` tem `fx` em 2º.
//
// A saída não foi apagar um dos dois (o desenho é como se lê a peça num diff,
// fora do app; a máscara é o que toca). Foi parar de tratá-los como duas
// fontes: a `.mask()` manda nos VALORES, e o desenho tem os `●`/`·`
// reescritos a partir dela. Rótulo e nota da linha são do autor, e ninguém
// encosta neles.

/** A convenção do repertório: 8 casas de 8 ciclos. Só vale pra take sem máscara. */
export const PADRAO_ARRANJO: Arranjo = { casas: 8, porCasa: 8 }

const RE_MASK = /\.mask\(\s*"\s*<([^>]*)>\s*\/\s*(\d+)\s*"\s*\)/

/**
 * As casas da camada, como booleanos.
 *
 * `null` quando não há `.mask()` — e `null` NÃO é "tudo desligado". A diferença
 * importa: camada sem máscara toca em todas as casas, e confundir os dois
 * apagaria a camada no primeiro clique.
 */
export function casasDaCamada(base: string): boolean[] | null {
  const m = RE_MASK.exec(base)
  if (!m) return null
  const casas = m[1].trim().split(/\s+/).filter(Boolean)
  return casas.length ? casas.map(c => c !== '0') : null
}

/**
 * Escreve as casas na camada: troca a `.mask()` que existe, ou cria uma.
 *
 * Quando cria, entra em LINHA NOVA com a indentação da última linha. Emendar no
 * fim do texto parece equivalente e não é: se a última linha da camada for um
 * comentário (`// as duas rédeas`), a máscara nasceria comentada — o take
 * continuaria tocando igual e o clique não faria nada, sem erro nenhum.
 */
export function escreverCasas(base: string, casas: boolean[], porCasa: number): string {
  const texto = `.mask("<${casas.map(c => (c ? 1 : 0)).join(' ')}>/${porCasa}")`
  const m = RE_MASK.exec(base)
  if (m) return base.slice(0, m.index) + texto + base.slice(m.index + m[0].length)
  const corpo = base.trimEnd()
  const ultima = corpo.slice(corpo.lastIndexOf('\n') + 1)
  const recuo = /^(\s*)/.exec(ultima)?.[1] ?? ''
  return `${corpo}\n${recuo}${texto}`
}

/**
 * Alterna UMA casa de UMA camada, no código. Mesmo contrato do mudo e do fx: o
 * que a grade muda, a pessoa vê aparecer escrito.
 *
 * `ligado` explícito existe pro arrasto: o gesto decide ligar-ou-desligar na
 * primeira célula e as seguintes obedecem. Sem isso, arrastar por cima de casas
 * alternadas inverte cada uma e o desenho vira ruído.
 */
export function alternarCasa(
  codigo: string, c: Camada, casa: number, arranjo: Arranjo, ligado?: boolean,
): string {
  if (casa < 0 || casa >= arranjo.casas) return codigo
  const trecho = codigo.slice(c.inicio, c.fim)
  const { base, fx } = lerFx(trecho)
  const atuais = casasDaCamada(base) ?? new Array<boolean>(arranjo.casas).fill(true)
  // Camada com outro número de casas não é esticada pra caber: recusa. Esticar
  // inventaria casas que o autor não escreveu, e o take soaria diferente do
  // desenho — que é exatamente o defeito que este módulo existe pra fechar.
  if (atuais.length !== arranjo.casas) return codigo
  const novas = atuais.slice()
  novas[casa] = ligado ?? !atuais[casa]
  const novo = escreverCasas(base, novas, arranjo.porCasa)
  return codigo.slice(0, c.inicio) + novo.trimEnd() + escreverFx(fx) + codigo.slice(c.fim)
}

export type LinhaGrade = {
  indice: number
  rotulo: string
  casas: boolean[]
  /** A camada tem `.mask()` própria? Se não, toca em tudo e a grade mostra isso. */
  propria: boolean
}

export type Grade =
  | { ok: true; arranjo: Arranjo; linhas: LinhaGrade[] }
  | { ok: false; motivo: string; discordantes: string[] }

/**
 * A grade do take inteiro, pronta pra desenhar.
 *
 * Recusa em vez de adivinhar, a mesma regra do `save` e do `arranjoDoTake`: se
 * uma camada diz `/8` com 8 casas e outra `/4` com 6, não existe "a casa" do
 * take — qualquer coluna desenhada estaria errada pra metade das camadas. E aí
 * a recusa vem NOMEADA: quem discorda aparece na lista, senão o conserto vira
 * caça ao tesouro.
 */
export function gradeDoTake(camadas: Camada[]): Grade {
  if (!camadas.length) return { ok: false, motivo: 'sem camadas no código', discordantes: [] }

  let achado: Arranjo | null = null
  const discordantes: string[] = []
  for (const c of camadas) {
    const a = arranjoDaCamada(c.base)
    if (!a) continue
    if (!achado) achado = a
    else if (a.casas !== achado.casas || a.porCasa !== achado.porCasa) discordantes.push(c.rotulo)
  }
  if (discordantes.length) {
    return { ok: false, motivo: 'as camadas discordam da grade', discordantes }
  }

  const arranjo = achado ?? PADRAO_ARRANJO
  const linhas = camadas.map(c => {
    const casas = casasDaCamada(c.base)
    return {
      indice: c.indice,
      rotulo: c.rotulo,
      casas: casas ?? new Array<boolean>(arranjo.casas).fill(true),
      propria: casas !== null,
    }
  })
  return { ok: true, arranjo, linhas }
}

/** As linhas do desenho ASCII (as que têm 4+ casas), em ordem de arquivo. */
export function linhasDoDesenho(codigo: string): number[] {
  const out: number[] = []
  const linhas = codigo.split('\n')
  for (let i = 0; i < linhas.length; i++) {
    if (!/^\s*\/\//.test(linhas[i])) continue
    if ((linhas[i].match(/[●·]/g) ?? []).length >= 4) out.push(i)
  }
  return out
}

/**
 * Os rótulos que o AUTOR escreveu no desenho, na ordem das linhas.
 *
 * `detectarCamadas` deriva o rótulo do nome do sample: a camada
 * `s("..._drumkit_kick")` vira `kick`. Mas o autor escreveu `bumbo` no desenho,
 * e é `bumbo` que ele procura na tela. O identificador de máquina serve de
 * reserva, não de primeira escolha.
 *
 * Só é seguro parear por índice porque o portão de `patterns.test.ts` garante
 * linha `n` do desenho = camada `n` do stack. Sem esse portão isto seria a
 * mesma adivinhação por ordem que quebrou o plano anterior — quem usa confere
 * o comprimento antes.
 */
export function rotulosDoDesenho(codigo: string): string[] {
  const linhas = codigo.split('\n')
  return linhasDoDesenho(codigo).map(i =>
    linhas[i].replace(/^\s*\/\/\s*/, '').split(/[●·]/)[0].trim(),
  )
}

/**
 * Reescreve os `●`/`·` do desenho a partir das máscaras. Nada mais.
 *
 * Substitui caractere por caractere, na posição exata em que cada casa já
 * estava: assim o alinhamento das colunas, o rótulo (`bumbo`, e não `kick`) e a
 * nota no fim da linha (`a nuvem é a peça`) sobrevivem intactos. Regenerar a
 * linha inteira seria mais simples e trocaria escrita humana por identificador
 * de máquina.
 *
 * RECUSA silenciosa e total (devolve o código intocado) quando o desenho tem
 * número de linhas diferente do número de camadas, ou uma linha com número de
 * casas diferente da máscara. Nesses casos o pareamento linha↔camada não é
 * confiável, e escrever seria estragar o arquivo com a cara de ter arrumado.
 * Quem reprova take assim é o portão em `patterns.test.ts`, com nome e motivo.
 */
/**
 * Remove uma casa do arranjo inteiro: a peça vai de N pra N-1 casas.
 *
 * Não confundir com apagar a coluna. Apagar deixa a casa lá, muda e silenciosa —
 * a peça continua com o mesmo comprimento e ganha um trecho vazio. Remover tira
 * o trecho do tempo: o que era a casa 2 passa a ser a 1, e a volta encurta em
 * `porCasa` compassos. Quem tem uma abertura morta quer a segunda, não a
 * primeira; quem quer um respiro no meio quer a primeira.
 *
 * As duas metades andam juntas, como em todo o resto desta tela: sai da máscara
 * de cada camada E sai do desenho, incluindo a régua de números. Tirar só da
 * máscara deixaria o comentário com N marcas contra N-1 dígitos, e nesse estado
 * `sincronizarGrade` desiste em silêncio (ela exige contagem igual) — ou seja, a
 * divergência voltaria pela porta dos fundos, sem erro nenhum na tela.
 *
 * Recusa em vez de adivinhar quando o desenho não bate com as camadas, e nunca
 * remove a última casa: arranjo de zero casas não é arranjo, é um take sem forma.
 */
export function removerCasa(
  codigo: string, camadas: Camada[], casa: number, arranjo: Arranjo,
): string {
  if (arranjo.casas <= 1) return codigo
  if (casa < 0 || casa >= arranjo.casas) return codigo

  // Take sem NENHUMA `.mask()` escrita não tem arranjo — a grade que aparece na
  // tela é o padrão, "tudo aceso", não uma decisão de alguém. Remover uma casa
  // dela escreveria máscara em todas as camadas pra apagar um trecho que nunca
  // existiu; a peça passaria a ter uma forma que o autor não desenhou, e a
  // primeira notícia disso seria o diff. Medido: 7 das 25 takes do acervo estão
  // nesse estado (cama-eno, stone-em-foco, take-01 e as outras que declaram
  // `// estatico:`). Recusa, como o resto deste módulo.
  if (!camadas.some(c => casasDaCamada(c.base) !== null)) return codigo

  // Do fim pro começo: cada escrita muda o comprimento do texto e move o
  // recorte das camadas seguintes.
  let out = codigo
  const ordenadas = [...camadas].sort((a, b) => b.inicio - a.inicio)
  for (const c of ordenadas) {
    const trecho = out.slice(c.inicio, c.fim)
    const { base, fx } = lerFx(trecho)
    const atuais = casasDaCamada(base) ?? new Array<boolean>(arranjo.casas).fill(true)
    if (atuais.length !== arranjo.casas) return codigo
    const novas = atuais.slice()
    novas.splice(casa, 1)
    const novo = escreverCasas(base, novas, arranjo.porCasa)
    out = out.slice(0, c.inicio) + novo.trimEnd() + escreverFx(fx) + out.slice(c.fim)
  }

  return tirarColunaDoDesenho(out, casa)
}

/**
 * Tira a coluna `casa` das linhas do desenho e da régua de números.
 *
 * O corte é feito por POSIÇÃO das marcas, não por largura fixa de coluna: o
 * acervo tem take escrito com quatro espaços entre casas e take escrito com
 * cinco, e assumir a largura desalinharia o desenho de metade do repertório.
 * Corta-se da marca até a marca seguinte (assim o espaçamento vai junto) ou, se
 * for a última, do fim da anterior até ela — o que preserva o comentário que
 * muita linha carrega depois das casas.
 */
function tirarColunaDoDesenho(codigo: string, casa: number): string {
  const alvos = linhasDoDesenho(codigo)
  if (!alvos.length) return codigo
  const linhas = codigo.split('\n')

  const marcasDe = (t: string): number[] => {
    const pos: number[] = []
    for (let k = 0; k < t.length; k++) if (t[k] === '\u25cf' || t[k] === '\u00b7') pos.push(k)
    return pos
  }

  const corta = (t: string, pos: number[]): string | null => {
    if (casa >= pos.length) return null
    const [ini, fim] = casa < pos.length - 1
      ? [pos[casa], pos[casa + 1]]
      : [pos[casa - 1] + 1, pos[casa] + 1]
    return t.slice(0, ini) + t.slice(fim)
  }

  for (const i of alvos) {
    const nova = corta(linhas[i], marcasDe(linhas[i]))
    if (nova === null) return codigo
    linhas[i] = nova
  }

  // A régua de números: a linha de comentário acima do desenho que só tem
  // dígitos. Aqui o corte é pelos dígitos, e depois renumera — senão a peça
  // ficaria com as casas "1 2 4 5", que é pior que régua nenhuma.
  const primeira = alvos[0]
  for (let i = primeira - 1; i >= 0 && i >= primeira - 3; i--) {
    const t = linhas[i]
    if (!/^\s*\/\//.test(t)) continue
    const digitos: number[] = []
    for (let k = 0; k < t.length; k++) if (t[k] >= '0' && t[k] <= '9') digitos.push(k)
    if (digitos.length < 4) continue
    const cortada = corta(t, digitos)
    if (cortada === null) break
    // renumera 1..n nas posições que sobraram
    const chars = cortada.split('')
    let n = 0
    for (let k = 0; k < chars.length; k++) {
      if (chars[k] >= '0' && chars[k] <= '9') { n += 1; chars[k] = String(n) }
    }
    linhas[i] = chars.join('')
    break
  }

  return linhas.join('\n')
}

export function sincronizarGrade(codigo: string, camadas: Camada[]): string {
  const alvos = linhasDoDesenho(codigo)
  if (!alvos.length || alvos.length !== camadas.length) return codigo
  const grade = gradeDoTake(camadas)
  if (!grade.ok) return codigo

  const linhas = codigo.split('\n')
  for (let i = 0; i < alvos.length; i++) {
    const texto = linhas[alvos[i]]
    const casas = grade.linhas[i].casas
    const pos: number[] = []
    for (let k = 0; k < texto.length; k++) {
      if (texto[k] === '●' || texto[k] === '·') pos.push(k)
    }
    if (pos.length !== casas.length) return codigo
    const chars = texto.split('')
    pos.forEach((k, j) => { chars[k] = casas[j] ? '●' : '·' })
    linhas[alvos[i]] = chars.join('')
  }
  return linhas.join('\n')
}

/** A parte fracionária do relógio, defendida de negativo (o relógio anda antes do play). */
export function faseDoCiclo(agora: number): number {
  if (!Number.isFinite(agora)) return 0
  const f = agora - Math.floor(agora)
  return f < 0 ? f + 1 : f
}
