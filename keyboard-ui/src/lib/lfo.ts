import * as Tone from 'tone'

export type LFOWave = 'sine' | 'square' | 'sawtooth' | 'triangle'

export type LFOParams = {
  lfoRate: number      // 0.05..20 Hz
  lfoDepth: number     // 0..1
  lfoWave: LFOWave
  lfoTarget: string    // param key from FxParams (e.g. 'cutoff', 'drive', 'delay')
}

export const LFO_DEFAULTS: LFOParams = {
  lfoRate: 2,
  lfoDepth: 0,
  lfoWave: 'sine',
  lfoTarget: 'cutoff',
}

export const LFO_TARGETS = [
  'cutoff', 'resonance', 'drive', 'chorus', 'phaser',
  'delay', 'shimmer', 'reverbWet', 'vol',
] as const

export type LFOTarget = typeof LFO_TARGETS[number]

/** Map target name to { node, param, min, max } for LFO connection */
type FxNodes = {
  filter: Tone.Filter
  distortion: Tone.Distortion
  chorus: Tone.Chorus
  phaser: Tone.Phaser
  delay: Tone.PingPongDelay
  pitchShift: Tone.PitchShift
  reverb: Tone.Freeverb | Tone.Reverb
  analyser: Tone.Analyser
  [k: string]: any
}

function getTargetSignal(
  chain: FxNodes,
  target: string,
): { signal: Tone.Signal<any> | Tone.Param<any>; min: number; max: number } | null {
  switch (target) {
    case 'cutoff':
      return { signal: chain.filter.frequency, min: 200, max: 18000 }
    case 'resonance':
      return { signal: chain.filter.Q, min: 0, max: 20 }
    case 'drive':
      // Distortion.distortion is a number, not a signal — use wet instead
      return { signal: chain.distortion.wet, min: 0, max: 1 }
    case 'chorus':
      return { signal: chain.chorus.wet, min: 0, max: 1 }
    case 'phaser':
      return { signal: chain.phaser.wet, min: 0, max: 1 }
    case 'delay':
      return { signal: chain.delay.wet, min: 0, max: 1 }
    case 'shimmer':
      return { signal: chain.pitchShift.wet, min: 0, max: 1 }
    case 'reverbWet':
      return { signal: (chain.reverb as any).wet, min: 0, max: 1 }
    case 'vol':
      // Volume is tricky — modulate reverb wet as fallback
      return { signal: (chain.reverb as any).wet, min: 0, max: 1 }
    default:
      return null
  }
}

/**
 * Create an LFO with the given params. Does NOT connect yet.
 */
export function createLFO(params: LFOParams): Tone.LFO {
  const lfo = new Tone.LFO({
    frequency: params.lfoRate,
    min: 0,
    max: 1,
    type: params.lfoWave,
    amplitude: params.lfoDepth,
  })
  lfo.start()
  return lfo
}

/**
 * Connect LFO to target param in the FX chain.
 */
export function connectLFO(lfo: Tone.LFO, chain: FxNodes, target: string): void {
  const t = getTargetSignal(chain, target)
  if (!t) return
  lfo.min = t.min
  lfo.max = t.max
  try { lfo.connect(t.signal) } catch { /* noop */ }
}

/**
 * Disconnect LFO from all outputs.
 */
export function disconnectLFO(lfo: Tone.LFO): void {
  try { lfo.disconnect() } catch { /* noop */ }
}

/**
 * Update LFO params (rate, depth, wave). Does NOT handle target change.
 */
export function updateLFO(lfo: Tone.LFO, params: Partial<LFOParams>): void {
  if (params.lfoRate !== undefined) lfo.frequency.value = params.lfoRate
  if (params.lfoDepth !== undefined) lfo.amplitude.value = params.lfoDepth
  if (params.lfoWave !== undefined) lfo.type = params.lfoWave
}

/**
 * Dispose the LFO.
 */
export function disposeLFO(lfo: Tone.LFO): void {
  try { lfo.stop() } catch { /* noop */ }
  try { lfo.disconnect() } catch { /* noop */ }
  try { lfo.dispose() } catch { /* noop */ }
}
