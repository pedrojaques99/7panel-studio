/**
 * A janela de arranjo: cabeçalho de trilha à esquerda (M S R, volume com medidor, pan),
 * clipes na linha do tempo à direita, régua em cima e a agulha atravessando tudo.
 *
 * Edição é direto no clipe, sem modal (PLANO-final.md §6):
 * - arrastar o corpo move (inclusive pra outra trilha do mesmo tipo); ⌥ arrastar duplica
 * - arrastar a borda corta; arrastar o quadradinho do canto de cima faz o fade
 * - duplo clique numa trilha de melodia vazia cria um clipe de 4 compassos
 *
 * A agulha e os medidores andam no rAF por ref, nunca por setState: um re-render por
 * quadro com oito trilhas faria o áudio perder o horário (mesma regra da /musica).
 */
import { useEffect, useRef, useState } from 'react'
import { Piano, Plus, SlidersHorizontal, Waves } from 'lucide-react'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SeletorSample } from '../era6/FaixaCamada'
import { FAIXA, notaDoBanco } from '../era6/modelo'
import type { ItemBanco } from '../era6/motor'
import { estilo } from '../era6/estilo'
import {
  aparar, audivel, AUTO_MAX, AUTO_MIN, compassoS, batidaS, duplicarClipe, encaixar, moverClipe, mudarClipe, mudarPonto, mudarTrilha, nomeClipe, novoId, INSTRUMENTOS,
  type Clipe, type Instrumento, type Ponto, type Projeto, type Trilha,
} from './modelo'
import { idsDe, moverClipes } from './clipes'
import { picosDe, type MotorFinal } from './motor'
import { Onda } from './Onda'
import { MIME_ITEM, type ItemBiblioteca } from './Biblioteca'

export const ALTURA = 112
export const CABECA = 232
export const REGUA_H = 28
const ALTO_CLIPE = ALTURA - 7

/** `clipe` é o principal (o que o editor de baixo abre); `grupo`, os outros do ⇧ clique. */
export type Selecao = { trilha: string | null; clipe: string | null; grupo?: string[] }
export type Arrasto = { comecar: () => Projeto; previa: (p: Projeto) => void; fim: (base: Projeto) => void }

const COR = {
  audio: { fundo: 'color-mix(in srgb, var(--vintage-meter-green) 16%, var(--vintage-surface-2))', borda: 'color-mix(in srgb, var(--vintage-meter-green) 55%, transparent)', onda: 'color-mix(in srgb, var(--vintage-meter-green) 80%, white)' },
  melodia: { fundo: 'color-mix(in srgb, var(--vintage-accent) 18%, var(--vintage-surface-2))', borda: 'color-mix(in srgb, var(--vintage-accent) 60%, transparent)', onda: 'var(--vintage-accent)' },
}

type Modo = 'mover' | 'esq' | 'dir' | 'fadeIn' | 'fadeOut'

export function Arranjo({ projeto, banco, sel, px, grade, motor, laco, arrasto, verAuto, onZoom, onSel, onMudar, onSoltar, onNovaTrilha, onSeek, onCriarClipe, onAbrirEditor, onLaco }: {
  projeto: Projeto; sel: Selecao; px: number; grade: number; motor: MotorFinal
  banco: ItemBanco[]        // o banco de samples da era6, pro seletor no cabeçalho
  verAuto: boolean
  onZoom: (px: number) => void
  laco: { ligado: boolean; de: number; ate: number }
  arrasto: Arrasto
  onSel: (s: Selecao) => void
  onMudar: (p: Projeto) => void
  onSoltar: (item: ItemBiblioteca, trilhaId: string | null, t: number) => void
  onNovaTrilha: (tipo: Trilha['tipo']) => void
  onSeek: (t: number) => void
  onCriarClipe: (trilhaId: string, t: number) => void
  onAbrirEditor: () => void
  onLaco?: (de: number, ate: number) => void
}) {
  const rolagem = useRef<HTMLDivElement>(null)
  const agulha = useRef<HTMLDivElement>(null)
  const medidores = useRef(new Map<string, HTMLDivElement>())
  const pistas = useRef<HTMLDivElement>(null)
  const [alvoSoltar, setAlvoSoltar] = useState<string | null>(null)
  const ancora = useRef<{ t: number; x: number } | null>(null)

  // ⌘/Ctrl + roda (a pinça do trackpad chega assim) dá zoom ancorado no ponteiro
  const pxRef = useRef(px)
  useEffect(() => {
    pxRef.current = px
    const r = rolagem.current
    if (r && ancora.current) {
      r.scrollLeft = Math.max(0, ancora.current.t * px - ancora.current.x)
      ancora.current = null
    }
  }, [px])
  useEffect(() => {
    const r = rolagem.current
    if (!r) return
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const x = e.clientX - r.getBoundingClientRect().left - CABECA
      const t = (x + r.scrollLeft) / pxRef.current
      ancora.current = { t, x }
      onZoom(Math.max(2, Math.min(400, pxRef.current * Math.exp(-e.deltaY * 0.01))))
    }
    r.addEventListener('wheel', roda, { passive: false })
    return () => r.removeEventListener('wheel', roda)
  }, [onZoom])

  // quem não toca (mudo, ou fora do solo) aparece apagado: solo esquecido numa trilha vazia cala a música
  const ouve = audivel(projeto.trilhas)
  const fim = Math.max(...projeto.trilhas.flatMap(t => t.clipes.map(c => c.inicio + c.dur)), 0)
  const larguraS = Math.max(240, fim + 60)
  const W = larguraS * px
  const bar = compassoS(projeto)

  // agulha + medidores + seguir a agulha, tudo no rAF
  useEffect(() => {
    let id = 0
    const passo = () => {
      const s = motor.segundos
      if (agulha.current) agulha.current.style.transform = `translateX(${CABECA + s * px}px)`
      for (const [tid, el] of medidores.current) {
        const db = motor.nivel(tid)
        const f = Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 60) / 66)) : 0
        el.style.transform = `scaleX(${f})`
      }
      const r = rolagem.current
      if (r && motor.tocando) {
        const x = s * px
        const visivel = r.clientWidth - CABECA
        if (x > r.scrollLeft + visivel * 0.85 || x < r.scrollLeft) r.scrollLeft = Math.max(0, x - visivel * 0.15)
      }
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [motor, px])

  const tempoDe = (clientX: number) => {
    const r = rolagem.current!
    const box = r.getBoundingClientRect()
    return Math.max(0, (clientX - box.left - CABECA + r.scrollLeft) / px)
  }
  const trilhaDe = (clientY: number): Trilha | undefined => {
    const box = pistas.current?.getBoundingClientRect()
    if (!box) return undefined
    return projeto.trilhas[Math.floor((clientY - box.top) / ALTURA)]
  }

  /* ── arrasto de clipe ── */
  const comecarArrasto = (e: React.PointerEvent, clipe: Clipe, trilha: Trilha, modo: Modo) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const ids = idsDe(sel)
    if (modo === 'mover' && e.shiftKey) {
      // ⇧ clique: entra ou sai do grupo; o principal saindo passa a vez pro próximo
      if (!ids.length) { onSel({ trilha: trilha.id, clipe: clipe.id }); return }
      const resto = ids.includes(clipe.id) ? ids.filter(x => x !== clipe.id) : [...ids, clipe.id]
      onSel({ trilha: sel.trilha, clipe: resto[0] ?? null, grupo: resto.slice(1) })
      return
    }
    // arrastar um clipe do grupo leva o grupo inteiro (⌥ duplica só o clipe, como antes)
    const emGrupo = modo === 'mover' && !e.altKey && ids.length > 1 && ids.includes(clipe.id)
    const original = arrasto.comecar()
    let base = original
    let id = clipe.id
    if (modo === 'mover' && e.altKey) {
      const d = duplicarClipe(base, clipe.id, clipe.inicio)
      base = d.projeto
      id = d.id
      arrasto.previa(base)
    }
    if (emGrupo) onSel({ trilha: trilha.id, clipe: clipe.id, grupo: ids.filter(x => x !== clipe.id) })
    else onSel({ trilha: trilha.id, clipe: id })
    const x0 = e.clientX
    const y0 = e.clientY
    const t0 = tempoDe(e.clientX)
    const durFonte = clipe.arquivo ? motor.buffer(clipe.arquivo)?.duration : undefined
    let mexeu = false
    const mover = (ev: PointerEvent) => {
      // clique parado não é arrasto: 3 px de folga antes de mexer
      if (!mexeu && Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return
      mexeu = true
      const dt = tempoDe(ev.clientX) - t0
      let p = base
      if (emGrupo) {
        const novo = ev.metaKey || ev.ctrlKey ? clipe.inicio + dt : encaixar(clipe.inicio + dt, grade)
        p = moverClipes(base, ids, novo - clipe.inicio)
      } else if (modo === 'mover') {
        const destino = trilhaDe(ev.clientY)
        // ⌘ segurado solta da grade
        p = moverClipe(base, id, ev.metaKey || ev.ctrlKey ? clipe.inicio + dt : encaixar(clipe.inicio + dt, grade), destino?.id)
      } else if (modo === 'esq' || modo === 'dir') {
        const borda = (modo === 'esq' ? clipe.inicio : clipe.inicio + clipe.dur) + dt
        const t = ev.metaKey || ev.ctrlKey ? borda : encaixar(borda, grade)
        p = mudarClipe(base, id, c => aparar(c, modo, t, durFonte))
      } else {
        const meia = clipe.dur / 2
        p = mudarClipe(base, id, c => modo === 'fadeIn'
          ? { ...c, fadeIn: Math.max(0, Math.min(meia, (c.fadeIn ?? 0) + dt)) }
          : { ...c, fadeOut: Math.max(0, Math.min(meia, (c.fadeOut ?? 0) - dt)) })
      }
      arrasto.previa(p)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (mexeu || base !== original) arrasto.fim(original)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /* ── régua: clicar/arrastar move a agulha ── */
  const reguaDown = (e: React.PointerEvent) => {
    if (e.shiftKey && onLaco) {
      // ⇧ arrastar na régua marca o ciclo (na batida; ⌥ solta)
      const passo = e.altKey ? 0 : batidaS(projeto.bpm)
      const a = encaixar(tempoDe(e.clientX), passo)
      const mover = (ev: PointerEvent) => {
        const b = encaixar(tempoDe(ev.clientX), passo)
        if (Math.abs(b - a) > 0.01) onLaco(Math.min(a, b), Math.max(a, b))
      }
      const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
      window.addEventListener('pointermove', mover)
      window.addEventListener('pointerup', soltar)
      return
    }
    const ir = (x: number) => onSeek(encaixar(tempoDe(x), e.altKey ? 0 : batidaS(projeto.bpm)))
    ir(e.clientX)
    const mover = (ev: PointerEvent) => ir(ev.clientX)
    const soltar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const soltarItem = (e: React.DragEvent, trilhaId: string | null) => {
    e.preventDefault()
    setAlvoSoltar(null)
    const raw = e.dataTransfer.getData(MIME_ITEM)
    if (!raw) return
    onSoltar(JSON.parse(raw) as ItemBiblioteca, trilhaId, encaixar(tempoDe(e.clientX), grade))
  }

  const fundoGrade = `repeating-linear-gradient(90deg, var(--vintage-border) 0 1px, transparent 1px ${bar * px}px)` +
    (batidaS(projeto.bpm) * px > 14 ? `, repeating-linear-gradient(90deg, color-mix(in srgb, var(--vintage-border) 45%, transparent) 0 1px, transparent 1px ${batidaS(projeto.bpm) * px}px)` : '')

  const nBarras = Math.ceil(larguraS / bar)
  const passoRotulo = Math.max(1, Math.ceil(48 / (bar * px)))

  return (
    <div ref={rolagem} className="final-rolagem" style={{ overflow: 'auto', minHeight: 0, position: 'relative', background: 'var(--vintage-surface-1)' }}
      onDragOver={e => { if (e.dataTransfer.types.includes(MIME_ITEM)) e.preventDefault() }}>
      <div style={{ width: CABECA + W, position: 'relative', minHeight: '100%' }}>
        {/* régua */}
        <div style={{ position: 'sticky', top: 0, zIndex: 4, display: 'flex', height: REGUA_H, background: 'var(--vintage-surface-1)', borderBottom: '1px solid var(--vintage-border)' }}>
          <div style={{ position: 'sticky', left: 0, zIndex: 5, width: CABECA, flex: 'none', background: 'var(--vintage-surface-1)', borderRight: '1px solid var(--vintage-border)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}>
            <button type="button" onClick={() => onNovaTrilha('audio')} style={estilo.botaoIcone()} title="new audio track" aria-label="new audio track"><Plus size={12} /><Waves size={12} /></button>
            <button type="button" onClick={() => onNovaTrilha('melodia')} style={estilo.botaoIcone()} title="new melody track" aria-label="new melody track"><Plus size={12} /><Piano size={12} /></button>
          </div>
          <div onPointerDown={reguaDown} role="slider" aria-label="playhead position" aria-valuenow={0} tabIndex={-1}
            style={{ position: 'relative', width: W, cursor: 'text', touchAction: 'none' }}>
            {laco.ligado && (
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: laco.de * px, width: (laco.ate - laco.de) * px, background: 'color-mix(in srgb, var(--vintage-value) 22%, transparent)', borderLeft: '1px solid var(--vintage-value)', borderRight: '1px solid var(--vintage-value)' }} />
            )}
            {Array.from({ length: nBarras }, (_, i) => i % passoRotulo === 0 && (
              <span key={i} style={{ position: 'absolute', left: i * bar * px, bottom: 4, paddingLeft: 4, borderLeft: '1px solid var(--vintage-text-dim)', height: 12, lineHeight: '12px', color: 'var(--vintage-text-muted)', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
            ))}
          </div>
        </div>

        {/* trilhas */}
        <div ref={pistas}>
          {projeto.trilhas.map(t => (
            <div key={t.id} className={ouve.has(t.id) ? undefined : 'final-calada'} style={{ display: 'flex', height: ALTURA, borderBottom: '1px solid var(--vintage-border)' }}>
              <Cabeca trilha={t} focada={sel.trilha === t.id} banco={banco}
                onAmostraAudio={it => onSoltar({ grupo: 'era6 banco', nome: it.id.split('/')[1], caminho: it.caminho, tipo: 'audio', dur_s: it.dur_s, mb: 0 }, t.id, encaixar(motor.segundos, grade))}
                medidor={el => { if (el) medidores.current.set(t.id, el); else medidores.current.delete(t.id) }}
                onFocar={() => onSel({ trilha: t.id, clipe: null })}
                onMudar={f => onMudar(mudarTrilha(projeto, t.id, f))} />
              <div className="final-pista"
                onPointerDown={e => { if (e.target === e.currentTarget) onSel({ trilha: t.id, clipe: null }) }}
                onDoubleClick={e => { if (e.target === e.currentTarget && t.tipo === 'melodia') onCriarClipe(t.id, encaixar(tempoDe(e.clientX), bar)) }}
                onDragOver={e => { if (e.dataTransfer.types.includes(MIME_ITEM)) { e.preventDefault(); setAlvoSoltar(t.id) } }}
                onDragLeave={() => setAlvoSoltar(a => (a === t.id ? null : a))}
                onDrop={e => soltarItem(e, t.id)}
                style={{
                  position: 'relative', width: W, background: fundoGrade,
                  backgroundColor: sel.trilha === t.id ? 'var(--vintage-surface-2)' : undefined,
                  outline: alvoSoltar === t.id ? '1px dashed var(--vintage-value)' : undefined, outlineOffset: -2,
                }}>
                {t.clipes.map(c => (
                  <ClipeVista key={c.id} clipe={c} trilha={t} px={px} selecionado={sel.clipe === c.id || !!sel.grupo?.includes(c.id)} motor={motor}
                    onDown={(e, m) => comecarArrasto(e, c, t, m)} onAbrir={onAbrirEditor} />
                ))}
                {(verAuto || !!t.automacao?.length) && (
                  <Automacao trilha={t} px={px} largura={W} editavel={verAuto} grade={grade} arrasto={arrasto} />
                )}
              </div>
            </div>
          ))}
          {/* área de soltar: item solto aqui vira trilha nova */}
          <div onDragOver={e => { if (e.dataTransfer.types.includes(MIME_ITEM)) { e.preventDefault(); setAlvoSoltar('nova') } }}
            onDragLeave={() => setAlvoSoltar(null)} onDrop={e => soltarItem(e, null)}
            style={{ display: 'flex', minHeight: projeto.trilhas.length ? ALTURA : 320 }}>
            <div style={{ position: 'sticky', left: 0, width: CABECA, flex: 'none', background: 'var(--vintage-surface-1)', borderRight: '1px solid var(--vintage-border)' }} />
            <div style={{
              position: 'sticky', left: CABECA, width: `calc(100vw - ${CABECA + 260}px)`, display: 'grid', placeItems: 'center',
              color: alvoSoltar === 'nova' ? 'var(--vintage-value)' : 'var(--vintage-text-dim)',
              border: alvoSoltar === 'nova' ? '1px dashed var(--vintage-value)' : '1px dashed transparent',
            }}>
              {projeto.trilhas.length ? 'drop here for a new track' : (
                <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
                  <span style={{ color: 'var(--vintage-label)', font: '600 13px/1.3 var(--font-vintage-display, sans-serif)', letterSpacing: '0.1em' }}>EMPTY SESSION</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => onNovaTrilha('melodia')} style={estilo.botao(true)}><Piano size={12} /> melody track</button>
                    <button type="button" onClick={() => onNovaTrilha('audio')} style={estilo.botao(false)}><Waves size={12} /> audio track</button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* a agulha */}
        <div ref={agulha} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'var(--vintage-value)', zIndex: 3, pointerEvents: 'none', boxShadow: '0 0 6px var(--vintage-value)' }} />
      </div>
    </div>
  )
}

/* ── cabeçalho de trilha ── */

function Cabeca({ trilha: t, focada, banco, medidor, onFocar, onMudar, onAmostraAudio }: {
  trilha: Trilha; focada: boolean; banco: ItemBanco[]; medidor: (el: HTMLDivElement | null) => void
  onFocar: () => void; onMudar: (f: (t: Trilha) => Trilha) => void
  onAmostraAudio: (it: ItemBanco) => void
}) {
  const [editando, setEditando] = useState(false)
  const chave = (ativo: boolean, cor: string): React.CSSProperties => ({
    width: 22, height: 20, padding: 0, font: '600 10px/1 var(--font-vintage-mono, monospace)', cursor: 'pointer',
    background: ativo ? cor : 'var(--vintage-surface-3)', color: ativo ? 'var(--vintage-surface-1)' : 'var(--vintage-text-muted)',
    border: '1px solid var(--vintage-border)',
  })
  return (
    <div onPointerDown={onFocar} style={{
      position: 'sticky', left: 0, zIndex: 2, width: CABECA, flex: 'none', display: 'grid', gridTemplateColumns: '1fr auto', gap: 4,
      padding: '8px 6px 8px 10px', borderRight: '1px solid var(--vintage-border)',
      background: focada ? 'var(--vintage-surface-3)' : 'var(--vintage-surface-2)',
      borderLeft: `3px solid ${t.tipo === 'audio' ? 'var(--vintage-meter-green)' : 'var(--vintage-accent)'}`,
    }}>
      <div style={{ display: 'grid', gap: 6, alignContent: 'start', minWidth: 0 }}>
        {editando ? (
          <input autoFocus defaultValue={t.nome} aria-label="track name"
            onBlur={e => { onMudar(x => ({ ...x, nome: e.target.value.trim() || x.nome })); setEditando(false) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
            style={{ background: 'var(--vintage-surface-1)', border: '1px solid var(--vintage-value)', color: 'var(--vintage-label)', font: 'inherit', padding: '1px 4px' }} />
        ) : (
          <span onDoubleClick={() => setEditando(true)}
            style={{ color: focada ? 'var(--vintage-value)' : 'var(--vintage-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{t.nome}</span>
        )}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <button type="button" aria-pressed={t.mudo} aria-label="mute" title="mute (M)" onClick={() => onMudar(x => ({ ...x, mudo: !x.mudo }))} style={chave(t.mudo, 'var(--vintage-meter-yellow)')}>M</button>
          <button type="button" aria-pressed={t.solo} aria-label="solo" title="solo (S)" onClick={() => onMudar(x => ({ ...x, solo: !x.solo }))} style={chave(t.solo, 'var(--vintage-value)')}>S</button>
          <button type="button" aria-pressed={t.armada} aria-label="record arm" title={t.tipo === 'audio' ? 'record arm: microphone (R)' : 'record arm: keys and MIDI (R)'} onClick={() => onMudar(x => ({ ...x, armada: !x.armada }))} style={chave(t.armada, 'var(--vintage-meter-red)')}>R</button>
          <Fx trilha={t} onMudar={onMudar} />
          {t.tipo === 'melodia' && (
            <select value={t.instrumento ?? 'pad'} aria-label="instrument" onChange={e => onMudar(x => ({ ...x, instrumento: e.target.value as Instrumento }))}
              style={{ marginLeft: 2, minWidth: 0, flex: 1, background: 'var(--vintage-surface-1)', color: 'var(--vintage-label)', border: '1px solid var(--vintage-border)', font: 'inherit', fontSize: 10, height: 20 }}>
              {INSTRUMENTOS.map(i => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
            </select>
          )}
        </div>
        {/* melodia: o sample vira o instrumento. Áudio: o sample entra como clipe na agulha */}
        {t.tipo === 'melodia' ? (
          <SeletorSample itens={banco} vazio="sample"
            atual={t.instrumento === 'sample' ? banco.find(i => i.caminho === t.amostra)?.id ?? null : null}
            onEscolher={id => {
              const it = banco.find(i => i.id === id)
              onMudar(x => (it
                ? { ...x, instrumento: 'sample', amostra: it.caminho, amostraRaiz: notaDoBanco(it.nota) ?? 0 }
                : { ...x, instrumento: 'pad', amostra: undefined, amostraRaiz: undefined }))
            }} />
        ) : (
          <SeletorSample itens={banco} atual={null} vazio="add sample"
            onEscolher={id => { const it = banco.find(i => i.id === id); if (it) onAmostraAudio(it) }} />
        )}
        {/* volume com o medidor por trás, como o fader da trilha no GarageBand */}
        <div style={{ position: 'relative', height: 14, display: 'grid', alignItems: 'center', opacity: t.automacao?.length ? 0.45 : 1 }}
          title={t.automacao?.length ? 'volume follows the automation curve' : `volume ${t.volume.toFixed(1)} dB`}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 5, height: 4, background: 'var(--vintage-surface-1)', overflow: 'hidden' }}>
            <div ref={medidor} style={{ height: '100%', background: 'linear-gradient(90deg, var(--vintage-meter-green) 70%, var(--vintage-meter-yellow) 88%, var(--vintage-meter-red))', transformOrigin: 'left', transform: 'scaleX(0)' }} />
          </div>
          <input type="range" min={-60} max={6} step={0.5} value={t.volume} aria-label="volume" disabled={!!t.automacao?.length}
            onChange={e => onMudar(x => ({ ...x, volume: Number(e.target.value) }))}
            onDoubleClick={() => onMudar(x => ({ ...x, volume: 0 }))}
            className="final-fader" />
        </div>
      </div>
      <VintageKnob size={44} min={-1} max={1} value={t.pan} label="pan"
        fmt={v => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
        onChange={v => onMudar(x => ({ ...x, pan: Math.abs(v) < 0.03 ? 0 : v }))} />
    </div>
  )
}

/* ── FX da trilha: os do canal da era6 (cutoff da camada, space do master) ── */

const SALA_FMT = (v: number) => `${Math.round(v * 100)}%`

function Fx({ trilha: t, onMudar }: { trilha: Trilha; onMudar: (f: (t: Trilha) => Trilha) => void }) {
  const corte = t.corte ?? FAIXA.lp.max
  const sala = t.sala ?? 0
  const ativo = corte < FAIXA.lp.max || sala > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="track effects" title="effects" style={{ ...estilo.botaoIcone(ativo), height: 20, padding: '0 4px' }}>
          <SlidersHorizontal size={13} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-vintage-border bg-vintage-surface-2 p-3 text-vintage-label">
        <div style={{ display: 'flex', gap: 10 }}>
          <VintageKnob size={52} label={FAIXA.lp.rotulo} min={FAIXA.lp.min} max={FAIXA.lp.max} log value={corte}
            fmt={v => (v >= FAIXA.lp.max ? 'open' : FAIXA.lp.fmt(v))}
            onChange={v => onMudar(x => ({ ...x, corte: v >= FAIXA.lp.max * 0.98 ? undefined : v }))} />
          <VintageKnob size={52} label="space" min={0} max={1} value={sala} fmt={SALA_FMT}
            onChange={v => onMudar(x => ({ ...x, sala: v < 0.01 ? undefined : v }))} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

/* ── clipe ── */

function ClipeVista({ clipe: c, trilha, px, selecionado, motor, onDown, onAbrir }: {
  clipe: Clipe; trilha: Trilha; px: number; selecionado: boolean; motor: MotorFinal
  onDown: (e: React.PointerEvent, m: Modo) => void; onAbrir: () => void
}) {
  const cor = COR[trilha.tipo]
  const w = Math.max(4, c.dur * px)
  const buf = c.arquivo ? motor.buffer(c.arquivo) : undefined
  const notas = c.notas ?? []
  const lo = Math.min(...notas.map(n => n.midi), 60) - 1
  const hi = Math.max(...notas.map(n => n.midi), 72) + 1
  const corpoH = ALTURA - 22
  const nome = nomeClipe(c, trilha.nome)
  const fi = (c.fadeIn ?? 0) * px
  const fo = (c.fadeOut ?? 0) * px
  return (
    <div className="final-clipe" onPointerDown={e => onDown(e, 'mover')} onDoubleClick={onAbrir} title={nome}
      style={{
        position: 'absolute', left: c.inicio * px, top: 3, width: w, height: ALTO_CLIPE, overflow: 'hidden',
        background: cor.fundo, border: `1px solid ${selecionado ? 'var(--vintage-value)' : cor.borda}`,
        boxShadow: selecionado ? '0 0 0 1px var(--vintage-value)' : undefined, borderRadius: 3, cursor: 'grab', touchAction: 'none',
      }}>
      <div style={{ height: 16, padding: '0 6px', fontSize: 10, lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selecionado ? 'var(--vintage-value)' : 'var(--vintage-label)', background: 'color-mix(in srgb, black 25%, transparent)' }}>{nome}</div>
      {buf && <Onda picos={picosDe(buf)} offset={c.offset ?? 0} dur={c.dur} largura={w} altura={corpoH} cor={cor.onda} />}
      {!c.arquivo && notas.map(n => (
        <div key={n.id} style={{
          position: 'absolute', left: n.t * px, width: Math.max(2, n.dur * px - 1), height: Math.max(2, corpoH / (hi - lo) - 1),
          top: 16 + ((hi - n.midi) / (hi - lo)) * (corpoH - 4), background: cor.onda, opacity: 0.4 + n.vel * 0.6, borderRadius: 1,
        }} />
      ))}
      {/* curvas de fade */}
      {fi > 0 && <svg aria-hidden width={fi} height={ALTO_CLIPE} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}><path d={`M0 ${ALTO_CLIPE} Q ${fi * 0.3} 0 ${fi} 0 L0 0 Z`} fill="rgba(0,0,0,0.35)" /></svg>}
      {fo > 0 && <svg aria-hidden width={fo} height={ALTO_CLIPE} style={{ position: 'absolute', right: 0, top: 0, pointerEvents: 'none' }}><path d={`M0 0 Q ${fo * 0.7} 0 ${fo} ${ALTO_CLIPE} L${fo} 0 Z`} fill="rgba(0,0,0,0.35)" /></svg>}
      {/* alças */}
      <div className="final-borda" onPointerDown={e => onDown(e, 'esq')} style={{ position: 'absolute', left: 0, top: 16, bottom: 0, width: 7, cursor: 'ew-resize' }} />
      <div className="final-borda" onPointerDown={e => onDown(e, 'dir')} style={{ position: 'absolute', right: 0, top: 16, bottom: 0, width: 7, cursor: 'ew-resize' }} />
      {c.arquivo && <>
        <div className="final-fade" aria-label="fade in" onPointerDown={e => onDown(e, 'fadeIn')} style={{ position: 'absolute', left: Math.max(0, fi - 4), top: 0, width: 8, height: 8, cursor: 'ew-resize' }} />
        <div className="final-fade" aria-label="fade out" onPointerDown={e => onDown(e, 'fadeOut')} style={{ position: 'absolute', right: Math.max(0, fo - 4), top: 0, width: 8, height: 8, cursor: 'ew-resize' }} />
      </>}
    </div>
  )
}

/* ── automação de volume, por cima dos clipes (como no Logic) ── */

const yDe = (db: number, h: number) => 6 + (1 - (db - AUTO_MIN) / (AUTO_MAX - AUTO_MIN)) * (h - 12)
const dbDe = (y: number, h: number) => AUTO_MIN + (1 - (y - 6) / (h - 12)) * (AUTO_MAX - AUTO_MIN)

function Automacao({ trilha: t, px, largura, editavel, grade, arrasto }: {
  trilha: Trilha; px: number; largura: number; editavel: boolean; grade: number; arrasto: Arrasto
}) {
  const ref = useRef<SVGSVGElement>(null)
  const H = ALTURA - 1
  const ps = t.automacao ?? []
  const linha = ps.length
    ? [`0,${yDe(ps[0].db, H)}`, ...ps.map(p => `${p.t * px},${yDe(p.db, H)}`), `${largura},${yDe(ps[ps.length - 1].db, H)}`].join(' ')
    : `0,${yDe(t.volume, H)} ${largura},${yDe(t.volume, H)}`

  const local = (e: { clientX: number; clientY: number }) => {
    const b = ref.current!.getBoundingClientRect()
    return { t: (e.clientX - b.left) / px, db: dbDe(e.clientY - b.top, H) }
  }
  const comPonto = (base: Projeto, ponto: Ponto) =>
    ({ ...base, trilhas: base.trilhas.map(x => (x.id === t.id ? mudarPonto(x, ponto) : x)) })

  const arrastar = (e: React.PointerEvent, ponto: Ponto, novo: boolean) => {
    e.stopPropagation()
    e.preventDefault()
    const original = arrasto.comecar()
    const inicial = novo ? comPonto(original, ponto) : original
    if (novo) arrasto.previa(inicial)
    let mexeu = novo
    const mover = (ev: PointerEvent) => {
      mexeu = true
      const l = local(ev)
      const tt = ev.metaKey || ev.ctrlKey ? l.t : encaixar(l.t, grade)
      arrasto.previa(comPonto(inicial, { ...ponto, t: tt, db: Math.round(l.db * 2) / 2 }))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      if (mexeu) arrasto.fim(original)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const apagar = (id: string) => {
    const base = arrasto.comecar()
    arrasto.previa({ ...base, trilhas: base.trilhas.map(x => (x.id === t.id ? { ...x, automacao: (x.automacao ?? []).filter(p => p.id !== id) } : x)) })
    arrasto.fim(base)
  }

  return (
    <svg ref={ref} width={largura} height={H} aria-label={`volume automation ${t.nome}`}
      onPointerDown={e => {
        if (!editavel || e.button !== 0) return
        const l = local(e)
        arrastar(e, { id: novoId('a'), t: encaixar(l.t, grade), db: Math.round(l.db * 2) / 2 }, true)
      }}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: editavel ? 'auto' : 'none', cursor: editavel ? 'crosshair' : undefined, zIndex: 1 }}>
      {editavel && <rect width={largura} height={H} fill="rgba(0,0,0,0.35)" />}
      <polyline points={linha} fill="none" stroke="var(--vintage-value)" strokeWidth={editavel ? 1.5 : 1}
        strokeDasharray={ps.length ? undefined : '4 4'} opacity={editavel ? 1 : 0.55} />
      {editavel && ps.map(p => (
        <circle key={p.id} cx={p.t * px} cy={yDe(p.db, H)} r={4.5} fill="var(--vintage-value)" stroke="var(--vintage-surface-1)"
          style={{ cursor: 'grab' }} onPointerDown={e => arrastar(e, p, false)} onDoubleClick={() => apagar(p.id)}>
          <title>{`${p.db.toFixed(1)} dB`}</title>
        </circle>
      ))}
    </svg>
  )
}
