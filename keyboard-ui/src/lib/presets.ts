import { type Geo } from './geo'

export type PanelVisibility = {
  keys: boolean
  mixer: boolean
  soundboard: boolean
  obs: boolean
  briefing: boolean
  ytchat: boolean
  timer: boolean
  drone: boolean
  paul: boolean
  synth: boolean
  exporter: boolean
  converter: boolean
  looplab: boolean
  session: boolean
}

export type Preset = {
  id: string
  name: string
  visibility: PanelVisibility
  positions: Record<string, Geo>
  scale: number
  savedAt: number
}

const GEO_KEYS = ['keyboard', 'config', 'mixer', 'soundboard', 'obs', 'briefing', 'ytchat', 'timer', 'drone', 'paul', 'synth', 'exporter', 'converter', 'looplab', 'session'] as const

const STORAGE_KEY = 'panel-presets'
const MAX_PRESETS = 8

export function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export function capturePositions(): Record<string, Geo> {
  const positions: Record<string, Geo> = {}
  for (const key of GEO_KEYS) {
    const item = localStorage.getItem(`panel-geo-${key}`)
    if (item) {
      try { positions[key] = JSON.parse(item) } catch{ /* noop */ }
    }
  }
  return positions
}

export function autoName(vis: PanelVisibility): string {
  const labels: string[] = []
  if (vis.obs) labels.push('OBS')
  if (vis.ytchat) labels.push('Chat')
  if (vis.timer) labels.push('Timer')
  if (vis.briefing) labels.push('Briefing')
  if (vis.mixer) labels.push('Mixer')
  if (vis.soundboard) labels.push('Board')
  if (vis.drone) labels.push('Drone')
  if (vis.paul) labels.push('Paul')
  if (vis.synth) labels.push('Synth')
  if (vis.exporter) labels.push('Export')
  if (vis.converter) labels.push('Conv')
  if (vis.looplab) labels.push('Loop')
  if (vis.session) labels.push('Session')
  if (vis.keys) labels.push('Keys')
  if (labels.length === 0) return 'Empty'
  if (labels.length <= 2) return labels.join(' + ')
  return labels.slice(0, 2).join('+') + ` +${labels.length - 2}`
}

export function savePreset(id: string | null, name: string, vis: PanelVisibility, scale: number): Preset {
  const presets = loadPresets()
  const preset: Preset = {
    id: id ?? `preset-${Date.now()}`,
    name,
    visibility: vis,
    positions: capturePositions(),
    scale,
    savedAt: Date.now(),
  }
  const idx = presets.findIndex(p => p.id === preset.id)
  if (idx >= 0) {
    presets[idx] = preset
  } else {
    presets.push(preset)
    if (presets.length > MAX_PRESETS) presets.shift()
  }
  savePresets(presets)
  return preset
}

export function deletePreset(id: string) {
  savePresets(loadPresets().filter(p => p.id !== id))
}

export function applyPositions(positions: Record<string, Geo>) {
  for (const [key, geo] of Object.entries(positions)) {
    localStorage.setItem(`panel-geo-${key}`, JSON.stringify(geo))
  }
}
