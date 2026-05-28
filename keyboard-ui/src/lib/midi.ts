// ── MIDI Helper ──────────────────────────────────────────────────────
// Lightweight wrapper around Web MIDI API for SynthPanel integration.

export type MIDICallback = {
  noteOn: (note: string, velocity: number) => void
  noteOff: (note: string) => void
  cc?: (controller: number, value: number) => void
  pitchBend?: (value: number) => void // -1 to +1
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Convert MIDI note number (0-127) to name like "C4", "F#3". MIDI 60 = C4. */
export function midiNoteToName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1
  const name = NOTE_NAMES[midiNote % 12]
  return `${name}${octave}`
}

/** Wraps navigator.requestMIDIAccess. Returns null if not supported. */
export async function requestMIDIAccess(): Promise<MIDIAccess | null> {
  if (!navigator.requestMIDIAccess) return null
  try {
    return await navigator.requestMIDIAccess()
  } catch {
    return null
  }
}

/** List all available MIDI inputs. */
export function listMIDIInputs(access: MIDIAccess): MIDIInput[] {
  return Array.from(access.inputs.values())
}

/** Create a start/stop MIDI listener that parses note, CC, and pitch bend messages. */
export function createMIDIListener(callbacks: MIDICallback): { start(input: MIDIInput): void; stop(): void } {
  let currentInput: MIDIInput | null = null

  function onMessage(ev: MIDIMessageEvent) {
    const data = ev.data
    if (!data || data.length < 2) return

    const status = data[0] & 0xf0

    if (status === 0x90 && data.length >= 3 && data[2] > 0) {
      // Note On
      callbacks.noteOn(midiNoteToName(data[1]), data[2] / 127)
    } else if (status === 0x80 || (status === 0x90 && data.length >= 3 && data[2] === 0)) {
      // Note Off
      callbacks.noteOff(midiNoteToName(data[1]))
    } else if (status === 0xb0 && data.length >= 3 && callbacks.cc) {
      // Control Change
      callbacks.cc(data[1], data[2])
    } else if (status === 0xe0 && data.length >= 3 && callbacks.pitchBend) {
      // Pitch Bend — 14-bit value, center = 8192
      const raw = data[1] | (data[2] << 7)
      callbacks.pitchBend((raw - 8192) / 8192)
    }
  }

  return {
    start(input: MIDIInput) {
      if (currentInput) currentInput.onmidimessage = null
      currentInput = input
      input.onmidimessage = onMessage
    },
    stop() {
      if (currentInput) {
        currentInput.onmidimessage = null
        currentInput = null
      }
    },
  }
}
