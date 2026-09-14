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
import {
  Anchor, AudioLines, Bird, Building2, Check, ChevronDown, ChevronRight, CircleDashed,
  CloudRain, Droplet, Filter, Flame, Gamepad2, History, Home, Layers, Maximize2, Moon,
  Mountain, MoreHorizontal, Pause, PartyPopper, Play, Settings2, Ship, Shapes, Sparkles,
  Trees, Volume2, VolumeX, Wind, X,
} from 'lucide-react'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { VintageLed } from '@/components/ui/vintage-led'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { resolveUrl, audioSrc } from '../lib/api'
import {
  CATEGORIAS, DURACOES, MAX_CAMADAS, PAPEL, PREVIEW_S, combosIguais, fmtDb, fmtS, mmss,
  sugerirCamadas, tempo, volumePreview,
  type Ambiente, type Camada, type Faixa, type Job, type Visual,
} from './modelo'

/* um icone por categoria de ambiência — a lista era só texto, agora escaneia mais rápido */
const ICONE_CATEGORIA: Record<string, React.ComponentType<{ size?: number }>> = {
  chuva: CloudRain, vento: Wind, passaros: Bird, caverna: Mountain, fogo: Flame,
  agua: Droplet, floresta: Trees, noite: Moon, cidade: Building2, interior: Home,
  ruido: AudioLines, textura: Layers, outro: MoreHorizontal,
}
/* idem pro visual do loop de 1h — categorias vêm do `visual_catalog.py`, cobre as que existem
   hoje; o que não bater cai no ícone genérico. */
const ICONE_VISUAL: Record<string, React.ComponentType<{ size?: number }>> = {
  abstrato: Shapes, cidade: Building2, costa: Ship, festa: PartyPopper, ia: Sparkles,
  interior: Home, 'jogo antigo': Gamepad2, naufrágio: Anchor, neon: Sparkles,
  still: Layers, túnel: CircleDashed,
}
function iconeCategoria(mapa: Record<string, React.ComponentType<{ size?: number }>>, k: string) {
  const Icone = mapa[k] ?? MoreHorizontal
  return <Icone size={12} />
}

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
/* mesmo botao(), com o icone e o rotulo alinhados — pros controles de camada (mudo,
   respira, tirar) e transporte, que antes eram emoji cru ou so texto. */
function botaoIcone(ativo: boolean, desligado = false): React.CSSProperties {
  return { ...botao(ativo, desligado), display: 'flex', alignItems: 'center', gap: 6 }
}
const linha: React.CSSProperties = {
  width: '100%', display: 'flex', gap: 12, alignItems: 'baseline', padding: '7px 8px',
  font: 'inherit', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
}
/* cada bloco da tela (música, ambiência, visual, render) é um painel próprio — antes era
   só espaçamento solto, sem contorno, e tudo se misturava numa coluna só. */
const painel: React.CSSProperties = {
  background: 'var(--vintage-surface-2)', border: '1px solid var(--vintage-border)',
  padding: 20, display: 'grid', gap: 12, alignContent: 'start',
}
/* os controles da camada ativa (nível, mudo, respira) — sempre no TOPO do painel de
   ambiência/música, colados na coisa que eles afetam, não numa seção à parte lá embaixo. */
const paramCard: React.CSSProperties = {
  display: 'grid', gap: 8, justifyItems: 'start', padding: 12,
  background: 'var(--vintage-surface-1)', border: '1px solid var(--vintage-border)', minWidth: 190,
}

/**
 * Filtro de categoria: era 12 chips sempre abertos (achado #2 da auditoria). Agora só os
 * ATIVOS ficam à vista; o resto mora atrás de um combobox (shadcn Popover+Command, instalado
 * na sessão que pediu este redesenho — nenhum dropdown feito à mão).
 */
function SeletorCategorias({ grupoLabel, todas, contagem, ativos, onToggle, icones, rotuloVazio }: {
  grupoLabel: string; todas: readonly string[]; contagem: Record<string, number>; ativos: Set<string>
  onToggle: (k: string) => void; icones: Record<string, React.ComponentType<{ size?: number }>>
  rotuloVazio: string
}) {
  const [aberto, setAberto] = useState(false)
  const disponiveis = todas.filter(k => contagem[k])
  return (
    <div role="group" aria-label={grupoLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {[...ativos].filter(k => contagem[k]).map(k => (
        <button key={k} type="button" className="mix-btn" onClick={() => onToggle(k)}
          style={{ ...botaoIcone(true) }}>
          {iconeCategoria(icones, k)} {k} <X size={10} />
        </button>
      ))}
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button type="button" className="mix-btn" style={botaoIcone(false)}>
            <Filter size={12} /> {ativos.size > 0 ? 'mais categoria' : rotuloVazio}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 border-vintage-border bg-vintage-surface-2 p-0 text-vintage-label">
          <Command className="bg-transparent">
            <CommandInput placeholder="buscar categoria" className="text-vintage-label" />
            <CommandList>
              <CommandEmpty className="py-4 text-center text-xs text-vintage-text-dim">nada aqui</CommandEmpty>
              <CommandGroup>
                {disponiveis.map(k => (
                  <CommandItem key={k} value={k} onSelect={() => onToggle(k)}
                    className="cursor-pointer gap-2 text-vintage-label data-[selected=true]:bg-vintage-surface-3 data-[selected=true]:text-vintage-value">
                    {iconeCategoria(icones, k)}
                    <span style={{ flex: 1 }}>{k}</span>
                    <span className="text-vintage-text-dim">{contagem[k]}</span>
                    {ativos.has(k) && <Check size={12} style={{ color: 'var(--vintage-value)' }} />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
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
  const [visuais, setVisuais] = useState<Visual[]>([])
  const [catsVisual, setCatsVisual] = useState<Set<string>>(() => new Set())
  const [visualId, setVisualId] = useState<string | null>(null)
  const [duracao, setDuracao] = useState<number | null>(null)
  const [formato, setFormato] = useState<'mp3' | 'wav'>('mp3')
  const [job, setJob] = useState<Job | null>(null)
  const [erro, setErro] = useState('')
  const [tocando, setTocando] = useState(false)
  const [verTodasAmb, setVerTodasAmb] = useState(false)
  const [comboSalvo, setComboSalvo] = useState<Camada[]>([])
  const [opcoesAbertas, setOpcoesAbertas] = useState(false)

  const timerRef = useRef<number | null>(null)
  const camadaRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const musicaRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [mudo, setMudo] = useState<Set<string>>(() => new Set())
  const [posicao, setPosicao] = useState({ atual: 0, dur: 0 })

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const [c, m, v] = await Promise.all([
          fetch(resolveUrl('/api/mix/catalog')).then(r => r.json()),
          fetch(resolveUrl('/api/mix/musicas')).then(r => r.json()),
          fetch(resolveUrl('/api/mix/visuais')).then(r => r.json()),
        ])
        if (!vivo) return
        if (c?.error) setErroCarga(String(c.error))
        setAmbientes(c?.itens ?? [])
        setFaixas(m?.musicas ?? [])
        setVisuais(v?.itens ?? [])
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

  /* o vídeo do loop de 1h é escolha por música: relê a escolha salva quando troca de música */
  useEffect(() => {
    if (!musica) { setVisualId(null); return }
    let vivo = true
    void fetch(resolveUrl(`/api/mix/visual-pick?musica=${encodeURIComponent(musica.caminho)}`))
      .then(r => r.json()).then(d => { if (vivo) setVisualId(d?.visual_id ?? null) })
      .catch(() => { if (vivo) setVisualId(null) })
    return () => { vivo = false }
  }, [musica])

  /* combo de ambiências por música: mesmo esquema do visual (linha 209 acima) — relê ao
     trocar de música, e "ver todas" reseta junto pra próxima música não abrir já de par
     em par. O botão "usar de novo" some sozinho quando já é o que está tocando (combosIguais) */
  useEffect(() => {
    setVerTodasAmb(false)
    if (!musica) { setComboSalvo([]); return }
    let vivo = true
    void fetch(resolveUrl(`/api/mix/camada-pick?musica=${encodeURIComponent(musica.caminho)}`))
      .then(r => r.json()).then(d => { if (vivo) setComboSalvo(d?.camadas ?? []) })
      .catch(() => { if (vivo) setComboSalvo([]) })
    return () => { vivo = false }
  }, [musica])

  /* grava o combo (estrutura, não cada arrasto de knob) sempre que a música está escolhida —
     debounced pra não escrever um arquivo a cada tecla de busca de categoria */
  const assinaturaCamadas = camadas.map(c => c.id).join(',')
  useEffect(() => {
    if (!musica) return
    const t = window.setTimeout(() => {
      void fetch(resolveUrl('/api/mix/camada-pick'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musica: musica.caminho, camadas }),
      }).catch(() => { /* rede piscou: a próxima mudança tenta de novo */ })
    }, 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musica, assinaturaCamadas])

  const usarComboSalvo = useCallback(() => {
    setCamadas(comboSalvo.filter(c => porId.has(c.id)).slice(0, MAX_CAMADAS))
  }, [comboSalvo, porId])

  const escolherVisual = useCallback((id: string) => {
    if (!musica) return
    const novo = visualId === id ? null : id
    setVisualId(novo)
    void fetch(resolveUrl('/api/mix/visual-pick'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ musica: musica.caminho, visual_id: novo }),
    }).catch(() => { /* rede piscou: reabrir a música mostra o que ficou salvo de fato */ })
  }, [musica, visualId])

  const contagemVisual = useMemo(() => {
    const c: Record<string, number> = {}
    for (const v of visuais) for (const k of v.categorias) c[k] = (c[k] ?? 0) + 1
    return c
  }, [visuais])

  const visFiltrados = useMemo(() =>
    visuais.filter(v => catsVisual.size === 0 || v.categorias.some(k => catsVisual.has(k))),
  [visuais, catsVisual])

  const alternaCatVisual = (k: string) => setCatsVisual(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  })

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

  const filtroAmbAtivo = cats.size > 0 || buscaAmb.trim().length > 0

  /* sugestões: heurística de `sugerirCamadas` (categoria nova, sem aviso de repetição,
     desempate por uso real em export) — só faz sentido com música escolhida */
  const sugestoes = useMemo(
    () => (musica ? sugerirCamadas(ambientes, porId, camadas, duracao, 6) : []),
    [musica, ambientes, porId, camadas, duracao],
  )

  /* divulgação progressiva (achado #2): sem busca/filtro explícito, a lista mostra só o que
     ajuda a decidir rápido — sugeridas + já usadas nesta música antes + as já ativas — em vez
     das 127 de cara. "ver todas" ou qualquer busca tira o atalho do caminho. */
  const ambCuradas = useMemo(() => {
    if (filtroAmbAtivo || verTodasAmb) return ambFiltrados
    if (!musica) return ambFiltrados.slice(0, 8)
    const ids = new Set([...camadas.map(c => c.id), ...sugestoes.map(a => a.id), ...comboSalvo.map(c => c.id)])
    const curadas = ambFiltrados.filter(a => ids.has(a.id))
    return curadas.length > 0 ? curadas : ambFiltrados.slice(0, 8)
  }, [ambFiltrados, filtroAmbAtivo, verTodasAmb, musica, camadas, sugestoes, comboSalvo])

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
    return [...prev, { id, nivel_db: 0, respira: true, gap_s: 0 }]
  })

  const ajusta = (id: string, patch: Partial<Camada>) =>
    setCamadas(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))

  const alternaMudo = (id: string) => setMudo(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  /* O preview do browser segue o knob, a posição da camada (lugar/textura) e o mudo. */
  useEffect(() => {
    camadas.forEach((c, i) => {
      const el = camadaRefs.current[c.id]
      if (el) el.volume = mudo.has(c.id) ? 0 : volumePreview(porId.get(c.id)?.lufs ?? null, c.nivel_db, i)
      if (el && tocando && el.paused) {
        const p = el.play()
        if (p) p.catch(() => { /* autoplay recusado: o próximo ▶ resolve */ })
      }
    })
  }, [camadas, porId, tocando, mudo])

  const sincroniza = useCallback((tocar: boolean) => {
    setTocando(tocar)
    if (!tocar) for (const el of Object.values(camadaRefs.current)) el?.pause()
    // o video do visual escolhido toca junto — e o "como se fosse o render" do transporte
    const v = videoRef.current
    if (v) {
      if (tocar && v.paused) v.play().catch(() => { /* autoplay recusado: o proximo clique resolve */ })
      else if (!tocar) v.pause()
    }
  }, [])

  /* Play/pause único: toca a música e, junto, tudo que já estiver marcado como camada —
     é o "player" pedido, em vez do usuário ter que achar o transporte nativo do <audio>. */
  const alternaTransporte = useCallback(() => {
    const el = musicaRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => { /* autoplay recusado: outro clique resolve */ })
    else el.pause()
  }, [])

  const verFullscreen = useCallback(() => {
    void videoRef.current?.requestFullscreen().catch(() => { /* browser recusou: sem drama */ })
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
          // visual só compõe no export de verdade — preview fica rápido, só áudio
          // (PLAN-mix-export-video.md)
          ...(!preview && visualId ? { visual_id: visualId } : {}),
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
  }, [musica, camadas, duracao, formato, visualId])

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--vintage-surface-1)', color: 'var(--vintage-text-muted)',
      padding: '30px 30px 110px', font: '400 13px/1.5 var(--font-vintage-mono, monospace)',
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 30 }}>
        <header style={{ display: 'grid', gap: 6 }}>
          <span style={rotulo}>mix</span>
          <span style={{ color: 'var(--vintage-label)' }}>
            música por baixo · até {MAX_CAMADAS} ambiências por cima · {ambientes.length} no catálogo
          </span>
          {erroCarga && <p style={{ color: 'var(--vintage-label)', margin: 0 }}>{erroCarga}</p>}
        </header>

        {/* as camadas ativas ficam escondidas aqui (audio + volume real), mas o CONTROLE delas
            mora dentro do painel de ambiência, colado na textura que cada uma é — ver abaixo */}
        {camadas.map(c => (
          <audio key={c.id} ref={el => { camadaRefs.current[c.id] = el }} loop preload="none"
            src={resolveUrl(`/api/mix/file?id=${encodeURIComponent(c.id)}`)} style={{ display: 'none' }} />
        ))}
        {/* a música tem só ESTE elemento — sem controle nativo visível duplicado. O transporte
           mora inteiro na barra fixa do rodapé, junto do timecode. e.currentTarget só existe
           enquanto o evento está disparando — lido ANTES do updater do setState, senão chega
           null quando o updater roda (foi o "Cannot read properties of null (reading
           duration)" que quebrou a tela). */}
        {musica && (
          <audio ref={musicaRef} src={audioSrc(musica.caminho)}
            onPlay={() => sincroniza(true)} onPause={() => sincroniza(false)} onEnded={() => sincroniza(false)}
            onLoadedMetadata={e => { const dur = e.currentTarget.duration || 0; setPosicao(p => ({ ...p, dur })) }}
            onTimeUpdate={e => { const atual = e.currentTarget.currentTime; setPosicao(p => ({ ...p, atual })) }}
            style={{ display: 'none' }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {/* ── a música ── */}
          <section style={painel}>
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
                          <button type="button" className="mix-btn mix-linha" aria-pressed={ativo}
                            onClick={() => setMusica(ativo ? null : f)}
                            style={{ ...linha, color: ativo ? 'var(--vintage-value)' : 'var(--vintage-label)' }}>
                            <span style={{ flex: 1 }}>{f.nome}</span>
                            <span style={{ color: 'var(--vintage-text-dim)', minWidth: 44, textAlign: 'right' }}>{mmss(f.dur_s)}</span>
                            <span style={{ color: 'var(--vintage-text-dim)', minWidth: 74 }}>{f.modificado ?? '—'}</span>
                            <span style={{ color: 'var(--vintage-text-dim)', minWidth: 60, textAlign: 'right' }}>{f.mb} MB</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          {/* ── as ambiências ── */}
          <section style={painel}>
            <span style={rotulo}>2 · ambiência — o zero do nível é o limiar da casa</span>
            {camadas.length > 0 && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {camadas.map((c, i) => {
                  const a = porId.get(c.id)
                  return (
                    <div key={c.id} className="mix-entra" style={paramCard}>
                      {/* camada 3+ cicla pelos dois papéis testados (lugar/textura), mesma
                          regra do backend — não inventa um terceiro papel */}
                      <span style={rotulo}>{PAPEL[i % PAPEL.length]}</span>
                      <span style={{ color: 'var(--vintage-value)' }}>{a?.titulo ?? c.id}</span>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {/* -60..+12: o zero e o limiar da casa, mas o fader tem que alcancar
                            silencio de verdade — com -12 de piso uma fonte gravada quente
                            nunca sumia, so o mudo resolvia. */}
                        <VintageKnob label="NÍVEL" min={-60} max={12} value={c.nivel_db} size={68}
                          fmt={fmtDb} onChange={v => ajusta(c.id, { nivel_db: Math.round(v) })} />
                        {/* silêncio entre uma volta e a próxima — textura que é evento isolado
                            (canto, rajada) não deveria tocar colada nela mesma */}
                        <VintageKnob label="GAP" min={0} max={60} value={c.gap_s} size={68}
                          fmt={fmtS} onChange={v => ajusta(c.id, { gap_s: Math.round(v) })} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="mix-btn" aria-pressed={mudo.has(c.id)} title="mudo só no preview do browser"
                          onClick={() => alternaMudo(c.id)} style={botaoIcone(mudo.has(c.id))}>
                          {mudo.has(c.id) ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <button type="button" className="mix-btn" aria-pressed={c.respira} title="respira: leve variação de volume ao longo do loop"
                          onClick={() => ajusta(c.id, { respira: !c.respira })} style={botaoIcone(c.respira)}>
                          <Wind size={14} /> respira
                        </button>
                        <button type="button" className="mix-btn" title="tirar camada" onClick={() => alternaCamada(c.id)} style={botaoIcone(false)}>
                          <X size={14} /> tirar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <SeletorCategorias grupoLabel="categorias" todas={CATEGORIAS} contagem={contagem} ativos={cats}
              onToggle={alternaCat} icones={ICONE_CATEGORIA} rotuloVazio="categoria" />

            {comboSalvo.length > 0 && !combosIguais(comboSalvo, camadas) && (
              <button type="button" className="mix-btn" onClick={usarComboSalvo} style={botaoIcone(false)}>
                <History size={12} /> usar combo salvo de antes ({comboSalvo.length})
              </button>
            )}

            {!filtroAmbAtivo && camadas.length < MAX_CAMADAS && sugestoes.length > 0 && (
              <div className="mix-entra" style={{ display: 'grid', gap: 4 }}>
                <span style={{ ...rotulo, color: 'var(--vintage-text-dim)' }}>
                  <Sparkles size={10} style={{ verticalAlign: '-1px' }} /> sugeridas pra essa música
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sugestoes.map(a => (
                    <button key={a.id} type="button" className="mix-btn" onClick={() => alternaCamada(a.id)}
                      title={a.categorias.join(' · ')} style={botaoIcone(false)}>
                      {iconeCategoria(ICONE_CATEGORIA, a.categorias[0] ?? 'outro')} {a.titulo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input value={buscaAmb} onChange={e => setBuscaAmb(e.target.value)}
              placeholder="buscar ambiência" spellCheck={false} style={campo} />
            <ul aria-label="ambiências" style={lista}>
              {ambCuradas.map(a => {
                const ativo = camadas.some(c => c.id === a.id)
                const cheio = !ativo && camadas.length >= MAX_CAMADAS
                return (
                  <li key={a.id}>
                    <button type="button" className="mix-btn mix-linha" aria-pressed={ativo} aria-disabled={cheio}
                      title={cheio ? `no máximo ${MAX_CAMADAS} camadas` : a.avisos.join('\n') || undefined}
                      onClick={() => { if (!cheio) alternaCamada(a.id) }}
                      style={{
                        ...linha,
                        color: ativo ? 'var(--vintage-value)' : cheio ? 'var(--vintage-text-dim)' : 'var(--vintage-label)',
                        cursor: cheio ? 'default' : 'pointer',
                      }}>
                      <span style={{ flex: 1 }}>{a.avisos.length > 0 && '⚠ '}{a.titulo}</span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        {a.categorias.slice(0, 2).map(k => (
                          <span key={k} style={{
                            padding: '1px 6px', fontSize: 10, background: 'var(--vintage-surface-3)',
                            color: 'var(--vintage-text-muted)', border: '1px solid var(--vintage-border)',
                          }}>{k}</span>
                        ))}
                        {a.categorias.length > 2 && (
                          <span style={{ color: 'var(--vintage-text-dim)' }}>+{a.categorias.length - 2}</span>
                        )}
                      </span>
                      <span style={{ color: 'var(--vintage-text-dim)', minWidth: 44, textAlign: 'right' }}>{mmss(a.dur_s)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {!filtroAmbAtivo && (
              verTodasAmb
                ? (ambFiltrados.length > 8 && (
                  <button type="button" className="mix-btn" onClick={() => setVerTodasAmb(false)} style={botao(false)}>
                    <ChevronRight size={12} /> recolher pras sugeridas
                  </button>
                ))
                : ambFiltrados.length > ambCuradas.length && (
                  <button type="button" className="mix-btn" onClick={() => setVerTodasAmb(true)} style={botao(false)}>
                    <ChevronDown size={12} /> ver todas as {ambFiltrados.length} ambiências
                  </button>
                )
            )}
            <span style={{ ...rotulo, color: 'var(--vintage-text-dim)' }}>
              ▶ na música toca as camas no browser — é aproximação. o preview de {PREVIEW_S} s passa pela cadeia do render
            </span>
          </section>
        </div>

        {/* ── o visual do loop de 1h ── */}
        {musica && (
          <section style={painel}>
            <span style={rotulo}>3 · visual do loop de 1h — footage já usado no canal</span>
            <SeletorCategorias grupoLabel="categorias do visual" todas={Object.keys(contagemVisual).sort()} contagem={contagemVisual}
              ativos={catsVisual} onToggle={alternaCatVisual} icones={ICONE_VISUAL} rotuloVazio="categoria" />
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8,
              maxHeight: 420, overflowY: 'auto', paddingTop: 2,
            }}>
              {visFiltrados.map(v => {
                const ativo = visualId === v.id
                return (
                  <button key={v.id} type="button" className="mix-btn" aria-pressed={ativo} title={v.titulo}
                    onClick={() => escolherVisual(v.id)}
                    style={{
                      display: 'grid', gap: 4, padding: 4, cursor: 'pointer', textAlign: 'left',
                      background: ativo ? 'var(--vintage-surface-3)' : 'var(--vintage-surface-2)',
                      border: `1px solid ${ativo ? 'var(--vintage-value)' : 'var(--vintage-border)'}`,
                    }}>
                    {v.thumb
                      ? <img src={resolveUrl(v.thumb)} alt="" loading="lazy"
                          style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', aspectRatio: '4/3', background: 'var(--vintage-surface-1)' }} />}
                    <span style={{
                      color: ativo ? 'var(--vintage-value)' : 'var(--vintage-label)',
                      fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {v.titulo}
                    </span>
                  </button>
                )
              })}
            </div>
            {visualId && (
              <span style={{ ...rotulo, color: 'var(--vintage-text-dim)' }}>
                escolhido: {visuais.find(v => v.id === visualId)?.titulo}
              </span>
            )}
          </section>
        )}

        {avisos.length > 0 && (
          <ul aria-label="avisos" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {avisos.map(t => <li key={t} style={{ color: 'var(--vintage-label)' }}>⚠ {t}</li>)}
          </ul>
        )}

        {/* ── rodapé fixo: transporte + timecode + prévia do visual + render, tudo junto ── */}
        <footer style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10,
          background: 'var(--vintage-surface-2)', borderTop: '1px solid var(--vintage-border)',
          padding: '14px 30px',
        }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
        }}>
          {musica && (
            <>
              <button type="button" className="mix-btn" aria-pressed={tocando} onClick={alternaTransporte}
                title={tocando ? 'pausar' : 'tocar'} style={{ ...botaoIcone(tocando), padding: 10 }}>
                {tocando ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span style={{ color: 'var(--vintage-label)', minWidth: 118, fontVariantNumeric: 'tabular-nums' }}>
                {tempo(posicao.atual)} / {tempo(posicao.dur)}
              </span>
              <input type="range" min={0} max={Math.max(posicao.dur, 1)} step={0.1} value={posicao.atual}
                onChange={e => { const el = musicaRef.current; if (el) el.currentTime = Number(e.target.value) }}
                aria-label="posição na música" style={{ flex: 1, minWidth: 120, accentColor: 'var(--vintage-value)' }} />
              {visualId && (
                <div style={{ position: 'relative', width: 56, height: 42, flexShrink: 0 }}>
                  <video ref={videoRef} src={resolveUrl(`/api/mix/file?visual=${encodeURIComponent(visualId)}`)}
                    loop muted playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', border: '1px solid var(--vintage-border)' }} />
                  <button type="button" onClick={verFullscreen} title="ver em tela cheia — como se fosse o vídeo renderizado"
                    style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff', cursor: 'pointer', padding: 0,
                    }}>
                    <Maximize2 size={14} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* duração + formato eram dois grupos sempre abertos disputando espaço com o
              transporte (achado #6) — agora moram atrás de um popover, um passo de
              configuração que raramente muda dos defaults ("= música", mp3) */}
          <Popover open={opcoesAbertas} onOpenChange={setOpcoesAbertas}>
            <PopoverTrigger asChild>
              <button type="button" className="mix-btn" style={{ ...botao(false), display: 'flex', alignItems: 'center', gap: 6 }}>
                <Settings2 size={12} />
                {DURACOES.find(d => d.s === duracao)?.rotulo ?? '= música'} · {formato}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto border-vintage-border bg-vintage-surface-2 p-3 text-vintage-label">
              <div style={{ display: 'grid', gap: 10 }}>
                <div role="group" aria-label="duração" style={{ display: 'flex', gap: 6 }}>
                  {DURACOES.map(d => (
                    <button key={d.rotulo} type="button" className="mix-btn" aria-pressed={duracao === d.s} onClick={() => setDuracao(d.s)}
                      style={botao(duracao === d.s)}>{d.rotulo}</button>
                  ))}
                </div>
                <div role="group" aria-label="formato" style={{ display: 'flex', gap: 6 }}>
                  {(['mp3', 'wav'] as const).map(f => (
                    <button key={f} type="button" className="mix-btn" aria-pressed={formato === f} onClick={() => setFormato(f)}
                      style={botao(formato === f)}>{f}</button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <VintageLed
            active={rodando || job?.status === 'done'}
            pulse={rodando}
            color={job?.status === 'error' ? 'red' : rodando ? 'orange' : 'green'}
            label={
              job?.compondo ? 'compondo vídeo'
                : rodando ? `renderizando ${Math.round(job?.progress ?? 0)}%`
                : job?.status === 'done' ? 'pronto' : 'parado'
            }
          />
          <button type="button" className="mix-btn" disabled={!pronto} onClick={() => void renderizar(true)}
            style={{ ...botao(false, !pronto), marginLeft: 'auto', padding: '12px 18px' }}>
            preview {PREVIEW_S} s
          </button>
          <button type="button" className="mix-btn" disabled={!pronto} onClick={() => void renderizar(false)}
            style={{
              ...botao(pronto, !pronto), padding: '12px 22px',
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
            exportar
          </button>
        </div>
        </footer>

        {erro && <p style={{ color: 'var(--vintage-label)', margin: 0 }}>{erro}</p>}

        {job?.status === 'done' && job.out && (
          <section style={{ display: 'grid', gap: 10 }}>
            <span style={rotulo}>
              {job.preview ? `preview ${PREVIEW_S} s` : job.out.endsWith('.mp4') ? 'render · com vídeo' : 'render'}
              {typeof job.lufs === 'number' ? ` · ${job.lufs.toFixed(1)} lufs` : ''}
            </span>
            {job.out.endsWith('.mp4')
              ? <video controls autoPlay={job.preview} src={audioSrc(job.out)}
                  style={{ width: '100%', maxHeight: 360, colorScheme: 'dark' }} />
              : <audio controls autoPlay={job.preview} src={audioSrc(job.out)}
                  style={{ width: '100%', height: 40, colorScheme: 'dark' }} />}
            {!job.preview && <code style={{ color: 'var(--vintage-label)', wordBreak: 'break-all' }}>{job.out}</code>}
            {/* o vídeo não substitui o áudio puro — os dois ficam salvos, e a tela não pode
                esconder o segundo arquivo real (PLAN-mix-export-video.md) */}
            {job.audio_out && (
              <span style={{ ...rotulo, color: 'var(--vintage-text-dim)' }}>
                áudio puro (sem vídeo) também salvo: <code style={{ textTransform: 'none' }}>{job.audio_out}</code>
              </span>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
