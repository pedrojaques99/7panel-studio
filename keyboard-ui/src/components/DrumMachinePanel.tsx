import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Rnd } from 'react-rnd'
import * as Tone from 'tone'
import Knob from '../lib/vintage-imports/Knob1'
import { loadGeo, saveGeo } from '../lib/geo'
import { PanelHeader } from '../lib/PanelHeader'
import { usePanelCtx } from '../lib/panel-context'
import { globalClock } from '../lib/global-clock'
import { getMasterCaptureNode } from '../lib/audio-context'

// ── FX DEFAULTS ─────────────────────────────────────────────────────────────
type FxParams = {
  drive: number
  bite: number
  cutoff: number
  resonance: number
  reverbWet: number
  reverbDecay: number
  vol: number
  crush: number
  chorus: number
  phaser: number
  delay: number
  delayTime: number
  delayFb: number
}

const FX_DEFAULTS: FxParams = {
  drive: 0,
  bite: 1,
  cutoff: 20000,
  resonance: 0,
  reverbWet: 0,
  reverbDecay: 3,
  vol: 0.75,
  crush: 12,
  chorus: 0,
  phaser: 0,
  delay: 0,
  delayTime: 0.3,
  delayFb: 0.3,
}

function crushWet(bits: number): number { return bits >= 12 ? 0 : 1 }

// ── Mini Slider ─────────────────────────────────────────────────────────────
function MiniSlider({ label, value, min, max, step, fmt, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  fmt: (v: number) => string; onChange: (v: number) => void
}) {
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault(); e.stopPropagation()
    const mult = e.shiftKey ? 0.2 : 1
    const delta = (e.deltaY < 0 ? 1 : -1) * step * 3 * mult
    onChange(Math.max(min, Math.min(max, value + delta)))
  }
  const onDoubleClick = () => onChange((min + max) / 2)
  const onCtx = (e: React.MouseEvent) => {
    e.preventDefault()
    const range = max - min
    const spread = e.ctrlKey && e.shiftKey ? 0.8 : e.shiftKey ? 0.4 : 0.15
    onChange(Math.max(min, Math.min(max, value + (Math.random() - 0.5) * 2 * spread * range)))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}
      onWheel={onWheel} onDoubleClick={onDoubleClick} onContextMenu={onCtx}
      title={`${label}: ${fmt(value)} · ctrl+scroll · dbl-click reset · right-click: rnd nudge`}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 900, letterSpacing: '0.18em', color: 'var(--text-20)' }}>{label}</span>
        <span style={{ fontSize: 'var(--fs-xs)', fontFamily: 'monospace', color: 'var(--text-40)' }}>{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        onMouseDown={e => e.stopPropagation()}
        style={{ width: '100%', accentColor: 'var(--status-ok)', cursor: 'pointer' }} />
    </div>
  )
}

// ── Synth Knob ──────────────────────────────────────────────────────────────
const KNOB_NATIVE = { w: 81, h: 75 }

function SynthKnob({
  label, value, min, max, size = 64, fmt, accent = '#00b860', log, onChange,
}: {
  label: string; value: number; min: number; max: number; size?: number
  fmt?: (v: number) => string; accent?: string; log?: boolean; onChange: (v: number) => void
}) {
  const [drag, setDrag] = useState(false)
  const [hover, setHover] = useState(false)
  const lastY = useRef(0)
  const sc = size / KNOB_NATIVE.w
  const scaledH = Math.round(KNOB_NATIVE.h * sc)
  const toNorm = (v: number) => log ? (Math.log(v / min)) / (Math.log(max / min)) : (v - min) / (max - min)
  const fromNorm = (n: number) => log ? min * Math.pow(max / min, n) : min + n * (max - min)
  const rotation = -135 + toNorm(value) * 270
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dy = lastY.current - e.clientY
      lastY.current = e.clientY
      const sensitivity = e.shiftKey ? 0.004 : 0.022
      const norm = toNorm(value) + dy * sensitivity
      onChange(clamp(fromNorm(Math.max(0, Math.min(1, norm)))))
    }
    const onUp = () => setDrag(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [drag, value, min, max, onChange])

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault(); e.stopPropagation()
    const sensitivity = e.shiftKey ? 0.002 : 0.012
    const norm = toNorm(value) + (e.deltaY < 0 ? 1 : -1) * sensitivity
    onChange(clamp(fromNorm(Math.max(0, Math.min(1, norm)))))
  }

  const onDoubleClick = () => onChange(fromNorm(0.5))

  return (
    <div
      className="select-none"
      onMouseDown={e => { if (e.button === 0) { setDrag(true); lastY.current = e.clientY; e.preventDefault() } }}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${label}: ${fmt ? fmt(value) : value.toFixed(2)}\ndrag ↕ · shift fine · ctrl+scroll · dbl-click reset`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        cursor: drag ? 'grabbing' : 'grab', opacity: hover || drag ? 1 : 0.85, transition: 'opacity 0.15s',
      }}
    >
      <div style={{ width: size, height: scaledH, position: 'relative', filter: hover ? `drop-shadow(0 0 6px ${accent}44)` : 'none', transition: 'filter 0.15s' }}>
        <div style={{ transform: `scale(${sc})`, transformOrigin: 'top left', width: KNOB_NATIVE.w, height: KNOB_NATIVE.h }}>
          <Knob rotation={rotation} />
        </div>
      </div>
      <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.05em', color: 'var(--text-40)', marginTop: -2 }}>
        {label}
      </span>
    </div>
  )
}

// ── MAIN PANEL ──────────────────────────────────────────────────────────────
export function DrumMachinePanel({ instanceId, onClose }: { instanceId: string; onClose: () => void }) {
  const { scale, zOf, bringToFront, endDrag, isDragging } = usePanelCtx()
  const geo = loadGeo(instanceId, { x: 400, y: 300, w: 820, h: 0 })

  const [buffer, setBuffer] = useState<Tone.ToneAudioBuffer | null>(null)
  const [sampleName, setSampleName] = useState('')
  const [fx, setFx] = useState<FxParams>(FX_DEFAULTS)
  const [seqSteps, setSeqSteps] = useState<boolean[]>(Array(16).fill(false))
  const seqStepsRef = useRef(seqSteps)
  seqStepsRef.current = seqSteps
  const [seqBpm, setSeqBpm] = useState(120)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [isDrop, setIsDrop] = useState(false)
  const [sampleFiles, setSampleFiles] = useState<File[]>([])
  const [sampleIndex, setSampleIndex] = useState(0)

  const engineRef = useRef<{
    fx: { bitcrusher: Tone.BitCrusher, distortion: Tone.Distortion, chebyshev: Tone.Chebyshev, filter: Tone.Filter, chorus: Tone.Chorus, phaser: Tone.Phaser, delay: Tone.PingPongDelay, reverb: Tone.Reverb }
    sampler: Tone.Sampler | null
  } | null>(null)

  const seqTimerRef = useRef<number | null>(null)
  const seqBpmRef = useRef(seqBpm)
  seqBpmRef.current = seqBpm

  async function ensureEngine() {
    if (engineRef.current) return engineRef.current
    await Tone.start()
    const bitcrusher = new Tone.BitCrusher(12)
    bitcrusher.connect(getMasterCaptureNode())
    const reverb = new Tone.Freeverb({ roomSize: 0.8, dampening: 4000, wet: 0 }).connect(bitcrusher)
    const delay = new Tone.PingPongDelay({ delayTime: 0.3, feedback: 0.3, wet: 0 }).connect(reverb)
    const phaser = new Tone.Phaser({ frequency: 0.5, octaves: 2, baseFrequency: 300, wet: 0 }).connect(delay)
    const chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 2.5, depth: 0.5, wet: 0 }).connect(phaser)
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -24 }).connect(chorus)
    const chebyshev = new Tone.Chebyshev({ order: 1 }).connect(filter)
    const distortion = new Tone.Distortion({ distortion: 0, oversample: 'none' }).connect(chebyshev)
    
    engineRef.current = {
      fx: { bitcrusher, distortion, chebyshev, filter, chorus, phaser, delay, reverb },
      sampler: null
    }
    return engineRef.current
  }

  // File loading
  async function loadFile(file: File) {
    const e = await ensureEngine()
    setSampleName(file.name)
    const url = URL.createObjectURL(file)
    const buf = new Tone.ToneAudioBuffer(url, () => {
      if (e.sampler) e.sampler.dispose()
      e.sampler = new Tone.Sampler({
        urls: { "C4": buf },
        release: 1,
      }).connect(e.fx.distortion)
      e.sampler.volume.value = Tone.gainToDb(fx.vol)
      URL.revokeObjectURL(url)
      setBuffer(buf)
    })
  }

  function nextSample(e: React.MouseEvent) {
    e.stopPropagation()
    if (sampleFiles.length <= 1) return
    const nextIdx = (sampleIndex + 1) % sampleFiles.length
    setSampleIndex(nextIdx)
    loadFile(sampleFiles[nextIdx])
    if (engineRef.current?.sampler) setTimeout(() => { try { engineRef.current?.sampler?.triggerAttack("C4") } catch {} }, 50)
  }

  function prevSample(e: React.MouseEvent) {
    e.stopPropagation()
    if (sampleFiles.length <= 1) return
    const nextIdx = (sampleIndex - 1 + sampleFiles.length) % sampleFiles.length
    setSampleIndex(nextIdx)
    loadFile(sampleFiles[nextIdx])
    if (engineRef.current?.sampler) setTimeout(() => { try { engineRef.current?.sampler?.triggerAttack("C4") } catch {} }, 50)
  }

  // FX updates
  function updateFx(patch: Partial<FxParams>) {
    setFx(prev => {
      const next = { ...prev, ...patch }
      const e = engineRef.current
      if (e) {
        if (patch.drive !== undefined) e.fx.distortion.distortion = patch.drive
        if (patch.bite !== undefined) e.fx.chebyshev.order = Math.max(1, Math.round(patch.bite))
        if (patch.cutoff !== undefined) e.fx.filter.frequency.rampTo(patch.cutoff, 0.3)
        if (patch.resonance !== undefined) e.fx.filter.Q.value = patch.resonance
        if (patch.reverbWet !== undefined) (e.fx.reverb as unknown as Tone.Freeverb).wet.rampTo(patch.reverbWet, 0.05)
        if (patch.crush !== undefined) {
          const b = Math.max(4, Math.round(patch.crush))
          e.fx.bitcrusher.bits.value = b
          e.fx.bitcrusher.wet.rampTo(crushWet(b), 0.05)
        }
        if (patch.chorus !== undefined) e.fx.chorus.wet.rampTo(patch.chorus, 0.05)
        if (patch.phaser !== undefined) e.fx.phaser.wet.rampTo(patch.phaser, 0.05)
        if (patch.delay !== undefined) e.fx.delay.wet.rampTo(patch.delay, 0.05)
        if (patch.delayTime !== undefined) e.fx.delay.delayTime.rampTo(patch.delayTime, 0.05)
        if (patch.delayFb !== undefined) e.fx.delay.feedback.rampTo(patch.delayFb, 0.05)
        if (patch.vol !== undefined && e.sampler) e.sampler.volume.rampTo(Tone.gainToDb(patch.vol), 0.05)
      }
      return next
    })
  }

  // Sequencer loop
  function toggleSeq() {
    if (isPlaying) {
      if (seqTimerRef.current != null) { window.clearInterval(seqTimerRef.current); seqTimerRef.current = null }
      globalClock.leave(instanceId)
      setIsPlaying(false)
      setCurrentStep(-1)
    } else {
      globalClock.join(instanceId)
      const e = engineRef.current
      let step = 0
      seqTimerRef.current = window.setInterval(() => {
        const stepsRef = seqStepsRef.current
        if (stepsRef[step] && e && e.sampler) {
          try { e.sampler.triggerAttack("C4") } catch { /* noop */ }
        }
        setCurrentStep(step)
        step = (step + 1) % 16
      }, (60000 / seqBpmRef.current) / 4) // 16th notes
      setIsPlaying(true)
    }
  }

  useEffect(() => {
    // dynamically update interval if playing
    if (isPlaying && seqTimerRef.current != null) {
      window.clearInterval(seqTimerRef.current)
      let step = currentStep
      const e = engineRef.current
      seqTimerRef.current = window.setInterval(() => {
        const stepsRef = seqStepsRef.current
        if (stepsRef[step] && e && e.sampler) {
          try { e.sampler.triggerAttack("C4") } catch { /* noop */ }
        }
        setCurrentStep(step)
        step = (step + 1) % 16
      }, (60000 / seqBpmRef.current) / 4)
    }
  }, [seqBpm])

  useEffect(() => {
    return () => {
      if (seqTimerRef.current != null) window.clearInterval(seqTimerRef.current)
      globalClock.leave(instanceId)
      if (engineRef.current?.sampler) engineRef.current.sampler.dispose()
    }
  }, [])

  function toggleStep(i: number) {
    setSeqSteps(prev => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })
  }

  return (
    <Rnd
      default={{ x: geo.x, y: geo.y, width: geo.w, height: 'auto' }}
      minWidth={600}
      enableResizing={{ left: true, right: true }}
      dragHandleClassName="drag-handle"
      className={`panel-drag${isDragging(instanceId) ? ' dragging' : ''}`}
      scale={scale}
      onDragStart={() => bringToFront(instanceId)}
      onDragStop={(_e, d) => { saveGeo(instanceId, { x: d.x, y: d.y }); endDrag(instanceId) }}
      onResizeStop={(_e, _d, ref, _delta, pos) => saveGeo(instanceId, { x: pos.x, y: pos.y, w: ref.offsetWidth })}
      style={{ zIndex: zOf(instanceId, 10) }}
    >
      <div style={{
        borderRadius: 'var(--radius-panel)', background: 'var(--bg-chassis)',
        boxShadow: 'var(--shadow-chassis)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        <PanelHeader title="Drum Machine" onClose={onClose} className="drag-handle">
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-40)', fontFamily: 'monospace' }}>
            {sampleName || 'No sample'}
          </span>
        </PanelHeader>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dropzone & Sequencer row */}
          <div style={{ display: 'flex', gap: 16 }}>
            {/* Drop Zone Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 120 }}>
              {/* Drop Zone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDrop(true) }}
                onDragLeave={() => setIsDrop(false)}
                onDrop={async e => {
                  e.preventDefault(); setIsDrop(false)
                  const items = e.dataTransfer.items
                  if (items && items.length > 0) {
                    const files: File[] = []
                    async function traverse(entry: any) {
                      if (entry.isFile) {
                        const file = await new Promise<File>(res => entry.file(res))
                        if (file.type.startsWith('audio/') || file.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i)) files.push(file)
                      } else if (entry.isDirectory) {
                        const dirReader = entry.createReader()
                        const entries = await new Promise<any[]>(res => dirReader.readEntries(res))
                        for (const e of entries) await traverse(e)
                      }
                    }
                    for (let i = 0; i < items.length; i++) {
                      const item = items[i]
                      if (item.kind === 'file') {
                        const entry = item.webkitGetAsEntry?.()
                        if (entry) await traverse(entry)
                      }
                    }
                    if (files.length > 0) {
                      setSampleFiles(files)
                      setSampleIndex(0)
                      loadFile(files[0])
                    }
                  }
                }}
                onClick={() => {
                  const inp = document.createElement('input')
                  inp.type = 'file'; inp.accept = 'audio/*'; inp.multiple = true
                  inp.onchange = e => {
                    const files = Array.from((e.target as HTMLInputElement).files || [])
                    if (files.length > 0) {
                      setSampleFiles(files)
                      setSampleIndex(0)
                      loadFile(files[0])
                    }
                  }
                  inp.click()
                }}
                onContextMenu={e => {
                  e.preventDefault()
                  const inp = document.createElement('input')
                  inp.type = 'file'; inp.accept = 'audio/*';
                  inp.setAttribute('webkitdirectory', 'true')
                  inp.onchange = ev => {
                    const files = Array.from((ev.target as HTMLInputElement).files || []).filter(f => f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i))
                    if (files.length > 0) {
                      setSampleFiles(files)
                      setSampleIndex(0)
                      loadFile(files[0])
                    }
                  }
                  inp.click()
                }}
                title="Click: load file(s) | Right-click: load folder | Drag & Drop: files or folders"
                style={{
                border: `2px dashed ${isDrop ? '#00b860' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-sm)', padding: '10px', textAlign: 'center',
                cursor: 'pointer', transition: 'all 0.15s',
                background: isDrop ? 'rgba(0,184,96,0.05)' : 'rgba(0,0,0,0.2)',
                width: 120, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              {buffer ? (
                <>
                  <div style={{ fontSize: 'var(--fs-2xl)' }}>🥁</div>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-40)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{sampleName}</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--fs-xl)', marginBottom: 4 }}>⬇️</div>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-20)' }}>SOLTAR SAMPLE</div>
                </>
              )}
              </div>
              
              {/* Arrow Controls */}
              {sampleFiles.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: 6 }}>
                  <button onClick={prevSample} style={{ border: 'none', background: 'var(--bg-active)', color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontSize: '10px' }} aria-label="Previous sample">◀</button>
                  <span style={{ fontSize: '10px', color: 'var(--text-40)', fontFamily: 'monospace', flex: 1, textAlign: 'center' }}>
                    {sampleIndex + 1}/{sampleFiles.length}
                  </span>
                  <button onClick={nextSample} style={{ border: 'none', background: 'var(--bg-active)', color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', fontSize: '10px' }} aria-label="Next sample">▶</button>
                </div>
              )}
            </div>

            {/* Sequencer Grid */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={toggleSeq}
                  style={{
                    padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                    background: isPlaying ? 'rgba(239,68,68,0.15)' : 'rgba(0,184,96,0.15)',
                    color: isPlaying ? '#ef4444' : '#00b860',
                    fontWeight: 800, fontSize: 'var(--fs-md)', textTransform: 'uppercase',
                  }}
                >{isPlaying ? 'STOP' : 'PLAY'}</button>

                <div style={{ flex: 1 }} />
                
                <MiniSlider label="BPM" value={seqBpm} min={40} max={240} step={1} fmt={v => v.toFixed(0)} onChange={setSeqBpm} />
                <button onClick={() => { if(engineRef.current?.sampler) engineRef.current.sampler.triggerAttack("C4") }} 
                  style={{ padding: '4px 10px', background: 'var(--bg-hover)', border: '1px solid var(--border-light)', color: 'var(--text-60)', borderRadius: 4, cursor: 'pointer', fontSize: '10px', fontWeight: 900 }}>TEST</button>
              </div>

              {/* 16 Steps */}
              <div style={{ display: 'flex', gap: 4, width: '100%', height: 40 }}>
                {seqSteps.map((active, i) => {
                  const isBeat = i % 4 === 0
                  const isCurrent = i === currentStep
                  return (
                    <button
                      key={i}
                      onClick={() => toggleStep(i)}
                      style={{
                        flex: 1, border: 'none', borderRadius: 4, cursor: 'pointer',
                        background: active ? '#00b860' : (isBeat ? 'rgba(255,255,255,0.15)' : 'var(--bg-active)'),
                        opacity: isCurrent ? 1 : 0.8,
                        boxShadow: isCurrent ? '0 0 10px rgba(255,255,255,0.4) inset' : 'none',
                        transition: 'background 0.05s',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          {/* FX Knobs (SynthPanel style) */}
          <div style={{ background: 'var(--bg-chassis)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <SynthKnob label="DRIVE" value={fx.drive} min={0} max={1} fmt={v => (v * 10).toFixed(1)} onChange={v => updateFx({ drive: v })} accent="#f59e0b" />
            <SynthKnob label="BITE" value={fx.bite} min={1} max={50} fmt={v => v.toFixed(0)} onChange={v => updateFx({ bite: v })} accent="#ef4444" />
            <SynthKnob label="CUTOFF" value={fx.cutoff} min={50} max={20000} log fmt={v => (v < 1000 ? v.toFixed(0) + ' Hz' : (v / 1000).toFixed(1) + ' k')} onChange={v => updateFx({ cutoff: v })} accent="#3b82f6" />
            <SynthKnob label="RES" value={fx.resonance} min={0} max={10} fmt={v => v.toFixed(1)} onChange={v => updateFx({ resonance: v })} accent="#3b82f6" />
            <SynthKnob label="CRUSH" value={fx.crush} min={4} max={12} fmt={v => v >= 12 ? 'OFF' : v.toFixed(0) + ' bit'} onChange={v => updateFx({ crush: v })} accent="#a78bfa" />
            <SynthKnob label="CHORUS" value={fx.chorus} min={0} max={1} fmt={v => (v * 100).toFixed(0) + '%'} onChange={v => updateFx({ chorus: v })} accent="#06b6d4" />
            <SynthKnob label="PHASER" value={fx.phaser} min={0} max={1} fmt={v => (v * 100).toFixed(0) + '%'} onChange={v => updateFx({ phaser: v })} accent="#ec4899" />
            <SynthKnob label="DELAY" value={fx.delay} min={0} max={1} fmt={v => (v * 100).toFixed(0) + '%'} onChange={v => updateFx({ delay: v })} accent="#8b5cf6" />
            <SynthKnob label="D.TIME" value={fx.delayTime} min={0.05} max={1} log fmt={v => (v * 1000).toFixed(0) + 'ms'} onChange={v => updateFx({ delayTime: v })} accent="#8b5cf6" />
            <SynthKnob label="D.FBK" value={fx.delayFb} min={0} max={0.9} fmt={v => (v * 100).toFixed(0) + '%'} onChange={v => updateFx({ delayFb: v })} accent="#8b5cf6" />
            <SynthKnob label="REVERB" value={fx.reverbWet} min={0} max={1} fmt={v => (v * 100).toFixed(0) + '%'} onChange={v => updateFx({ reverbWet: v })} accent="#10b981" />
            <SynthKnob label="VOL" value={fx.vol} min={0} max={1.5} fmt={v => (v * 100).toFixed(0) + '%'} onChange={v => updateFx({ vol: v })} accent="#34d399" />
          </div>
        </div>
      </div>
    </Rnd>
  )
}
