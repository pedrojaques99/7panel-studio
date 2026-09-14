/**
 * Exportar a música como arquivo.
 *
 * O DADO DURO, e ele manda em todo o resto: o Strudel só existe TOCANDO. Não há
 * render offline — o padrão vira som num AudioContext ao vivo, uma vez, na
 * velocidade da vida. Então exportar 3:30 leva 3:30 de relógio. Isso não é
 * limitação a esconder: é o primeiro texto que a tela mostra, porque a pessoa
 * precisa decidir se tem esse tempo antes de apertar, não depois.
 *
 * Três decisões que fazem o arquivo sair como música, e não como um pedaço:
 *
 * 1. CORTE NO COMPASSO. 3:30 em 140 bpm não é número inteiro de ciclos, e um
 *    take que termina no meio do compasso soa como queda de energia. O alvo é
 *    arredondado pro ciclo mais próximo — 3:30 vira 3:25.7, e a tela diz isso
 *    antes de gravar.
 * 2. COMEÇO NO CICLO ZERO. `stop()` do Strudel zera o relógio (cyclist.mjs:
 *    `lastEnd = 0`), então parar e reavaliar faz o take começar do topo em vez
 *    de entrar no meio da volta.
 * 3. FADE DEPOIS, NÃO DURANTE. O fade é aplicado no buffer decodificado, não no
 *    volume ao vivo: quem está na sala ouve a música inteira, e o arquivo é que
 *    termina bonito. Um fade no gain ao vivo estragaria a escuta pra fazer o
 *    arquivo — a ordem certa é o contrário.
 */
import { encodeWav } from '../lib/audio-utils'
import type { Arranjo } from './camadas'

/** Um ciclo do Strudel = 4 tempos. É a unidade em que o corte precisa cair. */
export const TEMPOS_POR_CICLO = 4

export type Tempo = { rotulo: string; segundos: number; nota: string }

/**
 * Durações padrão de música, não números redondos de gravação.
 *
 * 3:30 está aí porque é o single de rádio; 1:00 porque é o que reels e tiktok
 * cortam; 0:30 porque é spot. Quem quiser 7 minutos usa o campo livre.
 */
export const TEMPOS: Tempo[] = [
  { rotulo: '0:30', segundos: 30, nota: 'spot' },
  { rotulo: '1:00', segundos: 60, nota: 'reels' },
  { rotulo: '2:00', segundos: 120, nota: 'faixa curta' },
  { rotulo: '3:30', segundos: 210, nota: 'single' },
  { rotulo: '5:00', segundos: 300, nota: 'club' },
]

export type Corte = { ciclos: number; segundos: number }

/**
 * Arredonda o alvo pro número inteiro de ciclos mais próximo.
 *
 * Nunca devolve zero ciclo: alvo de 5 s em 60 bpm (ciclo de 4 s) dá 1 ciclo, e
 * não um arquivo vazio.
 */
export function corteEmCiclos(alvoSegundos: number, bpm: number): Corte {
  const seguro = Math.max(30, Math.min(300, bpm || 120))
  const porCiclo = (60 / seguro) * TEMPOS_POR_CICLO
  const ciclos = Math.max(1, Math.round(alvoSegundos / porCiclo))
  return { ciclos, segundos: ciclos * porCiclo }
}

/**
 * A peça inteira: quanto dura uma volta completa do arranjo.
 *
 * `corteEmCiclos` ARREDONDA um alvo em segundos pro compasso mais próximo —
 * existe porque "3:30" é um número de rádio que não conhece o bpm. Aqui é o
 * contrário: `casas × porCasa` já É um número inteiro de ciclos, escrito pelo
 * autor na `.mask()`. Não há nada a arredondar, e arredondar seria justamente
 * perder o fim da peça.
 *
 * O detector vem de `camadas.ts`, o MESMO que a régua da `Timeline` consome pra
 * dizer `casa 6/8`. Um segundo parser aqui faria a régua e o arquivo discordarem
 * sobre onde a música acaba — e discordariam em silêncio.
 */
export function duracaoDoArranjo(arranjo: Arranjo, bpm: number): Corte {
  const seguro = Math.max(30, Math.min(300, bpm || 120))
  const ciclos = Math.max(1, Math.round(arranjo.casas * arranjo.porCasa))
  return { ciclos, segundos: ciclos * (60 / seguro) * TEMPOS_POR_CICLO }
}

/** "3:25.7" — sempre com o décimo, porque a diferença pro alvo é justamente ele. */
export function mmss(segundos: number, decimo = false): string {
  const s = Math.max(0, segundos)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return decimo
    ? `${m}:${r.toFixed(1).padStart(4, '0')}`
    : `${m}:${String(Math.round(r)).padStart(2, '0')}`
}

/**
 * `entropia-v7-3m26s.wav` — o nome diz o que tem dentro sem abrir.
 *
 * A versão entra no nome porque o nome sozinho é determinístico: exportar o
 * mesmo 3:30 antes e depois de mexer no pad dava dois arquivos com o MESMO
 * nome, e o navegador resolvia com "(1)". Qual é qual, ninguém sabia — e o
 * ciclo exportar→comparar→escolher morria no gerenciador de arquivos.
 *
 * `rascunho` no lugar do número quando há edição não salva: a palavra é a
 * marcação que funciona sem cor. Quem lê o nome sabe que aquele take não
 * existe no acervo.
 */
export function nomeArquivo(
  musica: string, segundos: number, versao?: number, rascunho = false, completa = false,
): string {
  const base = (musica || 'take').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'take'
  const m = Math.floor(segundos / 60)
  const s = Math.round(segundos - m * 60)
  const marca = rascunho ? '-rascunho' : versao !== undefined && versao >= 0 ? `-v${versao}` : ''
  // `completa` no nome porque a duração sozinha não responde a primeira pergunta
  // que se faz no gerenciador de arquivos: isso é a peça inteira ou um corte de
  // 2:00 que por acaso caiu perto? Dois wavs de 2m08s podem ser coisas
  // diferentes; um deles termina onde o arranjo termina.
  const forma = completa ? '-completa' : ''
  return `${base}${marca}${forma}-${m}m${String(s).padStart(2, '0')}s.wav`
}

/**
 * Quanto fade de saída dar. 3% da duração, entre 1,2 s e 4 s.
 *
 * Fixo em 2 s ficava longo demais num corte de 30 s (7% da peça sumindo) e curto
 * demais em 5 min. Proporcional com teto resolve os dois.
 */
export function duracaoFade(segundos: number): number {
  return Math.min(4, Math.max(1.2, segundos * 0.03))
}

/**
 * Aplica fade no lugar, canal a canal.
 *
 * A entrada é de 15 ms e existe só pra matar o clique do primeiro sample — o
 * MediaRecorder começa no meio de qualquer coisa que já estava soando.
 */
export function aplicaFade(
  canais: Float32Array[],
  sampleRate: number,
  fadeSaida: number,
  fadeEntrada = 0.015,
): void {
  const total = canais[0]?.length ?? 0
  const nEntrada = Math.min(Math.floor(fadeEntrada * sampleRate), Math.floor(total / 2))
  const nSaida = Math.min(Math.floor(fadeSaida * sampleRate), total - nEntrada)
  for (const c of canais) {
    for (let i = 0; i < nEntrada; i++) c[i] *= i / nEntrada
    for (let i = 0; i < nSaida; i++) {
      // `i` conta do FIM pra trás, então o ganho é i/nSaida: zero no último
      // sample, cheio onde o fade começa. Escrito ao contrário (1 - i/nSaida) o
      // arquivo termina em volume cheio e dá clique — foi o primeiro jeito que
      // escrevi, e o teste pegou.
      // Curva quadrática porque linear soa como alguém baixando o volume: o
      // ouvido percebe o fim antes da hora.
      const t = i / nSaida
      c[total - 1 - i] *= t * t
    }
  }
}

/** Corta o buffer no comprimento pedido e devolve os canais soltos. */
export function recorta(buffer: AudioBuffer, segundos: number): Float32Array[] {
  const n = Math.min(buffer.length, Math.floor(segundos * buffer.sampleRate))
  const canais: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    canais.push(buffer.getChannelData(c).slice(0, n))
  }
  return canais
}

/** Monta um AudioBuffer a partir dos canais já tratados. */
function remonta(ctx: BaseAudioContext, canais: Float32Array[], sampleRate: number): AudioBuffer {
  const buf = ctx.createBuffer(canais.length, canais[0].length, sampleRate)
  // `set` no lugar de copyToChannel: o canal recortado e Float32Array<ArrayBufferLike>
  // e o DOM pede Float32Array<ArrayBuffer>. Copiar direto evita o cast.
  canais.forEach((c, i) => buf.getChannelData(i).set(c))
  return buf
}

export type ProgressoExport = { decorrido: number; total: number }

export type PedidoExport = {
  stream: MediaStream
  ctx: AudioContext
  segundos: number
  musica: string
  /** Vai pro nome do arquivo: v7, ou "rascunho" se houver edição não salva. */
  versao?: number
  rascunho?: boolean
  /** Take que vai do começo ao fim do arranjo, não um corte de formato. */
  completa?: boolean
  onProgresso?: (p: ProgressoExport) => void
  /** Chamado quando o arquivo está pronto; devolve o blob e o nome. */
  sinal?: AbortSignal
}

/**
 * Grava o stream por `segundos` e devolve um WAV com fade.
 *
 * webm→decode→wav em vez de gravar wav direto porque MediaRecorder não faz wav
 * em nenhum navegador. O caminho é o mesmo do ExporterPanel, que já roda há
 * meses — não inventei formato novo.
 */
export async function gravaTake(p: PedidoExport): Promise<{ blob: Blob; nome: string }> {
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'
  const rec = new MediaRecorder(p.stream, { mimeType: mime })
  const pedacos: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size > 0) pedacos.push(e.data) }

  const inicio = performance.now()
  const tick = setInterval(() => {
    p.onProgresso?.({ decorrido: (performance.now() - inicio) / 1000, total: p.segundos })
  }, 250)

  const parado = new Promise<void>(resolve => { rec.onstop = () => resolve() })
  rec.start(250)

  // Um rabo de 0,6 s: reverb e delay do último golpe ainda estão soando quando o
  // relógio bate, e o corte + fade acontecem depois, no buffer.
  const timer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop() }, (p.segundos + 0.6) * 1000)
  const cancelar = () => { if (rec.state !== 'inactive') rec.stop() }
  p.sinal?.addEventListener('abort', cancelar)

  await parado
  clearInterval(tick)
  clearTimeout(timer)
  p.sinal?.removeEventListener('abort', cancelar)

  if (p.sinal?.aborted) throw new Error('exportação cancelada')

  const bruto = new Blob(pedacos, { type: mime })
  const buffer = await p.ctx.decodeAudioData(await bruto.arrayBuffer())
  const canais = recorta(buffer, p.segundos)
  if (!canais.length || !canais[0].length) throw new Error('não veio áudio: a música estava tocando?')
  aplicaFade(canais, buffer.sampleRate, duracaoFade(p.segundos))
  const blob = encodeWav(remonta(p.ctx, canais, buffer.sampleRate))
  return { blob, nome: nomeArquivo(p.musica, p.segundos, p.versao, p.rascunho, p.completa) }
}

/** Entrega o arquivo pro navegador. */
export function baixa(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
