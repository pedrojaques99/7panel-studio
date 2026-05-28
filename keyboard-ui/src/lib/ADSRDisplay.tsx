import React from 'react'

type ADSRDisplayProps = {
  attack: number   // 0.001 to 2 seconds
  decay: number    // 0.01 to 2 seconds
  sustain: number  // 0 to 1 level
  release: number  // 0.01 to 5 seconds
  accent?: string  // color, default '#00b860'
  width?: number   // default 120
  height?: number  // default 36
}

export function ADSRDisplay({
  attack, decay, sustain, release,
  accent = '#00b860', width = 120, height = 36,
}: ADSRDisplayProps) {
  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2

  // Normalize time segments proportionally, with sustain getting ~20% fixed
  const sustainW = w * 0.2
  const timeTotal = attack + decay + release
  const timeW = w - sustainW
  const aW = timeTotal > 0 ? (attack / timeTotal) * timeW : timeW * 0.33
  const dW = timeTotal > 0 ? (decay / timeTotal) * timeW : timeW * 0.33
  const rW = timeTotal > 0 ? (release / timeTotal) * timeW : timeW * 0.34

  const susY = h * (1 - sustain)

  // Points for the ADSR curve
  const x0 = pad
  const y0 = h + pad               // bottom-left (zero level)
  const x1 = pad + aW
  const y1 = pad                    // peak (top)
  const x2 = x1 + dW
  const y2 = susY + pad             // sustain level
  const x3 = x2 + sustainW
  const y3 = y2                     // end of sustain hold
  const x4 = x3 + rW
  const y4 = h + pad               // back to zero

  const linePath = `M${x0},${y0} L${x1},${y1} L${x2},${y2} L${x3},${y3} L${x4},${y4}`
  const fillPath = `${linePath} L${x4},${h + pad} L${x0},${h + pad} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', flexShrink: 0 }}>
      <path d={fillPath} fill={accent} opacity={0.15} />
      <path d={linePath} fill="none" stroke={accent} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
