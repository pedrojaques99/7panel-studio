/**
 * /era6: mesa granular. Plano e portões em `Jacão Ambients/era6/PLANO-era6.md`.
 *
 * Seis camadas de grão sobre sample real (iPhone, vhulto, kits), passando por uma fita
 * escura, estalo e chiado.
 * - Programação: deriva por knob, respira por Fibonacci e morph de cena.
 * - Mão: knob, XY e MIDI.
 * - REC grava o WAV do master e o json da sessão. O export offline relê esse json e
 *   sai em 48 kHz com pico em −0,9 dBFS.
 *
 * O medidor fica ligado o tempo todo, com os alvos medidos no Sonmi451.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { Cable, Dice5, Download, Play, Save, Square, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { VintageLed } from '@/components/ui/vintage-led'
import { VintageXYPad } from '@/components/ui/vintage-xy-pad'
import { encodeWav } from '../lib/audio-utils'
import { apiFetch } from '../lib/api'
import { requestMIDIAccess, listMIDIInputs, createMIDIListener } from '../lib/midi'
import {
  N_CAMADAS, PADRAO, MESTRE_PADRAO, FAIXA, SEED, derivaVazia, morph, prender, rng, sortearParams,
  type Cena, type Deriva, type NomeParam, type ParamsCamada, type ParamsMestre, type Sessao, type TipoCamada,
  type NotaFrase, escreverNota, PASSOS_FRASE, ESCALAS, TECLAS,
} from './modelo'
import { Motor, renderOffline, type ItemBanco } from './motor'
import { gravar } from './gravador'
import { ContadorAtaques, dinamica, medirEspectro, portoes, type Portao } from './medidor'
import { FaixaCamada, SeletorSample } from './FaixaCamada'
import { Cenas } from './Cenas'
import { PRESETS_FABRICA, sortearMesa, type Preset } from './presets'
import { Tela, CICATRIZ_ALTURA, LADO_VIVO } from './Tela'
import { Pintor, lerPaleta, corDoSample, pintarCicatriz, picosDe, paraPng, LADO, type Paleta, type RGB } from './pintura'
import { estilo, CSS_ERA6 } from './estilo'
import { PainelRecolhivel } from './PainelRecolhivel'

// essencial = sempre à vista no painel da fita; o resto mora no "more" (AUDIT-UI-era6.md)
const MESTRE_UI: { p: keyof ParamsMestre; rotulo: string; min: number; max: number; log?: boolean; essencial?: boolean; fmt: (v: number) => string }[] = [
  { p: 'escuro', rotulo: 'tone', essencial: true, min: 400, max: 12000, log: true, fmt: v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}` },
  { p: 'wow', rotulo: 'wow', min: 0, max: 1, fmt: v => `${Math.round(v * 100)}%` },
  { p: 'estalo', rotulo: 'crackle', min: 0, max: 400, fmt: v => `${Math.round(v)}` },
  { p: 'chiado', rotulo: 'hiss', essencial: true, min: -80, max: -30, fmt: v => `${Math.round(v)}dB` },
  { p: 'sala', rotulo: 'space', min: 0, max: 1, fmt: v => `${Math.round(v * 100)}%` },
  { p: 'volume', rotulo: 'output', essencial: true, min: -30, max: 3, fmt: v => `${v.toFixed(0)}dB` },
]
// CC 1..8 do controlador → knobs da camada focada, nessa ordem
const CC_MAPA: NomeParam[] = ['pos', 'spray', 'tam', 'dens', 'pitch', 'lp', 'nivel', 'rev']

// fora do componente: sorteio e relógio são impuros, e a regra de pureza do React vigia o corpo
const sortearDe = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)]
const agora = () => performance.now()
const seedNova = () => Math.floor(Math.random() * 1e9)

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function Era6() {
  const motor = useRef<Motor | null>(null)
  const [itens, setItens] = useState<ItemBanco[]>([])
  const [erroBanco, setErroBanco] = useState<string | null>(null)
  const [ligado, setLigado] = useState(false)
  const [camadas, setCamadas] = useState<ParamsCamada[]>(() => Array.from({ length: N_CAMADAS }, () => ({ ...PADRAO })))
  const [derivas, setDerivas] = useState<Record<NomeParam, Deriva>[]>(() => Array.from({ length: N_CAMADAS }, derivaVazia))
  const [samples, setSamples] = useState<(string | null)[]>(() => Array(N_CAMADAS).fill(null))
  const [tipos, setTipos] = useState<TipoCamada[]>(() => Array(N_CAMADAS).fill('textura'))
  const [passoAgora, setPassoAgora] = useState<number[]>(() => Array(N_CAMADAS).fill(-1))
  // melodia escrita à mão (grade ou teclado do PC), por camada; vazia = melodia generativa
  const [frases, setFrases] = useState<NotaFrase[][]>(() => Array.from({ length: N_CAMADAS }, () => []))
  const [passoFrase, setPassoFrase] = useState<number[]>(() => Array(N_CAMADAS).fill(-1))
  const [gravandoFrase, setGravandoFrase] = useState(false)
  const [encaixe, setEncaixe] = useState(true)   // rec da grade: na batida (snap) ou no tempo da mão (free)
  const [mestre, setMestreUI] = useState<ParamsMestre>({ ...MESTRE_PADRAO })
  const [focada, setFocada] = useState(0)
  const [pisca, setPisca] = useState<boolean[]>(() => Array(N_CAMADAS).fill(false))
  const [medidas, setMedidas] = useState<Portao[]>([])
  const [cenas, setCenas] = useState<(Cena | null)[]>([null, null, null])
  const [morphS, setMorphS] = useState(13)
  const [cenasCores, setCenasCores] = useState<(RGB[] | null)[]>([null, null, null])
  const [morphInfo, setMorphInfo] = useState<{ alvo: number; x: number } | null>(null)
  const [fita, setFitaUI] = useState<string | null>(null)
  const [meus, setMeus] = useState<Preset[]>([])
  const [presetAtivo, setPresetAtivo] = useState<string>('')
  const [apagando, setApagando] = useState<string | null>(null)
  useEffect(() => { document.title = 'era6 granular desk' }, [])
  const [rec, setRec] = useState<{ ini: number; parar: () => Promise<Blob> } | null>(null)
  const [tempoRec, setTempoRec] = useState(0)
  const [ultima, setUltima] = useState<{ wav: Blob; sessao: Sessao; capa: Blob; cicatriz: Blob } | null>(null)
  const [nome, setNome] = useState('limbico')
  const [status, setStatus] = useState('')
  const [midi, setMidi] = useState<string | null>(null)
  const camadasRef = useRef(camadas)
  useEffect(() => { camadasRef.current = camadas }, [camadas])
  const morphRef = useRef<{ de: Cena; para: Cena; t0: number; dur: number; alvo: number } | null>(null)

  /* ── pintura (PLANO-visual-era6.md) ── */
  const telaRef = useRef<HTMLCanvasElement | null>(null)
  const cicatrizRef = useRef<HTMLCanvasElement | null>(null)
  const pintor = useRef<Pintor | null>(null)
  const paleta = useRef<Paleta | null>(null)
  const picos = useRef(new Map<string, Float32Array>())
  const itensRef = useRef(new Map<string, ItemBanco>())
  useEffect(() => { itensRef.current = new Map(itens.map(i => [i.id, i])) }, [itens])
  const corDe = useCallback((id: string | null): RGB => {
    const it = id ? itensRef.current.get(id) : undefined
    return it && paleta.current ? corDoSample(it.centroide_hz, it.flatness, paleta.current) : paleta.current?.neutro ?? [128, 128, 128]
  }, [])
  const telaPronta = useCallback((tela: HTMLCanvasElement, cic: HTMLCanvasElement) => {
    telaRef.current = tela
    cicatrizRef.current = cic
    paleta.current = lerPaleta()
    pintor.current = new Pintor(tela.getContext('2d')!, paleta.current, SEED, LADO_VIVO)
  }, [])
  const novoPintorEm = (seed: number) => {
    if (telaRef.current && paleta.current) pintor.current = new Pintor(telaRef.current.getContext('2d')!, paleta.current, seed, LADO_VIVO)
  }
  const pintarCicatrizAgora = useCallback((m: Motor | null, pt: Pintor | null, alvo: HTMLCanvasElement | OffscreenCanvas | null, amostras: (string | null)[]) => {
    if (!pt || !alvo || !paleta.current) return
    const pk = amostras.map((id, i) => {
      if (!id) return null
      if (!picos.current.has(id)) { const b = m?.bufferDa(i); if (b) picos.current.set(id, picosDe(b)) }
      return picos.current.get(id) ?? null
    })
    pintarCicatriz(alvo.getContext('2d') as CanvasRenderingContext2D, alvo.width, alvo.height, pk, pt.cicatriz, amostras.map(corDe), paleta.current)
  }, [corDe])

  /* banco */
  useEffect(() => {
    apiFetch('/api/era6/banco').then(r => {
      // 404 = backend no ar com código de antes da rota (keepAlive do jaques-os): reiniciar o 7panel-api
      if (r.status === 404) throw new Error('backend is outdated: restart 7panel-api in the hub')
      return r.json()
    }).then(d => {
      if (!d.existe) setErroBanco('sample bank is empty: run era6/_ferramentas/preparar_banco.py')
      setItens(d.itens ?? [])
    }).catch(e => setErroBanco(e instanceof TypeError ? 'backend offline (7panel-api on :5000)' : String(e.message ?? e)))
  }, [])

  /* ── ligar: contexto, motor, laço de agenda e medidor ── */
  const ligar = useCallback(async () => {
    await Tone.start()
    const m = new Motor()
    m.conhecer(itens)
    m.saida.toDestination()
    const tirar: number[] = []
    m.onGrao = (i, g, info) => {
      tirar.push(i)
      pintor.current?.grao(g, { camada: i, frac: info.frac, mao: info.mao, deriva: info.deriva, cor: corDe(info.sample) })
    }
    m.onEstalo = (_t, amp) => pintor.current?.estalo(amp)
    m.onTick = (_t, me) => pintor.current?.secar(me.sala, me.escuro)
    motor.current = m
    // estado atual da tela entra no motor
    camadas.forEach((c, i) => (Object.keys(c) as NomeParam[]).forEach(p => m.set(i, p, c[p])))
    derivas.forEach((d, i) => (Object.keys(d) as NomeParam[]).forEach(p => m.setDeriva(i, p, d[p])))
    ;(Object.keys(mestre) as (keyof ParamsMestre)[]).forEach(p => m.setMestre(p, mestre[p]))
    tipos.forEach((t, i) => m.setTipo(i, t))
    frases.forEach((f, i) => m.setFrase(i, f))
    for (let i = 0; i < samples.length; i++) if (samples[i]) await m.setSample(i, samples[i])
    if (fita) await m.setFita(fita)
    m.iniciar()
    setLigado(true)

    const raw = Tone.getContext().rawContext as AudioContext
    const an = raw.createAnalyser()
    an.fftSize = 4096
    an.smoothingTimeConstant = 0.6
    Tone.connect(m.saida, an)
    const esp = new Float32Array(an.frequencyBinCount)
    const onda = new Float32Array(an.fftSize)
    const hist: number[] = []
    const ataques = new ContadorAtaques()
    const inicio = Tone.now()
    let acc: ReturnType<typeof medirEspectro> | null = null
    let n = 0

    const agenda = setInterval(() => { m.processar(Tone.now() + 0.15) }, 25)
    const leitura = setInterval(() => {
      an.getFloatFrequencyData(esp)
      an.getFloatTimeDomainData(onda)
      let s = 0
      for (let i = 0; i < onda.length; i++) s += onda[i] * onda[i]
      const rms = 10 * Math.log10(s / onda.length + 1e-12)
      if (rms > -90) {
        hist.push(rms)
        if (hist.length > 600) hist.shift()   // 60 s a 10 Hz
        const e = medirEspectro(esp, raw.sampleRate)
        // média móvel de ~3 s: número de medidor que não pula a cada grão
        acc = acc ? { centroide: acc.centroide * 0.97 + e.centroide * 0.03, grave: acc.grave * 0.97 + e.grave * 0.03, agudo: acc.agudo * 0.97 + e.agudo * 0.03 } : e
      }
      ataques.alimentar(esp, Tone.now())
      if (++n % 5 === 0 && acc) setMedidas(portoes(acc, dinamica(hist), ataques.porMinuto(Tone.now(), inicio)))
      if (n % 5 === 0) pintarCicatrizAgora(m, pintor.current, cicatrizRef.current, m.camadas.map(c => c.sample))
      // LED por camada
      if (tirar.length) {
        const vistos = new Set(tirar.splice(0))
        const novo = Array.from({ length: N_CAMADAS }, (_, i) => vistos.has(i))
        // só re-renderiza a mesa quando algum LED muda
        setPisca(p => (p.every((x, i) => x === novo[i]) ? p : novo))
      } else setPisca(p => (p.some(Boolean) ? Array(N_CAMADAS).fill(false) : p))
      // passo aceso da percussão: só re-renderiza quando algum muda
      const passos = m.camadas.map((_, i) => m.passoAtual(i))
      setPassoAgora(p => (p.every((x, i) => x === passos[i]) ? p : passos))
      const pf = m.camadas.map((c, i) => (c.tipo === 'melodia' && c.buf ? Math.floor(m.posicaoFrase(i)) : -1))
      setPassoFrase(p => (p.every((x, i) => x === pf[i]) ? p : pf))
      // morph de cena: a tela manda cada passo pro motor como se fosse a mão (e entra na gravação)
      const mo = morphRef.current
      if (mo) {
        const x = Math.min(1, (agora() - mo.t0) / (mo.dur * 1000))
        const alvo = morph(mo.de, mo.para, x)
        const atual = camadasRef.current
        alvo.forEach((c, i) => (Object.keys(c) as NomeParam[]).forEach(p => {
          if (Math.abs(c[p] - atual[i][p]) > 1e-4) m.set(i, p, c[p])
        }))
        setCamadas(alvo)
        setMorphInfo(x >= 1 ? null : { alvo: mo.alvo, x })
        if (x >= 1) morphRef.current = null
      }
    }, 100)
    return () => { clearInterval(agenda); clearInterval(leitura) }
  }, [itens, camadas, derivas, mestre, samples, tipos, frases, fita, corDe, pintarCicatrizAgora])

  const pararTudo = useRef<(() => void) | null>(null)
  const alternar = async () => {
    if (ligado) {
      pararTudo.current?.()
      motor.current?.dispose()
      motor.current = null
      setLigado(false)
      return
    }
    pararTudo.current = await ligar()
  }
  useEffect(() => () => { pararTudo.current?.(); motor.current?.dispose() }, [])

  /* ── mão ── */
  const setParam = useCallback((i: number, p: NomeParam, v: number) => {
    const val = prender(p, v)
    setCamadas(cs => cs.map((c, k) => (k === i ? { ...c, [p]: val } : c)))
    motor.current?.set(i, p, val)
    morphRef.current = null   // mão manda: morph em andamento para
    setMorphInfo(null)
  }, [])
  const setDeriva = (i: number, p: NomeParam, d: Deriva) => {
    setDerivas(ds => ds.map((x, k) => (k === i ? { ...x, [p]: d } : x)))
    motor.current?.setDeriva(i, p, d)
  }
  const setSample = async (i: number, id: string | null) => {
    setSamples(s => s.map((x, k) => (k === i ? id : x)))
    try { await motor.current?.setSample(i, id) } catch (e) { setStatus(String(e)) }
  }
  const setFrase = useCallback((i: number, f: NotaFrase[]) => {
    setFrases(fs => fs.map((x, k) => (k === i ? f : x)))
    motor.current?.setFrase(i, f)
  }, [])
  const setTipo = (i: number, t: TipoCamada) => {
    setTipos(ts => ts.map((x, k) => (k === i ? t : x)))
    motor.current?.setTipo(i, t)
  }
  // o banco etiqueta cada trecho; cada tipo de camada puxa o seu
  const DO_TIPO: Record<TipoCamada, (x: ItemBanco) => boolean> = {
    // textura e ruído: tonal puro sustentado vira mosquito (regra da casa)
    textura: x => x.tipo === 'textura' || x.tipo === 'ruido',
    melodia: x => x.tipo === 'tonal',
    percussao: x => x.tipo === 'transiente',
  }
  const sortear = (i: number) => {
    const pool = itens.filter(DO_TIPO[tipos[i]])
    const lista = pool.length ? pool : itens
    if (lista.length) setSample(i, sortearDe(lista).id)
  }
  // 🔀: sorteia os knobs e manda cada um pela mão (entra na gravação da sessão)
  const aleatorio = (i: number) => {
    const novo = sortearParams(camadasRef.current[i], rng(seedNova()))
    for (const p of Object.keys(novo) as NomeParam[]) {
      if (novo[p] !== camadasRef.current[i][p]) setParam(i, p, novo[p])
    }
  }
  const setFita = async (id: string | null) => {
    setFitaUI(id)
    try { await motor.current?.setFita(id) } catch (e) { setStatus(String(e)) }
  }

  /* ── presets e 🎲 geral: tudo passa pela mão, então entra na gravação da sessão ── */
  useEffect(() => {
    apiFetch('/api/era6/presets').then(r => (r.ok ? r.json() : { presets: [] })).then(d => setMeus(d.presets ?? [])).catch(() => {})
  }, [])
  const aplicarPreset = async (p: Preset) => {
    morphRef.current = null
    setMorphInfo(null)
    const faltando = p.samples.filter(id => id && !itensRef.current.has(id))
    for (let i = 0; i < N_CAMADAS; i++) {
      const c = { ...PADRAO, ...(p.camadas[i] ?? {}) }
      for (const k of Object.keys(c) as NomeParam[]) setParam(i, k, c[k])
      const d = p.derivas[i]
      if (d) for (const k of Object.keys(d) as NomeParam[]) setDeriva(i, k, d[k])
      const id = p.samples[i] && itensRef.current.has(p.samples[i]!) ? p.samples[i] : null
      setTipo(i, p.tipos?.[i] ?? 'textura')
      setFrase(i, p.frases?.[i] ?? [])
      await setSample(i, id)
    }
    for (const k of Object.keys(p.mestre) as (keyof ParamsMestre)[]) setMestre(k, p.mestre[k])
    await setFita(p.fita && itensRef.current.has(p.fita) ? p.fita : null)
    setPresetAtivo(p.nome)
    setStatus(faltando.length ? `${p.nome}: ${faltando.length} sample(s) missing from the bank` : `preset: ${p.nome}`)
  }
  const salvarPreset = async () => {
    const nomeP = presetAtivo && !PRESETS_FABRICA.some(x => x.nome === presetAtivo) ? presetAtivo : `${nome} ${meus.length + 1}`
    const p: Preset = { nome: nomeP, camadas, derivas, samples, tipos, frases, mestre, fita }
    const r = await apiFetch('/api/era6/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
    if (!r.ok) { setStatus('preset not saved: restart 7panel-api in the hub'); return }
    setMeus(ms => [...ms.filter(x => x.nome !== nomeP), p])
    setPresetAtivo(nomeP)
    setStatus(`preset saved: ${nomeP}`)
  }
  const apagarPreset = async (nomeP: string) => {
    await apiFetch(`/api/era6/presets/${encodeURIComponent(nomeP)}`, { method: 'DELETE' })
    setMeus(ms => ms.filter(x => x.nome !== nomeP))
    if (presetAtivo === nomeP) setPresetAtivo('')
  }
  const sortearTudo = () => {
    if (!itens.length) return
    aplicarPreset(sortearMesa(itens, rng(seedNova()), mestre))
  }

  const setMestre = (p: keyof ParamsMestre, v: number) => {
    setMestreUI(m => ({ ...m, [p]: v }))
    motor.current?.setMestre(p, v)
  }

  /* MIDI: CC 1..8 → camada focada; nota → pitch relativo ao C4 */
  const focadaRef = useRef(focada)
  useEffect(() => { focadaRef.current = focada }, [focada])

  /*
   * Teclado do PC → melodia da camada focada (sem MIDI): A S D F G H J K = graus da escala, de baixo
   * pra cima, então não tem nota errada. Tocar é sempre livre: a nota soa na hora e segura enquanto a
   * tecla está apertada (com o REC geral ligado, entra na sessão no tempo exato). Com o rec da grade,
   * a nota também vai pro loop: `snap` encaixa na batida, `free` guarda o tempo e o tamanho da mão.
   */
  const tiposRef = useRef(tipos)
  useEffect(() => { tiposRef.current = tipos }, [tipos])
  const gravandoFraseRef = useRef(gravandoFrase)
  useEffect(() => { gravandoFraseRef.current = gravandoFrase }, [gravandoFrase])
  const encaixeRef = useRef(encaixe)
  useEffect(() => { encaixeRef.current = encaixe }, [encaixe])
  useEffect(() => {
    // tecla → onde desceu (passo fracionário, -1 se o rec da grade estava desligado), camada e soltar
    const segurando = new Map<string, { ini: number; camada: number; soltar: () => void }>()
    const digitando = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const desce = (e: KeyboardEvent) => {
      if (e.repeat || digitando(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const tecla = e.key.toLowerCase()
      const g = TECLAS.indexOf(tecla)
      const i = focadaRef.current
      const m = motor.current
      if (g < 0 || !m || tiposRef.current[i] !== 'melodia' || segurando.has(tecla)) return
      if (g > (ESCALAS[camadasRef.current[i].escala] ?? ESCALAS[0]).semitons.length) return
      e.preventDefault()
      segurando.set(tecla, { ini: gravandoFraseRef.current ? m.posicaoFrase(i) : -1, camada: i, soltar: m.tocarLivre(i, g) })
    }
    const sobe = (e: KeyboardEvent) => {
      const tecla = e.key.toLowerCase()
      const h = segurando.get(tecla)
      const m = motor.current
      if (!h) return
      segurando.delete(tecla)
      h.soltar()
      if (h.ini < 0 || !m) return
      const i = h.camada
      let fim = m.posicaoFrase(i)
      if (fim < h.ini) fim += PASSOS_FRASE   // a tecla atravessou o fim do loop
      const livre = !encaixeRef.current
      const passo = livre ? h.ini : Math.round(h.ini) % PASSOS_FRASE
      const len = livre ? fim - h.ini : Math.max(1, Math.round(fim - h.ini))
      // updater funcional: duas teclas soltas juntas não se atropelam
      setFrases(fs => {
        const nova = escreverNota(fs[i], passo, TECLAS.indexOf(tecla), len, livre)
        motor.current?.setFrase(i, nova)
        return fs.map((x, k) => (k === i ? nova : x))
      })
    }
    // janela perdeu o foco com tecla apertada: solta tudo (senão a nota fica presa soando)
    const perdeu = () => { for (const h of segurando.values()) h.soltar(); segurando.clear() }
    window.addEventListener('keydown', desce)
    window.addEventListener('keyup', sobe)
    window.addEventListener('blur', perdeu)
    return () => {
      window.removeEventListener('keydown', desce)
      window.removeEventListener('keyup', sobe)
      window.removeEventListener('blur', perdeu)
      perdeu()
    }
  }, [])
  const ligarMidi = async () => {
    const acc = await requestMIDIAccess()
    const entrada = acc ? listMIDIInputs(acc)[0] : null
    if (!entrada) { setMidi('no controller'); return }
    const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    createMIDIListener({
      noteOn: nota => {
        const m = /^([A-G]#?)(-?\d+)$/.exec(nota)
        if (m) setParam(focadaRef.current, 'pitch', NOTAS.indexOf(m[1]) + (Number(m[2]) - 4) * 12)
      },
      noteOff: () => {},
      cc: (cc, v) => {
        const p = CC_MAPA[cc - 1]
        if (!p) return
        const { min, max, log } = FAIXA[p]
        const x = v / 127
        setParam(focadaRef.current, p, log ? min * Math.pow(max / min, x) : min + (max - min) * x)
      },
    }).start(entrada)
    setMidi(entrada.name ?? 'midi')
  }

  /* ── cenas ── */
  const guardarCena = (k: number) => {
    setCenas(cs => cs.map((c, i) => (i === k ? camadas.map(x => ({ ...x })) : c)))
    setCenasCores(cs => cs.map((c, i) => (i === k ? samples.map(corDe) : c)))
  }
  const irCena = (k: number) => {
    const alvo = cenas[k]
    if (!alvo) return
    morphRef.current = { de: camadas.map(x => ({ ...x })), para: alvo, t0: agora(), dur: morphS, alvo: k }
  }

  /* ── REC e export ── */
  useEffect(() => {
    if (!rec) return
    const id = setInterval(() => setTempoRec(Tone.now() - rec.ini), 250)
    return () => clearInterval(id)
  }, [rec])

  const alternarRec = async () => {
    const m = motor.current
    if (!m) return
    if (!rec) {
      const raw = Tone.getContext().rawContext as AudioContext
      const dest = raw.createMediaStreamDestination()
      Tone.connect(m.saida, dest)
      const seed = seedNova()
      const ini = m.comecarSessao(seed)
      novoPintorEm(seed)
      const g = await gravar(dest.stream)
      setRec({ ini, parar: async () => { const b = await g.parar(); m.saida.disconnect(dest); return b } })
      setStatus('recording')
      return
    }
    const sessao = m.terminarSessao()!
    const wav = await rec.parar()
    setRec(null)
    pintarCicatrizAgora(m, pintor.current, cicatrizRef.current, m.camadas.map(c => c.sample))
    // a tela ao vivo é 512: a capa sobe pra 2048 pra manter o tamanho do arquivo (o export 48k repinta nítido)
    const capa = await paraPng(telaRef.current!, mestre.chiado, sessao.seed, LADO)
    const cicatriz = await paraPng(cicatrizRef.current!)
    setUltima({ wav, sessao, capa, cicatriz })
    setStatus('take ready: save live or export 48k')
  }

  const salvar = async (wav: Blob, sessao: Sessao, sufixo: string, capa?: Blob, cicatriz?: Blob) => {
    const fd = new FormData()
    fd.append('audio', wav, 'era6.wav')
    if (capa) fd.append('capa', capa, 'capa.png')
    if (cicatriz) fd.append('cicatriz', cicatriz, 'cicatriz.png')
    // como arquivo: campo de texto acima de 500 KB volta 413 do Flask (take longa)
    fd.append('sessao', new Blob([JSON.stringify(sessao)], { type: 'application/json' }), 'sessao.json')
    fd.append('nome', `${nome}${sufixo}`)
    fd.append('dur_s', String(sessao.dur_s))
    const r = await apiFetch('/api/era6/salvar', { method: 'POST', body: fd })
    // erro do servidor pode vir em HTML (413, 500): mostra o status em vez de quebrar no parse
    const d = await r.json().catch(() => null)
    if (!r.ok || !d) { setStatus(`not saved: ${d?.error ?? `server ${r.status}`}`); return }
    setStatus(`saved ${d.nome}.wav${d.avisos.length ? ` (check license: ${d.avisos.length} sample(s))` : ''}`)
  }

  const exportar = async () => {
    if (!ultima) return
    setStatus('rendering offline')
    try {
      // o offline repinta a sessão num canvas fora da tela, com a mesma seed: capa e áudio batem
      const s = ultima.sessao
      const off = new OffscreenCanvas(LADO, LADO)
      const pt = new Pintor(off.getContext('2d')!, paleta.current ?? lerPaleta(), s.seed)
      const buf = await renderOffline(s, itens, 48000, {
        onGrao: (i, g, info) => pt.grao(g, { camada: i, frac: info.frac, mao: info.mao, deriva: info.deriva, cor: corDe(info.sample) }),
        onEstalo: (_t, amp) => pt.estalo(amp),
        onTick: (_t, me) => pt.secar(me.sala, me.escuro),
      })
      const offCic = new OffscreenCanvas(LADO, CICATRIZ_ALTURA)
      const usados = s.inicial.samples
      pintarCicatrizAgora(null, pt, offCic, usados)
      await salvar(encodeWav(buf), s, '', await paraPng(off, s.inicial.mestre.chiado, s.seed), await paraPng(offCic))
    } catch (e) { setStatus(`export failed: ${e}`) }
  }

  const f = camadas[focada]
  const noAlvo = medidas.filter(g => g.ok).length
  const nomeFocada = samples[focada]?.split('/')[1]
  const knobMestre = (k: (typeof MESTRE_UI)[number]) => (
    <VintageKnob key={k.p} label={k.rotulo} min={k.min} max={k.max} log={k.log} value={mestre[k.p]} size={52} fmt={k.fmt}
      onChange={v => setMestre(k.p, v)} />
  )
  return (
    <main className="era6" style={{ minHeight: '100vh', background: 'var(--vintage-surface-1)', color: 'var(--vintage-label)', padding: 20, font: '400 12px/1.4 var(--font-vintage-mono, monospace)' }}>
      <style>{CSS_ERA6}</style>
      <header style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ font: '600 16px/1 var(--font-vintage-display, sans-serif)', letterSpacing: '0.12em', margin: 0, marginRight: 12 }}>ERA6 GRANULAR DESK</h1>
        <button type="button" onClick={alternar} disabled={!itens.length} style={estilo.primario(ligado, !itens.length)}>
          {ligado ? <Square size={12} /> : <Play size={12} />} {ligado ? 'stop' : 'start'}
        </button>
        {erroBanco && <span style={{ color: 'var(--vintage-meter-red)' }}>{erroBanco}</span>}
        {ligado && (
          <button type="button" onClick={alternarRec} style={{ ...estilo.botao(!!rec), color: rec ? 'var(--vintage-meter-red)' : undefined }}>
            <VintageLed color="red" size="sm" active={!!rec} pulse={!!rec} /> {rec ? `rec ${mmss(tempoRec)}` : 'rec'}
          </button>
        )}
        {ultima && !rec && (
          // só existe depois de gravar: antes disso não há o que nomear, salvar ou exportar
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '3px 3px 3px 10px', border: '1px solid var(--vintage-border)' }}>
            <span style={estilo.rotulo}>last take {mmss(ultima.sessao.dur_s)}</span>
            <label style={{ ...estilo.rotulo, fontSize: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
              name
              <input value={nome} onChange={e => setNome(e.target.value)}
                style={{ padding: '5px 8px', background: 'var(--vintage-surface-2)', border: '1px solid var(--vintage-border)', color: 'var(--vintage-label)', font: '400 12px/1 var(--font-vintage-mono, monospace)', letterSpacing: 0, textTransform: 'none', width: 140 }} />
            </label>
            <button type="button" onClick={() => salvar(ultima.wav, ultima.sessao, '-live', ultima.capa, ultima.cicatriz)} style={estilo.botao(false)}>
              <Save size={12} /> save live
            </button>
            <button type="button" onClick={exportar} style={estilo.botao(false)}>
              <Download size={12} /> export 48k
            </button>
          </div>
        )}
        <span style={{ ...estilo.rotulo, marginLeft: 'auto' }}>{status}</span>
      </header>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div style={{ display: 'grid', gap: 8, alignContent: 'start', minWidth: 0 }}>
          {/* fechada, a pintura continua pintando escondida: a capa do REC não perde nada */}
          <PainelRecolhivel titulo="visual" abertoInicial chave="visual" manterMontado rotulos={['show', 'hide']}
            avancado={<Tela onPronto={telaPronta} />} />
          {camadas.map((c, i) => (
            <FaixaCamada key={i} indice={i} tipo={tipos[i]} params={c} derivas={derivas[i]} sample={samples[i]} itens={itens}
              focada={focada === i} piscando={pisca[i]} passoAtual={passoAgora[i]} onTipo={t => setTipo(i, t)}
              frase={frases[i]} passoFrase={passoFrase[i]} gravandoFrase={gravandoFrase && focada === i}
              encaixe={encaixe} onEncaixe={() => setEncaixe(x => !x)}
              onFrase={f => setFrase(i, f)} onPrevia={g => motor.current?.previa(i, g)}
              onRecFrase={() => {
                // rec vale pra camada focada: ligar numa camada também foca nela
                setFocada(i)
                setGravandoFrase(r => !(r && focada === i))
                if (!ligado) setStatus('press start to hear and record the melody')
              }}
              onParam={(p, v) => {
                setParam(i, p, v)
                // girar pulses ou rotate volta o padrão pro Euclides
                if ((p === 'pulsos' || p === 'giro') && c.mascara) setParam(i, 'mascara', 0)
              }}
              onDeriva={(p, d) => setDeriva(i, p, d)}
              onSample={id => setSample(i, id)} onFocar={() => setFocada(i)} onSortear={() => sortear(i)} onAleatorio={() => aleatorio(i)} />
          ))}
        </div>

        {/* ordem do aside: começo (preset), variação (cena), gesto (XY), acabamento (fita), checagem (medidor) */}
        <aside style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <PainelRecolhivel titulo="presets" acoes={
            <button type="button" onClick={salvarPreset} aria-label="save the desk as a preset" title="save the desk as a preset" style={estilo.botaoIcone()}>
              <Save size={13} />
            </button>
          }>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button type="button" onClick={sortearTudo} disabled={!itens.length} title="randomize the whole desk: samples, knobs, drift and tape"
                style={{ ...estilo.botao(false, !itens.length), padding: '4px 8px' }}>
                <Dice5 size={12} /> random
              </button>
              {[...PRESETS_FABRICA, ...meus].map(p => (
                <span key={p.nome} className="era6-item" style={{ display: 'inline-flex', position: 'relative' }}>
                  <button type="button" onClick={() => aplicarPreset(p)} style={{ ...estilo.botao(presetAtivo === p.nome), padding: '4px 8px' }}>{p.nome}</button>
                  {!p.fabrica && (
                    <button type="button" className="era6-so-hover" aria-label={`delete ${p.nome}`} title={`delete ${p.nome}`}
                      onClick={() => setApagando(p.nome)} style={estilo.botaoIcone()}><Trash2 size={11} /></button>
                  )}
                </span>
              ))}
            </div>
          </PainelRecolhivel>

          <Cenas cenas={cenas} cores={cenasCores} morphS={morphS} progresso={morphInfo?.x ?? null} alvo={morphInfo?.alvo ?? null}
            onGuardar={guardarCena} onIr={irCena} onTempo={setMorphS} />

          <PainelRecolhivel titulo={`layer ${focada + 1}`}
            resumo={<span style={{ color: 'var(--vintage-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeFocada ?? 'empty'}</span>}
            acoes={
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="MIDI" title={midi ? `MIDI: ${midi}` : 'MIDI'} style={estilo.botaoIcone(!!midi)}><Cable size={13} /></button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 border-vintage-border bg-vintage-surface-2 text-vintage-label">
                  <div style={{ display: 'grid', gap: 8, font: '400 11px/1.5 var(--font-vintage-mono, monospace)' }}>
                    <button type="button" onClick={ligarMidi} style={estilo.botao(!!midi)}>{midi ? `connected: ${midi}` : 'connect controller'}</button>
                    <span style={estilo.rotulo}>focused layer</span>
                    {CC_MAPA.map((p, k) => (
                      <span key={p} style={{ display: 'flex', justifyContent: 'space-between' }}><span>CC {k + 1}</span><span>{FAIXA[p].rotulo}</span></span>
                    ))}
                    <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>notes</span><span>pitch</span></span>
                  </div>
                </PopoverContent>
              </Popover>
            }>
            <VintageXYPad size={268} value={{ x: f.pos, y: f.spray }} labelX="position" labelY="spray"
              onChange={(x, y) => { setParam(focada, 'pos', x); setParam(focada, 'spray', y) }} />
          </PainelRecolhivel>

          <PainelRecolhivel titulo="tape"
            resumo={<span style={{ color: 'var(--vintage-text-muted)', fontSize: 11 }}>{fita ? fita.split('/')[1] : ''}</span>}
            avancado={<>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ ...estilo.rotulo, fontSize: 9 }}>source</span>
                <SeletorSample itens={itens} atual={fita} onEscolher={setFita} vazio="synthetic hiss" />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>{MESTRE_UI.filter(k => !k.essencial).map(knobMestre)}</div>
            </>}>
            <div style={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}>{MESTRE_UI.filter(k => k.essencial).map(knobMestre)}</div>
          </PainelRecolhivel>

          <PainelRecolhivel titulo="meter"
            resumo={medidas.length
              ? <><VintageLed color={noAlvo === medidas.length ? 'green' : noAlvo >= 3 ? 'yellow' : 'red'} size="sm" active />
                <span style={{ color: 'var(--vintage-value)' }}>{noAlvo} of {medidas.length} on target</span></>
              : <span style={{ color: 'var(--vintage-text-dim)' }}>start and play to measure</span>}
            avancado={medidas.length ? medidas.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <VintageLed color={g.ok ? 'green' : 'red'} size="sm" active />
                <span style={{ flex: 1 }}>{g.rotulo}</span>
                <span style={{ color: 'var(--vintage-value)' }}>{g.fmt}</span>
                <span style={{ ...estilo.rotulo, fontSize: 9, width: 72, textAlign: 'right' }}>{g.alvo}</span>
              </div>
            )) : undefined} />
        </aside>
      </div>

      <Dialog open={!!apagando} onOpenChange={o => { if (!o) setApagando(null) }}>
        <DialogContent className="border-vintage-border bg-vintage-surface-2 text-vintage-label">
          <DialogHeader>
            <DialogTitle>Delete preset "{apagando}"?</DialogTitle>
            <DialogDescription>It is removed from era6/_presets.json. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setApagando(null)} style={estilo.botao(false)}>cancel</button>
            <button type="button" onClick={async () => { if (apagando) await apagarPreset(apagando); setApagando(null) }}
              style={{ ...estilo.botao(false), color: 'var(--vintage-meter-red)', borderColor: 'var(--vintage-meter-red)' }}>
              <Trash2 size={12} /> delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
