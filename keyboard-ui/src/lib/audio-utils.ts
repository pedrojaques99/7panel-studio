export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length
  const ab = new ArrayBuffer(44 + len * numCh * 2)
  const v = new DataView(ab)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  const u32 = (o: number, n: number) => v.setUint32(o, n, true)
  const u16 = (o: number, n: number) => v.setUint16(o, n, true)
  str(0,'RIFF'); u32(4, 36 + len * numCh * 2); str(8,'WAVE'); str(12,'fmt ')
  u32(16,16); u16(20,1); u16(22,numCh); u32(24,sr); u32(28,sr*numCh*2); u16(32,numCh*2); u16(34,16)
  str(36,'data'); u32(40, len * numCh * 2)
  let off = 44
  for (let i = 0; i < len; i++)
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2
    }
  return new Blob([ab], { type: 'audio/wav' })
}
