# EffectsRack — Shared FX Chain for Drone + Synth

## Status: PLANNING

## Problem

Drone e Synth têm chains de efeitos duplicadas e incompatíveis:
- **Drone**: `GrainPlayer → Reverb → Analyser → Destination` (5 params: grainSize, overlap, rate, reverbWet, volume)
- **Synth**: `Gate → BitCrusher → Distortion → Chebyshev → Filter → Chorus → Phaser → Delay → PitchShift → Reverb → Analyser → Gain → Destination` (18 params)

O Drone tem um rack pobre; o Synth tem o rack completo mas hardcoded no componente.

## Goal

Extrair um `EffectsRack` reutilizável que ambos importam. Drone ganha todos os efeitos do Synth. Synth não perde nada.

## Architecture

```
Panel-specific source          Shared EffectsRack              Output
─────────────────────         ─────────────────────────        ──────
DronePanel:                   ┌─────────────────────────┐
  GrainPlayer ──────────────► │ Gate → Crush → Drive →  │
  (grainSize, overlap,        │ Bite → Filter → Chorus →│ ──► Analyser → Gain → Destination
   playbackRate, trim)        │ Phaser → Delay →        │         │
                              │ Shimmer → Reverb        │    Capture tap
SynthPanel:                   └─────────────────────────┘
  GrainPlayer ──┐
  PolySynth ────┘──────────►  (same rack, separate instance)
```

### What's shared (the rack)

| Effect | Param(s) | Tone.js Node |
|--------|----------|-------------|
| Gate/Denoise | denoise 0..1 | `Tone.Gate` |
| BitCrusher | crush 4..12 | `Tone.BitCrusher` |
| Distortion | drive 0..1 | `Tone.Distortion` |
| Chebyshev | bite 1..50 | `Tone.Chebyshev` |
| Filter | cutoff 400..18k, resonance 0..20 | `Tone.Filter` |
| Chorus | chorus 0..1 | `Tone.Chorus` |
| Phaser | phaser 0..1 | `Tone.Phaser` |
| Delay | delay 0..1, delayTime, delayFb | `Tone.PingPongDelay` |
| Shimmer | shimmer 0..1 | `Tone.PitchShift` |
| Reverb | reverbWet 0..1, reverbDecay 0.5..30 | `Tone.Freeverb` |
| Volume | vol 0..1 | via output gain |

### What stays in each panel

- **DronePanel**: GrainPlayer params (grainSize, overlap, playbackRate), trim, layers, note keyboard, sequencer
- **SynthPanel**: PolySynth, paul (grainSize alias), rate, sampleSpeed, analogMode, velocity, presets, freestyle, generative drift

## Files to create/modify

### New files

1. **`src/lib/fx-rack.ts`** — Audio engine
   - `FxParams` type + `FX_DEFAULTS` (moved from SynthPanel)
   - `FxChain` type (all Tone.js nodes)
   - `createFxChain(params): FxChain` — wires nodes, returns chain with `.input` node
   - `updateFxChain(chain, patch)` — applies param changes to live nodes
   - `disposeFxChain(chain)` — cleanup

2. **`src/lib/EffectsRack.tsx`** — UI component
   - Renders the 2-row knob grid (reuses existing `SynthKnob` extracted to shared)
   - Props: `{ params, onChange, genEnabled?, onToggleGen?, accent? }`
   - Optional secondary row (resonance, decay, shimmer, dly t, dly fb)
   - Compact mode prop for DronePanel (smaller knobs, 1 row)

3. **`src/lib/SynthKnob.tsx`** — Extract from SynthPanel (it's already self-contained)

### Modified files

4. **`SynthPanel.tsx`**
   - Import `FxParams`, `FX_DEFAULTS`, `createFxChain`, `updateFxChain`, `disposeFxChain` from fx-rack
   - Import `EffectsRack` component
   - Import `SynthKnob` from shared
   - Remove inline FX chain creation, replace with `createFxChain()`
   - Remove inline knob grid, replace with `<EffectsRack />`
   - Keep: presets, sequencer, piano, generative drift (passes genEnabled to rack)

5. **`DronePanel.tsx`**
   - Each layer gets an FxChain instead of just a Reverb
   - `AudioEntry` becomes `{ player, fxChain, analyser }`
   - Layer params expand: keep grainSize/overlap/playbackRate, add full FxParams
   - UI: add collapsible `<EffectsRack compact />` per layer
   - ParamSliders for granular params stay above the rack

## Migration strategy

1. Extract SynthKnob to shared file (zero behavior change)
2. Create fx-rack.ts with chain logic extracted from SynthPanel
3. Create EffectsRack.tsx UI component
4. Wire SynthPanel to use shared modules (functional parity test)
5. Wire DronePanel layers to use FxChain + EffectsRack
6. Move factory presets type to fx-rack.ts so Drone can use them too

## Presets compatibility

- Existing SynthPreset type stays compatible (it stores `Partial<FxParams>`)
- DronePanel layers gain optional `fxPreset?: string` field
- Factory presets become importable from fx-rack

## Risk / Trade-offs

- DronePanel with 6 layers × full FX chain = 6 Freeverb instances. Freeverb is lighter than Reverb (no convolution), so OK.
- Compact mode knobs in Drone may feel cramped with 12+ knobs per layer. Mitigation: collapsible FX section, default collapsed.
- Breaking change to DronePanel layer serialization (if persisted). Mitigation: merge with defaults like Synth already does.
