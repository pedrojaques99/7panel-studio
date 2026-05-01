import React, { useRef, useEffect } from 'react'
import * as Tone from 'tone'

export function ToneVisualizer({ analyser, color = '#00b860' }: {
  analyser: Tone.Analyser | null
  color?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!analyser) return
    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const canvas = canvasRef.current; if (!canvas) return
      const ctx = canvas.getContext('2d')!
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const data = analyser!.getValue() as Float32Array
      const bars = Math.min(data.length, 16)
      const bw = w / bars - 1
      for (let i = 0; i < bars; i++) {
        // FFT values are in dB (-Infinity to 0). Normalize to 0-1.
        const db = data[i] as number
        const pct = Math.max(0, (db + 80) / 80)
        const bh = Math.max(2, pct * h)
        const g = ctx.createLinearGradient(0, h - bh, 0, h)
        g.addColorStop(0, `${color}${Math.round(0.4 + pct * 0.6 * 255).toString(16).padStart(2,'0')}`)
        g.addColorStop(1, `${color}22`)
        ctx.fillStyle = g
        ctx.fillRect(i * (bw + 1), h - bh, bw, bh)
      }
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser, color])

  return (
    <canvas
      ref={canvasRef}
      width={80} height={18}
      style={{ display: 'block', borderRadius: 3, opacity: 0.9 }}
    />
  )
}
