# SynthPanel Pro — Upgrade Checklist

## Status: COMPLETE

> Priority: impact × ease. Quick wins first, then engine, sequencer, polish.

---

## Phase 1 — Quick Wins (high impact, low effort)

| # | Feature | Size | Files | Deps | Status |
|---|---------|------|-------|------|--------|
| 1 | **Octave shift (Z/X keys)** — shift piano range ±3 octaves, display current octave badge | S | `SynthPanel.tsx`, `notes.ts` | — | ✅ |
| 2 | **Waveform / synth type selector** — sine/square/saw/tri toggle + FMSynth/AMSynth/MonoSynth swap | S | `SynthPanel.tsx` | — | ✅ |
| 3 | **MIDI input** — Web MIDI API, auto-detect controllers, noteOn/Off/CC mapping | M | `SynthPanel.tsx`, new `lib/midi.ts` | — | ✅ |
| 4 | **ADSR envelope knobs** — attack/decay/sustain/release with mini SVG curve preview | M | `SynthPanel.tsx`, new `lib/ADSRDisplay.tsx` | — | ✅ |

### 1. Octave Shift

- Add `octaveShift` state (-3..+3), default 0
- Z key = octave down, X key = octave up (when not in input)
- Transpose `KEY_NOTE` mapping by `octaveShift * 12` semitones
- Display octave badge near piano (e.g. `C2–C4`)
- Piano component: shift displayed note labels
- Update `noteOn`/`noteOff` to use shifted note names

### 2. Waveform / Synth Type Selector

- Add `synthType` state: `'fm' | 'am' | 'mono' | 'sine' | 'square' | 'saw' | 'triangle'`
- On change: dispose old polySynth, create new one with selected type
- Simple synth types (sine/square/saw/tri) use `Tone.PolySynth(Tone.Synth, { oscillator: { type } })`
- FM/AM use `Tone.PolySynth(Tone.FMSynth)` / `Tone.PolySynth(Tone.AMSynth)`
- Mono uses `Tone.MonoSynth` (monophonic — last-note priority)
- UI: small segmented toggle row above the FX rack (icons or 3-letter labels)
- Preserve current ADSR/FX when switching

### 3. MIDI Input

- New `lib/midi.ts`:
  - `requestMIDI()` — calls `navigator.requestMIDIAccess()`
  - `onMIDIMessage(callback)` — parses noteOn (0x90), noteOff (0x80), CC (0xB0)
  - `listInputs()` — returns available MIDI input devices
  - Auto-reconnect on device hotplug (`statechange` event)
- SynthPanel integration:
  - MIDI button in header (🎹 MIDI) — toggles listening
  - Green dot when connected, device name tooltip
  - noteOn velocity → `fxRef.current.velocity` override
  - CC mapping: mod wheel (CC1) → filter cutoff, expression (CC11) → volume
  - Pitch bend → detune cents
- No external deps — Web MIDI API is native

### 4. ADSR Envelope Controls

- Add ADSR state: `{ attack, decay, sustain, release }` (already in polySynth envelope)
- 4 SynthKnob controls in a dedicated row labeled "ENVELOPE"
- Mini SVG curve (60×30px) showing the ADSR shape visually
  - Horizontal axis = time, vertical = amplitude
  - Attack ramp → decay curve → sustain level → release curve
  - Updates reactively as knobs change
- On change: `polySynth.set({ envelope: { attack, decay, sustain, release } })`
- Save/restore in presets

---

## Phase 2 — Engine Upgrades (medium effort)

| # | Feature | Size | Files | Deps | Status |
|---|---------|------|-------|------|--------|
| 5 | **Spectrum analyzer** — FFT view toggle alongside waveform scope | M | `SynthPanel.tsx`, `Scope` component | — | ✅ |
| 6 | **Filter envelope** — ADSR modulating cutoff over note duration | M | `SynthPanel.tsx`, `fx-rack.ts` | #4 | ✅ |
| 7 | **LFO routing** — assignable LFO to any FX param (rate, depth, waveform) | L | `SynthPanel.tsx`, new `lib/lfo.ts`, `fx-rack.ts` | — | ✅ |
| 8 | **Polyphony display** — active voice count, voice stealing mode selector | S | `SynthPanel.tsx` | — | ✅ |
| 9 | **CPU meter** — audio thread load indicator | S | `SynthPanel.tsx` | — | ✅ |

### 5. Spectrum Analyzer

- Current `Scope` uses `Tone.Analyser('waveform', 1024)`
- Add second analyser: `Tone.Analyser('fft', 1024)` (already in the chain, just need display)
- Toggle button on scope: `WAVE | FFT`
- FFT display: vertical bars or filled curve, log frequency scale
- Color: use panel accent color
- Same canvas, different draw mode

### 6. Filter Envelope

- Separate ADSR for filter: `filterEnv: { attack, decay, sustain, release, depth }`
- `depth` = how many Hz the envelope sweeps (0 = off, up to cutoff range)
- On noteOn: schedule filter.frequency ramp: `base → base+depth → base+depth*sustain → base`
- Use `Tone.FrequencyEnvelope` connected to filter.frequency
- UI: 4 mini knobs + depth knob in collapsible "FILTER ENV" section
- Only active when depth > 0

### 7. LFO Routing

- New `lib/lfo.ts`:
  - `createLFO(rate, depth, waveform)` → `Tone.LFO`
  - `routeLFO(lfo, target, param)` — connects to any AudioParam
- UI: LFO section with rate knob, depth knob, waveform selector (sine/square/saw/tri)
- Dropdown to select target param (cutoff, resonance, drive, delay, shimmer, etc.)
- Multiple LFO slots (up to 3) for complex modulation
- Visual: small animated dot showing LFO cycle
- Replaces/augments the GEN drift system for musical modulation

### 8. Polyphony Display

- Read `polySynth.activeVoices` (or track via attackedNotes.current.size)
- Display: `4/64` badge near scope
- Voice stealing mode: dropdown `round-robin | kill-oldest | kill-quietest`
- Map to `Tone.PolySynth` voice allocation (custom if needed)

### 9. CPU Meter

- Use `Tone.getContext().rawContext.baseLatency` + `outputLatency`
- Or use `PerformanceObserver` / `AudioContext.getOutputTimestamp()`
- Simple colored bar: green < 50%, yellow 50-80%, red > 80%
- Tooltip with exact % and buffer underrun count
- Position: bottom-right corner of panel

---

## Phase 3 — Sequencer Pro (medium effort)

| # | Feature | Size | Files | Deps | Status |
|---|---------|------|-------|------|--------|
| 10 | **Velocity per step** — editable velocity on each sequencer note | M | `SynthPanel.tsx` | — | ✅ |
| 11 | **Swing/shuffle** — timing humanization control | S | `SynthPanel.tsx` | — | ✅ |
| 12 | **Pattern length per loop** — independent lengths for polyrhythm | M | `SynthPanel.tsx` | — | ✅ |

### 10. Velocity Per Step

- Extend sequence step type: `{ note: string, velocity: number }` (default 0.8)
- On piano right-click (add to seq): hold shift for accent (velocity 1.0)
- Velocity display: bar height below each step in sequence visualizer
- Click+drag on velocity bars to edit
- Velocity passed to `triggerAttackRelease`

### 11. Swing/Shuffle

- Add `swing` state: 0..1 (0 = straight, 0.5 = triplet feel, 1 = extreme)
- Offset even-numbered steps by `swing * stepDuration * 0.5`
- UI: single knob or slider in sequencer bar, labeled "SWING"
- Also affects freestyle playback quantization

### 12. Pattern Length Per Loop

- Each loop gets `length` property (default: number of steps)
- Allow setting max length independently (e.g. Loop A = 8, Loop B = 6 → polyrhythm)
- UI: small number input per loop slot showing step count
- Loops wrap independently when playing together
- Visual: dim steps beyond pattern length

---

## Phase 4 — Polish

| # | Feature | Size | Files | Deps | Status |
|---|---------|------|-------|------|--------|
| 13 | **Undo/Redo** — for preset changes and sequence edits | M | `SynthPanel.tsx`, new `lib/use-undo.ts` | — | ✅ |
| 14 | **Preset import/export** — JSON file share | S | `SynthPanel.tsx` | — | ✅ |

### 13. Undo/Redo

- Generic `useUndo<T>(initial)` hook: `{ state, set, undo, redo, canUndo, canRedo }`
- Stack-based: max 50 entries, debounced pushes (don't record every knob micro-change)
- Apply to: FX params, sequence edits, preset switches
- Keyboard: Ctrl+Z / Ctrl+Shift+Z
- UI: small undo/redo arrows in header (optional)

### 14. Preset Import/Export

- Export: serialize current state (FX params + ADSR + synthType + sequences) → JSON blob → download
- Import: file picker → validate schema → apply preset
- UI: two small buttons in preset menu: `↓ Export` / `↑ Import`
- Clipboard support: Ctrl+C copies current preset JSON, Ctrl+V imports
- Version field in JSON for forward compatibility

---

## Execution Order

```
Phase 1 (parallel where possible):
  1. Octave shift ──────────────────── standalone
  2. Waveform selector ─────────────── standalone
  3. MIDI input ────────────────────── standalone
  4. ADSR envelope ─────────────────── standalone

Phase 2 (after Phase 1):
  8. Polyphony display ─────────────── standalone (quick)
  9. CPU meter ─────────────────────── standalone (quick)
  5. Spectrum analyzer ─────────────── standalone
  6. Filter envelope ───────────────── after #4 (reuses ADSR pattern)
  7. LFO routing ───────────────────── last (most complex)

Phase 3 (after Phase 1):
  11. Swing/shuffle ────────────────── standalone (quick)
  10. Velocity per step ────────────── standalone
  12. Pattern length per loop ──────── standalone

Phase 4 (after all):
  14. Preset export/import ─────────── standalone (quick)
  13. Undo/Redo ────────────────────── last (touches everything)
```

## Notes

- All features must preserve existing preset compatibility (additive fields with defaults)
- New UI sections should be collapsible to keep the panel clean
- Use existing design system components (SynthKnob, miniBtn styles, panel CSS vars)
- No new dependencies — all features use native Web APIs or Tone.js built-ins
- Test each feature with both OSC mode (no sample) and sample/drone mode
