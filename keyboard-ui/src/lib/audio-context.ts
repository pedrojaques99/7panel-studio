let sharedCtx: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext()
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

export function createCaptureDestination(): MediaStreamAudioDestinationNode {
  return getSharedAudioContext().createMediaStreamDestination()
}
