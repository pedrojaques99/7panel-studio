let sharedCtx: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext()
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

export function createCaptureDestination(): MediaStreamAudioDestinationNode {
  return getSharedAudioContext().createMediaStreamDestination()
}

// ── Master capture: taps ALL app audio via a node before ctx.destination ──
let masterGain: GainNode | null = null
let masterCaptureDest: MediaStreamAudioDestinationNode | null = null

export function getMasterCaptureNode(): GainNode {
  if (!masterGain) {
    const ctx = getSharedAudioContext()
    masterGain = ctx.createGain()
    masterCaptureDest = ctx.createMediaStreamDestination()
    masterGain.connect(ctx.destination)
    masterGain.connect(masterCaptureDest)
  }
  return masterGain
}

export function getMasterCaptureStream(): MediaStream | null {
  if (!masterCaptureDest) getMasterCaptureNode()
  return masterCaptureDest?.stream ?? null
}
