/**
 * ESTICAR / OUVIR — terceira e quarta etapas da página linear.
 *
 * Não é painel. É bloco de página normal, uma coluna, empilhado.
 *
 * A ONDA É A ESTRELA. A da gravação em cima, a do esticado embaixo, no mesmo eixo.
 * É o que mostra o que o Paulstretch fez: um gesto curto e picotado virando uma
 * nuvem longa e lisa. Nenhuma frase faz isso. O `<audio>` vem logo abaixo, e todo
 * o resto é apoio.
 *
 * Por isso o DOMAR inteiro está colapsado: é passo opcional, e passo opcional não
 * disputa altura com o que a pessoa veio ver.
 *
 * Monocromático (ver `ui.ts`): a onda esticada é a tinta mais clara da tela, a
 * gravação fica um degrau abaixo, e "piorou" se diz com barra SÓLIDA em vez de
 * vazada — nunca com hue.
 *
 * Rotas (todas já existiam):
 *   GET  /api/stretch?path=&factor=&window=
 *   GET  /api/audio/peaks?path=&buckets=      devolve array de floats 0…1
 *   GET  /api/preview?path=                   devolve o wav (via `audioSrc`)
 *   POST /api/domar {path} devolve {job_id} ; GET /api/domar/status/<job_id>
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { resolveUrl, audioSrc } from '../lib/api'
import type { Receita, Destino } from './Medir'
import {
  ACESO, ACESO_FRACO, ESTADO, ESP, MONO,
  t100, t70, t45, t25, t12,
  qualificador as qualificadorTok,
  rotulo as rotuloTok,
  valor as valorTok,
  type Estado,
} from './ui'

/* ── contrato do backend ─────────────────────────────────────────── */

type Stretch = {
  path: string
  /** ausentes quando o backend devolve o render já cacheado. */
  fator_pedido?: number
  fator_real?: number
  fator_ok?: boolean
}

type Medidas = {
  faixa_db: number
  periodo_s: number
  apito_x: number
  tremolo_x: number
}

type DomarJob = {
  status: 'running' | 'done' | 'error'
  progress?: number
  out: string
  error?: string
  antes?: Medidas
  depois?: Medidas
  notas?: string[]
  lufs?: number
}

/* ── as três forças do stretch ─────────────────────────────────────
 *
 * Um eixo só: quanto a fonte se dissolve. O nome diz O QUE SE OUVE, não o fator,
 * porque "x4" não conta nada a quem vai escolher com o ouvido.
 *
 * Fator e janela andam JUNTOS, e não é enfeite: o `PLANO-eno-stretch.md` mostra que
 * janela curta segura a definição de altura (é o que mantém a estranheza do aphex),
 * e janela longa borra a altura até virar algodão (é o eno). Esticar pouco com janela
 * longa daria o pior dos dois: curto e sem definição.
 *
 * NUVEM é o padrão porque é a receita calibrada da cama5, a única do acervo que passou
 * nos três medidores sem um notch.
 */
type Forca = { id: string; nome: string; marca: string; fator: number; janela: number }

const FORCAS: Forca[] = [
  { id: 'nota',   nome: 'NOTA',   marca: 'ainda dá pra ouvir o acorde',        fator: 4,  janela: 0.25 },
  { id: 'borrao', nome: 'BORRÃO', marca: 'a nota some, o movimento fica',      fator: 8,  janela: 0.35 },
  { id: 'nuvem',  nome: 'NUVEM',  marca: 'não sobra nota nenhuma, só cor',     fator: 12, janela: 0.50 },
]

const FORCA_PADRAO = FORCAS[FORCAS.length - 1]

/* ── o EQ do passo ─────────────────────────────────────────────────
 *
 * Os dois eixos são os mesmos da rota `/eq`, com as MESMAS réguas, porque elas foram
 * calibradas no ouvido do dono numa sessão real (ele parou em −9,7 de brilho e +8,1
 * de grave, e disse que o gosto era dali pra mais). Régua diferente aqui daria dois
 * "brilho" com significados diferentes no mesmo app.
 *
 * O preview ao vivo NÃO é refeito aqui: ele já existe na `/eq`, e um segundo motor de
 * áudio no browser é exatamente a estrutura que produziu o bug do overlap. Aqui quem
 * responde é o backend, que é ffmpeg e é medido — custa um render, e por isso o botão
 * é explícito em vez de aplicar a cada arrasto.
 */
const ESCURO_MAX = 20
const GRAVE_MIN = -8
const GRAVE_MAX = 18

/** O achatador só entra na faixa de ressaca. Fora dela, não mexer é o certo. */
const RESSACA_MIN_S = 1
const RESSACA_MAX_S = 60

/* ── números ─────────────────────────────────────────────────────── */

function num(v: number | null | undefined, casas = 1): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(casas).replace('.', ',')
}

function relogio(s: number): string {
  if (!isFinite(s) || s < 0) return '—'
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

/* ── peaks: a evidência que o backend já calcula ─────────────────── */

const BUCKETS = 200

type EstadoOnda = 'vazio' | 'carregando' | 'pronta' | 'erro'

/** identidade estável pro caso vazio: evita onda nova a cada render */
const SEM_PEAKS: number[] = []

/**
 * O resultado carrega o `path` que o gerou. Assim "vazio" e "carregando" saem por
 * DERIVAÇÃO no render, não por `setState` de reset dentro do efeito, que só
 * repetiria em outro lugar o que o próprio `path` já diz.
 */
type PeaksDe = { path: string; peaks: number[]; estado: 'pronta' | 'erro' }

function usePeaks(path: string | null): { peaks: number[]; estado: EstadoOnda } {
  const [dados, setDados] = useState<PeaksDe | null>(null)
  const atual = dados && dados.path === path ? dados : null

  useEffect(() => {
    if (!path) return
    let cancelado = false
    void (async () => {
      try {
        const r = await fetch(resolveUrl(`/api/audio/peaks?path=${encodeURIComponent(path)}&buckets=${BUCKETS}`))
        const data = await r.json()
        if (cancelado) return
        if (Array.isArray(data)) setDados({ path, peaks: data as number[], estado: 'pronta' })
        else setDados({ path, peaks: SEM_PEAKS, estado: 'erro' })
      } catch {
        if (!cancelado) setDados({ path, peaks: SEM_PEAKS, estado: 'erro' })
      }
    })()
    return () => { cancelado = true }
  }, [path])

  return {
    peaks: atual?.peaks ?? SEM_PEAKS,
    estado: !path ? 'vazio' : atual ? atual.estado : 'carregando',
  }
}

/**
 * A onda. Barras espelhadas no eixo central, sem moldura.
 *
 * A caixa saiu: borda e fundo não separavam nada que o próprio desenho já não
 * separe, e roubavam altura da única coisa que a pessoa veio ver. O que ficou é o
 * eixo, que é fato, e a onda.
 *
 * `preserveAspectRatio="none"` de propósito: a onda é uma leitura de tempo × nível,
 * não um desenho com proporção a defender — ela tem que ocupar a largura toda.
 */
function Onda({ peaks, estado, tinta, altura = 112, rotulo, direita }: {
  peaks: number[]
  estado: EstadoOnda
  tinta: string
  altura?: number
  rotulo: string
  direita?: React.ReactNode
}) {
  const n = peaks.length || 1
  const passo = 100 / n
  const larg = Math.max(passo * 0.62, 0.18)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.sm }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: ESP.sm }}>
        <span style={rotuloOnda}>{rotulo}</span>
        <span style={{ marginLeft: 'auto', ...qualificadorTok }}>{direita}</span>
      </div>

      <div style={{ position: 'relative', height: altura }}>
        {/* eixo central: existe nos quatro estados, pra nenhum ficar sem desenho */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
          background: t12,
        }} />

        {estado === 'pronta' && (
          <svg width="100%" height={altura} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: 'block' }}>
            {peaks.map((v, i) => {
              const h = Math.max(0.9, Math.min(1, v) * 96)
              return (
                <rect
                  key={i} x={i * passo} y={50 - h / 2} width={larg} height={h}
                  fill={tinta} opacity={0.9} rx={larg / 2}
                />
              )
            })}
          </svg>
        )}

        {estado !== 'pronta' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em',
            color: estado === 'erro' ? t70 : t25,
            animation: estado === 'carregando' ? 'esticar-pulso 1.4s ease-in-out infinite' : undefined,
          }}>
            {estado === 'carregando' ? 'lendo a onda…' : estado === 'erro' ? 'não deu pra ler a onda' : 'sem onda'}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A régua de escala real.
 *
 * As duas ondas acima ocupam a largura toda cada uma — é assim que se vê a TEXTURA.
 * Mas isso esconde o fato principal: a fonte é 12x mais curta. Esta faixa põe as
 * duas durações na mesma linha de tempo, e a fonte vira o risco que ela de fato é.
 */
function EscalaReal({ fator, durFonte }: { fator: number; durFonte: number | null }) {
  const f = Math.max(1, fator)
  const pct = (1 / f) * 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.xs }}>
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: t12, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`, minWidth: 2, background: t100,
        }} />
      </div>
      <span style={qualificadorTok}>
        na mesma linha de tempo: a gravação é o risco aceso à esquerda
        {durFonte ? ` (${relogio(durFonte)})` : ''}, o esticado é a trilha inteira
        {durFonte ? ` (${relogio(durFonte * f)})` : ''}
      </span>
    </div>
  )
}

/* ── antes e depois do domar, como forma ─────────────────────────── */
//
// Anatomia: rótulo, valor, qualificador (o ANTES é a régua), evidência.
// O antes é um traço na trilha; o depois é a barra. Duas listas de números não
// mostram nada, o traço mostra.
//
// Sem hue, "piorou" é barra SÓLIDA e valor no topo da escala; "está certo" é barra
// vazada e valor um degrau abaixo. E a palavra vem escrita, pra não virar
// adivinhação.

const LINHAS: { key: keyof Medidas; rotulo: string; unidade: string }[] = [
  { key: 'faixa_db', rotulo: 'RANGE', unidade: ' dB' },
  { key: 'apito_x', rotulo: 'APITO', unidade: 'x' },
  { key: 'tremolo_x', rotulo: 'TREMOLO', unidade: 'x' },
  { key: 'periodo_s', rotulo: 'PERÍODO', unidade: ' s' },
]

function LinhaAntesDepois({ rotulo, antes, depois, unidade, foraDaRessaca, ehPeriodo }: {
  rotulo: string
  antes: number
  depois: number
  unidade: string
  foraDaRessaca: boolean
  ehPeriodo: boolean
}) {
  const igual = Math.abs(depois - antes) <= Math.max(1e-6, Math.abs(antes) * 0.02)
  // Menor é melhor nas quatro — menos em `periodo_s`, e em `faixa_db` fora da
  // faixa de ressaca, onde NÃO mudar é o resultado certo.
  const naoMexerEhCerto = ehPeriodo || foraDaRessaca
  const estado: Estado = igual
    ? (naoMexerEhCerto ? 'ok' : 'aviso')
    : depois < antes
      ? (naoMexerEhCerto && ehPeriodo ? 'aviso' : 'ok')
      : 'reprova'
  const e = ESTADO[estado]

  const max = Math.max(antes, depois, 1e-6) * 1.2
  const pAntes = (antes / max) * 100
  const pDepois = (depois / max) * 100

  return (
    <div style={linhaMedida}>
      <span style={rotuloPeq}>{rotulo}</span>
      <span style={{ ...valorMedida, color: e.tinta }}>{num(depois)}{unidade}</span>
      <span style={qualificadorTok}>
        antes {num(antes)}{unidade}{e.palavra ? `, ${e.palavra}` : ''}
      </span>

      <div style={{ gridColumn: '2 / -1', paddingTop: 3 }}>
        <svg width="100%" height="12" viewBox="0 0 100 12" preserveAspectRatio="none" style={{ display: 'block' }}>
          <rect x="0" y="3" width="100" height="6" rx="3" fill={t12} />
          <rect
            x="0" y="3" width={Math.max(0.8, pDepois)} height="6" rx="3"
            fill={e.preenche ? e.tinta : 'none'}
            stroke={e.preenche ? 'none' : e.tinta}
            strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.9"
          />
          {/* o ANTES é a régua */}
          <line x1={pAntes} y1="0" x2={pAntes} y2="12"
            stroke={t45} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  )
}

/* ── o componente ────────────────────────────────────────────────── */

/**
 * Modo da tela.
 *
 * `completo` é a tela de sempre: receita conferível, ESCALA REAL, e o domar como
 * passo opcional atrás de um disclosure.
 *
 * `enxuto` é a mesma tela para quem não vai conferir parâmetro nenhum: as duas
 * ondas, o play, e o domar rodando SOZINHO logo depois do stretch. O antes/depois
 * continua existindo em `ver medidas` — some da tela, não do app.
 */
export type ModoEsticar = 'completo' | 'enxuto'

export function Esticar({ path, destino, receita, habilitado, modo = 'completo' }: {
  path: string | null
  destino: Destino | null
  receita: Receita | null
  habilitado: boolean
  modo?: ModoEsticar
}) {
  const enxuto = modo === 'enxuto'
  const [estado, setEstado] = useState<'parado' | 'esticando' | 'pronto' | 'erro'>('parado')
  const [erroMsg, setErroMsg] = useState('')
  const [res, setRes] = useState<Stretch | null>(null)
  const [seg, setSeg] = useState(0)
  const [durFonte, setDurFonte] = useState<number | null>(null)

  const [domar, setDomar] = useState<DomarJob | null>(null)
  const [domarErro, setDomarErro] = useState('')
  const [domando, setDomando] = useState(false)
  const timerRef = useRef<number | null>(null)

  const [forca, setForca] = useState<Forca>(FORCA_PADRAO)

  /* Brilho é o shelf escuro visto pelo lado bom: 0 dB de corte é brilho no talo.
     O padrão sai da receita medida, pra tela abrir no que o pipeline já faria. */
  const [escuroDb, setEscuroDb] = useState<number>(receita?.escuro_db ?? 7)
  const [graveDb, setGraveDb] = useState(0)
  const [eqSujo, setEqSujo] = useState(false)
  /** Quem pediu o master: o automático do render, ou o APLICAR do EQ. */
  const [masterPedido, setMasterPedido] = useState(false)

  const fator = enxuto ? forca.fator : (receita?.esticar ?? 12)
  const janela = enxuto ? forca.janela : (receita?.janela ?? 0.5)

  const ondaFonte = usePeaks(path)
  const ondaEsticada = usePeaks(res?.path ?? null)
  const ondaDomada = usePeaks(domar?.status === 'done' ? (domar.out || null) : null)

  /* gravação nova, e o esticado anterior não vale mais. O reset não mora aqui dentro:
     `Fabrica` monta este componente com `key={path}`, que é como o React zera estado
     quando uma prop muda — e de quebra o `clearInterval` do polling do domar passa a
     rodar na desmontagem, coisa que o efeito de reset não fazia. */

  /* duração da fonte: só pra dizer quanto vai durar o esticado */
  useEffect(() => {
    if (!path) return   // `durFonte` já nasce null a cada `path`
    let cancelado = false
    void (async () => {
      try {
        const r = await fetch(resolveUrl(`/api/duration?path=${encodeURIComponent(path)}`))
        const d = await r.json()
        if (!cancelado && typeof d?.duration === 'number') setDurFonte(d.duration)
      } catch { /* duração é enfeite: sem ela a tela funciona igual */ }
    })()
    return () => { cancelado = true }
  }, [path])

  /* cronômetro honesto: não existe progresso real na rota, então mostramos o tempo
     que passou e o quanto isso costuma levar. Barra falsa seria mentira. */
  useEffect(() => {
    if (estado !== 'esticando') return   // o zero é posto por quem manda esticar
    const t = window.setInterval(() => setSeg(s => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [estado])

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current) }, [])

  const esticar = useCallback(async () => {
    if (!path || !habilitado || estado === 'esticando') return
    setSeg(0)
    setEstado('esticando'); setErroMsg(''); setRes(null)
    setDomar(null); setDomarErro('')
    try {
      const url = `/api/stretch?path=${encodeURIComponent(path)}&factor=${fator}&window=${janela}`
      const r = await fetch(resolveUrl(url))
      const data = await r.json()
      if (data?.error) { setErroMsg(String(data.error)); setEstado('erro'); return }
      setRes(data as Stretch); setEstado('pronto')
    } catch (e) {
      setErroMsg(String(e)); setEstado('erro')
    }
  }, [path, habilitado, estado, fator, janela])

  const chamarDomar = useCallback(async (gosto?: { escuro_db: number; grave_db: number }) => {
    if (!res?.path || domando) return
    setDomando(true); setDomarErro(''); setDomar(null)
    try {
      const r = await fetch(resolveUrl('/api/domar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /* Sem `gosto` a chamada sai idêntica à de antes deste bloco existir: os
           parâmetros são opcionais no Python e default desligado. */
        body: JSON.stringify({ path: res.path, ...(gosto ?? {}) }),
      })
      const data = await r.json()
      if (data?.error || !data?.job_id) {
        setDomarErro(String(data?.error ?? 'o domar não devolveu job')); setDomando(false); return
      }
      setDomar({ status: 'running', out: data.out })

      const jobId: string = data.job_id
      if (timerRef.current) window.clearInterval(timerRef.current)
      timerRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const s = await fetch(resolveUrl(`/api/domar/status/${jobId}`))
            const j = await s.json() as DomarJob & { error?: string }
            if (j?.status === 'done') {
              if (timerRef.current) window.clearInterval(timerRef.current)
              setDomar(j); setDomando(false)
            } else if (j?.status === 'error') {
              if (timerRef.current) window.clearInterval(timerRef.current)
              setDomarErro(String(j.error ?? 'erro no domar')); setDomando(false)
            }
          } catch { /* rede piscou: a próxima batida do polling resolve */ }
        })()
      }, 2500)
    } catch (e) {
      setDomarErro(String(e)); setDomando(false)
    }
  }, [res, domando])

  /* ── o domar automático do modo enxuto ───────────────────────────
   *
   * No modo completo domar é escolha, e escolha mora atrás de um clique. Aqui não
   * há quem escolha: a receita é constante e o domar faz parte dela. Roda uma vez
   * por render, assim que o esticado fica pronto.
   *
   * `dispararRef` guarda o path já domado em vez de um booleano: o efeito depende
   * de `chamarDomar`, que é recriado quando `res` muda, e sem a marca por path ele
   * redispararia o mesmo job a cada recriação. */
  const domadoRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enxuto || estado !== 'pronto' || !res?.path) return
    if (domadoRef.current === res.path) return
    domadoRef.current = res.path
    setMasterPedido(false)
    void chamarDomar()
  }, [enxuto, estado, res?.path, chamarDomar])

  /* Trocar de força joga fora a cama anterior: ela é de outra receita, e deixar a
     onda velha na tela debaixo de uma pílula nova é a tela mentindo sobre o que
     está tocando. Quem troca volta pro botão. */
  const trocarForca = useCallback((f: Forca) => {
    if (f.id === forca.id) return
    setForca(f)
    setEstado('parado'); setRes(null); setSeg(0)
    setDomar(null); setDomarErro(''); setEqSujo(false)
    domadoRef.current = null
  }, [forca.id])

  const refazerMaster = useCallback(() => {
    setEqSujo(false); setMasterPedido(true)
    domadoRef.current = res?.path ?? null   // segura o automático
    void chamarDomar({ escuro_db: escuroDb, grave_db: graveDb })
  }, [chamarDomar, escuroDb, graveDb, res])

  /* o aviso do fator: campo ausente quando o backend devolve render cacheado */
  const fatorCurto = res?.fator_ok === false
  const periodoS = domar?.antes?.periodo_s ?? 0
  const foraDaRessaca = !(periodoS >= RESSACA_MIN_S && periodoS <= RESSACA_MAX_S)

  return (
    <div style={coluna}>
      {/* ── 0 · a força do stretch ──
          Fica visível SEMPRE, inclusive depois do render: é por ela que se compara
          uma versão com a outra, e comparação com o controle escondido não acontece.
          Mesma pílula do TOCAR, mesma escala de tinta. */}
      {enxuto && path && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.xs }}>
          <div style={{ display: 'flex', gap: ESP.xs, flexWrap: 'wrap' }}>
            {FORCAS.map(f => {
              const on = f.id === forca.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => trocarForca(f)}
                  aria-pressed={on}
                  style={{
                    padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                    font: `700 10px ${MONO}`, letterSpacing: '0.14em',
                    background: on ? ACESO_FRACO : 'transparent',
                    border: `1px solid ${on ? ACESO : t12}`,
                    color: on ? ACESO : t45,
                  }}>
                  {f.nome}
                </button>
              )
            })}
          </div>
          {/* UMA linha, a do escolhido: é a única que descreve o que se vai ouvir */}
          <span style={qualificadorTok}>
            {forca.marca}
            {durFonte ? `, uns ${relogio(durFonte * forca.fator)}` : ''}
          </span>
        </div>
      )}

      {/* ── 1 · o botão ── */}
      {!(enxuto && estado === 'pronto') && <>
      <button
        onClick={() => void esticar()}
        disabled={!habilitado || !path || estado === 'esticando'}
        style={{
          width: '100%', padding: '20px 0', borderRadius: 10,
          border: `1px solid ${habilitado ? ACESO : t12}`,
          background: habilitado ? ACESO_FRACO : 'transparent',
          color: habilitado ? ACESO : t25,
          cursor: habilitado && estado !== 'esticando' ? 'pointer' : 'not-allowed',
          fontFamily: MONO, fontSize: 18, fontWeight: 800, letterSpacing: '0.3em',
        }}
      >
        {estado === 'esticando'
          ? (enxuto ? 'PREPARANDO…' : 'PROCESSANDO…')
          : (enxuto ? 'OUVIR A CAMA' : 'DAR O STRETCH')}
      </button>

      {/* No modo enxuto a régua não é o parâmetro, é a duração: `12x, janela 0,50 s`
          só ajuda quem vai conferir a receita, e aqui não há o que conferir. */}
      <p style={qualificadorTok}>
        {!path ? 'grave alguma coisa primeiro'
          : !habilitado ? 'a medição não liberou esta fonte'
            /* "cama" já está no botão logo acima e no rótulo da onda logo abaixo.
               Três vezes a mesma palavra em quatro linhas: aqui fica só o número. */
            /* a duração já está na linha da pílula, logo acima */
            : enxuto ? ''
              : `${num(fator, 0)}x, janela ${num(janela, 2)} s${destino ? `, cama ${destino}` : ''}`}
      </p>
      </>}

      {/* ── 2 · trabalhando: sem barra falsa ── */}
      {estado === 'esticando' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.sm }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: ESP.sm }}>
            <span style={valorTok}>{relogio(seg)}</span>
            <span style={qualificadorTok}>
              costuma levar de 30 s a alguns minutos
            </span>
          </div>
          {/* a barra é INDETERMINADA de propósito: não há progresso real na rota */}
          <div style={{ height: 3, background: t12, overflow: 'hidden' }}>
            <div style={{
              width: '32%', height: '100%', background: t70,
              animation: 'esticar-corre 1.5s ease-in-out infinite',
            }} />
          </div>
        </div>
      )}

      {estado === 'erro' && (
        <Aviso estado="reprova" palavra="" texto={`o stretch falhou: ${erroMsg.slice(0, 300)}`} />
      )}

      {/* ── 3 · as duas ondas: o coração da tela ── */}
      {(estado === 'pronto' || estado === 'parado' || estado === 'esticando') && path && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.lg, paddingTop: ESP.sm }}>
          <Onda
            peaks={ondaFonte.peaks}
            estado={ondaFonte.estado}
            tinta={t45}
            rotulo="O TAKE"
            direita={durFonte ? relogio(durFonte) : null}
          />

          {/* No enxuto a onda da cama só nasce quando existe cama. Antes disso ela
              era um retângulo vazio de 120px dizendo "sem onda", entre o take e o
              rodapé. Reservar o lugar do resultado ajuda quem compara parâmetro e
              quer ver o antes; aqui não há parâmetro pra comparar. */}
          {(!enxuto || estado === 'pronto') && (
            <Onda
              peaks={ondaEsticada.peaks}
              estado={estado === 'pronto' ? ondaEsticada.estado : 'vazio'}
              tinta={t100}
              rotulo="A CAMA"
              direita={estado === 'pronto' && durFonte ? relogio(durFonte * (res?.fator_real ?? fator)) : null}
            />
          )}

          {estado === 'pronto' && !enxuto && <EscalaReal fator={res?.fator_real ?? fator} durFonte={durFonte} />}
        </div>
      )}

      {/* ── 4 · o aviso do fator curto: discreto, nunca ausente ── */}
      {fatorCurto && (
        <Aviso
          estado="aviso"
          texto={enxuto
            ? 'A cama saiu mais curta que o previsto, porque o take era curto. Grave mais tempo e ela rende o dobro.'
            : `saiu ${num(res?.fator_real)}x, não ${num(res?.fator_pedido, 0)}x. A gravação era curta demais pra última janela caber inteira. Não é erro seu nem bug: gravar mais tempo resolve.`}
        />
      )}

      {/* ── 5 · ouvir ── */}
      {estado === 'pronto' && res?.path && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.sm }}>
          {/* No enxuto o player troca de arquivo sozinho quando o domar termina.
              Trocar o `src` de um `<audio>` tocando o reinicia, e é o certo aqui:
              o que estava tocando era a versão crua, e a domada é outra mistura —
              continuar do mesmo segundo em outro arquivo seria o salto estranho. */}
          <audio
            controls
            src={audioSrc(enxuto && domar?.status === 'done' && domar.out ? domar.out : res.path)}
            style={{ width: '100%', height: 40, colorScheme: 'dark' }}
          />
          {(!enxuto || domando) && (
            <span style={qualificadorTok}>
              {domando
                ? 'masterizando. Pode ouvir enquanto isso, o arquivo troca sozinho quando ficar pronto.'
                : 'A cama entra tocando. Ela não tem começo pra esperar.'}
            </span>
          )}

          {/* ── o EQ, no passo, com os dois eixos que o pedido real tem ──
              "tá chiado" e "quero mais grave". As réguas são as MESMAS da rota /eq,
              calibradas no ouvido numa sessão real. Quem responde é o backend: um
              segundo motor de áudio no browser é a estrutura que produziu o bug do
              overlap, e a /eq já tem o preview ao vivo pra quem quer arrastar. */}
          {enxuto && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: ESP.sm,
              paddingTop: ESP.md, borderTop: `1px solid ${t12}`,
            }}>
              <Eixo
                rotulo="BRILHO"
                valor={`${(ESCURO_MAX - escuroDb).toFixed(1).replace('.', ',')}`}
                unidade="de 20"
                x={(ESCURO_MAX - escuroDb) / ESCURO_MAX}
                onChange={x => { setEscuroDb(ESCURO_MAX - x * ESCURO_MAX); setEqSujo(true) }}
                legenda="pra baixo abafa o chiado do stretch, pra cima abre o agudo"
              />
              <Eixo
                rotulo="GRAVE"
                valor={`${graveDb >= 0 ? '+' : ''}${graveDb.toFixed(1).replace('.', ',')}`}
                unidade="dB"
                x={(graveDb - GRAVE_MIN) / (GRAVE_MAX - GRAVE_MIN)}
                onChange={x => { setGraveDb(GRAVE_MIN + x * (GRAVE_MAX - GRAVE_MIN)); setEqSujo(true) }}
                legenda="corpo embaixo de 110 Hz"
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: ESP.md, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={refazerMaster}
                  disabled={!eqSujo || domando}
                  style={{
                    padding: '10px 20px', borderRadius: 6,
                    border: `1px solid ${eqSujo && !domando ? ACESO : t12}`,
                    background: eqSujo && !domando ? ACESO_FRACO : 'transparent',
                    color: domando ? t100 : eqSujo ? ACESO : t25,
                    cursor: domando ? 'progress' : eqSujo ? 'pointer' : 'default',
                    fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                  }}>
                  {domando ? 'APLICANDO…' : 'APLICAR'}
                </button>
                <a
                  href={`/eq?path=${encodeURIComponent(domar?.out || res.path)}`}
                  style={{ ...qualificadorTok, textDecoration: 'none', color: t45 }}>
                  mexer ouvindo ao vivo, na mesa completa
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 6 · domar: passo opcional, então colapsado ──
          No enxuto ele já rodou sozinho, então o disclosure deixa de ser "um passo
          que você pode dar" e passa a ser "o que foi feito com o seu som". */}
      {estado === 'pronto' && res?.path && (
        <details className="esticar-det" style={{ paddingTop: ESP.sm }}>
          <summary style={resumo}>
            <svg className="esticar-caret" width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
              <path d="M0.5 0.5 L6 4.5 L0.5 8.5 Z" fill="none" stroke={t45} strokeWidth="1" />
            </svg>
            {enxuto ? 'o master que rodou' : 'master, opcional'}
          </summary>

          <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.md, paddingTop: ESP.md }}>
            <span style={qualificadorTok}>
              notch, shelf, ceiling, comp, limiter.
              {!enxuto ? ' Só vale a pena se a cama saiu bruta.'
                : masterPedido ? ' Rodou com o brilho e o grave que você pôs.'
                  : ' Rodou sozinho neste render.'}
            </span>

            {/* Botão morto não desenha: no enxuto o domar já rodou, e um "DOMAR"
                ali seria oferta de uma ação que não tem o que fazer. Ele volta se
                o automático falhou, que é o único caso em que refazer resolve. */}
            {(!enxuto || !!domarErro) && <button
              onClick={() => void chamarDomar()}
              disabled={domando}
              style={{
                alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 8,
                border: `1px solid ${t12}`, background: 'transparent',
                color: domando ? t100 : t70,
                cursor: domando ? 'progress' : 'pointer',
                fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
              }}
            >
              {domando ? 'MASTERIZANDO…' : 'MASTERIZAR'}
            </button>}

            {domarErro && <Aviso estado="reprova" palavra="" texto={`o master falhou: ${domarErro.slice(0, 300)}`} />}

            {domando && (
              <span style={{ ...qualificadorTok, animation: 'esticar-pulso 1.4s ease-in-out infinite' }}>
                cama longa leva minutos.
              </span>
            )}

            {domar?.status === 'done' && domar.antes && domar.depois && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.lg }}>
                {/* antes e depois são DUAS ONDAS, não duas listas */}
                <Onda
                  peaks={ondaEsticada.peaks} estado={ondaEsticada.estado}
                  tinta={t45} altura={64} rotulo="ANTES" />
                <Onda
                  peaks={ondaDomada.peaks} estado={ondaDomada.estado}
                  tinta={t100} altura={64} rotulo="DEPOIS"
                  direita={domar.lufs != null ? `${num(domar.lufs)} LUFS` : null} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.md }}>
                  {LINHAS.map(l => (
                    <LinhaAntesDepois
                      key={l.key}
                      rotulo={l.rotulo}
                      antes={domar.antes![l.key]}
                      depois={domar.depois![l.key]}
                      unidade={l.unidade}
                      foraDaRessaca={foraDaRessaca}
                      ehPeriodo={l.key === 'periodo_s'}
                    />
                  ))}
                </div>

                <span style={qualificadorTok}>
                  {foraDaRessaca
                    ? `período de ${num(periodoS)} s está fora da faixa de ressaca (${RESSACA_MIN_S} a ${RESSACA_MAX_S} s): "não mudou" é o resultado certo, é a respiração da cama, achatar deixaria chapada.`
                    : `período de ${num(periodoS)} s está na faixa de ressaca (${RESSACA_MIN_S} a ${RESSACA_MAX_S} s): a onda foi achatada.`}
                </span>

                {domar.out && (
                  <audio controls src={audioSrc(domar.out)} style={{ width: '100%', height: 40, colorScheme: 'dark' }} />
                )}
              </div>
            )}
          </div>
        </details>
      )}

      <style>{`
        @keyframes esticar-pulso { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes esticar-corre { 0%{transform:translateX(-100%)} 100%{transform:translateX(320%)} }
        .esticar-det > summary { list-style: none; }
        .esticar-det > summary::-webkit-details-marker { display: none; }
        .esticar-det[open] .esticar-caret { transform: rotate(90deg); }
        .esticar-caret { transform-origin: 50% 50%; transition: transform 0.15s; }
      `}</style>
    </div>
  )
}

/**
 * Aviso e erro sem caixa e sem cor: um trilho à esquerda, sólido quando é falha,
 * vazado quando é só ressalva. É o mesmo vocabulário do veredito em `Medir`.
 */
function Aviso({ estado, texto, palavra }: { estado: Estado; texto: string; palavra?: string }) {
  const e = { ...ESTADO[estado], palavra: palavra ?? ESTADO[estado].palavra }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: ESP.sm }}>
      <div style={{
        width: 3, flexShrink: 0, borderRadius: 2,
        background: e.preenche ? e.tinta : 'transparent',
        border: e.preenche ? 'none' : `1px solid ${t45}`,
      }} />
      <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: t70, overflowWrap: 'anywhere' }}>
        {e.palavra ? `${e.palavra}: ${texto}` : texto}
      </span>
    </div>
  )
}

/* ── estilos ─────────────────────────────────────────────────────── */
//
// Sem `tela`, sem moldura, sem fundo: o que separa é ESPAÇO. Caixa que não separa
// nada é ruído, e a onda precisa da altura que a caixa estava tomando.

const coluna: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: ESP.md,
}

const rotuloOnda: React.CSSProperties = { ...rotuloTok, fontSize: 10 }

const rotuloPeq: React.CSSProperties = { ...rotuloTok, fontSize: 10 }

const valorMedida: React.CSSProperties = { ...valorTok, fontSize: 20 }

const linhaMedida: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(84px, 100px) auto 1fr',
  alignItems: 'baseline', columnGap: ESP.sm, rowGap: ESP.xs,
}

const resumo: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: ESP.xs,
  cursor: 'pointer', width: 'fit-content',
  ...rotuloTok,
}

/**
 * Um eixo do EQ: rótulo, valor, o controle, e UMA legenda dizendo o que ele faz.
 *
 * Mesma anatomia dos medidores do TOCAR, e de propósito: quem já aprendeu a ler um
 * medidor aqui não aprende outra coisa. `input[range]` cru, estilizado pelos tokens
 * da fábrica; não é componente novo do design system, é controle nativo pintado.
 */
function Eixo({ rotulo, valor, unidade, x, onChange, legenda }: {
  rotulo: string; valor: string; unidade: string
  x: number; onChange: (x: number) => void; legenda: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: ESP.sm }}>
        <span style={{ ...rotuloTok, fontSize: 10, minWidth: 58 }}>{rotulo}</span>
        <span style={{ font: `500 15px ${MONO}`, color: t100, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
        <span style={qualificadorTok}>{unidade}</span>
      </div>
      <input
        type="range"
        min={0} max={1} step={0.01}
        value={Math.max(0, Math.min(1, x))}
        aria-label={rotulo}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: ACESO, cursor: 'pointer' }}
      />
      <span style={qualificadorTok}>{legenda}</span>
    </div>
  )
}
