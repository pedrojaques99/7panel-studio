export type SbChannel = {
  id: string; label: string; emoji: string
  playing: boolean; volume: number; currentTime: number; duration: number
  setVolume: (v: number) => void
  seek: (t: number) => void
  stop: () => void
}
