/**
 * Motor de áudio da /final: o projeto vira grafo Tone e toca no Transport.
 *
 * `montar()` é a ÚNICA função que sabe transformar projeto em som, e roda igual ao vivo
 * e dentro do `Tone.Offline` do export. Duas cópias desse caminho seriam o bug do overlap
 * de novo (ver memória "esteira de triagem"): o que você ouve e o que o WAV grava saem
 * da mesma conta.
 *
 * Mexer em volume/pan/mudo/solo/FX não remonta nada (é só parâmetro do canal). Mexer em
 * clipe, nota ou instrumento remonta; tocando, o motor para, remonta e volta do mesmo
 * ponto, porque fonte sincronizada criada com o Transport andando perde o começo.
 */
import * as Tone from 'tone'
import { resolveUrl } from '../lib/api'
import { gravar } from '../era6/gravador'
import { irDeSala } from '../era6/motor'
import { FAIXA } from '../era6/modelo'
import { createFxChain, disposeFxChain, updateFxChain, type FxChain, type FxParams } from '../lib/fx-rack'
import { audivel, pontosOrdenados, valorAutomacao, type Instrumento, type Projeto, type Trilha } from './modelo'

/* ── buffers ── */

const cacheBuf = new Map<string, Promise<AudioBuffer>>()

export function carregarBuffer(caminho: string): Promise<AudioBuffer> {
  let p = cacheBuf.get(caminho)
  if (!p) {
    p = fetch(resolveUrl(`/api/mix/file?path=${encodeURIComponent(caminho)}`))
      .then(r => { if (!r.ok) throw new Error(`${r.status} ao abrir ${caminho}`); return r.arrayBuffer() })
      .then(ab => Tone.getContext().rawContext.decodeAudioData(ab))
    p.catch(() => cacheBuf.delete(caminho))
    cacheBuf.set(caminho, p)
  }
  return p
}

const cachePicos = new WeakMap<AudioBuffer, Float32Array>()
const PICOS_POR_S = 50

/** Pico absoluto a cada 20 ms, calculado uma vez por arquivo: a forma de onda desenha disso. */
export function picosDe(buf: AudioBuffer): Float32Array {
  let p = cachePicos.get(buf)
  if (p) return p
  const passo = Math.max(1, Math.floor(buf.sampleRate / PICOS_POR_S))
  const n = Math.ceil(buf.length / passo)
  p = new Float32Array(n)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) {
      let m = p[i]
      const fim = Math.min(d.length, (i + 1) * passo)
      for (let k = i * passo; k < fim; k += 4) { const v = Math.abs(d[k]); if (v > m) m = v }
      p[i] = m
    }
  }
  cachePicos.set(buf, p)
  return p
}
export { PICOS_POR_S }

/** Tudo que o projeto precisa carregado: arquivos de clipe e amostras de instrumento. */
export function arquivosDo(p: Projeto): string[] {
  const s = new Set<string>()
  for (const t of p.trilhas) {
    if (t.amostra) s.add(t.amostra)
    for (const c of t.clipes) if (c.arquivo) s.add(c.arquivo)
  }
  return [...s]
}

export async function carregarTodos(p: Projeto): Promise<Map<string, AudioBuffer>> {
  const arqs = arquivosDo(p)
  const bufs = await Promise.all(arqs.map(carregarBuffer))
  return new Map(arqs.map((a, i) => [a, bufs[i]]))
}

/* ── instrumentos ── */

type Voz = Tone.PolySynth | Tone.Sampler

function criarInstrumento(inst: Instrumento | undefined, amostra: AudioBuffer | undefined, raiz = 0): { voz: Voz; saida: Tone.ToneAudioNode; extras: Tone.ToneAudioNode[] } {
  // escuro por padrão (alvo da era6: quase nada acima de 2 kHz)
  const lp = new Tone.Filter({ type: 'lowpass', frequency: 2400, rolloff: -12 })
  let voz: Voz
  switch (inst) {
    case 'seno':
      voz = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.7, release: 1.6 } })
      break
    case 'sino':
      voz = new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01, modulationIndex: 8,
        envelope: { attack: 0.002, decay: 2.2, sustain: 0, release: 2.2 },
        modulationEnvelope: { attack: 0.002, decay: 0.8, sustain: 0, release: 0.8 },
      })
      lp.frequency.value = 4000
      break
    case 'pluck':
      voz = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.5, sustain: 0, release: 0.5 } })
      break
    case 'baixo':
      voz = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsine', count: 2, spread: 12 } as never, envelope: { attack: 0.03, decay: 0.4, sustain: 0.8, release: 0.8 } })
      lp.frequency.value = 600
      break
    case 'sample':
    default:
      if (inst === 'sample' && amostra) {
        voz = new Tone.Sampler({ urls: { [60 + raiz]: new Tone.ToneAudioBuffer(amostra) }, attack: 0.02, release: 1.5 })
        break
      }
      // pad (e o 'sample' ainda sem amostra escolhida)
      voz = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fattriangle', count: 3, spread: 18 } as never, envelope: { attack: 0.9, decay: 1, sustain: 0.8, release: 3.5 } })
  }
  if (voz instanceof Tone.PolySynth) voz.maxPolyphony = 24
  voz.connect(lp)
  return { voz, saida: lp, extras: [lp] }
}

/* ── FX da trilha ── */

/** Corte no máximo da faixa da era6 = filtro aberto (não pinta nada). */
export const freqCorte = (corte: number | undefined) => (corte === undefined || corte >= FAIXA.lp.max ? 20000 : corte)

// a IR custa 6 s de ruído por canal; uma por sample rate serve ao vivo e ao export
const irs = new Map<number, AudioBuffer>()
function irCasa(ctx: BaseAudioContext) {
  let b = irs.get(ctx.sampleRate)
  if (!b) { b = irDeSala(ctx); irs.set(ctx.sampleRate, b) }
  return b
}

/* ── rack da trilha ── */

/** O rack da SynthPanel em posição neutra: tudo seco, nada colore. */
export const FX_NEUTRO: FxParams = {
  drive: 0, bite: 1, cutoff: 18000, resonance: 0.7, crush: 12, chorus: 0, phaser: 0,
  delay: 0, delayTime: 0.4, delayFb: 0.35, shimmer: 0, reverbWet: 0, reverbDecay: 6, denoise: 0, vol: 1,
}
export const fxDe = (t: Trilha): FxParams => ({ ...FX_NEUTRO, ...t.fx })

type Rack = { cadeia: FxChain; valores: FxParams }

// a curva do Tone.Distortion em drive 0 é x/3 (−9,5 dB): sem drive, o molhado sai
function aplicarDrive(c: FxChain, drive: number) { c.distortion.wet.value = drive > 0.001 ? 1 : 0 }

function atualizarRack(r: Rack, alvo: FxParams) {
  const patch: Partial<FxParams> = {}
  for (const k of Object.keys(alvo) as (keyof FxParams)[]) if (alvo[k] !== r.valores[k]) patch[k] = alvo[k]
  if (!Object.keys(patch).length) return
  updateFxChain(r.cadeia, patch)
  if (patch.drive !== undefined) aplicarDrive(r.cadeia, patch.drive)
  r.valores = alvo
}

/* ── grafo ── */

export type Montagem = {
  canais: Map<string, Tone.Channel>
  cortes: Map<string, Tone.Filter>
  envios: Map<string, Tone.Gain>
  racks: Map<string, Rack>
  eqs: Map<string, Tone.EQ3>
  medidores: Map<string, Tone.Meter>
  vozes: Map<string, Voz>
  master: Tone.Volume
  medidorMaster: Tone.Meter
  analisador: AnalyserNode | null
  automatizadas: Set<string>
  dispose: () => void
}

/**
 * Projeto → grafo, no contexto Tone corrente (ao vivo ou o do `Tone.Offline`).
 * As fontes ficam presas no Transport desse contexto.
 */
export function montar(p: Projeto, bufs: Map<string, AudioBuffer>, comMedidores = true): Montagem {
  const nos: { dispose: () => unknown }[] = []
  const master = new Tone.Volume(p.master)
  // teto em −0,9 dBFS no master: export nunca sai clipado
  const limitador = new Tone.Limiter(-0.9).toDestination()
  master.connect(limitador)
  const medidorMaster = new Tone.Meter({ smoothing: 0.8, channelCount: 1 })
  if (comMedidores) master.connect(medidorMaster)
  nos.push(master, limitador, medidorMaster)

  // espectro do master pros portões da era6 (centroide, grave, agudo, dinâmica, ataques)
  let analisador: AnalyserNode | null = null
  if (comMedidores) {
    analisador = Tone.getContext().rawContext.createAnalyser() as AnalyserNode
    analisador.fftSize = 4096
    analisador.smoothingTimeConstant = 0.6
    Tone.connect(master, analisador)
  }
  const transport = Tone.getTransport()
  const desligar: (() => void)[] = []
  const automatizadas = new Set<string>()

  // reverb da casa (o "space" da era6): envio paralelo, o seco nunca perde volume.
  // predelay de 89 ms e sem grave no molhado, igual à mesa da era6
  const salaPre = new Tone.Delay(0.089, 0.2)
  const salaConv = new Tone.Convolver()
  salaConv.normalize = false
  salaConv.buffer = new Tone.ToneAudioBuffer(irCasa(Tone.getContext().rawContext as BaseAudioContext))
  const salaHp = new Tone.Filter({ type: 'highpass', frequency: 200 })
  salaPre.chain(salaConv, salaHp, master)
  nos.push(salaPre, salaConv, salaHp)

  const ouve = audivel(p.trilhas)
  const canais = new Map<string, Tone.Channel>()
  const cortes = new Map<string, Tone.Filter>()
  const envios = new Map<string, Tone.Gain>()
  const racks = new Map<string, Rack>()
  const eqs = new Map<string, Tone.EQ3>()
  const medidores = new Map<string, Tone.Meter>()
  const vozes = new Map<string, Voz>()

  for (const t of p.trilhas) {
    const ch = new Tone.Channel({ volume: t.volume, pan: t.pan, mute: !ouve.has(t.id) }).connect(master)
    // FX: corte antes do fader; o envio sai depois dele (mudo e fader valem pro molhado também)
    const corte = new Tone.Filter({ type: 'lowpass', frequency: freqCorte(t.corte), rolloff: -12 }).connect(ch)
    const envio = new Tone.Gain(t.sala ?? 0)
    ch.connect(envio)
    envio.connect(salaPre)
    canais.set(t.id, ch)
    cortes.set(t.id, corte)
    envios.set(t.id, envio)
    nos.push(ch, corte, envio)
    // fonte → EQ → rack → corte: cada estágio só existe se a trilha usa (rack inteiro custa CPU)
    let entrada: Tone.InputNode = corte
    if (t.fx) {
      const valores = fxDe(t)
      const cadeia = createFxChain(valores, undefined, entrada)
      aplicarDrive(cadeia, valores.drive)
      racks.set(t.id, { cadeia, valores })
      nos.push({ dispose: () => disposeFxChain(cadeia) })
      entrada = cadeia.input
    }
    if (t.eq) {
      const eq = new Tone.EQ3(t.eq).connect(entrada)
      eqs.set(t.id, eq)
      nos.push(eq)
      entrada = eq
    }
    if (t.automacao?.length) {
      // a curva vira rampas no relógio de áudio a partir de onde o Transport (re)começa;
      // pausa cancela, ciclo reaplica no começo da volta
      automatizadas.add(t.id)
      const ps = pontosOrdenados(t.automacao)
      const vol = ch.volume
      const aplicar = (time: number, pos: number) => {
        vol.cancelScheduledValues(time)
        vol.setValueAtTime(valorAutomacao(ps, pos, t.volume), time)
        // rampa exponencial no ganho = reta em dB, igual à linha desenhada na trilha
        for (const pt of ps) if (pt.t > pos) vol.exponentialRampToValueAtTime(pt.db, time + (pt.t - pos))
      }
      const aoComecar = (time: number, offset?: number) => aplicar(time, offset ?? transport.seconds)
      const aoVoltar = (time: number) => aplicar(time, Tone.Time(transport.loopStart).toSeconds())
      const aoParar = (time: number) => vol.cancelScheduledValues(time)
      transport.on('start', aoComecar)
      transport.on('loop', aoVoltar)
      transport.on('pause', aoParar)
      transport.on('stop', aoParar)
      desligar.push(() => { transport.off('start', aoComecar); transport.off('loop', aoVoltar); transport.off('pause', aoParar); transport.off('stop', aoParar) })
      vol.value = valorAutomacao(ps, transport.seconds, t.volume)
    }
    if (comMedidores) {
      const m = new Tone.Meter({ smoothing: 0.8, channelCount: 1 })
      ch.connect(m)
      medidores.set(t.id, m)
      nos.push(m)
    }
    if (t.tipo === 'audio') {
      for (const c of t.clipes) {
        const buf = c.arquivo ? bufs.get(c.arquivo) : undefined
        if (!buf) continue
        const pl = new Tone.Player({ url: new Tone.ToneAudioBuffer(buf), fadeIn: c.fadeIn ?? 0, fadeOut: c.fadeOut ?? 0, volume: c.ganho ?? 0 })
        pl.connect(entrada)
        pl.sync().start(c.inicio, c.offset ?? 0, c.dur)
        nos.push(pl)
      }
    } else {
      const { voz, saida, extras } = criarInstrumento(t.instrumento, t.amostra ? bufs.get(t.amostra) : undefined, t.amostraRaiz)
      saida.connect(entrada)
      vozes.set(t.id, voz)
      nos.push(voz, ...extras)
      const eventos = t.clipes.flatMap(c => (c.notas ?? [])
        .filter(n => n.t < c.dur)
        .map(n => ({ time: c.inicio + n.t, midi: n.midi, dur: Math.min(n.dur, c.dur - n.t), vel: n.vel })))
      if (eventos.length) {
        const parte = new Tone.Part<{ time: number; midi: number; dur: number; vel: number }>((time, n) => {
          voz.triggerAttackRelease(Tone.Frequency(n.midi, 'midi').toFrequency(), n.dur, time, n.vel)
        }, eventos).start(0)
        nos.push(parte)
      }
    }
  }
  return {
    canais, cortes, envios, racks, eqs, medidores, vozes, master, medidorMaster, analisador, automatizadas,
    dispose: () => {
      for (const f of desligar) f()
      try { analisador?.disconnect() } catch { /* já foi */ }
      for (const n of nos) { try { n.dispose() } catch { /* já foi */ } }
    },
  }
}

/** O que obriga remontar: tudo menos os parâmetros de canal. */
function estrutura(p: Projeto): string {
  return JSON.stringify(p.trilhas.map((t: Trilha) => ({ id: t.id, tipo: t.tipo, i: t.instrumento, a: t.amostra, r: t.amostraRaiz, c: t.clipes, au: t.automacao, fx: !!t.fx, eq: !!t.eq })))
}

/* ── ao vivo ── */

export class MotorFinal {
  private m: Montagem | null = null
  private chave = ''
  private bufs = new Map<string, AudioBuffer>()
  private versao = 0

  get transport() { return Tone.getTransport() }
  get tocando() { return this.transport.state === 'started' }
  get segundos() { return this.transport.seconds }

  async sincronizar(p: Projeto): Promise<void> {
    const v = ++this.versao
    const faltam = arquivosDo(p).filter(a => !this.bufs.has(a))
    if (faltam.length) {
      const novos = await Promise.all(faltam.map(carregarBuffer))
      faltam.forEach((a, i) => this.bufs.set(a, novos[i]))
    }
    if (v !== this.versao) return   // outra sincronização mais nova passou na frente
    const chave = estrutura(p)
    if (this.m && chave === this.chave) {
      this.parametros(p)
      return
    }
    const tocava = this.tocando
    const pos = this.segundos
    if (tocava) this.transport.pause()
    this.m?.dispose()
    this.m = montar(p, this.bufs)
    this.chave = chave
    if (tocava) this.transport.start('+0.02', pos)
  }

  private parametros(p: Projeto) {
    if (!this.m) return
    const ouve = audivel(p.trilhas)
    this.m.master.volume.rampTo(p.master, 0.05)
    for (const t of p.trilhas) {
      const ch = this.m.canais.get(t.id)
      if (!ch) continue
      // trilha com curva: a curva manda, o fader não mexe
      if (!this.m.automatizadas.has(t.id)) ch.volume.rampTo(t.volume, 0.05)
      ch.pan.rampTo(t.pan, 0.05)
      this.m.cortes.get(t.id)?.frequency.rampTo(freqCorte(t.corte), 0.05)
      this.m.envios.get(t.id)?.gain.rampTo(t.sala ?? 0, 0.05)
      const rack = this.m.racks.get(t.id)
      if (rack) atualizarRack(rack, fxDe(t))
      const eq = this.m.eqs.get(t.id)
      if (eq && t.eq) { eq.low.rampTo(t.eq.low, 0.05); eq.mid.rampTo(t.eq.mid, 0.05); eq.high.rampTo(t.eq.high, 0.05) }
      ch.mute = !ouve.has(t.id)
    }
  }

  async tocar(de?: number) {
    await Tone.start()
    if (de !== undefined) this.transport.seconds = de
    this.transport.start('+0.03')
  }
  pausar() { this.transport.pause() }
  parar() { this.transport.stop(); this.transport.seconds = 0 }
  irPara(s: number) { this.transport.seconds = Math.max(0, s) }
  laco(ligado: boolean, de: number, ate: number) {
    this.transport.loop = ligado && ate > de
    this.transport.setLoopPoints(de, Math.max(de + 0.1, ate))
  }

  nivel(trilhaId: string | 'master'): number {
    const m = trilhaId === 'master' ? this.m?.medidorMaster : this.m?.medidores.get(trilhaId)
    const v = m?.getValue()
    return typeof v === 'number' ? v : -Infinity
  }

  /** Teclado do PC / MIDI: toca na voz da trilha na hora, fora do Transport. */
  notaLiga(trilhaId: string, midi: number, vel = 0.8) {
    void Tone.start()
    this.m?.vozes.get(trilhaId)?.triggerAttack(Tone.Frequency(midi, 'midi').toFrequency(), Tone.now(), vel)
  }
  notaSolta(trilhaId: string, midi: number) {
    this.m?.vozes.get(trilhaId)?.triggerRelease(Tone.Frequency(midi, 'midi').toFrequency(), Tone.now())
  }
  previa(trilhaId: string, midi: number, dur = 0.4) {
    void Tone.start()
    this.m?.vozes.get(trilhaId)?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), dur, Tone.now(), 0.7)
  }

  buffer(caminho: string) { return this.bufs.get(caminho) }
  get analisador() { return this.m?.analisador ?? null }

  /** REC do microfone (sem eco/ruído/ganho automático: é instrumento, não chamada). */
  async gravarEntrada(): Promise<{ parar: () => Promise<Blob> }> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    const rec = await gravar(stream)
    return {
      parar: async () => {
        const blob = await rec.parar()
        for (const tr of stream.getTracks()) tr.stop()
        return blob
      },
    }
  }

  dispose() {
    this.transport.stop()
    this.transport.cancel()
    this.m?.dispose()
    this.m = null
    this.chave = ''
  }
}

/* ── export ── */

export const CAUDA_S = 4

/** Mesmo `montar()`, no contexto offline: o WAV é o que você ouviu, em 48 kHz. */
export async function renderizar(p: Projeto, dur: number, sr = 48000): Promise<AudioBuffer> {
  const bufs = await carregarTodos(p)
  const saida = await Tone.Offline(({ transport }) => {
    montar(p, bufs, false)
    transport.start(0)
  }, dur + CAUDA_S, 2, sr)
  return saida.get() as AudioBuffer
}
