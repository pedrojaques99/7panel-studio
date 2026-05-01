import React, { createContext, useContext, useState, useEffect } from 'react'
import { closeBtnStyle } from './styles'
import { captureRegistry } from './capture-bus'

// Panels that register with captureRegistry wrap their JSX in this provider.
// PanelHeader reads it automatically — no prop threading needed.
export const CaptureIdContext = createContext<string | null>(null)

function useCaptureDot() {
  const captureId = useContext(CaptureIdContext)
  const [captured, setCaptured] = useState(() =>
    captureId ? captureRegistry.isCaptured(captureId) : false
  )
  useEffect(() => {
    if (!captureId) return
    return captureRegistry.subscribeRecording(() => {
      setCaptured(captureRegistry.isCaptured(captureId))
    })
  }, [captureId])
  return { captureId, captured }
}

interface PanelHeaderProps {
  title: string
  onClose?: () => void
  children?: React.ReactNode
  className?: string
  noBorder?: boolean
}

export function PanelHeader({ title, onClose, children, className, noBorder }: PanelHeaderProps) {
  const { captureId, captured } = useCaptureDot()

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 16px 12px',
        cursor: className ? 'grab' : undefined,
        borderBottom: noBorder ? undefined : '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
        userSelect: 'none',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {captureId && (
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: captured ? '#ef4444' : 'rgba(255,255,255,0.1)',
          boxShadow: captured ? '0 0 6px rgba(239,68,68,0.8)' : 'none',
          transition: 'background 0.2s, box-shadow 0.2s',
        }} />
      )}

      <span style={{
        fontSize: 'var(--fs-md)',
        fontWeight: 900,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'var(--text-40)',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {title}
      </span>

      {children && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{children}</div>}

      {onClose && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onClose}
          style={closeBtnStyle}
        >×</button>
      )}
    </div>
  )
}
