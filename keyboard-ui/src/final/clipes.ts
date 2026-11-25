/**
 * Contas do arranjo sobre um GRUPO de clipes (⇧ clique). Puras, como `notas.ts`.
 *
 * O grupo anda sempre na mesma trilha de cada um: trocar de trilha é gesto de um clipe
 * só (o tipo da trilha de destino precisa bater, e num grupo misto isso não fecha).
 */
import { acharClipe, novoId, removerClipe, type Clipe, type Projeto } from './modelo'

export function removerClipes(p: Projeto, ids: readonly string[]): Projeto {
  return ids.reduce(removerClipe, p)
}

/** Desloca o grupo `dt`; se o mais cedo bate no zero, ninguém passa dele. */
export function moverClipes(p: Projeto, ids: readonly string[], dt: number): Projeto {
  const set = new Set(ids)
  const inicios = p.trilhas.flatMap(t => t.clipes.filter(c => set.has(c.id)).map(c => c.inicio))
  if (!inicios.length) return p
  const ok = Math.max(-Math.min(...inicios), dt)
  return { ...p, trilhas: p.trilhas.map(t => ({ ...t, clipes: t.clipes.map(c => (set.has(c.id) ? { ...c, inicio: c.inicio + ok } : c)) })) }
}

/** Ids selecionados: o principal primeiro, depois o grupo do ⇧ clique. */
export const idsDe = (s: { clipe: string | null; grupo?: string[] }) => (s.clipe ? [s.clipe, ...(s.grupo ?? [])] : [])

type Copia = { trilha: string; clipe: Clipe }
let prancheta: Copia[] = []

/** Guarda o grupo com o tempo relativo ao clipe mais cedo, e de que trilha veio cada um. */
export function copiarClipes(p: Projeto, ids: readonly string[]): number {
  const achados = ids.map(id => acharClipe(p, id)).filter(a => a !== null)
  if (!achados.length) return 0
  const t0 = Math.min(...achados.map(a => a.clipe.inicio))
  prancheta = achados.map(a => ({ trilha: a.trilha.id, clipe: { ...a.clipe, inicio: a.clipe.inicio - t0 } }))
  return prancheta.length
}

/** Cola em `t`, cada um na trilha de onde veio (trilha apagada desde a cópia: fica de fora). */
export function colarClipes(p: Projeto, t: number): { projeto: Projeto; ids: string[] } {
  const ids: string[] = []
  const trilhas = p.trilhas.map(tr => {
    const novos = prancheta.filter(x => x.trilha === tr.id).map(x => {
      const c: Clipe = { ...x.clipe, id: novoId('c'), inicio: Math.max(0, t + x.clipe.inicio), notas: x.clipe.notas?.map(n => ({ ...n, id: novoId('n') })) }
      ids.push(c.id)
      return c
    })
    return novos.length ? { ...tr, clipes: [...tr.clipes, ...novos] } : tr
  })
  return { projeto: { ...p, trilhas }, ids }
}

/** ⌘D no grupo: cópia logo depois do fim do grupo, mantendo o desenho entre eles. */
export function duplicarClipes(p: Projeto, ids: readonly string[]): { projeto: Projeto; ids: string[] } {
  const achados = ids.map(id => acharClipe(p, id)).filter(a => a !== null)
  if (!achados.length) return { projeto: p, ids: [...ids] }
  const fim = Math.max(...achados.map(a => a.clipe.inicio + a.clipe.dur))
  const guardada = prancheta
  copiarClipes(p, ids)
  const r = colarClipes(p, fim)
  prancheta = guardada   // ⌘D não suja a prancheta do ⌘C
  return r
}
