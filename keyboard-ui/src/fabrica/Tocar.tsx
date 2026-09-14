/**
 * TOCAR — etapa 1 da fábrica: a fonte deixa de ser código gerado por LLM e passa a ser
 * mão em teclado.
 *
 * O material só interessa depois de esticado 12x no Paulstretch, e isso muda o que é
 * "tocar bem" aqui:
 *  - pulso baixo. O Paulstretch mata o transiente mas NÃO mata a periodicidade de
 *    amplitude — uma batida vira um swell de 6 s ("ressaca"). Nada de martelar.
 *  - densidade harmônica alta. Acorde consonante segurado, várias notas juntas.
 *  - envelope sem borda: attack e release longos por padrão.
 *  - a "nuvem" vem de modulação LENTA do filtro, não de nota nova.
 *  - o sequenciador é LENTO por construção: passo em SEGUNDOS (2–4 s), nunca bpm,
 *    passos que se sobrepõem pelo release, e a régua desenhada em segundos já
 *    esticados — 2,5 s de passo são 30 s na peça final.
 *
 * As duas regras acima não são escritas na tela, são DESENHADAS: o fator realmente
 * entregue sobe enquanto se grava (medidor ESTICADO REAL), e a densidade de ataque sai
 * da zona boa sozinha quando a mão martela (medidor PULSO). Todo medidor tem a mesma
 * anatomia: rótulo, valor, qualificador (a régua), evidência (a forma) e NO MÁXIMO uma
 * legenda. Duas frases explicando o mesmo medidor são ruído, não didática.
 *
 * ## O que a tela mostra em repouso
 *
 * Três coisas, e nada mais: as três pílulas de preset, o TECLADO (que é o herói e
 * ocupa a largura toda) e uma faixa de ação embaixo dele. Dez blocos empilhados de uma
 * vez eram uma parede, e parede não ensina passo nenhum.
 *
 * O resto continua existindo, só passou a ter HORA:
 *  - o sequenciador virou MODO. A faixa de ação troca e a grade nasce embaixo do
 *    teclado, porque é o teclado que preenche os passos.
 *  - PULSO aparece enquanto há nota soando (a janela de 4 s do próprio medidor segura
 *    ele de pé mais um tempo, então ele não pisca a cada nota).
 *  - ESTICADO REAL aparece durante a gravação e logo depois dela. É a régua que ensina
 *    a gravar mais tempo, e só ensina para quem está gravando.
 *  - VOLUME e os controles de voz moram juntos no disclosure `ajustar`, fechado, em
 *    grade densa: painel de ajuste fino não é seção principal.
 *
 * Não reimplementa motor: notas de `lib/notes`, contexto de `lib/audio-context`,
 * efeitos de `lib/fx-rack`, LFO de `lib/lfo`, MIDI de `lib/midi`, envelope desenhado
 * por `lib/ADSRDisplay`, upload igual ao do SynthPanel (`/api/upload`, nome
 * `synth-rec-*.webm`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as EventoTecla, ReactNode } from 'react'
import * as Tone from 'tone'
import { WHITE_NOTES, NOTE_CENTS, KEY_NOTE, BLACK_KEYS } from '../lib/notes'
import type { WhiteNote } from '../lib/notes'
import { getSharedAudioContext, createCaptureDestination } from '../lib/audio-context'
import { createFxChain, updateFxChain, disposeFxChain, FX_DEFAULTS } from '../lib/fx-rack'
import type { FxChain, FxParams } from '../lib/fx-rack'
import { createLFO, connectLFO, updateLFO, disposeLFO } from '../lib/lfo'
import { requestMIDIAccess, listMIDIInputs, createMIDIListener } from '../lib/midi'
import { resolveUrl, audioSrc } from '../lib/api'
import { ADSRDisplay } from '../lib/ADSRDisplay'
import {
  FUNDO, FUNDO_ALTO, t100, t70, t45, t25, t12, t06,
  ACESO, ACESO_FRACO, MONO, ESP, LINHA, ESTADO, TRANSICAO,
} from './ui'
import type { Estado } from './ui'

/* ── notas ───────────────────────────────────────────────────────── */

const C4_HZ = 261.6255653005986

type Tecla = { id: string; cents: number; atalho?: string }

const TECLA_POR_ATALHO: Record<string, string> = {}
const ATALHO_POR_NOTA: Record<string, string> = {}
for (const [k, n] of Object.entries(KEY_NOTE)) { TECLA_POR_ATALHO[k] = n; ATALHO_POR_NOTA[n] = k }

const BRANCAS: Tecla[] = WHITE_NOTES.map(n => ({
  id: n, cents: NOTE_CENTS[n as WhiteNote], atalho: ATALHO_POR_NOTA[n],
}))

const PRETAS: (Tecla & { afterWhite: number })[] = BLACK_KEYS.map(b => ({
  id: b.label, cents: b.cents, afterWhite: b.afterWhite,
}))

const CENTS_POR_ID: Record<string, number> = {}
for (const t of [...BRANCAS, ...PRETAS]) CENTS_POR_ID[t.id] = t.cents

const centsParaHz = (cents: number) => C4_HZ * Math.pow(2, cents / 1200)

const NOMES_MIDI = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Nome de nota ("F#3", "Bb4") → cents relativos a C4, a mesma referência de NOTE_CENTS.
 * O `midi.ts` devolve nome, não número, e o controlador toca fora das 25 teclas
 * desenhadas — então converte-se em vez de procurar no mapa.
 */
function nomeParaCents(nome: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(nome.trim())
  if (!m) return null
  let idx = NOMES_MIDI.indexOf(m[1])
  if (idx < 0) return null
  if (m[2] === '#') idx += 1
  if (m[2] === 'b') idx -= 1
  return ((parseInt(m[3], 10) + 1) * 12 + idx - 60) * 100
}

/* ── a régua do Paulstretch ──────────────────────────────────────── */

const SR = 44100
const JANELA_SEG = 0.5   // receita `eno`
const FATOR_PEDIDO = 12
const SEG_ALVO = 30      // onde o fator entregue já é quase o pedido
const TRILHA_SEG = 60    // domínio da trilha de tempo
/** Quanto o ESTICADO REAL fica na tela depois que a gravação subiu. */
const ESTICADO_RESTO_MS = 20000

/**
 * Fator que o Paulstretch REALMENTE entrega para uma fonte de `seg` segundos.
 *
 * O algoritmo só emite saída enquanto a janela inteira cabe no que sobrou da fonte: o
 * rabo de meia janela não vira som. Por isso fonte curta rende menos que o pedido —
 * 1 s pedindo 12x entrega 6,6x — e por volta de 30 s a diferença já é ruído.
 * Conferido contra a medição: 1 s → 6,62x · 2 s → 9,31x · 10 s → 11,46x · 60 s → 11,91x.
 */
function fatorEntregue(seg: number): number {
  const n = Math.floor(seg * SR)
  const win = Math.floor((JANELA_SEG * SR) / 4) * 4
  if (n < win) return 0
  const hopIn = win / 4 / FATOR_PEDIDO
  const janelas = Math.round((n - win) / hopIn) + 1
  return (janelas * (win / 4) + win) / n
}

/* ── presets: nomeados pelo destino do pipeline ──────────────────── */

type Onda = 'sine' | 'triangle' | 'sawtooth'

type Voz = {
  onda: Onda
  attack: number
  decay: number
  sustain: number
  release: number
  detune: number   // cents entre os dois osciladores — densidade harmônica
  sub: number      // ganho do oscilador uma oitava abaixo (0..1)
  lfoRate: number  // Hz — lento de propósito
  lfoDepth: number // 0..1
}

type Preset = {
  id: 'eno' | 'mount-shrine' | 'aphex' | 'etereo'
  nome: string
  marca: string   // uma linha, não um parágrafo
  voz: Voz
  fx: Partial<FxParams>
}

const PRESETS: Preset[] = [
  {
    id: 'eno',
    nome: 'ENO',
    marca: 'consonante, filtro respirando',
    voz: { onda: 'sine', attack: 2.6, decay: 1.8, sustain: 0.88, release: 6.5, detune: 6, sub: 0.35, lfoRate: 0.05, lfoDepth: 0.38 },
    // `chorus` e `reverbWet` baixos NÃO são timidez — são o que faz a fonte
    // sobreviver ao portão CORRELACAO. `Tone.Chorus` usa spread de 180°: ele modula
    // L e R em direções opostas, e a 0,35 de wet, com só 18% de centro seco sobrando
    // (reverbWet 0,82), a correlação media −0,18 e a triagem reprovava TODA gravação
    // deste preset com "some em mono". Medido em duas gravações reais.
    // E o reverb aqui é redundante de qualquer jeito: o Paulstretch a 12x É o reverb.
    fx: { drive: 0.03, bite: 2, cutoff: 3200, resonance: 0.9, chorus: 0.12, phaser: 0, delay: 0.12, delayTime: 0.9, delayFb: 0.35, shimmer: 0, reverbWet: 0.45, reverbDecay: 22, crush: 12, denoise: 0 },
  },
  {
    id: 'mount-shrine',
    nome: 'MOUNT SHRINE',
    marca: 'escuro, filtro fechado, delay longo',
    voz: { onda: 'triangle', attack: 1.6, decay: 2.2, sustain: 0.8, release: 5.0, detune: 11, sub: 0.5, lfoRate: 0.11, lfoDepth: 0.5 },
    // mesma razão do `eno`: chorus e phaser são os dois decorrelacionadores da
    // cadeia, e wet alto neles é o caminho curto pro "some em mono".
    fx: { drive: 0.1, bite: 3, cutoff: 1500, resonance: 2.6, chorus: 0.18, phaser: 0.12, delay: 0.38, delayTime: 0.85, delayFb: 0.55, shimmer: 0, reverbWet: 0.45, reverbDecay: 18, crush: 12, denoise: 0 },
  },
  {
    id: 'aphex',
    nome: 'APHEX',
    marca: 'áspero, grão e brilho, mão parada',
    voz: { onda: 'sawtooth', attack: 0.9, decay: 1.4, sustain: 0.72, release: 3.4, detune: 16, sub: 0.28, lfoRate: 0.22, lfoDepth: 0.62 },
    fx: { drive: 0.2, bite: 5, cutoff: 4800, resonance: 4.5, chorus: 0.12, phaser: 0.18, delay: 0.42, delayTime: 0.5, delayFb: 0.55, shimmer: 0.25, reverbWet: 0.4, reverbDecay: 14, crush: 12, denoise: 0 },
  },
  {
    // A voz do MODO ETÉREO, e a única dele. Derivada do `eno`, com tres desvios:
    // mais clara, menos grave, e `shimmer` ligado.
    //
    // `sub` cai de 0,35 pra 0,10 e `cutoff` sobe de 3200 pra 5200 pelo mesmo
    // motivo: 91% da energia entre 80 e 250 Hz foi o que fez a cama3 virar
    // ressaca, e grave forte aqui empurra o resultado pro mount-shrine, que é o
    // oposto do que este modo quer.
    //
    // `detune` cai pra 4 mas NÃO pra 0: o batimento entre os dois osciladores é o
    // que segura `apito_estab` abaixo de 0,90. Synth afinado e imóvel é
    // exatamente o defeito de `analogbrain-1781042551104` (9,6x a 99%).
    //
    // `chorus` 0,10 fica abaixo do teto documentado nos dois presets acima: acima
    // disso a correlação vira negativa e a triagem reprova com "some em mono".
    //
    // MEDIDO, e o palpite estava errado: com `shimmer: 0.28` e `cutoff: 5200` a
    // primeira gravação real saiu com APITO de **101,88x** — 20,4x o limite, apito
    // parado em 3,2 kHz. O risco que eu tinha anotado como hipótese aconteceu na
    // primeira tentativa.
    //
    // Pitch-shift de oitava com realimentação empilha o material em 2x, 4x, 8x da
    // fundamental, e o `cutoff` em 5200 deixava essa pilha inteira passar. O `eno`
    // usa a mesma senóide e não tem esse problema porque corta em 3200.
    //
    // Quatro gravações reais pela própria tela, com o mesmo gesto (dó, sol, dó
    // segurados por ~14 s em DRONE), medidas pelo portão APITO em 3,2 kHz:
    //
    //   shimmer 0,28 · cutoff 5200 · drive 0,02  ->  101,88x   reprova
    //   shimmer 0,10 · cutoff 4600 · drive 0,02  ->   96,50x   reprova
    //   shimmer 0,10 · cutoff 3800 · drive 0     ->  143,05x   reprova
    //   shimmer 0    · cutoff 3800 · drive 0     ->      passa
    //
    // A leitura das três primeiras linhas: mexer no `cutoff` e no `drive` não
    // resolve, e tirar o `drive` PIORA — o portão mede o pico contra a mediana
    // local, então tirar conteúdo de banda larga levanta a razão em vez de baixar.
    //
    // Quem cria o apito é o `shimmer`, e ele não é linear no wet: 0,28 -> 0,10
    // quase não mexeu, e só o ZERO resolve. `Tone.PitchShift` é granular, e o grão
    // periódico de um pitch-shift sobre nota SEGURADA é justamente o parcial
    // parado que o stretch sustenta por minutos.
    //
    // Então o vidro do boot vem do REGISTRO (a oitava acima, em `TRANSPOR`) e não
    // de oitavador. Era o plano B escrito antes de medir; virou o plano A.
    //
    // `drive: 0` e `bite: 1` ficam porque pad claro não tem por que distorcer, e
    // `chorus: 0.05` porque a correlação vinha raspando o zero (-0,03).
    id: 'etereo',
    nome: 'ETÉREO',
    marca: 'claro e flutuante, sem chão',
    voz: { onda: 'sine', attack: 2.2, decay: 2.0, sustain: 0.92, release: 8.0, detune: 4, sub: 0.10, lfoRate: 0.04, lfoDepth: 0.30 },
    fx: { drive: 0, bite: 1, cutoff: 3800, resonance: 0.6, chorus: 0.05, phaser: 0, delay: 0.18, delayTime: 1.2, delayFb: 0.38, shimmer: 0, reverbWet: 0.42, reverbDecay: 26, crush: 12, denoise: 0 },
  },
]

/** O preset do modo etéreo, por id e não por índice: a ordem do array é a ordem
 *  das pílulas, e o modo não pode depender dela. */
const PRESET_ETEREO = PRESETS.find(p => p.id === 'etereo')!

/**
 * Modo da tela. `completo` é a fábrica de sempre, com os três destinos na mão.
 * `etereo` trava a voz e sobe uma oitava — o boot de PS2 mora no médio-agudo, e
 * registro é metade do estilo.
 */
export type ModoTocar = 'completo' | 'etereo'

/** Transposição do modo, em cents. Uma oitava acima no etéreo. */
const TRANSPOR: Record<ModoTocar, number> = { completo: 0, etereo: 1200 }

/* ── sample: a quarta voz ────────────────────────────────────────────
 * Preset é a voz feita de oscilador. Um arquivo carregado é outra voz, e é por
 * isso que ele mora na MESMA linha de pílulas, não numa seção nova.
 *
 * A raiz assumida é C4, então a afinação sai do mesmo `cents` que as teclas já
 * carregam: `playbackRate = 2 ** (cents / 1200)`. O `loop` no buffer inteiro é
 * obrigatório, não enfeite: o uso desta tela é acorde SEGURADO por dezenas de
 * segundos, e sample curto sem loop entrega silêncio depois do primeiro giro.
 *
 * O sample troca só a FONTE. Envelope, cadeia de efeito, LFO, gravação e o
 * medidor PULSO continuam sendo o mesmo caminho de sempre.
 */
type Sample = { nome: string; buffer: AudioBuffer }
type EstadoSample = 'vazio' | 'carregando' | 'pronto' | 'erro'
/** De onde veio o arquivo que está carregando: muda a linha, não o caminho. */
type Origem = 'disco' | 'acervo'

/* ── o acervo: os arquivos que já estão no backend ───────────────────
 * O seletor do sistema serve para o arquivo que está fora daqui. O material da
 * casa já mora em `/api/assets/list`, e caçar ele à mão numa janela do Windows é
 * o caminho mais longo para o mais usado.
 *
 * A lista NÃO vira seção fixa: ela é um painel temporário que a pílula SAMPLE
 * abre e que fecha assim que se escolhe. Em repouso a tela continua com quatro
 * coisas.
 *
 * A rota devolve nome, caminho absoluto, pasta, data e TAMANHO. Não devolve
 * duração, então a lista mostra pasta e tamanho, que é o que existe.
 *
 * O teto de tamanho é defesa, não capricho: `decodeAudioData` monta o áudio
 * inteiro em PCM float na memória da aba, e o acervo tem `.mp3` de 581 MB, que
 * viram vários GB descomprimidos. Acima do teto o arquivo aparece na lista, diz
 * o tamanho e não é clicável, em vez de matar a aba de quem clicou.
 */
type ItemAcervo = { nome: string; caminho: string; pasta: string; bytes: number }
type EstadoAcervo = 'ocioso' | 'carregando' | 'pronto' | 'erro'

const ACERVO_LIMITE_MB = 60
const ACERVO_LIMITE = ACERVO_LIMITE_MB * 1024 * 1024
/** Teto de linhas desenhadas de uma vez. Acima disto quem filtra é a busca. */
const ACERVO_MOSTRA_MAX = 150
const ACERVO_ALTURA = 240

/* ── microfone: a outra fonte de entrada ─────────────────────────────
 * O mic não é uma voz do teclado, é uma ENTRADA, e por isso ele mora na faixa de
 * ação ao lado do GRAVAR, não na linha das pílulas.
 *
 * A regra que manda no roteamento: o microfone NUNCA chega às caixas. A cadeia de
 * efeito sai em dois lugares (`outputGain` vai ao master, `analyser` vai ao destino
 * de captura), e o destino de captura é sink puro, só o `MediaRecorder` lê dele.
 * Então o mic entra DIRETO nesse destino: ele é gravado junto com o synth e não tem
 * caminho de volta ao alto-falante. Com `reverbWet` 0,45 e delay ligados, ligar o
 * mic na cadeia seria microfonia garantida, não hipótese.
 *
 * Os três processadores do navegador entram DESLIGADOS. `echoCancellation`,
 * `noiseSuppression` e `autoGainControl` são feitos para chamada de voz: bombeiam
 * ganho, comem ruído de fundo e cancelam eco. Numa gravação de ambiência ou de
 * instrumento eles destroem exatamente o material que interessa depois de esticar.
 */
type EstadoMic = 'off' | 'pedindo' | 'ligado' | 'erro'

/** Quanto o RMS cru precisa subir para encher a barrinha de nível. */
const MIC_GANHO_MEDIDOR = 6
const MIC_INTERVALO_MS = 120

/* ── voz de áudio (WebAudio cru, ADSR na mão) ────────────────────── */

/** `fontes` é o tipo comum do oscilador e do buffer source: os dois começam,
 *  param e desconectam no mesmo lugar, então trocar a fonte não abre um segundo
 *  caminho de limpeza. Nó de áudio vazado aqui vira zumbido eterno. */
type VozViva = { fontes: AudioScheduledSourceNode[]; gain: GainNode; release: number }

const GANHO_BASE = 0.16 // acorde de 6 notas não pode clipar

/* ── pulso ───────────────────────────────────────────────────────── */

const JANELA_PULSO_MS = 4000
const PULSO_LIMITE = 0.9  // ataques/s — daqui pra cima o material vira ressaca em 12x
const PULSO_TETO = 3.0    // domínio da trilha

/* ── sequenciador LENTO ──────────────────────────────────────────────
 * A unidade do passo é SEGUNDO, nunca bpm, e nunca sub-segundo: o Paulstretch
 * mata o transiente mas não mata a periodicidade de amplitude, então grade
 * rápida vira ressaca em 12x. O que a tela mostra é o passo já ESTICADO — é
 * esse o número que importa (2 s viram 24 s na peça) e ninguém intui.
 * Os passos se sobrepõem: o passo novo entra enquanto o anterior ainda está no
 * release, e é a sobreposição que faz nuvem em vez de sequência picada. */
const SEQ_MIN_PASSOS = 4
const SEQ_MAX_PASSOS = 8
const SEQ_PADRAO_PASSOS = 6
const SEQ_SEG_MIN = 2      // s — abaixo disto o material vira pulso depois de esticar
const SEQ_SEG_MAX = 4
const SEQ_SEG_PADRAO = 2.5
const SEQ_ESTICADO_TETO = SEQ_SEG_MAX * FATOR_PEDIDO  // domínio da régua, em segundos esticados
/** sufixo do id: separa a nota que o sequenciador segura da que a mão segura */
const SUF_SEQ = '·'

/* ── a tecla como controle de verdade ────────────────────────────────
 * As 25 teclas eram `div` com manipulador de ponteiro: `Tab` não chegava nelas e
 * leitor de tela não via que existia um teclado ali. Viraram `button` de verdade,
 * e como o desenho não pode mudar um pixel, todo estilo que o navegador injeta em
 * `button` é zerado na mão logo abaixo.
 */

/** Nome acessível da tecla: a nota, e o atalho de computador quando existe. */
/**
 * O nome da tecla como ela SOA, não como ela está no mapa.
 *
 * O modo etéreo transpõe uma oitava acima em `notaOn`. Sem isto o desenho
 * continuaria dizendo `C3` numa tecla que toca dó4 — a tela mentindo sobre o que
 * o áudio faz, que é o erro que não dá pra deixar passar numa tela cuja função é
 * ensinar a tocar.
 *
 * Transpõe só em múltiplos de oitava, que é o único caso que existe: fora disso
 * o nome da nota mudaria também, e aí o mapa é que estaria errado.
 */
function idTransposto(id: string, cents: number): string {
  if (!cents || cents % 1200 !== 0) return id
  const m = /^([A-G]#?)(-?\d+)$/.exec(id)
  if (!m) return id
  return `${m[1]}${Number(m[2]) + cents / 1200}`
}

const nomeDaTecla = (id: string, atalho?: string) =>
  atalho ? `${id}, atalho ${atalho.toUpperCase()}` : id

/**
 * Zera o que a folha de estilo do navegador injeta em `button`. Sem isto a mesma
 * caixa muda de tamanho (o UA usa `border-box`), ganha fonte de sistema e ganha
 * realce de toque. Tudo aqui é neutro: nenhuma medida, cor ou fonte nova.
 */
const BOTAO_CRU = {
  appearance: 'none' as const,
  margin: 0,
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit' as const,
  boxSizing: 'border-box' as const,
  WebkitTapHighlightColor: 'transparent',
}

/**
 * Foco vindo do teclado, e não o foco que o clique deixa para trás. É o que
 * garante que quem usa mouse continua vendo o desenho de sempre.
 * Ambiente sem suporte ao seletor trata todo foco como foco de teclado, que é o
 * lado seguro do erro: no máximo o anel aparece a mais.
 */
function focoDeTeclado(el: HTMLElement): boolean {
  try { return el.matches(':focus-visible') } catch { return true }
}

export function Tocar({ onGravado, modo = 'completo' }: {
  onGravado: (path: string, durSeg: number) => void
  modo?: ModoTocar
}) {
  /* O modo não muda durante a vida do componente (ele vem da rota), então a voz
     inicial é calculada uma vez e guardada em ref — `garantirMotor` monta a cadeia
     fora do ciclo de render e não pode depender de prop. */
  const presetInicial = modo === 'etereo' ? PRESET_ETEREO : PRESETS[0]
  const presetInicialRef = useRef(presetInicial)
  /** Lido dentro de `notaOn`, que roda fora do render. */
  const transporRef = useRef(TRANSPOR[modo])

  const [presetId, setPresetId] = useState<Preset['id']>(presetInicial.id)

  const [voz, setVoz] = useState<Voz>(presetInicial.voz)
  const [vol, setVol] = useState(FX_DEFAULTS.vol)
  const [latch, setLatch] = useState(false)
  /** Só para o `+`/`−` do disclosure saber para que lado apontar. */
  const [vozAberta, setVozAberta] = useState(false)
  const [tocando, setTocando] = useState<string[]>([])
  const [ataquesPorSeg, setAtaquesPorSeg] = useState(0)
  /** Qual tecla do desenho está com foco VINDO DO TECLADO. Só ela ganha o anel, e é
   *  por isso que o desenho de sempre (mão no mouse) continua idêntico. */
  const [teclaFocada, setTeclaFocada] = useState<string | null>(null)

  /* sample: vazio, carregando, pronto e erro são quatro desenhos da mesma pílula */
  const [sample, setSample] = useState<Sample | null>(null)
  const [estadoSample, setEstadoSample] = useState<EstadoSample>('vazio')
  const [erroSample, setErroSample] = useState('')
  const [origem, setOrigem] = useState<Origem>('disco')

  /* acervo: painel temporário, aberto pela própria pílula SAMPLE */
  const [acervoAberto, setAcervoAberto] = useState(false)
  const [acervo, setAcervo] = useState<ItemAcervo[] | null>(null)
  const [estadoAcervo, setEstadoAcervo] = useState<EstadoAcervo>('ocioso')
  const [erroAcervo, setErroAcervo] = useState('')
  const [busca, setBusca] = useState('')

  /* sequenciador — a grade guarda sempre 8 passos; `nPassos` só decide quantos valem */
  const [passos, setPassos] = useState<string[][]>(() => Array.from({ length: SEQ_MAX_PASSOS }, () => [] as string[]))
  const [nPassos, setNPassos] = useState(SEQ_PADRAO_PASSOS)
  const [passoSeg, setPassoSeg] = useState(SEQ_SEG_PADRAO)
  const [editando, setEditando] = useState(false)
  const [passoSel, setPassoSel] = useState(0)
  const [seqRodando, setSeqRodando] = useState(false)
  const [passoAtual, setPassoAtual] = useState(-1)
  /** O sequenciador é um MODO, não um bloco fixo: fora dele a grade nem existe na tela. */
  const [modoSeq, setModoSeq] = useState(false)

  /* microfone: fonte de ENTRADA, não voz do teclado. Quatro estados desenhados. */
  const [estadoMic, setEstadoMic] = useState<EstadoMic>('off')
  const [erroMic, setErroMic] = useState('')
  const [nivelMic, setNivelMic] = useState(0)

  const [gravando, setGravando] = useState(false)
  const [decorrido, setDecorrido] = useState(0)
  const [estado, setEstado] = useState<'vazio' | 'gravando' | 'subindo' | 'ok' | 'erro'>('vazio')
  const [erroMsg, setErroMsg] = useState('')
  const [ultimo, setUltimo] = useState<{ path: string; dur: number } | null>(null)
  const [midiNome, setMidiNome] = useState<string | null>(null)
  /** ESTICADO REAL só existe durante a gravação e logo depois dela. */
  const [mostraEsticado, setMostraEsticado] = useState(false)

  /* refs — o áudio não pode depender do ciclo de render */
  const chainRef = useRef<FxChain | null>(null)
  const captureRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const entradaRef = useRef<GainNode | null>(null)
  const lfoRef = useRef<ReturnType<typeof createLFO> | null>(null)
  const vozesRef = useRef<Map<string, VozViva>>(new Map())
  const vozParamsRef = useRef<Voz>(presetInicial.voz)
  /** `notaOn` roda fora do ciclo de render, então quem decide oscilador ou buffer
   *  é o ref, escrito no mesmo instante em que o arquivo termina de decodificar. */
  const sampleRef = useRef<Sample | null>(null)
  const arquivoRef = useRef<HTMLInputElement | null>(null)
  /** Cada carga ganha um número. Baixar do acervo demora, e a carga velha que
   *  voltar depois de uma nova escolha precisa ser descartada, senão o sample que
   *  toca não é o que a pílula mostra. */
  const cargaRef = useRef(0)
  const latchRef = useRef(false)
  const teclasFisicasRef = useRef<Set<string>>(new Set())
  const ataquesRef = useRef<number[]>([])
  /** `notaOn` precisa soltar nota no DRONE, e `notaOff` só nasce depois dele. */
  const notaOffRef = useRef<(id: string, forcar?: boolean) => void>(() => {})

  /* sequenciador: o relógio lê refs, senão mexer no slider reiniciaria o passo */
  const passosRef = useRef<string[][]>(passos)
  const nPassosRef = useRef(nPassos)
  const passoSegRef = useRef(passoSeg)
  const editandoRef = useRef(false)
  const passoSelRef = useRef(0)
  const seqVivasRef = useRef<string[]>([])
  const seqTimerRef = useRef<number | null>(null)
  const passoAtualRef = useRef(-1)

  /* microfone: o stream vive fora do render, e é ele que segura o dispositivo preso */
  const micStreamRef = useRef<MediaStream | null>(null)
  const micFonteRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micAnaliseRef = useRef<AnalyserNode | null>(null)
  const micTimerRef = useRef<number | null>(null)
  /** A permissão demora: se desligarem ou trocarem de passo no meio, o stream que
   *  chegar depois precisa ser descartado em vez de ficar com a luz acesa. */
  const micPedidoRef = useRef(false)

  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const t0Ref = useRef(0)
  const timerRef = useRef<number | null>(null)

  /* ── motor: chain + LFO, montados uma vez ─────────────────────── */
  const garantirMotor = useCallback(() => {
    if (chainRef.current) return chainRef.current
    const ctx = getSharedAudioContext()
    const capture = createCaptureDestination()
    const chain = createFxChain({ ...FX_DEFAULTS, ...presetInicialRef.current.fx }, capture)
    const entrada = ctx.createGain()
    entrada.gain.value = 1
    Tone.connect(entrada, chain.input)

    const lfo = createLFO({
      lfoRate: presetInicialRef.current.voz.lfoRate,
      lfoDepth: presetInicialRef.current.voz.lfoDepth,
      lfoWave: 'sine',
      lfoTarget: 'cutoff',
    })
    connectLFO(lfo, chain as never, 'cutoff')

    chainRef.current = chain
    captureRef.current = capture
    entradaRef.current = entrada
    lfoRef.current = lfo
    return chain
  }, [])

  /* ── note on / note off ───────────────────────────────────────── */

  const notaOn = useCallback((id: string, cents: number, velocidade = 0.85) => {
    const chain = garantirMotor()
    const ctx = getSharedAudioContext()
    const entrada = entradaRef.current
    if (!chain || !entrada) return

    const vivas = vozesRef.current
    if (vivas.has(id)) {
      // Em DRONE a tecla é um INTERRUPTOR: apertar de novo desliga aquela nota.
      // Sem isto a nota subia e não descia — a única saída era o SILENCIAR, que
      // derruba o acorde inteiro, então não dava pra trocar uma nota do acorde
      // sem remontar tudo.
      if (latchRef.current) notaOffRef.current(id, true)
      return // fora do latch, tecla segurada não redispara
    }

    const v = vozParamsRef.current
    const agora = ctx.currentTime
    /* A transposição do modo entra AQUI e não no mapa das teclas: o desenho do
       teclado, os atalhos e o MIDI continuam falando o mesmo nome de nota, e só a
       frequência que sai muda. */
    const centsReais = cents + transporRef.current
    const hz = centsParaHz(centsReais)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, agora)
    const pico = GANHO_BASE * velocidade
    // attack e decay longos: envelope sem borda é o que sobrevive ao stretch
    gain.gain.linearRampToValueAtTime(pico, agora + Math.max(0.01, v.attack))
    gain.gain.linearRampToValueAtTime(
      pico * v.sustain,
      agora + Math.max(0.01, v.attack) + Math.max(0.01, v.decay),
    )
    gain.connect(entrada)

    const fontes: AudioScheduledSourceNode[] = []
    const amostra = sampleRef.current
    if (amostra) {
      // Cada nota tem o SEU buffer source: a polifonia continua real, e o release
      // de cada uma morre no seu próprio nó. `loop` no buffer inteiro para o
      // acorde segurado não virar silêncio no meio da gravação.
      const src = ctx.createBufferSource()
      src.buffer = amostra.buffer
      src.loop = true
      src.playbackRate.setValueAtTime(Math.pow(2, centsReais / 1200), agora)
      src.connect(gain)
      src.start(agora)
      fontes.push(src)
    } else {
      const fazOsc = (freq: number, detune: number, ganho: number) => {
        const o = ctx.createOscillator()
        o.type = v.onda
        o.frequency.setValueAtTime(freq, agora)
        o.detune.setValueAtTime(detune, agora)
        const g = ctx.createGain()
        g.gain.value = ganho
        o.connect(g)
        g.connect(gain)
        o.start(agora)
        fontes.push(o)
      }
      // dois osciladores desafinados + sub: densidade harmônica alta
      fazOsc(hz, -v.detune / 2, 0.5)
      fazOsc(hz, +v.detune / 2, 0.5)
      if (v.sub > 0.01) fazOsc(hz / 2, 0, v.sub * 0.6)
    }

    vivas.set(id, { fontes, gain, release: v.release })
    setTocando(Array.from(vivas.keys()))

    const t = performance.now()
    ataquesRef.current = [...ataquesRef.current.filter(x => t - x < JANELA_PULSO_MS), t]
  }, [garantirMotor])

  const notaOff = useCallback((id: string, forcar = false) => {
    if (latchRef.current && !forcar) return // latch: a nota fica de pé sozinha
    const vivas = vozesRef.current
    const viva = vivas.get(id)
    if (!viva) return
    vivas.delete(id)
    const ctx = getSharedAudioContext()
    const agora = ctx.currentTime
    const rel = Math.max(0.05, viva.release)
    try {
      viva.gain.gain.cancelScheduledValues(agora)
      viva.gain.gain.setValueAtTime(Math.max(0.0001, viva.gain.gain.value), agora)
      viva.gain.gain.exponentialRampToValueAtTime(0.0001, agora + rel)
    } catch { /* noop */ }
    for (const o of viva.fontes) { try { o.stop(agora + rel + 0.1) } catch { /* noop */ } }
    window.setTimeout(() => {
      for (const o of viva.fontes) { try { o.disconnect() } catch { /* noop */ } }
      try { viva.gain.disconnect() } catch { /* noop */ }
    }, (rel + 0.3) * 1000)
    setTocando(Array.from(vivas.keys()))
  }, [])

  /**
   * Espelho render → ref, num efeito SEM lista de dependências: roda depois de todo
   * render e antes de qualquer evento ou batida de timer, que é quem lê estes refs.
   * Escrever isto solto no corpo do componente daria o mesmo resultado hoje e
   * mentiria amanhã (render descartado deixaria o ref adiantado).
   * Fica ANTES do efeito do sequenciador de propósito: o relógio lê estes valores
   * já no primeiro disparo.
   */
  useEffect(() => {
    vozParamsRef.current = voz
    latchRef.current = latch
    passosRef.current = passos
    nPassosRef.current = nPassos
    passoSegRef.current = passoSeg
    editandoRef.current = editando
    passoSelRef.current = passoSel
    notaOffRef.current = notaOff
  })

  const silenciarTudo = useCallback(() => {
    for (const id of Array.from(vozesRef.current.keys())) notaOff(id, true)
    teclasFisicasRef.current.clear()
    seqVivasRef.current = []
  }, [notaOff])

  /* ── carregar sample ──────────────────────────────────────────────
   * Tudo local: `File` vira `arrayBuffer` e `decodeAudioData` devolve o buffer.
   * Nada de `/api/upload` aqui, que é caminho só da gravação.
   * Silenciar antes de trocar não é higiene de UI, é o que solta o buffer velho:
   * nota viva segura o `AudioBuffer` anterior de pé enquanto durar o release. */
  const carregarSample = useCallback(async (arquivo: File) => {
    const carga = ++cargaRef.current
    setOrigem('disco')
    setEstadoSample('carregando')
    setErroSample('')
    silenciarTudo()
    sampleRef.current = null
    try {
      const dados = await arquivo.arrayBuffer()
      const buffer = await getSharedAudioContext().decodeAudioData(dados)
      if (cargaRef.current !== carga) return
      const novo = { nome: arquivo.name, buffer }
      sampleRef.current = novo
      setSample(novo)
      setEstadoSample('pronto')
    } catch {
      if (cargaRef.current !== carga) return
      // Erro é estado desenhado, não beco: a voz volta pro oscilador e a linha
      // das pílulas diz o que houve.
      setSample(null)
      setEstadoSample('erro')
      setErroSample('arquivo de áudio não reconhecido')
    }
  }, [silenciarTudo])

  const descarregarSample = useCallback(() => {
    silenciarTudo()
    sampleRef.current = null
    setSample(null)
    setEstadoSample('vazio')
    setErroSample('')
  }, [silenciarTudo])

  /* ── acervo: listar e escolher ────────────────────────────────────
   * A lista é lida uma vez e fica em memória. `folder` vem com barra normal do
   * backend, `path` vem absoluto do Windows, e é ele que `/api/preview` espera
   * de volta. */
  const buscarAcervo = useCallback(async () => {
    setEstadoAcervo('carregando')
    setErroAcervo('')
    try {
      const res = await fetch(resolveUrl('/api/assets/list'))
      if (!res.ok) throw new Error(`o acervo respondeu ${res.status}`)
      const json: unknown = await res.json()
      if (!Array.isArray(json)) throw new Error('a lista veio fora do formato')
      const itens: ItemAcervo[] = []
      for (const bruto of json) {
        const o = bruto as Record<string, unknown>
        const caminho = typeof o.path === 'string' ? o.path : ''
        const nome = typeof o.name === 'string' ? o.name : ''
        if (!caminho || !nome) continue
        itens.push({
          nome,
          caminho,
          pasta: typeof o.folder === 'string' ? o.folder : '',
          bytes: typeof o.size === 'number' ? o.size : 0,
        })
      }
      setAcervo(itens)
      setEstadoAcervo('pronto')
    } catch (e) {
      setAcervo(null)
      setEstadoAcervo('erro')
      setErroAcervo(e instanceof Error && e.message ? e.message : 'a lista do acervo não veio')
    }
  }, [])

  /**
   * Escolher um item do acervo. Depois do `arrayBuffer` é o MESMO caminho do
   * arquivo local, e por isso o resultado é o mesmo: pílula com o nome, linha com
   * a duração, `×` de volta ao oscilador.
   *
   * O painel fecha ANTES de baixar: o download de dezenas de MB não pode segurar
   * a lista aberta na frente do teclado, e quem informa o andamento é a pílula.
   */
  const carregarDoAcervo = useCallback(async (item: ItemAcervo) => {
    if (item.bytes > ACERVO_LIMITE) return
    const carga = ++cargaRef.current
    setAcervoAberto(false)
    setOrigem('acervo')
    setEstadoSample('carregando')
    setErroSample('')
    silenciarTudo()
    sampleRef.current = null
    try {
      const res = await fetch(audioSrc(item.caminho))
      if (!res.ok) throw new Error(`o acervo respondeu ${res.status}`)
      const dados = await res.arrayBuffer()
      const buffer = await getSharedAudioContext().decodeAudioData(dados)
      if (cargaRef.current !== carga) return
      const novo = { nome: item.nome, buffer }
      sampleRef.current = novo
      setSample(novo)
      setEstadoSample('pronto')
    } catch (e) {
      if (cargaRef.current !== carga) return
      setSample(null)
      setEstadoSample('erro')
      setErroSample(e instanceof Error && e.message ? e.message : 'o navegador não decodificou este arquivo')
    }
  }, [silenciarTudo])

  /** Abrir o painel é o gesto da pílula. A lista só é buscada na primeira vez. */
  const alternarAcervo = useCallback(() => {
    setAcervoAberto(aberto => {
      if (aberto) return false
      if (estadoAcervo === 'ocioso' || estadoAcervo === 'erro') void buscarAcervo()
      return true
    })
  }, [estadoAcervo, buscarAcervo])

  /* Sair sem escolher nada também é ESC, que é o gesto de quem já está no campo
     de busca e não quer tirar a mão do teclado. */
  useEffect(() => {
    if (!acervoAberto) return
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') setAcervoAberto(false) }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [acervoAberto])

  /* ── microfone ────────────────────────────────────────────────────
   * Parar as tracks não é higiene, é o que apaga a luz do microfone e devolve o
   * dispositivo ao sistema. `disconnect` sozinho deixa o navegador segurando ele. */
  const pararMic = useCallback(() => {
    micPedidoRef.current = false
    if (micTimerRef.current) { window.clearInterval(micTimerRef.current); micTimerRef.current = null }
    try { micFonteRef.current?.disconnect() } catch { /* noop */ }
    try { micAnaliseRef.current?.disconnect() } catch { /* noop */ }
    micFonteRef.current = null
    micAnaliseRef.current = null
    const stream = micStreamRef.current
    micStreamRef.current = null
    if (stream) for (const t of stream.getTracks()) { try { t.stop() } catch { /* noop */ } }
    setNivelMic(0)
  }, [])

  const desligarMic = useCallback(() => {
    pararMic()
    setEstadoMic('off')
    setErroMic('')
  }, [pararMic])

  const ligarMic = useCallback(async () => {
    setErroMic('')
    setEstadoMic('pedindo')
    micPedidoRef.current = true
    garantirMotor()
    const capture = captureRef.current
    if (!capture) {
      micPedidoRef.current = false
      setEstadoMic('erro'); setErroMic('sem destino de captura')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      if (!micPedidoRef.current) {
        for (const t of stream.getTracks()) { try { t.stop() } catch { /* noop */ } }
        return
      }
      const ctx = getSharedAudioContext()
      const fonte = ctx.createMediaStreamSource(stream)
      const analise = ctx.createAnalyser()
      analise.fftSize = 1024
      // As duas únicas saídas do mic: o medidor de nível e o destino de captura.
      // Nenhuma delas chega ao master, e é isso que impede a realimentação.
      fonte.connect(analise)
      fonte.connect(capture)
      micStreamRef.current = stream
      micFonteRef.current = fonte
      micAnaliseRef.current = analise
      const dados = new Float32Array(analise.fftSize)
      micTimerRef.current = window.setInterval(() => {
        const a = micAnaliseRef.current
        if (!a) return
        a.getFloatTimeDomainData(dados)
        let soma = 0
        for (const x of dados) soma += x * x
        const n = Math.min(1, Math.sqrt(soma / dados.length) * MIC_GANHO_MEDIDOR)
        setNivelMic(prev => (Math.abs(prev - n) < 0.02 ? prev : n))
      }, MIC_INTERVALO_MS)
      setEstadoMic('ligado')
    } catch (e) {
      micPedidoRef.current = false
      setEstadoMic('erro')
      const nome = e instanceof Error ? e.name : ''
      setErroMic(
        nome === 'NotAllowedError' ? 'permissão negada no navegador'
          : nome === 'NotFoundError' ? 'nenhuma entrada de áudio encontrada'
            : e instanceof Error && e.message ? e.message : 'o navegador não abriu o microfone',
      )
    }
  }, [garantirMotor])

  /* ── sequenciador ─────────────────────────────────────────────── */

  /**
   * Solta o que o sequenciador segurava. `notaOff` só ABRE o release (5–6 s), não
   * corta: por isso o passo anterior continua soando por cima do que entra — é daí
   * que vem a nuvem. `forcar` porque no DRONE o notaOff normal não desce nada.
   */
  const soltarSeq = useCallback(() => {
    for (const id of seqVivasRef.current) notaOffRef.current(id, true)
    seqVivasRef.current = []
  }, [])

  /**
   * Entrada humana (teclado da tela, teclado físico, MIDI). Em modo de edição a
   * mesma tecla que soa também PREENCHE o passo selecionado — tocar de novo a
   * mesma nota tira ela do passo. O sequenciador chama `notaOn` direto, nunca isto.
   */
  const tocarTecla = useCallback((id: string, cents: number, velocidade = 0.85) => {
    if (editandoRef.current) {
      const alvo = passoSelRef.current
      setPassos(prev => prev.map((p, k) => (
        k !== alvo ? p : p.includes(id) ? p.filter(x => x !== id) : [...p, id]
      )))
    }
    notaOn(id, cents, velocidade)
  }, [notaOn])

  /**
   * Acionamento da tecla DESENHADA por quem navega de Tab.
   *
   * Ponteiro e teclado não podem se somar. A tecla soa no `mouseDown`/`touchStart` e,
   * com o foco nela, no `keydown` de Enter ou Espaço. Cancelar esse `keydown` é o que
   * impede o navegador de sintetizar o clique do botão focado, e é por isso que
   * nenhuma tecla tem `onClick`: com ele um clique de mouse dispararia a nota duas
   * vezes e no DRONE ligaria e desligaria na mesma ação, sem efeito nenhum na saída.
   * Enter e Espaço não são atalho de nota, então o listener global de `window` não
   * responde a eles e não existe caminho de disparo duplo por ali.
   * `e.repeat` sai fora porque segurar a tecla repete o evento no navegador, e nota
   * segurada não redispara.
   */
  const teclaAcionaDown = useCallback((e: EventoTecla<HTMLElement>, id: string, cents: number) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    if (e.repeat) return
    tocarTecla(id, cents)
  }, [tocarTecla])

  /** O soltar. No DRONE o `notaOff` normal não desce nada, igual ao mouse: quem
   *  desliga a nota latcheada é o segundo `notaOn`, e o interruptor segue de pé. */
  const teclaAcionaUp = useCallback((e: EventoTecla<HTMLElement>, id: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    notaOff(id)
  }, [notaOff])

  const limparPasso = useCallback((i: number) => {
    setPassos(prev => prev.map((p, k) => (k === i ? [] : p)))
  }, [])

  /**
   * O relógio. `setTimeout` que se reagenda em vez de `setInterval`: assim mudar o
   * passo no slider muda o próximo intervalo sem reiniciar a sequência nem
   * redisparar nota. Os ataques entram no `ataquesRef` pelo próprio `notaOn`, então
   * o medidor PULSO conta a sequência ao vivo, sem contagem paralela.
   */
  useEffect(() => {
    if (!seqRodando) return
    let vivo = true
    const disparar = () => {
      const n = Math.max(1, nPassosRef.current)
      passoAtualRef.current = (passoAtualRef.current + 1) % n
      const i = passoAtualRef.current
      soltarSeq()
      for (const nota of passosRef.current[i] ?? []) {
        const cents = CENTS_POR_ID[nota] ?? nomeParaCents(nota) ?? 0
        const id = nota + SUF_SEQ
        notaOn(id, cents)
        seqVivasRef.current.push(id)
      }
      setPassoAtual(i)
    }
    const agendar = () => {
      seqTimerRef.current = window.setTimeout(() => {
        if (!vivo) return
        disparar()
        agendar()
      }, Math.max(SEQ_SEG_MIN, passoSegRef.current) * 1000)
    }
    disparar()
    agendar()
    return () => {
      vivo = false
      if (seqTimerRef.current) { window.clearTimeout(seqTimerRef.current); seqTimerRef.current = null }
      soltarSeq()
      setPassoAtual(-1)
    }
  }, [seqRodando, notaOn, soltarSeq])

  /* medidor de pulso ao vivo — o número só muda quando muda de verdade */
  useEffect(() => {
    const t = window.setInterval(() => {
      const agora = performance.now()
      ataquesRef.current = ataquesRef.current.filter(x => agora - x < JANELA_PULSO_MS)
      const taxa = ataquesRef.current.length / (JANELA_PULSO_MS / 1000)
      setAtaquesPorSeg(prev => (Math.abs(prev - taxa) < 0.01 ? prev : taxa))
    }, 400)
    return () => window.clearInterval(t)
  }, [])

  /**
   * A janela do ESTICADO REAL fecha sozinha.
   *
   * Quem ABRE é o clique em GRAVAR, no próprio manipulador, e não um efeito olhando
   * o estado: efeito que chama `setState` no corpo é render em cascata. Aqui só mora
   * o fim da janela, e ele acontece dentro do temporizador. Enquanto sobe arquivo ou
   * há erro na mesa, a régua fica: é ali que a pessoa lê que 12x pedidos voltaram
   * como 9x numa fonte curta.
   */
  useEffect(() => {
    if (estado !== 'ok') return
    const t = window.setTimeout(() => setMostraEsticado(false), ESTICADO_RESTO_MS)
    return () => window.clearTimeout(t)
  }, [estado])

  /* ── preset troca voz + fx + lfo ──────────────────────────────────
   * Mora no clique, não num efeito: o preset só muda por este botão, e trocar de
   * voz é o EVENTO, não uma sincronia a perseguir depois do render. */
  const trocarPreset = useCallback((p: Preset) => {
    setPresetId(p.id)
    setSeqRodando(false)   // troca de preset para a sequência: o timer não sobrevive à voz
    setVoz(p.voz)
    vozParamsRef.current = p.voz
    if (chainRef.current) updateFxChain(chainRef.current, { ...p.fx, vol }, 0.4)
    if (lfoRef.current) updateLFO(lfoRef.current, { lfoRate: p.voz.lfoRate, lfoDepth: p.voz.lfoDepth })
  }, [vol])

  useEffect(() => {
    if (chainRef.current) updateFxChain(chainRef.current, { vol }, 0.1)
  }, [vol])

  useEffect(() => {
    if (lfoRef.current) updateLFO(lfoRef.current, { lfoRate: voz.lfoRate, lfoDepth: voz.lfoDepth })
  }, [voz.lfoRate, voz.lfoDepth])

  /* ── teclado do computador ────────────────────────────────────── */
  useEffect(() => {
    const digitando = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || digitando(e)) return
      const k = e.key.toLowerCase()
      const nota = TECLA_POR_ATALHO[k]
      if (!nota) return
      e.preventDefault()
      if (teclasFisicasRef.current.has(k)) return
      teclasFisicasRef.current.add(k)
      tocarTecla(nota, CENTS_POR_ID[nota] ?? 0)
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      const nota = TECLA_POR_ATALHO[k]
      if (!nota) return
      teclasFisicasRef.current.delete(k)
      notaOff(nota)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [tocarTecla, notaOff])

  /* ── MIDI (opcional — sem acesso, segue sem erro) ─────────────── */
  useEffect(() => {
    let vivo = true
    let listener: ReturnType<typeof createMIDIListener> | null = null
    void (async () => {
      const acesso = await requestMIDIAccess()
      if (!vivo || !acesso) return
      const entradas = listMIDIInputs(acesso)
      if (entradas.length === 0) return
      listener = createMIDIListener({
        noteOn: (nome, vel) => {
          const c = nomeParaCents(nome)
          if (c === null) return
          tocarTecla(nome, c, Math.max(0.25, vel))
        },
        noteOff: nome => notaOff(nome),
      })
      listener.start(entradas[0])
      setMidiNome(entradas[0].name ?? 'MIDI')
    })()
    return () => { vivo = false; try { listener?.stop() } catch { /* noop */ } }
  }, [tocarTecla, notaOff])

  /* ── limpeza total ────────────────────────────────────────────── */
  useEffect(() => () => {
    // Sai da tela ou troca de passo: as tracks do mic morrem aqui, senão a luz do
    // microfone fica acesa e o dispositivo continua preso ao navegador.
    pararMic()
    if (timerRef.current) window.clearInterval(timerRef.current)
    if (seqTimerRef.current) { window.clearTimeout(seqTimerRef.current); seqTimerRef.current = null }
    try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop() } catch { /* noop */ }
    for (const viva of vozesRef.current.values()) {
      for (const o of viva.fontes) {
        try { o.stop() } catch { /* noop */ }
        try { o.disconnect() } catch { /* noop */ }
      }
      try { viva.gain.disconnect() } catch { /* noop */ }
    }
    vozesRef.current.clear()
    if (lfoRef.current) disposeLFO(lfoRef.current)
    try { entradaRef.current?.disconnect() } catch { /* noop */ }
    if (chainRef.current) disposeFxChain(chainRef.current)
    chainRef.current = null; entradaRef.current = null
    captureRef.current = null; lfoRef.current = null
  }, [pararMic])

  /* ── gravação: caminho comprovado do SynthPanel ───────────────── */

  function comecarGravacao() {
    // a régua entra em cena junto com o primeiro clique, inclusive se der erro aqui
    setMostraEsticado(true)
    garantirMotor()
    const capture = captureRef.current
    if (!capture) { setEstado('erro'); setErroMsg('sem destino de captura'); return }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    chunksRef.current = []
    const rec = new MediaRecorder(capture.stream, { mimeType: mime })
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = async () => {
      const dur = Math.max(0, (Date.now() - t0Ref.current) / 1000)
      const blob = new Blob(chunksRef.current, { type: mime })
      if (blob.size === 0) { setEstado('erro'); setErroMsg('gravação vazia'); return }
      setEstado('subindo')
      try {
        const fd = new FormData()
        fd.append('file', blob, `synth-rec-${Date.now()}.webm`)
        const res = await fetch(resolveUrl('/api/upload'), { method: 'POST', body: fd })
        if (!res.ok) { setEstado('erro'); setErroMsg(`upload falhou (${res.status})`); return }
        const json = await res.json()
        const caminho: string | undefined = json?.path
        if (!caminho) { setEstado('erro'); setErroMsg('resposta sem path'); return }
        setUltimo({ path: caminho, dur })
        setEstado('ok')
        onGravado(caminho, dur)
      } catch (e) {
        setEstado('erro')
        setErroMsg(e instanceof Error ? e.message : 'falha no upload')
      }
    }
    rec.start(250)
    recRef.current = rec
    t0Ref.current = Date.now()
    setDecorrido(0); setErroMsg(''); setEstado('gravando'); setGravando(true)
    timerRef.current = window.setInterval(() => setDecorrido((Date.now() - t0Ref.current) / 1000), 200)
  }

  function pararGravacao() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') { try { rec.stop() } catch { /* noop */ } }
    recRef.current = null
    setGravando(false)
  }

  /* ── leituras ─────────────────────────────────────────────────── */

  const segLidos = gravando ? decorrido : (ultimo?.dur ?? 0)
  const fator = fatorEntregue(segLidos)
  const alvoBatido = segLidos >= SEG_ALVO
  const estourouTrilha = segLidos > TRILHA_SEG
  const pulsoAlto = ataquesPorSeg > PULSO_LIMITE

  /* a tecla acende venha a nota da mão ou do sequenciador */
  const acesas = useMemo(
    () => new Set(tocando.map(id => (id.endsWith(SUF_SEQ) ? id.slice(0, -1) : id))),
    [tocando],
  )
  const notasNaGrade = passos.slice(0, nPassos).reduce((a, p) => a + p.length, 0)
  const gradeVazia = notasNaGrade === 0
  const passoEsticado = passoSeg * FATOR_PEDIDO
  const cicloSeg = nPassos * passoSeg

  /* O teclado é o herói: ele toma a largura inteira e cresce em altura com o espaço
     que os oito blocos empilhados devolveram. Por isso a posição horizontal virou
     porcentagem — com `54px` fixos as 15 brancas estouravam o container em 820px. */
  const ALT_BRANCA = 216, LARG_PRETA = 38, ALT_PRETA = 134
  const PASSO_BRANCA = 100 / BRANCAS.length

  const preset = PRESETS.find(p => p.id === presetId) ?? presetInicial
  /* Trocar de preset com sample carregado NÃO descarrega o sample: o preset traz
     envelope, filtro e fx, e isso continua valendo em cima de qualquer fonte. O
     único campo do preset que o sample aposenta é a ONDA, que não tem oscilador
     pra reger. */
  const temSample = estadoSample === 'pronto' && sample !== null
  /* PULSO é feedback de execução: existe com nota soando, e a janela de 4 s do
     próprio medidor segura ele mais um pouco depois da última. Não pisca por nota. */
  const mostraPulso = acesas.size > 0 || ataquesPorSeg > 0

  /* A busca filtra por nome E por pasta, porque o acervo está organizado em pasta
     e é assim que o dono lembra do material. */
  const filtrados = useMemo(() => {
    if (!acervo) return []
    const q = busca.trim().toLowerCase()
    if (!q) return acervo
    return acervo.filter(i => i.nome.toLowerCase().includes(q) || i.pasta.toLowerCase().includes(q))
  }, [acervo, busca])
  const cortados = Math.max(0, filtrados.length - ACERVO_MOSTRA_MAX)

  return (
    <section style={{
      background: FUNDO,
      border: LINHA,
      borderRadius: 8, padding: `${ESP.md}px ${ESP.md}px ${ESP.lg}px`,
      font: `12px/1.5 ${MONO}`, color: t70,
      fontVariantNumeric: 'tabular-nums',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: ESP.sm, flexWrap: 'wrap', marginBottom: ESP.md }}>
        {modo === 'completo' && (
          <h2 style={{ margin: 0, font: `700 14px/1.2 ${MONO}`, letterSpacing: '0.14em', color: t100 }}>TOCAR</h2>
        )}
        <span style={{ color: t45 }}>
          {modo === 'etereo'
            ? 'acordes maiores, segurados. sem martelar.'
            : 'segure o acorde: a fonte sai da sua mão'}
        </span>
        {midiNome && <span style={{ marginLeft: 'auto', color: t45 }}>MIDI: {midiNome}</span>}
      </div>

      {/* ── presets: três pílulas e uma linha ──────────────────────
          Cada preset trazia envelope desenhado, marca e a linha de números, e três
          deles somavam nove elementos antes do teclado aparecer. O envelope não
          escolhe nada aqui (ele mora no `ajustar`, onde se mexe nele) e os números
          são o mesmo dado dito duas vezes. Sobrou o nome, o estado de escolhido, e
          UMA linha de marca — a do escolhido, que é a única que descreve o que se
          vai ouvir agora. */}
      {modo === 'completo' && <>
      <div style={{ display: 'flex', gap: ESP.xs, flexWrap: 'wrap', marginBottom: ESP.xs }}>
        {/* No modo etéreo a voz é uma só, então não há pílula: escolha sem
            consequência é custo de leitura, não controle. A pílula SAMPLE fica —
            carregar um arquivo continua sendo outra voz, e essa escolha é real. */}
        {modo === 'completo' && PRESETS.map(p => {
          const on = p.id === presetId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => trocarPreset(p)}
              aria-pressed={on}
              style={{
                padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                font: `700 10px ${MONO}`, letterSpacing: '0.14em',
                background: on ? ACESO_FRACO : 'transparent',
                border: `1px solid ${on ? ACESO : t12}`,
                color: on ? ACESO : t45,
                transition: TRANSICAO,
              }}>
              {p.nome}
            </button>
          )
        })}

        {/* A quarta pílula. Preset é a voz feita de oscilador, sample é a voz
            feita de arquivo, e as duas escolhem a mesma coisa: por isso ele entra
            na linha que já existe em vez de abrir uma seção.
            Vazia ela abre o seletor do sistema, carregada ela mostra o nome e
            guarda o × que devolve a voz ao oscilador. Carregando ela apaga, e o
            erro é dito na linha de baixo, que é onde a marca do preset já mora. */}
        <div style={{
          display: 'flex', alignItems: 'stretch', borderRadius: 999,
          background: temSample ? ACESO_FRACO : 'transparent',
          border: `1px solid ${temSample ? ACESO : estadoSample === 'erro' ? t45 : t12}`,
          opacity: estadoSample === 'carregando' ? 0.45 : 1,
          transition: TRANSICAO,
        }}>
          <button
            type="button"
            onClick={alternarAcervo}
            aria-pressed={temSample}
            aria-expanded={acervoAberto}
            disabled={estadoSample === 'carregando'}
            style={{
              display: 'flex', alignItems: 'center', gap: ESP.xs, maxWidth: 230,
              padding: temSample ? '7px 8px 7px 14px' : '7px 14px',
              borderRadius: 999, background: 'transparent', border: 'none',
              cursor: estadoSample === 'carregando' ? 'progress' : 'pointer',
              font: `700 10px ${MONO}`, letterSpacing: '0.14em',
              color: temSample ? ACESO : t45,
            }}>
            SAMPLE
            {sample && (
              <span style={{
                font: `10px ${MONO}`, letterSpacing: 0, color: t70,
                maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{sample.nome}</span>
            )}
          </button>
          {temSample && (
            <button
              type="button"
              onClick={descarregarSample}
              aria-label="tirar o sample"
              style={{
                padding: '0 12px 0 4px', lineHeight: 1, cursor: 'pointer',
                background: 'transparent', border: 'none', color: t45, font: `12px ${MONO}`,
              }}>×</button>
          )}
        </div>
        <input
          ref={arquivoRef}
          type="file"
          accept="audio/*"
          aria-label="carregar sample"
          onChange={e => {
            const f = e.target.files?.[0]
            e.target.value = ''  // escolher o MESMO arquivo de novo precisa disparar
            if (f) void carregarSample(f)
          }}
          style={{ display: 'none' }}
        />
      </div>
      {/* Uma linha só, e ela diz a voz que está no ar: a marca do preset quando a
          fonte é oscilador, a duração do sample quando a fonte é arquivo. */}
      <div style={{ font: `10px ${MONO}`, color: estadoSample === 'erro' ? t70 : t45, marginBottom: ESP.md }}>
        {estadoSample === 'carregando'
          ? (origem === 'acervo' ? 'baixando e decodificando o arquivo do acervo' : 'lendo o arquivo')
          : estadoSample === 'erro' ? erroSample
            : sample ? `sample de ${sample.buffer.duration.toFixed(1).replace('.', ',')} s em loop, raiz C4`
              : preset.marca}
      </div>
      </>}

      {/* ── acervo: painel temporário, nunca quinta seção ───────────
          Ele nasce do clique na pílula, mora logo abaixo dela, e morre na escolha
          ou no fechar. A tela em repouso continua com as quatro coisas de sempre.
          A lista tem altura contida de propósito: centenas de arquivos empurrando
          o teclado para fora da dobra é o oposto do que este painel resolve. */}
      {acervoAberto && (
        <div style={{
          border: LINHA, borderRadius: 6, background: FUNDO_ALTO,
          padding: ESP.sm, marginBottom: ESP.md,
          display: 'flex', flexDirection: 'column', gap: ESP.xs,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: ESP.xs }}>
            {/* `autoFocus`: quem abriu o painel abriu para procurar, e o teclado
                físico não toca nota enquanto o foco está num campo de texto. */}
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="filtrar por nome ou pasta"
              aria-label="filtrar o acervo"
              style={{
                flex: '1 1 140px', minWidth: 0,
                padding: '7px 9px', borderRadius: 4,
                background: 'transparent', border: LINHA, outline: 'none',
                font: `11px ${MONO}`, color: t100,
              }}
            />
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              style={{
                padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                font: `700 10px ${MONO}`, letterSpacing: '0.14em',
                background: 'transparent', border: `1px solid ${t12}`, color: t45,
              }}>
              DO DISCO
            </button>
            <button
              type="button"
              onClick={() => setAcervoAberto(false)}
              aria-label="fechar sem escolher"
              style={{
                padding: '7px 11px', borderRadius: 4, lineHeight: 1, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${t12}`, color: t45,
                font: `12px ${MONO}`,
              }}>×</button>
          </div>

          {/* A mesma caixa desenha os cinco estados da lista: lendo, sem resposta,
              acervo vazio, busca sem resultado, e a lista de verdade. */}
          <div style={{
            height: ACERVO_ALTURA, overflowY: 'auto', overflowX: 'hidden',
            border: LINHA, borderRadius: 4,
          }}>
            {estadoAcervo === 'carregando' ? (
              <div style={{ padding: ESP.sm, font: `11px ${MONO}`, color: t45 }}>lendo o acervo</div>
            ) : estadoAcervo === 'erro' ? (
              <div style={{ padding: ESP.sm, display: 'flex', flexDirection: 'column', gap: ESP.xs, alignItems: 'flex-start' }}>
                <span style={{ font: `11px ${MONO}`, color: t70 }}>{erroAcervo}</span>
                <button
                  type="button"
                  onClick={() => void buscarAcervo()}
                  style={{
                    padding: '6px 11px', borderRadius: 4, cursor: 'pointer',
                    font: `600 10px ${MONO}`, letterSpacing: '0.12em',
                    background: 'transparent', border: `1px solid ${t25}`, color: t70,
                  }}>
                  TENTAR DE NOVO
                </button>
              </div>
            ) : filtrados.length === 0 ? (
              <div style={{ padding: ESP.sm, font: `11px ${MONO}`, color: t45 }}>
                {acervo && acervo.length === 0 ? 'o acervo não tem áudio ainda' : 'nada com esse nome'}
              </div>
            ) : (
              filtrados.slice(0, ACERVO_MOSTRA_MAX).map(item => {
                const grande = item.bytes > ACERVO_LIMITE
                return (
                  <button
                    key={item.caminho}
                    type="button"
                    onClick={() => void carregarDoAcervo(item)}
                    disabled={grande}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: ESP.sm,
                      width: '100%', textAlign: 'left', padding: '7px 9px',
                      background: 'transparent', border: 'none',
                      borderBottom: LINHA, cursor: grande ? 'not-allowed' : 'pointer',
                      opacity: grande ? 0.45 : 1,
                      font: `11px ${MONO}`, color: t70,
                    }}>
                    <span style={{
                      flex: '1 1 auto', minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: grande ? t45 : t100,
                    }}>{item.nome}</span>
                    <span style={{
                      flex: '0 1 auto', maxWidth: '45%',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      font: `10px ${MONO}`, color: t45,
                    }}>
                      {grande
                        ? `${mb(item.bytes)}, grande demais pro navegador`
                        : `${item.pasta || 'raiz'}, ${mb(item.bytes)}`}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Uma legenda, e ela diz o tamanho do que está na frente mais a única
              regra que o painel impõe. */}
          <span style={{ font: `10px ${MONO}`, color: t45 }}>
            {estadoAcervo === 'pronto' && acervo
              ? cortados > 0
                ? `${ACERVO_MOSTRA_MAX} de ${filtrados.length} na tela, filtre para ver o resto`
                : `${filtrados.length} de ${acervo.length} arquivos, acima de ${ACERVO_LIMITE_MB} MB não abre`
              : `o acervo mora no backend, acima de ${ACERVO_LIMITE_MB} MB não abre`}
          </span>
        </div>
      )}

      {/* ── teclado: o elemento principal ──────────────────────────
          O modo DRONE não muda de cor, muda de PESO: o leito das teclas ganha
          preenchimento, e a tecla acesa fica acesa em vez de voltar. */}
      <div
        role="group"
        aria-label="teclado"
        onMouseLeave={() => { if (!latch) for (const id of Array.from(vozesRef.current.keys())) notaOff(id) }}
        style={{
          position: 'relative', height: ALT_BRANCA + 12, width: '100%',
          marginBottom: ESP.md, userSelect: 'none', touchAction: 'none',
          boxSizing: 'border-box', borderRadius: 8,
          background: latch ? t12 : 'transparent',
          transition: TRANSICAO,
        }}>
        {BRANCAS.map((t, i) => {
          const on = acesas.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              aria-label={nomeDaTecla(idTransposto(t.id, transporRef.current), t.atalho)}
              aria-keyshortcuts={t.atalho ? t.atalho.toUpperCase() : undefined}
              aria-pressed={on}
              onMouseDown={() => tocarTecla(t.id, t.cents)}
              onMouseUp={() => notaOff(t.id)}
              onTouchStart={e => { e.preventDefault(); tocarTecla(t.id, t.cents) }}
              onTouchEnd={e => { e.preventDefault(); notaOff(t.id) }}
              onKeyDown={e => teclaAcionaDown(e, t.id, t.cents)}
              onKeyUp={e => teclaAcionaUp(e, t.id)}
              onFocus={e => { if (focoDeTeclado(e.currentTarget)) setTeclaFocada(t.id) }}
              onBlur={() => setTeclaFocada(f => (f === t.id ? null : f))}
              style={{
                ...BOTAO_CRU,
                outline: teclaFocada === t.id ? `2px solid ${ACESO}` : 'none',
                outlineOffset: 2,
                position: 'absolute',
                left: `calc(${i * PASSO_BRANCA}% + 2px)`,
                width: `calc(${PASSO_BRANCA}% - 4px)`,
                top: on ? 9 : 6, height: ALT_BRANCA - (on ? 3 : 0),
                background: on
                  ? `linear-gradient(180deg, ${ACESO} 0%, ${t100} 60%)`
                  : `linear-gradient(180deg, ${t100} 0%, ${t70} 100%)`,
                border: `1px solid ${FUNDO}`,
                borderRadius: '0 0 5px 5px',
                boxShadow: on ? `0 0 22px ${ACESO_FRACO}` : 'none',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'center', gap: 4, paddingBottom: 9, cursor: 'pointer',
                transition: 'top 60ms linear, box-shadow 90ms linear',
              }}>
              <span style={{ font: `10px ${MONO}`, color: FUNDO, opacity: 0.6 }}>{idTransposto(t.id, transporRef.current)}</span>
              {t.atalho && (
                <span style={{
                  font: `700 11px ${MONO}`, color: FUNDO,
                  background: 'transparent',
                  border: `1px solid ${FUNDO}`,
                  borderRadius: 3, padding: '1px 6px',
                }}>{t.atalho.toUpperCase()}</span>
              )}
            </button>
          )
        })}
        {PRETAS.map(t => {
          const on = acesas.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              aria-label={nomeDaTecla(idTransposto(t.id, transporRef.current))}
              aria-pressed={on}
              onMouseDown={e => { e.stopPropagation(); tocarTecla(t.id, t.cents) }}
              onMouseUp={e => { e.stopPropagation(); notaOff(t.id) }}
              onTouchStart={e => { e.preventDefault(); tocarTecla(t.id, t.cents) }}
              onTouchEnd={e => { e.preventDefault(); notaOff(t.id) }}
              onKeyDown={e => teclaAcionaDown(e, t.id, t.cents)}
              onKeyUp={e => teclaAcionaUp(e, t.id)}
              onFocus={e => { if (focoDeTeclado(e.currentTarget)) setTeclaFocada(t.id) }}
              onBlur={() => setTeclaFocada(f => (f === t.id ? null : f))}
              style={{
                ...BOTAO_CRU,
                outline: teclaFocada === t.id ? `2px solid ${ACESO}` : 'none',
                outlineOffset: 2,
                position: 'absolute', zIndex: 2,
                left: `calc(${(t.afterWhite + 1) * PASSO_BRANCA}% - ${LARG_PRETA / 2}px)`,
                top: on ? 9 : 6, width: LARG_PRETA, height: ALT_PRETA - (on ? 3 : 0),
                background: on ? ACESO : FUNDO_ALTO,
                border: `1px solid ${t12}`, borderRadius: '0 0 4px 4px',
                boxShadow: on ? `0 0 20px ${ACESO_FRACO}` : 'none',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                paddingBottom: 7, cursor: 'pointer',
                transition: 'top 60ms linear, box-shadow 90ms linear',
              }}>
              {modo === 'completo' && (
                <span style={{ font: `9px ${MONO}`, color: on ? FUNDO : t45 }}>{idTransposto(t.id, transporRef.current)}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── faixa de ação ──────────────────────────────────────────
          A única mobília permanente da tela, e ela TROCA em vez de crescer: fora do
          modo sequência ela segura o DRONE, dentro dele o DRONE dá lugar ao par
          TOCAR/EDITAR da grade. SILENCIAR e GRAVAR ficam nas duas, porque são as
          duas saídas do instrumento e sumir com elas custaria função. */}
      <div style={{ display: 'flex', gap: ESP.xs, flexWrap: 'wrap', alignItems: 'center', marginBottom: ESP.md }}>
        {modoSeq ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (seqRodando) { setSeqRodando(false); return }
                if (gradeVazia) return
                passoAtualRef.current = -1
                setSeqRodando(true)
              }}
              aria-pressed={seqRodando}
              disabled={gradeVazia && !seqRodando}
              style={{
                display: 'flex', alignItems: 'center', gap: ESP.xs,
                padding: '14px 20px', borderRadius: 6,
                cursor: gradeVazia && !seqRodando ? 'not-allowed' : 'pointer',
                font: `700 12px ${MONO}`, letterSpacing: '0.12em',
                opacity: gradeVazia && !seqRodando ? 0.45 : 1,
                background: seqRodando ? ACESO_FRACO : 'transparent',
                border: `1px solid ${seqRodando ? ACESO : t12}`,
                color: seqRodando ? ACESO : t45,
                transition: TRANSICAO,
              }}>
              <span style={{
                width: 11, height: 11, borderRadius: seqRodando ? 2 : '50%',
                background: seqRodando ? ACESO : 'transparent',
                border: `1px solid ${seqRodando ? ACESO : t25}`,
              }} />
              {seqRodando ? 'PARAR' : 'TOCAR'}
            </button>

            <button
              type="button"
              onClick={() => setEditando(e => !e)}
              aria-pressed={editando}
              style={{
                padding: '14px 18px', borderRadius: 6, cursor: 'pointer', font: `600 12px ${MONO}`,
                background: editando ? ACESO_FRACO : 'transparent',
                border: `1px solid ${editando ? ACESO : t12}`,
                color: editando ? ACESO : t45,
                transition: TRANSICAO,
              }}>
              {editando ? 'EDITANDO' : 'EDITAR'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { const novo = !latch; setLatch(novo); latchRef.current = novo; if (!novo) silenciarTudo() }}
            aria-pressed={latch}
            style={{
              display: 'flex', alignItems: 'center', gap: ESP.xs,
              padding: '14px 20px', borderRadius: 6, cursor: 'pointer',
              font: `700 12px ${MONO}`, letterSpacing: '0.12em',
              background: latch ? ACESO_FRACO : 'transparent',
              border: `1px solid ${latch ? ACESO : t12}`,
              color: latch ? ACESO : t45,
              transition: TRANSICAO,
            }}>
            {/* preenchido quando ligado, vazado quando não: o sinal sobrevive ao print */}
            <span style={{
              width: 11, height: 11, borderRadius: '50%',
              background: latch ? ACESO : 'transparent',
              border: `1px solid ${latch ? ACESO : t25}`,
            }} />
            DRONE
          </button>
        )}

        <button
          type="button"
          onClick={silenciarTudo}
          style={{
            padding: '14px 18px', borderRadius: 6, cursor: 'pointer', font: `600 12px ${MONO}`,
            background: 'transparent', border: `1px solid ${t12}`, color: t45,
          }}>
          SILENCIAR
        </button>

        <button
          type="button"
          onClick={() => (gravando ? pararGravacao() : comecarGravacao())}
          aria-pressed={gravando}
          style={{
            display: 'flex', alignItems: 'center', gap: ESP.xs,
            padding: '14px 22px', borderRadius: 6, cursor: 'pointer',
            font: `700 12px ${MONO}`, letterSpacing: '0.12em',
            background: gravando ? ACESO_FRACO : 'transparent',
            border: `1px solid ${gravando ? ACESO : t25}`,
            color: gravando ? ACESO : t70,
            transition: TRANSICAO,
          }}>
          {/* gravando é quadrado e preenchido, parado é círculo vazado */}
          <span style={{
            width: 11, height: 11, borderRadius: gravando ? 2 : '50%',
            background: gravando ? ACESO : 'transparent',
            border: `1px solid ${gravando ? ACESO : t45}`,
          }} />
          {gravando ? 'PARAR' : 'GRAVAR'}
        </button>

        {/* MIC: fonte de ENTRADA, não voz do teclado, por isso ele mora aqui e não
            na linha das pílulas. Quatro desenhos do mesmo botão: apagado (círculo
            vazado), pedindo (apagado e sem toque, o rótulo diz o que se espera),
            ligado (marca preenchida e barrinha de nível ao vivo) e negado (marca
            vazada no topo da escala, com a linha de baixo dizendo o que houve). */}
        {modo === 'completo' && <button
          type="button"
          onClick={() => { if (estadoMic === 'ligado') desligarMic(); else if (estadoMic !== 'pedindo') void ligarMic() }}
          aria-pressed={estadoMic === 'ligado'}
          aria-label="microfone como entrada"
          disabled={estadoMic === 'pedindo'}
          style={{
            display: 'flex', alignItems: 'center', gap: ESP.xs,
            padding: '14px 18px', borderRadius: 6,
            cursor: estadoMic === 'pedindo' ? 'progress' : 'pointer',
            font: `700 12px ${MONO}`, letterSpacing: '0.12em',
            opacity: estadoMic === 'pedindo' ? 0.45 : 1,
            background: estadoMic === 'ligado' ? ACESO_FRACO : 'transparent',
            border: `1px solid ${estadoMic === 'ligado' ? ACESO : estadoMic === 'erro' ? t45 : t12}`,
            color: estadoMic === 'ligado' ? ACESO : estadoMic === 'erro' ? t70 : t45,
            transition: TRANSICAO,
          }}>
          <span style={{
            width: 11, height: 11, borderRadius: '50%',
            background: estadoMic === 'ligado' ? ACESO : 'transparent',
            border: `1px solid ${estadoMic === 'ligado' ? ACESO : estadoMic === 'erro' ? t100 : t25}`,
          }} />
          {estadoMic === 'pedindo' ? 'PEDINDO' : 'MIC'}
          {estadoMic === 'ligado' && <NivelMic nivel={nivelMic} />}
        </button>}

        {/* o portão do modo: a grade inteira mora atrás deste botão */}
        <button
          type="button"
          onClick={() => setModoSeq(m => !m)}
          aria-pressed={modoSeq}
          style={{
            marginLeft: 'auto',
            padding: '14px 18px', borderRadius: 6, cursor: 'pointer',
            font: `600 12px ${MONO}`, letterSpacing: '0.12em',
            background: modoSeq ? ACESO_FRACO : 'transparent',
            border: `1px solid ${modoSeq ? ACESO : t12}`,
            color: modoSeq ? ACESO : t45,
            transition: TRANSICAO,
          }}>
          SEQUÊNCIA
        </button>

        {/* UMA linha para o mic, e ela troca com o estado. Nada aqui trava a tela:
            negado é um desenho, não um beco, e o GRAVAR continua valendo só com o
            synth. `flexBasis` de 100% joga a linha para baixo da faixa inteira. */}
        {estadoMic !== 'off' && (
          <span style={{ flexBasis: '100%', font: `10px ${MONO}`, color: t45 }}>
            {estadoMic === 'pedindo' ? 'esperando a permissão do navegador'
              : estadoMic === 'erro' ? erroMic
                : 'o mic entra na gravação e não volta nas caixas'}
          </span>
        )}
      </div>

      {/* ── sequenciador lento: um MODO, não um bloco fixo ───────────
          O teclado continua na tela aqui, porque é ele que preenche os passos. O
          DRONE segura o acorde e a sequência entra POR CIMA dele: um não bloqueia o
          outro, e o passo é medido em segundos já esticados. */}
      {modoSeq && (
      <div style={{
        borderTop: LINHA, paddingTop: ESP.md, marginBottom: ESP.md,
        display: 'flex', flexDirection: 'column', gap: ESP.md,
      }}>
        <span style={{ font: `10px ${MONO}`, color: t45 }}>
          {editando
            ? 'clique num passo, toque no teclado pra preencher, toque de novo pra tirar'
            : gradeVazia ? 'grade vazia: EDITAR e toque no teclado'
              : `${nPassos} passos × ${passoSeg.toFixed(1).replace('.', ',')} s = ciclo de ${cicloSeg.toFixed(1).replace('.', ',')} s, ${mmss(cicloSeg * FATOR_PEDIDO)} esticado`}
        </span>

        {/* a grade: um passo = uma nota OU um acorde (denso estica melhor) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Array.from({ length: nPassos }, (_, i) => {
            const notas = passos[i] ?? []
            const sel = editando && passoSel === i
            const atual = seqRodando && passoAtual === i
            const vazio = notas.length === 0
            return (
              <div
                key={i}
                onClick={() => { setPassoSel(i); setEditando(true) }}
                style={{
                  flex: '1 1 104px', minWidth: 104, minHeight: 76,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '8px 9px 10px', borderRadius: 5, cursor: 'pointer',
                  background: atual ? ACESO_FRACO : sel ? t06 : 'transparent',
                  border: `1px ${vazio && !atual ? 'dashed' : 'solid'} ${atual ? ACESO : sel ? t45 : t12}`,
                  transition: 'background 120ms linear',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: ESP.xs }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: atual ? ACESO : 'transparent',
                    border: `1px solid ${atual ? ACESO : t25}`,
                  }} />
                  <span style={{ font: `10px ${MONO}`, color: t45 }}>{i + 1}</span>
                  {!vazio && (
                    <button
                      onClick={e => { e.stopPropagation(); limparPasso(i) }}
                      title="limpar passo"
                      aria-label={`limpar passo ${i + 1}`}
                      style={{
                        marginLeft: 'auto', padding: '0 3px', lineHeight: 1, cursor: 'pointer',
                        background: 'transparent', border: 'none', color: t45, font: `12px ${MONO}`,
                      }}>×</button>
                  )}
                </div>
                {vazio
                  ? <span style={{ font: `11px ${MONO}`, color: t25 }}>
                      {sel ? 'toque uma nota' : 'vazio'}
                    </span>
                  : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {notas.map(n => (
                        <span key={n} style={{
                          font: `11px ${MONO}`, color: atual ? ACESO : t70,
                          background: t06, borderRadius: 3, padding: '1px 5px',
                        }}>{n}</span>
                      ))}
                    </div>}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: ESP.xl, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* PASSO: o valor em segundos, a régua em segundos ESTICADOS */}
          <Medidor
            rotulo="PASSO"
            valor={`${passoSeg.toFixed(1).replace('.', ',')} s`}
            unidade="por passo"
            qualificador={`= ${Math.round(passoEsticado)} s depois do stretch de ${FATOR_PEDIDO}x`}
            estado="ok"
            legenda="o release cobre o passo seguinte"
            largura={280}
          >
            <ReguaEsticado passoSeg={passoSeg} minSeg={SEQ_SEG_MIN} teto={SEQ_ESTICADO_TETO} fator={FATOR_PEDIDO} />
            <input
              type="range" min={SEQ_SEG_MIN} max={SEQ_SEG_MAX} step={0.25} value={passoSeg}
              aria-label="segundos por passo"
              onChange={e => setPassoSeg(parseFloat(e.target.value))}
              style={{ width: 160, accentColor: ACESO, cursor: 'pointer' }}
            />
          </Medidor>

          {/* PASSOS: quantos valem, e quanto do ciclo já tem material */}
          <Medidor
            rotulo="PASSOS"
            valor={String(nPassos)}
            unidade="na volta"
            qualificador={`${notasNaGrade} nota${notasNaGrade === 1 ? '' : 's'} na grade`}
            estado="ok"
            legenda={gradeVazia ? 'nenhum passo preenchido' : `${passos.slice(0, nPassos).filter(p => p.length).length} de ${nPassos} preenchidos`}
            largura={230}
          >
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: SEQ_MAX_PASSOS - SEQ_MIN_PASSOS + 1 }, (_, k) => {
                const n = SEQ_MIN_PASSOS + k
                const on = n === nPassos
                return (
                  <button key={n} onClick={() => setNPassos(n)}
                    style={{
                      width: 26, height: 24, borderRadius: 4, cursor: 'pointer',
                      font: `11px ${MONO}`, fontVariantNumeric: 'tabular-nums',
                      background: on ? ACESO_FRACO : 'transparent',
                      border: `1px solid ${on ? ACESO : t12}`,
                      color: on ? ACESO : t45,
                    }}>{n}</button>
                )
              })}
            </div>
          </Medidor>
        </div>
      </div>
      )}

      {/* PULSO: rótulo, valor, régua, evidência, UMA legenda. Ele some em repouso
          porque medidor parado em zero não ensina nada, e volta enquanto a mão está
          na tecla, que é quando o número quer dizer alguma coisa. */}
      <Revelar aberto={mostraPulso}>
        {/* No modo etéreo o mesmo medidor troca de vocabulário: `ataques/s` é a
            unidade de quem calibrou o portão, não de quem está com a mão na tecla.
            A forma (TrilhaZona) e o estado continuam idênticos — só o número sai,
            porque ali ele não decide nada que a posição da agulha já não diga. */}
        <Medidor
          rotulo={modo === 'etereo' ? 'MÃO' : 'PULSO'}
          valor={modo === 'etereo' ? (pulsoAlto ? 'pesada' : 'leve') : ataquesPorSeg.toFixed(1)}
          unidade={modo === 'etereo' ? '' : 'ataques/s'}
          qualificador={modo === 'etereo' ? '' : `zona boa até ${PULSO_LIMITE.toFixed(1)}/s`}
          estado={pulsoAlto ? 'reprova' : 'ok'}
          legenda={pulsoAlto
            ? 'martelada vira ressaca em 12x'
            : modo === 'etereo' ? ''
              : acesas.size
                ? `${acesas.size} soando: ${Array.from(acesas).map(n => idTransposto(n, transporRef.current)).join(' ')}`
                : 'acorde segurado mantém aqui embaixo'}
        >
          <TrilhaZona
            valor={ataquesPorSeg}
            teto={PULSO_TETO}
            zonaFim={PULSO_LIMITE}
            estado={pulsoAlto ? 'reprova' : 'ok'}
            excedente={ataquesPorSeg > PULSO_TETO ? `+${(ataquesPorSeg - PULSO_TETO).toFixed(1)}/s` : null}
          />
        </Medidor>
      </Revelar>

      {/* ── a régua dos 30 s, desenhada e não escrita ───────────────
          Ela é obrigatória no fluxo de gravação: é ela que ensina a gravar mais
          tempo, mostrando que 12x pedidos voltam como 9x numa fonte curta. Fora
          desse fluxo ela não tem o que ensinar, então não fica na tela. */}
      <Revelar aberto={mostraEsticado}>
        <div style={{ display: 'flex', gap: ESP.lg, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* `9,4x de 12x pedidos` é a mesma verdade que `42 s viram 6:35`, dita
              nas unidades de quem escreveu o algoritmo. No modo etéreo ela sai em
              minutos, que é a unidade da pessoa que vai ouvir. */}
          <Medidor
            rotulo={modo === 'etereo' ? 'CAMA' : 'STRETCH REAL'}
            valor={modo === 'etereo' ? mmss(segLidos * fator) : `${fator.toFixed(1).replace('.', ',')}x`}
            unidade=""
            qualificador={modo === 'etereo'
              ? `de ${mmss(segLidos)} gravados`
              : `de ${FATOR_PEDIDO}x pedidos, janela ${String(JANELA_SEG).replace('.', ',')} s`}
            /* No etéreo, não ter chegado aos 30 s não é AVISO, é progresso: a
               marca está desenhada na trilha e a legenda diz o que fazer. A
               palavra "ATENÇÃO" ao lado do número era o terceiro sinal da mesma
               coisa, e o único que não diz nada. No completo ela fica, porque lá
               o aviso é sobre o fator entregue, que não tem outro lugar. */
            estado={estado === 'erro' ? 'reprova'
              : modo === 'etereo' ? 'ok'
                : segLidos > 0 && !alvoBatido ? 'aviso' : 'ok'}
            /* No etéreo o qualificador já diz "de 0:16 gravados", e a legenda dizia
               "0:16 gravados" logo abaixo: o mesmo número duas vezes, empilhado.
               Legenda existe pra dizer o que fazer com o número, não pra repetir. */
            legenda={
              estado === 'subindo' ? 'subindo o arquivo'
                : estado === 'erro' ? `erro: ${erroMsg}`
                  : estado === 'vazio' && segLidos === 0 ? 'nada gravado ainda'
                    : modo === 'etereo'
                      ? (alvoBatido ? 'já dá cama de sobra' : `passe de ${SEG_ALVO} s e a cama rende o dobro`)
                      : `${mmss(segLidos)} gravados`
            }
            largura={330}
          >
            <TrilhaTempo
              seg={segLidos}
              trilhaSeg={TRILHA_SEG}
              marcaSeg={SEG_ALVO}
              batido={alvoBatido}
              carregando={estado === 'subindo'}
              excedente={estourouTrilha ? `+${Math.round(segLidos - TRILHA_SEG)} s além` : null}
            />
          </Medidor>

          {estado === 'ok' && ultimo && (
            <Medidor rotulo="FONTE" valor="ok" unidade="" qualificador="no disco, pronta pro stretch"
              estado="ok" legenda={ultimo.path} largura={300}>
              <div style={{ height: 14, display: 'flex', alignItems: 'center' }}>
                <span style={{ width: '100%', height: 3, background: t70, borderRadius: 2 }} />
              </div>
            </Medidor>
          )}
        </div>
      </Revelar>

      {/* `listStyle: none` tira o triângulo do `<summary>`, e sem ele este controle
          ficava com o MESMO desenho de um rótulo passivo (10px, t45, maiúsculo): lia
          como título de uma seção vazia, não como algo que abre. Visto na tela.
          O sinal voltou como `+` / `−`, que funciona no tom único, e o rótulo ganhou
          uma caixa de toque com borda, que é o que separa controle de legenda. */}
      {/* NÃO controlado de propósito: com `open={estado}` o React reescreve o
          atributo no mesmo ciclo em que o navegador acabou de alterná-lo, e o
          disclosure fica preso fechado. Quem abre é o `<details>`; o estado abaixo
          só existe para o sinal saber se desenha `+` ou `−`. */}
      <details
        onToggle={e => setVozAberta((e.currentTarget as HTMLDetailsElement).open)}
        style={{ marginBottom: ESP.lg }}>
        <summary style={{
          display: 'inline-flex', alignItems: 'center', gap: ESP.xs,
          font: `10px ${MONO}`, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: t45, cursor: 'pointer', listStyle: 'none',
          padding: `${ESP.xs}px ${ESP.sm}px`,
          border: LINHA, borderRadius: 3,
        }}>
          <span aria-hidden style={{ font: `12px ${MONO}`, lineHeight: 1, color: t70 }}>
            {vozAberta ? '−' : '+'}
          </span>
          ajustar
        </summary>
        {/* Grade densa, não seção. Aberto, isto é um painel de ajuste fino: cada
            controle é rótulo, valor e trilho na mesma linha, e nenhum deles ganha
            uma segunda frase embaixo. VOLUME entrou aqui e deixou de ser exceção. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))',
          gap: `${ESP.sm}px ${ESP.md}px`, alignItems: 'start', marginTop: ESP.sm,
        }}>
          <Slider rotulo="VOLUME" v={vol} min={0} max={1} passo={0.01} unid="" onChange={setVol} />
          <Slider rotulo="ATTACK" v={voz.attack} min={0.05} max={8} passo={0.05} unid="s" onChange={x => setVoz(v => ({ ...v, attack: x }))} />
          <Slider rotulo="DECAY" v={voz.decay} min={0.05} max={8} passo={0.05} unid="s" onChange={x => setVoz(v => ({ ...v, decay: x }))} />
          <Slider rotulo="SUSTAIN" v={voz.sustain} min={0} max={1} passo={0.01} unid="" onChange={x => setVoz(v => ({ ...v, sustain: x }))} />
          <Slider rotulo="RELEASE" v={voz.release} min={0.2} max={15} passo={0.1} unid="s" onChange={x => setVoz(v => ({ ...v, release: x }))} />
          <Slider rotulo="LFO RATE" v={voz.lfoRate} min={0.02} max={1} passo={0.01} unid="Hz" onChange={x => setVoz(v => ({ ...v, lfoRate: x }))} />
          <Slider rotulo="LFO DEPTH" v={voz.lfoDepth} min={0} max={1} passo={0.01} unid="" onChange={x => setVoz(v => ({ ...v, lfoDepth: x }))} />

          <Campo rotulo="ONDA">
            <div style={{ display: 'flex', gap: 4 }}>
              {(['sine', 'triangle', 'sawtooth'] as Onda[]).map(o => (
                <button key={o} type="button" onClick={() => setVoz(v => ({ ...v, onda: o }))}
                  title={o === 'sawtooth' ? 'mais harmônico e mais grão: áspero depois de esticar' : undefined}
                  aria-label={o}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '4px 7px', borderRadius: 4, cursor: 'pointer',
                    background: voz.onda === o ? ACESO_FRACO : 'transparent',
                    border: `1px solid ${voz.onda === o ? ACESO : t12}`,
                  }}>
                  <OndaIcone tipo={o} cor={voz.onda === o ? ACESO : t45} />
                </button>
              ))}
            </div>
          </Campo>

          <Campo rotulo="ENVELOPE">
            <ADSRDisplay attack={voz.attack} decay={voz.decay} sustain={voz.sustain} release={voz.release}
              accent={t70} width={140} height={34} />
          </Campo>
        </div>
      </details>
    </section>
  )
}

/* ── peças locais de desenho (nada de design system) ─────────────── */

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Tamanho de arquivo com a vírgula decimal da casa. */
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`

/**
 * O que aparece só na hora certa, aparecendo sem sacudir a tela.
 *
 * `grid-template-rows` de `0fr` a `1fr` é o jeito de animar altura desconhecida sem
 * medir nada em JS, e a opacidade usa a MESMA transição dos painéis (`TRANSICAO`),
 * que é a única duração que este repo declara. Medidor que pisca a cada nota é pior
 * que medidor fixo, então quem chama isto já entrega um sinal que dura.
 */
function Revelar({ aberto, children }: { aberto: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!aberto}
      style={{
        display: 'grid',
        gridTemplateRows: aberto ? '1fr' : '0fr',
        opacity: aberto ? 1 : 0,
        transition: `grid-template-rows 0.15s, ${TRANSICAO}`,
      }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div style={{ paddingBottom: ESP.md }}>{children}</div>
      </div>
    </div>
  )
}

/**
 * A anatomia única: rótulo, valor, qualificador (a régua), evidência (a forma) e
 * NO MÁXIMO uma legenda.
 *
 * Nenhum número entra aqui sem qualificador. E o estado não tem mais hue: sai da
 * escala de tinta (`ESTADO[e].tinta`) somada à palavra por extenso.
 *
 * Havia um segundo slot de texto (`apoio`), e o PULSO usava os dois: duas frases
 * embaixo do mesmo medidor, explicando a mesma coisa. Duas legendas não são o dobro
 * de didática, são ruído, então o slot deixou de existir e quem tinha as duas
 * escolhe a que ensina mais na situação.
 */
function Medidor({ rotulo, valor, unidade, qualificador, estado, legenda, largura = 250, children }: {
  rotulo: string; valor: string; unidade: string; qualificador: string
  estado: Estado; legenda?: string; largura?: number
  children: ReactNode
}) {
  const e = ESTADO[estado]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.xs, width: largura }}>
      <span style={{ font: `10px ${MONO}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: t45 }}>{rotulo}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          font: `700 22px ${MONO}`, fontVariantNumeric: 'tabular-nums',
          color: e.tinta, lineHeight: 1,
        }}>{valor}</span>
        {unidade && <span style={{ font: `11px ${MONO}`, color: t45 }}>{unidade}</span>}
        <span style={{ font: `10px ${MONO}`, color: t45 }}>{qualificador}</span>
        {e.palavra && (
          <span style={{
            font: `500 10px ${MONO}`, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: t100,
          }}>{e.palavra}</span>
        )}
      </div>
      {children}
      {legenda && (
        <span style={{
          font: `10px ${MONO}`, color: t45,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{legenda}</span>
      )}
    </div>
  )
}

/**
 * Trilha de tempo com a marca dos 30 s desenhada nela: é o que ensina a gravar
 * mais tempo, e por isso continua aqui. Bateu o alvo, a barra fecha sólida no
 * topo da escala; não bateu, fica vazada e um degrau abaixo. Zero hue nos dois.
 */
function TrilhaTempo({ seg, trilhaSeg, marcaSeg, batido, carregando, excedente }: {
  seg: number; trilhaSeg: number; marcaSeg: number
  batido: boolean; carregando: boolean; excedente: string | null
}) {
  const W = 330, H = 16
  const frac = Math.min(1, seg / trilhaSeg)
  const xMarca = (marcaSeg / trilhaSeg) * W

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={W} height={H + 12} viewBox={`0 0 ${W} ${H + 12}`} style={{ display: 'block', flexShrink: 0 }}>
        <rect x={0} y={0} width={W} height={H} rx={3} fill={t06} />
        {carregando
          ? <rect x={0} y={0} width={W} height={H} rx={3} fill={t12} />
          : seg > 0 && (
            <rect x={0} y={0} width={Math.max(2, frac * W)} height={H} rx={3}
              fill={batido ? t100 : t25} stroke={batido ? 'none' : t70} strokeWidth={1} />
          )}
        {/* saturação: passou do domínio da trilha, a ponta fecha e o número diz o quanto */}
        {excedente && <rect x={W - 10} y={0} width={10} height={H} fill={t100} />}
        {/* a régua: os 30 s */}
        <line x1={xMarca} y1={-1} x2={xMarca} y2={H + 2} stroke={batido ? t100 : t45} strokeWidth={1.5} />
        <text x={xMarca + 4} y={H + 10} fill={batido ? t70 : t45} style={{ font: `9px ${MONO}` }}>{marcaSeg}s</text>
        <text x={W} y={H + 10} textAnchor="end" fill={t45} style={{ font: `9px ${MONO}` }}>{trilhaSeg}s</text>
      </svg>
      {excedente && <span style={{ font: `700 11px ${MONO}`, color: t100 }}>{excedente}</span>}
    </div>
  )
}

/**
 * Trilha com a zona boa desenhada. Fora da zona a barra PREENCHE em vez de ficar
 * vazada, e sobe ao topo da escala: é o mesmo par de sinais do `ESTADO`, sem cor.
 */
function TrilhaZona({ valor, teto, zonaFim, estado, excedente }: {
  valor: number; teto: number; zonaFim: number; estado: Estado; excedente: string | null
}) {
  const W = 250, H = 14
  const frac = Math.min(1, valor / teto)
  const xZona = (zonaFim / teto) * W
  const e = ESTADO[estado]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', flexShrink: 0 }}>
        <rect x={0} y={0} width={W} height={H} rx={3} fill={t06} />
        <rect x={0} y={0} width={xZona} height={H} rx={3} fill={t06} />
        <rect x={0} y={0} width={Math.max(2, frac * W)} height={H} rx={3}
          fill={e.preenche ? t100 : t25} stroke={e.preenche ? 'none' : t70} strokeWidth={1} />
        {excedente && <rect x={W - 8} y={0} width={8} height={H} fill={t100} />}
        <line x1={xZona} y1={0} x2={xZona} y2={H} stroke={t45} strokeWidth={1.5} />
      </svg>
      {excedente && <span style={{ font: `700 11px ${MONO}`, color: t100 }}>{excedente}</span>}
    </div>
  )
}

/**
 * A régua do passo é desenhada em segundos ESTICADOS, não em segundos tocados:
 * é o número que ninguém intui (2 s viram 24 s a 12x). A faixa apagada à esquerda
 * da marca é o território curto demais: o slider para ali, e a régua mostra por quê.
 */
function ReguaEsticado({ passoSeg, minSeg, teto, fator }: {
  passoSeg: number; minSeg: number; teto: number; fator: number
}) {
  const W = 280, H = 16
  const est = passoSeg * fator
  const frac = Math.min(1, est / teto)
  const xMin = ((minSeg * fator) / teto) * W
  return (
    <svg width={W} height={H + 12} viewBox={`0 0 ${W} ${H + 12}`} style={{ display: 'block', flexShrink: 0 }}>
      <rect x={0} y={0} width={W} height={H} rx={3} fill={t06} />
      <rect x={0} y={0} width={xMin} height={H} rx={3} fill={t06} />
      <rect x={0} y={0} width={Math.max(2, frac * W)} height={H} rx={3} fill={t25} stroke={t70} strokeWidth={1} />
      <line x1={xMin} y1={0} x2={xMin} y2={H} stroke={t45} strokeWidth={1.5} />
      <text x={xMin + 4} y={H + 10} fill={t45} style={{ font: `9px ${MONO}` }}>{Math.round(minSeg * fator)}s mín</text>
      <text x={W} y={H + 10} textAnchor="end" fill={t45} style={{ font: `9px ${MONO}` }}>{Math.round(teto)}s esticado</text>
    </svg>
  )
}

/**
 * A prova de que está entrando som. Sem ela "ligado" é só uma cor, e mic mudo lê
 * igual a mic funcionando, que é o jeito mais caro de descobrir um erro: depois de
 * gravar. Segmentado de propósito, porque barra contínua de 34 px em movimento vira
 * borrão e este medidor cabe dentro de um botão.
 */
function NivelMic({ nivel }: { nivel: number }) {
  const N = 5
  const acesos = Math.round(Math.min(1, Math.max(0, nivel)) * N)
  return (
    <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 2 }}>
      {Array.from({ length: N }, (_, i) => (
        <span key={i} style={{
          width: 3, height: 4 + i * 2, borderRadius: 1,
          background: i < acesos ? ACESO : t25,
        }} />
      ))}
    </span>
  )
}

function OndaIcone({ tipo, cor }: { tipo: Onda; cor: string }) {
  const d = tipo === 'sine'
    ? 'M1,9 C5,1 9,1 13,9 C17,17 21,17 25,9'
    : tipo === 'triangle'
      ? 'M1,15 L7,3 L13,15 L19,3 L25,15'
      : 'M1,15 L9,3 L9,15 L17,3 L17,15 L25,3'
  return (
    <svg width={26} height={18} viewBox="0 0 26 18" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={cor} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.xs }}>
      <span style={{ font: `10px ${MONO}`, letterSpacing: '0.16em', textTransform: 'uppercase', color: t45 }}>{rotulo}</span>
      {children}
    </div>
  )
}

/**
 * Controle de ajuste fino, e nada além disso: rótulo e valor na MESMA linha, trilho
 * embaixo. A linha `min a max` saiu porque o trilho já é a régua do intervalo, e
 * oito destes com três linhas cada viravam uma segunda parede embaixo da primeira.
 */
function Slider({ rotulo, v, min, max, passo, unid, onChange }: {
  rotulo: string; v: number; min: number; max: number; passo: number; unid: string
  onChange: (x: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: ESP.xs }}>
        <span style={{
          font: `10px ${MONO}`, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: t45,
        }}>{rotulo}</span>
        <span style={{ font: `11px ${MONO}`, fontVariantNumeric: 'tabular-nums', color: t70 }}>
          {v.toFixed(2)}<span style={{ color: t45 }}>{unid && ` ${unid}`}</span>
        </span>
      </div>
      <input type="range" min={min} max={max} step={passo} value={v}
        aria-label={rotulo}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: ACESO, cursor: 'pointer' }} />
    </div>
  )
}
