import React from 'react'
import { SynthKnob } from './SynthKnob'
import type { FxParams } from './fx-rack'

type Props = {
  params: FxParams
  onChange: (patch: Partial<FxParams>) => void
  accent?: string
  compact?: boolean
  knobSize?: number
  genEnabled?: Set<keyof FxParams>
  onToggleGen?: (key: keyof FxParams) => void
  showSecondary?: boolean
}

export function EffectsRack({
  params, onChange, accent = '#00b860', compact = false, knobSize,
  genEnabled, onToggleGen, showSecondary = true,
}: Props) {
  const size = knobSize ?? (compact ? 48 : 64)
  const gen = (k: keyof FxParams) => genEnabled?.has(k)
  const tog = (k: keyof FxParams) => onToggleGen ? () => onToggleGen(k) : undefined

  function knob(label: string, k: keyof FxParams, min: number, max: number, ac: string, fmt: (v: number) => string, log?: boolean) {
    return (
      <SynthKnob key={k}
        label={label} value={params[k]} min={min} max={max}
        size={size} accent={ac} log={log}
        fmt={fmt} onChange={v => onChange({ [k]: v })}
        genActive={gen(k)} onRightClick={tog(k)}
      />
    )
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`
  const off = (v: number) => v < 0.01 ? '—' : pct(v)
  const crushFmt = (v: number) => v >= 12 ? '—' : `${Math.round(v)}b`
  const cutoffFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`

  const gridStyle = (cols: number, compact: boolean): React.CSSProperties => ({
    display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gap: compact ? 4 : 8, rowGap: compact ? 8 : 12,
    padding: compact ? '10px 6px 8px' : '14px 8px 12px', borderRadius: 12,
    background: 'linear-gradient(180deg,rgba(0,0,0,0.25),rgba(0,0,0,0.15))',
    border: '1px solid rgba(255,255,255,0.04)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
  })

  if (compact) {
    return (
      <div style={gridStyle(4, true)}>
        {knob('DRIVE', 'drive', 0, 1, '#ef4444', pct)}
        {knob('CRUSH', 'crush', 4, 12, '#fb923c', crushFmt)}
        {knob('CUTOFF', 'cutoff', 400, 18000, '#06b6d4', cutoffFmt, true)}
        {knob('VOL', 'vol', 0, 1, accent, pct)}
        {knob('CHORUS', 'chorus', 0, 1, '#34d399', off)}
        {knob('DELAY', 'delay', 0, 1, '#facc15', off)}
        {knob('REVERB', 'reverbWet', 0, 1, '#3b82f6', pct)}
        {knob('SHIMMER', 'shimmer', 0, 1, '#fbcfe8', off)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={gridStyle(6, false)}>
        {knob('DRIVE', 'drive', 0, 1, '#ef4444', pct)}
        {knob('BITE', 'bite', 1, 50, '#f59e0b', v => String(Math.round(v)))}
        {knob('CRUSH', 'crush', 4, 12, '#fb923c', crushFmt)}
        {knob('DENOISE', 'denoise', 0, 1, '#10b981', v => v < 0.01 ? 'OFF' : pct(v))}
        {knob('CUTOFF', 'cutoff', 400, 18000, '#06b6d4', cutoffFmt, true)}
        {knob('VOL', 'vol', 0, 1, accent, pct)}
        {knob('CHORUS', 'chorus', 0, 1, '#34d399', off)}
        {knob('PHASER', 'phaser', 0, 1, '#c084fc', off)}
        {knob('DELAY', 'delay', 0, 1, '#facc15', off)}
        {knob('SHIMMER', 'shimmer', 0, 1, '#fbcfe8', off)}
        {knob('REVERB', 'reverbWet', 0, 1, '#3b82f6', pct)}
        {knob('DECAY', 'reverbDecay', 0.5, 30, '#3b82f6', v => `${v.toFixed(1)}s`)}
      </div>

      {showSecondary && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8, rowGap: 12, padding: '10px 8px 8px',
        }}>
          {knob('RES', 'resonance', 0, 20, '#22d3ee', v => v.toFixed(1))}
          {knob('DLY T', 'delayTime', 0.05, 1.5, '#facc15', v => `${v.toFixed(2)}s`, true)}
          {knob('DLY FB', 'delayFb', 0, 0.95, '#fb923c', pct)}
        </div>
      )}
    </div>
  )
}
