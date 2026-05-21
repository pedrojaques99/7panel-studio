/**
 * Shared epoch for synth synchronization.
 * Each synth runs its own BPM/interval, but all align to the same t0
 * so their downbeats stay phase-locked.
 */
class GlobalClock {
  private t0: number | null = null
  private players = new Set<string>()

  getEpoch(): number {
    if (this.t0 == null) this.t0 = performance.now()
    return this.t0
  }

  join(id: string) {
    if (this.t0 == null) this.t0 = performance.now()
    this.players.add(id)
  }

  leave(id: string) {
    this.players.delete(id)
    if (this.players.size === 0) this.t0 = null
  }

  reset() {
    this.t0 = performance.now()
  }

  hasPlayers() { return this.players.size > 0 }
}

export const globalClock = ((window as any).__globalClock ??= new GlobalClock()) as GlobalClock
