/**
 * Paulstretch do clipe de áudio. Não é knob ao vivo: é render no backend (`/api/stretch`,
 * o mesmo da Fábrica), então vira AÇÃO que troca o arquivo do clipe — ⌘Z volta o original.
 *
 * Estica só o trecho que o clipe usa (offset → offset+dur): 4 min a 8x seriam 32 min de
 * render pra jogar fora. O WAV sai em `backend/assets/ps_*.wav`, raiz que o
 * `/api/mix/file` já serve, e o cache do backend devolve na hora o mesmo pedido.
 */
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { estilo } from '../era6/estilo'
import { carregarBuffer } from './motor'
import { mudarClipe, nomeClipe, type Clipe, type Projeto } from './modelo'

const FATORES = [2, 4, 8, 12, 24]
const JANELAS = [0.1, 0.25, 0.5, 1]

type Resposta = { path?: string; error?: string; fator_real?: number; fator_ok?: boolean }

export function EsticarClipe({ clipe, comecar, onMudar }: {
  clipe: Clipe; comecar: () => Projeto; onMudar: (p: Projeto) => void
}) {
  const [fator, setFator] = useState(8)
  const [janela, setJanela] = useState(0.25)
  const [seg, setSeg] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  const esticar = async () => {
    if (!clipe.arquivo || seg !== null) return
    const id = clipe.id
    const ini = clipe.offset ?? 0
    setMsg(null); setSeg(0)
    const t0 = performance.now()
    timer.current = window.setInterval(() => setSeg(Math.round((performance.now() - t0) / 1000)), 500)
    try {
      // o backend põe `-ss` antes do `-i` e `-to` depois: aí o `-to` conta como DURAÇÃO a
      // partir do corte, não como fim absoluto (medido: 10→14 a 2x devolveu 27,8 s, não 8)
      const q = new URLSearchParams({ path: clipe.arquivo, factor: String(fator), window: String(janela), trim_start: ini.toFixed(3), trim_end: clipe.dur.toFixed(3) })
      const r: Resposta = await apiFetch(`/api/stretch?${q}`).then(x => x.json())
      if (!r.path) throw new Error(r.error ?? 'stretch failed')
      const buf = await carregarBuffer(r.path)
      const dur = buf.duration
      onMudar(mudarClipe(comecar(), id, c => ({
        ...c, arquivo: r.path, nome: `${nomeClipe(c, 'clip')} ${fator}x`, offset: 0, dur,
        fadeIn: Math.min(dur / 2, (c.fadeIn ?? 0) * fator), fadeOut: Math.min(dur / 2, (c.fadeOut ?? 0) * fator),
      })))
      setMsg(r.fator_ok === false ? `stretched ${r.fator_real}x (short source)` : `stretched ${fator}x`)
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e))
    } finally {
      if (timer.current) window.clearInterval(timer.current)
      timer.current = null
      setSeg(null)
    }
  }

  const ocupado = seg !== null
  return (
    <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
      <span style={estilo.rotulo}>paulstretch</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={fator} onChange={e => setFator(Number(e.target.value))} aria-label="stretch factor" disabled={ocupado}>
          {FATORES.map(f => <option key={f} value={f}>{f}x</option>)}
        </select>
        <select value={janela} onChange={e => setJanela(Number(e.target.value))} aria-label="stretch window" disabled={ocupado}>
          {JANELAS.map(j => <option key={j} value={j}>{j}s win</option>)}
        </select>
        <button type="button" onClick={() => void esticar()} disabled={ocupado || !clipe.arquivo} style={estilo.botao(false, ocupado)}
          title="render the clip stretched and swap it in (⌘Z restores)">
          {ocupado ? `stretching ${seg}s` : 'stretch'}
        </button>
      </div>
      <span role="status" style={{ color: 'var(--vintage-text-muted)', fontVariantNumeric: 'tabular-nums', minHeight: 14 }}>
        {ocupado ? `${(clipe.dur * fator / 60).toFixed(1)} min of audio` : msg}
      </span>
    </div>
  )
}
