/**
 * era6 — modelo puro da mesa granular (sem Tone, sem DOM): testável no vitest.
 *
 * O mesmo código agenda os grãos ao vivo e no export offline. Com a mesma seed e os
 * mesmos eventos, a sequência de grãos se repete. É isso que deixa o export offline
 * reproduzir o que foi tocado (portão F3 no PLANO-era6.md).
 */
import { get as tipoDeEscala } from '@tonaljs/scale-type'
import { bjorklund } from '@strudel/core/euclid.mjs'

export const SEED = 1618
export const N_CAMADAS = 6
export const FIBO = [1, 2, 3, 5, 8, 13, 21, 34, 55] as const

/* ── rng com seed (mulberry32): pequeno, rápido e sempre igual pra mesma seed ── */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type Rng = ReturnType<typeof rng>

/* ── parâmetros de uma camada ── */
export type ParamsCamada = {
  pos: number        // 0..1 posição no sample
  spray: number      // 0..1 espalhamento em torno da posição (fração do sample)
  tam: number        // ms, duração do grão
  dens: number       // grãos por segundo
  pitch: number      // semitons
  jitter: number     // cents de variação por grão
  rev: number        // 0..1 probabilidade de grão ao contrário
  pan: number        // 0..1 espalhamento estéreo em volta do centro (width)
  centro: number     // -1..1 onde a camada mora no estéreo (pan); deriva ligada = órbita L↔R
  lp: number         // Hz, passa-baixa da camada
  nivel: number      // dB
  respira: number    // 0 = ligado sempre; >0 = período em s (Fibonacci) de entra-e-sai
  // melodia (PLANO-tipos-camada-era6.md): notas numa escala, lidas do sample
  raiz: number       // 0..11 (C..B), tônica
  escala: number     // índice em ESCALAS
  notas: number      // notas por minuto
  salto: number      // 0..1: 0 = anda grau a grau, 1 = salta a escala toda
  notaDur: number    // s, duração da nota na saída
  ataque: number     // s, subida da nota (curto = pluck, longo = pad)
  // percussão: golpes num padrão euclidiano, cortados do sample
  bpm: number
  passos: number     // tamanho do padrão (semicolcheias)
  pulsos: number     // golpes no padrão (Euclides)
  giro: number       // rotação do padrão
  prob: number       // 0..1 chance de cada pulso tocar
  humano: number     // ms de atraso aleatório por golpe
  fatias: number     // o sample é cortado em N golpes; cada pulso sorteia uma fatia
  decai: number      // s, duração do golpe
  mascara: number    // 0 = padrão euclidiano; >= MANUAL = passos clicados à mão (bits 0..15)
}
export type NomeParam = keyof ParamsCamada

export const FAIXA: Record<NomeParam, { min: number; max: number; log?: boolean; rotulo: string; fmt: (v: number) => string }> = {
  pos:     { min: 0, max: 1, rotulo: 'position', fmt: v => `${Math.round(v * 100)}%` },
  spray:   { min: 0, max: 1, rotulo: 'spray', fmt: v => `${Math.round(v * 100)}%` },
  tam:     { min: 15, max: 1200, log: true, rotulo: 'size', fmt: v => `${Math.round(v)}ms` },
  dens:    { min: 0.5, max: 80, log: true, rotulo: 'density', fmt: v => `${v.toFixed(v < 10 ? 1 : 0)}/s` },
  pitch:   { min: -24, max: 12, rotulo: 'pitch', fmt: v => `${v > 0 ? '+' : ''}${Math.round(v)}st` },
  jitter:  { min: 0, max: 100, rotulo: 'detune', fmt: v => `${Math.round(v)}c` },
  rev:     { min: 0, max: 1, rotulo: 'reverse', fmt: v => `${Math.round(v * 100)}%` },
  pan:     { min: 0, max: 1, rotulo: 'width', fmt: v => `${Math.round(v * 100)}%` },
  centro:  { min: -1, max: 1, rotulo: 'pan', fmt: v => Math.abs(v) < 0.05 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}` },
  lp:      { min: 150, max: 12000, log: true, rotulo: 'cutoff', fmt: v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}` },
  nivel:   { min: -48, max: 6, rotulo: 'level', fmt: v => `${v.toFixed(0)}dB` },
  respira: { min: 0, max: 55, rotulo: 'swell', fmt: v => v < 1 ? 'off' : `${fiboMaisProximo(v)}s` },
  raiz:    { min: 0, max: 11, rotulo: 'root', fmt: v => NOMES_NOTA[Math.round(v) % 12] },
  escala:  { min: 0, max: 5, rotulo: 'scale', fmt: v => ESCALAS[Math.round(v)]?.curto ?? '' },
  notas:   { min: 2, max: 90, log: true, rotulo: 'notes', fmt: v => `${Math.round(v)}/m` },
  salto:   { min: 0, max: 1, rotulo: 'leap', fmt: v => `${Math.round(v * 100)}%` },
  notaDur: { min: 0.2, max: 10, log: true, rotulo: 'length', fmt: v => `${v.toFixed(v < 1 ? 2 : 1)}s` },
  ataque:  { min: 0.005, max: 3, log: true, rotulo: 'attack', fmt: v => v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s` },
  bpm:     { min: 40, max: 140, rotulo: 'bpm', fmt: v => `${Math.round(v)}` },
  passos:  { min: 4, max: 16, rotulo: 'steps', fmt: v => `${Math.round(v)}` },
  pulsos:  { min: 1, max: 16, rotulo: 'pulses', fmt: v => `${Math.round(v)}` },
  giro:    { min: 0, max: 15, rotulo: 'rotate', fmt: v => `${Math.round(v)}` },
  prob:    { min: 0, max: 1, rotulo: 'chance', fmt: v => `${Math.round(v * 100)}%` },
  humano:  { min: 0, max: 60, rotulo: 'humanize', fmt: v => `${Math.round(v)}ms` },
  fatias:  { min: 1, max: 16, rotulo: 'slices', fmt: v => `${Math.round(v)}` },
  decai:   { min: 0.02, max: 2, log: true, rotulo: 'decay', fmt: v => v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s` },
  mascara: { min: 0, max: 2 * 65536 - 1, rotulo: 'pattern', fmt: v => (v >= 65536 ? 'hand' : 'euclid') },
}

/* ── tipos de camada ── */
export type TipoCamada = 'textura' | 'melodia' | 'percussao'
export const TIPOS: TipoCamada[] = ['textura', 'melodia', 'percussao']
export const NOMES_NOTA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
// menor na frente: o estilo é escuro. O semitom de cada grau sai do chroma do tonal ("101101011010")
export const ESCALAS = [
  ['minor', 'min'], ['dorian', 'dor'], ['phrygian', 'phr'], ['minor pentatonic', 'm.pent'], ['major', 'maj'], ['lydian', 'lyd'],
].map(([nome, curto]) => ({
  nome, curto,
  semitons: [...tipoDeEscala(nome).chroma].flatMap((b, k) => (b === '1' ? [k] : [])),
}))
export const MANUAL = 65536
// params inteiros: grau de escala, passo e fatia não existem pela metade
const INTEIROS = new Set<NomeParam>(['pitch', 'raiz', 'escala', 'passos', 'pulsos', 'giro', 'fatias', 'mascara', 'bpm'])
// params de escolha: no morph trocam no meio, não passam por valores intermediários
const DEGRAU = new Set<NomeParam>(['respira', 'raiz', 'escala', 'mascara'])

/** Nome de nota do banco ("D#") → 0..11. Sem nota legível = null (a melodia transpõe a partir de C). */
export function notaDoBanco(nota: string | undefined): number | null {
  const k = nota ? NOMES_NOTA.indexOf(nota.trim().toUpperCase()) : -1
  return k < 0 ? null : k
}

// pitch preso em semitom inteiro: grão com pitch quebrado soa desafinado contra as outras camadas
export function prender(p: NomeParam, v: number) {
  const f = FAIXA[p]
  const c = Math.min(f.max, Math.max(f.min, v))
  if (INTEIROS.has(p)) return Math.round(c)
  if (p === 'respira') return c < 1 ? 0 : fiboMaisProximo(c)
  return c
}

export function fiboMaisProximo(v: number) {
  return FIBO.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), FIBO[0])
}

/* padrão escuro: alvo Sonmi451 medido (centroide 350–900 Hz, quase nada > 2 kHz) */
export const PADRAO: ParamsCamada = {
  pos: 0.3, spray: 0.08, tam: 180, dens: 12, pitch: 0, jitter: 8, rev: 0.15,
  pan: 0.5, centro: 0, lp: 2200, nivel: -12, respira: 0,
  raiz: 0, escala: 0, notas: 10, salto: 0.25, notaDur: 2.5, ataque: 0.25,
  bpm: 72, passos: 16, pulsos: 5, giro: 0, prob: 0.8, humano: 12, fatias: 1, decai: 0.35, mascara: 0,
}

/**
 * Sorteio de knobs da camada (botão 🔀). As faixas são as que soam no estilo, não a faixa
 * inteira do knob:
 * - pitch só em intervalo consonante, com oitava abaixo de sobra (grão agudo e parado vira mosquito)
 * - passa-baixa entre 600 Hz e 3 kHz (alvo Sonmi: quase nada acima de 2 kHz)
 * - respira em Fibonacci ou fixo
 * O nível não entra: sortear não pode virar salto de volume.
 */
export function sortearParams(atual: ParamsCamada, r: Rng): ParamsCamada {
  const entre = (a: number, b: number) => a + (b - a) * r()
  const entreLog = (a: number, b: number) => a * Math.pow(b / a, r())
  const um = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
  return {
    ...atual,
    pos: entre(0.02, 0.95),
    spray: entreLog(0.01, 0.4),
    tam: entreLog(40, 1100),
    dens: entreLog(1, 40),
    pitch: um([-24, -12, -12, -7, -5, 0, 0, 7] as const),
    jitter: entre(0, 30),
    rev: entre(0, 0.6),
    pan: entre(0.2, 0.9),
    centro: entre(-0.7, 0.7),
    lp: entreLog(600, 3000),
    respira: um([0, 0, 8, 13, 21, 34] as const),
    // melodia e percussão sorteiam depois dos de textura, pra não mudar a sequência deles.
    // Raiz, escala e bpm ficam: são eles que amarram as camadas entre si
    notas: entreLog(4, 30),
    salto: entre(0, 0.6),
    notaDur: entreLog(0.8, 6),
    ataque: entreLog(0.01, 1.5),
    pulsos: 2 + Math.floor(r() * 6),
    giro: Math.floor(r() * 8),
    prob: entre(0.5, 1),
    decai: entreLog(0.08, 0.8),
    mascara: 0,
  }
}

/* ── agenda de grãos ── */
export type Grao = {
  t: number          // s, tempo de início (relógio do contexto)
  offset: number     // s, onde começa no sample
  dur: number        // s
  rate: number       // playbackRate
  reverso: boolean
  pan: number        // -1..1
  ganho: number      // linear, antes do nível da camada
  forma?: 'nota' | 'golpe' | 'solta'   // ausente = grão (janela de Hann); solta = nota ao vivo, segura e solta em SOLTA_S
  ataque?: number    // s, subida da nota
}

const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const panDe = (p: ParamsCamada, r: Rng) => limitar((p.centro ?? 0) + (r() * 2 - 1) * p.pan, -1, 1)

/**
 * Melodia: passeio aleatório na escala, em duas oitavas em volta da raiz. Salto pequeno é mais
 * provável; o knob leap abre o salto. O sample é transposto da nota dele (banco) até a nota
 * pedida pelo caminho mais curto, então um sino em D# toca a escala certa.
 * `grau` < 0 = começa na raiz. O estado (prox, grau) volta pra continuar a agenda no próximo tick.
 */
export function agendarNotas(p: ParamsCamada, durSample: number, raizSample: number | null,
  desde: number, ate: number, grau: number, r: Rng): { graos: Grao[]; prox: number; grau: number } {
  const esc = (ESCALAS[p.escala] ?? ESCALAS[0]).semitons
  const n = esc.length
  const topo = 2 * n
  if (grau < 0 || grau > topo) grau = n
  const base = raizSample === null ? p.raiz : (((p.raiz - raizSample) % 12) + 18) % 12 - 6
  const ganho = 1 / Math.sqrt(Math.max(1, (p.notas / 60) * p.notaDur))
  const graos: Grao[] = []
  let t = desde
  while (t < ate) {
    const passo = 1 + Math.floor(r() * (1 + Math.round(p.salto * (n - 1))))
    let g = grau + (r() < 0.5 ? -passo : passo)
    if (g < 0) g = -g
    if (g > topo) g = 2 * topo - g
    grau = g
    const st = base + p.pitch + Math.floor(g / n) * 12 + esc[g % n] - 12
    const rate = Math.pow(2, st / 12)
    const saida = p.notaDur * (0.8 + 0.4 * r())
    const inicio = Math.min(p.pos * durSample, durSample * 0.95)
    const dur = Math.max(0.01, Math.min(saida * rate, durSample - inicio))
    graos.push({ t, offset: inicio, dur, rate, reverso: false, pan: panDe(p, r), ganho, forma: 'nota', ataque: p.ataque })
    t += (60 / p.notas) * (0.5 + r())
  }
  return { graos, prox: t, grau }
}

/* ── frase escrita à mão (grade ou teclado do PC): a melodia é do usuário, a mesa só toca ── */
export const PASSOS_FRASE = 16
/** Teclado do PC → graus da escala, de baixo pra cima (a fileira do meio: a mão fica parada). */
export const TECLAS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k']
/** Uma nota da frase: começa no `passo` (0..15), dura `len` passos, no `grau` da escala (0 = raiz, n = oitava). */
export type NotaFrase = { passo: number; grau: number; len: number }
/** Passo da frase = uma batida no bpm da camada: 16 passos a 66 bpm ≈ 14,5 s de loop. */
export const passoFraseS = (bpm: number) => 60 / bpm

/** Grau da escala → semitons a partir da raiz (grau = tamanho da escala → oitava). */
export function semitomDoGrau(escala: number, grau: number) {
  const esc = (ESCALAS[escala] ?? ESCALAS[0]).semitons
  return Math.floor(grau / esc.length) * 12 + esc[((grau % esc.length) + esc.length) % esc.length]
}

/** Grau → transposição do sample: da nota do sample até a raiz pelo caminho curto, mais o grau e o pitch. */
export function semitomDaNota(p: ParamsCamada, raizSample: number | null, grau: number) {
  const base = raizSample === null ? p.raiz : (((p.raiz - raizSample) % 12) + 18) % 12 - 6
  return base + p.pitch + semitomDoGrau(p.escala, grau)
}

/**
 * Frase escrita: os passos caem na grade do bpm contada da `origem` da sessão (igual à percussão),
 * então ao vivo e offline tocam idêntico. Sem sorteio: o que foi escrito é o que toca.
 */
export function agendarFrase(p: ParamsCamada, frase: NotaFrase[], durSample: number, raizSample: number | null,
  origem: number, desde: number, ate: number): Grao[] {
  const ps = passoFraseS(p.bpm)
  const eps = 1e-9
  const graos: Grao[] = []
  const inicio = Math.min(p.pos * durSample, durSample * 0.95)
  const volta = PASSOS_FRASE * ps
  // por volta do loop, não por passo inteiro: nota gravada solta (fora da grade) tem `passo` quebrado
  for (let v = Math.floor((desde - origem) / volta) - 1; origem + v * volta < ate; v++) {
    for (const nf of frase) {
      const t = origem + v * volta + nf.passo * ps
      if (t < desde - eps || t >= ate - eps) continue
      const rate = Math.pow(2, semitomDaNota(p, raizSample, nf.grau) / 12)
      // a nota segura o tamanho escrito (um pouco menos, pra a próxima entrar limpa)
      const saida = nf.len * ps * 0.95
      const dur = Math.max(0.01, Math.min(saida * rate, durSample - inicio))
      graos.push({ t, offset: inicio, dur, rate, reverso: false, pan: limitar(p.centro ?? 0, -1, 1),
        ganho: 0.9, forma: 'nota', ataque: Math.min(p.ataque, saida * 0.4) })
    }
  }
  return graos.sort((a, b) => a.t - b.t)
}

/** Nota tocada ao vivo no teclado: segura enquanto a tecla está apertada e solta em 0,2 s (forma `solta`). */
export const SOLTA_S = 0.2

/** Liga/desliga uma célula da grade: clicar numa nota existente apaga; numa vazia, cria de 1 passo. */
export function alternarCelula(frase: NotaFrase[], passo: number, grau: number): NotaFrase[] {
  const achou = frase.find(nf => nf.grau === grau && passo + 1 > nf.passo && passo < nf.passo + nf.len)
  if (achou) return frase.filter(nf => nf !== achou)
  return [...frase, { passo, grau, len: 1 }]
}

/** Escreve uma nota (teclado ou arraste): tira o que ela cobre na mesma linha e encaixa no loop de 16. */
export function escreverNota(frase: NotaFrase[], passo: number, grau: number, len: number, livre = false): NotaFrase[] {
  // livre = gravado fora da grade: começo e tamanho do jeito que a mão tocou (mínimo de ¼ de batida)
  const L = livre ? Math.max(0.25, Math.min(PASSOS_FRASE - passo, len)) : Math.max(1, Math.min(PASSOS_FRASE - passo, Math.round(len)))
  const resto = frase.filter(nf => nf.grau !== grau || nf.passo + nf.len <= passo || nf.passo >= passo + L)
  return [...resto, { passo, grau, len: L }].sort((a, b) => a.passo - b.passo || a.grau - b.grau)
}

/** Duração de um passo da percussão (semicolcheia). */
export const passoS = (bpm: number) => 60 / bpm / 4

/** Padrão da percussão: Euclides (Bjorklund da strudel) rodado pelo giro, ou os passos clicados à mão. */
export function padraoPerc(p: ParamsCamada): boolean[] {
  const n = limitar(Math.round(p.passos), 1, 16)
  if (p.mascara >= MANUAL) return Array.from({ length: n }, (_, k) => ((p.mascara >> k) & 1) === 1)
  const base = bjorklund(limitar(Math.round(p.pulsos), 0, n), n)
  const g = Math.round(p.giro)
  return Array.from({ length: n }, (_, k) => base[(((k - g) % n) + n) % n] === 1)
}

/** Passo clicado → máscara manual. O bit do manual fica ligado, então apagar tudo continua manual. */
export function alternarPasso(p: ParamsCamada, k: number): number {
  let m = MANUAL
  padraoPerc(p).forEach((on, i) => { if (i === k ? !on : on) m |= 1 << i })
  return m
}

/**
 * Percussão: os passos caem na grade do bpm contada da `origem` da sessão, então ao vivo e
 * offline ficam na mesma fase. Todo pulso gasta os mesmos sorteios (chance, fatia, atraso, pan),
 * toque ou não: assim mexer na chance não embaralha as fatias dos outros golpes.
 */
export function agendarGolpes(p: ParamsCamada, durSample: number, origem: number, desde: number, ate: number, r: Rng): Grao[] {
  const ps = passoS(p.bpm)
  const pad = padraoPerc(p)
  const n = pad.length
  const eps = 1e-9
  const rate = Math.pow(2, p.pitch / 12)
  const fatias = Math.max(1, Math.round(p.fatias))
  const graos: Grao[] = []
  for (let k = Math.ceil((desde - origem) / ps - eps); origem + k * ps < ate - eps; k++) {
    if (!pad[((k % n) + n) % n]) continue
    const toca = r() < p.prob
    const fatia = Math.floor(r() * fatias)
    const atraso = (r() * p.humano) / 1000
    const pan = panDe(p, r)
    if (!toca) continue
    const offset = (fatia / fatias) * durSample
    const dur = Math.max(0.005, Math.min(p.decai * rate, durSample - offset))
    graos.push({ t: origem + k * ps + atraso, offset, dur, rate, reverso: false, pan, ganho: 0.9, forma: 'golpe' })
  }
  return graos
}

/**
 * Próximo grão a partir do estado. O intervalo entre grãos é 1/dens com ±30 % de
 * irregularidade: sem isso a densidade vira um pulso audível (o memo "pulso vira ressaca").
 * O ganho cai com √(sobreposição) pra densidade não virar volume.
 */
export function proximoGrao(p: ParamsCamada, durSample: number, t: number, r: Rng): { grao: Grao; prox: number } {
  const dur = Math.min(durSample, (p.tam / 1000) * (0.8 + 0.4 * r()))
  const centro = p.pos * durSample
  const desvio = (r() - 0.5) * 2 * p.spray * durSample
  const offset = Math.min(Math.max(0, centro + desvio), Math.max(0, durSample - dur))
  const cents = p.pitch * 100 + (r() - 0.5) * 2 * p.jitter
  const sobrepos = Math.max(1, p.dens * (p.tam / 1000))
  const grao: Grao = {
    t, offset, dur,
    rate: Math.pow(2, cents / 1200),
    reverso: r() < p.rev,
    pan: Math.max(-1, Math.min(1, (p.centro ?? 0) + (r() * 2 - 1) * p.pan)),
    ganho: 1 / Math.sqrt(sobrepos),
  }
  const prox = t + (1 / p.dens) * (0.7 + 0.6 * r())
  return { grao, prox }
}

/** Gera todos os grãos em [t, ate). O estado (prox) volta pra continuar a agenda. */
export function agendar(p: ParamsCamada, durSample: number, desde: number, ate: number, r: Rng): { graos: Grao[]; prox: number } {
  const graos: Grao[] = []
  let t = desde
  while (t < ate) {
    const { grao, prox } = proximoGrao(p, durSample, t, r)
    graos.push(grao)
    t = prox
  }
  return { graos, prox: t }
}

/** Ganho 0..1 do "respira": cosseno levantado no período dado; 0 = sempre ligado. */
export function respiracao(periodo: number, t: number, fase = 0) {
  if (periodo < 1) return 1
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / periodo + fase))
}

/* ── deriva (programação): passeio que volta pro valor da mão ── */
export type Deriva = { ligada: boolean; quanto: number }   // quanto: 0..1 da faixa do param
export const PARAMS_DERIVA: NomeParam[] = ['pos', 'spray', 'tam', 'dens', 'pitch', 'lp', 'rev', 'pan', 'centro']

/* órbita: cada camada num período de Fibonacci diferente, pra nunca sincronizarem (surround vivo) */
export const PERIODO_ORBITA = [5, 8, 13, 21, 34, 55] as const

/**
 * Pan em órbita: vai e volta L↔R em seno em volta do pan da mão. O "quanto" da deriva é a
 * profundidade (0,3 → meia volta, 1 → canto a canto). `t` é o tempo desde o começo da sessão,
 * então o ao vivo e o offline ficam na mesma fase.
 */
export function orbita(centro: number, camada: number, t: number, quanto: number) {
  const per = PERIODO_ORBITA[camada % PERIODO_ORBITA.length]
  const prof = Math.min(1, 0.3 + quanto)
  const v = centro + prof * Math.sin((2 * Math.PI * t) / per + camada * 1.618)
  return Math.max(-1, Math.min(1, v))
}
export const TICK_S = 0.1

/**
 * Um passo de Ornstein-Uhlenbeck: a mão manda no centro e a deriva vagueia em volta.
 * A pos anda mais que o resto: é ela que faz a textura "caminhar pelo sample".
 * Em pitch a deriva salta de semitom em semitom, porque grão desafinado mata a harmonia.
 */
export function passoDeriva(p: NomeParam, desvio: number, d: Deriva, r: Rng): number {
  if (!d.ligada || d.quanto <= 0) return desvio * 0.9
  const f = FAIXA[p]
  const largura = (f.log ? Math.log(f.max / f.min) : f.max - f.min) * d.quanto
  const vel = p === 'pos' ? 0.08 : 0.03
  const ruido = (r() - 0.5) * 2 * largura * vel
  return desvio + (-desvio * 0.02) + ruido
}

/** Aplica o desvio da deriva ao valor da mão (em escala log quando o param é log). */
export function comDeriva(p: NomeParam, base: number, desvio: number) {
  const f = FAIXA[p]
  const v = f.log ? base * Math.exp(desvio) : base + desvio
  return prender(p, v)
}

/* ── cenas: snapshot e morph no tempo de Fibonacci ── */
export type Cena = ParamsCamada[]

export function morph(a: Cena, b: Cena, x: number): Cena {
  const k = Math.min(1, Math.max(0, x))
  // curva suave (smoothstep): chegada e saída sem degrau
  const s = k * k * (3 - 2 * k)
  return a.map((ca, i) => {
    const cb = b[i]
    const out = { ...ca }
    for (const p of Object.keys(ca) as NomeParam[]) {
      const f = FAIXA[p]
      const v = f.log ? ca[p] * Math.pow(cb[p] / ca[p], s) : ca[p] + (cb[p] - ca[p]) * s
      out[p] = DEGRAU.has(p) ? (s < 0.5 ? ca[p] : cb[p]) : prender(p, v)
    }
    return out
  })
}

/* ── sessão gravada: o que o export offline relê ── */
export type Evento =
  | { t: number; tipo: 'param'; camada: number; param: NomeParam; valor: number }
  | { t: number; tipo: 'deriva'; camada: number; param: NomeParam; deriva: Deriva }
  | { t: number; tipo: 'sample'; camada: number; sample: string | null }
  | { t: number; tipo: 'mestre'; param: keyof ParamsMestre; valor: number }
  | { t: number; tipo: 'fita'; sample: string | null }
  | { t: number; tipo: 'tipoCamada'; camada: number; valor: TipoCamada }
  | { t: number; tipo: 'frase'; camada: number; notas: NotaFrase[] }
  | { t: number; tipo: 'nota'; camada: number; grau: number; dur: number }   // tocada ao vivo, no tempo exato

export type ParamsMestre = {
  escuro: number    // Hz, LP de fita no master
  wow: number       // 0..1
  estalo: number    // estalos por minuto
  chiado: number    // dB
  sala: number      // 0..1 wet do reverb
  volume: number    // dB
}
// estalo desligado por padrão: quem quiser poeira liga no knob crackle
export const MESTRE_PADRAO: ParamsMestre = { escuro: 2200, wow: 0.35, estalo: 0, chiado: -52, sala: 0.35, volume: -3 }

export type EstadoInicial = {
  camadas: ParamsCamada[]
  derivas: Record<NomeParam, Deriva>[]
  samples: (string | null)[]
  mestre: ParamsMestre
  tipos?: TipoCamada[]   // ausente em sessão antiga = tudo textura
  frases?: NotaFrase[][] // melodia escrita por camada (vazia = melodia generativa)
  fita?: string | null   // sample em loop no lugar do chiado sintético (ausente em sessão antiga = sintético)
  desvios: Partial<Record<NomeParam, number>>[]   // onde a deriva estava no começo do REC
}

export type Sessao = {
  seed: number
  inicial: EstadoInicial
  eventos: Evento[]
  dur_s: number
  samples: string[]   // todos os que tocaram (vai pro fontes.json)
}

export function derivaVazia(): Record<NomeParam, Deriva> {
  const d = {} as Record<NomeParam, Deriva>
  for (const p of Object.keys(FAIXA) as NomeParam[]) d[p] = { ligada: false, quanto: 0.3 }
  return d
}

/** Estalo de vinil: tempos de estalo em [desde, ate), processo de Poisson na taxa por minuto. */
export function agendarEstalos(porMin: number, desde: number, ate: number, r: Rng): { t: number; amp: number; dur: number }[] {
  const out: { t: number; amp: number; dur: number }[] = []
  if (porMin <= 0) return out
  const taxa = porMin / 60
  let t = desde - Math.log(1 - r()) / taxa
  while (t < ate) {
    // amplitude com cauda longa: muitos estalos fracos e poucos fortes, como no vinil
    out.push({ t, amp: Math.pow(r(), 3), dur: 0.001 + r() * 0.006 })
    t += -Math.log(1 - r()) / taxa
  }
  return out
}
