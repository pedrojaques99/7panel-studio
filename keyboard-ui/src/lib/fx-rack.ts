import * as Tone from 'tone'
import { getMasterCaptureNode } from './audio-context'

/* ── FX Params — single source of truth ─────────────────────────── */

export type FxParams = {
  drive: number       // distortion 0..1
  bite: number        // chebyshev order 1..50
  cutoff: number      // filter Hz 400..18000
  resonance: number   // filter Q 0..20
  crush: number       // BitCrusher bits 4..12 (12 = transparent)
  chorus: number      // wet 0..1
  phaser: number      // wet 0..1
  delay: number       // wet 0..1
  delayTime: number   // seconds 0.05..1.5
  delayFb: number     // feedback 0..0.95
  shimmer: number     // pitch shift +12st wet 0..1
  reverbWet: number   // 0..1
  reverbDecay: number // seconds 0.5..30
  denoise: number     // gate threshold 0..1
  vol: number         // 0..1 linear
}

export const FX_DEFAULTS: FxParams = {
  drive: 0.15, bite: 4, cutoff: 8000, resonance: 1.5,
  crush: 12, chorus: 0, phaser: 0, delay: 0, delayTime: 0.4, delayFb: 0.45,
  shimmer: 0, reverbWet: 0.55, reverbDecay: 8, denoise: 0, vol: 0.7,
}

/* ── FX Chain — Tone.js node graph ──────────────────────────────── */

export type FxChain = {
  input: Tone.Gain
  gate: Tone.Gate
  bitcrusher: Tone.BitCrusher
  distortion: Tone.Distortion
  chebyshev: Tone.Chebyshev
  filter: Tone.Filter
  chorus: Tone.Chorus
  phaser: Tone.Phaser
  delay: Tone.PingPongDelay
  pitchShift: Tone.PitchShift
  reverb: Tone.Freeverb
  analyser: Tone.Analyser
  outputGain: Tone.Gain
}

function crushWet(bits: number): number {
  return bits >= 12 ? 0 : 1
}

export function createFxChain(params: FxParams, captureDest?: MediaStreamAudioDestinationNode): FxChain {
  const p = params

  const input = new Tone.Gain(1)
  const gate = new Tone.Gate(p.denoise > 0.01 ? -80 + p.denoise * 50 : -100)
  const bitcrusher = new Tone.BitCrusher(Math.max(4, Math.round(p.crush)))
  bitcrusher.wet.value = crushWet(p.crush)
  const distortion = new Tone.Distortion({ distortion: p.drive, oversample: 'none', wet: 1 })
  const chebyshev = new Tone.Chebyshev({ order: Math.max(1, Math.round(p.bite)), oversample: 'none', wet: 0.6 })
  const filter = new Tone.Filter({ frequency: p.cutoff, type: 'lowpass', Q: p.resonance })
  const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 4, depth: 0.7, feedback: 0.15, wet: p.chorus }).start()
  const phaser = new Tone.Phaser({ frequency: 0.3, octaves: 2, baseFrequency: 350, wet: p.phaser })
  const delay = new Tone.PingPongDelay({ delayTime: p.delayTime, feedback: p.delayFb, wet: p.delay })
  const pitchShift = new Tone.PitchShift({ pitch: 12, windowSize: 0.45, delayTime: 0.25, feedback: 0.3, wet: p.shimmer })
  const reverb = new Tone.Freeverb({ roomSize: Math.min(0.98, p.reverbDecay / 30), dampening: 4000, wet: p.reverbWet })
  const analyser = new Tone.Analyser('waveform', 1024)
  const outputGain = new Tone.Gain(Tone.gainToDb(p.vol) > -Infinity ? p.vol : 0)

  // Wire: input → gate → crush → drive → bite → filter → chorus → phaser → delay → shimmer → reverb → analyser → gain → master
  outputGain.connect(getMasterCaptureNode())
  input.chain(gate, bitcrusher, distortion, chebyshev, filter, chorus, phaser, delay, pitchShift, reverb, analyser, outputGain)

  if (captureDest) analyser.connect(captureDest)

  return { input, gate, bitcrusher, distortion, chebyshev, filter, chorus, phaser, delay, pitchShift, reverb, analyser, outputGain }
}

export function updateFxChain(chain: FxChain, patch: Partial<FxParams>, rampTime = 0.05) {
  if (patch.drive !== undefined) chain.distortion.distortion = patch.drive
  if (patch.bite !== undefined) chain.chebyshev.order = Math.max(1, Math.round(patch.bite))
  if (patch.cutoff !== undefined) chain.filter.frequency.rampTo(patch.cutoff, rampTime)
  if (patch.resonance !== undefined) chain.filter.Q.value = patch.resonance
  if (patch.crush !== undefined) {
    const b = Math.max(4, Math.round(patch.crush))
    chain.bitcrusher.bits.value = b
    chain.bitcrusher.wet.rampTo(crushWet(b), rampTime)
  }
  if (patch.chorus !== undefined) chain.chorus.wet.rampTo(patch.chorus, rampTime)
  if (patch.phaser !== undefined) chain.phaser.wet.rampTo(patch.phaser, rampTime)
  if (patch.delay !== undefined) chain.delay.wet.rampTo(patch.delay, rampTime)
  if (patch.delayTime !== undefined) chain.delay.delayTime.rampTo(patch.delayTime, rampTime)
  if (patch.delayFb !== undefined) chain.delay.feedback.rampTo(patch.delayFb, rampTime)
  if (patch.shimmer !== undefined) chain.pitchShift.wet.rampTo(patch.shimmer, rampTime)
  if (patch.reverbWet !== undefined) chain.reverb.wet.rampTo(patch.reverbWet, rampTime)
  if (patch.reverbDecay !== undefined) chain.reverb.roomSize.value = Math.min(0.98, patch.reverbDecay / 30)
  if (patch.denoise !== undefined) chain.gate.threshold = patch.denoise > 0.01 ? -80 + patch.denoise * 50 : -100
  if (patch.vol !== undefined) chain.outputGain.gain.rampTo(patch.vol, rampTime)
}

export function disposeFxChain(chain: FxChain) {
  const nodes = [chain.input, chain.gate, chain.bitcrusher, chain.distortion, chain.chebyshev, chain.filter, chain.chorus, chain.phaser, chain.delay, chain.pitchShift, chain.reverb, chain.analyser, chain.outputGain]
  for (const n of nodes) {
    try { n.dispose() } catch { /* noop */ }
  }
}

/* ── Presets ─────────────────────────────────────────────────────── */

export type FxPreset = {
  id: string
  name: string
  fx: Partial<FxParams>
  factory?: boolean
}

export const FACTORY_FX_PRESETS: FxPreset[] = [
  { id: 'fx-clean',      name: 'Clean',          factory: true, fx: { ...FX_DEFAULTS } },
  { id: 'fx-warm',       name: 'Warm Pad',       factory: true, fx: { drive: 0.05, bite: 2, cutoff: 4500, resonance: 1.0, reverbWet: 0.7, reverbDecay: 12 } },
  { id: 'fx-dark',       name: 'Dark Drone',     factory: true, fx: { drive: 0.08, bite: 3, cutoff: 1400, resonance: 4, reverbWet: 0.65, reverbDecay: 18 } },
  { id: 'fx-cathedral',  name: 'Cathedral',      factory: true, fx: { drive: 0.05, bite: 2, cutoff: 6500, resonance: 0.8, reverbWet: 0.95, reverbDecay: 28 } },
  { id: 'fx-buzz',       name: 'Buzz Lead',      factory: true, fx: { drive: 0.7, bite: 18, cutoff: 3200, resonance: 8, reverbWet: 0.25, reverbDecay: 4 } },
  { id: 'fx-silenthill',  name: 'Silent Hill Fog', factory: true, fx: { drive: 0.18, bite: 3, cutoff: 2200, resonance: 3, reverbWet: 0.85, reverbDecay: 22, crush: 8, chorus: 0.45, phaser: 0.55, delay: 0.55, delayTime: 0.55, delayFb: 0.6 } },
  { id: 'fx-ps2dream',   name: 'PS2 Dream Lab',  factory: true, fx: { drive: 0.12, bite: 2, cutoff: 5500, resonance: 1.5, reverbWet: 0.7, reverbDecay: 14, crush: 6, chorus: 0.65, phaser: 0.3, delay: 0.4, delayTime: 0.32, delayFb: 0.5 } },
  { id: 'fx-aether',     name: 'Aether',         factory: true, fx: { drive: 0.05, bite: 2, cutoff: 9500, resonance: 1, reverbWet: 0.95, reverbDecay: 28, chorus: 0.7, phaser: 0.4, delay: 0.55, delayTime: 0.85, delayFb: 0.55 } },
  { id: 'fx-tape',       name: 'Tape Memory',    factory: true, fx: { drive: 0.22, bite: 5, cutoff: 4200, resonance: 2, reverbWet: 0.6, reverbDecay: 10, crush: 7, chorus: 0.5, phaser: 0.2, delay: 0.45, delayTime: 0.42, delayFb: 0.55 } },
  { id: 'fx-naturefog',  name: 'Nature Fog',     factory: true, fx: { drive: 0.08, bite: 2, cutoff: 3500, resonance: 1.5, reverbWet: 0.8, reverbDecay: 24, chorus: 0.55, phaser: 0.6, delay: 0.3, delayTime: 0.7, delayFb: 0.5 } },
]

export function resolveFxParams(partial: Partial<FxParams>): FxParams {
  return { ...FX_DEFAULTS, ...partial }
}

/* ── Generative drift ────────────────────────────────────────────── */

export function driftFxParams(prev: FxParams, enabled: Set<keyof FxParams>): FxParams {
  const nudge = (k: keyof FxParams, v: number, lo: number, hi: number, strength = 0.04) => {
    if (!enabled.has(k)) return v
    const d = (Math.random() - 0.5) * 2 * strength * (hi - lo)
    return Math.max(lo, Math.min(hi, v + d))
  }
  const nudgeLog = (k: keyof FxParams, v: number, lo: number, hi: number, strength = 0.04) => {
    if (!enabled.has(k)) return v
    const logV = Math.log(v)
    const d = (Math.random() - 0.5) * 2 * strength * (Math.log(hi) - Math.log(lo))
    return Math.max(lo, Math.min(hi, Math.exp(logV + d)))
  }

  return {
    drive: nudge('drive', prev.drive, 0, 0.5, 0.03),
    bite: Math.round(nudge('bite', prev.bite, 1, 18, 0.05)),
    cutoff: nudgeLog('cutoff', prev.cutoff, 400, 15000, 0.02),
    resonance: nudge('resonance', prev.resonance, 0, 8, 0.03),
    crush: prev.crush < 12 ? Math.round(nudge('crush', prev.crush, 4, 10, 0.03)) : 12,
    chorus: prev.chorus > 0 ? nudge('chorus', prev.chorus, 0.05, 0.85, 0.03) : 0,
    phaser: prev.phaser > 0 ? nudge('phaser', prev.phaser, 0.05, 0.7, 0.03) : 0,
    delay: prev.delay > 0 ? nudge('delay', prev.delay, 0.05, 0.6, 0.025) : 0,
    delayTime: prev.delay > 0 ? nudgeLog('delayTime', prev.delayTime, 0.1, 1.2, 0.02) : prev.delayTime,
    delayFb: prev.delay > 0 ? nudge('delayFb', prev.delayFb, 0.15, 0.7, 0.02) : prev.delayFb,
    shimmer: prev.shimmer > 0 ? nudge('shimmer', prev.shimmer, 0.05, 0.85, 0.03) : 0,
    reverbWet: nudge('reverbWet', prev.reverbWet, 0.1, 0.9, 0.03),
    reverbDecay: nudge('reverbDecay', prev.reverbDecay, 2, 24, 0.025),
    denoise: prev.denoise > 0 ? nudge('denoise', prev.denoise, 0.05, 0.8, 0.03) : 0,
    vol: prev.vol,
  }
}

export function randomizeFxParams(): FxParams {
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const rndLog = (a: number, b: number) => Math.exp(rnd(Math.log(a), Math.log(b)))
  return {
    drive: rnd(0, 0.55),
    bite: Math.round(rnd(1, 18)),
    cutoff: rndLog(400, 15000),
    resonance: rnd(0, 8),
    crush: Math.random() < 0.35 ? Math.round(rnd(4, 8)) : 12,
    chorus: Math.random() < 0.55 ? rnd(0.3, 0.85) : 0,
    phaser: Math.random() < 0.45 ? rnd(0.25, 0.7) : 0,
    delay: Math.random() < 0.6 ? rnd(0.2, 0.65) : 0,
    delayTime: rndLog(0.1, 1.2),
    delayFb: rnd(0.25, 0.7),
    shimmer: Math.random() < 0.4 ? rnd(0.2, 0.85) : 0,
    reverbWet: rnd(0.3, 0.9),
    reverbDecay: rnd(3, 22),
    denoise: Math.random() < 0.3 ? rnd(0.2, 0.6) : 0,
    vol: rnd(0.5, 0.85),
  }
}
