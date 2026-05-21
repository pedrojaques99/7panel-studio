import type { AudioBands } from '../visualizer-engine'

export type BandSource = 'volume' | 'bass' | 'mid' | 'high' | 'subBass' | 'lowMid' | 'highMid'

interface ModRule {
  band: BandSource
  strength: number // 0-1: how much the band modulates the param
}

const DEFAULT_MOD: ModRule = { band: 'volume', strength: 0.3 }

const PARAM_MOD_MAP: Record<string, ModRule> = {
  // Global
  sensitivity: { band: 'volume', strength: 0.1 },
  hueShift:    { band: 'mid', strength: 0.4 },
  smoothing:   { band: 'volume', strength: 0.1 },
  barSpace:    { band: 'bass', strength: 0.15 },
  spinSpeed:   { band: 'bass', strength: 0.5 },
  lineWidth:   { band: 'bass', strength: 0.3 },
  fillAlpha:   { band: 'volume', strength: 0.2 },
  waveformMix: { band: 'volume', strength: 0.1 },

  // Shader
  speed:       { band: 'bass', strength: 0.3 },
  zoom:        { band: 'bass', strength: 0.2 },
  colorShift:  { band: 'mid', strength: 0.4 },
  reactivity:  { band: 'volume', strength: 0.2 },
  bassWeight:  { band: 'bass', strength: 0.3 },
  midWeight:   { band: 'mid', strength: 0.3 },
  highWeight:  { band: 'high', strength: 0.3 },
  distortion:  { band: 'bass', strength: 0.35 },
  glow:        { band: 'volume', strength: 0.4 },
  complexity:  { band: 'highMid', strength: 0.15 },

  // Particle
  branching:   { band: 'mid', strength: 0.3 },
  tension:     { band: 'bass', strength: 0.2 },
  maxParticles:{ band: 'volume', strength: 0.2 },
  lifespan:    { band: 'volume', strength: 0.2 },
  trailLen:    { band: 'bass', strength: 0.3 },
  fade:        { band: 'high', strength: 0.2 },

  // Scope
  freq:        { band: 'mid', strength: 0.3 },
  trail:       { band: 'bass', strength: 0.2 },
  history:     { band: 'volume', strength: 0.2 },
  phaseSpeed:  { band: 'high', strength: 0.3 },

  // Rings
  ringSpeed:   { band: 'bass', strength: 0.4 },
  beatThresh:  { band: 'volume', strength: 0.15 },
  maxRings:    { band: 'volume', strength: 0.2 },
  arcSpeed:    { band: 'mid', strength: 0.3 },

  // Grid
  cols:        { band: 'high', strength: 0.1 },
  rows:        { band: 'mid', strength: 0.1 },
  scanSpeed:   { band: 'bass', strength: 0.4 },
  glowThresh:  { band: 'volume', strength: 0.3 },

  // Letters
  spawnBase:   { band: 'bass', strength: 0.3 },
  glyphSize:   { band: 'volume', strength: 0.2 },
  kanjiRatio:  { band: 'high', strength: 0.15 },
}

function getBandValue(bands: AudioBands, band: BandSource): number {
  switch (band) {
    case 'volume': return bands.volume
    case 'bass': return bands.bass
    case 'mid': return bands.mid
    case 'high': return bands.high
    case 'subBass': return bands.subBass
    case 'lowMid': return bands.lowMid
    case 'highMid': return bands.highMid
  }
}

export function modulateValue(key: string, base: number, bands: AudioBands, reactiveOff: Set<string>): number {
  if (reactiveOff.has(key)) return base
  const rule = PARAM_MOD_MAP[key] || DEFAULT_MOD
  const bandVal = getBandValue(bands, rule.band)
  return base * (1 + bandVal * rule.strength)
}

export function modulateRecord<T extends Record<string, number>>(
  params: T,
  bands: AudioBands,
  reactiveOff: Set<string>,
  prefix = '',
): T {
  const out = { ...params }
  for (const key in out) {
    if (typeof out[key] === 'number') {
      (out as Record<string, number>)[key] = modulateValue(prefix + key, out[key] as number, bands, reactiveOff)
    }
  }
  return out
}

export function isReactive(key: string, reactiveOff: Set<string>): boolean {
  return !reactiveOff.has(key)
}
