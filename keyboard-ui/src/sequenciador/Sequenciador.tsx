/**
 * /sequenciador: partitura em grade (colunas = tempo, linhas = altura), estilo seq.halfof8.
 *
 * O motor é o `@jaques/padroes` (Z:\Cursor\sequenciador): ele compõe (`gerarNotas`), desenha
 * (`desenharPartitura`, puro, chamado a cada frame com o tempo do Transport) e lê o áudio ao vivo
 * (`LeitorAoVivo`). Aqui moram só o som (som.ts), a mão (clique, arrasto, menu em quadrantes) e o link.
 *
 * O áudio só nasce no primeiro gesto (Tone.start), então a tela abre sem aviso de AudioContext.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { Dice5, Link2, Minus, Music2, Pause, Play, Plus, X } from 'lucide-react'
import {
  ESTILOS, LeitorAoVivo, PALETA, desenharPartitura, duracaoLoop, gerarNotas, FEATURES_SILENCIO,
  type Features, type NomeEstilo, type Nota,
} from '@jaques/padroes'
import { Button } from '@/components/ui/button'
import {
  DURACOES, NOMES_ESTILO, celulaEm, codificar, colunasDoEstilo, comColuna, decodificar, linhasDoEstilo,
  ladoGlifo, notaEm, notasDaPartilha, novaNota, ocupada, ordenar, passoDoEstilo, posCelula, type Grade,
} from './estado'
import { MenuQuad, type AlvoMenu } from './MenuQuad'
import { Som } from './som'

const SEGURAR_MS = 350
const ARRASTO_PX = 5
const FONTES = 'https://fonts.googleapis.com/css2?family=Doto:wght@600;800&family=JetBrains+Mono:wght@400;600&display=swap'

// fora do componente: sorteio é impuro e a regra de pureza do React vigia o corpo
const seedNova = () => Math.floor(Math.random() * 1e6)

/** estado inicial: o link (#p=…) manda; sem link, Aeroporto com semente 1 */
function inicial() {
  const m = /[#&]p=([^&]+)/.exec(window.location.hash)
  const p = m ? decodificar(m[1]) : null
  if (p) return { estilo: p.estilo, seed: p.seed, notas: notasDaPartilha(p), bpm: p.bpm ?? ESTILOS[p.estilo].bpm, editado: !!p.notas }
  return { estilo: 'eno' as NomeEstilo, seed: 1, notas: gerarNotas('eno', 1), bpm: ESTILOS.eno.bpm, editado: false }
}

const durDe = (e: NomeEstilo, n?: Nota): AlvoMenu['dur'] => {
  if (!n?.dur) return 'media'
  const f = n.dur / ESTILOS[e].soltura
  return f < 0.6 ? 'curta' : f > 1.6 ? 'longa' : 'media'
}
const fatorDe = (d: AlvoMenu['dur']) => DURACOES.find((x) => x.id === d)!.fator

type Gesto =
  | { tipo: 'nota'; idx: number; x0: number; y0: number; copiar: boolean; movido: boolean; menu: boolean }
  | { tipo: 'vazio'; x0: number; y0: number; cx: number; cy: number; menu: boolean }

export function Sequenciador() {
  const [ini] = useState(inicial)
  const [estilo, setEstilo] = useState<NomeEstilo>(ini.estilo)
  const [seed, setSeed] = useState(ini.seed)
  const [notas, setNotasEstado] = useState<Nota[]>(ini.notas)
  const [bpm, setBpm] = useState(ini.bpm)
  const [editado, setEditado] = useState(ini.editado)
  const [tocando, setTocando] = useState(false)
  const [alvo, setAlvo] = useState<AlvoMenu | null>(null)
  const [sample, setSample] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const canvas = useRef<HTMLCanvasElement>(null)
  const som = useRef<Som | null>(null)
  const leitor = useRef(new LeitorAoVivo())
  const notasRef = useRef(notas)
  const vista = useRef({ estilo, seed })
  const grade = useRef<Grade>({ largura: 1, altura: 1, celula: 20, colunas: 64, linhas: 13 })
  const gesto = useRef<Gesto | null>(null)
  const segurar = useRef<number | undefined>(undefined)
  const sobre = useRef<{ col: number; row: number } | null>(null)
  const hudRms = useRef<HTMLSpanElement>(null), hudOnset = useRef<HTMLSpanElement>(null), hudCompasso = useRef<HTMLSpanElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  useEffect(() => { vista.current = { estilo, seed } }, [estilo, seed])
  const setNotas = useCallback((n: Nota[]) => { notasRef.current = n; setNotasEstado(n) }, [])

  // fontes do HUD (Doto no título, JetBrains Mono no resto), sem mexer no index.html
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTES}"]`)) return
    const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTES })
    document.head.appendChild(l)
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 2200)
    return () => window.clearTimeout(t)
  }, [aviso])

  /** primeiro gesto: liga o áudio e monta a voz do estilo atual */
  const garantirSom = useCallback(async () => {
    if (som.current) return som.current
    await Tone.start()
    const s = new Som()
    s.montar(vista.current.estilo, vista.current.seed, notasRef.current, bpm)
    som.current = s
    return s
  }, [bpm])

  useEffect(() => () => { som.current?.dispose(); som.current = null }, [])

  // ── desenho: um frame por rAF, a partitura é função pura do tempo do Transport ──
  useEffect(() => {
    let raf = 0
    let onda: Float32Array | null = null
    const quadro = () => {
      raf = requestAnimationFrame(quadro)
      const cv = canvas.current
      if (!cv) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr)
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
      const ctx = cv.getContext('2d')
      if (!ctx || w < 2 || h < 2) return
      const { estilo: e, seed: sd } = vista.current
      const colunas = colunasDoEstilo(e), linhas = linhasDoEstilo(e)
      // 20–28 px CSS: o glifo (2 células) lê grosso; o motor já desenha poucas partículas e grandes
      const celula = Math.round(Math.max(20, Math.min(28, cv.clientWidth / (colunas + 4), cv.clientHeight / (linhas + 6))) * dpr)
      grade.current = { largura: w, altura: h, celula, colunas, linhas }

      const s = som.current
      let f: Features = FEATURES_SILENCIO
      if (s && s.tocando) {
        const db = s.fft.getValue() as Float32Array
        onda = s.onda.getValue() as Float32Array
        f = leitor.current.ler(db, onda, Tone.now())
      }
      const passo = s ? s.passoAtual() : 0
      const t = passo * passoDoEstilo(e)
      desenharPartitura(ctx, {
        largura: w, altura: h, t, notas: notasRef.current, colunas, linhas, passosPorCompasso: ESTILOS[e].passos,
        loop: duracaoLoop(e), features: f, seed: sd, celula, cursor: !!s,
      })

      // mira na célula sob o mouse: quatro cantos em ciano
      const c = sobre.current
      if (c && !gesto.current) {
        const G = ladoGlifo(grade.current), p = posCelula(grade.current, c.col, c.row), L = Math.round(G * 0.22), a = Math.max(1, Math.round(dpr))
        const x0 = Math.round(p.x) - a * 2, y0 = Math.round(p.y) - a * 2, x1 = Math.round(p.x + G) + a, y1 = Math.round(p.y + G) + a
        ctx.fillStyle = PALETA.acento
        for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
          ctx.fillRect(sx > 0 ? x : x - L + a, y, L, a)
          ctx.fillRect(x, sy > 0 ? y : y - L + a, a, L)
        }
      }

      if (hudRms.current) hudRms.current.textContent = f.rms.toFixed(2)
      if (hudOnset.current) hudOnset.current.textContent = f.onset > 0.5 ? '■' : f.onset > 0.1 ? '□' : '·'
      if (hudCompasso.current) {
        const ppc = ESTILOS[e].passos
        hudCompasso.current.textContent = `${Math.floor(passo / ppc) + 1}/${ESTILOS[e].compassos} · ${String(Math.floor(passo % ppc) + 1).padStart(2, '0')}`
      }
    }
    raf = requestAnimationFrame(quadro)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ── trocar partitura / estilo ───────────────────────────────────────────────
  const aplicar = useCallback((e: NomeEstilo, sd: number, ns: Nota[], b: number) => {
    vista.current = { estilo: e, seed: sd }
    setEstilo(e); setSeed(sd); setNotas(ns); setBpm(b)
    som.current?.montar(e, sd, ns, b)
  }, [setNotas])

  const trocarEstilo = (e: NomeEstilo) => { aplicar(e, seed, gerarNotas(e, seed), ESTILOS[e].bpm); setEditado(false) }
  const gerar = () => { const s = seedNova(); aplicar(estilo, s, gerarNotas(estilo, s), bpm); setEditado(false) }

  /** grava a edição: ordena, refaz o Part e marca que o link precisa levar as notas */
  const confirmar = useCallback((ns: Nota[]) => {
    const o = ordenar(ns)
    setNotas(o)
    setEditado(true)
    som.current?.trocarNotas(o)
  }, [setNotas])

  const alternar = async () => {
    const s = await garantirSom()
    if (s.tocando) { s.pausar(); setTocando(false) } else { await s.tocar(); setTocando(true) }
  }

  const mudarBpm = (d: number) => {
    const b = Math.max(40, Math.min(200, bpm + d))
    setBpm(b)
    if (som.current) som.current.bpm = b
  }

  const previa = async (n: Nota) => { const s = await garantirSom(); s.previa(n) }

  const compartilhar = async () => {
    const codigo = codificar({ estilo, seed, bpm, notas: editado ? notas : undefined })
    const url = `${window.location.origin}${window.location.pathname}#p=${codigo}`
    window.history.replaceState(null, '', url)
    try { await navigator.clipboard.writeText(url); setAviso('link copiado') } catch { setAviso('link no endereço da página') }
  }

  const escolherSample = async (f: File | undefined) => {
    if (!f) return
    try {
      const s = await garantirSom()
      await s.carregarSample(f)
      s.montar(estilo, seed, notasRef.current, bpm)
      setSample(f.name)
    } catch {
      setAviso('não deu pra ler esse áudio')
    }
  }
  const tirarSample = () => {
    som.current?.semSample()
    som.current?.montar(estilo, seed, notasRef.current, bpm)
    setSample(null)
  }

  // espaço = play/pause
  const alternarRef = useRef(alternar)
  useEffect(() => { alternarRef.current = alternar })
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.code !== 'Space' || (ev.target instanceof Element && ev.target.closest('input,button,textarea'))) return
      ev.preventDefault(); void alternarRef.current()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // ── mão: clique, segurar, arrastar ──────────────────────────────────────────
  const ponto = (ev: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
    return { x: (ev.clientX - r.left) * dpr, y: (ev.clientY - r.top) * dpr }
  }

  const abrirMenu = useCallback((cx: number, cy: number, x: number, y: number) => {
    const g = grade.current, ns = notasRef.current
    const idx = notaEm(g, ns, x, y)
    const cel = idx >= 0 ? { col: ns[idx].col, row: ns[idx].row } : celulaEm(g, x, y)
    const n = idx >= 0 ? ns[idx] : undefined
    const M = 190
    setAlvo({
      x: Math.max(M, Math.min(window.innerWidth - M, cx)), y: Math.max(M * 0.7, Math.min(window.innerHeight - M * 0.6, cy)),
      ...cel, indice: idx, glifo: n?.glifo ?? 0, acento: !!n?.acento, dur: durDe(vista.current.estilo, n),
    })
  }, [])

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    if (ev.button !== 0) return
    try { ev.currentTarget.setPointerCapture(ev.pointerId) } catch { /* ponteiro sintético */ }
    const { x, y } = ponto(ev)
    const idx = notaEm(grade.current, notasRef.current, x, y)
    const cx = ev.clientX, cy = ev.clientY
    gesto.current = idx >= 0
      ? { tipo: 'nota', idx, x0: x, y0: y, copiar: ev.ctrlKey || ev.metaKey, movido: false, menu: false }
      : { tipo: 'vazio', x0: x, y0: y, cx, cy, menu: false }
    window.clearTimeout(segurar.current)
    segurar.current = window.setTimeout(() => {
      const gs = gesto.current
      if (!gs || (gs.tipo === 'nota' && gs.movido)) return
      gs.menu = true
      abrirMenu(cx, cy, x, y)
    }, SEGURAR_MS)
  }

  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = ponto(ev)
    sobre.current = celulaEm(grade.current, x, y)
    const gs = gesto.current
    if (!gs || gs.tipo !== 'nota' || gs.menu) return
    if (!gs.movido) {
      if (Math.hypot(x - gs.x0, y - gs.y0) < ARRASTO_PX * (window.devicePixelRatio || 1)) return
      window.clearTimeout(segurar.current)
      gs.movido = true
      if (gs.copiar) {
        const ns = [...notasRef.current, { ...notasRef.current[gs.idx], rotulo: undefined }]
        gs.idx = ns.length - 1
        setNotas(ns)
      }
    }
    const { col, row } = celulaEm(grade.current, x, y)
    const ns = notasRef.current, n = ns[gs.idx]
    if ((n.col === col && n.row === row) || ocupada(ns, col, row, gs.idx)) return
    const nova = comColuna(vista.current.estilo, n, col, row)
    const out = [...ns]; out[gs.idx] = nova
    setNotas(out)
    if (n.row !== row) void previa(nova) // ouve a altura nova
  }

  const onUp = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    window.clearTimeout(segurar.current)
    const gs = gesto.current
    gesto.current = null
    if (!gs || gs.menu) return
    if (gs.tipo === 'nota') {
      if (gs.movido) confirmar(notasRef.current)
      else void previa(notasRef.current[gs.idx])
    } else {
      const { x, y } = ponto(ev)
      abrirMenu(gs.cx, gs.cy, x, y)
    }
  }

  // ── menu ───────────────────────────────────────────────────────────────────
  const fecharMenu = useCallback(() => setAlvo(null), [])
  const editarAlvo = (mud: Partial<Pick<AlvoMenu, 'acento' | 'dur'>>) => {
    if (!alvo) return
    const a = { ...alvo, ...mud }
    setAlvo(a)
    if (a.indice >= 0) {
      const ns = [...notasRef.current], n = ns[a.indice]
      ns[a.indice] = { ...n, acento: a.acento, dur: ESTILOS[estilo].soltura * fatorDe(a.dur) }
      confirmar(ns)
      setAlvo({ ...a, indice: ordenar(ns).indexOf(ns[a.indice]) })
    }
  }
  const escolherGlifo = (g: number) => {
    if (!alvo) return
    const ns = [...notasRef.current]
    let n: Nota
    if (alvo.indice >= 0) { n = { ...ns[alvo.indice], glifo: g }; ns[alvo.indice] = n }
    else { n = novaNota(estilo, alvo.col, alvo.row, g, alvo.acento, fatorDe(alvo.dur)); ns.push(n) }
    confirmar(ns)
    void previa(n)
    setAlvo(null)
  }
  const apagar = () => {
    if (!alvo || alvo.indice < 0) return
    confirmar(notasRef.current.filter((_, i) => i !== alvo.indice))
    setAlvo(null)
  }

  const e = ESTILOS[estilo]
  return (
    <div className="seq fixed inset-0 flex flex-col">
      <style>{CSS_SEQ}</style>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-[var(--seq-linha)]">
        <h1 className="seq-titulo">sequenciador</h1>
        <div className="flex gap-1" role="radiogroup" aria-label="estilo">
          {NOMES_ESTILO.map((n) => (
            <Button key={n} variant="ghost" size="sm" role="radio" aria-checked={n === estilo} title={ESTILOS[n].descricao}
              className={n === estilo ? 'seq-ativo' : ''} onClick={() => trocarEstilo(n)}>
              {ESTILOS[n].titulo}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={gerar} title="nova semente"><Dice5 /> Gerar</Button>
        <Button size="sm" onClick={alternar} aria-label={tocando ? 'pausar' : 'tocar'} className="min-w-24">
          {tocando ? <><Pause /> Pausar</> : <><Play /> Tocar</>}
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="BPM menos" onClick={() => mudarBpm(-2)}><Minus /></Button>
          <span className="seq-num w-16 text-center">{bpm} <span className="seq-rotulo">bpm</span></span>
          <Button variant="ghost" size="icon-sm" aria-label="BPM mais" onClick={() => mudarBpm(2)}><Plus /></Button>
        </div>
        <input ref={arquivo} type="file" accept="audio/*" hidden onChange={(ev) => { void escolherSample(ev.target.files?.[0]); ev.target.value = '' }} />
        <div className="flex items-center">
          <Button variant="outline" size="sm" onClick={() => arquivo.current?.click()} title="um sample seu no lugar da voz">
            <Music2 /> {sample ? <span className="max-w-32 truncate">{sample}</span> : 'Seu som'}
          </Button>
          {sample && <Button variant="ghost" size="icon-sm" aria-label="tirar o sample" onClick={tirarSample}><X /></Button>}
        </div>
        <Button variant="outline" size="sm" onClick={compartilhar}><Link2 /> Compartilhar</Button>
        {aviso && <span className="seq-rotulo seq-aviso" role="status">{aviso}</span>}
      </header>

      <main className="relative flex-1 min-h-0">
        <canvas
          ref={canvas}
          className="absolute inset-x-0 top-0 bottom-8 w-full h-[calc(100%-2rem)] touch-none cursor-crosshair"
          aria-label={`partitura ${e.titulo}, ${notas.length} notas`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => { window.clearTimeout(segurar.current); gesto.current = null }}
          onPointerLeave={() => { sobre.current = null }}
          onContextMenu={(ev) => ev.preventDefault()}
        />
        <div className="seq-hud absolute left-4 bottom-0 h-8 flex items-center gap-5 pointer-events-none">
          <span><span className="seq-rotulo">rms</span> <span ref={hudRms}>0.00</span></span>
          <span><span className="seq-rotulo">onset</span> <span ref={hudOnset}>·</span></span>
          <span><span className="seq-rotulo">compasso</span> <span ref={hudCompasso}>1/4 · 01</span></span>
        </div>
        <p className="seq-rotulo absolute right-4 bottom-0 h-8 flex items-center pointer-events-none text-right">
          clique: menu · arraste: mover · ctrl: copiar
        </p>
      </main>

      {alvo && (
        <MenuQuad alvo={alvo} onGlifo={escolherGlifo} onAcento={(a) => editarAlvo({ acento: a })} onDur={(d) => editarAlvo({ dur: d })}
          onApagar={apagar} onFechar={fecharMenu} />
      )}
    </div>
  )
}

/* Tokens do shadcn reescritos SÓ dentro da /sequenciador com a PALETA do motor (preto, branco,
   ciano): o Button do app vale aqui sem paleta nova. Ciano só sobre preto ou como preenchimento. */
const CSS_SEQ = `
.seq {
  --background: ${PALETA.fundo}; --foreground: ${PALETA.tinta};
  --primary: ${PALETA.acento}; --primary-foreground: ${PALETA.fundo};
  --accent: ${PALETA.grade}; --accent-foreground: ${PALETA.tinta};
  --input: ${PALETA.grade}; --border: ${PALETA.dim}; --ring: ${PALETA.acento};
  --seq-ciano: ${PALETA.acento}; --seq-linha: ${PALETA.grade}; --seq-dim: ${PALETA.dim};
  background: ${PALETA.fundo}; color: ${PALETA.tinta};
  font-family: "JetBrains Mono", ui-monospace, monospace;
}
.seq button { font-family: inherit; border-radius: 0; }
/* o reset global (* { padding: 0 }) fica fora de @layer e ganha das utilities do Tailwind: o respiro vem daqui */
.seq header { padding: 10px 16px; }
.seq-hud, .seq main > p { padding: 0; }
.seq main .seq-hud { left: 16px; } .seq main > p.seq-rotulo { right: 16px; }
.seq button[data-slot="button"] { padding: 0 10px; }
.seq button[data-slot="button"][data-size^="icon"] { padding: 0; }
.seq .seq-quad { padding: 6px; }
.seq button[data-variant="outline"] { border-color: var(--seq-dim); background: transparent; }
.seq .seq-ativo { color: var(--seq-ciano); box-shadow: inset 0 -1px 0 var(--seq-ciano); }
.seq-titulo { font: 800 22px/1 "Doto", "JetBrains Mono", monospace; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
.seq-rotulo { font: 400 10px/1.4 "JetBrains Mono", ui-monospace, monospace; letter-spacing: 0.14em; text-transform: uppercase; color: var(--seq-dim); }
.seq-num, .seq-hud { font: 600 12px/1 "JetBrains Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.seq-aviso { color: var(--seq-ciano); }
.seq-quad { font-family: "JetBrains Mono", ui-monospace, monospace; }
`
