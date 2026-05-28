import * as Tone from 'tone'

export type FilterEnvParams = {
  fenvAttack: number   // 0.001..2
  fenvDecay: number    // 0.01..2
  fenvSustain: number  // 0..1
  fenvRelease: number  // 0.01..5
  fenvDepth: number    // 0..1 (how much the envelope sweeps the cutoff)
}

export const FILTER_ENV_DEFAULTS: FilterEnvParams = {
  fenvAttack: 0.05,
  fenvDecay: 0.3,
  fenvSustain: 0.5,
  fenvRelease: 0.8,
  fenvDepth: 0,
}

/**
 * Create a FrequencyEnvelope that modulates a filter's frequency.
 * baseFrequency = the filter's current cutoff setting.
 * octaves = depth * 4 (depth=1 sweeps ~4 octaves above base).
 */
export function createFilterEnvelope(
  filter: Tone.Filter,
  params: FilterEnvParams,
  baseCutoff: number,
): Tone.FrequencyEnvelope {
  const octaves = params.fenvDepth * 4
  const env = new Tone.FrequencyEnvelope({
    attack: params.fenvAttack,
    decay: params.fenvDecay,
    sustain: params.fenvSustain,
    release: params.fenvRelease,
    baseFrequency: baseCutoff,
    octaves,
    exponent: 2,
  })
  env.connect(filter.frequency)
  return env
}

/**
 * Update filter envelope params live.
 */
export function updateFilterEnvelope(
  env: Tone.FrequencyEnvelope,
  params: Partial<FilterEnvParams>,
  baseCutoff: number,
): void {
  if (params.fenvAttack !== undefined) env.attack = params.fenvAttack
  if (params.fenvDecay !== undefined) env.decay = params.fenvDecay
  if (params.fenvSustain !== undefined) env.sustain = params.fenvSustain
  if (params.fenvRelease !== undefined) env.release = params.fenvRelease
  if (params.fenvDepth !== undefined) env.octaves = params.fenvDepth * 4
  env.baseFrequency = baseCutoff
}

/**
 * Trigger the filter envelope attack (call alongside polySynth.triggerAttack).
 */
export function triggerFilterEnvAttack(env: Tone.FrequencyEnvelope): void {
  try { env.triggerAttack() } catch { /* noop */ }
}

/**
 * Release the filter envelope.
 */
export function triggerFilterEnvRelease(env: Tone.FrequencyEnvelope): void {
  try { env.triggerRelease() } catch { /* noop */ }
}

/**
 * Dispose the filter envelope.
 */
export function disposeFilterEnvelope(env: Tone.FrequencyEnvelope): void {
  try { env.disconnect() } catch { /* noop */ }
  try { env.dispose() } catch { /* noop */ }
}
