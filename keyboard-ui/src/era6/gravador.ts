/**
 * REC ao vivo em WAV: extendable-media-recorder + encoder wav (MIT, mantida).
 * O MediaRecorder nativo só dá webm/opus, e o /musica fazia a volta webm → decode → wav.
 */
import { MediaRecorder as MR, register, type IMediaRecorder } from 'extendable-media-recorder'
import { connect } from 'extendable-media-recorder-wav-encoder'

let registrado: Promise<void> | null = null
function garantirEncoder() {
  // register() só pode rodar uma vez por página
  if (!registrado) registrado = connect().then(register)
  return registrado
}

export async function gravar(stream: MediaStream): Promise<{ parar: () => Promise<Blob> }> {
  await garantirEncoder()
  const pedacos: Blob[] = []
  const rec: IMediaRecorder = new MR(stream, { mimeType: 'audio/wav' })
  rec.ondataavailable = e => { if (e.data.size) pedacos.push(e.data) }
  rec.start()
  return {
    parar: () => new Promise<Blob>(ok => {
      rec.onstop = () => ok(new Blob(pedacos, { type: 'audio/wav' }))
      rec.stop()
    }),
  }
}
