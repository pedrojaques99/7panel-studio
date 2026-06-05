const STORAGE_KEY = 'analogbrain-gemini-key'
const MODEL_KEY = 'analogbrain-gemini-model'

const ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined

export type GeminiModel = 'gemini-3.5-flash' | 'gemini-3.1-pro-preview' | 'gemini-2.5-flash'

export type ChatMessage = {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEY) || ENV_KEY || ''
}

export function hasEnvKey(): boolean {
  return !!ENV_KEY
}

export function setApiKey(key: string) {
  localStorage.setItem(STORAGE_KEY, key)
}

const VALID_MODELS: GeminiModel[] = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash']

export function getModel(): GeminiModel {
  const saved = localStorage.getItem(MODEL_KEY) as GeminiModel
  if (saved && VALID_MODELS.includes(saved)) return saved
  return 'gemini-2.5-flash'
}

export function setModel(m: GeminiModel) {
  localStorage.setItem(MODEL_KEY, m)
}

const CODE_CHARS = /[().\[\]{};=$`'"*+<>|&!~^%:]/

function stripComments(line: string): string {
  let inStr: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === inStr) inStr = null
    } else {
      if (ch === '"' || ch === "'" || ch === '`') inStr = ch
      else if (ch === '/' && line[i + 1] === '/') return line.slice(0, i).trimEnd()
      else if (ch === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2)
        if (end >= 0) { line = line.slice(0, i) + line.slice(end + 2); i-- }
        else return line.slice(0, i).trimEnd()
      }
    }
  }
  return line
}

function isCodeLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (/^\s*\./.test(t)) return true
  if (/^\$:/.test(t)) return true
  if (/^[)\]},]+$/.test(t)) return true
  if (CODE_CHARS.test(t)) return true
  return false
}

function balanceParens(code: string): string {
  let parenDepth = 0
  let inStr: string | null = null
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === inStr) inStr = null
    } else {
      if (ch === '"' || ch === "'" || ch === '`') inStr = ch
      else if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth--
    }
  }
  if (parenDepth > 0) code += ')'.repeat(parenDepth)
  return code
}

function fixMissingCommas(code: string): string {
  const lines = code.split('\n')
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i].trimEnd()
    const next = lines[i + 1]?.trim()
    if (next && /\)\s*$/.test(cur) && !cur.endsWith(',') &&
      /^(s\(|note\(|stack\(|seq\(|cat\(|n\(|\$:)/.test(next)) {
      result.push(cur + ',')
    } else {
      result.push(cur)
    }
  }
  return result.join('\n')
}

const NON_EXISTENT_FNS = /\b(osc|oscillator|lfo|synth|Tone|SynthDef|Pbind|play|instrument|new\s+Synth)\s*\(/g

function replaceInvalidFunctions(code: string): string {
  return code.replace(NON_EXISTENT_FNS, (match, fn) => {
    if (fn === 'osc' || fn === 'oscillator' || fn === 'lfo') return 'sine.range('
    return match
  })
}

function joinDollarLines(lines: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (/^\$:\s*$/.test(t) && i + 1 < lines.length) {
      result.push('$: ' + lines[i + 1].trim())
      i++
    } else {
      result.push(lines[i])
    }
  }
  return result
}

function fixDollarSyntax(code: string): string {
  return code.split('\n').map(l => {
    const t = l.trim()
    if (/^\$:/.test(t)) return t.replace(/,\s*$/, '')
    return l
  }).join('\n')
}

function sanitizeStrudelCode(code: string): string {
  let lines = code.split('\n')
    .map(l => stripComments(l))
    .filter(l => isCodeLine(l))

  lines = joinDollarLines(lines)

  let result = lines.join('\n').trim()
  result = replaceInvalidFunctions(result)
  result = fixDollarSyntax(result)
  result = fixMissingCommas(result)
  result = balanceParens(result)
  return result
}

export function extractStrudelCode(text: string): string | null {
  const fenced = text.match(/```(?:strudel|javascript|js)?\s*\n([\s\S]*?)```/)
  if (fenced) {
    const cleaned = sanitizeStrudelCode(fenced[1])
    return cleaned || null
  }

  const lines = text.split('\n')
    .map(l => stripComments(l))
    .filter(l => {
      const t = l.trim()
      if (!t) return false
      return (
        /^\$:/.test(t) || /^\s*\./.test(t) || /^[)\]},]+$/.test(t) ||
        /\b(s|note|stack|seq|cat|n|sound)\s*\(/.test(t)
      )
    })

  if (lines.length >= 2) {
    const joined = joinDollarLines(lines)
    let result = joined.join('\n')
    result = replaceInvalidFunctions(result)
    result = fixDollarSyntax(result)
    result = fixMissingCommas(result)
    result = balanceParens(result)
    return result
  }
  return null
}

const SYSTEM_PROMPT = `You are AnalogBrain, a Strudel live-coding music AI. You output ONLY valid Strudel code.

## OUTPUT FORMAT
- Wrap code in \`\`\`strudel blocks. The code MUST be eval()-safe JavaScript.
- ZERO comments (no // or /* */), ZERO English prose inside code blocks.
- Every ( must have a matching ). In stack(), separate args with commas.
- Keep code under 30 lines.
- Use stack() to layer multiple patterns. Each pattern is one argument.

## CONSTRUCTORS
stack(...pats), cat(...pats), seq(...pats), fastcat(...pats), slowcat(...pats), sequence(...pats), silence, pure(v)

## SOUNDS (use with s() or .s())
EmuSP12 drums (bare names): bd, sd, hh, oh, cp, rim, cr, rd, cb, ht, mt, lt, perc
Tidal drum machines (prefix_sound): RolandTR808_bd, RolandTR808_sd, RolandTR808_hh, RolandTR909_bd, RolandTR909_sd, RolandTR909_hh, LinnDrum_bd, etc.
Piano: piano
VCSL orchestral: bassoon, clarinet, oboe, sax, harmonica, timpani, snare_modern, recorder_alto, didgeridoo, pipeorgan_loud
Synths (use with .note()): sine, triangle, square, sawtooth, supersaw, pulse

## SIGNALS (continuous 0..1 patterns for modulation — NOT sound generators)
sine, cosine, saw, tri, rand, perlin, isaw
Usage: signal.slow(speed).range(min, max)
Example: .lpf(sine.slow(0.1).range(500, 5000))

## METHODS — TEMPO
.fast(n), .slow(n), .early(n), .late(n), .rev(), .palindrome(), .ply(n)

## METHODS — STRUCTURE
.sometimes(fn), .often(fn), .rarely(fn), .someCycles(fn), .off(t, fn), .echo(times, time, feedback), .superimpose(...fns), .layer(...fns), .mask(pat), .struct(pat), .euclid(pulses, steps), .degradeBy(n), .degrade(), .linger(t), .chop(n), .striate(n), .loopAt(n), .every(n, fn) — EXACTLY 2 args: .every(4, x => x.rev())

## METHODS — SOUND
.s(name), .note(pat), .n(pat), .gain(0-1), .pan(-1..1), .speed(rate), .cut(group), .orbit(n)

## METHODS — ENVELOPE
.attack(s), .decay(s), .sustain(0-1), .release(s)

## METHODS — FILTER
.lpf(hz), .hpf(hz), .bpf(hz), .lpq(q), .vowel(v)

## METHODS — FX
.delay(wet), .delaytime(t), .delayfeedback(fb), .room(size), .size(decay), .crush(bits), .distort(amt), .shape(amt), .phaser(depth)

## METHODS — VALUE
.add(n), .sub(n), .mul(n), .range(min, max), .rangex(min, max), .segment(n)

## METHODS — SCALE
.scale(name), .scaleTranspose(n), .transpose(n)

## MINI-NOTATION (inside strings)
"bd sd hh" — sequence, "bd*4" — repeat, "[bd sd] hh" — group, "~ bd" — rest, "<bd sd>" — alternate per cycle, "bd(3,8)" — euclidean

## FORBIDDEN — do NOT exist:
osc(), oscillator(), lfo(), synth(), Tone., new Synth, SynthDef, Pbind, play(), instrument()

## EXAMPLE: Ambient
\`\`\`strudel
stack(
  s("pad").note("<c2 eb2 g2 bb2>").attack(2).release(8).room(0.8).size(40).lpf(sine.slow(0.02).range(400, 2000)).gain(0.6),
  s("supersaw").note("<c3 eb3 g3>").attack(1).release(12).room(0.6).gain(0.35).lpf(tri.slow(0.03).range(800, 3500)).pan(sine.slow(0.08).range(-0.7, 0.7)),
  s("sine").note("<g4 c5>").attack(0.5).release(8).delay(0.7).delaytime(0.5).delayfeedback(0.7).room(0.9).gain(0.3)
)
\`\`\`

## EXAMPLE: Techno
\`\`\`strudel
stack(
  s("bd*4").gain(0.9),
  s("~ cp ~ cp"),
  s("hh*8").gain(sine.slow(0.25).range(0.3, 0.7)).pan(rand.range(-0.5, 0.5)),
  note("c2 c2 eb2 c2").s("sawtooth").lpf(saw.slow(0.5).range(200, 3000)).gain(0.5).decay(0.15).sustain(0)
)
\`\`\`

## EXAMPLE: Lo-fi
\`\`\`strudel
stack(
  s("bd ~ bd ~, hh*8").gain(0.7),
  note("< [e3 g3 b3] [c3 e3 a3] [d3 f3 a3] [g2 b2 d3] >").s("piano").slow(2).room(0.5).gain(0.5).lpf(2000),
  note("< e2 c2 d2 g1 >").s("sawtooth").slow(2).gain(0.6).lpf(800).decay(0.3).sustain(0)
)
\`\`\`

## STYLE AWARENESS
When a STYLE section is injected below, follow its techniques closely. Combine multiple styles if requested. Without a specific style, default to creative electronic music.

## ERROR RECOVERY
If you receive an error, fix the code. Common fixes: balance (), add commas in stack(), replace non-existent functions with valid ones above. .every() takes EXACTLY 2 args: .every(n, fn).`

export async function* streamChat(
  messages: ChatMessage[],
  onToken?: (token: string) => void,
  localSampleNames?: string[],
  contextSnippet?: string,
): AsyncGenerator<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Gemini API key not set')

  const model = getModel()
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.parts[0]?.text || ''
  const { matchStyleCards } = await import('./style-cards')
  const styleChunks = matchStyleCards(lastUserMsg)

  let systemPrompt = SYSTEM_PROMPT
  if (styleChunks.length > 0) {
    systemPrompt += '\n\n' + styleChunks.join('\n\n')
  }
  if (localSampleNames && localSampleNames.length > 0) {
    systemPrompt += `\n\n## LOCAL SAMPLES (use with s())\nAvailable: ${localSampleNames.join(', ')}\nUse .n(0), .n(1) etc. to pick variations within each group.`
  }
  if (contextSnippet) {
    systemPrompt += `\n\n## ${contextSnippet}\nWhen the user says "evolve", "more", "darker", "change" etc., modify the CURRENT code — don't start from scratch. Preserve active layers and textures unless asked to remove them.`
  }

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 4096,
    },
  }

  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status !== 429) break
    const wait = (attempt + 1) * 3000
    await new Promise(r => setTimeout(r, wait))
  }

  if (!res!.ok) {
    const err = await res!.text()
    if (res!.status === 401 || res!.status === 403) throw new Error('Invalid API key')
    if (res!.status === 429) throw new Error('Rate limit — try again in a few seconds')
    throw new Error(`Gemini API error ${res!.status}: ${err.slice(0, 200)}`)
  }

  const reader = res!.body?.getReader()
  if (!reader) throw new Error('No response stream')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text
        if (text) {
          fullText += text
          onToken?.(text)
          yield text
        }
      } catch {}
    }
  }

  return fullText
}

export async function sendChat(messages: ChatMessage[]): Promise<string> {
  let full = ''
  for await (const chunk of streamChat(messages)) {
    full += chunk
  }
  return full
}

export type TweakParam = {
  method: string
  value: number
  index: number
  min: number
  max: number
  step: number
  log?: boolean
  label: string
  layer: number
}

export type TweakLayer = {
  name: string
  layerIndex: number
  gain: number
  params: TweakParam[]
}

const PARAM_RANGES: Record<string, { min: number; max: number; step: number; log?: boolean }> = {
  gain: { min: 0, max: 1, step: 0.01 },
  pan: { min: -1, max: 1, step: 0.01 },
  speed: { min: 0.1, max: 4, step: 0.01 },
  slow: { min: 0.25, max: 32, step: 0.25 },
  fast: { min: 0.25, max: 16, step: 0.25 },
  attack: { min: 0, max: 16, step: 0.1 },
  decay: { min: 0, max: 8, step: 0.1 },
  sustain: { min: 0, max: 1, step: 0.01 },
  release: { min: 0, max: 20, step: 0.1 },
  lpf: { min: 20, max: 20000, step: 1, log: true },
  hpf: { min: 20, max: 20000, step: 1, log: true },
  room: { min: 0, max: 1, step: 0.01 },
  size: { min: 0, max: 100, step: 1 },
  delay: { min: 0, max: 1, step: 0.01 },
  delaytime: { min: 0.01, max: 2, step: 0.01 },
  delayfeedback: { min: 0, max: 0.95, step: 0.01 },
  crush: { min: 1, max: 16, step: 0.5 },
  distort: { min: 0, max: 1, step: 0.01 },
}

function splitLayers(code: string): { start: number; end: number; text: string }[] {
  const layers: { start: number; end: number; text: string }[] = []
  let depth = 0
  let layerStart = -1
  let inStr: string | null = null

  const stackMatch = code.match(/^stack\s*\(/)
  if (!stackMatch) return [{ start: 0, end: code.length, text: code }]

  const offset = stackMatch[0].length
  for (let i = offset; i < code.length; i++) {
    const ch = code[i]
    if (inStr) {
      if (ch === '\\') { i++; continue }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === '(') { if (depth === 0 && layerStart < 0) layerStart = i - (code.slice(layerStart < 0 ? offset : layerStart, i).match(/\w+$/)?.[0]?.length || 0); depth++ }
    else if (ch === ')') {
      depth--
      if (depth < 0) { if (layerStart >= 0) layers.push({ start: layerStart, end: i, text: code.slice(layerStart, i) }); break }
    }
    else if (ch === ',' && depth === 0) {
      if (layerStart >= 0) layers.push({ start: layerStart, end: i, text: code.slice(layerStart, i) })
      layerStart = -1
    }
    if (layerStart < 0 && depth === 0 && /\S/.test(ch) && ch !== ',') layerStart = i
  }
  return layers.length ? layers : [{ start: 0, end: code.length, text: code }]
}

function extractLayerName(text: string): string {
  const sMatch = text.match(/s\(\s*["']([^"']+)["']\)/)
  const noteMatch = text.match(/note\s*\(/)
  if (sMatch) return sMatch[1]
  if (noteMatch) return 'note'
  return 'layer'
}

export function extractTweakLayers(code: string): TweakLayer[] {
  const layers = splitLayers(code)
  const result: TweakLayer[] = []
  const nameCount: Record<string, number> = {}

  for (let li = 0; li < layers.length; li++) {
    const baseName = extractLayerName(layers[li].text)
    nameCount[baseName] = (nameCount[baseName] || 0) + 1
  }

  const seen: Record<string, number> = {}
  for (let li = 0; li < layers.length; li++) {
    const { text, start } = layers[li]
    const baseName = extractLayerName(text)
    seen[baseName] = (seen[baseName] || 0) + 1
    const name = nameCount[baseName] > 1 ? `${baseName} ${seen[baseName]}` : baseName

    const params: TweakParam[] = []
    let layerGain = 1
    const re = /\.(\w+)\((-?\d+(?:\.\d+)?)\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      const method = match[1]
      const value = parseFloat(match[2])
      const range = PARAM_RANGES[method]
      if (!range) continue
      if (method === 'gain') layerGain = value
      params.push({
        method, value,
        index: start + match.index,
        ...range,
        label: method,
        layer: li,
      })
    }
    result.push({ name, layerIndex: li, gain: layerGain, params })
  }

  return result
}

export function removeLayer(code: string, layerIndex: number): string {
  const layers = splitLayers(code)
  if (layerIndex >= layers.length || layers.length <= 1) return code
  const layer = layers[layerIndex]
  let start = layer.start
  let end = layer.end
  const before = code.slice(0, start)
  const after = code.slice(end)
  const commaBeforeIdx = before.lastIndexOf(',')
  const commaAfterIdx = after.indexOf(',')
  if (commaAfterIdx >= 0 && commaAfterIdx < after.search(/\S/)) {
    return code.slice(0, start) + after.slice(commaAfterIdx + 1)
  }
  if (commaBeforeIdx >= 0) {
    return code.slice(0, commaBeforeIdx) + after
  }
  return code.slice(0, start) + after
}

export function setLayerGain(code: string, layerIndex: number, gain: number): string {
  const layers = splitLayers(code)
  if (layerIndex >= layers.length) return code
  const layer = layers[layerIndex]
  const gainMatch = layer.text.match(/\.gain\((-?\d+(?:\.\d+)?)\)/)
  if (gainMatch) {
    const absIdx = layer.start + layer.text.indexOf(gainMatch[0])
    return code.slice(0, absIdx) + `.gain(${formatNum(gain)})` + code.slice(absIdx + gainMatch[0].length)
  }
  return code.slice(0, layer.end) + `.gain(${formatNum(gain)})` + code.slice(layer.end)
}

export function applyTweakParam(code: string, param: TweakParam, newValue: number): string {
  const before = code.slice(0, param.index)
  const after = code.slice(param.index)
  return before + after.replace(
    new RegExp(`\\.${param.method}\\(${escapeRegex(param.value.toString())}\\)`),
    `.${param.method}(${formatNum(newValue)})`,
  )
}

export function addLayerToStack(code: string, layerCode: string): string {
  const trimmed = code.trim()
  if (!trimmed) return `stack(\n  ${layerCode}\n)`
  const stackMatch = trimmed.match(/^stack\s*\(/)
  if (!stackMatch) return `stack(\n  ${trimmed},\n  ${layerCode}\n)`
  const lastParen = trimmed.lastIndexOf(')')
  if (lastParen < 0) return trimmed
  return trimmed.slice(0, lastParen) + `,\n  ${layerCode}\n)`
}

export function removeLayerByContent(code: string, layerSnippet: string): string {
  const idx = code.indexOf(layerSnippet)
  if (idx < 0) return code
  let start = idx
  let end = idx + layerSnippet.length
  while (start > 0 && (code[start - 1] === ' ' || code[start - 1] === '\n')) start--
  if (start > 0 && code[start - 1] === ',') start--
  else {
    while (end < code.length && (code[end] === ' ' || code[end] === '\n')) end++
    if (end < code.length && code[end] === ',') end++
  }
  const result = code.slice(0, start) + code.slice(end)
  const layers = splitLayers(result)
  if (layers.length === 0) return ''
  return result
}

export function buildContextSnippet(opts: {
  bpm: number
  layers: { name: string; gain: number }[]
  volume: number; lpf: number; hpf: number; delay: number; reverb: number
  activeTextures: string[]
}): string {
  const layerStr = opts.layers.map(l => `${l.name} gain:${l.gain.toFixed(2)}`).join(', ')
  const texStr = opts.activeTextures.length ? opts.activeTextures.join(', ') : 'none'
  return `CURRENT STATE:\n- BPM: ${opts.bpm}\n- Layers: [${layerStr}]\n- Master FX: VOL ${Math.round(opts.volume * 100)}%, LPF ${opts.lpf >= 1000 ? (opts.lpf / 1000).toFixed(1) + 'k' : Math.round(opts.lpf)}, HPF ${Math.round(opts.hpf)}, DLY ${Math.round(opts.delay * 100)}%, RVB ${Math.round(opts.reverb * 100)}%\n- Active textures: ${texStr}`
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(3)).toString()
}
