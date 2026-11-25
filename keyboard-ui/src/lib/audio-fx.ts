/**
 * Grafo de tom+reverb em tempo real, pro browser. Nasceu duplicado (uma cópia dentro
 * de `/eq`, outra que a `/mix` ia precisar) — agora é UM módulo, raiz das duas telas.
 * Muda a técnica aqui, muda nos dois lugares juntos; sem isso um preview escuta
 * diferente do outro por acidente, não por escolha.
 *
 * A técnica é a mesma do backend (`dsp/domar.py`): shelf bipolar pro tom, convolução
 * com IR sintético (ruído com decaimento exponencial, cauda abafada em 9 kHz) pro
 * reverb. Os dois se parecem por construção, não por sorte — mas quem manda é sempre
 * o render do backend; isto aqui é aproximação de preview.
 */

/** ruído com decaimento exponencial — e^-5 no fim da cauda é ~-43 dB, onde a cauda
 * deixa de ser ouvida e passa a ser só CPU. Canais independentes: dois iguais
 * convolvem pra uma cauda mono no centro, o oposto do que reverb serve pra fazer. */
export function fazerIR(ctx: BaseAudioContext, decaySeconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * decaySeconds))
  const buf = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp((-5 * i) / n)
    }
  }
  return buf
}

export type CadeiaFx = {
  ctx: AudioContext
  tom: BiquadFilterNode
  wet: GainNode
  conv: ConvolverNode
}

/** Um shelf (tom, bipolar: negativo escurece, positivo clareia) + um wet/dry de
 * reverb, montados uma vez por elemento e plugados na `destino` (o barramento raiz —
 * em geral `ctx.destination`, compartilhado por todo mundo que toca na mesma tela). */
export function montarCadeiaFx(
  ctx: AudioContext,
  origem: AudioNode,
  destino: AudioNode,
  opts: { tomHz?: number; decaySeconds?: number } = {},
): CadeiaFx {
  const tom = ctx.createBiquadFilter()
  tom.type = 'highshelf'
  tom.frequency.value = opts.tomHz ?? 4500

  const conv = ctx.createConvolver()
  conv.buffer = fazerIR(ctx, opts.decaySeconds ?? 2.5)

  // cauda abafada em 9 kHz: sem isso o reverb recoloca o chiado que o shelf tirou
  const abafa = ctx.createBiquadFilter()
  abafa.type = 'lowpass'
  abafa.frequency.value = 9000

  const wet = ctx.createGain()
  wet.gain.value = 0
  const dry = ctx.createGain()
  dry.gain.value = 1   // o seco passa em ganho 1 sempre, como no backend

  origem.connect(tom)
  tom.connect(dry).connect(destino)
  tom.connect(conv).connect(abafa).connect(wet).connect(destino)

  return { ctx, tom, wet, conv }
}

/** Os parâmetros seguem o estado sem saltar (`setTargetAtTime`): atribuição direta
 * estala durante a reprodução. */
export function aplicaFx(g: CadeiaFx, tomDb: number, reverbWet: number): void {
  const t = g.ctx.currentTime
  g.tom.gain.setTargetAtTime(tomDb, t, 0.02)
  g.wet.gain.setTargetAtTime(reverbWet, t, 0.02)
}

/** Troca o tamanho da sala — troca o buffer, não interpola um parâmetro. */
export function ajustaDecay(g: CadeiaFx, decaySeconds: number): void {
  g.conv.buffer = fazerIR(g.ctx, decaySeconds)
}
