/**
 * Som do /sequenciador: uma voz por estilo, a partitura num Tone.Part e o Transport em loop.
 *
 * O tempo da nota vem da COLUNA (em ticks de 16 avos), não do `nota.t` em segundos: assim o
 * BPM pode andar sem desmontar a partitura. O desenho converte de volta pelos ticks do Transport.
 *
 * Tone recusa dois ataques no mesmo instante num sintetizador monofônico ("Start time must be
 * strictly greater than previous start time"). Por isso todo mono passa por `naHora`, que empurra
 * o ataque 1 ms pra frente quando cai no mesmo instante, e as vozes melódicas são PolySynth.
 */
import * as Tone from 'tone'
import { ESTILOS, mulberry32, type NomeEstilo, type Nota } from '@jaques/padroes'
import { colunasDoEstilo } from './estado'

const TPS = () => Tone.getTransport().PPQ / 4 // ticks por 16 avo

interface Voz {
  tocar(n: Nota, midi: number, hora: number, dur: number, vel: number): void
  /** bateria e afins, por passo; o Loop chama com o passo do loop */
  passo?(passo: number, hora: number): void
  dispose(): void
}

/** guarda o último ataque de um mono e devolve um instante estritamente maior */
function relogioMono() {
  let ultimo = -1
  return (t: number) => { const h = t <= ultimo ? ultimo + 0.001 : t; ultimo = h; return h }
}

const hz = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency()

function vozEno(saida: Tone.ToneAudioNode): Voz {
  const sala = new Tone.Reverb({ decay: 9, wet: 0.55 }).connect(saida)
  const coro = new Tone.Chorus({ frequency: 0.4, delayTime: 4, depth: 0.25, wet: 0.35 }).connect(sala).start()
  const fita = new Tone.Vibrato({ frequency: 0.35, depth: 0.06 }).connect(coro) // wow de fita
  const pad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5, envelope: { attack: 0.9, decay: 0.6, sustain: 0.7, release: 3.5 },
    oscillator: { type: 'sine' }, modulation: { type: 'triangle' }, volume: -16,
  }).connect(fita)
  const sino = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01, modulationIndex: 8, envelope: { attack: 0.002, decay: 2.2, sustain: 0, release: 2.4 },
    modulationEnvelope: { attack: 0.002, decay: 0.9, sustain: 0, release: 1 }, volume: -20,
  }).connect(fita)
  return {
    tocar(n, midi, hora, dur, vel) {
      // acento e notas altas viram sino; o resto é pad
      if (n.acento || n.row >= 8) sino.triggerAttackRelease(hz(midi + 12), Math.min(dur, 3), hora, vel)
      if (!n.acento || n.row < 8) pad.triggerAttackRelease(hz(midi), dur, hora, vel * 0.8)
    },
    dispose() { [pad, sino, fita, coro, sala].forEach((x) => x.dispose()) },
  }
}

function vozAphex(saida: Tone.ToneAudioNode, seed: number): Voz {
  const cruza = new Tone.BitCrusher(6).connect(saida)
  cruza.wet.value = 0.45
  const acido = new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: 'sawtooth' }, filter: { Q: 9, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.002, decay: 0.15, sustain: 0.25, release: 0.08 },
    filterEnvelope: { attack: 0.002, decay: 0.18, sustain: 0.1, release: 0.1, baseFrequency: 180, octaves: 4.2 },
    volume: -14,
  }).connect(cruza)
  const bumbo = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, volume: -6 }).connect(saida)
  const caixa = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 }, volume: -14 }).connect(cruza)
  const prato = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.02 }, harmonicity: 5.1, modulationIndex: 32, resonance: 5000, octaves: 1.5, volume: -30 }).connect(saida)
  const [hB, hC, hP] = [relogioMono(), relogioMono(), relogioMono()]
  // quebra de bateria por semente: bumbo/caixa base do amen, com variações e ratchets no prato
  const r = mulberry32(seed * 31 + 7)
  const colunas = colunasDoEstilo('aphex')
  const BUMBO = [0, 10], CAIXA = [4, 12]
  const padrao = Array.from({ length: colunas }, (_, i) => {
    const p = i % 16
    return {
      bumbo: BUMBO.includes(p) || (p === 7 && r() < 0.4) || (p === 14 && r() < 0.25),
      caixa: CAIXA.includes(p) || (p === 15 && r() < 0.3) || (p === 9 && r() < 0.2),
      prato: p % 2 === 0 || r() < 0.35,
      ratchet: r() < 0.14 ? (r() < 0.5 ? 2 : 3) : 1,
    }
  })
  return {
    tocar(_n, midi, hora, dur, vel) { acido.triggerAttackRelease(hz(midi - 12), Math.max(0.06, dur), hora, vel) },
    passo(p, hora) {
      const s = padrao[p % padrao.length]
      if (s.bumbo) bumbo.triggerAttackRelease('C1', '16n', hB(hora), 0.95)
      if (s.caixa) caixa.triggerAttackRelease('16n', hC(hora), 0.8)
      if (s.prato) {
        const sub = Tone.Time('16n').toSeconds() / s.ratchet
        for (let k = 0; k < s.ratchet; k++) prato.triggerAttackRelease(hz(72), 0.03, hP(hora + k * sub), k ? 0.5 : 0.8)
      }
    },
    dispose() { [acido, bumbo, caixa, prato, cruza].forEach((x) => x.dispose()) },
  }
}

function vozProg(saida: Tone.ToneAudioNode): Voz {
  const sala = new Tone.Reverb({ decay: 2.6, wet: 0.3 }).connect(saida)
  const eco = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.32, wet: 0.25 }).connect(sala)
  const arpa = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle8' }, envelope: { attack: 0.003, decay: 0.32, sustain: 0.05, release: 0.4 }, volume: -12,
  }).connect(eco)
  return {
    tocar(_n, midi, hora, dur, vel) { arpa.triggerAttackRelease(hz(midi), Math.min(dur, 0.8), hora, vel) },
    dispose() { [arpa, eco, sala].forEach((x) => x.dispose()) },
  }
}

function vozDrone(saida: Tone.ToneAudioNode): Voz {
  const sala = new Tone.Reverb({ decay: 14, wet: 0.6 }).connect(saida)
  const filtro = new Tone.AutoFilter({ frequency: 0.05, baseFrequency: 220, octaves: 2.5, wet: 1 }).connect(sala).start()
  const pad = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 0.5, modulationIndex: 1.2, oscillator: { type: 'sine' },
    envelope: { attack: 2.5, decay: 1, sustain: 0.85, release: 6 }, volume: -15,
  }).connect(filtro)
  return {
    tocar(_n, midi, hora, dur, vel) { pad.triggerAttackRelease(hz(midi - 12), dur, hora, vel) },
    dispose() { [pad, filtro, sala].forEach((x) => x.dispose()) },
  }
}

/** "Seu som": um sample do usuário no lugar da voz melódica */
function vozSample(saida: Tone.ToneAudioNode, sampler: Tone.Sampler, base: Voz): Voz {
  const sala = new Tone.Reverb({ decay: 3, wet: 0.25 }).connect(saida)
  sampler.connect(sala)
  return {
    tocar(_n, midi, hora, dur, vel) { sampler.triggerAttackRelease(hz(midi), dur, hora, vel) },
    passo: base.passo,
    dispose() { base.dispose(); sampler.disconnect(); sala.dispose() },
  }
}

export class Som {
  readonly mestre = new Tone.Gain(0.9)
  readonly fft = new Tone.Analyser('fft', 1024)
  readonly onda = new Tone.Analyser('waveform', 1024)
  private limitador = new Tone.Limiter(-1).toDestination()
  private voz: Voz | null = null
  private parte: Tone.Part<{ time: string; nota: Nota }> | null = null
  private bateria: Tone.Loop | null = null
  private sampler: Tone.Sampler | null = null
  private estilo: NomeEstilo = 'eno'

  constructor() {
    this.mestre.connect(this.limitador)
    this.mestre.connect(this.fft)
    this.mestre.connect(this.onda)
  }

  get transporte() { return Tone.getTransport() }

  /** monta a voz do estilo e o loop do Transport; chamado ao trocar de estilo, semente ou sample */
  montar(estilo: NomeEstilo, seed: number, notas: Nota[], bpm: number) {
    this.estilo = estilo
    this.voz?.dispose()
    this.bateria?.dispose(); this.bateria = null
    const base = { eno: vozEno, aphex: vozAphex, prog: vozProg, drone: vozDrone }[estilo](this.mestre, seed)
    this.voz = this.sampler ? vozSample(this.mestre, this.sampler, base) : base
    const tr = this.transporte
    tr.bpm.value = bpm
    tr.loop = true
    tr.loopStart = 0
    tr.loopEnd = `${colunasDoEstilo(estilo) * TPS()}i`
    if (this.voz.passo) {
      const voz = this.voz
      this.bateria = new Tone.Loop((hora) => {
        const passo = Math.round(tr.getTicksAtTime(hora) / TPS())
        voz.passo?.(passo % colunasDoEstilo(estilo), hora)
      }, '16n').start(0)
    }
    this.trocarNotas(notas)
  }

  /** a partitura mudou (edição): refaz o Part, o resto fica */
  trocarNotas(notas: Nota[]) {
    this.parte?.dispose()
    const tps = TPS()
    this.parte = new Tone.Part<{ time: string; nota: Nota }>((hora, ev) => this.disparar(ev.nota, hora), notas.map((n) => ({ time: `${n.col * tps}i`, nota: n })))
    this.parte.start(0)
  }

  private disparar(n: Nota, hora: number, vel?: number) {
    const e = ESTILOS[this.estilo]
    const midi = e.escala[Math.max(0, Math.min(e.escala.length - 1, n.row))]
    this.voz?.tocar(n, midi, hora, n.dur ?? e.soltura, vel ?? (n.acento ? 0.95 : 0.7))
  }

  /** ouvir uma nota agora (clique, arrasto) */
  previa(n: Nota) { this.disparar(n, Tone.now() + 0.01, 0.8) }

  async tocar() { await Tone.start(); this.transporte.start('+0.05') }
  pausar() { this.transporte.pause() }
  get tocando() { return this.transporte.state === 'started' }

  set bpm(v: number) { this.transporte.bpm.rampTo(v, 0.1) }

  /** passo fracionário atual dentro do loop (0..colunas) */
  passoAtual() { return this.transporte.ticks / TPS() }

  async carregarSample(arquivo: File): Promise<void> {
    const url = URL.createObjectURL(arquivo)
    const s = await new Promise<Tone.Sampler>((ok, erro) => {
      const sm: Tone.Sampler = new Tone.Sampler({ urls: { C4: url }, release: 1, onload: () => ok(sm), onerror: erro })
    })
    this.sampler?.dispose()
    this.sampler = s
  }

  semSample() { this.sampler?.dispose(); this.sampler = null }
  get temSample() { return this.sampler !== null }

  dispose() {
    this.transporte.stop(); this.transporte.cancel()
    this.parte?.dispose(); this.bateria?.dispose(); this.voz?.dispose(); this.sampler?.dispose()
    ;[this.mestre, this.fft, this.onda, this.limitador].forEach((x) => x.dispose())
  }
}
