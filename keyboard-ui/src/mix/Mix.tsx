/**
 * /mix — a música por baixo, até duas ambiências por cima, e o render.
 *
 * O catálogo vem de `backend/tools/ambient_catalog.py`: cave, wind, bird, chuva… que
 * moravam em cinco lugares (7panel, auto-video-editor, liminal, R2, raw_records), agora
 * numa lista só, com cópia idêntica juntada e LUFS medido.
 *
 * ## Duas camadas, não cinco
 * Lugar (chuva, rua, mata) e textura (vinil, fogo, grilo) são papéis diferentes. Mais
 * que isso vira sopa — o `ambiente.py` da casa chegou no mesmo número ouvindo.
 *
 * ## O knob é dB relativo ao limiar, não volume
 * O zero é o limiar que a casa mediu (lugar −34, textura −40 LUFS, música −20). O backend
 * mede cada cama e acerta o ganho, então duas gravações com volumes muito diferentes
 * chegam iguais no zero: "no limiar de você não saber se ouviu".
 *
 * ## Dois previews, e a tela diz qual é qual
 * ▶ na música toca o arquivo cru com as camas em loop no browser: aproximação, pra
 * escolher rápido. "preview 30 s" renderiza no backend com a MESMA cadeia do export —
 * esse é o que vale.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { VintageLed } from '@/components/ui/vintage-led'
import { resolveUrl, audioSrc } from '../lib/api'
import {
  CATEGORIAS, DURACOES, MAX_CAMADAS, PAPEL, PREVIEW_S, fmtDb, mmss, volumePreview,
  type Ambiente, type Camada, type Faixa, type Job,
} from './modelo'

/* ── estilo: o mesmo vocabulário da /eq (variáveis vintage do index.css) ── */

const rotulo: React.CSSProperties = {
  font: '500 10px/1 var(--font-vintage-mono, monospace)',
  letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--vintage-text-muted)',
}
const campo: React.CSSProperties = {
  width: '100%', padding: '9px 11px', background: 'var(--vintage-surface-2)',
  border: '1px solid var(--vintage-border)', color: 'var(--vintage-label)',
  font: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const lista: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2,
  maxHeight: 420, overflowY: 'auto', borderTop: '1px solid var(--vintage-border)',
}
function botao(ativo: boolean, desligado = false): React.CSSProperties {
  return {
    padding: '7px 12px', font: 'inherit', textAlign: 'left',
    background: ativo ? 'var(--vintage-surface-3)' : 'transparent',
    border: `1px solid ${ativo ? 'var(--vintage-value)' : 'var(--vintage-border)'}`,
    color: desligado ? 'var(--vintage-text-dim)' : ativo ? 'var(--vintage-value)' : 'var(--vintage-label)',
    cursor: desligado ? 'default' : 'pointer',
  }
}
const linha: React.CSSProperties = {
  width: '100%', display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 8px',
  font: 'inherit', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
}

export function Mix() {
  const [ambientes, setAmbientes] = useState<Ambiente[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [erroCarga, setErroCarga] = useState('')
  const [buscaMusica, setBuscaMusica] = useState('')
  const [buscaAmb, setBuscaAmb] = useState('')
  const [cats, setCats] = useState<Set<string>>(() => new Set())
  const [musica, setMusica] = useState<Faixa | null>(null)
  const [camadas, setCamadas] = useState<Camada[]>([])
  const [duracao, setDuracao] = useState<number | null>(null)
  const [formato, setFormato] = useState<'mp3' | 'wav'>('mp3')
  const [job, setJob] = useState<Job | null>(null)
  const [erro, setErro] = useState('')
  const [tocando, setTocando] = useState(false)

  const timerRef = useRef<number | null>(null)
  const camadaRefs = useRef<Record<string, HTMLAudioElement | null>>({})

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const [c, m] = await Promise.all([
          fetch(resolveUrl('/api/mix/catalog')).then(r => r.json()),
          fetch(resolveUrl('/api/mix/musicas')).then(r => r.json()),
        ])
        if (!vivo) return
        if (c?.error) setErroCarga(String(c.error))
        setAmbientes(c?.itens ?? [])
        setFaixas(m?.musicas ?? [])
      } catch (e) {
        if (vivo) setErroCarga(`não consegui falar com o backend: ${String(e)}`)
      }
    })()
    return () => {
      vivo = false
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  const porId = useMemo(() => new Map(ambientes.map(a => [a.id, a])), [ambientes])

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of ambientes) for (const k of a.categorias) c[k] = (c[k] ?? 0) + 1
    return c
  }, [ambientes])

  const ambFiltrados = useMemo(() => {
    const q = buscaAmb.trim().toLowerCase()
    return ambientes.filter(a =>
      (cats.size === 0 || a.categorias.some(k => cats.has(k)))
      && (!q || a.titulo.toLowerCase().includes(q) || a.id.includes(q)))
  }, [ambientes, cats, buscaAmb])

  const grupos = useMemo(() => {
    const q = buscaMusica.trim().toLowerCase()
    const g = new Map<string, Faixa[]>()
    for (const f of faixas) {
      if (q && !f.nome.toLowerCase().includes(q) && !f.grupo.toLowerCase().includes(q)) continue
      g.set(f.grupo, [...(g.get(f.grupo) ?? []), f])
    }
    return [...g]
  }, [faixas, buscaMusica])

  const alternaCat = (k: string) => setCats(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })

  const alternaCamada = (id: string) => setCamadas(prev => {
    if (prev.some(c => c.id === id)) return prev.filter(c => c.id !== id)
    if (prev.length >= MAX_CAMADAS) return prev
    return [...prev, { id, nivel_db: 0, respira: true }]
  })

  const ajusta = (id: string, patch: Partial<Camada>) =>
    setCamadas(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))

  /* O preview do browser segue o knob e a posição da camada (lugar/textura). */
  useEffect(() => {
    camadas.forEach((c, i) => {
      const el = camadaRefs.current[c.id]
      if (el) el.volume = volumePreview(porId.get(c.id)?.lufs ?? null, c.nivel_db, i)
      if (el && tocando && el.paused) {
        const p = el.play()
        if (p) p.catch(() => { /* autoplay recusado: o próximo ▶ resolve */ })
      }
    })
  }, [camadas, porId, tocando])

  const sincroniza = useCallback((tocar: boolean) => {
    setTocando(tocar)
    if (!tocar) for (const el of Object.values(camadaRefs.current)) el?.pause()
  }, [])

  const avisos = useMemo(() => {
    const out: string[] = []
    for (const c of camadas) {
      const a = porId.get(c.id)
      if (!a) continue
      out.push(...a.avisos)
      // mesmo portão do backend: unidade < 8 min que repete mais de 12x o ouvido acha
      if (duracao && a.dur_s && a.dur_s < 480 && duracao / a.dur_s > 12) {
        out.push(`${a.titulo} tem ${mmss(a.dur_s)} e repete ${Math.ceil(duracao / a.dur_s)}x: o ouvido acha a volta`)
      }
    }
    return out
  }, [camadas, porId, duracao])

  const rodando = job?.status === 'running'
  const pronto = !!musica && camadas.length > 0 && !rodando

  const renderizar = useCallback(async (preview: boolean) => {
    if (!musica || camadas.length === 0) return
    setErro('')
    setJob({ status: 'running', progress: 0, preview })
    try {
      const r = await fetch(resolveUrl('/api/mix/render'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          musica: musica.caminho,
          camadas,
          duracao_s: preview ? null : duracao,
          formato: preview ? 'mp3' : formato,
          preview_s: preview ? PREVIEW_S : null,
        }),
      })
      const data = await r.json()
      if (data?.error || !data?.job_id) {
        setErro(String(data?.error ?? 'o render não devolveu job'))
        setJob(null)
        return
      }
      const jobId: string = data.job_id
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const s = await fetch(resolveUrl(`/api/mix/status/${jobId}`))
            const j = await s.json() as Job
            setJob({ ...j, preview })
            if (j.status !== 'running') {
              if (timerRef.current) window.clearInterval(timerRef.current)
              if (j.status === 'error') setErro(String(j.error ?? 'erro no render'))
            }
          } catch { /* rede piscou: a próxima batida do polling resolve */ }
        })()
      }, preview ? 1000 : 2500)
    } catch (e) {
      setErro(String(e))
      setJob(null)
    }
  }, [musica, camadas, duracao, formato])

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--vintage-surface-1)', color: 'var(--vintage-text-muted)',
      padding: 30, font: '400 13px/1.5 var(--font-vintage-mono, monospace)',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 30 }}>
        <header style={{ display: 'grid', gap: 6 }}>
          <span style={rotulo}>mix</span>
          <span style={{ color: 'var(--vintage-label)' }}>
            música por baixo · até {MAX_CAMADAS} ambiências por cima · {ambientes.length} no catálogo
          </span>
          {erroCarga && <p style={{ color: 'var(--vintage-label)', margin: 0 }}>{erroCarga}</p>}
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
          {/* ── a música ── */}
          <section style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
            <span style={rotulo}>1 · música</span>
            <input value={buscaMusica} onChange={e => setBuscaMusica(e.target.value)}
              placeholder="buscar música" spellCheck={false} style={campo} />
            <ul aria-label="músicas" style={lista}>
              {grupos.map(([g, fs]) => (
                <li key={g} style={{ display: 'grid', gap: 2, paddingTop: 8 }}>
                  <span style={{ ...rotulo, color: 'var(--vintage-text-dim)', padding: '0 8px' }}>{g}</span>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {fs.map(f => {
                      const ativo = musica?.caminho === f.caminho
                      return (
                        <li key={f.caminho}>
                          <button type="button" aria-pressed={ativo} onClick={() => setMusica(ativo ? null : f)}
                            style={{ ...linha, color: ativo ? 'var(--vintage-value)' : 'var(--vintage-label)' }}>
                            <span style={{ flex: 1 }}>{f.nome}</span>
                            <span style={{ color: 'var(--vintage-text-dim)' }}>{f.mb} MB</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
            {musica && (
              <audio controls src={audioSrc(musica.caminho)}
                onPlay={() => sincroniza(true)} onPause={() => sincroniza(false)} onEnded={() => sincroniza(false)}
                style={{ width: '100%', height: 40, colorScheme: 'dark' }} />
            )}
          </section>

          {/* ── as ambiências ── */}
          <section style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
            <span style={rotulo}>2 · ambiência</span>
            <div role="group" aria-label="categorias" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORIAS.filter(k => contagem[k]).map(k => (
                <button key={k} type="button" aria-pressed={cats.has(k)} onClick={() => alternaCat(k)}
                  style={botao(cats.has(k))}>
                  {k} <span style={{ color: 'var(--vintage-text-dim)' }}>{contagem[k]}</span>
                </button>
              ))}
            </div>
            <input value={buscaAmb} onChange={e => setBuscaAmb(e.target.value)}
              placeholder="buscar ambiência" spellCheck={false} style={campo} />
            <ul aria-label="ambiências" style={lista}>
              {ambFiltrados.map(a => {
                const ativo = camadas.some(c => c.id === a.id)
                const cheio = !ativo && camadas.length >= MAX_CAMADAS
                return (
                  <li key={a.id}>
                    <button type="button" aria-pressed={ativo} aria-disabled={cheio}
                      title={cheio ? `no máximo ${MAX_CAMADAS} camadas` : a.avisos.join('\n') || undefined}
                      onClick={() => { if (!cheio) alternaCamada(a.id) }}
                      style={{
                        ...linha,
                        color: ativo ? 'var(--vintage-value)' : cheio ? 'var(--vintage-text-dim)' : 'var(--vintage-label)',
                        cursor: cheio ? 'default' : 'pointer',
                      }}>
                      <span style={{ flex: 1 }}>{a.avisos.length > 0 && '⚠ '}{a.titulo}</span>
                      <span style={{ color: 'var(--vintage-text-dim)' }}>{a.categorias.join(' · ')}</span>
                      <span style={{ color: 'var(--vintage-text-dim)', minWidth: 44, textAlign: 'right' }}>{mmss(a.dur_s)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        {/* ── o mix ── */}
        {camadas.length > 0 && (
          <section style={{ display: 'grid', gap: 14 }}>
            <span style={rotulo}>3 · camadas — o zero é o limiar da casa</span>
            <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
              {camadas.map((c, i) => {
                const a = porId.get(c.id)
                return (
                  <div key={c.id} style={{ display: 'grid', gap: 8, justifyItems: 'start', minWidth: 200 }}>
                    <span style={rotulo}>{PAPEL[i]}</span>
                    <span style={{ color: 'var(--vintage-value)' }}>{a?.titulo ?? c.id}</span>
                    <VintageKnob label="NÍVEL" min={-12} max={12} value={c.nivel_db} size={74}
                      fmt={fmtDb} onChange={v => ajusta(c.id, { nivel_db: Math.round(v) })} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" aria-pressed={c.respira} onClick={() => ajusta(c.id, { respira: !c.respira })}
                        style={botao(c.respira)}>
                        respira
                      </button>
                      <button type="button" onClick={() => alternaCamada(c.id)} style={botao(false)}>
                        tirar
                      </button>
                    </div>
                    {/* sem crossOrigin de propósito: não passa por Web Audio, e cama que só
                        existe no R2 do liminal vem por redirect de uma origem que não libera CORS */}
                    <audio ref={el => { camadaRefs.current[c.id] = el }} loop preload="none"
                      src={resolveUrl(`/api/mix/file?id=${encodeURIComponent(c.id)}`)} />
                  </div>
                )
              })}
            </div>
            <span style={{ ...rotulo, color: 'var(--vintage-text-dim)' }}>
              ▶ na música toca as camas no browser — é aproximação. o preview de {PREVIEW_S} s passa pela cadeia do render
            </span>
          </section>
        )}

        {avisos.length > 0 && (
          <ul aria-label="avisos" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {avisos.map(t => <li key={t} style={{ color: 'var(--vintage-label)' }}>⚠ {t}</li>)}
          </ul>
        )}

        {/* ── o render ── */}
        <footer style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
          borderTop: '1px solid var(--vintage-border)', paddingTop: 18,
        }}>
          <div role="group" aria-label="duração" style={{ display: 'flex', gap: 6 }}>
            {DURACOES.map(d => (
              <button key={d.rotulo} type="button" aria-pressed={duracao === d.s} onClick={() => setDuracao(d.s)}
                style={botao(duracao === d.s)}>{d.rotulo}</button>
            ))}
          </div>
          <div role="group" aria-label="formato" style={{ display: 'flex', gap: 6 }}>
            {(['mp3', 'wav'] as const).map(f => (
              <button key={f} type="button" aria-pressed={formato === f} onClick={() => setFormato(f)}
                style={botao(formato === f)}>{f}</button>
            ))}
          </div>
          <VintageLed
            active={rodando || job?.status === 'done'}
            pulse={rodando}
            color={job?.status === 'error' ? 'red' : rodando ? 'orange' : 'green'}
            label={rodando ? `renderizando ${Math.round(job?.progress ?? 0)}%` : job?.status === 'done' ? 'pronto' : 'parado'}
          />
          <button type="button" disabled={!pronto} onClick={() => void renderizar(true)}
            style={{ ...botao(false, !pronto), marginLeft: 'auto', padding: '12px 18px' }}>
            preview {PREVIEW_S} s
          </button>
          <button type="button" disabled={!pronto} onClick={() => void renderizar(false)}
            style={{
              ...botao(pronto, !pronto), padding: '12px 22px',
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
            exportar
          </button>
        </footer>

        {erro && <p style={{ color: 'var(--vintage-label)', margin: 0 }}>{erro}</p>}

        {job?.status === 'done' && job.out && (
          <section style={{ display: 'grid', gap: 10 }}>
            <span style={rotulo}>
              {job.preview ? `preview ${PREVIEW_S} s` : 'render'}
              {typeof job.lufs === 'number' ? ` · ${job.lufs.toFixed(1)} lufs` : ''}
            </span>
            <audio controls autoPlay={job.preview} src={audioSrc(job.out)}
              style={{ width: '100%', height: 40, colorScheme: 'dark' }} />
            {!job.preview && <code style={{ color: 'var(--vintage-label)', wordBreak: 'break-all' }}>{job.out}</code>}
          </section>
        )}
      </div>
    </div>
  )
}
