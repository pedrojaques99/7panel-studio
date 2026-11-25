/**
 * Presets da mesa inteira (samples, knobs, derivas, fita) e o 🎲 geral.
 *
 * Os de fábrica usam os samples das faixas v1 (era6/_gerador/faixas.py), com os knobs no ponto
 * de partida de cada faixa. Os seus ficam no backend (/api/era6/presets), não no navegador.
 */
import {
  N_CAMADAS, PADRAO, MESTRE_PADRAO, derivaVazia, sortearParams,
  type Deriva, type NomeParam, type ParamsCamada, type ParamsMestre, type Rng, type TipoCamada, type NotaFrase,
} from './modelo'
import type { ItemBanco } from './motor'

export type Preset = {
  nome: string
  fabrica?: boolean
  camadas: ParamsCamada[]
  derivas: Record<NomeParam, Deriva>[]
  samples: (string | null)[]
  tipos?: TipoCamada[]   // ausente (preset antigo) = tudo textura
  frases?: NotaFrase[][] // melodia escrita por camada
  mestre: ParamsMestre
  fita: string | null
}

const DD = 'dark-drone/iron-cthulhu-apocalypse-dark-ambient-binaural-beat-hours-12-07-2020-'
const c = (x: Partial<ParamsCamada>): ParamsCamada => ({ ...PADRAO, ...x })
const derivas = (ligadas: [number, NomeParam][]) => {
  const d = Array.from({ length: N_CAMADAS }, derivaVazia)
  for (const [i, p] of ligadas) d[i][p] = { ligada: true, quanto: 0.3 }
  return d
}
const completar = (xs: ParamsCamada[]) => [...xs, ...Array.from({ length: N_CAMADAS - xs.length }, () => ({ ...PADRAO }))]
const samples = (xs: string[]) => [...xs, ...Array(N_CAMADAS - xs.length).fill(null)]
const tipos = (xs: TipoCamada[]): TipoCamada[] => [...xs, ...Array<TipoCamada>(N_CAMADAS - xs.length).fill('textura')]

// níveis de camada na região de −15 a −5 dB, por design (pedido em 2026-09-30); o limitador de −1 dB segura o pico
export const PRESETS_FABRICA: Preset[] = [
  {
    nome: 'glass gutter', fabrica: true, fita: null,
    samples: samples(['iphone/chuva-e-trovão-na-calha__t1', 'cc0/vintage-taca-de-vidro', 'cc0/vintage-sino-tubular', `${DD}07-dream-and__t2`]),
    camadas: completar([
      c({ pos: 0.1, spray: 0.05, tam: 400, dens: 18, jitter: 20, rev: 0.1, pan: 0.7, lp: 2200, nivel: -5 }),
      c({ pos: 0.25, spray: 0.2, tam: 900, dens: 3.5, pitch: -12, jitter: 5, rev: 0.35, pan: 0.6, lp: 1800, nivel: -10, respira: 21 }),
      c({ pos: 0.08, spray: 0.05, tam: 1100, dens: 1, pitch: -12, jitter: 3, rev: 0.2, pan: 0.4, lp: 1600, nivel: -11, respira: 34 }),
      c({ pos: 0.2, spray: 0.25, tam: 1000, dens: 4, jitter: 4, rev: 0.5, pan: 0.8, lp: 1200, nivel: -12 }),
    ]),
    derivas: derivas([[0, 'pos'], [1, 'pitch'], [3, 'pos']]),
    mestre: { ...MESTRE_PADRAO, escuro: 2100, estalo: 35, chiado: -54, sala: 0.38 },
  },
  {
    nome: 'street dust', fabrica: true, fita: null,
    samples: samples(['iphone/rua-campo-erê-9__t2', 'zero-g/07_03_01', 'vhulto-kit/zi-melodik-bonus-moceno-flute-moc-d', `${DD}15-sleep-10-__t1`]),
    camadas: completar([
      c({ pos: 0.05, spray: 0.04, tam: 60, dens: 40, jitter: 30, rev: 0.3, pan: 0.9, lp: 2400, nivel: -8 }),
      c({ pos: 0.2, spray: 0.12, tam: 900, dens: 5, pitch: -12, jitter: 6, rev: 0.25, pan: 0.6, lp: 1800, nivel: -7 }),
      c({ pos: 0.4, spray: 0.3, tam: 500, dens: 1.3, pitch: -7, jitter: 4, rev: 0.5, pan: 0.5, lp: 2000, nivel: -12, respira: 13 }),
      c({ pos: 0.1, spray: 0.2, tam: 1100, dens: 3, jitter: 3, rev: 0.4, pan: 0.7, lp: 1100, nivel: -11 }),
    ]),
    derivas: derivas([[0, 'pos'], [1, 'pos'], [2, 'pitch']]),
    mestre: { ...MESTRE_PADRAO, escuro: 2300, estalo: 50, chiado: -52, sala: 0.33 },
  },
  {
    nome: 'slow lighter', fabrica: true, fita: null,
    samples: samples(['iphone/isqueiro', 'cc0/vintage-piano-de-armario', 'cc0/vintage-vibrafone', 'vhulto-kit/zi-melodik-bonus-club-der-bohren-prod-vhulto-91']),
    camadas: completar([
      c({ pos: 0.1, spray: 0.3, tam: 35, dens: 2.5, jitter: 40, rev: 0.2, pan: 0.8, lp: 3000, nivel: -6 }),
      c({ pos: 0.2, spray: 0.15, tam: 250, dens: 7, pitch: -12, jitter: 6, rev: 0.3, pan: 0.6, lp: 2000, nivel: -7 }),
      c({ pos: 0.1, spray: 0.08, tam: 900, dens: 1.1, pitch: -12, jitter: 4, rev: 0.25, pan: 0.5, lp: 1700, nivel: -11, respira: 34 }),
      c({ pos: 0.1, spray: 0.3, tam: 1000, dens: 3.5, jitter: 5, rev: 0.5, pan: 0.8, lp: 1200, nivel: -12 }),
    ]),
    derivas: derivas([[1, 'pos'], [1, 'spray'], [3, 'pos']]),
    mestre: { ...MESTRE_PADRAO, escuro: 2000, estalo: 30, chiado: -55, sala: 0.4 },
  },
  {
    nome: 'empty room', fabrica: true, fita: 'iphone/_tratados-chuva-suave-limpa__t2',
    samples: samples(['cc0/vintage-sino-tubular', 'zero-g/07_03_03']),
    camadas: completar([
      c({ pos: 0.15, spray: 0.1, tam: 1100, dens: 2, pitch: -24, jitter: 3, rev: 0.4, pan: 0.6, lp: 1300, nivel: -7, respira: 21 }),
      c({ pos: 0.3, spray: 0.2, tam: 800, dens: 4, pitch: -12, jitter: 5, rev: 0.3, pan: 0.7, lp: 1500, nivel: -9, respira: 34 }),
    ]),
    derivas: derivas([[0, 'pos'], [1, 'pos'], [1, 'pitch']]),
    mestre: { ...MESTRE_PADRAO, escuro: 1600, estalo: 18, chiado: -46, sala: 0.55, wow: 0.5 },
  },
  // as três de melodia (era6/_gerador/melodias.py): cama granular + camada melody baixa, ataque macio e LP próprio
  {
    nome: 'piano in rain', fabrica: true, fita: null,
    samples: samples(['iphone/_tratados-chuva-suave-limpa__t2', 'cc0/vintage-piano-de-armario', 'cc0/vintage-piano-de-armario', 'cc0/vintage-taca-de-vidro']),
    tipos: tipos(['textura', 'textura', 'melodia', 'melodia']),
    camadas: completar([
      c({ pos: 0.3, spray: 0.06, tam: 400, dens: 18, jitter: 20, rev: 0.1, pan: 0.8, lp: 2200, nivel: -5 }),
      c({ pos: 0.08, spray: 0.05, tam: 1000, dens: 3, pitch: -24, jitter: 4, rev: 0.3, pan: 0.6, lp: 1600, nivel: -12, respira: 34 }),
      c({ raiz: 11, escala: 3, notas: 6, salto: 0.2, notaDur: 4.5, ataque: 0.06, pitch: -12, pos: 0, lp: 1600, pan: 0.4, nivel: -9 }),
      c({ raiz: 11, escala: 3, notas: 2, salto: 0.1, notaDur: 9, ataque: 1.5, pitch: -12, pos: 0, lp: 1200, pan: 0.6, nivel: -14, respira: 21 }),
    ]),
    derivas: derivas([[0, 'pos']]),
    mestre: { ...MESTRE_PADRAO, escuro: 2000, estalo: 20, chiado: -55, sala: 0.42 },
  },
  {
    nome: 'dust vibraphone', fabrica: true, fita: null,
    samples: samples(['iphone/_tratados-chuva-leve-no-bosque', 'iphone/birds__t1', 'cc0/vintage-vibrafone', 'cc0/vintage-sino-tubular']),
    tipos: tipos(['textura', 'textura', 'melodia', 'melodia']),
    camadas: completar([
      c({ pos: 0.3, spray: 0.08, tam: 600, dens: 14, jitter: 15, rev: 0.15, pan: 0.8, lp: 2200, nivel: -5 }),
      c({ pos: 0.4, spray: 0.3, tam: 120, dens: 2, jitter: 30, rev: 0.3, pan: 1, lp: 2400, nivel: -15, respira: 21 }),
      c({ raiz: 2, escala: 1, notas: 5, salto: 0.3, notaDur: 5, ataque: 1.2, pitch: -12, pos: 0, lp: 1500, pan: 0.5, nivel: -10 }),
      c({ raiz: 2, escala: 1, notas: 2, salto: 0.2, notaDur: 9, ataque: 0.6, pitch: -12, pos: 0, lp: 1100, pan: 0.6, nivel: -15, respira: 34 }),
    ]),
    derivas: derivas([[0, 'pos']]),
    mestre: { ...MESTRE_PADRAO, escuro: 1900, estalo: 15, chiado: -56, sala: 0.45 },
  },
  {
    nome: 'slow psaltery', fabrica: true, fita: null,
    samples: samples(['iphone/rua-campo-erê-9__t2', 'cc0/electric-organ_c_major', 'cc0/vintage-salterio', 'cc0/vintage-tx81z-fm-piano']),
    tipos: tipos(['textura', 'textura', 'melodia', 'melodia']),
    camadas: completar([
      c({ pos: 0.3, spray: 0.04, tam: 40, dens: 6, jitter: 30, rev: 0.3, pan: 0.9, lp: 2400, nivel: -8 }),
      c({ pos: 0.3, spray: 0.2, tam: 1100, dens: 3, pitch: -12, jitter: 5, rev: 0.4, pan: 0.6, lp: 1800, nivel: -6, respira: 34 }),
      c({ raiz: 0, escala: 3, notas: 6, salto: 0.25, notaDur: 5, ataque: 0.05, pitch: -24, pos: 0, lp: 1100, pan: 0.4, nivel: -7 }),
      c({ raiz: 0, escala: 3, notas: 4, salto: 0.2, notaDur: 3.5, ataque: 0.3, pitch: -24, pos: 0, lp: 900, pan: 0.6, nivel: -13 }),
    ]),
    derivas: derivas([[0, 'pos']]),
    mestre: { ...MESTRE_PADRAO, escuro: 1800, estalo: 30, chiado: -55, sala: 0.4 },
  },
]

/**
 * 🎲 geral: sorteia a mesa inteira dentro do estilo.
 * - 3 a 5 camadas ativas
 * - a primeira é sempre ruído ou textura, de preferência do iPhone (a cama)
 * - as outras podem ser tonais: o sortearParams já joga o pitch pra oitava de baixo
 * - deriva de posição ligada em metade das camadas
 * - fita com sample em 1 de cada 3 sorteios
 */
export function sortearMesa(itens: ItemBanco[], r: Rng, atual: ParamsMestre): Preset {
  const um = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const cama = itens.filter(i => (i.tipo === 'ruido' || i.tipo === 'textura') && i.dur_s > 20)
  const camaIphone = cama.filter(i => i.fonte === 'iphone')
  const resto = itens.filter(i => i.tipo !== 'transiente' && i.dur_s > 2)
  const ativas = 3 + Math.floor(r() * 3)
  const s: (string | null)[] = Array(N_CAMADAS).fill(null)
  s[0] = (camaIphone.length && r() < 0.7 ? um(camaIphone) : um(cama.length ? cama : itens))?.id ?? null
  for (let i = 1; i < ativas; i++) s[i] = um(resto.length ? resto : itens)?.id ?? null
  const camadas = s.map((id, i) => {
    const p = sortearParams({ ...PADRAO }, r)
    return { ...p, nivel: id ? (i === 0 ? -6 : -9 - r() * 5) : PADRAO.nivel }
  })
  const d = Array.from({ length: N_CAMADAS }, derivaVazia)
  s.forEach((id, i) => { if (id && r() < 0.5) d[i].pos = { ligada: true, quanto: 0.2 + r() * 0.3 } })
  const ruidos = itens.filter(i => i.tipo === 'ruido' && i.dur_s > 20)
  return {
    nome: 'random',
    samples: s,
    camadas,
    derivas: d,
    fita: ruidos.length && r() < 0.33 ? um(ruidos).id : null,
    mestre: {
      ...atual,
      escuro: 1400 * Math.pow(2600 / 1400, r()),
      wow: 0.15 + r() * 0.5,
      estalo: 10 + r() * 70,
      chiado: -58 + r() * 12,
      sala: 0.25 + r() * 0.35,
    },
  }
}
