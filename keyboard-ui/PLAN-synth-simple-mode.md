# SynthPanel — Simple/Advanced Mode Refactor ✅

## Resultado

### Header (de 12 botões → 5 + dropdown)
**Botões primários:**
- ≡ PATCHES
- 🎲 RND (randomize)
- ▶/⏹ DRONE
- ⏺ REC (+♪ LAST)

**Dropdown ⚙ Tools:**
- 🎹 MIDI on/off
- 🔗 Link on/off
- ∿ Paul Mode on/off
- ← Undo (Ctrl+Z)
- → Redo (Ctrl+Shift+Z)

**Removido:**
- ◎ GEN toggle global (redundante — right-click nos knobs já faz per-param)

**Toggle de modo:**
- `▾ ADV` / `▴ SIMPLE` — no final do header

### Simple mode (default)
1. Scope (wave/fft)
2. Status strip + speed
3. Source row (URL + file)
4. Trim (quando sample)
5. EffectsRack **compact** (8 knobs essenciais)
6. Piano + octave badge

### Advanced mode (▾ ADV)
Adiciona:
- PAUL + RATE knobs
- ADSR Envelope (4 knobs + display)
- Synth type selector (FM/AM/SIN/SQR/SAW/TRI)
- EffectsRack **full** (12 knobs + secondary)
- Filter Envelope (FENV — 5 knobs)
- LFO (rate, depth, wave, target)
- Sequencer (loops, freestyle, BPM, gate, swing, analog toggle)

### Zero mudanças em:
- Lógica de áudio
- Subcomponentes (Piano, Scope, EffectsRack, etc.)
- Per-knob generative drift (right-click)
