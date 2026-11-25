/**
 * Contas do piano roll sobre um grupo de notas. Puras (devolvem lista nova), pra o ⌘Z
 * continuar sendo pilha e pra dar teste sem DOM.
 *
 * Altura anda por LINHA, não por semitom: `linhas` é a lista que o roll mostra (do agudo
 * pro grave). Com "scale rows only" uma linha é um grau da escala; sem, é um semitom. É
 * assim que ↑ nunca cai em nota fora da escala.
 */
import { novoId, type Nota } from './modelo'

export const DUR_MIN = 0.05

// a prancheta vive fora do componente: copia num clipe, cola em outro
let prancheta: Nota[] = []
export const guardarPrancheta = (ns: Nota[]) => { prancheta = ns }
export const lerPrancheta = () => prancheta

/** `midi` andado `d` linhas (d > 0 = mais agudo). Fora da lista, prende na ponta. */
export function andarLinha(midi: number, d: number, linhas: number[]): number {
  let i = linhas.indexOf(midi)
  if (i < 0) {
    // nota fora das linhas visíveis (ex.: cromática com o filtro de escala ligado): a mais próxima
    i = linhas.reduce((m, x, k) => (Math.abs(x - midi) < Math.abs(linhas[m] - midi) ? k : m), 0)
  }
  return linhas[Math.max(0, Math.min(linhas.length - 1, i - d))]
}

export function moverNotas(ns: Nota[], ids: ReadonlySet<string>, dt: number, dLinha: number, linhas: number[]): Nota[] {
  // o grupo anda junto: se a mais cedo bate no zero, ninguém passa dele
  const sel = ns.filter(n => ids.has(n.id))
  const t0 = Math.min(...sel.map(n => n.t))
  const dtOk = Math.max(-t0, dt)
  return ns.map(n => (ids.has(n.id) ? { ...n, t: n.t + dtOk, midi: dLinha ? andarLinha(n.midi, dLinha, linhas) : n.midi } : n))
}

export function oitava(ns: Nota[], ids: ReadonlySet<string>, d: 1 | -1, min: number, max: number): Nota[] {
  const sel = ns.filter(n => ids.has(n.id))
  // o grupo inteiro cabe, ou ninguém anda (senão o acorde desmonta na borda)
  if (sel.some(n => n.midi + 12 * d < min || n.midi + 12 * d > max)) return ns
  return ns.map(n => (ids.has(n.id) ? { ...n, midi: n.midi + 12 * d } : n))
}

export function esticar(ns: Nota[], ids: ReadonlySet<string>, dDur: number): Nota[] {
  return ns.map(n => (ids.has(n.id) ? { ...n, dur: Math.max(DUR_MIN, n.dur + dDur) } : n))
}

export function apagar(ns: Nota[], ids: ReadonlySet<string>): Nota[] {
  return ns.filter(n => !ids.has(n.id))
}

/** Copia guardando a posição relativa à primeira nota. */
export function copiar(ns: Nota[], ids: ReadonlySet<string>): Nota[] {
  const sel = ns.filter(n => ids.has(n.id))
  if (!sel.length) return []
  const t0 = Math.min(...sel.map(n => n.t))
  return sel.map(n => ({ ...n, t: n.t - t0 }))
}

/** Cola em `t`, com ids novos. Devolve as notas e os ids colados (viram a seleção). */
export function colar(ns: Nota[], prancheta: Nota[], t: number): { notas: Nota[]; ids: ReadonlySet<string> } {
  const novas = prancheta.map(n => ({ ...n, id: novoId('n'), t: Math.max(0, t + n.t) }))
  return { notas: [...ns, ...novas], ids: new Set(novas.map(n => n.id)) }
}

/** ⌘D: cópia logo depois do fim da seleção, arredondado pra cima na grade. */
export function duplicar(ns: Nota[], ids: ReadonlySet<string>, grade: number): { notas: Nota[]; ids: ReadonlySet<string> } {
  const sel = ns.filter(n => ids.has(n.id))
  if (!sel.length) return { notas: ns, ids }
  const ini = Math.min(...sel.map(n => n.t))
  const fim = Math.max(...sel.map(n => n.t + n.dur))
  const passo = grade > 0 ? Math.ceil((fim - ini) / grade - 1e-6) * grade : fim - ini
  return colar(ns, copiar(ns, ids), ini + passo)
}

/** Laço: notas que tocam o retângulo (tempo [t0,t1], linhas [i0,i1] inclusivas). */
export function noLaco(ns: Nota[], t0: number, t1: number, i0: number, i1: number, linhaDe: (midi: number) => number): Set<string> {
  const [ta, tb] = t0 < t1 ? [t0, t1] : [t1, t0]
  const [ia, ib] = i0 < i1 ? [i0, i1] : [i1, i0]
  return new Set(ns.filter(n => n.t < tb && n.t + n.dur > ta && linhaDe(n.midi) >= ia && linhaDe(n.midi) <= ib).map(n => n.id))
}

/** Velocity do grupo andada por `d`, cada uma presa em [0.05, 1]. */
export function velocity(ns: Nota[], ids: ReadonlySet<string>, d: number): Nota[] {
  return ns.map(n => (ids.has(n.id) ? { ...n, vel: Math.max(0.05, Math.min(1, n.vel + d)) } : n))
}

/** Q: puxa o começo pra grade com `forca` (1 = cola, 0,5 = metade do caminho, o "groove" fica). */
export function quantizar(ns: Nota[], ids: ReadonlySet<string>, grade: number, forca = 1): Nota[] {
  if (grade <= 0) return ns
  return ns.map(n => (ids.has(n.id) ? { ...n, t: Math.max(0, n.t + (Math.round(n.t / grade) * grade - n.t) * forca) } : n))
}

/** Notas das OUTRAS trilhas de melodia (e dos outros clipes desta) no tempo deste clipe, pra escrever contra a harmonia. */
export function fantasmas(trilhas: { tipo: string; clipes: { id: string; inicio: number; notas?: Nota[] }[] }[], clipeId: string, inicio: number, dur: number): Nota[] {
  const out: Nota[] = []
  for (const t of trilhas) {
    if (t.tipo !== 'melodia') continue
    for (const c of t.clipes) {
      if (c.id === clipeId) continue
      for (const n of c.notas ?? []) {
        const rel = c.inicio + n.t - inicio
        if (rel + n.dur > 0 && rel < dur) out.push({ ...n, t: rel })
      }
    }
  }
  return out
}

/**
 * T: acorde por cima de cada nota, empilhando terças DENTRO da escala (grau +2, +4; tétrade +6).
 * `graus` é a escala inteira do grave pro agudo; nota fora dela prende no grau de baixo.
 * O que passaria do teto (`max`) fica de fora, o resto do acorde entra.
 */
export function acorde(ns: Nota[], ids: ReadonlySet<string>, graus: number[], tetrade: boolean, max: number): { notas: Nota[]; ids: ReadonlySet<string> } {
  const novas: Nota[] = []
  for (const n of ns) {
    if (!ids.has(n.id)) continue
    let i = graus.findIndex(m => m >= n.midi)
    if (i < 0) continue
    if (graus[i] > n.midi) i -= 1
    for (const d of tetrade ? [2, 4, 6] : [2, 4]) {
      const midi = graus[i + d]
      if (midi === undefined || midi > max) continue
      if (ns.some(x => x.midi === midi && Math.abs(x.t - n.t) < 1e-6)) continue
      novas.push({ ...n, id: novoId('n'), midi })
    }
  }
  return { notas: [...ns, ...novas], ids: new Set([...ids, ...novas.map(n => n.id)]) }
}

/** L: cada nota da seleção estica até a próxima nota que começa depois dela (a última fica). */
export function legato(ns: Nota[], ids: ReadonlySet<string>): Nota[] {
  const inicios = [...new Set(ns.map(n => n.t))].sort((a, b) => a - b)
  return ns.map(n => {
    if (!ids.has(n.id)) return n
    const prox = inicios.find(t => t > n.t + 1e-6)
    return prox === undefined ? n : { ...n, dur: prox - n.t }
  })
}
