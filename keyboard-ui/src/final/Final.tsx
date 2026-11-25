/**
 * /final: a mesa de arranjo do Jacão. Plano em `Jacão Ambients/PLANO-final.md`.
 *
 * GarageBand/Logic na forma: acervo à esquerda (era5, era6, .mid), trilhas e clipes no
 * meio, editor do clipe embaixo (piano roll pra melodia, fades e ganho pra áudio).
 * Saída: master com teto em −0,9 dBFS e export WAV 48 kHz em `Jacão Ambients/final/`,
 * renderizado offline pela MESMA montagem que toca ao vivo (`motor.ts`).
 *
 * Atalhos e gestos moram numa folha só (botão ? ou tecla ?), não em tooltip espalhado:
 * a auditoria visant-killer cortou as dicas de uso da tela (ruido-scan/ensina-a-usar).
 * Gravar: R arma a trilha; ● grava o microfone (trilha de áudio) ou as notas (melodia).
 * O medidor do master mede os alvos da era6 enquanto toca (era6/medidor.ts).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Midi } from '@tonejs/midi'
import { Activity, Cable, Circle, CircleHelp, Download, FilePlus2, FolderOpen, Keyboard, Pause, Play, Redo2, Repeat, Scissors, SkipBack, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VintageLed } from '@/components/ui/vintage-led'
import { apiFetch, resolveUrl } from '../lib/api'
import { encodeWav } from '../lib/audio-utils'
import { requestMIDIAccess, listMIDIInputs, createMIDIListener } from '../lib/midi'
import { estilo } from '../era6/estilo'
import { ContadorAtaques, dinamica, medirEspectro, portoes, type Portao } from '../era6/medidor'
import {
  acharClipe, batidaS, compassoBatida, compassoS, desfazer, dividir, duracaoProjeto, empurrar, encaixar,
  ESCALAS, grauParaMidi, historicoDe, LIMITE_HISTORICO, mudarClipe, mudarTrilha, NOMES, nomeArquivo, nomeClipe, novaTrilha, novoId,
  novoProjeto, refazer, relogio, substituir,
  type Clipe, type Historico, type Nota, type Projeto, type Trilha,
} from './modelo'
import { carregarBuffer, MotorFinal, renderizar, CAUDA_S } from './motor'
import type { ItemBanco } from '../era6/motor'
import { NOMES_NOTA } from '../era6/modelo'
import { Biblioteca, type ItemBiblioteca } from './Biblioteca'
import { Arranjo, type Arrasto, type Selecao } from './Arranjo'
import { colarClipes, idsDe, copiarClipes, duplicarClipes, removerClipes } from './clipes'
import { PianoRoll } from './PianoRoll'
import { TrackFx } from './TrackFx'
import { EsticarClipe } from './EsticarClipe'

const GRADES = [
  { id: 'bar', rotulo: 'bar', f: (p: Projeto) => compassoS(p) },
  { id: 'beat', rotulo: '1/4', f: (p: Projeto) => batidaS(p.bpm) },
  { id: '8', rotulo: '1/8', f: (p: Projeto) => batidaS(p.bpm) / 2 },
  { id: '8t', rotulo: '1/8T', f: (p: Projeto) => batidaS(p.bpm) / 3 },
  { id: '16', rotulo: '1/16', f: (p: Projeto) => batidaS(p.bpm) / 4 },
  { id: 'off', rotulo: 'off', f: () => 0 },
] as const
type GradeId = typeof GRADES[number]['id']

const TECLAS_GRAU = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';']
const LIDER_S = 0.03

const CSS_FINAL = `
.final button:focus-visible, .final input:focus-visible, .final select:focus-visible, .final-roll:focus-visible { outline: 1px solid var(--vintage-accent); outline-offset: 2px; }
.final .final-item:hover { background: var(--vintage-surface-2); }
.final .final-calada .final-pista { opacity: 0.35; }
.final .final-calada > div:first-child > div:first-child > span { color: var(--vintage-text-dim); }
.final .final-clipe:active { cursor: grabbing; }
.final .final-borda:hover { background: color-mix(in srgb, var(--vintage-value) 35%, transparent); }
.final .final-fade { background: var(--vintage-label); border-radius: 50%; opacity: 0; transition: opacity var(--dur-press) var(--ease-out); }
.final .final-clipe:hover .final-fade { opacity: 0.9; }
.final .final-fader { -webkit-appearance: none; appearance: none; width: 100%; background: transparent; position: relative; margin: 0; height: 14px; }
.final .final-fader::-webkit-slider-runnable-track { height: 4px; background: transparent; }
.final .final-fader::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 14px; margin-top: -5px; border-radius: 2px; background: linear-gradient(var(--vintage-metal-channel-light), var(--vintage-metal-dark)); border: 1px solid var(--vintage-surface-1); cursor: ew-resize; }
.final .final-fader::-moz-range-thumb { width: 10px; height: 14px; border-radius: 2px; background: var(--vintage-metal-channel-light); border: 1px solid var(--vintage-surface-1); cursor: ew-resize; }
.final .final-rolagem::-webkit-scrollbar, .final .final-roll::-webkit-scrollbar { width: 10px; height: 10px; }
.final .final-rolagem::-webkit-scrollbar-thumb, .final .final-roll::-webkit-scrollbar-thumb { background: var(--vintage-surface-3); }
.final select { background: var(--vintage-surface-1); color: var(--vintage-label); border: 1px solid var(--vintage-border); font: inherit; height: 26px; padding: 0 4px; }
`

const campoNum: React.CSSProperties = {
  width: 52, height: 26, background: 'var(--vintage-surface-1)', color: 'var(--vintage-value)', border: '1px solid var(--vintage-border)',
  font: '600 12px/1 var(--font-vintage-mono, monospace)', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
}

function digitando(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function Final() {
  const motor = useMemo(() => new MotorFinal(), [])
  const [h, setH] = useState<Historico>(() => historicoDe(novoProjeto('primeira')))
  const hRef = useRef(h)
  useLayoutEffect(() => { hRef.current = h }, [h])
  const projeto = h.presente

  const [sel, setSel] = useState<Selecao>({ trilha: null, clipe: null })
  const [px, setPx] = useState(24)
  const [gradeId, setGradeId] = useState<GradeId>('beat')
  // o roll tem grade própria (como Logic/Ableton): nota pede mais fino que clipe
  const [gradeRollId, setGradeRollId] = useState<GradeId>('16')
  const [passoAPasso, setPassoAPasso] = useState(false)
  const [tocando, setTocando] = useState(false)
  const [laco, setLaco] = useState(false)
  // ciclo marcado na régua (⇧ arrastar); sem ele, o ciclo é o clipe selecionado ou a peça
  const [lacoManual, setLacoManual] = useState<{ de: number; ate: number } | null>(null)
  const [teclado, setTeclado] = useState(false)
  const [oitava, setOitava] = useState(4)
  const [midiNome, setMidiNome] = useState<string | null>(null)
  const [soEscala, setSoEscala] = useState(true)
  const [zoomRoll, setZoomRoll] = useState(56)
  // tela baixa: o editor não come o arranjo (38% da altura, no máximo 300 px)
  const [editorH, setEditorH] = useState(() => Math.round(Math.min(300, window.innerHeight * 0.38)))
  const [verAuto, setVerAuto] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [medidas, setMedidas] = useState<Portao[]>([])
  const [gravando, setGravando] = useState<{ t0: number; trilha: string; parar: () => Promise<Blob> } | null>(null)
  const gravandoRef = useRef(gravando)
  useLayoutEffect(() => { gravandoRef.current = gravando }, [gravando])
  const [itens, setItens] = useState<ItemBiblioteca[]>([])
  const [banco, setBanco] = useState<ItemBanco[]>([])
  const [erroBib, setErroBib] = useState<string | null>(null)
  const [projetos, setProjetos] = useState<{ id: string; nome: string; trilhas: number; modificado: string }[]>([])
  const [salvo, setSalvo] = useState<'ok' | 'salvando' | 'erro' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [ultimoExport, setUltimoExport] = useState<{ nome: string; url: string } | null>(null)
  const relogioRef = useRef<HTMLSpanElement>(null)
  const compassoRef = useRef<HTMLSpanElement>(null)
  const medidorMaster = useRef<HTMLDivElement>(null)
  const carregado = useRef(false)
  // abrir uma sessão não é mexer nela: só salva o que mudou desde o último save/abertura
  const ultimoSalvo = useRef('')

  const grade = GRADES.find(g => g.id === gradeId)!.f(projeto)
  const gradeRoll = GRADES.find(g => g.id === gradeRollId)!.f(projeto)

  /* ── edição ── */
  const mudar = useCallback((p: Projeto) => setH(x => empurrar(x, p)), [])
  const arrasto: Arrasto = useMemo(() => ({
    comecar: () => hRef.current.presente,
    previa: p => setH(x => substituir(x, p)),
    fim: original => setH(x => (x.presente === original ? x : { passado: [...x.passado, original].slice(-LIMITE_HISTORICO), presente: x.presente, futuro: [] })),
  }), [])

  /* ── motor segue o projeto ── */
  useEffect(() => {
    motor.sincronizar(projeto).catch(e => setStatus(String(e)))
  }, [motor, projeto])
  useEffect(() => () => motor.dispose(), [motor])

  /* ── ciclo: o clipe selecionado, ou a peça inteira ── */
  const faixaLaco = useMemo(() => {
    if (lacoManual) return lacoManual
    const a = sel.clipe ? acharClipe(projeto, sel.clipe) : null
    return a ? { de: a.clipe.inicio, ate: a.clipe.inicio + a.clipe.dur } : { de: 0, ate: Math.max(compassoS(projeto), duracaoProjeto(projeto)) }
  }, [projeto, sel.clipe, lacoManual])
  useEffect(() => { motor.laco(laco, faixaLaco.de, faixaLaco.ate) }, [motor, laco, faixaLaco])

  /* ── relógio e medidor do master no rAF ── */
  useEffect(() => {
    let id = 0
    const passo = () => {
      const s = motor.segundos
      if (relogioRef.current) relogioRef.current.textContent = relogio(s)
      if (compassoRef.current) compassoRef.current.textContent = compassoBatida(s, hRef.current.presente)
      if (medidorMaster.current) {
        const db = motor.nivel('master')
        medidorMaster.current.style.transform = `scaleX(${Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 60) / 60)) : 0})`
      }
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [motor])

  /* ── acervo e projetos ── */
  useEffect(() => {
    // banco da era6 (706 trechos etiquetados): alimenta o seletor de sample das trilhas
    apiFetch('/api/era6/banco').then(r => r.json()).then(d => setBanco(d.itens ?? [])).catch(() => {})
    apiFetch('/api/final/biblioteca').then(r => r.json()).then(d => setItens(d.itens ?? []))
      .catch(() => setErroBib('backend offline: start the 7panel backend (port 5000)'))
    apiFetch('/api/final/projetos').then(r => r.json()).then(async d => {
      const lista = d.projetos ?? []
      setProjetos(lista)
      if (lista[0]) {
        const p = await apiFetch(`/api/final/projetos/${encodeURIComponent(lista[0].id)}`).then(r => r.json())
        if (p?.trilhas) { ultimoSalvo.current = JSON.stringify(p); setH(historicoDe(p)) }
      }
    }).catch(() => { /* sem backend: segue com o projeto em branco */ }).finally(() => { carregado.current = true })
  }, [])

  const salvar = useCallback(async (p: Projeto, forcar = false) => {
    const json = JSON.stringify(p)
    if (!forcar && json === ultimoSalvo.current) return
    ultimoSalvo.current = json
    setSalvo('salvando')
    try {
      const r = await apiFetch('/api/final/projetos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
      if (!r.ok) throw new Error(String(r.status))
      setSalvo('ok')
      setProjetos(ps => [{ id: p.id, nome: p.nome, trilhas: p.trilhas.length, modificado: new Date().toISOString() }, ...ps.filter(x => x.id !== p.id)])
    } catch { setSalvo('erro') }
  }, [])
  // autosave: 1 s depois da última mexida
  useEffect(() => {
    if (!carregado.current) return
    const t = setTimeout(() => void salvar(projeto), 1000)
    return () => clearTimeout(t)
  }, [projeto, salvar])

  const abrirProjeto = async (id: string) => {
    const p = await apiFetch(`/api/final/projetos/${encodeURIComponent(id)}`).then(r => r.json())
    if (!p?.trilhas) return
    motor.parar(); setTocando(false)
    ultimoSalvo.current = JSON.stringify(p)
    setH(historicoDe(p)); setSel({ trilha: null, clipe: null })
  }
  const novo = () => {
    motor.parar(); setTocando(false)
    setH(historicoDe(novoProjeto(`sessao ${projetos.length + 1}`))); setSel({ trilha: null, clipe: null })
  }
  const apagarProjeto = async (id: string) => {
    await apiFetch(`/api/final/projetos/${encodeURIComponent(id)}`, { method: 'DELETE' })
    setProjetos(ps => ps.filter(x => x.id !== id))
  }

  /* ── gravar: microfone vira clipe na trilha de áudio armada ── */
  const pararGravacao = useCallback(async () => {
    const g = gravandoRef.current
    if (!g) return
    setGravando(null)
    motor.pausar()
    setTocando(false)
    setStatus('saving take…')
    try {
      const blob = await g.parar()
      const nomeTr = hRef.current.presente.trilhas.find(t => t.id === g.trilha)?.nome ?? 'take'
      const fd = new FormData()
      fd.append('audio', blob, 'take.wav')
      fd.append('nome', nomeTr)
      const r = await apiFetch('/api/final/gravacao', { method: 'POST', body: fd }).then(x => x.json())
      if (!r?.ok) throw new Error('backend did not save the take')
      const buf = await carregarBuffer(r.caminho)
      // o gravador abre ~30 ms antes do Transport andar: o começo do arquivo é anterior ao t0
      const clipe: Clipe = { id: novoId('c'), inicio: g.t0, dur: Math.max(0.1, buf.duration - LIDER_S), arquivo: r.caminho, offset: LIDER_S, fadeIn: 0.01, fadeOut: 0.05 }
      setH(x => empurrar(x, mudarTrilha(x.presente, g.trilha, tr => ({ ...tr, clipes: [...tr.clipes, clipe] }))))
      setSel({ trilha: g.trilha, clipe: clipe.id })
      setStatus(null)
    } catch (e) { setStatus(`take lost: ${String(e)}`) }
  }, [motor])

  const gravarOuParar = useCallback(async () => {
    if (gravandoRef.current) { await pararGravacao(); return }
    const p = hRef.current.presente
    const audio = p.trilhas.find(t => t.tipo === 'audio' && t.armada)
    const melodia = p.trilhas.find(t => t.tipo === 'melodia' && t.armada)
    if (!audio && !melodia) { setStatus('arm a track with R first'); return }
    if (!audio) { await motor.tocar(); setTocando(true); return }
    try {
      const rec = await motor.gravarEntrada()
      const t0 = motor.segundos
      await motor.tocar()
      setTocando(true)
      setGravando({ t0, trilha: audio.id, parar: rec.parar })
      setStatus(null)
    } catch (e) { setStatus(`microphone: ${String(e)}`) }
  }, [motor, pararGravacao])

  /* ── transporte ── */
  const tocarPausar = useCallback(async () => {
    if (gravandoRef.current) { await pararGravacao(); return }
    if (motor.tocando) { motor.pausar(); setTocando(false) } else { await motor.tocar(); setTocando(true) }
  }, [motor, pararGravacao])

  /* ── alvos da era6 no master, medidos enquanto toca (mesmas contas do /era6) ── */
  useEffect(() => {
    if (!tocando) return
    const esp = new Float32Array(2048)
    const onda = new Float32Array(4096)
    const hist: number[] = []
    const ataques = new ContadorAtaques()
    const inicio = performance.now() / 1000
    let acc: ReturnType<typeof medirEspectro> | null = null
    let n = 0
    const id = setInterval(() => {
      const an = motor.analisador
      if (!an) return
      an.getFloatFrequencyData(esp)
      an.getFloatTimeDomainData(onda)
      let soma = 0
      for (let i = 0; i < onda.length; i++) soma += onda[i] * onda[i]
      const rms = 10 * Math.log10(soma / onda.length + 1e-12)
      if (rms > -90) {
        hist.push(rms)
        if (hist.length > 600) hist.shift()
        const e = medirEspectro(esp, an.context.sampleRate)
        acc = acc ? { centroide: acc.centroide * 0.97 + e.centroide * 0.03, grave: acc.grave * 0.97 + e.grave * 0.03, agudo: acc.agudo * 0.97 + e.agudo * 0.03 } : e
      }
      const agora = performance.now() / 1000
      ataques.alimentar(esp, agora)
      if (++n % 5 === 0 && acc) setMedidas(portoes(acc, dinamica(hist), ataques.porMinuto(agora, inicio)))
    }, 100)
    return () => clearInterval(id)
  }, [tocando, motor])
  const voltar = useCallback(() => { motor.irPara(laco ? faixaLaco.de : 0) }, [motor, laco, faixaLaco])

  /* ── trilhas e clipes ── */
  const novaTrilhaDe = useCallback((tipo: Trilha['tipo']) => {
    const n = projeto.trilhas.filter(t => t.tipo === tipo).length + 1
    const t = novaTrilha(tipo, tipo === 'audio' ? `audio ${n}` : `melody ${n}`)
    if (tipo === 'melodia') {
      const ini = encaixar(motor.segundos, compassoS(projeto))
      t.clipes = [{ id: novoId('c'), inicio: ini, dur: compassoS(projeto) * 4, notas: [] }]
      setSel({ trilha: t.id, clipe: t.clipes[0].id })
    } else setSel({ trilha: t.id, clipe: null })
    mudar({ ...projeto, trilhas: [...projeto.trilhas, t] })
  }, [projeto, motor, mudar])

  const criarClipeMelodia = (trilhaId: string, t: number) => {
    const c: Clipe = { id: novoId('c'), inicio: t, dur: compassoS(projeto) * 4, notas: [] }
    mudar(mudarTrilha(projeto, trilhaId, tr => ({ ...tr, clipes: [...tr.clipes, c] })))
    setSel({ trilha: trilhaId, clipe: c.id })
  }

  const soltar = async (item: ItemBiblioteca, trilhaId: string | null, t: number) => {
    setStatus(`loading ${item.nome}…`)
    try {
      const base = hRef.current.presente
      const alvo = base.trilhas.find(x => x.id === trilhaId)
      let clipe: Clipe
      let tipo: Trilha['tipo']
      if (item.tipo === 'midi') {
        const ab = await fetch(resolveUrl(`/api/mix/file?path=${encodeURIComponent(item.caminho)}`)).then(r => r.arrayBuffer())
        const midi = new Midi(ab)
        const notas: Nota[] = midi.tracks.flatMap(tr => tr.notes.map(n => ({ id: novoId('n'), t: n.time, dur: Math.max(0.05, n.duration), midi: n.midi, vel: n.velocity })))
        const fim = Math.max(compassoS(base), ...notas.map(n => n.t + n.dur))
        clipe = { id: novoId('c'), inicio: t, dur: fim, notas }
        tipo = 'melodia'
      } else {
        const buf = await carregarBuffer(item.caminho)
        clipe = { id: novoId('c'), inicio: t, dur: buf.duration, arquivo: item.caminho, offset: 0, fadeIn: 0.5, fadeOut: 2 }
        tipo = 'audio'
      }
      const atual = hRef.current.presente
      let p: Projeto
      let tid: string
      if (alvo && alvo.tipo === tipo) {
        tid = alvo.id
        p = mudarTrilha(atual, alvo.id, tr => ({ ...tr, clipes: [...tr.clipes, clipe] }))
      } else {
        const nt = novaTrilha(tipo, item.nome)
        nt.clipes = [clipe]
        tid = nt.id
        p = { ...atual, trilhas: [...atual.trilhas, nt] }
      }
      mudar(p)
      setSel({ trilha: tid, clipe: clipe.id })
      setStatus(null)
    } catch (e) { setStatus(`could not load ${item.nome}: ${String(e)}`) }
  }
  const usarItem = (item: ItemBiblioteca) => void soltar(item, null, encaixar(motor.segundos, grade))

  const removerTrilha = (id: string) => {
    mudar({ ...projeto, trilhas: projeto.trilhas.filter(t => t.id !== id) })
    setSel({ trilha: null, clipe: null })
  }

  /* ── tocar notas: teclado do PC e MIDI, gravando se a trilha estiver armada ── */
  const segurando = useRef(new Map<string, { midi: number; t0: number; trilha: string }>())
  // step input: com o botão ligado e o transporte parado, a nota tocada é escrita no clipe aberto
  const passoAlvo = useRef<{ clipe: string; grade: number } | null>(null)
  const trilhaTocavel = useCallback(() => {
    const p = hRef.current.presente
    return p.trilhas.find(t => t.tipo === 'melodia' && t.armada) ?? p.trilhas.find(t => t.id === sel.trilha && t.tipo === 'melodia')
      ?? p.trilhas.find(t => t.tipo === 'melodia')
  }, [sel.trilha])

  const liga = useCallback((chave: string, midi: number, vel = 0.8) => {
    const t = trilhaTocavel()
    if (!t || segurando.current.has(chave)) return
    motor.notaLiga(t.id, midi, vel)
    segurando.current.set(chave, { midi, t0: motor.segundos, trilha: t.id })
    const alvo = passoAlvo.current
    if (alvo && !motor.tocando) {
      // acorde: enquanto houver tecla segurada a agulha não anda, todas caem no mesmo passo
      const p = hRef.current.presente
      const achou = acharClipe(p, alvo.clipe)
      if (achou) {
        const t0 = Math.max(0, encaixar(motor.segundos - achou.clipe.inicio, alvo.grade))
        setH(x => empurrar(x, mudarClipe(x.presente, alvo.clipe, c => {
          const n: Nota = { id: novoId('n'), t: t0, dur: alvo.grade, midi, vel }
          return { ...c, notas: [...(c.notas ?? []), n], dur: Math.max(c.dur, t0 + alvo.grade) }
        })))
      }
    }
  }, [motor, trilhaTocavel])

  const solta = useCallback((chave: string) => {
    const s = segurando.current.get(chave)
    if (!s) return
    segurando.current.delete(chave)
    motor.notaSolta(s.trilha, s.midi)
    if (passoAlvo.current && !motor.tocando) {
      if (!segurando.current.size) motor.irPara(motor.segundos + passoAlvo.current.grade)
      return
    }
    const p = hRef.current.presente
    const t = p.trilhas.find(x => x.id === s.trilha)
    if (!t?.armada || !motor.tocando) return
    // grava: cai no clipe que cobre o tempo, ou abre um novo no compasso
    const t1 = motor.segundos
    const dur = Math.max(0.05, t1 - s.t0)
    let c = t.clipes.find(x => s.t0 >= x.inicio && s.t0 < x.inicio + x.dur)
    let np = p
    if (!c) {
      c = { id: novoId('c'), inicio: Math.floor(s.t0 / compassoS(p)) * compassoS(p), dur: compassoS(p) * 4, notas: [] }
      const novoC = c
      np = mudarTrilha(np, t.id, tr => ({ ...tr, clipes: [...tr.clipes, novoC] }))
    }
    const cid = c.id
    np = mudarClipe(np, cid, x => {
      const n: Nota = { id: novoId('n'), t: s.t0 - x.inicio, dur, midi: s.midi, vel: 0.8 }
      return { ...x, notas: [...(x.notas ?? []), n], dur: Math.max(x.dur, n.t + n.dur) }
    })
    setH(x => empurrar(x, np))
  }, [motor])

  const ligarMidi = async () => {
    const acesso = await requestMIDIAccess()
    const entrada = acesso ? listMIDIInputs(acesso)[0] : undefined
    if (!entrada) { setStatus('no MIDI input found'); return }
    const ouvinte = createMIDIListener({
      noteOn: (nome, vel) => { const m = nomeParaMidi(nome); if (m !== null) liga(`midi${m}`, m, vel) },
      noteOff: nome => { const m = nomeParaMidi(nome); if (m !== null) solta(`midi${m}`) },
    })
    ouvinte.start(entrada)
    setMidiNome(entrada.name ?? 'MIDI')
  }

  /* ── atalhos ── */
  useEffect(() => {
    const desce = (e: KeyboardEvent) => {
      if (digitando(e.target)) return
      const cmd = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (cmd && k === 'k') { e.preventDefault(); setTeclado(v => !v); return }
      if (e.key === '?') { e.preventDefault(); setAjuda(v => !v); return }
      if (teclado && !cmd) {
        const g = TECLAS_GRAU.indexOf(k)
        if (g >= 0) {
          e.preventDefault()
          if (!e.repeat) { const p = hRef.current.presente; liga(`kb${k}`, grauParaMidi(g, p.raiz, p.escala, oitava)) }
          return
        }
        if (k === 'z') { setOitava(o => Math.max(1, o - 1)); return }
        if (k === 'x') { setOitava(o => Math.min(7, o + 1)); return }
      }
      if (e.code === 'Space') { e.preventDefault(); void tocarPausar(); return }
      if (k === 'enter') { e.preventDefault(); voltar(); return }
      if (cmd && k === 'z') { e.preventDefault(); setH(x => (e.shiftKey ? refazer(x) : desfazer(x))); return }
      if (cmd && k === 'y') { e.preventDefault(); setH(refazer); return }
      if (cmd && k === 's') { e.preventDefault(); void salvar(hRef.current.presente, true); return }
      const p = hRef.current.presente
      const ids = idsDe(sel)
      if ((k === 'delete' || k === 'backspace') && ids.length) { e.preventDefault(); mudar(removerClipes(p, ids)); setSel(s => ({ ...s, clipe: null, grupo: [] })); return }
      if (cmd && k === 'd' && ids.length) { e.preventDefault(); const d = duplicarClipes(p, ids); mudar(d.projeto); setSel(s => ({ ...s, clipe: d.ids[0] ?? null, grupo: d.ids.slice(1) })); return }
      if (cmd && k === 'c' && ids.length) { e.preventDefault(); const n = copiarClipes(p, ids); setStatus(`copied ${n} clip${n > 1 ? 's' : ''}`); return }
      if (cmd && k === 'v') {
        e.preventDefault()
        const r = colarClipes(p, encaixar(motor.segundos, grade))
        if (r.ids.length) { mudar(r.projeto); setSel(s => ({ ...s, clipe: r.ids[0], grupo: r.ids.slice(1) })) }
        return
      }
      if (cmd) return
      if (k === 'b' && sel.clipe) { mudar(dividir(p, sel.clipe, motor.segundos)); return }
      if (k === 'c') { if (laco) setLacoManual(null); setLaco(!laco); return }
      if (k === 'a') { setVerAuto(v => !v); return }
      if (k === '*') { void gravarOuParar(); return }
      if (k === '=' || k === '+') { setPx(v => Math.min(400, v * 1.25)); return }
      if (k === '-') { setPx(v => Math.max(2, v / 1.25)); return }
      if (k === 'arrowleft') { motor.irPara(motor.segundos - compassoS(p)); return }
      if (k === 'arrowright') { motor.irPara(motor.segundos + compassoS(p)); return }
      const t = p.trilhas.find(x => x.id === sel.trilha)
      if (!t) return
      if (k === 'm') mudar(mudarTrilha(p, t.id, x => ({ ...x, mudo: !x.mudo })))
      if (k === 's') mudar(mudarTrilha(p, t.id, x => ({ ...x, solo: !x.solo })))
      if (k === 'r') mudar(mudarTrilha(p, t.id, x => ({ ...x, armada: !x.armada })))
    }
    const sobe = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (TECLAS_GRAU.includes(k)) solta(`kb${k}`)
    }
    const perdeu = () => { for (const c of [...segurando.current.keys()]) solta(c) }
    window.addEventListener('keydown', desce)
    window.addEventListener('keyup', sobe)
    window.addEventListener('blur', perdeu)
    return () => { window.removeEventListener('keydown', desce); window.removeEventListener('keyup', sobe); window.removeEventListener('blur', perdeu) }
  }, [teclado, oitava, sel, mudar, liga, solta, tocarPausar, voltar, salvar, motor, gravarOuParar, grade, laco])

  /* ── export ── */
  const exportar = async () => {
    const dur = duracaoProjeto(projeto)
    if (dur <= 0) { setStatus('nothing to export yet'); return }
    setExportando(true)
    setStatus(`rendering ${relogio(dur + CAUDA_S)} offline…`)
    try {
      const buf = await renderizar(projeto, dur)
      const wav = encodeWav(buf)
      const fd = new FormData()
      fd.append('audio', wav, 'final.wav')
      fd.append('projeto', new Blob([JSON.stringify(projeto)], { type: 'application/json' }), 'projeto.json')
      fd.append('nome', projeto.nome)
      fd.append('dur_s', String(buf.duration))
      const r = await apiFetch('/api/final/salvar', { method: 'POST', body: fd }).then(x => x.json()).catch(() => null)
      if (ultimoExport) URL.revokeObjectURL(ultimoExport.url)
      const nome = r?.nome ?? `${projeto.nome}`
      setUltimoExport({ nome, url: URL.createObjectURL(wav) })
      setStatus(r?.ok ? `saved final/${r.nome}.wav` : 'backend offline: use the download link')
    } catch (e) { setStatus(`export failed: ${String(e)}`) } finally { setExportando(false) }
  }

  /* ── editor de baixo ── */
  const achado = sel.clipe ? acharClipe(projeto, sel.clipe) : null
  const trilhaSel = projeto.trilhas.find(t => t.id === sel.trilha) ?? null
  // o painel de baixo abre com a trilha: editor do clipe (se houver) + rack da trilha
  const trilhaPainel = achado?.trilha ?? trilhaSel
  const passoClipe = passoAPasso && achado?.trilha.tipo === 'melodia' ? achado.clipe.id : null
  const passoGrade = gradeRoll || batidaS(projeto.bpm) / 4
  useEffect(() => { passoAlvo.current = passoClipe ? { clipe: passoClipe, grade: passoGrade } : null }, [passoClipe, passoGrade])
  const comecarRedimensionar = (e: React.PointerEvent) => {
    const y0 = e.clientY
    const h0 = editorH
    const mover = (ev: PointerEvent) => setEditorH(Math.max(140, Math.min(window.innerHeight - 220, h0 - (ev.clientY - y0))))
    const soltarR = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltarR) }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltarR)
  }

  return (
    <main className="final" style={{
      height: '100vh', display: 'grid', gridTemplateRows: `auto 1fr ${trilhaPainel ? `${Math.max(editorH, ALTURA_RACK)}px` : '0px'}`, gridTemplateColumns: '248px 1fr',
      background: 'var(--vintage-surface-1)', color: 'var(--vintage-label)', font: '400 12px/1.4 var(--font-vintage-mono, monospace)', overflow: 'hidden',
    }}>
      <style>{CSS_FINAL}</style>

      {/* ── barra de transporte ── */}
      <header style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--vintage-border)', background: 'var(--vintage-surface-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <h1 style={{ font: '600 14px/1 var(--font-vintage-display, sans-serif)', letterSpacing: '0.14em', margin: 0, color: 'var(--vintage-label)' }}>FINAL</h1>
          <input value={projeto.nome} aria-label="session name" onChange={e => setH(x => substituir(x, { ...x.presente, nome: e.target.value }))}
            onBlur={() => mudar({ ...projeto })}
            style={{ minWidth: 0, width: 160, background: 'transparent', border: '1px solid transparent', color: 'var(--vintage-value)', font: 'inherit', padding: '4px 6px' }} />
          <Popover>
            <PopoverTrigger asChild><button type="button" style={estilo.botaoIcone()} aria-label="open session" title="sessions"><FolderOpen size={14} /></button></PopoverTrigger>
            <PopoverContent align="start" style={{ background: 'var(--vintage-surface-2)', border: '1px solid var(--vintage-border)', color: 'var(--vintage-label)', padding: 6, width: 280, font: '400 12px/1.4 var(--font-vintage-mono, monospace)' }}>
              <button type="button" onClick={novo} style={{ ...estilo.botao(false), width: '100%', marginBottom: 6 }}><FilePlus2 size={12} /> new session</button>
              {projetos.map(p => (
                <div key={p.id} className="final-item" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
                  <button type="button" onClick={() => void abrirProjeto(p.id)} style={{ ...estilo.botaoIcone(p.id === projeto.id), flex: 1, justifyContent: 'space-between' }}>
                    <span>{p.nome}</span><span style={{ color: 'var(--vintage-text-dim)' }}>{p.trilhas} tr</span>
                  </button>
                  {p.id !== projeto.id && <button type="button" onClick={() => void apagarProjeto(p.id)} style={estilo.botaoIcone()} aria-label={`delete ${p.nome}`}><Trash2 size={11} /></button>}
                </div>
              ))}
              {!projetos.length && <p style={{ margin: 6, color: 'var(--vintage-text-muted)' }}>no saved sessions yet</p>}
            </PopoverContent>
          </Popover>
          <span style={{ color: salvo === 'erro' ? 'var(--vintage-meter-red)' : 'var(--vintage-text-dim)' }}>
            {salvo === 'salvando' ? 'saving…' : salvo === 'ok' ? 'saved' : salvo === 'erro' ? 'not saved (backend?)' : ''}
          </span>
        </div>

        {/* centro: botões + LCD, como o GarageBand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" onClick={voltar} style={estilo.botao(false)} aria-label="go to start" title="go to start (enter)"><SkipBack size={13} /></button>
          <button type="button" onClick={() => void tocarPausar()} style={{ ...estilo.primario(tocando), padding: '7px 18px' }} aria-label={tocando ? 'pause' : 'play'} title="play / pause (space)">
            {tocando ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" onClick={() => void gravarOuParar()} aria-pressed={!!gravando} aria-label={gravando ? 'stop recording' : 'record'} title="record (*)"
            style={{ ...estilo.botao(!!gravando), color: 'var(--vintage-meter-red)', borderColor: gravando ? 'var(--vintage-meter-red)' : undefined }}>
            <Circle size={13} fill={gravando ? 'currentColor' : 'none'} />
          </button>
          <button type="button" onClick={() => setLaco(v => !v)} aria-pressed={laco} style={estilo.botao(laco)} title="cycle (C)" aria-label="cycle"><Repeat size={13} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 6, padding: '5px 14px', background: 'var(--vintage-surface-1)', border: '1px solid var(--vintage-border)', borderRadius: 4, boxShadow: 'inset 0 1px 6px rgba(0,0,0,0.6)' }}>
            <span style={{ display: 'grid', justifyItems: 'center' }}>
              <span ref={compassoRef} style={{ font: '600 18px/1 var(--font-vintage-mono, monospace)', color: 'var(--vintage-value)', fontVariantNumeric: 'tabular-nums', minWidth: 54, textAlign: 'center' }}>1.1</span>
              <span style={estilo.rotulo}>bar</span>
            </span>
            <span style={{ display: 'grid', justifyItems: 'center' }}>
              <span ref={relogioRef} style={{ font: '400 13px/1 var(--font-vintage-mono, monospace)', color: 'var(--vintage-label)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'center', paddingTop: 3 }}>0:00.0</span>
              <span style={{ ...estilo.rotulo, marginTop: 2 }}>time</span>
            </span>
            <label style={{ display: 'grid', justifyItems: 'center' }}>
              <input type="number" min={30} max={200} value={projeto.bpm} aria-label="tempo"
                onChange={e => { const v = Number(e.target.value); if (v >= 30 && v <= 200) mudar({ ...projeto, bpm: v }) }}
                style={{ ...campoNum, border: 'none', background: 'transparent', height: 18 }} />
              <span style={estilo.rotulo}>bpm</span>
            </label>
            <label style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
              <span style={{ display: 'flex', gap: 2 }}>
                <select value={projeto.raiz} aria-label="key" onChange={e => mudar({ ...projeto, raiz: Number(e.target.value) })} style={{ height: 18, border: 'none', color: 'var(--vintage-value)' }}>
                  {NOMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
                <select value={projeto.escala} aria-label="scale" onChange={e => mudar({ ...projeto, escala: Number(e.target.value) })} style={{ height: 18, border: 'none', color: 'var(--vintage-value)' }}>
                  {ESCALAS.map((s, i) => <option key={s.nome} value={i}>{s.nome}</option>)}
                </select>
              </span>
              <span style={estilo.rotulo}>key</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setTeclado(v => !v)} aria-pressed={teclado} style={estilo.botao(teclado)} title="musical typing (⌘K)" aria-label="musical typing">
            <Keyboard size={13} /> {teclado ? `oct ${oitava}` : ''}
          </button>
          <button type="button" onClick={() => void ligarMidi()} style={estilo.botao(!!midiNome)} title={midiNome ?? 'connect MIDI keyboard'} aria-label="connect MIDI">
            <Cable size={13} />
          </button>
          {medidas.length > 0 && <Alvos medidas={medidas} />}
          <div style={{ display: 'grid', gap: 3, width: 120 }} title={`master ${projeto.master.toFixed(1)} dB, limiter at −0.9 dBFS`}>
            <div style={{ height: 4, background: 'var(--vintage-surface-1)', overflow: 'hidden' }}>
              <div ref={medidorMaster} style={{ height: '100%', background: 'linear-gradient(90deg, var(--vintage-meter-green) 70%, var(--vintage-meter-yellow) 88%, var(--vintage-meter-red))', transformOrigin: 'left', transform: 'scaleX(0)' }} />
            </div>
            <input type="range" className="final-fader" min={-30} max={6} step={0.5} value={projeto.master} aria-label="master volume"
              onChange={e => setH(x => substituir(x, { ...x.presente, master: Number(e.target.value) }))}
              onPointerUp={() => mudar({ ...hRef.current.presente })} />
          </div>
          <button type="button" onClick={() => void exportar()} disabled={exportando || !projeto.trilhas.length} style={estilo.botao(true, exportando || !projeto.trilhas.length)} title="render WAV 48 kHz to Jacão Ambients/final/">
            <Download size={13} /> {exportando ? 'rendering…' : 'export'}
          </button>
        </div>
      </header>

      {/* ── acervo ── */}
      <Biblioteca itens={itens} erro={erroBib} onUsar={usarItem} />

      {/* ── arranjo ── */}
      <section aria-label="tracks" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--vintage-border)', background: 'var(--vintage-surface-1)' }}>
          <span style={estilo.rotulo}>snap</span>
          <select value={gradeId} onChange={e => setGradeId(e.target.value as GradeId)} aria-label="snap">
            {GRADES.map(g => <option key={g.id} value={g.id}>{g.rotulo}</option>)}
          </select>
          <button type="button" onClick={() => setPx(v => Math.max(2, v / 1.25))} style={estilo.botaoIcone()} aria-label="zoom out" title="zoom out (−)"><ZoomOut size={13} /></button>
          <button type="button" onClick={() => setPx(v => Math.min(400, v * 1.25))} style={estilo.botaoIcone()} aria-label="zoom in" title="zoom in (+)"><ZoomIn size={13} /></button>
          <span aria-hidden style={{ width: 1, height: 16, background: 'var(--vintage-border)' }} />
          <button type="button" disabled={!h.passado.length} onClick={() => setH(desfazer)} style={{ ...estilo.botaoIcone(), opacity: h.passado.length ? 1 : 0.35 }} aria-label="undo" title="undo (⌘Z)"><Undo2 size={13} /></button>
          <button type="button" disabled={!h.futuro.length} onClick={() => setH(refazer)} style={{ ...estilo.botaoIcone(), opacity: h.futuro.length ? 1 : 0.35 }} aria-label="redo" title="redo (shift ⌘Z)"><Redo2 size={13} /></button>
          <button type="button" onClick={() => setVerAuto(v => !v)} aria-pressed={verAuto} style={estilo.botaoIcone(verAuto)} aria-label="volume automation" title="volume automation (A)"><Activity size={13} /></button>
          {sel.clipe && <button type="button" onClick={() => sel.clipe && mudar(dividir(projeto, sel.clipe, motor.segundos))} style={estilo.botaoIcone()} aria-label="split at playhead" title="split at playhead (B)"><Scissors size={13} /></button>}
          {trilhaSel && (
            <button type="button" onClick={() => removerTrilha(trilhaSel.id)} style={estilo.botaoIcone()} aria-label={`delete track ${trilhaSel.nome}`} title="delete selected track"><Trash2 size={13} /></button>
          )}
          <span style={{ marginLeft: 'auto', color: 'var(--vintage-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} role="status">
            {status ?? ''}
            {ultimoExport && <a href={ultimoExport.url} download={`${ultimoExport.nome}.wav`} style={{ color: 'var(--vintage-value)', marginLeft: 12 }}>download {ultimoExport.nome}.wav</a>}
          </span>
          {teclado && <VintageLed color="orange" size="sm" active pulse label="keys" />}
          {gravando && <VintageLed color="red" size="sm" active pulse label="rec" />}
          <Atalhos aberto={ajuda} onAberto={setAjuda} />
        </div>
        <Arranjo projeto={projeto} banco={banco} sel={sel} px={px} grade={grade} motor={motor}
          laco={{ ligado: laco, ...faixaLaco }} arrasto={arrasto} verAuto={verAuto} onZoom={setPx}
          onSel={setSel} onMudar={mudar} onSoltar={(i, t, s) => void soltar(i, t, s)} onNovaTrilha={novaTrilhaDe}
          onSeek={s => motor.irPara(s)} onLaco={(de, ate) => { setLacoManual({ de, ate }); setLaco(true) }} onCriarClipe={criarClipeMelodia} onAbrirEditor={() => setEditorH(v => Math.max(v, 300))} />
      </section>

      {/* ── editor do clipe ── */}
      {trilhaPainel && (
        <section aria-label="clip editor" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, borderTop: '1px solid var(--vintage-border)', background: 'var(--vintage-surface-2)' }}>
          <div onPointerDown={comecarRedimensionar} aria-hidden style={{ height: 5, marginTop: -3, cursor: 'ns-resize', position: 'relative', zIndex: 5 }} />
          <div style={{ display: 'grid', gridTemplateColumns: achado ? 'minmax(0, 1fr) auto' : '1fr', minHeight: 0 }}>
            {achado && (
              <EditorClipe projeto={projeto} trilha={achado.trilha} clipe={achado.clipe} motor={motor} grade={gradeRoll} gradeId={gradeRollId} setGradeId={setGradeRollId} passoAPasso={passoAPasso} setPassoAPasso={setPassoAPasso}
                soEscala={soEscala} setSoEscala={setSoEscala} zoom={zoomRoll} setZoom={setZoomRoll} arrasto={arrasto} onMudar={mudar} />
            )}
            <TrackFx trilha={trilhaPainel} arrasto={arrasto} onMudar={mudar} />
          </div>
        </section>
      )}
    </main>
  )
}

// o rack completo (2 linhas + secundária) cabe inteiro a partir daqui
const ALTURA_RACK = 330

function nomeParaMidi(nome: string): number | null {
  const m = /^([A-G]#?)(-?\d+)$/.exec(nome)
  if (!m) return null
  return 12 * (Number(m[2]) + 1) + NOMES.indexOf(m[1])
}

function EditorClipe({ projeto, trilha, clipe, motor, grade, gradeId, setGradeId, passoAPasso, setPassoAPasso, soEscala, setSoEscala, zoom, setZoom, arrasto, onMudar }: {
  projeto: Projeto; trilha: Trilha; clipe: Clipe; motor: MotorFinal; grade: number; gradeId: GradeId; setGradeId: (g: GradeId) => void
  passoAPasso: boolean; setPassoAPasso: (v: boolean) => void
  soEscala: boolean; setSoEscala: (v: boolean) => void; zoom: number; setZoom: (v: number) => void
  arrasto: Arrasto; onMudar: (p: Projeto) => void
}) {
  const mudarC = (f: (c: Clipe) => Clipe) => onMudar(mudarClipe(projeto, clipe.id, f))
  const cab: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', borderBottom: '1px solid var(--vintage-border)', flexWrap: 'wrap' }
  const nome = nomeClipe(clipe, trilha.nome)
  if (trilha.tipo === 'melodia') {
    return (
      <div style={{ display: 'grid', gridTemplateRows: trilha.instrumento === 'sample' ? 'auto auto 1fr' : 'auto 1fr', minHeight: 0 }}>
        <div style={cab}>
          <span style={{ ...estilo.rotulo, color: 'var(--vintage-accent)' }}>piano roll</span>
          <span style={{ color: 'var(--vintage-value)' }}>{nome}</span>
          <span style={{ color: 'var(--vintage-text-muted)' }}>{(clipe.notas ?? []).length} notes</span>
          <span style={{ color: 'var(--vintage-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{relogio(clipe.dur)}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={soEscala} onChange={e => setSoEscala(e.target.checked)} /> scale rows only
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={estilo.rotulo}>grid</span>
            <select value={gradeId} onChange={e => setGradeId(e.target.value as GradeId)} aria-label="piano roll grid">
              {GRADES.map(g => <option key={g.id} value={g.id}>{g.rotulo}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setPassoAPasso(!passoAPasso)} aria-pressed={passoAPasso} style={estilo.botao(passoAPasso)}
            title="step input: with transport stopped, notes you play (⌘K keys or MIDI) are written at the playhead, one grid step each">
            step
          </button>
          {trilha.instrumento === 'sample' && (
            <span style={{ color: trilha.amostra ? 'var(--vintage-text-muted)' : 'var(--vintage-meter-yellow)' }}>
              {trilha.amostra ? `sample: ${nomeArquivo(trilha.amostra)} (root ${NOMES_NOTA[trilha.amostraRaiz ?? 0]})` : 'sample instrument: drop a library sound below'}
            </span>
          )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button type="button" onClick={() => setZoom(Math.max(16, zoom / 1.25))} style={estilo.botaoIcone()} aria-label="zoom out piano roll"><ZoomOut size={13} /></button>
            <button type="button" onClick={() => setZoom(Math.min(240, zoom * 1.25))} style={estilo.botaoIcone()} aria-label="zoom in piano roll"><ZoomIn size={13} /></button>
            <button type="button" onClick={() => mudarC(c => ({ ...c, notas: [] }))} style={estilo.botaoIcone()} aria-label="clear notes" title="clear all notes"><Trash2 size={13} /></button>
          </span>
        </div>
        {trilha.instrumento === 'sample' && <AmostraDrop trilha={trilha} projeto={projeto} onMudar={onMudar} />}
        <PianoRoll projeto={projeto} trilha={trilha} clipe={clipe} motor={motor} grade={grade} soEscala={soEscala} zoom={zoom} onZoom={setZoom} arrasto={arrasto} onMudar={onMudar} />
      </div>
    )
  }
  const buf = clipe.arquivo ? motor.buffer(clipe.arquivo) : undefined
  const fader = (rotulo: string, valor: number, min: number, max: number, passo: number, fmt: (v: number) => string, f: (v: number) => Clipe) => (
    <label style={{ display: 'grid', gap: 4, width: 220 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}><span style={estilo.rotulo}>{rotulo}</span><span style={{ color: 'var(--vintage-value)', fontVariantNumeric: 'tabular-nums' }}>{fmt(valor)}</span></span>
      <input type="range" className="final-fader" min={min} max={max} step={passo} value={valor}
        onChange={e => arrasto.previa(mudarClipe(arrasto.comecar(), clipe.id, () => f(Number(e.target.value))))}
        onPointerDown={() => { baseRef.current = arrasto.comecar() }}
        onPointerUp={() => { if (baseRef.current) arrasto.fim(baseRef.current); baseRef.current = null }}
        style={{ background: 'var(--vintage-surface-1)' }} />
    </label>
  )
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
      <div style={cab}>
        <span style={{ ...estilo.rotulo, color: 'var(--vintage-meter-green)' }}>audio clip</span>
        <span style={{ color: 'var(--vintage-value)' }}>{nome}</span>
        <span style={{ color: 'var(--vintage-text-muted)', fontVariantNumeric: 'tabular-nums' }}>at {relogio(clipe.inicio)}</span>
        <span style={{ color: 'var(--vintage-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{relogio(clipe.dur)} long</span>
        <span style={{ color: 'var(--vintage-text-dim)', fontVariantNumeric: 'tabular-nums' }}>from {relogio(clipe.offset ?? 0)}{buf ? ` of ${relogio(buf.duration)}` : ''}</span>
      </div>
      <div style={{ display: 'flex', gap: 28, padding: '10px 16px 14px', flexWrap: 'wrap', alignContent: 'start' }}>
        {fader('gain', clipe.ganho ?? 0, -30, 12, 0.5, v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`, v => ({ ...clipe, ganho: v }))}
        {fader('fade in', clipe.fadeIn ?? 0, 0, Math.min(30, clipe.dur / 2), 0.1, v => `${v.toFixed(1)} s`, v => ({ ...clipe, fadeIn: v }))}
        {fader('fade out', clipe.fadeOut ?? 0, 0, Math.min(30, clipe.dur / 2), 0.1, v => `${v.toFixed(1)} s`, v => ({ ...clipe, fadeOut: v }))}
        <EsticarClipe clipe={clipe} comecar={arrasto.comecar} onMudar={onMudar} />
      </div>
    </div>
  )
}
const baseRef: { current: Projeto | null } = { current: null }

/** Instrumento "sample": solta um arquivo do acervo aqui e ele vira nota (raiz em C4). */
function AmostraDrop({ trilha, projeto, onMudar }: { trilha: Trilha; projeto: Projeto; onMudar: (p: Projeto) => void }) {
  const [sobre, setSobre] = useState(false)
  return (
    <div onDragOver={e => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
      onDrop={e => {
        e.preventDefault(); setSobre(false)
        const raw = e.dataTransfer.getData('application/x-final-item')
        if (!raw) return
        const item = JSON.parse(raw) as ItemBiblioteca
        if (item.tipo === 'audio') onMudar(mudarTrilha(projeto, trilha.id, t => ({ ...t, amostra: item.caminho, amostraRaiz: undefined })))
      }}
      style={{ margin: '0 12px', padding: 8, border: `1px dashed ${sobre ? 'var(--vintage-value)' : 'var(--vintage-border)'}`, color: 'var(--vintage-text-muted)', textAlign: 'center' }}>
      drop a library sound here to play it as notes
    </div>
  )
}

/* ── alvos da era6 (Sonmi451) no master ── */
function Alvos({ medidas }: { medidas: Portao[] }) {
  const ok = medidas.filter(m => m.ok).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" style={estilo.botao(false)} aria-label={`era6 targets ${ok} of ${medidas.length}`} title="era6 targets">
          <VintageLed color={ok === medidas.length ? 'green' : 'yellow'} size="sm" active />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{ok}/{medidas.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" style={{ background: 'var(--vintage-surface-2)', border: '1px solid var(--vintage-border)', color: 'var(--vintage-label)', padding: 12, width: 300, font: '400 12px/1.4 var(--font-vintage-mono, monospace)', display: 'grid', gap: 8 }}>
        <span style={estilo.rotulo}>era6 targets, live</span>
        {medidas.map(g => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <VintageLed color={g.ok ? 'green' : 'red'} size="sm" active />
            <span style={{ flex: 1 }}>{g.rotulo}</span>
            <span style={{ color: 'var(--vintage-value)', fontVariantNumeric: 'tabular-nums' }}>{g.fmt}</span>
            <span style={{ ...estilo.rotulo, fontSize: 9, width: 72, textAlign: 'right' }}>{g.alvo}</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/*
 * EXCEÇÃO ao ruido-scan/ensina-a-usar: a folha de atalhos é o ÚNICO lugar dos gestos sem
 * afordância nativa (⌥ arrastar, borda, canto, teclado musical). Abre só quando pedida (? ou o botão).
 */
const ATALHOS: [string, string][] = [
  ['space', 'play / pause'],
  ['enter', 'back to start'],
  ['*', 'record armed track'],
  ['R  M  S', 'arm, mute, solo the selected track'],
  ['C', 'cycle the selected clip'],
  ['A', 'volume automation: click adds a point, double-click removes'],
  ['B', 'split clip at the playhead'],
  ['⌘D', 'duplicate clip (or the shift-clicked group)'],
  ['shift click clip', 'add or remove a clip from the group; drag moves the group'],
  ['⌘C  ⌘V', 'copy clips, paste at the playhead on their tracks'],
  ['shift drag ruler', 'mark the cycle range (C turns it off)'],
  ['⌥ drag', 'duplicate while moving'],
  ['clip edge', 'trim'],
  ['top corner', 'fade in / out'],
  ['⌘ drag', 'ignore snap'],
  ['⌘ wheel', 'zoom (pinch on trackpad)'],
  ['⌘Z', 'undo'],
  ['shift ⌘Z', 'redo'],
  ['⌘K', 'musical typing: A to L play the scale, Z X octave'],
  ['double-click item', 'library sound becomes a new track'],
  ['library: down  up  space  enter', 'from search, walk the list, preview, use'],
  ['double-click lane', 'empty melody lane gets a 4 bar clip'],
  ['⌘S', 'save now'],
  ['piano roll', 'click the roll first: these keys stay inside it'],
  ['shift drag', 'lasso notes'],
  ['shift click', 'add or remove a note from the selection'],
  ['⌘A  esc', 'select all, select none'],
  ['left  right', 'move one grid step (shift: one bar)'],
  ['up  down', 'one row up or down (shift: octave)'],
  ['⌥ left  right', 'shorter, longer'],
  ['⌘C  ⌘V  ⌘D', 'copy, paste at the playhead, duplicate after'],
  ['VEL lane', 'drag a stem: the whole selection follows'],
  ['Q  shift Q', 'quantize selection (or whole clip), full or half way'],
  ['Z', 'fit the clip in the roll'],
  ['T  shift T', 'stack a scale triad (or 7th chord) on the selection'],
  ['L', 'legato: each selected note lasts until the next one'],
  ['step button', 'stopped: ⌘K keys or MIDI write notes at the playhead, held keys make a chord'],
  ['⌘ wheel  ⌥ wheel', 'roll zoom: time, row height'],
  ['clip end line', 'drag: clip length'],
]

function Atalhos({ aberto, onAberto }: { aberto: boolean; onAberto: (v: boolean) => void }) {
  return (
    <Popover open={aberto} onOpenChange={onAberto}>
      <PopoverTrigger asChild>
        <button type="button" style={estilo.botaoIcone(aberto)} aria-label="shortcuts" title="shortcuts (?)"><CircleHelp size={14} /></button>
      </PopoverTrigger>
      <PopoverContent align="end" style={{ background: 'var(--vintage-surface-2)', border: '1px solid var(--vintage-border)', color: 'var(--vintage-label)', padding: 12, width: 380, font: '400 12px/1.4 var(--font-vintage-mono, monospace)' }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', margin: 0 }}>
          {ATALHOS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--vintage-value)', whiteSpace: 'nowrap' }}>{k}</dt>
              <dd style={{ margin: 0, color: 'var(--vintage-text-muted)' }}>{v}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
