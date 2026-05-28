// Synesthizer engine: image → chords via color-to-note mapping
// Based on https://github.com/hafaio/synesthizer

export type HSLC = { h: number; s: number; l: number; c: number }

export type ScanMode = 'ltr' | 'spiral' | 'diagonal' | 'random' | 'brush'
export type ScaleMode = 'chromatic' | 'auto' | 'major' | 'minor' | 'pentatonic' | 'blues'

export type Chord = {
  notes: string[]
  velocity: number
  duration: string
  color: string
  col: number
  row: number
  saturation: number
}

export type Patch = {
  meanR: number; meanG: number; meanB: number
  hslc: HSLC
  col: number; row: number
}

export type SynesthizerOpts = {
  cols: number
  rows: number
  maxNotes: number
  minWeight: number
  scanMode: ScanMode
  scaleMode: ScaleMode
}

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

const SCALES: Record<Exclude<ScaleMode, 'chromatic' | 'auto'>, number[]> = {
  major:       [0, 2, 4, 5, 7, 9, 11],
  minor:       [0, 2, 3, 5, 7, 8, 10],
  pentatonic:  [0, 2, 4, 7, 9],
  blues:       [0, 3, 5, 6, 7, 10],
}

export function rgb2hslc(r: number, g: number, b: number): HSLC {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1)
  const d = max - min
  const l = (max + min) / 2
  if (d === 0) return { h: 0, s: 0, l, c: 0 }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r1) h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60
  else if (max === g1) h = ((b1 - r1) / d + 2) * 60
  else h = ((r1 - g1) / d + 4) * 60
  const c = d
  return { h, s, l, c }
}

function snapToScale(noteIdx: number, scale: number[]): number {
  let best = scale[0], bestDist = 99
  for (const s of scale) {
    const dist = Math.min(Math.abs(noteIdx - s), 12 - Math.abs(noteIdx - s))
    if (dist < bestDist) { bestDist = dist; best = s }
  }
  return best
}

export function detectScale(patches: Patch[]): ScaleMode {
  if (patches.length === 0) return 'major'
  let sumH = 0, sumS = 0, count = 0
  for (const p of patches) {
    sumH += p.hslc.h; sumS += p.hslc.s; count++
  }
  const avgH = sumH / count
  const avgS = sumS / count
  if (avgS < 0.15) return 'pentatonic'
  if (avgH >= 0 && avgH < 60) return 'minor'
  if (avgH >= 60 && avgH < 180) return 'major'
  if (avgH >= 180 && avgH < 270) return 'blues'
  return 'minor'
}

export function hslc2note(h: number, l: number, scaleMode: ScaleMode, patches?: Patch[]): string {
  let noteIdx = Math.floor(h / 30) % 12
  if (scaleMode !== 'chromatic') {
    const resolvedScale = scaleMode === 'auto'
      ? SCALES[detectScale(patches ?? [])]
      : SCALES[scaleMode]
    noteIdx = snapToScale(noteIdx, resolvedScale)
  }
  const octave = Math.min(7, Math.max(1, Math.round(l * 6 + 1)))
  return `${NOTE_NAMES[noteIdx]}${octave}`
}

// Lightness → velocity (0..1): dark = soft, bright = loud
export function lightnessToVelocity(l: number): number {
  return Math.max(0.15, Math.min(1, l * 1.2))
}

// Saturation → duration: saturated = short staccato, desaturated = long legato
export function saturationToDuration(s: number): string {
  if (s > 0.7) return '8n'
  if (s > 0.4) return '4n'
  return '2n'
}

// Saturation → reverb wet (0..1): low saturation = more reverb
export function saturationToReverb(s: number): number {
  return Math.max(0, Math.min(1, 1 - s))
}

export function tempoFromColor(r: number, g: number, b: number, minBpm = 60, maxBpm = 200): number {
  const { h, l } = rgb2hslc(r, g, b)
  const noteIdx = Math.floor(h / 30) % 12
  const octave = Math.min(7, Math.max(1, Math.round(l * 6 + 1)))
  const keyNum = noteIdx + (octave - 1) * 12
  const t = keyNum / 71
  return Math.round(minBpm * Math.pow(maxBpm / minBpm, t))
}

export function extractGrid(imageData: ImageData, cols: number, rows: number): Patch[] {
  const { width, height, data } = imageData
  const pw = Math.floor(width / cols)
  const ph = Math.floor(height / rows)
  const patches: Patch[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0
      const x0 = c * pw, y0 = r * ph
      const x1 = Math.min(x0 + pw, width), y1 = Math.min(y0 + ph, height)
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
          count++
        }
      }
      if (count > 0) {
        const mR = Math.round(sumR / count), mG = Math.round(sumG / count), mB = Math.round(sumB / count)
        patches.push({ meanR: mR, meanG: mG, meanB: mB, hslc: rgb2hslc(mR, mG, mB), col: c, row: r })
      }
    }
  }
  return patches
}

// Scan ordering
function spiralOrder(cols: number, rows: number): [number, number][] {
  const result: [number, number][] = []
  let top = 0, bottom = rows - 1, left = 0, right = cols - 1
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) result.push([c, top])
    top++
    for (let r = top; r <= bottom; r++) result.push([right, r])
    right--
    if (top <= bottom) { for (let c = right; c >= left; c--) result.push([c, bottom]); bottom-- }
    if (left <= right) { for (let r = bottom; r >= top; r--) result.push([left, r]); top++ }
    left++
  }
  return result
}

function diagonalOrder(cols: number, rows: number): [number, number][] {
  const result: [number, number][] = []
  for (let d = 0; d < cols + rows - 1; d++) {
    const startRow = Math.max(0, d - cols + 1)
    const endRow = Math.min(d, rows - 1)
    for (let r = startRow; r <= endRow; r++) result.push([d - r, r])
  }
  return result
}

function randomOrder(cols: number, rows: number): [number, number][] {
  const result: [number, number][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) result.push([c, r])
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function applyScanOrder(patches: Patch[], scanMode: ScanMode, cols: number, rows: number): Patch[] {
  if (scanMode === 'ltr' || scanMode === 'brush') return patches
  const patchMap = new Map<string, Patch>()
  for (const p of patches) patchMap.set(`${p.col},${p.row}`, p)

  let order: [number, number][]
  if (scanMode === 'spiral') order = spiralOrder(cols, rows)
  else if (scanMode === 'diagonal') order = diagonalOrder(cols, rows)
  else order = randomOrder(cols, rows)

  return order.map(([c, r]) => patchMap.get(`${c},${r}`)).filter((p): p is Patch => !!p)
}

export function imageToChords(imageData: ImageData, opts: SynesthizerOpts): Chord[] {
  const { cols, rows, maxNotes, minWeight, scanMode, scaleMode } = opts
  const rawPatches = extractGrid(imageData, cols, rows)
  const patches = applyScanOrder(rawPatches, scanMode, cols, rows)

  return patches.map(p => {
    const { h, l, s } = p.hslc
    const note = hslc2note(h, l, scaleMode, rawPatches)
    const velocity = lightnessToVelocity(l)
    const duration = saturationToDuration(s)
    const color = `rgb(${p.meanR},${p.meanG},${p.meanB})`
    return { notes: [note], velocity, duration, color, col: p.col, row: p.row, saturation: s }
  }).filter(c => c.velocity >= minWeight)
    .map(c => ({ ...c, notes: c.notes.slice(0, maxNotes) }))
}

export function pixelToNote(imageData: ImageData, x: number, y: number, scaleMode: ScaleMode): Chord | null {
  const { width, data } = imageData
  const i = (Math.floor(y) * width + Math.floor(x)) * 4
  if (i < 0 || i >= data.length) return null
  const r = data[i], g = data[i + 1], b = data[i + 2]
  const hslc = rgb2hslc(r, g, b)
  const note = hslc2note(hslc.h, hslc.l, scaleMode)
  return {
    notes: [note], velocity: lightnessToVelocity(hslc.l),
    duration: saturationToDuration(hslc.s), color: `rgb(${r},${g},${b})`,
    col: 0, row: 0, saturation: hslc.s,
  }
}

export function imageMeanColor(imageData: ImageData): { r: number; g: number; b: number } {
  const { data } = imageData
  let sumR = 0, sumG = 0, sumB = 0
  const count = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2]
  }
  return { r: Math.round(sumR / count), g: Math.round(sumG / count), b: Math.round(sumB / count) }
}
