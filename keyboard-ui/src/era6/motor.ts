/**
 * Motor da mesa granular (era6). Tone.js pra cadeia e grão em nó nativo, porque o
 * Tone.GrainPlayer não tem spray nem posição ao vivo (pesquisa no PLANO-era6.md).
 *
 * Tudo anda numa grade de TICK_S: mexida da mão, deriva, respira e agenda de grãos
 * são aplicadas no início de um tick. No REC, cada mexida é gravada com o tempo do
 * tick em que entrou e as seeds são reiniciadas. O export offline refaz a mesma
 * conta, tick a tick, e sai igual ao que foi tocado.
 */
import * as Tone from 'tone'
import { resolveUrl } from '../lib/api'
import {
  N_CAMADAS, PADRAO, MESTRE_PADRAO, TICK_S, SEED, FAIXA,
  rng, agendar, agendarNotas, agendarGolpes, agendarFrase, passoS, passoFraseS, padraoPerc, notaDoBanco, semitomDaNota,
  PASSOS_FRASE, SOLTA_S, type NotaFrase,
  respiracao, orbita, passoDeriva, comDeriva, derivaVazia, agendarEstalos,
  type Rng, type ParamsCamada, type NomeParam, type Deriva, type ParamsMestre,
  type Evento, type Sessao, type EstadoInicial, type Grao, type TipoCamada,
} from './modelo'

export type ItemBanco = {
  id: string; fonte: string; licenca: string; caminho: string; dur_s: number
  centroide_hz: number; flatness: number; tipo: string; nota: string; nota_estab: number; apito: boolean
}

/* ── buffers: um decode por sample, reaproveitado ao vivo e no offline ── */
type Par = { fwd: AudioBuffer; rev: AudioBuffer }
const buffers = new Map<string, Promise<Par>>()

export function carregarBuffer(item: { id: string; caminho: string }, ctx: BaseAudioContext): Promise<Par> {
  let p = buffers.get(item.id)
  if (!p) {
    p = fetch(resolveUrl(`/api/mix/file?path=${encodeURIComponent(item.caminho)}`))
      .then(r => { if (!r.ok) throw new Error(`sample ${item.id}: ${r.status}`); return r.arrayBuffer() })
      .then(ab => ctx.decodeAudioData(ab))
      .then(fwd => {
        const rev = new AudioBuffer({ length: fwd.length, numberOfChannels: fwd.numberOfChannels, sampleRate: fwd.sampleRate })
        for (let c = 0; c < fwd.numberOfChannels; c++) {
          const d = fwd.getChannelData(c).slice().reverse()
          rev.copyToChannel(d, c)
        }
        return { fwd, rev }
      })
    buffers.set(item.id, p)
    p.catch(() => buffers.delete(item.id))
  }
  return p
}

// janela de Hann: grão sem clique nas bordas
const HANN = Float32Array.from({ length: 128 }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 127))

/**
 * Envelope de cada tipo, em 256 pontos sobre a duração de saída:
 * - grão: Hann
 * - nota: sobe no ataque (seno), segura, e solta nos últimos 35 % (cosseno): sem clique
 * - golpe: 1 ms de subida e queda exponencial, que chega a zero no fim
 */
function envelope(g: Grao, durSaida: number): Float32Array {
  if (!g.forma) return HANN.map(v => v * g.ganho)
  const n = 256
  const a = g.forma === 'golpe' ? Math.min(0.2, 0.001 / durSaida) : Math.min(0.6, Math.max(0.005, (g.ataque ?? 0.05) / durSaida))
  return Float32Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1)
    if (x < a) return g.ganho * Math.sin((x / a) * (Math.PI / 2))
    if (g.forma === 'golpe') return g.ganho * Math.exp(-5 * (x - a)) * (1 - x)
    // solta (nota ao vivo, no replay): segura até a tecla subir e cai em SOLTA_S, igual ao que se ouviu tocando
    const solta = g.forma === 'solta' ? Math.max(a, 1 - Math.min(0.5, SOLTA_S / durSaida)) : Math.max(a, 0.65)
    return x <= solta ? g.ganho : g.ganho * (0.5 + 0.5 * Math.cos(((x - solta) / (1 - solta)) * Math.PI))
  })
}

type Camada = {
  tipo: TipoCamada
  grau: number              // onde a melodia está na escala (-1 = começa na raiz)
  raizSample: number | null // nota do sample no banco, pra transpor a melodia
  frase: NotaFrase[]        // melodia escrita à mão; vazia = passeio generativo
  params: ParamsCamada
  derivas: Record<NomeParam, Deriva>
  desvios: Partial<Record<NomeParam, number>>
  efetivo: ParamsCamada
  sample: string | null
  buf: Par | null
  r: Rng
  prox: number
  entrada: Tone.Gain
  lp: Tone.Filter
  resp: Tone.Gain
  vol: Tone.Volume
}

type Pendente =
  | { tipo: 'param'; camada: number; param: NomeParam; valor: number }
  | { tipo: 'deriva'; camada: number; param: NomeParam; deriva: Deriva }
  | { tipo: 'sample'; camada: number; sample: string | null }
  | { tipo: 'mestre'; param: keyof ParamsMestre; valor: number }
  | { tipo: 'fita'; sample: string | null }
  | { tipo: 'tipoCamada'; camada: number; valor: TipoCamada }
  | { tipo: 'frase'; camada: number; notas: NotaFrase[] }

/**
 * Banco de estalos de vinil (8 buffers, seed fixa). O estalo antigo era um estouro de ruído
 * branco de 10 ms com passa-alta em 700 Hz e soava como tique digital (recusado de ouvido
 * em 2026-09-29).
 * - 0–5: cliques de 0,2 a 1 ms, finos (derivada do ruído, sem grave): a poeira do disco
 * - 6–7: pops de 3 a 6 ms, abafados (média móvel): o risco, raro
 */
function bancoDeEstalos(ctx: BaseAudioContext): AudioBuffer[] {
  const sr = ctx.sampleRate
  const r = rng(7)
  return Array.from({ length: 8 }, (_, k) => {
    const pop = k >= 6
    const dur = pop ? 0.003 + (k - 6) * 0.003 : 0.0002 + (k / 5) * 0.0008
    const n = Math.max(8, Math.round(sr * dur))
    const b = new AudioBuffer({ length: n, sampleRate: sr, numberOfChannels: 1 })
    const d = b.getChannelData(0)
    let ant = 0, media = 0, pico = 1e-9
    for (let i = 0; i < n; i++) {
      const x = (r() * 2 - 1) * Math.exp(-i / (n * (pop ? 0.35 : 0.2)))
      d[i] = pop ? (media = media * 0.85 + x * 0.15) : x - ant
      ant = x
      pico = Math.max(pico, Math.abs(d[i]))
    }
    for (let i = 0; i < n; i++) d[i] /= pico
    return b
  })
}

/** Força do estalo → buffer: a maioria vira clique fino, só os ~15 % mais fortes viram pop. */
export function estaloDoBanco(amp: number) {
  if (amp > 0.85) return amp > 0.95 ? 7 : 6
  return Math.min(5, Math.floor(amp * 6))
}

/**
 * Resposta de impulso da sala: a receita do reverb() do phi.py (era3). Ruído estéreo
 * descorrelacionado decaindo em seg/5, passa-baixa de um polo em ~2,4 kHz (brilho 0,2),
 * 4 ms de entrada suave, energia normalizada. A seed é fixa: ao vivo e offline têm a mesma sala.
 */
export function irDeSala(ctx: BaseAudioContext, seg = 6): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.round(sr * seg)
  const b = new AudioBuffer({ length: n, sampleRate: sr, numberOfChannels: 2 })
  const r = rng(SEED + 300)
  const a = Math.exp((-2 * Math.PI * 2400) / sr)   // coeficiente do passa-baixa de um polo
  const entrada = Math.round(sr * 0.004)
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    let y = 0, energia = 0
    for (let i = 0; i < n; i++) {
      const x = (r() * 2 - 1) * Math.exp(-i / sr / (seg / 5))
      y = (1 - a) * x + a * y
      d[i] = i < entrada ? y * (i / entrada) : y
      energia += d[i] * d[i]
    }
    const g = 1 / Math.sqrt(energia + 1e-12)
    for (let i = 0; i < n; i++) d[i] *= g
  }
  return b
}

export class Motor {
  camadas: Camada[] = []
  mestre: ParamsMestre = { ...MESTRE_PADRAO }
  saida: Tone.Gain
  private soma: Tone.Gain
  private lpMestre: Tone.Filter
  private wow: Tone.Vibrato
  private flutter: Tone.Vibrato
  private sat: Tone.Chebyshev
  // space = envio paralelo pra convolução (o seco nunca perde volume)
  private salaEnvio: Tone.Gain
  private salaPre: Tone.Delay
  private salaConv: Tone.Convolver
  private salaHp: Tone.Filter
  private vol: Tone.Volume
  private lim: Tone.Limiter
  private chiado: Tone.Noise
  private ruidoGain: Tone.Gain
  private fitaHp: Tone.Filter
  private fitaPlayer: Tone.Player | null = null
  fita: string | null = null
  private chiadoVol: Tone.Volume
  private estaloHp: Tone.Filter
  private estaloBanco: AudioBuffer[] = []
  private rEstalo: Rng
  private rDeriva: Rng
  private proxEstalo = 0
  private proxTick = 0
  // relógio da sessão: órbita e swell contam daqui, então ao vivo e offline ficam na mesma fase
  private origem = 0
  private pendentes: Pendente[] = []
  private banco = new Map<string, ItemBanco>()
  // gravação de sessão
  private gravando: { t0: number; eventos: Evento[]; samples: Set<string>; inicial: EstadoInicial; seed: number } | null = null
  // replay offline
  private replay: { t0: number; eventos: Evento[]; i: number; notas: Extract<Evento, { tipo: 'nota' }>[]; j: number } | null = null
  // ganchos da pintura (PLANO-visual-era6.md): o evento que o motor mandou tocar, não o áudio
  onGrao?: (camada: number, grao: Grao, info: { frac: number; mao: boolean; deriva: boolean; sample: string }) => void
  onEstalo?: (t: number, amp: number) => void
  onTick?: (t: number, mestre: ParamsMestre) => void
  private ultimaMao: number[] = Array(N_CAMADAS).fill(-1e9)

  private offline: boolean

  constructor(offline = false) {
    this.offline = offline
    this.soma = new Tone.Gain(1)
    this.lpMestre = new Tone.Filter({ type: 'lowpass', frequency: this.mestre.escuro, rolloff: -24, Q: 0.5 })
    this.wow = new Tone.Vibrato({ frequency: 0.45, depth: 0 })
    this.flutter = new Tone.Vibrato({ frequency: 6.5, depth: 0 })
    this.sat = new Tone.Chebyshev({ order: 2, wet: 0.12 })
    // reverb da casa (phi.py): IR de ruído decaindo, abafado, predelay de 89 ms. O Freeverb
    // anterior soava metálico e, por ser crossfade, tirava volume do seco (recusado de ouvido)
    this.salaEnvio = new Tone.Gain(this.mestre.sala * 0.8)
    this.salaPre = new Tone.Delay(0.089, 0.2)
    this.salaConv = new Tone.Convolver()
    this.salaConv.normalize = false
    this.salaConv.buffer = new Tone.ToneAudioBuffer(irDeSala(Tone.getContext().rawContext as BaseAudioContext))
    this.salaHp = new Tone.Filter({ type: 'highpass', frequency: 200 })   // reverb no grave é lama
    this.vol = new Tone.Volume(this.mestre.volume)
    // limitador só de segurança no teto; compressão fica fora (portão de dinâmica 13–28 dB)
    this.lim = new Tone.Limiter(-1)
    this.saida = new Tone.Gain(1)
    this.soma.chain(this.lpMestre, this.wow, this.flutter, this.sat, this.vol, this.lim, this.saida)
    this.sat.chain(this.salaEnvio, this.salaPre, this.salaConv, this.salaHp, this.vol)

    this.chiado = new Tone.Noise('pink')
    this.chiadoVol = new Tone.Volume(this.mestre.chiado)
    this.ruidoGain = new Tone.Gain(1)
    this.chiado.chain(new Tone.Filter({ type: 'bandpass', frequency: 1400, Q: 0.4 }), this.ruidoGain, this.chiadoVol, this.soma)
    // sample da fita: entra no mesmo volume do chiado (o knob hiss vira o nível dele), sem o grave
    this.fitaHp = new Tone.Filter({ type: 'highpass', frequency: 180 })
    this.fitaHp.connect(this.chiadoVol)

    // só tira o DC dos pops; o caráter vem do banco de cliques, não de filtro
    this.estaloHp = new Tone.Filter({ type: 'highpass', frequency: 120 })
    this.estaloHp.connect(this.soma)
    this.estaloBanco = bancoDeEstalos(Tone.getContext().rawContext as BaseAudioContext)

    this.rEstalo = rng(SEED + 100)
    this.rDeriva = rng(SEED + 200)
    for (let i = 0; i < N_CAMADAS; i++) {
      const entrada = new Tone.Gain(1)
      const lp = new Tone.Filter({ type: 'lowpass', frequency: PADRAO.lp, rolloff: -12 })
      const resp = new Tone.Gain(1)
      const vol = new Tone.Volume(PADRAO.nivel)
      entrada.chain(lp, resp, vol, this.soma)
      this.camadas.push({
        tipo: 'textura', grau: -1, raizSample: null, frase: [],
        params: { ...PADRAO }, derivas: derivaVazia(), desvios: {}, efetivo: { ...PADRAO },
        sample: null, buf: null, r: rng(SEED + i), prox: 0, entrada, lp, resp, vol,
      })
    }
    this.aplicarMestre()
  }

  private get raw() { return Tone.getContext().rawContext as BaseAudioContext }

  conhecer(itens: ItemBanco[]) { for (const it of itens) this.banco.set(it.id, it) }

  iniciar() {
    this.chiado.start()
    this.proxTick = Tone.now() + 0.05
    this.origem = this.proxTick
    this.proxEstalo = this.proxTick
    for (const c of this.camadas) c.prox = this.proxTick
  }

  // ── entrada da mão: entra na fila e é aplicada no próximo tick ──
  set(camada: number, param: NomeParam, valor: number) { this.pendentes.push({ tipo: 'param', camada, param, valor }) }
  setDeriva(camada: number, param: NomeParam, deriva: Deriva) { this.pendentes.push({ tipo: 'deriva', camada, param, deriva }) }
  setMestre(param: keyof ParamsMestre, valor: number) { this.pendentes.push({ tipo: 'mestre', param, valor }) }
  setTipo(camada: number, valor: TipoCamada) { this.pendentes.push({ tipo: 'tipoCamada', camada, valor }) }
  setFrase(camada: number, notas: NotaFrase[]) { this.pendentes.push({ tipo: 'frase', camada, notas: notas.map(x => ({ ...x })) }) }

  /** Onde a frase da camada está agora, em passos fracionários (0..16). Pra tela e pra quantizar o teclado. */
  posicaoFrase(camada: number): number {
    const c = this.camadas[camada]
    const k = (this.raw.currentTime - this.origem) / passoFraseS(c.efetivo.bpm)
    return ((k % PASSOS_FRASE) + PASSOS_FRASE) % PASSOS_FRASE
  }

  /** Prévia curta de um grau (clicar no nome da nota na grade). Não entra na sessão. */
  previa(camada: number, grau: number, dur = 1.2) { this.tocarNota(camada, grau, this.raw.currentTime + 0.01, dur, 'nota') }

  /** Uma nota da camada em `t`, com a duração de saída `dur` (usada pela prévia e pelo replay do ao vivo). */
  private tocarNota(camada: number, grau: number, t: number, dur: number, forma: 'nota' | 'solta' = 'solta') {
    const c = this.camadas[camada]
    if (!c.buf) return
    const p = c.efetivo
    const rate = Math.pow(2, semitomDaNota(p, c.raizSample, grau) / 12)
    const durSample = c.buf.fwd.duration
    const inicio = Math.min(p.pos * durSample, durSample * 0.95)
    const g: Grao = {
      t, offset: inicio, dur: Math.max(0.01, Math.min(dur * rate, durSample - inicio)),
      rate, reverso: false, pan: p.centro ?? 0, ganho: 0.9, forma, ataque: Math.min(p.ataque, 0.05),
    }
    this.tocarGrao(c, g)
    if (this.onGrao && c.sample) this.onGrao(camada, g, { frac: inicio / durSample, mao: true, deriva: false, sample: c.sample })
  }

  /**
   * Nota tocada ao vivo no teclado, sem grade: soa enquanto a tecla está apertada e cai em SOLTA_S
   * quando sobe. Devolve a função de soltar. Com o REC ligado, entra na sessão com o tempo exato da
   * tecla, e o export offline toca igual (forma `solta`).
   */
  tocarLivre(camada: number, grau: number): () => void {
    const c = this.camadas[camada]
    if (!c.buf) return () => {}
    const ctx = this.raw
    const p = c.efetivo
    const rate = Math.pow(2, semitomDaNota(p, c.raizSample, grau) / 12)
    const durSample = c.buf.fwd.duration
    const inicio = Math.min(p.pos * durSample, durSample * 0.95)
    const t0 = ctx.currentTime + 0.005
    const src = ctx.createBufferSource()
    src.buffer = c.buf.fwd
    src.playbackRate.value = rate
    const env = ctx.createGain()
    const ataque = Math.min(p.ataque, 0.05)
    env.gain.setValueAtTime(0, t0)
    env.gain.linearRampToValueAtTime(0.9, t0 + ataque)
    const pan = ctx.createStereoPanner()
    pan.pan.value = p.centro ?? 0
    src.connect(env).connect(pan)
    Tone.connect(pan, c.entrada)
    src.start(t0, inicio)
    src.onended = () => { src.disconnect(); env.disconnect(); pan.disconnect() }
    if (this.onGrao && c.sample) {
      this.onGrao(camada, { t: t0, offset: inicio, dur: 1, rate, reverso: false, pan: p.centro ?? 0, ganho: 0.9, forma: 'nota' },
        { frac: inicio / durSample, mao: true, deriva: false, sample: c.sample })
    }
    let solto = false
    return () => {
      if (solto) return
      solto = true
      const t1 = Math.max(ctx.currentTime, t0 + ataque)
      env.gain.cancelScheduledValues(t1)
      env.gain.setValueAtTime(0.9, t1)
      env.gain.linearRampToValueAtTime(0, t1 + SOLTA_S)
      src.stop(t1 + SOLTA_S + 0.02)
      if (this.gravando) {
        this.gravando.eventos.push({ t: t0 - this.gravando.t0, tipo: 'nota', camada, grau, dur: t1 - t0 })
        if (c.sample) this.gravando.samples.add(c.sample)
      }
    }
  }

  /** Passo da percussão que está soando agora (-1 se a camada não é percussão). Só pra tela. */
  passoAtual(camada: number): number {
    const c = this.camadas[camada]
    if (c.tipo !== 'percussao' || !c.buf) return -1
    const n = padraoPerc(c.efetivo).length
    const k = Math.floor((this.raw.currentTime - this.origem) / passoS(c.efetivo.bpm))
    return k < 0 ? -1 : k % n
  }
  async setFita(id: string | null) {
    if (id) {
      const it = this.banco.get(id)
      if (!it) throw new Error(`sample fora do banco: ${id}`)
      await carregarBuffer(it, this.raw)
    }
    this.pendentes.push({ tipo: 'fita', sample: id })
  }
  async setSample(camada: number, id: string | null) {
    if (id) {
      const it = this.banco.get(id)
      if (!it) throw new Error(`sample fora do banco: ${id}`)
      await carregarBuffer(it, this.raw)
    }
    this.pendentes.push({ tipo: 'sample', camada, sample: id })
  }

  private async aplicar(p: Pendente, t: number) {
    if (p.tipo === 'param') { this.camadas[p.camada].params[p.param] = p.valor; this.ultimaMao[p.camada] = t }
    else if (p.tipo === 'deriva') this.camadas[p.camada].derivas[p.param] = { ...p.deriva }
    else if (p.tipo === 'mestre') { this.mestre[p.param] = p.valor; this.aplicarMestre(t) }
    else if (p.tipo === 'fita') await this.trocarFita(p.sample, t)
    else if (p.tipo === 'tipoCamada') {
      const c = this.camadas[p.camada]
      c.tipo = p.valor
      c.prox = t
      c.grau = -1
    }
    else if (p.tipo === 'frase') this.camadas[p.camada].frase = p.notas.map(x => ({ ...x }))
    else if (p.tipo === 'sample') {
      const c = this.camadas[p.camada]
      c.sample = p.sample
      c.buf = null
      c.raizSample = null
      if (p.sample) {
        const it = this.banco.get(p.sample)
        c.raizSample = notaDoBanco(it?.nota)
        // já carregado no setSample (ou no pré-carregamento do offline): o await resolve na hora
        if (it) c.buf = await carregarBuffer(it, this.raw)
      }
    }
    if (this.gravando) {
      const tt = t - this.gravando.t0
      if ((p.tipo === 'sample' || p.tipo === 'fita') && p.sample) this.gravando.samples.add(p.sample)
      this.gravando.eventos.push({ ...p, t: tt } as Evento)
    }
  }

  /** Troca o sample da fita: o loop entra no lugar do ruído rosa, com 1 s de crossfade. */
  private async trocarFita(id: string | null, t: number) {
    const velho = this.fitaPlayer
    if (velho) { velho.stop(t + 1); setTimeout(() => velho.dispose(), 3000) }
    this.fitaPlayer = null
    this.fita = id
    const it = id ? this.banco.get(id) : undefined
    if (it) {
      const par = await carregarBuffer(it, this.raw)
      const pl = new Tone.Player(new Tone.ToneAudioBuffer(par.fwd))
      pl.loop = true
      pl.fadeIn = 1
      pl.fadeOut = 1
      pl.connect(this.fitaHp)
      pl.start(t)
      this.fitaPlayer = pl
    }
    this.ruidoGain.gain.linearRampToValueAtTime(it ? 0 : 1, t + 1)
  }

  private aplicarMestre(t = Tone.now()) {
    const m = this.mestre
    this.lpMestre.frequency.linearRampToValueAtTime(m.escuro, t + TICK_S)
    this.wow.depth.linearRampToValueAtTime(m.wow * 0.12, t + TICK_S)
    this.flutter.depth.linearRampToValueAtTime(m.wow * 0.03, t + TICK_S)
    this.chiadoVol.volume.linearRampToValueAtTime(m.chiado, t + TICK_S)
    this.salaEnvio.gain.linearRampToValueAtTime(m.sala * 0.8, t + TICK_S)
    this.vol.volume.linearRampToValueAtTime(m.volume, t + TICK_S)
  }

  /** Processa todos os ticks até `ate` (tempo do contexto). Ao vivo: chamado a cada ~25 ms. */
  async processar(ate: number) {
    while (this.proxTick < ate) {
      const t = this.proxTick
      // eventos: ao vivo vêm da fila; no offline, do json da sessão
      if (this.replay) {
        const rp = this.replay
        while (rp.i < rp.eventos.length && rp.eventos[rp.i].t + rp.t0 <= t + 1e-9) {
          const ev = { ...rp.eventos[rp.i++] } as Partial<Evento>
          delete ev.t
          await this.aplicar(ev as Pendente, t)
        }
        // nota ao vivo: no tempo EXATO em que foi tocada (não na grade do tick), com um tick de antecedência
        while (rp.j < rp.notas.length && rp.notas[rp.j].t + rp.t0 < t + TICK_S - 1e-9) {
          const nt = rp.notas[rp.j++]
          this.tocarNota(nt.camada, nt.grau, rp.t0 + nt.t, nt.dur + SOLTA_S)
        }
      } else {
        const fila = this.pendentes
        this.pendentes = []
        for (const p of fila) await this.aplicar(p, t)
      }
      this.tick(t)
      this.proxTick = t + TICK_S
    }
  }

  private tick(t: number) {
    const fim = t + TICK_S
    for (let i = 0; i < this.camadas.length; i++) {
      const c = this.camadas[i]
      // deriva: um passo por tick, sempre na mesma ordem de params (a ordem do rng importa)
      for (const p of Object.keys(FAIXA) as NomeParam[]) {
        const d = c.derivas[p]
        if (!d) continue
        if (p === 'centro') {
          // pan não vagueia: com a deriva ligada ele orbita L↔R (não gasta rng, o resto fica igual)
          c.efetivo.centro = d.ligada ? orbita(c.params.centro ?? 0, i, t - this.origem, d.quanto) : (c.params.centro ?? 0)
          continue
        }
        c.desvios[p] = passoDeriva(p, c.desvios[p] ?? 0, d, this.rDeriva)
        c.efetivo[p] = comDeriva(p, c.params[p], c.desvios[p]!)
      }
      const e = c.efetivo
      c.lp.frequency.linearRampToValueAtTime(e.lp, fim)
      c.vol.volume.linearRampToValueAtTime(e.nivel, fim)
      c.resp.gain.linearRampToValueAtTime(respiracao(e.respira, fim - this.origem, i / N_CAMADAS), fim)
      if (!c.buf) { c.prox = fim; continue }
      if (c.prox < t) c.prox = t
      const durSample = c.buf.fwd.duration
      let graos: Grao[]
      if (c.tipo === 'melodia' && c.frase.length) {
        // frase escrita: grade do bpm contada da origem, igual à percussão
        graos = agendarFrase(e, c.frase, durSample, c.raizSample, this.origem, t, fim)
        c.prox = fim
      } else if (c.tipo === 'melodia') {
        const res = agendarNotas(e, durSample, c.raizSample, c.prox, fim, c.grau, c.r)
        graos = res.graos
        c.prox = res.prox
        c.grau = res.grau
      } else if (c.tipo === 'percussao') {
        // a grade da percussão conta da origem da sessão, não do prox
        graos = agendarGolpes(e, durSample, this.origem, t, fim, c.r)
        c.prox = fim
      } else {
        const res = agendar(e, durSample, c.prox, fim, c.r)
        graos = res.graos
        c.prox = res.prox
      }
      for (const g of graos) this.tocarGrao(c, g)
      if (this.onGrao && c.sample) {
        // "mão" = mexida no último 1 s; "deriva" = algum knob com deriva ligada
        const mao = t - this.ultimaMao[i] < 1
        const deriva = Object.values(c.derivas).some(d => d.ligada)
        for (const g of graos) this.onGrao(i, g, { frac: g.offset / c.buf.fwd.duration, mao, deriva, sample: c.sample })
      }
    }
    for (const s of agendarEstalos(this.mestre.estalo, Math.max(this.proxEstalo, t), fim, this.rEstalo)) {
      this.tocarEstalo(s.t, s.amp)
      this.onEstalo?.(s.t, s.amp)
    }
    this.onTick?.(t, this.mestre)
    this.proxEstalo = fim
  }

  private tocarGrao(c: Camada, g: Grao) {
    const ctx = this.raw
    const buf = g.reverso ? c.buf!.rev : c.buf!.fwd
    const off = g.reverso ? Math.max(0, buf.duration - g.offset - g.dur) : g.offset
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = g.rate
    const env = ctx.createGain()
    env.gain.value = 0
    const durSaida = g.dur / g.rate
    env.gain.setValueCurveAtTime(envelope(g, durSaida), g.t, durSaida)
    const pan = ctx.createStereoPanner()
    pan.pan.value = g.pan
    src.connect(env).connect(pan)
    Tone.connect(pan, c.entrada)
    src.start(g.t, off, g.dur)
    src.onended = () => { src.disconnect(); env.disconnect(); pan.disconnect() }
  }

  private tocarEstalo(t: number, amp: number) {
    const ctx = this.raw
    const src = ctx.createBufferSource()
    // o tipo sai da própria força do estalo (sem sorteio extra): ao vivo e offline tocam o mesmo clique
    src.buffer = this.estaloBanco[estaloDoBanco(amp)]
    const g = ctx.createGain()
    g.gain.value = 0.004 + amp * amp * 0.12
    src.connect(g)
    Tone.connect(g, this.estaloHp)
    src.start(t)
    src.onended = () => { src.disconnect(); g.disconnect() }
  }

  bufferDa(camada: number): AudioBuffer | null { return this.camadas[camada].buf?.fwd ?? null }

  // ── sessão ──
  private reiniciarSeeds(seed: number, t: number) {
    this.camadas.forEach((c, i) => { c.r = rng(seed + i); c.prox = t; c.grau = -1 })
    this.rEstalo = rng(seed + 100)
    this.rDeriva = rng(seed + 200)
    this.proxEstalo = t
    this.ultimaMao = Array(N_CAMADAS).fill(-1e9)
  }

  private estado(): EstadoInicial {
    return {
      camadas: this.camadas.map(c => ({ ...c.params })),
      derivas: this.camadas.map(c => JSON.parse(JSON.stringify(c.derivas))),
      samples: this.camadas.map(c => c.sample),
      tipos: this.camadas.map(c => c.tipo),
      frases: this.camadas.map(c => c.frase.map(x => ({ ...x }))),
      mestre: { ...this.mestre },
      fita: this.fita,
      desvios: this.camadas.map(c => ({ ...c.desvios })),
    }
  }

  /** Começa a gravar a partir do próximo tick. Devolve o tempo de contexto em que começa. */
  comecarSessao(seed = SEED + Math.floor(Math.random() * 1e6)) {
    const t0 = this.proxTick
    this.origem = t0
    this.reiniciarSeeds(seed, t0)
    // pendentes entram DEPOIS do estado inicial, como eventos em t=0
    this.gravando = {
      t0, eventos: [], seed,
      samples: new Set([...this.camadas.map(c => c.sample), this.fita].filter((s): s is string => !!s)),
      inicial: this.estado(),
    }
    return t0
  }

  terminarSessao(tFim = this.proxTick): Sessao | null {
    const g = this.gravando
    this.gravando = null
    if (!g) return null
    return { seed: g.seed, inicial: g.inicial, eventos: g.eventos, dur_s: tFim - g.t0, samples: [...g.samples] }
  }

  /** Offline: carrega o estado inicial e prepara o replay. */
  async prepararReplay(s: Sessao, t0: number) {
    const ini = s.inicial
    const todos = new Set([...s.samples, ...ini.samples.filter((x): x is string => !!x)])
    for (const id of todos) { const it = this.banco.get(id); if (it) await carregarBuffer(it, this.raw) }
    this.camadas.forEach((c, i) => {
      c.tipo = ini.tipos?.[i] ?? 'textura'
      c.frase = (ini.frases?.[i] ?? []).map(x => ({ ...x }))
      c.raizSample = notaDoBanco(ini.samples[i] ? this.banco.get(ini.samples[i]!)?.nota : undefined)
      // sessão gravada antes dos knobs de melodia/percussão: completa com o padrão
      c.params = { ...PADRAO, ...ini.camadas[i] }
      c.derivas = JSON.parse(JSON.stringify(ini.derivas[i]))
      c.desvios = { ...(ini.desvios?.[i] ?? {}) }
      c.efetivo = { ...c.params }
      c.sample = ini.samples[i]
      c.buf = null
    })
    for (let i = 0; i < this.camadas.length; i++) {
      const id = ini.samples[i]
      const it = id ? this.banco.get(id) : undefined
      if (it) this.camadas[i].buf = await carregarBuffer(it, this.raw)
    }
    this.mestre = { ...ini.mestre }
    if (ini.fita) { const it = this.banco.get(ini.fita); if (it) await carregarBuffer(it, this.raw); await this.trocarFita(ini.fita, t0) }
    this.aplicarMestre(t0)
    this.proxTick = t0
    this.origem = t0
    this.reiniciarSeeds(s.seed, t0)
    const ord = [...s.eventos].sort((a, b) => a.t - b.t)
    this.replay = {
      t0, i: 0, j: 0,
      eventos: ord.filter(e => e.tipo !== 'nota'),
      notas: ord.filter((e): e is Extract<Evento, { tipo: 'nota' }> => e.tipo === 'nota'),
    }
    this.chiado.start(t0)
  }

  dispose() {
    this.chiado.stop()
    this.fitaPlayer?.dispose()
    for (const c of this.camadas) { c.entrada.dispose(); c.lp.dispose(); c.resp.dispose(); c.vol.dispose() }
    for (const n of [this.soma, this.lpMestre, this.wow, this.flutter, this.sat, this.salaEnvio, this.salaPre, this.salaConv, this.salaHp, this.vol, this.lim, this.saida, this.chiado, this.chiadoVol, this.ruidoGain, this.fitaHp, this.estaloHp]) n.dispose()
  }
}

/** Export offline: refaz a sessão tick a tick e devolve o AudioBuffer normalizado em −0,9 dBFS de pico. */
export async function renderOffline(s: Sessao, itens: ItemBanco[], sr = 48000,
  ganchos?: Pick<Motor, 'onGrao' | 'onEstalo' | 'onTick'>): Promise<AudioBuffer> {
  const cauda = 4   // s de cauda do reverb depois do fim
  const tb = await Tone.Offline(async () => {
    const m = new Motor(true)
    if (ganchos) Object.assign(m, ganchos)
    m.conhecer(itens)
    m.saida.toDestination()
    await m.prepararReplay(s, 0)
    await m.processar(s.dur_s)
  }, s.dur_s + cauda, 2, sr)
  const buf = tb.get() as AudioBuffer
  let pico = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < d.length; i++) pico = Math.max(pico, Math.abs(d[i]))
  }
  // pico entre −1 e −0,8 dBFS (convenção do render.py): normaliza em −0,9
  if (pico > 0) {
    const g = Math.pow(10, -0.9 / 20) / pico
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) d[i] *= g
    }
  }
  return buf
}
