/**
 * Medidor ao vivo da era6: os portões vêm da medição de The Limbic System (Sonmi451),
 * tabela "referência" do PLANO-era6.md. É função pura sobre o espectro e o histórico
 * de RMS, pra dar pra conferir contra o `medir_ref.py` (portão F4).
 */

export type Portao = { id: string; rotulo: string; valor: number; fmt: string; ok: boolean; alvo: string }

export const ALVO = {
  centroide: [350, 900] as const,
  grave: 55,            // % mínimo em 120–500 Hz
  agudo: 3,             // % máximo acima de 2 kHz
  dinamica: [13, 28] as const,
  ataques: [10, 110] as const,
}

/** Recebe a magnitude em dB (saída do AnalyserNode.getFloatFrequencyData). */
export function medirEspectro(db: Float32Array, sr: number) {
  const n = db.length
  const hz = (i: number) => (i * sr) / (2 * n)
  let tot = 0, grave = 0, agudo = 0, soma = 0
  for (let i = 1; i < n; i++) {
    const p = Math.pow(10, db[i] / 10)   // potência
    const f = hz(i)
    if (f < 20) continue
    tot += p
    soma += p * f
    if (f >= 120 && f < 500) grave += p
    if (f >= 2000) agudo += p
  }
  if (tot <= 0) return { centroide: 0, grave: 0, agudo: 0 }
  // centroide em potência é o que o librosa chama de spectral_centroid sobre S²… o medir_ref
  // usa magnitude; a diferença fica no ±10 % do portão F4 (conferir no primeiro render)
  return { centroide: soma / tot, grave: (100 * grave) / tot, agudo: (100 * agudo) / tot }
}

/** Dinâmica P95–P5 do histórico de RMS em dB, ignorando o que está 60 dB abaixo do topo (igual medir_ref). */
export function dinamica(hist: number[]) {
  if (hist.length < 20) return 0
  const top = Math.max(...hist)
  const ativos = hist.filter(v => v > top - 60).sort((a, b) => a - b)
  const q = (x: number) => ativos[Math.min(ativos.length - 1, Math.floor(x * (ativos.length - 1)))]
  return q(0.95) - q(0.05)
}

/** Detecção simples de ataque: fluxo espectral acima da média móvel. Devolve ataques/min. */
export class ContadorAtaques {
  private anterior: Float32Array | null = null
  private fluxos: number[] = []
  private tempos: number[] = []
  private ultimo = -1
  private janelaS: number
  constructor(janelaS = 60) { this.janelaS = janelaS }

  alimentar(db: Float32Array, t: number) {
    if (!this.anterior) { this.anterior = db.slice(); return }
    let fluxo = 0
    for (let i = 0; i < db.length; i++) {
      const d = Math.pow(10, db[i] / 20) - Math.pow(10, this.anterior[i] / 20)
      if (d > 0) fluxo += d
    }
    this.anterior.set(db)
    this.fluxos.push(fluxo)
    if (this.fluxos.length > 40) this.fluxos.shift()
    const media = this.fluxos.reduce((a, b) => a + b, 0) / this.fluxos.length
    const dp = Math.sqrt(this.fluxos.reduce((a, b) => a + (b - media) ** 2, 0) / this.fluxos.length)
    // 1,5 dp acima da média, com 80 ms de trava entre ataques
    if (fluxo > media + 1.5 * dp && fluxo > 1e-4 && t - this.ultimo > 0.08) {
      this.tempos.push(t)
      this.ultimo = t
    }
    while (this.tempos.length && this.tempos[0] < t - this.janelaS) this.tempos.shift()
  }

  porMinuto(t: number, inicio: number) {
    const janela = Math.min(this.janelaS, Math.max(1, t - inicio))
    return (this.tempos.length / janela) * 60
  }
}

export function portoes(esp: { centroide: number; grave: number; agudo: number }, din: number, ataques: number): Portao[] {
  const [c0, c1] = ALVO.centroide
  const [d0, d1] = ALVO.dinamica
  const [a0, a1] = ALVO.ataques
  return [
    { id: 'centroide', rotulo: 'centroid', valor: esp.centroide, fmt: `${Math.round(esp.centroide)} Hz`,
      ok: esp.centroide >= c0 && esp.centroide <= c1, alvo: `${c0}–${c1} Hz` },
    { id: 'grave', rotulo: '120–500 Hz', valor: esp.grave, fmt: `${Math.round(esp.grave)}%`,
      ok: esp.grave >= ALVO.grave, alvo: `≥ ${ALVO.grave}%` },
    { id: 'agudo', rotulo: '> 2 kHz', valor: esp.agudo, fmt: `${esp.agudo.toFixed(1)}%`,
      ok: esp.agudo < ALVO.agudo, alvo: `< ${ALVO.agudo}%` },
    { id: 'dinamica', rotulo: 'dynamics', valor: din, fmt: `${din.toFixed(1)} dB`,
      ok: din >= d0 && din <= d1, alvo: `${d0}–${d1} dB` },
    { id: 'ataques', rotulo: 'onsets/min', valor: ataques, fmt: `${Math.round(ataques)}`,
      ok: ataques >= a0 && ataques <= a1, alvo: `${a0}–${a1}` },
  ]
}
