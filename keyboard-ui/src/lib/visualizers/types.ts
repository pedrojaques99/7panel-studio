import type { AudioBands } from '../visualizer-engine'

export type VisMode =
  | 'bars' | 'led' | 'radial' | 'line' | 'mirror'
  | 'particles'
  | 'scope' | 'smoke' | 'rings' | 'grid' | 'letters'
  | 'plasma' | 'voronoi' | 'warp' | 'fractal' | 'neon'

export type EngineType = 'audiomotion' | 'custom' | 'shader'

export interface VisModeEntry {
  id: VisMode
  label: string
  engine: EngineType
}

export const VIS_MODES: VisModeEntry[] = [
  { id: 'bars',      label: 'Bars',      engine: 'audiomotion' },
  { id: 'led',       label: 'LED',       engine: 'audiomotion' },
  { id: 'radial',    label: 'Radial',    engine: 'audiomotion' },
  { id: 'line',      label: 'Line',      engine: 'audiomotion' },
  { id: 'mirror',    label: 'Mirror',    engine: 'audiomotion' },
  { id: 'particles', label: 'Particles', engine: 'custom' },
  { id: 'scope',     label: 'Scope',     engine: 'custom' },
  // { id: 'smoke',     label: 'Smoke',     engine: 'custom' },
  { id: 'rings',     label: 'Rings',     engine: 'custom' },
  { id: 'grid',      label: 'Grid',      engine: 'custom' },
  // { id: 'letters',   label: 'Letters',   engine: 'custom' },
  { id: 'plasma',    label: 'Plasma',    engine: 'shader' },
  { id: 'voronoi',   label: 'Voronoi',   engine: 'shader' },
  { id: 'warp',      label: 'Warp',      engine: 'shader' },
  { id: 'fractal',   label: 'Fractal',   engine: 'shader' },
  { id: 'neon',      label: 'Neon',      engine: 'shader' },
]

export interface VisEngine {
  reset(): void
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, bands: AudioBands, params?: Record<string, number>): void
}

export interface KnobDef {
  key: string
  label: string
  min: number
  max: number
  step?: number
  default: number
}

export const KNOB_REGISTRY: Partial<Record<VisMode, KnobDef[]>> = {
  scope: [
    { key: 'freq',       label: 'FREQ',  min: 1,    max: 10,   default: 2 },
    { key: 'glow',       label: 'GLOW',  min: 0,    max: 30,   default: 8 },
    { key: 'trail',      label: 'TRAIL', min: 0.02, max: 0.5,  default: 0.15 },
    { key: 'history',    label: 'HIST',  min: 1,    max: 20,   step: 1, default: 8 },
    { key: 'lineWidth',  label: 'WIDTH', min: 0.5,  max: 5,    default: 1.5 },
    { key: 'phaseSpeed', label: 'PHASE', min: 0.005, max: 0.1, default: 0.02 },
  ],
  smoke: [
    { key: 'spawnRate',  label: 'SPAWN', min: 1,   max: 8,    step: 1, default: 2 },
    { key: 'size',       label: 'SIZE',  min: 2,   max: 30,   default: 8 },
    { key: 'rise',       label: 'RISE',  min: -3,  max: 0,    default: -0.5 },
    { key: 'turbulence', label: 'TURB',  min: 0.001, max: 0.02, default: 0.005 },
    { key: 'maxPart',    label: 'MAX',   min: 100, max: 2000, step: 1, default: 500 },
  ],
  rings: [
    { key: 'ringSpeed',  label: 'SPEED', min: 0.5, max: 8,   default: 2 },
    { key: 'beatThresh', label: 'BEAT',  min: 0.1, max: 0.9, default: 0.5 },
    { key: 'glow',       label: 'GLOW',  min: 0,   max: 20,  default: 6 },
    { key: 'maxRings',   label: 'MAX',   min: 10,  max: 100, step: 1, default: 40 },
    { key: 'arcSpeed',   label: 'ARC',   min: 0.1, max: 2,   default: 0.5 },
  ],
  grid: [
    { key: 'cols',       label: 'COLS',  min: 8,  max: 64,  step: 1, default: 32 },
    { key: 'rows',       label: 'ROWS',  min: 4,  max: 32,  step: 1, default: 14 },
    { key: 'scanSpeed',  label: 'SCAN',  min: 20, max: 200, default: 80 },
    { key: 'glowThresh', label: 'GLOW',  min: 0.1, max: 0.9, default: 0.5 },
  ],
  letters: [
    { key: 'spawnBase',  label: 'SPAWN', min: 1,   max: 8,   step: 1, default: 1 },
    { key: 'glyphSize',  label: 'SIZE',  min: 4,   max: 24,  default: 8 },
    { key: 'speed',      label: 'SPEED', min: 0.1, max: 3,   default: 0.5 },
    { key: 'kanjiRatio', label: 'KANJI', min: 0,   max: 1,   default: 0.3 },
    { key: 'maxGlyphs',  label: 'MAX',   min: 50,  max: 1000, step: 1, default: 300 },
  ],
}
