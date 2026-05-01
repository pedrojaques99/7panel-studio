import type React from 'react'

export const closeBtnStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 'var(--radius-xs)', border: 'none', cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)',
  fontSize: 'var(--fs-2xl)', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, transition: 'background 0.15s',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-input)',
  border: '1px solid rgba(0,0,0,0.8)',
  color: 'var(--text-pure)',
  fontSize: 'var(--fs-lg)',
  padding: '6px 10px',
  outline: 'none',
  boxShadow: 'var(--shadow-input)',
}

export const popupStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-sm)',
  padding: 12,
  background: 'var(--bg-popup)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.07)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
