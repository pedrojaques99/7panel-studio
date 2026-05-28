export type NoteEvent = {
  source: string
  notes: string[]
  velocity: number
  durationMs: number
}

type NoteHandler = (ev: NoteEvent) => void

const subscribers = new Map<string, Set<NoteHandler>>()
const globalSubs = new Set<NoteHandler>()

export const noteBus = {
  publish(ev: NoteEvent) {
    globalSubs.forEach(fn => fn(ev))
    subscribers.forEach((subs, id) => {
      if (id !== ev.source) subs.forEach(fn => fn(ev))
    })
  },

  subscribe(listenerId: string, fn: NoteHandler): () => void {
    if (!subscribers.has(listenerId)) subscribers.set(listenerId, new Set())
    subscribers.get(listenerId)!.add(fn)
    return () => { subscribers.get(listenerId)?.delete(fn) }
  },

  subscribeAll(fn: NoteHandler): () => void {
    globalSubs.add(fn)
    return () => { globalSubs.delete(fn) }
  },
}
