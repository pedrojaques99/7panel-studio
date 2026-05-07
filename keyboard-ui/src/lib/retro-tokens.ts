import type React from 'react'

// ─── Retro Hardware Design Tokens ───────────────────────────────
// Extracted from the Figma "RETRO TV (Community)" reference.
// Use these to build any retro-skeuomorphic component (TV, radio,
// cassette deck, amp, etc.) while keeping visual consistency.

// ── Color Palette ──────────────────────────────────────────────

export const RETRO = {
  // Body & chassis
  bodyGradient: 'linear-gradient(180deg, rgba(230,219,209,0.75) 0%, rgba(153,146,140,0.75) 100%), #676665',
  consoleSurface: '#CDC4BB',
  consoleBottomEdge: 'linear-gradient(180deg, #CDC4BB 0%, #4D4946 100%)',
  footGradient: 'linear-gradient(90deg, #9A938D 0%, #C1B8B1 40%, #CCC3BB 51%, #BDB4AD 65%, #9A938D 100%)',

  // Bezel layers (outer → inner)
  bezelOuter: 'linear-gradient(0deg, rgba(81,76,73,0.5), rgba(81,76,73,0.5)), linear-gradient(135deg, rgba(70,70,70,0.45) -1%, rgba(13,13,13,0.27) 42%, rgba(0,0,0,0.45) 49%, rgba(13,13,13,0.32) 56%, rgba(49,49,49,0.45) 92%)',
  bezelInner: 'linear-gradient(178deg, rgba(0,0,0,0) -21%, rgba(0,0,0,0.25) -10%, rgba(0,0,0,0.5) -6%, rgba(0,0,0,0.25) 8%, rgba(0,0,0,0) 75%), linear-gradient(183deg, rgba(70,70,70,0.45) 7%, rgba(13,13,13,0.27) 93%, rgba(0,0,0,0.45) 114%), #BFB7AB',

  // Screen
  screenOn: '#1E201D',
  screenOff: 'radial-gradient(ellipse at 50% 50%, #1a1c18 0%, #111310 40%, #080a07 100%)',
  screenInsetShadow: 'inset 0 0 28px rgba(0,0,0,0.8)',
  screenVignette: 'inset 0 0 60px rgba(0,0,0,0.5)',
  scanlines: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',

  // Dial / knob (metallic outer ring)
  dialGradient: 'linear-gradient(143deg, #CCC4B7 20%, #BAB4AB 40%, #ABA49C 50%, #736D68 86%)',
  dialShadow: '0 1.5px 1.5px rgba(0,0,0,0.25), 0 3px 3px rgba(0,0,0,0.15)',

  // Dial inner colors (functional accents)
  dialRed: '#EA5959',
  dialGreen: '#39AE5A',

  // Power button
  powerOn: '#CEC5BC',
  powerOff: '#706B66',
  powerShadowOn: 'inset 0 -1.5px 3px rgba(0,0,0,0.25), inset 0 1.5px 3px rgba(255,255,255,0.25)',
  powerShadowOff: 'inset 0 1.5px 3px rgba(0,0,0,0.4)',

  // LED indicators
  ledPowerOn: '#72956F',
  ledPowerOff: '#4a5248',
  ledSignalOn: '#CD8A8A',
  ledSignalOff: '#6e5050',

  // Text on retro surfaces (dark text on light chassis)
  textOnChassis: '#4a4540',

  // Border radii (relative to retro aesthetic)
  radiusBody: 6,
  radiusBezelOuter: 4,
  radiusBezelInner: 20,
  radiusScreen: 14,
} as const

// ── Reusable Style Builders ────────────────────────────────────

export const retroDialStyle = (size = 36): React.CSSProperties => ({
  width: size, height: size, borderRadius: '50%',
  background: RETRO.dialGradient,
  boxShadow: RETRO.dialShadow,
  border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
})

export const retroDialInnerStyle = (color: string, size = 36): React.CSSProperties => ({
  width: '67%', height: '67%', borderRadius: '50%',
  background: color,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: Math.round(size * 0.36), color: '#000', fontWeight: 900,
})

export const retroPowerBtnStyle = (isOn: boolean): React.CSSProperties => ({
  width: 44, height: 24, borderRadius: 3,
  background: isOn ? RETRO.powerOn : RETRO.powerOff,
  boxShadow: isOn ? RETRO.powerShadowOn : RETRO.powerShadowOff,
  border: 'none', cursor: 'pointer',
  fontSize: 10, color: RETRO.textOnChassis,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
})

export const retroLedStyle = (active: boolean, onColor: string, offColor: string): React.CSSProperties => ({
  width: 10, height: 8, borderRadius: 1,
  background: active ? onColor : offColor,
})

export const retroConsoleBarStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  background: RETRO.consoleSurface,
  borderRadius: '0 0 4px 4px',
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

export const retroScreenStyle = (isOn: boolean): React.CSSProperties => ({
  position: 'absolute',
  inset: '5% 4%',
  background: isOn ? RETRO.screenOn : RETRO.screenOff,
  borderRadius: RETRO.radiusScreen,
  boxShadow: RETRO.screenInsetShadow,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
})

export const retroScanlineOverlay: React.CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  background: RETRO.scanlines,
  borderRadius: RETRO.radiusScreen, zIndex: 2,
}

export const retroVignetteOverlay: React.CSSProperties = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  boxShadow: RETRO.screenVignette,
  borderRadius: RETRO.radiusScreen, zIndex: 2,
}

export const retroTimecodeStyle: React.CSSProperties = {
  position: 'absolute', bottom: 6, left: 8, zIndex: 3,
  fontFamily: 'monospace', fontSize: 'var(--fs-xs)',
  color: 'rgba(255,255,255,0.5)',
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  pointerEvents: 'none',
}

export const retroFootStyle: React.CSSProperties = {
  width: 52, height: 6, borderRadius: '0 0 3px 3px',
  background: RETRO.footGradient,
}
