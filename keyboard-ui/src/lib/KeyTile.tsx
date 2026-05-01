import React from 'react'

export interface KeyTileProps {
  // state
  active?: boolean      // accent-glow active (soundboard playing, audio active)
  selected?: boolean    // key-on selected state (main keyboard selected key)
  playing?: boolean     // audio playing — green glow variant
  loading?: boolean     // show spinner instead of LED
  dragging?: boolean    // drag-over highlight
  dim?: boolean         // opacity 0.55
  // style
  accent?: string       // accent color used when active (default green)
  pressDepth?: number   // translateY px when active/selected (default 2)
  ledPosition?: 'tr' | 'br' // top-right or bottom-right (default br)
  // events
  onClick?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onMouseDown?: (e: React.MouseEvent) => void
  style?: React.CSSProperties
  className?: string
  children?: React.ReactNode
}

export const KeyTile = React.forwardRef<HTMLDivElement, KeyTileProps>(function KeyTile({
  active, selected, playing, loading, dragging, dim,
  accent = '#00b860', pressDepth = 2, ledPosition = 'br',
  onClick, onContextMenu, onMouseDown,
  style, className, children,
}, ref) {
  const bg = playing
    ? 'linear-gradient(145deg,rgba(0,184,96,0.18),rgba(0,184,96,0.06))'
    : active
      ? `linear-gradient(160deg,${accent}18 0%,${accent}08 100%)`
      : selected
        ? 'var(--bg-key-on)'
        : 'var(--bg-key-off)'

  const shadow = playing
    ? '0 9px 0 #000, 0 0 0 2px rgba(0,184,96,0.5), 0 12px 20px rgba(0,0,0,.6)'
    : active
      ? `0 1px 0 #000, inset 0 3px 6px rgba(0,0,0,.6), 0 0 12px ${accent}33`
      : selected
        ? 'var(--shadow-key-on)'
        : dragging
          ? '0 9px 0 #000, 0 0 0 3px #3b3d42, 0 12px 20px rgba(0,0,0,.6)'
          : 'var(--shadow-key-off)'

  const border = active
    ? `1px solid ${accent}30`
    : '1px solid transparent'

  const transform = (active && !playing) || selected ? `translateY(${pressDepth}px)` : undefined

  const ledColor = playing
    ? 'var(--status-ok)'
    : active
      ? accent
      : 'rgba(255,255,255,0.08)'
  const ledGlow = playing
    ? '0 0 6px rgba(0,184,96,0.9)'
    : active
      ? `0 0 4px ${accent}`
      : 'none'

  const ledStyle: React.CSSProperties = ledPosition === 'tr'
    ? { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%', background: ledColor, boxShadow: ledGlow }
    : { position: 'absolute', bottom: 7, right: 7, width: 4, height: 4, borderRadius: '50%', background: ledColor, boxShadow: ledGlow, animation: (playing || active) ? 'key-tile-led 2s ease-in-out infinite' : 'none', transition: 'background 0.2s, box-shadow 0.2s' }

  return (
    <div
      ref={ref}
      className={className}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseDown={onMouseDown}
      style={{
        borderRadius: 'var(--radius-key, 14px)',
        background: bg,
        boxShadow: shadow,
        border,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 5,
        position: 'relative', overflow: 'hidden',
        transition: 'box-shadow 0.15s, background 0.15s, border-color 0.15s, transform 0.1s',
        opacity: dim ? 0.55 : 1,
        transform,
        ...style,
      }}
    >
      {loading ? (
        <div className="key-tile-spin" style={{
          position: 'absolute', bottom: 5, right: 5, width: 8, height: 8,
          border: `1.5px solid ${accent}44`, borderTopColor: accent, borderRadius: '50%',
        }} />
      ) : (
        <div style={ledStyle} />
      )}
      {children}
    </div>
  )
})
