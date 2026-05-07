import type { VisMode } from './types'

type AMotionOpts = Record<string, unknown>

const CRT_GREEN: [string, { colorStops: { color: string; pos: number }[] }] = [
  'crt-green',
  { colorStops: [
    { color: 'rgba(20, 180, 60, 0.9)', pos: 0 },
    { color: 'rgba(80, 255, 120, 1)', pos: 0.5 },
    { color: 'rgba(160, 255, 200, 1)', pos: 1 },
  ]},
]

const CRT_WARM: [string, { colorStops: { color: string; pos: number }[] }] = [
  'crt-warm',
  { colorStops: [
    { color: 'rgba(200, 80, 40, 0.8)', pos: 0 },
    { color: 'rgba(255, 160, 40, 1)', pos: 0.4 },
    { color: 'rgba(255, 240, 120, 1)', pos: 1 },
  ]},
]

const base: AMotionOpts = {
  bgAlpha: 0,
  loRes: false,
  overlay: true,
  showPeaks: true,
  showScaleX: false,
  showScaleY: false,
  smoothing: 0.7,
  weightingFilter: 'D',
}

export const AUDIOMOTION_PRESETS: Partial<Record<VisMode, AMotionOpts>> = {
  bars: {
    ...base,
    mode: 5,
    barSpace: 0.2,
    ledBars: false,
    radial: false,
    mirror: 0,
  },
  led: {
    ...base,
    mode: 3,
    ledBars: true,
    radial: false,
    mirror: 0,
  },
  radial: {
    ...base,
    mode: 5,
    radial: true,
    spinSpeed: 1,
    mirror: 0,
    ledBars: false,
  },
  line: {
    ...base,
    mode: 10,
    lineWidth: 2,
    fillAlpha: 0.3,
    radial: false,
    mirror: 0,
    ledBars: false,
  },
  mirror: {
    ...base,
    mode: 5,
    mirror: 1,
    barSpace: 0.15,
    radial: false,
    ledBars: false,
  },
}

export const CRT_GRADIENTS = { green: CRT_GREEN, warm: CRT_WARM }
