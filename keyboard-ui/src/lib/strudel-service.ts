import { repl as createRepl, evalScope } from '@strudel/core'
import { relogioPosicionavel } from './relogio-modo'
import { captureRegistry } from './capture-bus'
import { envolverComTom } from './tom'
import { diagnostico } from './diagnostico'
import { conferir } from '../musica/sons'

export type StrudelState = {
  playing: boolean
  code: string
  error: string | null
  bpm: number
  /** transpose ao vivo em semitons; NAO faz parte do take (ver `setTom`) */
  tom: number
  /**
   * O banco de samples LOCAL (o kit VHULTO e companhia, servidos pelo backend).
   *
   * Existe porque a falha dele era invisivel: `loadLocalSamples` engolia tudo
   * num `catch {}`, `initialized` virava `true` do mesmo jeito e nunca mais
   * tentava. Um soluco do backend no carregamento da pagina custava a sessao
   * INTEIRA sem sample local — e o sintoma era `sound ... not found` por evento
   * e silencio absoluto, sem uma palavra na tela dizendo o que houve.
   *
   * Tres estados e nao dois, pela mesma razao que a lista de musicas tem tres:
   * com so "tem/nao tem", backend fora do ar vira "nao ha samples", que e
   * mentira — os arquivos estao la, a sessao e que nao alcancou.
   */
  samplesLocais: 'carregando' | 'ok' | 'falhou'
  /** Por que falhou, pra tela poder dizer em vez de so acender um alerta. */
  samplesErro: string | null
  /** Bancos de CDN que nao carregaram, pelo nome. Vazio = todos entraram. */
  bancosCaidos: string[]
}

type Listener = (s: StrudelState) => void

/** Sink de highlight: quem desenha o evento tocando no editor (CodeMirror). */
export type HighlightSink = {
  onMiniLocations: (locs: any[]) => void
  onFrame: (haps: any[], time: number) => void
  onClear: () => void
}

let instance: StrudelService | null = null

let audioInitStarted = false

function bootAudio() {
  if (audioInitStarted) return
  audioInitStarted = true
  import('@strudel/webaudio').then(({ initAudioOnFirstClick }) => {
    initAudioOnFirstClick()
  })
}

export class StrudelService {
  private state: StrudelState = {
    playing: false, code: '', error: null, bpm: 120, tom: 0,
    samplesLocais: 'carregando', samplesErro: null, bancosCaidos: [],
  }
  private listeners = new Set<Listener>()
  private replInstance: any = null
  private captureDest: MediaStreamAudioDestinationNode | null = null
  private gainNode: GainNode | null = null
  private lpfNode: BiquadFilterNode | null = null
  private hpfNode: BiquadFilterNode | null = null
  private delayNode: DelayNode | null = null
  private delayGain: GainNode | null = null
  private dryGain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null
  private readyCallbacks: Array<() => void> = []
  private sink: HighlightSink | null = null
  private drawer: any = null
  private drawerRodando = false
  private miniLocations: any[] = []

  static get(): StrudelService {
    if (!instance) {
      instance = new StrudelService()
      bootAudio()
    }
    return instance
  }

  async init() {
    if (this.initialized) return
    if (this.initPromise) return this.initPromise
    this.initPromise = this._init()
    return this.initPromise
  }

  private async _init() {
    const { webaudioOutput, registerSynthSounds, soundMap: soundMapWebaudio } = await import('@strudel/webaudio')
    const { miniAllStrings } = await import('@strudel/mini')
    const { initAudio, getAudioContext, samples, registerZZFXSounds, getSuperdoughAudioController, soundMap: soundMapSuperdough } = await import('superdough')
    /**
     * DOIS registros, e a uniao dos dois. Nao e cinto e suspensorio: medido.
     *
     * `@strudel/webaudio` faz `export * from 'superdough'`, entao os dois
     * exportam o MESMO `soundMap` — no papel. Na pratica o Vite pre-empacota
     * cada import bare num chunk proprio, e existem DUAS copias do modulo, cada
     * uma com o seu store. Numa aba limpa, depois do init completo:
     *
     *   pelo `superdough`  -> 1077 nomes: zzfx, `bd`, o kit da casa.
     *                         SEM `sawtooth`, `triangle`, `sine`, ruidos.
     *   pelo `@strudel/webaudio` -> 19 nomes: exatamente os de sintese.
     *                         SEM sample nenhum.
     *
     * Nenhuma das duas e a verdade inteira. Ler so uma fazia a linha do tempo
     * acusar "sem som" em camada que soa — mentira pior que a omissao que o
     * marcador veio corrigir, e que apareceu na tela em `xtal-vidro`.
     *
     * A uniao e a leitura conservadora certa: um nome ausente das DUAS copias e
     * desconhecido de todo mundo. Errar pra menos aqui custa um aviso que nao
     * aparece; errar pra mais custa a tela chamando de mudo o que toca.
     *
     * (Isto pode ser artefato so do dev: o build de producao deduplica. A
     * uniao esta certa nos dois casos, entao nao depende de descobrir qual.)
     */
    this.soundMaps = [soundMapWebaudio, soundMapSuperdough]
      .filter(Boolean) as unknown as typeof this.soundMaps

    registerSynthSounds()
    registerZZFXSounds()
    miniAllStrings()

    // AWAIT, nao dispare-e-esqueca. Sem esperar, o primeiro Ctrl+Enter dispara
    // antes de o mapa de bancos estar registrado e o console cospe
    // `sound vhulto_... not found! Is it loaded?` — o take toca mudo e parece
    // que o sample e ruim. Sao so JSONs de indice (os audios seguem carregando
    // sob demanda), entao esperar custa alguns ms e conserta a primeira escuta.
    const cdn = 'https://strudel.b-cdn.net'
    // Banco fora do ar NAO trava o app — mas tambem nao passa calado. O
    // `tidal-drum-machines` e quem traz os `dirt_*`; quando ele falha, o take
    // que usa `s("dirt_dr55")` toca mudo e o unico sinal era uma linha de
    // console. Mesma doenca do banco local, mesmo remedio: o nome de quem
    // faltou chega na tela.
    const bancos: Array<[string, Promise<unknown> | unknown]> = [
      ['EmuSP12', samples(`${cdn}/EmuSP12.json`)],
      ['piano', samples(`${cdn}/piano.json`)],
      ['vcsl', samples(`${cdn}/vcsl.json`)],
      ['tidal-drum-machines', samples(`${cdn}/tidal-drum-machines.json`)],
    ]
    const caidos: string[] = []
    await Promise.all([
      ...bancos.map(([nome, p]) => Promise.resolve(p).catch(() => { caidos.push(nome) })),
      this.loadLocalSamples(samples),
    ])
    if (caidos.length) this.update({ bancosCaidos: caidos })

    await evalScope(
      import('@strudel/core'),
      import('@strudel/mini'),
      import('@strudel/webaudio'),
      import('@strudel/tonal'),
    )

    this.replInstance = createRepl({
      defaultOutput: webaudioOutput,
      getTime: () => getAudioContext().currentTime,
      /**
       * `sync` troca o agendador: `Cyclist` -> `NeoCyclist`, que roda num
       * SharedWorker e e o UNICO dos dois que tem `setCycle`.
       *
       * E `setCycle` e a diferenca entre ter e nao ter agulha posicionavel:
       * medido em runtime, `scheduler.constructor.name` era `hf` (Cyclist) e
       * `scheduler.setCycle` era `undefined`. Sem isto, clicar na regua nao tem
       * como mover o som — so como mentir sobre onde ele esta.
       *
       * Fica atras de uma chave porque isto mexe no que JA FUNCIONA. Quem achar
       * que o sync piorou aperta `relogio clássico` na rota e volta pro Cyclist,
       * sem mexer em codigo. Navegador sem SharedWorker cai no Cyclist sozinho,
       * dentro do proprio `repl()` — nao precisa de guarda aqui.
       */
      sync: relogioPosicionavel(),
      afterEval: (opts: any) => {
        this.update({ playing: true, error: null })
        this.miniLocations = opts?.meta?.miniLocations || []
        this.sink?.onMiniLocations(this.miniLocations)
        this.startDrawer()
      },
      onEvalError: (err: any) => {
        this.update({ error: err?.message || String(err) })
      },
    })

    this.initialized = true

    await initAudio()
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    this.buildAudioNodes(ctx, getSuperdoughAudioController)
    this.readyCallbacks.forEach(cb => cb())
    this.readyCallbacks = []
  }

  private buildAudioNodes(
    ctx: AudioContext,
    getController: () => { output: { destinationGain: GainNode } },
  ) {
    if (this.gainNode) return

    this.lpfNode = ctx.createBiquadFilter()
    this.lpfNode.type = 'lowpass'
    this.lpfNode.frequency.value = 20000

    this.hpfNode = ctx.createBiquadFilter()
    this.hpfNode.type = 'highpass'
    this.hpfNode.frequency.value = 20

    this.dryGain = ctx.createGain()
    this.dryGain.gain.value = 1

    this.delayNode = ctx.createDelay(1.0)
    this.delayNode.delayTime.value = 0.3
    this.delayGain = ctx.createGain()
    this.delayGain.gain.value = 0

    this.gainNode = ctx.createGain()
    this.gainNode.gain.value = 0.8

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048

    this.captureDest = ctx.createMediaStreamDestination()

    // Intercept superdough output: destinationGain → our chain → speakers
    const controller = getController()
    const sdGain = controller.output.destinationGain
    if (sdGain) {
      try { sdGain.disconnect(ctx.destination) } catch {}
      sdGain.connect(this.lpfNode)
    }

    this.lpfNode.connect(this.hpfNode)
    this.hpfNode.connect(this.dryGain)
    this.hpfNode.connect(this.delayNode)
    this.delayNode.connect(this.delayGain)
    this.delayGain.connect(this.delayNode)
    this.dryGain.connect(this.gainNode)
    this.delayGain.connect(this.gainNode)
    this.gainNode.connect(ctx.destination)
    this.gainNode.connect(this.captureDest)
    this.gainNode.connect(this.analyser)

    captureRegistry.register({
      id: 'analogbrain',
      label: 'Analog Brain',
      getStream: () => this.captureDest?.stream ?? null,
      setMonitor: (enabled: boolean) => {
        if (this.gainNode) {
          if (enabled) {
            try { this.gainNode.connect(ctx.destination) } catch {}
          } else {
            try { this.gainNode.disconnect(ctx.destination) } catch {}
          }
        }
      },
    })
  }

  private localSampleNames: string[] = []

  /**
   * Carrega o banco local. NAO engole a falha — ver `samplesLocais` no estado.
   *
   * Continua sem estourar (banco fora do ar nao pode travar o app), mas a
   * diferenca entre "nao estourou" e "deu certo" agora chega na tela.
   */
  /**
   * Quanto esperar antes de cada nova tentativa do banco local, em ms.
   *
   * A causa numero UM da falha e o backend subindo DEPOIS da aba — o
   * `dashboard_server.py` leva alguns segundos, e quem abre os dois juntos
   * cai bem nessa janela. Repetir sozinho conserta o caso comum antes de ele
   * virar pergunta, e o botao da faixa deixa de ser a unica saida.
   *
   * Tres tentativas e para. Insistir pra sempre esconderia backend desligado
   * de verdade atras de um "carregando" eterno — e "carregando" que nunca
   * termina e a mesma mentira do silencio, so que mais lenta.
   */
  private static readonly ESPERAS = [1000, 3000, 8000]

  private tentativaSamples = 0

  private async loadLocalSamples(samplesFn: (map: Record<string, string[]>) => unknown) {
    this.update({ samplesLocais: 'carregando', samplesErro: null })
    try {
      const API = (await import('./api')).API
      const resp = await fetch(`${API}/api/samples/strudel-map`)
      if (!resp.ok) {
        this.falhouSamples(`backend respondeu ${resp.status}`, samplesFn)
        return
      }
      const map: Record<string, string[]> = await resp.json()
      const converted: Record<string, string[]> = {}
      for (const [name, paths] of Object.entries(map)) {
        converted[name] = paths.map(p => `${API}/api/samples/file?path=${encodeURIComponent(p)}`)
      }
      if (!Object.keys(converted).length) {
        // "mapa vazio" NAO e diagnostico: pode ser pasta que nao existe, pasta
        // sem audio, ou disco fora do ar — consertos diferentes. Quem sabe qual
        // e quem tem o disco na mao, entao pergunta-se a ele. Se a pergunta
        // tambem falhar, fica a frase generica: melhor que travar aqui.
        let porque = 'o backend devolveu um mapa vazio'
        try {
          const h = await fetch(`${API}/api/samples/health`)
          const avisos: string[] = h.ok ? ((await h.json())?.avisos ?? []) : []
          if (avisos.length) porque = avisos[0]
        } catch { /* fica a frase generica */ }
        this.falhouSamples(porque, samplesFn)
        return
      }
      await samplesFn(converted)
      this.localSampleNames = Object.keys(converted)
      this.tentativaSamples = 0
      if (this.reparo) { clearTimeout(this.reparo); this.reparo = null }
      this.update({ samplesLocais: 'ok', samplesErro: null })
    } catch (e: unknown) {
      // Causa mais comum: backend ainda subindo quando a pagina carregou.
      const msg = e instanceof Error ? e.message : ''
      this.falhouSamples(msg ? msg.slice(0, 140) : 'nao alcancei o backend', samplesFn)
    }
  }

  private reparo: ReturnType<typeof setTimeout> | null = null

  /**
   * Um lugar so pra "o banco nao entrou": conta a tentativa, agenda a proxima
   * e diz na tela em que pe esta.
   *
   * A mensagem conta a tentativa porque "samples locais nao carregaram" parado
   * na tela nao diz se alguem ainda esta tentando. Quem ve "tentando de novo
   * (2 de 3)" espera; quem ve a frase seca clica, recarrega, reinicia o
   * backend — e atrapalha o proprio conserto que ja estava em curso.
   */
  private falhouSamples(erro: string, samplesFn: (map: Record<string, string[]>) => unknown) {
    const n = this.tentativaSamples
    const temMais = n < StrudelService.ESPERAS.length
    this.update({
      samplesLocais: 'falhou',
      samplesErro: temMais ? `${erro} — tentando de novo (${n + 1} de ${StrudelService.ESPERAS.length})` : erro,
    })
    if (!temMais) return
    this.tentativaSamples = n + 1
    if (this.reparo) clearTimeout(this.reparo)
    this.reparo = setTimeout(() => {
      this.reparo = null
      this.loadLocalSamples(samplesFn).catch(() => {})
    }, StrudelService.ESPERAS[n])
  }

  /**
   * Tenta o banco local de novo, sem recarregar a pagina.
   *
   * Isto e metade do conserto. A outra metade e a tela DIZER que falhou: um
   * botao de reparo que ninguem sabe que precisa apertar nao repara nada.
   */
  async recarregarSamples(): Promise<void> {
    // Zera o contador: quem clicou sabe de algo que o relogio nao sabe (subiu o
    // backend agora) e merece as tres tentativas inteiras de novo.
    this.tentativaSamples = 0
    if (this.reparo) { clearTimeout(this.reparo); this.reparo = null }
    if (!this.initialized) { await this.init(); return }
    const { samples } = await import('superdough')
    await this.loadLocalSamples(samples)
  }

  getLocalSampleNames(): string[] {
    return this.localSampleNames
  }

  /** O editor se pluga aqui pra receber miniLocations + frames do evento tocando. */
  attachHighlight(sink: HighlightSink): () => void {
    this.sink = sink
    if (this.miniLocations.length) sink.onMiniLocations(this.miniLocations)
    if (this.state.playing) this.startDrawer()
    return () => {
      if (this.sink === sink) {
        this.sink = null
        try { this.drawer?.stop(); this.drawerRodando = false } catch {}
      }
    }
  }

  private async startDrawer() {
    if (!this.sink || !this.replInstance) return
    if (!this.drawer) {
      const { Drawer } = await import('@strudel/draw')
      // [0, 0] = só o instante presente. Highlight não precisa de janela futura,
      // e janela maior custa CPU que o audio thread não pode ceder.
      this.drawer = new Drawer((haps: any[], time: number) => {
        if (!this.sink) return
        this.sink.onFrame(haps.filter(h => h.isActive(time)), time)
      }, [0, 0])
    }
    // NUNCA chame `start()` duas vezes. O `Framer` do @strudel/draw
    // (draw.mjs:113) abre um requestAnimationFrame novo a cada `start()` e
    // sobrescreve o proprio `cancel` com o id mais recente — os loops anteriores
    // ficam vivos pra sempre, sem ninguem pra cancela-los.
    //
    // E `startDrawer` roda no `afterEval`, ou seja, A CADA AVALIACAO. Sem esta
    // guarda, cada Ctrl+Enter deixava mais um loop consultando o padrao a cada
    // quadro: dez avaliacoes, dez loops. A sessao ia ficando lenta e ninguem
    // sabia por que. Apareceu quando o arrasto de numero passou a reavaliar
    // varias vezes por segundo e o renderer congelou.
    // PARE antes de comecar. Duas armadilhas, uma de cada lado:
    //
    // 1. Chamar `start()` sem parar VAZA loop. O `Framer` (draw.mjs:113) abre um
    //    requestAnimationFrame novo a cada `start()` e sobrescreve o proprio
    //    `cancel` com o id mais recente — o loop anterior fica vivo pra sempre,
    //    sem ninguem pra cancela-lo. Como `startDrawer` roda no `afterEval`,
    //    cada Ctrl+Enter deixava mais um loop consultando o padrao por quadro.
    //    Dez avaliacoes, dez loops; a sessao ia ficando lenta e ninguem sabia
    //    por que.
    //
    // 2. So `invalidate()` quando ja esta rodando NAO serve. Foi a primeira
    //    tentativa e ela apagou o highlight: se o loop morrer por qualquer
    //    caminho (remontagem do editor, HMR), a flag continua dizendo que ele
    //    vive e nada o ressuscita. O codigo antigo se curava por acidente
    //    justamente porque recriava tudo a cada avaliacao.
    //
    // Parar-e-comecar tem as duas propriedades: um loop so, e sempre vivo.
    try {
      this.drawer.stop()
      this.drawer.start(this.replInstance.scheduler)
      this.drawerRodando = true
    } catch {}
  }

  async evaluate(code: string) {
    await this.init()
    const clean = code.trim()
    if (!clean) return

    const { getAudioContext } = await import('superdough')
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    /* ── a conferencia que acontece ANTES de tocar ─────────────────
     *
     * O erro do superdough (`sound X not found`) so nasce quando um evento
     * tenta tocar: chega tarde, uma vez por evento, com o take ja rodando
     * mudo. Ler o texto aqui da o nome errado no Ctrl+Enter — antes de a
     * pessoa ouvir o silencio e comecar a desconfiar do volume.
     *
     * Zerar primeiro porque o ciclo desta rota e corrigir->ouvir: problema da
     * tentativa anterior colado na tela depois do conserto e a tela mentindo.
     *
     * Conferir NAO impede de tocar. Um take pode montar o nome em tempo de
     * execucao, ou usar uma funcao que este leitor de texto nao entende — e
     * uma tela que se recusa a tocar por causa do proprio palpite e pior que
     * o silencio que ela veio consertar. Avisa, e deixa tocar.
     */
    const diag = diagnostico()
    diag.limpar()
    for (const { som } of conferir(clean, this.sonsConhecidos())) {
      diag.anotarSomAusente(som)
    }

    try {
      // `code` guardado é o CRU. O tom é um envelope de execução: quem salva a
      // versão salva o take que a pessoa escreveu, não o take mais o transpose
      // que ela estava testando. Simulação não persiste.
      this.update({ code, error: null })
      await this.replInstance?.evaluate(envolverComTom(clean, this.state.tom))
      this.update({ playing: true })
    } catch (err: any) {
      const msg = err?.message || String(err)
      this.update({ error: msg, playing: false })
      throw err
    }
  }

  /* ── quais sons o motor CONHECE ──────────────────────────────────
   *
   * Existe porque a linha do tempo estava mentindo. Um take com
   * `s("dirt_dr55")` — banco que nao esta em lugar nenhum — desenha a faixa
   * CHEIA de eventos, porque `queryArc` funciona: o padrao e valido, os
   * eventos existem. O que nao existe e o som. A faixa ficava identica a de
   * uma camada que toca, e o unico aviso era `sound dirt_dr55 not found!` no
   * console, onde ninguem esta olhando enquanto compoe.
   *
   * `soundMap` do superdough e a lista de tudo que o motor sabe tocar: samples
   * locais, bancos de CDN e os sintetizadores embutidos. `null` antes do init
   * e "ainda nao sei" — que NAO e "nao existe", e a diferenca importa: quem
   * desenha nao pode marcar tudo como mudo enquanto o banco carrega.
   */
  private soundMaps: Array<{ get: () => Record<string, unknown>; listen: (cb: () => void) => () => void }> = []

  sonsConhecidos(): Set<string> | null {
    if (!this.soundMaps.length) return null
    const todos = new Set<string>()
    for (const m of this.soundMaps) {
      try { for (const k of Object.keys(m.get())) todos.add(k) } catch { /* copia morta */ }
    }
    return todos.size ? todos : null
  }

  /** Avisa quando o banco muda (sample novo entrou, reparo rodou). */
  ouvirSons(cb: () => void): () => void {
    const parar = this.soundMaps.map(m => {
      try { return m.listen(cb) } catch { return () => {} }
    })
    return () => parar.forEach(f => f())
  }

  /**
   * Da pra posicionar a agulha?
   *
   * Pergunta ao scheduler REAL em vez de confiar na chave: o `repl()` cai no
   * Cyclist sozinho quando nao ha SharedWorker, entao a chave dizer "sync" nao
   * garante que veio NeoCyclist. Quem desenha a regua precisa saber a verdade,
   * senao oferece um gesto que nao acontece.
   */
  podeMoverAgulha(): boolean {
    const sch = this.replInstance?.scheduler
    return typeof sch?.setCycle === 'function'
  }

  /** Leva o relogio pro ciclo pedido. `false` = este scheduler nao sabe. */
  moverAgulha(ciclo: number): boolean {
    const sch = this.replInstance?.scheduler
    if (typeof sch?.setCycle !== 'function') return false
    if (!Number.isFinite(ciclo)) return false
    sch.setCycle(Math.max(0, ciclo))
    return true
  }

  stop() {
    try { this.replInstance?.stop() } catch {}
    try { this.drawer?.stop(); this.drawerRodando = false } catch {}
    this.sink?.onClear()
    this.update({ playing: false })
  }

  async play() {
    if (!this.state.code) return
    await this.evaluate(this.state.code)
  }

  setBPM(bpm: number) {
    const clamped = Math.max(30, Math.min(300, bpm))
    this.update({ bpm: clamped })
    if (this.replInstance) {
      this.replInstance.setCps(clamped / 60 / 4)
    }
  }

  /**
   * Transpõe o que está soando, em semitons.
   *
   * Reavalia porque tom não é nó de áudio: volume, lpf e delay são Web Audio e
   * mudam ao vivo; altura de nota mora no PADRÃO. Se não estiver tocando, só
   * guarda — o próximo play já sai no tom certo.
   */
  async setTom(semitons: number) {
    const n = Math.max(-24, Math.min(24, Math.round(semitons)))
    if (n === this.state.tom) return
    this.update({ tom: n })
    if (this.state.playing && this.state.code.trim()) {
      await this.evaluate(this.state.code).catch(() => {})
    }
  }

  onReady(cb: () => void) {
    if (this.gainNode) cb()
    else this.readyCallbacks.push(cb)
  }

  setVolume(v: number) {
    if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, v))
  }

  setLPF(freq: number) {
    if (this.lpfNode) this.lpfNode.frequency.value = freq
  }

  setHPF(freq: number) {
    if (this.hpfNode) this.hpfNode.frequency.value = freq
  }

  setDelay(amount: number) {
    if (this.delayGain) this.delayGain.gain.value = Math.min(0.8, amount)
  }

  setReverb(_amount: number) {
    if (this.delayNode && this.delayGain) {
      this.delayNode.delayTime.value = 0.15 + _amount * 0.35
      this.delayGain.gain.value = Math.max(this.delayGain.gain.value, _amount * 0.6)
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  getCaptureStream(): MediaStream | null {
    return this.captureDest?.stream ?? null
  }

  getState(): StrudelState {
    return { ...this.state }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  destroy() {
    this.stop()
    captureRegistry.unregister('analogbrain')
    try { this.gainNode?.disconnect() } catch {}
    instance = null
  }

  private update(patch: Partial<StrudelState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(fn => fn(this.state))
  }
}
