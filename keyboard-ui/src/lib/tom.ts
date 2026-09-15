/**
 * Tom: ler a tonalidade de um take, escrever o rótulo, e transpor o padrão.
 *
 * Separado do componente de propósito — é a parte que dá pra testar sem DOM, e é
 * a parte onde mora a única armadilha real do assunto:
 *
 * ── POR QUE NÃO DÁ PRA TRANSPOR O TAKE INTEIRO ──────────────────────────
 *
 * O reflexo é `(take).add(note(n))`. Medido no @strudel/core, isso faz:
 *
 *     s("bd").n(5)              ->  { s:"bd", n:5 }
 *     s("bd").n(5).add(note(3)) ->  { s:"bd", n:5, note:3 }   <- INVENTOU note
 *
 * Camada de bateria não tem `note`. O `add` não soma: ele CRIA o campo. E no
 * superdough um sample com `note:3` toca afinado relativo a c3 (MIDI 48), ou
 * seja, 45 semitons abaixo — o kick vira um ronco e o chimbal some.
 *
 * Então transpor é uma operação sobre as camadas que JÁ têm nota. `envolverComTom`
 * separa o padrão em duas metades por `filterValues`, transpõe só a metade
 * melódica e empilha de volta. Escrito como IIFE numa expressão só porque o
 * painel avalia sem transpiler (o mesmo motivo documentado em patterns.test.ts:
 * `const x = ...` no topo não vale).
 */

const NOMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** Nome de nota (c, f#, bb, F♯) -> classe de altura 0..11. `null` se não for nota. */
export function classeDaNota(nome: string): number | null {
  const m = /^([a-gA-G])([#♯b♭]?)/.exec(nome.trim())
  if (!m) return null
  const base: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
  const alt = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0
  return (((base[m[1].toLowerCase()] + alt) % 12) + 12) % 12
}

/** Famílias de modo, pro rótulo dizer "F♯m" e não "F♯ aeolian". */
const MENORES = new Set(['minor', 'min', 'aeolian', 'dorian', 'phrygian', 'locrian', 'harmonicminor', 'melodicminor'])
const MAIORES = new Set(['major', 'maj', 'ionian', 'lydian', 'mixolydian'])

export type Tom = { classe: number; modo: string | null }

/**
 * A tonalidade declarada no código do take, ou `null` quando não dá pra saber.
 *
 * Ordem de busca — da fonte mais confiável pra menos:
 *   1. `.scale("f#1:minor")`  — o autor DISSE o tom e o modo.
 *   2. `note("<f#2 ...>")`    — a primeira nota da primeira camada melódica.
 * Não adivinha modo a partir de nota solta: nesse caso o rótulo mostra só a raiz.
 */
export function tomDoTake(code: string): Tom | null {
  const semComentario = code.replace(/\/\/.*$/gm, '')

  const esc = /\.scale\(\s*["']\s*([a-gA-G][#♯b♭]?)\d*\s*:\s*([a-zA-Z]+)/.exec(semComentario)
  if (esc) {
    const classe = classeDaNota(esc[1])
    if (classe !== null) return { classe, modo: esc[2].toLowerCase() }
  }

  const nt = /\bnote\(\s*["'][<[\s,]*([a-gA-G][#♯b♭]?)-?\d/.exec(semComentario)
  if (nt) {
    const classe = classeDaNota(nt[1])
    if (classe !== null) return { classe, modo: null }
  }
  return null
}

/** "F♯m", "A", "D dorian" — o rótulo do tom depois de andar `semitons`. */
export function rotuloTom(tom: Tom | null, semitons = 0): string | null {
  if (!tom) return null
  const nome = NOMES[(((tom.classe + semitons) % 12) + 12) % 12]
  if (!tom.modo) return nome
  if (MENORES.has(tom.modo)) return tom.modo === 'minor' || tom.modo === 'min' || tom.modo === 'aeolian'
    ? `${nome}m` : `${nome} ${tom.modo}`
  if (MAIORES.has(tom.modo)) return tom.modo === 'major' || tom.modo === 'maj' || tom.modo === 'ionian'
    ? nome : `${nome} ${tom.modo}`
  return `${nome} ${tom.modo}`
}

/**
 * O código do take transposto em `semitons`, pronto pro `evaluate` do painel.
 *
 * Zero devolve o código intacto — nada de embrulhar à toa, porque o embrulho
 * aparece no editor e no diff de versão.
 */
export function envolverComTom(code: string, semitons: number): string {
  const n = Math.round(semitons)
  if (!n) return code
  return `(p => stack(` +
    `p.filterValues(v => v.note !== undefined).add(note(${n})), ` +
    `p.filterValues(v => v.note === undefined)` +
    `))(${code.trim()})`
}
