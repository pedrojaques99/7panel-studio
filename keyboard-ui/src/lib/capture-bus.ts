export type CaptureSource = {
  id: string
  label: string
  getStream: () => MediaStream | null
  setMonitor?: (enabled: boolean) => void
}

const sources = new Map<string, CaptureSource>()
const listeners = new Set<() => void>()

// Recording state — broadcast by ExporterPanel
let recState = { recording: false, selected: new Set<string>() }
const recListeners = new Set<() => void>()

export const captureRegistry = {
  register(source: CaptureSource) {
    sources.set(source.id, source)
    listeners.forEach(fn => fn())
  },
  unregister(id: string) {
    sources.delete(id)
    listeners.forEach(fn => fn())
  },
  list(): CaptureSource[] {
    return Array.from(sources.values())
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  setMonitor(id: string, enabled: boolean) {
    sources.get(id)?.setMonitor?.(enabled)
  },

  // Recording state (set by ExporterPanel, read by panels)
  setRecordingState(recording: boolean, selected: Set<string>) {
    recState = { recording, selected: new Set(selected) }
    recListeners.forEach(fn => fn())
  },
  isRecording(): boolean { return recState.recording },
  isCaptured(id: string): boolean { return recState.recording && recState.selected.has(id) },
  subscribeRecording(fn: () => void) {
    recListeners.add(fn)
    return () => { recListeners.delete(fn) }
  },
}
