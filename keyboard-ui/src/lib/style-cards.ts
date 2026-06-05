type StyleCard = {
  id: string
  keywords: string[]
  prompt: string
}

const STYLE_CARDS: StyleCard[] = [
  {
    id: 'aphex-twin',
    keywords: ['aphex', 'twin', 'idm', 'drill n bass', 'drillnbass', 'breakcore', 'warp records'],
    prompt: `STYLE: Aphex Twin / IDM
- Irregular breakbeats: .euclid(5,8), .euclid(7,12), .every(3, x=>x.ply(2))
- Detuned pads: layer two notes .add(0.05) apart, slow .lpf() sweeps
- Glitch: .chop(16).rev(), .striate(4), .degradeBy(0.4), rapid .speed() changes
- Tempo: 130-160bpm. Mix calm ambient sections with chaotic breaks
- Acid: sawtooth .note() with fast .lpf() envelope via saw.range(200,8000)
- Polyrhythm: .off(0.125, x=>x.speed(1.5)), odd .every() groupings`,
  },
  {
    id: 'zimmer',
    keywords: ['zimmer', 'hans', 'cinematic', 'epic', 'film score', 'inception', 'interstellar', 'trailer', 'orchestral'],
    prompt: `STYLE: Hans Zimmer / Cinematic
- Drones: sawtooth/triangle .note("c1").attack(4).release(8).slow(8).gain(0.3)
- Layered octaves: stack low drone + mid pad + high shimmer, all .slow(4+)
- Builds: start sparse, add layers, increase .gain() and .lpf() over time
- Brass stabs: sawtooth .decay(0.8).sustain(0.3) with .lpf(2000)
- Percussion: sparse bd hits with long .room(0.9).size(0.95), timpani rolls
- Tension: minor 2nds (c3 db3), tritones, unresolved sus4 chords
- Scales: minor, harmonic minor, phrygian for tension`,
  },
  {
    id: 'apashe',
    keywords: ['apashe', 'cinematic bass', 'orchestral bass', 'hybrid trap'],
    prompt: `STYLE: Apashe / Cinematic Bass
- Heavy drops: sawtooth .note("c1 c1 ~ c1").crush(6).distort(0.6).gain(0.8)
- Orchestral contrast: clean high strings/piano → distorted bass drop
- Halftime feel: .slow(2) on melodies, aggressive .fast(2) on bass
- Percussion: hard bd*4, aggressive sd with .shape(0.4), rapid hh
- Build + drop structure: filter sweep up then release everything
- Use .every(4, x=>x.crush(4)) for rhythmic distortion`,
  },
  {
    id: 'clams-casino',
    keywords: ['clams', 'casino', 'cloud rap', 'cloud', 'ethereal', 'asap rocky', 'lil b'],
    prompt: `STYLE: Clams Casino / Cloud Rap
- Extreme reverb on everything: .room(0.9).size(0.95).delay(0.5)
- Pitched/slowed samples: .speed(0.5), .speed(0.75) on melodic elements
- Sparse drums: bd on 1 and 3, sd on 2 and 4, barely there hh
- Dreamy pads: sine/triangle .note() with .attack(1).release(4).lpf(1500)
- Lo-fi: .lpf(3000) on master, subtle .crush(12) for warmth
- Vocal-like textures: .vowel("a e o") on pads
- Tempo: 60-75bpm, everything slow and floaty`,
  },
  {
    id: 'c418',
    keywords: ['c418', 'minecraft', 'daniel rosenfeld'],
    prompt: `STYLE: C418 / Minecraft
- Minimalist piano: piano .note() simple melodies, lots of rests "~ ~ c4 ~ e4 ~"
- Warm synths: triangle/sine with .attack(0.5).release(2), gentle .lpf(2000)
- Sparse: heavy use of .degradeBy(0.6), lots of silence in patterns
- Calm: no aggressive drums, maybe soft bd .gain(0.2) at most
- Ambient layers: very slow .slow(8) pads underneath
- Scales: major, pentatonic, lydian for dreaminess
- Room: moderate .room(0.4).size(0.6), warm not washy`,
  },
  {
    id: 'radiohead',
    keywords: ['radiohead', 'thom yorke', 'kid a', 'ok computer', 'amnesiac', 'jonny greenwood'],
    prompt: `STYLE: Radiohead / Art Rock Electronics
- Complex chords: sus4 (c3 f3 g3), maj7 (c3 e3 g3 b3), add9
- Glitchy layers: .chop(8) on pads, .striate(3), .sometimes(x=>x.speed(-1))
- Polyrhythm: .off(0.33, x=>x.note().add(7)), 3-against-4 patterns
- Textures: multiple detuned synths .add(0.02), filtered noise layers
- Dynamics: .gain() modulated by sine.slow(0.1).range(0.1, 0.6)
- Drums: organic feel, NOT quantized — .late(0.02), .early(0.01) humanize
- Scales: dorian, mixolydian, aeolian. Melancholy but not predictable`,
  },
  {
    id: 'silent-hill',
    keywords: ['silent hill', 'yamaoka', 'akira yamaoka', 'horror', 'industrial ambient', 'dark ambient', 'creepy'],
    prompt: `STYLE: Silent Hill / Industrial Horror
- Dark drones: sawtooth .note("c1").lpf(400).distort(0.3).slow(16).gain(0.3)
- Industrial noise: .crush(3).shape(0.5) on percussive layers
- Dissonance: minor 2nds, tritones, cluster chords [c3 db3 gb3]
- Sparse metal hits: perc/misc with long .room(0.95).size(0.99)
- Silence as texture: heavy .degradeBy(0.7), patterns that breathe
- Unsettling: .speed(-0.5) reversed slow sounds, .striate(2)
- No steady beat: irregular .euclid(2,11), .euclid(3,13) if any rhythm
- Scales: locrian, chromatic fragments, whole tone for unease`,
  },
  {
    id: 'ambient',
    keywords: ['ambient', 'brian eno', 'eno', 'boards of canada', 'boc', 'drone', 'generative', 'meditation', 'relaxing'],
    prompt: `STYLE: Ambient / Generative
- Long evolving pads: .attack(3).release(6).slow(8), very slow filter sweeps
- Layering: 3-4 detuned voices .add(0.03) with different .slow() rates
- No drums or barely perceptible pulse
- .degradeBy(0.8) — most notes don't play, creating random texture
- Scales: major, lydian, whole tone for openness
- Heavy reverb: .room(0.9).size(0.95) on everything
- Modulation: all params modulated by sine/perlin at different slow rates`,
  },
  {
    id: 'trap',
    keywords: ['trap', 'hip hop', 'hiphop', 'rap beat', '808', 'metro boomin', 'pierre bourne', 'travis scott'],
    prompt: `STYLE: Trap / Hip-Hop
- 808 bass: sawtooth .note("c1").decay(0.8).sustain(0).lpf(800).distort(0.2)
- Hi-hats: hh with .fast(2) rolls, .euclid(3,4), triplet patterns "hh*3"
- Snare/clap on 2 and 4: "~ sd ~ sd" or "~ cp ~ cp"
- Tempo: 130-150bpm but halftime feel on melody (.slow(2))
- Melodies: minor/phrygian, simple loops, .delay(0.3).delaytime(0.25)
- Sparse arrangement: kick + 808 + hats + one melody layer
- Use .gain() automation for bounce feel`,
  },
  {
    id: 'techno',
    keywords: ['techno', 'berghain', 'detroit', 'acid techno', 'jeff mills', 'ben klock', 'dj rush'],
    prompt: `STYLE: Techno
- Driving kick: bd*4 .gain(0.9), never stops
- Acid line: sawtooth .note() with fast .lpf(saw.range(300,6000)).lpq(8)
- Hats: hh*8 or hh*16, subtle .gain() variation via sine
- Hypnotic: minimal changes, .every(8, fn) for slow evolution
- Sub bass: sine .note("c1").gain(0.5) underneath
- FX sweeps: .hpf(sine.slow(0.03).range(20,2000)) for builds
- Tempo: 125-140bpm`,
  },
  {
    id: 'mount-shrine',
    keywords: ['mount shrine', 'shrine', 'tape loops', 'lo-fi ambient', 'tape ambient', 'droney', 'devotional'],
    prompt: `STYLE: Mount Shrine / Tape Ambient
- Tape warble: sine .note() with .speed(perlin.slow(0.02).range(0.95,1.05)) for wow/flutter
- Hiss texture: layer s("hh").speed(0.05).gain(0.03).crush(3).lpf(2500).hpf(800).fast(32)
- Washed out pads: .room(0.98).size(0.99).lpf(1200) — everything through fog
- Devotional drones: very slow .slow(16+) notes, barely changing
- Degrade everything: .crush(10).lpf(3000) — cheap cassette player warmth
- Layer 3+ very quiet detuned voices .add(0.02) at different .slow() rates
- Envelope: .attack(6).release(12) — nothing has edges
- NO drums. NO rhythm. Pure floating texture`,
  },
  {
    id: 'nature',
    keywords: ['nature', 'field recording', 'organic', 'forest', 'garden', 'birds', 'outdoors', 'pastoral'],
    prompt: `STYLE: Nature / Field Recording
- Bird-like patterns: s("hh").speed(rand.range(2,5)).gain(rand.range(0.02,0.06)).hpf(3000).fast(4).degradeBy(0.6)
- Water/stream: s("cr").speed(rand.range(0.2,0.6)).gain(perlin.range(0.02,0.08)).lpf(1500).room(0.8).fast(6)
- Wind: sine .note("c1").lpf(perlin.slow(0.01).range(80,400)).gain(perlin.slow(0.02).range(0.02,0.06)).slow(16)
- Organic timing: .late(rand.range(0,0.05)) for humanized feel, nothing quantized
- Use .degradeBy(0.5+) so events are sparse and random
- Layer multiple quiet textures, no single element dominates
- Scales: pentatonic, whole tone — avoid tension`,
  },
  {
    id: 'vaporwave',
    keywords: ['vaporwave', 'vapor', 'mallsoft', 'late night', 'mall', 'future funk', 'macintosh plus', 'blank banshee'],
    prompt: `STYLE: Vaporwave / Nostalgic
- Slowed 80%: .speed(0.75) or .speed(0.8) on everything, .slow(2) feel
- Chopped samples: .chop(4).sometimes(x=>x.rev()) — glitchy edits
- Heavy reverb+delay: .room(0.85).size(0.9).delay(0.4).delaytime(0.33)
- Lo-fi warmth: .crush(10).lpf(4000) — VHS tape quality
- Dreamy pads: triangle/sine with heavy .attack(1).release(4)
- Tempo: 70-90bpm, languid
- Slight pitch drift: .speed(perlin.slow(0.03).range(0.78,0.82)) for tape warble
- Scales: major 7th chords, jazzy voicings, pentatonic`,
  },
  {
    id: 'analog-warmth',
    keywords: ['analog', 'analogic', 'warm', 'vintage', 'tube', 'vinyl', 'tape', 'retro', 'nostalgic', 'lo-fi'],
    prompt: `STYLE: Analog Warmth / Vintage
- Subtle saturation: .crush(12) or .crush(10) — not aggressive, just warm
- Slight detune on everything: pairs of voices .add(0.015) apart
- LP filtered: .lpf(3500) cap on master, nothing too bright
- Tape wow/flutter: .speed(perlin.slow(0.04).range(0.985,1.015))
- Vinyl crackle layer: s("hh").speed(0.08).gain(0.04).crush(4).lpf(1200).fast(24).degradeBy(0.3)
- Warm reverb: .room(0.5).size(0.7) — not washy, just room
- Round bass: sine .note() with .lpf(800).gain(0.4)
- Avoid digital brightness: no .hpf() above 200, no harsh .distort()`,
  },
  {
    id: 'rain-ambient',
    keywords: ['rain', 'rainy', 'storm', 'thunder', 'water', 'ocean', 'pluvial'],
    prompt: `STYLE: Rain / Water Ambient
- Rain texture: s("hh").speed(rand.range(0.3,0.8)).gain(perlin.range(0.02,0.1)).lpf(sine.slow(0.03).range(800,3000)).room(0.95).size(0.99).fast(8).degradeBy(0.3)
- Thunder rumbles: sawtooth .note("c0").lpf(200).gain(0.15).attack(2).release(8).slow(32).degradeBy(0.85)
- Drips: s("perc").speed(rand.range(1.5,3)).gain(rand.range(0.03,0.08)).delay(0.5).delaytime(0.15).room(0.9).fast(2).degradeBy(0.7)
- Underwater feel: everything through .lpf(1500).room(0.95)
- Sparse melody (optional): piano .note("c4 ~ e4 ~ g4 ~").gain(0.12).lpf(2000).room(0.9).degradeBy(0.6).slow(2)
- NO hard drums. Keep everything soft and diffuse
- Scales: major, lydian — rain is peaceful not threatening`,
  },
]

// ── Mutation presets (code transforms, no LLM) ──

export type MutationDef = {
  id: string
  label: string
  apply: (code: string) => string
}

function tweakNumericParam(code: string, method: string, transform: (v: number) => number): string {
  const re = new RegExp(`\\.${method}\\((-?\\d+(?:\\.\\d+)?)\\)`, 'g')
  return code.replace(re, (_, val) => `.${method}(${parseFloat(transform(parseFloat(val)).toFixed(4))})`)
}

export const MUTATIONS: MutationDef[] = [
  {
    id: 'darker',
    label: 'darker',
    apply: (code) => {
      let c = tweakNumericParam(code, 'lpf', v => Math.max(100, v * 0.7))
      c = tweakNumericParam(c, 'room', v => Math.min(1, v + 0.15))
      return c
    },
  },
  {
    id: 'warmer',
    label: 'warmer',
    apply: (code) => {
      let c = tweakNumericParam(code, 'crush', v => Math.max(2, v - 2))
      c = tweakNumericParam(c, 'hpf', v => Math.max(20, v * 0.5))
      c = tweakNumericParam(c, 'lpf', v => Math.min(20000, v * 0.85))
      return c
    },
  },
  {
    id: 'degrade',
    label: 'degrade',
    apply: (code) => tweakNumericParam(code, 'degradeBy', v => Math.min(0.95, v + 0.15)),
  },
  {
    id: 'sparse',
    label: 'sparse',
    apply: (code) => {
      let c = tweakNumericParam(code, 'slow', v => v * 2)
      c = tweakNumericParam(c, 'fast', v => Math.max(1, v * 0.5))
      return c
    },
  },
  {
    id: 'lofi',
    label: 'lo-fi',
    apply: (code) => {
      let c = tweakNumericParam(code, 'crush', v => Math.max(2, v - 3))
      c = tweakNumericParam(c, 'lpf', v => Math.min(v, 3000))
      return c
    },
  },
  {
    id: 'brighter',
    label: 'brighter',
    apply: (code) => {
      let c = tweakNumericParam(code, 'lpf', v => Math.min(20000, v * 1.4))
      c = tweakNumericParam(c, 'hpf', v => Math.min(5000, v * 1.3))
      return c
    },
  },
  {
    id: 'wetter',
    label: 'wetter',
    apply: (code) => {
      let c = tweakNumericParam(code, 'room', v => Math.min(1, v + 0.2))
      c = tweakNumericParam(c, 'size', v => Math.min(1, v + 0.15))
      c = tweakNumericParam(code, 'delay', v => Math.min(0.8, v + 0.15))
      return c
    },
  },
  {
    id: 'drier',
    label: 'drier',
    apply: (code) => {
      let c = tweakNumericParam(code, 'room', v => Math.max(0, v - 0.25))
      c = tweakNumericParam(c, 'delay', v => Math.max(0, v - 0.2))
      return c
    },
  },
]

export function matchStyleCards(userMessage: string): string[] {
  const lower = userMessage.toLowerCase()
  const matched: string[] = []
  for (const card of STYLE_CARDS) {
    if (card.keywords.some(kw => lower.includes(kw))) {
      matched.push(card.prompt)
    }
  }
  return matched
}

export function getAvailableStyles(): string[] {
  return STYLE_CARDS.map(c => c.id)
}
