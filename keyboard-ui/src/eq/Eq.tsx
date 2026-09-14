/**
 * /eq — tirar o chiado, pôr grave, pôr espaço. Com a mão, ouvindo.
 *
 * Rota SOLTA de propósito: ela abre um arquivo qualquer, inclusive um que nunca
 * passou pela esteira do /fabrica. O caso que a trouxe a existir foi uma cama de 1 h
 * já renderizada e já misturada, que saiu chiada — e não havia por onde mexer nela
 * sem editar um POST à mão.
 *
 * ## Medido e escolhido não são a mesma coisa, e a tela mostra a divisa
 *
 * O `dsp/domar.py` é correção MEDIDA: ele mede um defeito do esticado e conserta na
 * proporção do número que mediu, com limiares calibrados contra o acervo. O grave e o
 * reverb são GOSTO — o próprio módulo recusava reverb por escrito ("cama nao leva
 * efeito: leva correcao"). Os dois convivem aqui, mas não se disfarçam um de outro: o
 * bloco de cima é o que a máquina mediu, o de baixo é o que a pessoa escolheu.
 *
 * ## Por que uma mesa XY e não seis knobs
 *
 * O pedido real tem dois eixos, não seis: "tá muito chiado" e "quero mais grave".
 * Seis knobs alinhados seriam seis decisões para um problema de duas, e é assim que
 * painel vira parede. A mesa resolve os dois num gesto; o resto é ajuste fino e fica
 * menor, embaixo, onde ajuste fino deve ficar.
 *
 * ## O preview é aproximação, e diz isso
 *
 * O som que sai daqui é Web Audio no browser: shelf, shelf, teto e uma convolução com
 * IR gerado na hora — a MESMA técnica do IR do backend (rajada de ruído com decaimento
 * exponencial, cauda abafada em 9 kHz), então os dois se parecem por construção e não
 * por sorte. Mas quem manda é o render do backend, que é ffmpeg e é medido. A tela
 * nunca chama o preview de resultado.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { VintageXYPad } from '@/components/ui/vintage-xy-pad'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { VintageLed } from '@/components/ui/vintage-led'
import { VintageMeter } from '@/components/ui/vintage-meter'
import { VintageOscilloscope } from '@/components/ui/vintage-oscilloscope'
import { resolveUrl, audioSrc } from '../lib/api'

/* ── contrato com o backend ────────────────────────────────────────────────
 * POST /api/domar { path, escuro_db, grave_db, reverb_wet, reverb_decay, alvo_lufs }
 * GET  /api/domar/status/<job_id>
 * Os quatro últimos são a camada de gosto; todos default desligado no Python, então
 * chamada sem eles sai idêntica ao que saía antes de existirem. */

type Resumo = { lufs?: number | null; faixa_db?: number; periodo_s?: number }
type Job = {
  status: 'running' | 'done' | 'error'
  out?: string
  lufs?: number | null
  antes?: Resumo
  depois?: Resumo
  notas?: string[]
  error?: string
}

/* ── as réguas ─────────────────────────────────────────────────────────────
 * Os limites vieram do OUVIDO de quem usa, não de teoria. A primeira versão tinha
 * escuro até 12 dB e grave até +10, justificado por "o acervo nunca precisou de mais".
 * Na primeira sessão de verdade o Jaques parou nos dois cantos — 19% de brilho e 88%
 * de grave — e disse que o gosto dele era dali PRA MAIS. Régua que termina onde a
 * pessoa quer continuar é régua errada, por mais bem argumentada que seja.
 *
 * Agora o ponto que ele escolheu (−9,7 / +8,1) cai no meio da escala, com espaço dos
 * dois lados. Escuro forte não é exagero aqui: o cabeçalho do `domar.py` já diz que
 * esticado de referência (Eno, 9 Beet Stretch) É escuro, e a base é drone dark. */
const ESCURO_MAX = 20
/* O grave e BIPOLAR (-6 a +10), e nao 0 a +10, por duas razoes que se somam:
   tirar grave e um pedido tao legitimo quanto por, e — visto na tela — um eixo que
   comeca no zero absoluto deixa o punho encostado na borda de baixo no repouso,
   cortado pela metade e por cima dos rotulos. Controle cujo estado de repouso mora
   na quina parece quebrado antes de alguem tocar nele. */
const GRAVE_MIN = -8
const GRAVE_MAX = 18
const TETO_HZ = 13000
const ESCURO_HZ = 4500
const GRAVE_HZ = 110

/** x=0 é escuro (shelf no talo), x=1 é brilho (shelf desligado). */
const xParaEscuro = (x: number) => (1 - x) * ESCURO_MAX
const escuroParaX = (db: number) => 1 - db / ESCURO_MAX

const yParaGrave = (y: number) => GRAVE_MIN + y * (GRAVE_MAX - GRAVE_MIN)
const graveParaY = (db: number) => (db - GRAVE_MIN) / (GRAVE_MAX - GRAVE_MIN)

const fmtDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

/**
 * IR sintético para o preview: ruído com decaimento exponencial.
 *
 * É a mesma receita do `_ir()` do backend, e é de propósito — dois geradores
 * diferentes dariam preview e render com espaços diferentes, que é pior que não ter
 * preview. Os canais recebem ruído independente: dois iguais convolvem para uma cauda
 * mono no centro, o oposto do que reverb serve para fazer.
 */
function fazerIR(ctx: AudioContext, decay: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * decay))
  const buf = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) {
      // decaimento exponencial: e^-5 no fim da cauda é ~-43 dB, que é onde uma cauda
      // deixa de ser ouvida e passa a ser só CPU.
      d[i] = (Math.random() * 2 - 1) * Math.exp((-5 * i) / n)
    }
  }
  return buf
}

export function Eq() {
  /* `?path=` na URL: a /fabrica manda a cama pra cá com um link, em vez de a
     pessoa copiar caminho do Windows à mão de uma tela pra outra. Sem o parâmetro
     a rota continua abrindo vazia, que é o uso solto pra que ela nasceu. */
  const [path, setPath] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('path') ?? '' }
    catch { return '' }
  })
  /* A mesa abre NO GOSTO DA CASA, não no neutro. O ponto (−14 / +10,5) foi escolhido
     à mão, ouvindo, e não derivado de nada — a base é drone dark e o pedido era menos
     chiado e mais corpo, então abrir no neutro custava um arrasto por sessão pra
     chegar sempre no mesmo lugar.
     Isto NÃO afrouxa a divisa entre medido e escolhido: o que a tela aplica está
     escrito em dB na cara dela, grande, antes de qualquer render. O que protege o
     acervo é outra coisa e continua de pé — `grave_db` nasce 0.0 no `domar.py`, então
     quem chama a API sem passar nada segue tendo o comportamento de sempre (guardado
     por `test_sem_grave_a_cadeia_sai_igual_a_de_antes`). */
  const [escuroDb, setEscuroDb] = useState(14)
  const [graveDb, setGraveDb] = useState(10.5)
  const [reverbWet, setReverbWet] = useState(0)
  const [reverbDecay, setReverbDecay] = useState(2.5)
  const [alvoLufs, setAlvoLufs] = useState(-16)

  const [job, setJob] = useState<Job | null>(null)
  const [erro, setErro] = useState('')
  const [rodando, setRodando] = useState(false)
  /* O analisador vive em estado (e não em ref) porque a peça do espectro precisa
     receber o nó UMA vez, quando ele passa a existir. Depois disso ela lê o buffer
     por quadro sozinha, sem passar pelo React — sessenta setState por segundo
     repintariam a árvore inteira pra mexer um pixel. */
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const grafo = useRef<{
    ctx: AudioContext
    escuro: BiquadFilterNode
    grave: BiquadFilterNode
    wet: GainNode
    conv: ConvolverNode
  } | null>(null)

  /* ── o grafo de preview ─────────────────────────────────────────────────
   * Montado uma vez, no primeiro play. `createMediaElementSource` só pode ser
   * chamado UMA vez por elemento — chamar de novo lança, e em StrictMode o efeito
   * roda duas vezes, então a guarda do ref não é zelo, é requisito. */
  const montarGrafo = useCallback(() => {
    const el = audioRef.current
    if (!el || grafo.current) return
    const ctx = new AudioContext()
    // Contexto criado dentro de um gesto costuma nascer rodando, mas nao e garantido —
    // e suspenso ele nao erra, so nao sai som.
    void ctx.resume()
    const src = ctx.createMediaElementSource(el)

    const escuro = ctx.createBiquadFilter()
    escuro.type = 'highshelf'
    escuro.frequency.value = ESCURO_HZ

    const grave = ctx.createBiquadFilter()
    grave.type = 'lowshelf'
    grave.frequency.value = GRAVE_HZ

    const teto = ctx.createBiquadFilter()
    teto.type = 'lowpass'
    teto.frequency.value = TETO_HZ

    const conv = ctx.createConvolver()
    conv.buffer = fazerIR(ctx, reverbDecay)

    // A cauda leva o mesmo abafamento de 9 kHz do IR do backend. Sem isso o reverb
    // RECOLOCA o chiado que o shelf acabou de tirar — que é o defeito que trouxe
    // esta rota a existir.
    const abafa = ctx.createBiquadFilter()
    abafa.type = 'lowpass'
    abafa.frequency.value = 9000

    const wet = ctx.createGain()
    wet.gain.value = reverbWet
    const dry = ctx.createGain()
    dry.gain.value = 1   // o seco passa em ganho 1 SEMPRE, como no backend

    // O analisador fica no FIM da cadeia, não no começo: o espectro tem que mostrar
    // o que sai, senão ele desenha o arquivo e não o que a mesa está fazendo com ele.
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    an.smoothingTimeConstant = 0.8

    src.connect(escuro).connect(grave).connect(teto)
    teto.connect(dry).connect(an)
    teto.connect(conv).connect(abafa).connect(wet).connect(an)
    an.connect(ctx.destination)

    grafo.current = { ctx, escuro, grave, wet, conv }
    setAnalyser(an)
  }, [reverbDecay, reverbWet])

  /* Os parâmetros seguem o estado. `setTargetAtTime` em vez de atribuição direta
   * porque saltar o ganho de um filtro durante a reprodução estala. */
  useEffect(() => {
    const g = grafo.current
    if (!g) return
    const t = g.ctx.currentTime
    g.escuro.gain.setTargetAtTime(-escuroDb, t, 0.02)
    g.grave.gain.setTargetAtTime(graveDb, t, 0.02)
    g.wet.gain.setTargetAtTime(reverbWet, t, 0.02)
  }, [escuroDb, graveDb, reverbWet])

  /* Trocar o tamanho da sala é trocar o buffer, não interpolar um parâmetro. */
  useEffect(() => {
    const g = grafo.current
    if (!g) return
    g.conv.buffer = fazerIR(g.ctx, reverbDecay)
  }, [reverbDecay])

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    void grafo.current?.ctx.close()
  }, [])

  const renderizar = useCallback(async () => {
    if (!path || rodando) return
    setRodando(true); setErro(''); setJob(null)
    try {
      const r = await fetch(resolveUrl('/api/domar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          escuro_db: escuroDb,
          grave_db: graveDb,
          reverb_wet: reverbWet,
          reverb_decay: reverbDecay,
          alvo_lufs: alvoLufs,
        }),
      })
      const data = await r.json()
      if (data?.error || !data?.job_id) {
        setErro(String(data?.error ?? 'o domar não devolveu job')); setRodando(false); return
      }
      setJob({ status: 'running', out: data.out })
      const jobId: string = data.job_id
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const s = await fetch(resolveUrl(`/api/domar/status/${jobId}`))
            const j = await s.json() as Job
            if (j?.status === 'done' || j?.status === 'error') {
              if (timerRef.current) window.clearInterval(timerRef.current)
              if (j.status === 'error') setErro(String(j.error ?? 'erro no domar'))
              setJob(j); setRodando(false)
            }
          } catch { /* rede piscou: a próxima batida do polling resolve */ }
        })()
      }, 2500)
    } catch (e) {
      setErro(String(e)); setRodando(false)
    }
  }, [path, rodando, escuroDb, graveDb, reverbWet, reverbDecay, alvoLufs])

  const rotulo: React.CSSProperties = {
    font: '500 10px/1 var(--font-vintage-mono, monospace)',
    letterSpacing: '0.16em', textTransform: 'uppercase',
    color: 'var(--vintage-text-muted)',
  }
  const valor: React.CSSProperties = {
    font: '500 26px/1 var(--font-vintage-mono, monospace)',
    color: 'var(--vintage-value)', fontVariantNumeric: 'tabular-nums',
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--vintage-surface-1)',
      color: 'var(--vintage-text-muted)', padding: 30,
      font: '400 13px/1.5 var(--font-vintage-mono, monospace)',
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gap: 30 }}>

        {/* ── o arquivo ── */}
        <header style={{ display: 'grid', gap: 10 }}>
          <span style={rotulo}>arquivo</span>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="caminho do áudio no disco"
            spellCheck={false}
            style={{
              width: '100%', padding: '10px 12px', background: 'var(--vintage-surface-2)',
              border: '1px solid var(--vintage-border)', color: 'var(--vintage-label)',
              font: 'inherit', outline: 'none',
            }}
          />
          {path && (
            <audio
              ref={audioRef}
              controls
              /* SEM ISTO NAO SAI SOM. O audio vem do backend (:5000) e a pagina roda no
                 vite (:5173+) — origens diferentes. `createMediaElementSource` num
                 elemento cross-origin sem CORS declarado marca a midia como contaminada
                 e o no passa a emitir ZEROS: o player anda, o console fica limpo, e nao
                 sai nada. O `/api/preview` ja devolve `Access-Control-Allow-Origin: *`;
                 o que faltava era o elemento PEDIR em modo CORS. */
              crossOrigin="anonymous"
              src={audioSrc(path)}
              onPlay={montarGrafo}
              style={{ width: '100%', height: 40, colorScheme: 'dark' }}
            />
          )}
          {/* O espectro é o desenho honesto de um EQ: você move a mesa e vê a banda
              ceder. Só existe quando há som passando — tubo aceso sem sinal é
              decoração, e decoração que finge instrumento é o que faz tela parecer
              feita por máquina. */}
          {/* `wave` e nao `fft`: com analisador ao vivo a peca chama SEMPRE
              `getFloatTimeDomainData`, seja qual for o `mode`. Pedir `fft` entrega
              amostras de tempo a um desenho que espera magnitude em dB, e o resultado
              e uma parede cravada no talo em toda a banda — medidor pregado no maximo
              nao mede nada. (Vale uma correcao no registry; aqui a saida honesta e
              desenhar o que de fato chega.) */}
          {analyser && (
            <VintageOscilloscope analyser={analyser} mode="wave" fill height={140} />
          )}
          <span style={{ ...rotulo, color: 'var(--vintage-text-dim)' }}>
            o que você ouve aqui é aproximação — quem mede é o render
          </span>
        </header>

        {/* ── o gesto ── */}
        <section style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <VintageXYPad
              size={260}
              value={{ x: escuroParaX(escuroDb), y: graveParaY(graveDb) }}
              onChange={(x, y) => { setEscuroDb(xParaEscuro(x)); setGraveDb(yParaGrave(y)) }}
              labelX="escuro ← → brilho"
              /* curto de proposito: a peca imprime os dois rotulos na MESMA linha, e
                 texto longo aqui encosta um no outro. O sinal do grave ja esta dito
                 no valor logo abaixo (+0.0), que e onde ele importa. */
              labelY="grave"
            />
            <div style={{ display: 'flex', gap: 30 }}>
              <div>
                <div style={valor}>{fmtDb(-escuroDb)}</div>
                <span style={rotulo}>agudo @ {ESCURO_HZ} Hz</span>
              </div>
              <div>
                <div style={valor}>{fmtDb(graveDb)}</div>
                <span style={rotulo}>grave @ {GRAVE_HZ} Hz</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <VintageKnob label="RVB" min={0} max={1} value={reverbWet} size={74}
              fmt={v => v.toFixed(2)} onChange={setReverbWet} />
            <VintageKnob label="DECAY" min={0.5} max={8} value={reverbDecay} size={74}
              fmt={v => `${v.toFixed(1)}s`} onChange={setReverbDecay} />
            <VintageKnob label="ALVO" min={-24} max={-10} value={alvoLufs} size={74}
              fmt={v => `${v.toFixed(0)}`} onChange={setAlvoLufs} />
          </div>
        </section>

        {/* ── o render ── */}
        <footer style={{
          display: 'flex', alignItems: 'center', gap: 18,
          borderTop: '1px solid var(--vintage-border)', paddingTop: 18,
        }}>
          <VintageLed
            active={rodando || job?.status === 'done'}
            pulse={rodando}
            color={job?.status === 'error' ? 'red' : rodando ? 'orange' : 'green'}
            label={rodando ? 'renderizando' : job?.status === 'done' ? 'pronto' : 'parado'}
          />
          <button
            type="button"
            onClick={() => void renderizar()}
            disabled={!path || rodando}
            style={{
              marginLeft: 'auto', padding: '12px 22px',
              background: 'var(--vintage-surface-3)',
              border: '1px solid var(--vintage-border)',
              color: path && !rodando ? 'var(--vintage-value)' : 'var(--vintage-text-dim)',
              font: 'inherit', letterSpacing: '0.14em', textTransform: 'uppercase',
              cursor: path && !rodando ? 'pointer' : 'default',
            }}>
            {rodando ? 'renderizando…' : 'renderizar'}
          </button>
        </footer>

        {erro && <p style={{ color: 'var(--vintage-label)' }}>{erro}</p>}

        {/* ── o que a máquina mediu, separado do que você escolheu ── */}
        {job?.status === 'done' && (
          <section style={{ display: 'grid', gap: 14 }}>
            {/* Medidor e não número solto: o par antes/depois só quer dizer alguma
                coisa se der pra ver a distância entre os dois de relance. O número
                fica junto porque medidor sozinho não fecha contrato. */}
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
              {([['antes', job.antes?.lufs], ['depois', job.lufs]] as const).map(([q, v]) => (
                <div key={q} style={{ display: 'grid', gap: 8, minWidth: 190 }}>
                  <VintageMeter label={q} readOnly min={-30} max={0} value={v ?? -30} />
                  <div style={valor}>{typeof v === 'number' ? v.toFixed(1) : '—'}</div>
                  <span style={rotulo}>{q} · lufs</span>
                </div>
              ))}
            </div>
            {job.notas?.length ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                {job.notas.map(n => (
                  <li key={n} style={{ color: 'var(--vintage-text-muted)' }}>
                    {/* a própria nota diz "gosto, nao medicao" quando é o caso —
                        vem do backend, não é rótulo que a tela inventa */}
                    {n}
                  </li>
                ))}
              </ul>
            ) : null}
            {job.out && (
              <audio controls src={audioSrc(job.out)}
                style={{ width: '100%', height: 40, colorScheme: 'dark' }} />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
