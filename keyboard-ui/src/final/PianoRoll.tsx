/**
 * Piano roll do clipe de melodia selecionado. Herda a ideia da `GradeMelodia` da era6
 * (linhas presas na escala = não existe nota errada), com tempo contínuo e zoom.
 *
 * Mouse
 * - clicar no vazio cria a nota; segurando e arrastando, estica enquanto cria
 * - ⇧ arrastar no vazio = laço (soma à seleção)
 * - clicar na nota seleciona; ⇧ clique soma/tira; arrastar move o grupo (tempo e altura)
 * - a borda direita estica o grupo; ⌥ arrastar duplica; ⌘ segurado solta da grade
 * - duplo clique apaga; a régua leva a agulha; a faixa de baixo é a velocity (arrasta o grupo)
 * - clicar numa tecla do piano toca a nota
 *
 * Teclado (com o roll focado; as teclas tratadas aqui não chegam no atalho global)
 * - ←→ passo da grade (⇧ = compasso), ↑↓ uma linha (⇧ = oitava), ⌥←→ duração
 * - ⌘A tudo, Esc nada, Delete apaga, ⌘C ⌘V (na agulha) ⌘D (logo depois)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  batidaS, compassoS, encaixar, MIDI_MAX, MIDI_MIN, mudarClipe, naEscala, nomeNota, novoId, prenderNaEscala,
  type Clipe, type Nota, type Projeto, type Trilha,
} from './modelo'
import { acorde, apagar, colar, legato, guardarPrancheta, lerPrancheta, copiar, duplicar, esticar, fantasmas, moverNotas, noLaco, oitava, quantizar, velocity } from './notas'
import type { MotorFinal } from './motor'
import type { Arrasto } from './Arranjo'

const LINHA = 14          // altura padrão da linha; ⌥ roda muda (10 a 28)
const ZOOM_MIN = 16
const ZOOM_MAX = 240
const TECLADO = 52
const REGUA = 18
const VEL = 44

const VAZIO: ReadonlySet<string> = new Set()

type Laco = { t0: number; t1: number; i0: number; i1: number }

export function PianoRoll({ projeto, trilha, clipe, motor, grade, soEscala, zoom, onZoom, arrasto, onMudar }: {
  projeto: Projeto; trilha: Trilha; clipe: Clipe; motor: MotorFinal
  grade: number            // s
  soEscala: boolean
  zoom: number             // px por batida
  onZoom?: (z: number) => void
  arrasto: Arrasto
  onMudar: (p: Projeto) => void
}) {
  // a seleção é do clipe: guardada com o id dele, trocar de clipe já a mostra vazia
  const [selBruta, setSelBruta] = useState<{ c: string; ids: ReadonlySet<string> }>({ c: clipe.id, ids: VAZIO })
  const sel = selBruta.c === clipe.id ? selBruta.ids : VAZIO
  const setSel = (v: ReadonlySet<string> | ((s: ReadonlySet<string>) => ReadonlySet<string>)) =>
    setSelBruta(x => ({ c: clipe.id, ids: typeof v === 'function' ? v(x.c === clipe.id ? x.ids : VAZIO) : v }))
  const [laco, setLaco] = useState<Laco | null>(null)
  const [largura, setLargura] = useState(0)
  const [linha, setLinha] = useState(LINHA)
  const [hover, setHover] = useState<{ t: number; i: number } | null>(null)
  const [ativas, setAtivas] = useState<ReadonlySet<number>>(() => new Set())
  // âncora do zoom: o ponto sob o cursor fica parado (padrão Figma, o mesmo do arranjo)
  const ancora = useRef<{ t: number; x: number } | { i: number; y: number } | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const agulha = useRef<HTMLDivElement>(null)
  const notasRef = useRef<Nota[]>([])
  const ativasChave = useRef('')
  const pxs = zoom / batidaS(projeto.bpm)
  const linhas: number[] = []
  for (let m = MIDI_MAX; m >= MIDI_MIN; m--) if (!soEscala || naEscala(m, projeto.raiz, projeto.escala)) linhas.push(m)
  const linhaDe = (midi: number) => {
    const i = linhas.indexOf(midi)
    return i >= 0 ? i : linhas.indexOf(prenderNaEscala(midi, projeto.raiz, projeto.escala))
  }
  const bar = compassoS(projeto)
  // a grade enche o painel: o vão preto à direita era espaço que não servia pra nada
  const durVista = Math.max(Math.ceil((clipe.dur + bar) / bar) * bar, Math.ceil((largura - TECLADO) / pxs / bar) * bar)
  const W = durVista * pxs
  const notas = clipe.notas ?? []
  useEffect(() => { notasRef.current = notas })
  const passo = grade || batidaS(projeto.bpm) / 4
  const outras = fantasmas(projeto.trilhas, clipe.id, clipe.inicio, durVista)

  useEffect(() => {
    const a = area.current
    if (!a) return
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width))
    ro.observe(a)
    return () => ro.disconnect()
  }, [])

  // ⌘ roda = zoom no tempo, ⌥ roda = altura da linha; os dois ancorados no cursor
  const vivo = useRef({ zoom, pxs, linha, onZoom })
  useEffect(() => { vivo.current = { zoom, pxs, linha, onZoom } })
  useEffect(() => {
    const a = area.current
    if (!a) return
    const roda = (e: WheelEvent) => {
      const v = vivo.current
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return
      e.preventDefault()
      const box = a.getBoundingClientRect()
      const fator = Math.exp(-e.deltaY * 0.0015)
      if (e.altKey) {
        const y = e.clientY - box.top
        ancora.current = { i: (a.scrollTop + y - REGUA) / v.linha, y }
        setLinha(Math.max(10, Math.min(28, Math.round(v.linha * fator))))
      } else if (v.onZoom) {
        const x = e.clientX - box.left
        ancora.current = { t: (a.scrollLeft + x - TECLADO) / v.pxs, x }
        v.onZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * fator)))
      }
    }
    a.addEventListener('wheel', roda, { passive: false })
    return () => a.removeEventListener('wheel', roda)
  }, [])
  useLayoutEffect(() => {
    const a = area.current
    const an = ancora.current
    if (!a || !an) return
    ancora.current = null
    if ('t' in an) a.scrollLeft = Math.max(0, TECLADO + an.t * pxs - an.x)
    else a.scrollTop = Math.max(0, REGUA + an.i * linha - an.y)
  }, [pxs, linha])

  // abre centrado na raiz da oitava 4
  useEffect(() => {
    const a = area.current
    if (!a) return
    const i = linhaDe(60 + projeto.raiz)
    a.scrollTop = Math.max(0, i * linha - a.clientHeight / 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipe.id, soEscala])

  useEffect(() => {
    let id = 0
    const passoRaf = () => {
      if (agulha.current) {
        const x = (motor.segundos - clipe.inicio) * pxs
        agulha.current.style.transform = `translateX(${TECLADO + x}px)`
        agulha.current.style.opacity = x >= 0 && x <= W ? '1' : '0'
        const a = area.current
        if (motor.tocando && a) {
          // seguir a agulha: virou a página, a página vai junto
          const xc = TECLADO + x
          if (x >= 0 && x <= W && (xc > a.scrollLeft + a.clientWidth - 24 || xc < a.scrollLeft + TECLADO)) a.scrollLeft = xc - TECLADO - 24
          // teclas acesas: só troca o estado quando o conjunto muda
          const t = motor.segundos - clipe.inicio
          const agora = notasRef.current.filter(n => t >= n.t && t < n.t + n.dur).map(n => n.midi)
          const chave = agora.join(',')
          if (chave !== ativasChave.current) { ativasChave.current = chave; setAtivas(new Set(agora)) }
        } else if (ativasChave.current) { ativasChave.current = ''; setAtivas(new Set()) }
      }
      id = requestAnimationFrame(passoRaf)
    }
    id = requestAnimationFrame(passoRaf)
    return () => cancelAnimationFrame(id)
  }, [motor, clipe.inicio, pxs, W])

  const pos = (ev: { clientX: number; clientY: number }) => {
    const box = grid.current!.getBoundingClientRect()
    const t = (ev.clientX - box.left) / pxs
    const i = Math.max(0, Math.min(linhas.length - 1, Math.floor((ev.clientY - box.top) / linha)))
    return { t: Math.max(0, t), i, midi: linhas[i] }
  }
  const comNotas = (p: Projeto, f: (ns: Nota[]) => Nota[]) =>
    mudarClipe(p, clipe.id, c => {
      const ns = f(c.notas ?? [])
      const fim = Math.max(0, ...ns.map(n => n.t + n.dur))
      return { ...c, notas: ns, dur: Math.max(c.dur, fim) }
    })
  const editar = (f: (ns: Nota[]) => Nota[]) => onMudar(comNotas(projeto, f))

  const acompanhar = (original: Projeto, inicial: Projeto, f: (ev: PointerEvent) => Projeto) => {
    let mexeu = inicial !== original
    if (mexeu) arrasto.previa(inicial)
    const mover = (ev: PointerEvent) => { mexeu = true; arrasto.previa(f(ev)) }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (mexeu) arrasto.fim(original)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const snap = (t: number, ev: { metaKey: boolean; ctrlKey: boolean }) => (ev.metaKey || ev.ctrlKey ? t : encaixar(t, grade))
  const piso = (t: number) => (grade > 0 ? Math.floor(t / grade) * grade : t)

  const downVazio = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return
    area.current?.focus()
    const p0 = pos(e)
    if (e.shiftKey) {
      // laço: soma ao que já estava selecionado
      const antes = sel
      const l0: Laco = { t0: p0.t, t1: p0.t, i0: p0.i, i1: p0.i }
      setLaco(l0)
      const mover = (ev: PointerEvent) => {
        const p = pos(ev)
        const l = { ...l0, t1: p.t, i1: p.i }
        setLaco(l)
        setSel(new Set([...antes, ...noLaco(notas, l.t0, l.t1, l.i0, l.i1, linhaDe)]))
      }
      const soltar = () => { setLaco(null); window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
      window.addEventListener('pointermove', mover)
      window.addEventListener('pointerup', soltar)
      return
    }
    const t0 = e.metaKey || e.ctrlKey ? p0.t : piso(p0.t)
    const nota: Nota = { id: novoId('n'), t: t0, dur: passo, midi: p0.midi, vel: 0.8 }
    motor.previa(trilha.id, p0.midi)
    setSel(new Set([nota.id]))
    const original = arrasto.comecar()
    const inicial = comNotas(original, ns => [...ns, nota])
    acompanhar(original, inicial, ev => {
      const fim = snap(pos(ev).t, ev)
      return comNotas(original, ns => [...ns, { ...nota, dur: Math.max(passo, fim - t0) }])
    })
  }

  const downNota = (e: React.PointerEvent, n: Nota, borda: boolean) => {
    if (e.button !== 0) return
    e.stopPropagation()
    area.current?.focus()
    if (e.shiftKey && !borda) {
      setSel(s => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x })
      return
    }
    // clicar numa nota de fora troca a seleção; numa de dentro, arrasta o grupo todo
    let grupo = sel.has(n.id) ? sel : new Set([n.id])
    const original = arrasto.comecar()
    let inicial = original
    if (e.altKey && !borda) {
      const d = colar(notas, copiar(notas, grupo), Math.min(...notas.filter(x => grupo.has(x.id)).map(x => x.t)))
      inicial = comNotas(original, () => d.notas)
      grupo = d.ids
    }
    setSel(grupo)
    const p0 = pos(e)
    const iAncora = linhaDe(n.midi)
    let ultimo = n.midi
    acompanhar(original, inicial, ev => {
      const p = pos(ev)
      if (borda) {
        const fim = snap(n.t + n.dur + (p.t - p0.t), ev)
        return comNotas(inicial, ns => esticar(ns, grupo, fim - (n.t + n.dur)))
      }
      const dLinha = linhaDe(p0.midi) - p.i
      const midi = linhas[Math.max(0, Math.min(linhas.length - 1, iAncora - dLinha))]
      if (midi !== ultimo) { motor.previa(trilha.id, midi, 0.25); ultimo = midi }
      const dt = snap(n.t + (p.t - p0.t), ev) - n.t
      return comNotas(inicial, ns => moverNotas(ns, grupo, dt, dLinha, linhas))
    })
  }

  const downFim = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const original = arrasto.comecar()
    // o fim anda na grade (⌘ solta); nota além do fim não toca, mas fica guardada
    acompanhar(original, original, ev => mudarClipe(original, clipe.id, c => ({ ...c, dur: Math.max(passo, snap(pos(ev).t, ev)) })))
  }

  const downVel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const box = e.currentTarget.getBoundingClientRect()
    const t = (e.clientX - box.left) / pxs
    // a haste mais perto do clique; se ela está na seleção, o grupo inteiro anda junto
    const alvo = notas.filter(n => t >= n.t - 4 / pxs && t <= n.t + n.dur).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]
    if (!alvo) return
    area.current?.focus()
    const grupo = sel.has(alvo.id) ? sel : new Set([alvo.id])
    if (!sel.has(alvo.id)) setSel(grupo)
    const original = arrasto.comecar()
    const v0 = alvo.vel
    const alvoDe = (ev: { clientY: number }) => Math.max(0.05, Math.min(1, 1 - (ev.clientY - box.top - 4) / (VEL - 8)))
    acompanhar(original, comNotas(original, ns => velocity(ns, grupo, alvoDe(e) - v0)), ev => comNotas(original, ns => velocity(ns, grupo, alvoDe(ev) - v0)))
  }

  const tecla = (e: React.KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey
    const k = e.key.toLowerCase()
    const tem = sel.size > 0
    const feito = () => { e.preventDefault(); e.stopPropagation() }
    if (cmd && k === 'a') { feito(); setSel(new Set(notas.map(n => n.id))); return }
    if (k === 'escape' && tem) { feito(); setSel(new Set()); return }
    if ((k === 'delete' || k === 'backspace') && tem) { feito(); editar(ns => apagar(ns, sel)); setSel(new Set()); return }
    if (cmd && k === 'c' && tem) { feito(); guardarPrancheta(copiar(notas, sel)); return }
    if (cmd && k === 'v' && lerPrancheta().length) {
      feito()
      const t = motor.segundos - clipe.inicio
      // agulha fora do clipe: cola depois da última nota
      const em = t >= 0 && t <= clipe.dur ? encaixar(t, grade) : Math.max(0, ...notas.map(n => n.t + n.dur))
      const r = colar(notas, lerPrancheta(), em)
      editar(() => r.notas); setSel(r.ids); return
    }
    if (cmd && k === 'd' && tem) { feito(); const r = duplicar(notas, sel, grade); editar(() => r.notas); setSel(r.ids); return }
    if (k === 'q' && !cmd) {
      // Q quantiza a seleção (sem seleção, o clipe todo); shift Q vai só metade do caminho
      feito()
      editar(ns => quantizar(ns, tem ? sel : new Set(ns.map(n => n.id)), grade, e.shiftKey ? 0.5 : 1))
      return
    }
    if (k === 'z' && !cmd && onZoom) {
      // Z enquadra o clipe na largura e centra as notas na altura
      feito()
      const a = area.current
      onZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ((largura - TECLADO - 24) / Math.max(clipe.dur, bar)) * batidaS(projeto.bpm))))
      if (a) {
        a.scrollLeft = 0
        if (notas.length) {
          const is = notas.map(n => linhaDe(n.midi))
          a.scrollTop = Math.max(0, REGUA + ((Math.min(...is) + Math.max(...is)) / 2) * linha - a.clientHeight / 2)
        }
      }
      return
    }
    if (k === 'l' && !cmd && tem) { feito(); editar(ns => legato(ns, sel)); return }
    if (k === 't' && !cmd && tem) {
      // T carimba a tríade da escala por cima da seleção; shift T, a tétrade
      feito()
      const graus: number[] = []
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) if (naEscala(m, projeto.raiz, projeto.escala)) graus.push(m)
      const r = acorde(notas, sel, graus, e.shiftKey, MIDI_MAX)
      editar(() => r.notas); setSel(r.ids)
      return
    }
    if (!tem || cmd) return
    if (k === 'arrowleft' || k === 'arrowright') {
      feito()
      const s = k === 'arrowleft' ? -1 : 1
      if (e.altKey) editar(ns => esticar(ns, sel, s * passo))
      else editar(ns => moverNotas(ns, sel, s * (e.shiftKey ? bar : passo), 0, linhas))
      return
    }
    if (k === 'arrowup' || k === 'arrowdown') {
      feito()
      const s = k === 'arrowup' ? 1 : -1
      const novo = e.shiftKey ? oitava(notas, sel, s, MIDI_MIN, MIDI_MAX) : moverNotas(notas, sel, 0, s, linhas)
      editar(() => novo)
      const primeira = novo.find(n => sel.has(n.id))
      if (primeira) motor.previa(trilha.id, primeira.midi, 0.25)
    }
  }

  const fundo = `repeating-linear-gradient(90deg, var(--vintage-surface-4) 0 1px, transparent 1px ${bar * pxs}px),` +
    `repeating-linear-gradient(90deg, var(--vintage-border) 0 1px, transparent 1px ${batidaS(projeto.bpm) * pxs}px)` +
    (grade > 0 && grade * pxs > 8 ? `, repeating-linear-gradient(90deg, color-mix(in srgb, var(--vintage-border) 40%, transparent) 0 1px, transparent 1px ${grade * pxs}px)` : '')
  const compassos = Math.ceil(durVista / bar)
  const canto: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 4, width: TECLADO, flex: 'none', background: 'var(--vintage-surface-2)', borderRight: '1px solid var(--vintage-border)' }

  return (
    <div ref={area} tabIndex={0} aria-label="piano roll" className="final-roll" onKeyDown={tecla}
      style={{ overflow: 'auto', minHeight: 0, position: 'relative', outline: 'none', background: 'var(--vintage-surface-1)' }}>
      {/* régua: compasso e clique = agulha */}
      <div style={{ position: 'sticky', top: 0, zIndex: 3, display: 'flex', width: TECLADO + W, height: REGUA }}>
        <div style={canto} />
        <div aria-label="bar ruler" onPointerDown={e => { const b = e.currentTarget.getBoundingClientRect(); motor.irPara(clipe.inicio + Math.max(0, (e.clientX - b.left) / pxs)) }}
          style={{ position: 'relative', width: W, background: 'var(--vintage-surface-2)', borderBottom: '1px solid var(--vintage-border)', cursor: 'text' }}>
          {Array.from({ length: compassos }, (_, i) => (
            <span key={i} style={{ position: 'absolute', left: i * bar * pxs, top: 0, bottom: 0, paddingLeft: 3, borderLeft: '1px solid var(--vintage-border)', font: '400 9px/18px var(--font-vintage-mono, monospace)', color: 'var(--vintage-text-muted)', pointerEvents: 'none' }}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', width: TECLADO + W, position: 'relative' }}>
        {/* teclado */}
        <div style={{ position: 'sticky', left: 0, zIndex: 2, width: TECLADO, flex: 'none' }}>
          {linhas.map(m => {
            const preta = [1, 3, 6, 8, 10].includes(m % 12)
            const raiz = ((m - projeto.raiz) % 12 + 12) % 12 === 0
            return (
              <button key={m} type="button" tabIndex={-1} onPointerDown={() => motor.previa(trilha.id, m)} aria-label={nomeNota(m)}
                style={{
                  display: 'block', width: '100%', height: linha, padding: '0 4px', textAlign: 'right', fontSize: 9, lineHeight: `${linha}px`, cursor: 'pointer',
                  background: ativas.has(m) ? 'var(--vintage-accent)' : preta ? 'var(--vintage-surface-3)' : '#d9d4c3', color: preta ? 'var(--vintage-text-muted)' : 'var(--vintage-surface-1)',
                  border: 'none', borderBottom: '1px solid var(--vintage-border)', fontWeight: raiz ? 700 : 400,
                }}>
                {raiz || m % 12 === 0 ? nomeNota(m) : ''}
              </button>
            )
          })}
        </div>
        {/* grade */}
        <div ref={grid} onPointerDown={downVazio} aria-label="note grid"
          onPointerMove={e => { if (e.buttons === 0 && e.target === e.currentTarget) { const p = pos(e); const t = piso(p.t); setHover(h => (h && h.i === p.i && h.t === t ? h : { t, i: p.i })) } else if (hover) setHover(null) }}
          onPointerLeave={() => setHover(null)}
          style={{ position: 'relative', width: W, height: linhas.length * linha, background: fundo, cursor: 'crosshair', touchAction: 'none' }}>
          {linhas.map((m, i) => (
            <div key={m} aria-hidden style={{
              position: 'absolute', left: 0, right: 0, top: i * linha, height: linha, pointerEvents: 'none',
              borderBottom: '1px solid color-mix(in srgb, var(--vintage-border) 50%, transparent)',
              background: !naEscala(m, projeto.raiz, projeto.escala) ? 'rgba(0,0,0,0.35)' : ((m - projeto.raiz) % 12 + 12) % 12 === 0 ? 'color-mix(in srgb, var(--vintage-accent) 7%, transparent)' : undefined,
            }} />
          ))}
          {hover && (
            <>
              <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: hover.i * linha, height: linha, background: 'color-mix(in srgb, var(--vintage-value) 6%, transparent)', pointerEvents: 'none' }} />
              <div aria-hidden style={{ position: 'absolute', left: hover.t * pxs, top: hover.i * linha + 1, width: Math.max(4, passo * pxs - 1), height: linha - 2, borderRadius: 2, border: '1px dashed color-mix(in srgb, var(--vintage-accent) 70%, transparent)', pointerEvents: 'none' }} />
            </>
          )}
          {outras.map((n, k) => (
            <div key={`f${k}`} aria-hidden style={{ position: 'absolute', left: n.t * pxs, top: linhaDe(n.midi) * linha + 3, width: Math.max(3, n.dur * pxs - 1), height: linha - 6, borderRadius: 2, background: 'var(--vintage-text-dim)', opacity: 0.35, pointerEvents: 'none' }} />
          ))}
          {/* fim do clipe */}
          <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: clipe.dur * pxs, right: 0, background: 'rgba(0,0,0,0.3)', borderLeft: '1px solid var(--vintage-accent)', pointerEvents: 'none' }} />
          <div aria-label="clip end" title="drag: clip length" onPointerDown={downFim}
            style={{ position: 'absolute', top: 0, bottom: 0, left: clipe.dur * pxs - 4, width: 8, cursor: 'ew-resize', zIndex: 1 }} />
          {notas.map(n => {
            const i = linhaDe(n.midi)
            const s = sel.has(n.id)
            return (
              <div key={n.id} onPointerDown={e => downNota(e, n, false)} onDoubleClick={() => { editar(ns => apagar(ns, new Set([n.id]))); setSel(new Set()) }}
                role="button" aria-pressed={s} aria-label={`${nomeNota(n.midi)} at ${n.t.toFixed(2)} s, velocity ${Math.round(n.vel * 127)}`}
                style={{
                  position: 'absolute', left: n.t * pxs, top: i * linha + 1, width: Math.max(4, n.dur * pxs - 1), height: linha - 2,
                  background: s ? 'var(--vintage-value)' : 'var(--vintage-accent)', opacity: 0.55 + n.vel * 0.45, borderRadius: 2, cursor: 'grab',
                  boxShadow: s ? '0 0 0 1px var(--vintage-label)' : 'inset 0 -1px 0 rgba(0,0,0,0.35)',
                }}>
                {n.dur * pxs > 30 && linha >= 12 && (
                  <span style={{ position: 'absolute', left: 3, top: 0, font: `600 ${Math.min(10, linha - 5)}px/${linha - 2}px var(--font-vintage-mono, monospace)`, color: 'var(--vintage-surface-1)', pointerEvents: 'none' }}>{nomeNota(n.midi)}</span>
                )}
                <div onPointerDown={e => downNota(e, n, true)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }} />
              </div>
            )
          })}
          {laco && (
            <div aria-hidden style={{
              position: 'absolute', pointerEvents: 'none', border: '1px solid var(--vintage-value)', background: 'color-mix(in srgb, var(--vintage-value) 12%, transparent)',
              left: Math.min(laco.t0, laco.t1) * pxs, width: Math.abs(laco.t1 - laco.t0) * pxs,
              top: Math.min(laco.i0, laco.i1) * linha, height: (Math.abs(laco.i1 - laco.i0) + 1) * linha,
            }} />
          )}
        </div>
        <div ref={agulha} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'var(--vintage-value)', pointerEvents: 'none', zIndex: 1 }} />
      </div>
      {/* velocity */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 3, display: 'flex', width: TECLADO + W, height: VEL }}>
        <div style={{ ...canto, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, font: '500 9px/1 var(--font-vintage-mono, monospace)', letterSpacing: '0.12em', color: 'var(--vintage-text-muted)', borderTop: '1px solid var(--vintage-border)' }}>VEL</div>
        <div aria-label="velocity lane" onPointerDown={downVel}
          style={{ position: 'relative', width: W, background: 'var(--vintage-surface-2)', borderTop: '1px solid var(--vintage-border)', cursor: 'ns-resize', touchAction: 'none' }}>
          {notas.map(n => {
            const h = 4 + n.vel * (VEL - 8)
            const s = sel.has(n.id)
            return (
              <div key={n.id} aria-hidden style={{ position: 'absolute', left: n.t * pxs, bottom: 0, width: 3, height: h, background: s ? 'var(--vintage-value)' : 'var(--vintage-accent)', pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: -2, left: -2, width: 7, height: 3, background: 'inherit' }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
