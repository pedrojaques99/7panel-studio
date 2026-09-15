/**
 * MEDIR — segunda seção da página linear: tocar, medir, esticar, ouvir.
 *
 * Não é painel. É bloco de página normal, uma coluna, empilhado.
 *
 * ## O veredito sem cor
 *
 * A tela é monocromática (um hue só, ver `ui.ts`). Então "reprovado" não pode mais
 * ser vermelho. Quem carrega a mensagem agora:
 *
 *   1. PESO e TAMANHO   o veredito é a maior coisa da tela, e só ele.
 *   2. PREENCHIMENTO    a barra do portão que reprova é SÓLIDA; as outras são
 *                       vazadas. É o sinal que sobrevive a um print minúsculo.
 *   3. POSIÇÃO NA ESCALA o que está errado sobe pro topo da tinta (`t100`), o que
 *                       está certo fica um degrau abaixo (`t70`). O errado chama.
 *   4. PALAVRA          `reprovado` e `atenção` ditos por extenso, não inferidos.
 *
 * ## Um número que decide, o resto sob demanda
 *
 * Quatro portões sempre abertos é relatório de engenharia. Aqui fica o veredito e
 * UMA linha dizendo por quê. Os portões viram `ver medidas`, fechado por padrão —
 * com a exceção que não colapsa: portão em aviso ou reprova fica visível junto do
 * veredito, porque o que está errado nunca se esconde atrás de um clique.
 *
 * Fala com POST /api/triagem (mesma rota do TriagemPanel), que leva ~5 s.
 */
import React, { useEffect, useState } from 'react'
import { resolveUrl } from '../lib/api'
import {
  ESTADO, ESP, LINHA, MONO, VALOR_G,
  t100, t70, t45, t25, t12,
  qualificador as qualificadorTok,
  rotulo as rotuloTok,
  valor as valorTok,
  type Estado,
} from './ui'

/* ── contrato do backend ─────────────────────────────────────────── */

export type Destino = 'eno' | 'aphex' | 'mount-shrine'

export type Receita = {
  esticar: number
  janela: number
  escuro_hz: number
  escuro_db: number
  teto_hz: number
  ambiencia?: string
  nivel_ambiencia?: number
}

export type PortaoStatus = Estado

export type Portao = {
  nome: string
  rotulo: string
  valor: number
  limiar: number
  status: PortaoStatus
  unidade: string
  obs: string
}

export type Veredito = 'pronto' | 'notchar' | 'achatar' | 'nao-estica'

export type Triagem = {
  arquivo: string
  dur_s: number
  pulso: number
  pulso_proxy: boolean
  apito_hz: number
  apito_x: number
  apito_estab: number
  cpp: number
  centroid_hz: number
  flatness: number
  corr: number
  veredito: Veredito
  /** A decisão real. `veredito` é o vocabulário técnico da CLI e só pesa pulso e
   *  apito; este campo reprova se QUALQUER portão reprovar — inclusive correlação,
   *  que ficava de fora e deixava um portão reprovado debaixo de um veredito limpo. */
  pode_esticar?: boolean
  reprovados?: string[]
  destino: Destino
  receita: Receita
  portoes: Portao[]
  af_notch: string
  erros: string[]
}

export type MedidaPronta = {
  destino: Destino
  receita: Receita
  podeEsticar: boolean
}

/* ── números em pt-BR ────────────────────────────────────────────── */

function num(v: number | null | undefined, casas = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(casas).replace('.', ',')
}

/** 4500 vira "4,5k", 13000 vira "13k", 800 vira "800" */
function khz(v: number): string {
  if (!isFinite(v)) return '—'
  if (v < 1000) return String(Math.round(v))
  const s = (Math.round((v / 1000) * 10) / 10).toFixed(1).replace('.', ',')
  return `${s.endsWith(',0') ? s.slice(0, -2) : s}k`
}

function minSeg(s: number): string {
  if (!isFinite(s) || s <= 0) return '—'
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r} s`
}

/* ── o veredito ──────────────────────────────────────────────────── */

const VEREDITOS: Record<string, { estado: Estado; titulo: string; frase: string; bloqueia: boolean }> = {
  'pronto': { estado: 'ok', titulo: 'LIBERADO', frase: 'take limpo: isso vira nuvem', bloqueia: false },
  'achatar': { estado: 'aviso', titulo: 'DÁ, MAS LEIA', frase: 'batida demais: pode virar onda em vez de nuvem', bloqueia: false },
  'notchar': { estado: 'aviso', titulo: 'DÁ, MAS LEIA', frase: 'apito parado que o stretch vai expor', bloqueia: false },
  'nao-estica': { estado: 'reprova', titulo: 'NÃO GASTE RENDER', frase: 'batida e apito juntos: três horas de render pra jogar fora', bloqueia: true },
}

/**
 * O veredito tem que concordar com os portões.
 *
 * `veredito` sozinho não serve: ele é o vocabulário técnico da CLI e só pesa pulso
 * e apito. Uma gravação com correlação −0,18 saía com o portão CORRELACAO reprovado
 * ("some em mono") debaixo de um veredito limpo ("fonte limpa"). Portão que se
 * contradiz na própria tela ensina a pessoa a ignorar os dois.
 *
 * Então o pior portão rebaixa o veredito, e quem reprovou é nomeado — sem isso o
 * "NÃO ESTIQUE" manda procurar o motivo em quatro linhas.
 */
function vereditoInfo(v: string, portoes: Portao[] = []) {
  const base = VEREDITOS[v] ?? {
    estado: 'aviso' as Estado, titulo: v.toUpperCase(),
    frase: 'veredito desconhecido: leia as medidas', bloqueia: false,
  }
  const reprovados = portoes.filter(p => p.status === 'reprova')
  if (reprovados.length && !base.bloqueia) {
    const nomes = reprovados.map(p => ROTULO_NA_TELA[p.nome] ?? p.rotulo).join(' e ')
    return {
      estado: 'reprova' as Estado, titulo: 'NÃO GASTE RENDER', bloqueia: true,
      frase: `${nomes.toLowerCase()} reprovou: ${reprovados[0].obs || 'veja as medidas'}`,
    }
  }
  const avisos = portoes.filter(p => p.status === 'aviso')
  if (avisos.length && base.estado === 'ok') {
    return { ...base, estado: 'aviso' as Estado, titulo: 'DÁ, MAS LEIA', frase: avisos[0].obs || base.frase }
  }
  return base
}

/** Legenda de UMA linha. O peso está no desenho, não aqui. */
function legenda(p: Portao, t: Triagem): string {
  switch (p.nome) {
    case 'pulso':
      return p.status === 'reprova' ? 'depois do stretch, vira onda'
        : p.status === 'aviso' ? 'resto de batida' : 'sem batida que sobreviva'
    case 'apito':
      return p.status === 'reprova' ? `apito parado em ${khz(t.apito_hz)} Hz`
        : p.status === 'aviso' ? `agudo em ${khz(t.apito_hz)} Hz é nota, não defeito`
          : 'nenhum agudo parado'
    case 'corr':
      return p.status === 'reprova' ? 'some em mono'
        : p.status === 'aviso' ? 'largo demais: perde corpo em mono' : 'aguenta mono'
    case 'cpp':
      return `puxa pra ${t.destino}`
    default:
      return p.obs
  }
}

/* ── EVIDÊNCIA: a régua ──────────────────────────────────────────── */
//
// O limiar é um TRAÇO na trilha: a linha é o fato. O domínio da forma é 2x o
// limiar, então o traço cai no meio e sobra meia trilha pra ver o quanto passou.
//
// Sem hue, quem diz "reprovou" é o PREENCHIMENTO: barra sólida contra barra
// vazada. Sobrevive a print em preto e branco, e a quem não distingue verde de
// vermelho.
//
// E a forma satura: `pulso` chega a 57,8 contra limiar 3,0. Barra proporcional
// nesse caso vira "cheia" e mente. Quando estoura, a trilha ganha a marca de
// estouro na ponta e QUEM DIZ O TAMANHO passa a ser o número ("19x o limite"),
// não a barra.

const H = 12

function Regua({ valor, limiar, tinta, preenche, simetrico }: {
  valor: number
  limiar: number
  tinta: string
  /** sólida em vez de vazada: é assim que reprova se anuncia sem cor. */
  preenche: boolean
  /** correlação vive em −1…1 e o limiar é o zero: a régua nasce do centro. */
  simetrico?: boolean
}) {
  const max = simetrico ? 1 : (limiar > 0 ? limiar * 2 : 1)
  const min = simetrico ? -1 : 0
  const pct = (v: number) => ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100
  const estourou = !simetrico && valor > max
  const zero = simetrico ? pct(0) : 0
  const ponta = pct(valor)
  const x0 = Math.min(zero, ponta)
  const larg = Math.max(0.8, Math.abs(ponta - zero))

  return (
    <svg width="100%" height={H} viewBox="0 0 100 12" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <rect x="0" y="3" width="100" height="6" rx="3" fill={t12} />
      <rect
        x={x0} y="3" width={estourou ? 100 - x0 : larg} height="6" rx="3"
        fill={preenche ? tinta : 'none'}
        stroke={preenche ? 'none' : tinta}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        opacity={estourou ? 0.6 : 0.9}
      />
      {/* marca de estouro: a trilha acabou, o valor não */}
      {estourou && (
        <g stroke={tinta} strokeWidth="1.4" opacity="0.95" vectorEffect="non-scaling-stroke">
          <line x1="94" y1="2" x2="97.5" y2="6" /><line x1="97.5" y1="6" x2="94" y2="10" />
          <line x1="97" y1="2" x2="100.5" y2="6" /><line x1="100.5" y1="6" x2="97" y2="10" />
        </g>
      )}
      {/* o limiar, desenhado */}
      <line
        x1={pct(limiar)} y1="0" x2={pct(limiar)} y2="12"
        stroke={t45} strokeWidth="1" vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Trilha morta: usada em carregando e em erro, pra nenhum estado ficar sem desenho. */
function ReguaVazia({ piscando }: { piscando?: boolean }) {
  return (
    <svg width="100%" height={H} viewBox="0 0 100 12" preserveAspectRatio="none" style={{ display: 'block' }}>
      <rect x="0" y="3" width="100" height="6" rx="3" fill={t12}
        style={piscando ? { animation: 'medir-pulso 1.4s ease-in-out infinite' } : undefined} />
      <line x1="50" y1="0" x2="50" y2="12" stroke={t12} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * O nome do portão na tela.
 *
 * O backend nomeia pelo estimador (`CORRELACAO`), que é a língua de quem calibrou.
 * Quem lê a tela quer saber o que PERDE: o número negativo significa que a cama
 * some no celular, e isso se chama mono. Os outros três já eram o nome da coisa.
 */
const ROTULO_NA_TELA: Record<string, string> = { corr: 'MONO' }

function LinhaPortao({ p, t }: { p: Portao; t: Triagem }) {
  const e = ESTADO[p.status]
  const simetrico = p.nome === 'corr'
  const max = simetrico ? 1 : (p.limiar > 0 ? p.limiar * 2 : 1)
  const estourou = !simetrico && p.valor > max
  const vezes = p.limiar > 0 ? p.valor / p.limiar : 0

  return (
    <div style={linhaPortao}>
      <span style={rotuloPortao}>{ROTULO_NA_TELA[p.nome] ?? p.rotulo}</span>

      {/* o valor sobe pro topo da escala quando está errado */}
      <span style={{ ...valorPortao, color: e.tinta }}>{num(p.valor)}{p.unidade}</span>

      {/* a régua em texto; quando estoura, é ele que diz o tamanho */}
      <span style={{ ...qualificadorTok, color: estourou ? e.tinta : t45 }}>
        {estourou ? `${num(vezes, 1)}x o limite` : simetrico ? 'zero é o limite' : `limite ${num(p.limiar)}`}
      </span>

      <div style={{ gridColumn: '2 / -1', paddingTop: 2 }}>
        <Regua valor={p.valor} limiar={p.limiar} tinta={e.tinta} preenche={e.preenche} simetrico={simetrico} />
      </div>

      <span style={{ ...legendaTxt, gridColumn: '2 / -1' }}>
        {e.palavra ? `${e.palavra}, ${legenda(p, t)}` : legenda(p, t)}
      </span>
    </div>
  )
}

/** Esqueleto de linha: carregando e erro continuam desenhados, não viram vazio. */
function LinhaMorta({ nome, piscando }: { nome: string; piscando?: boolean }) {
  return (
    <div style={linhaPortao}>
      <span style={{ ...rotuloPortao, color: t25 }}>{nome}</span>
      <span style={{ ...valorPortao, color: t12 }}>—</span>
      <span style={qualificadorTok} />
      <div style={{ gridColumn: '2 / -1', paddingTop: 2 }}><ReguaVazia piscando={piscando} /></div>
    </div>
  )
}

const NOMES_MORTOS = ['PULSO', 'CPP', 'APITO', 'CORRELACAO']

/**
 * O bloco do veredito. É a maior coisa da tela, e a única maior coisa da tela.
 *
 * O trilho à esquerda é o segundo sinal: SÓLIDO quando reprova, vazado quando não.
 * O terceiro é a palavra. Nenhum dos três depende de cor.
 */
function Faixa({ estado, titulo, frase, direita, palavra }: {
  estado: Estado
  titulo: string
  frase: string
  direita?: React.ReactNode
  /** Os estados de processo (medindo, erro) tomam emprestado o DESENHO do estado
   *  sem tomar a palavra: "atenção" ali não diria nada que o título já não diz. */
  palavra?: string
}) {
  const e = { ...ESTADO[estado], palavra: palavra ?? ESTADO[estado].palavra }
  return (
    <div style={faixa}>
      <div style={{
        width: 4, alignSelf: 'stretch', borderRadius: 2, flexShrink: 0,
        background: e.preenche ? e.tinta : 'transparent',
        border: e.preenche ? 'none' : `1px solid ${estado === 'aviso' ? t45 : t25}`,
      }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.xs, minWidth: 0 }}>
        {/* a palavra por extenso: o terceiro sinal, o que não depende de desenho */}
        {e.palavra && <span style={{ ...rotuloTok, color: e.tinta }}>{e.palavra}</span>}
        <h3 style={{ ...faixaTitulo, color: e.tinta }}>{titulo}</h3>
        <p style={faixaFrase}>{frase}</p>
      </div>
      {direita ? <span style={faixaArquivo}>{direita}</span> : null}
    </div>
  )
}

/* ── o componente ────────────────────────────────────────────────── */

/**
 * Modo da tela.
 *
 * `completo` é a tela de sempre: veredito enorme, portões, `ver medidas`.
 *
 * `etereo` é a MESMA medição sem tela própria. Ela vira estado do botão: uma barra
 * quieta enquanto mede, nada quando passa (o pai avança sozinho), e UMA frase
 * quando reprova. Isso só é honesto porque `ver medidas` continua ali com os
 * quatro portões e os números — o diagnóstico some da tela, não do app.
 */
export type ModoMedir = 'completo' | 'etereo'

/**
 * A recusa dita na língua de quem está com a mão no teclado.
 *
 * O portão fala em `ataques/s` e `estabilidade`, que são as unidades de quem
 * calibrou o limiar. Quem gravou precisa saber o que fazer DIFERENTE na próxima
 * gravação — então cada frase termina numa ação, não num número.
 *
 * Só existem quatro portões (`pulso`, `cpp`, `apito`, `corr`) e o `cpp` nunca
 * reprova: ele classifica destino. Sobram três, mais o caso de a medição não
 * fechar.
 *
 * A ação tem que ser possível NESTE modo, e duas não eram: a primeira versão
 * mandava "troque de oitava" (a oitava é travada por `TRANSPOR`) e "abra ajustar
 * e baixe o chorus" (o `ajustar` tem volume, envelope, LFO e onda; chorus não
 * está lá). Instrução impossível é pior que instrução nenhuma, porque a pessoa
 * procura o controle e conclui que a burra é ela.
 */
const FRASE_ETEREA: Record<string, string> = {
  pulso: 'Martelou demais. Cada batida vira uma onda de 6 segundos depois do stretch. Segure os acordes por mais tempo.',
  apito: 'Tem um assobio agudo preso no som, e o stretch deixa ele parado por minutos. Toque mais grave, na parte esquerda do teclado.',
  corr: 'Os dois lados se cancelam, e a cama some em mono, tipo no celular. Grave outro take.',
}

const FRASE_GENERICA = 'Essa gravação não passa no portão. Abra ver medidas pra saber qual.'

export function Medir({ path, onDestino, modo = 'completo' }: {
  path: string | null
  onDestino: (d: MedidaPronta) => void
  modo?: ModoMedir
}) {
  // O veredito carrega o `path` que o gerou. "vazio" e "medindo" saem daí por
  // DERIVAÇÃO no render: veredito de outro arquivo não é veredito deste, então não
  // há reset a disparar quando a fonte troca.
  const [medida, setMedida] = useState<
    { path: string; estado: 'pronto' | 'erro'; res: Triagem | null; erroMsg: string } | null
  >(null)
  const atual = medida && medida.path === path ? medida : null
  const estado: 'vazio' | 'medindo' | 'pronto' | 'erro' = !path ? 'vazio' : atual ? atual.estado : 'medindo'
  const res = atual?.res ?? null
  const erroMsg = atual?.erroMsg ?? ''

  useEffect(() => {
    if (!path) return

    // `cancelado` existe porque a medição leva ~5 s: se o usuário gravar outra
    // coisa no meio, a resposta da gravação ANTERIOR chegaria depois e pintaria a
    // tela com o veredito do arquivo errado.
    let cancelado = false

    void (async () => {
      try {
        const r = await fetch(resolveUrl('/api/triagem'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        })
        const data = await r.json()
        if (cancelado) return
        if (data?.error) { setMedida({ path, estado: 'erro', res: null, erroMsg: String(data.error) }); return }

        const t = data as Triagem
        setMedida({ path, estado: 'pronto', res: t, erroMsg: '' })

        const temErro = Array.isArray(t.erros) && t.erros.length > 0
        // `pode_esticar` é a decisão do backend olhando TODOS os portões. O
        // fallback pro `veredito` cobre backend antigo, e só ele — derivar do
        // veredito é o que deixava um portão reprovado debaixo de um veredito limpo.
        onDestino({
          destino: t.destino,
          receita: t.receita,
          podeEsticar: (t.pode_esticar ?? (t.veredito !== 'nao-estica')) && !temErro,
        })
      } catch (e) {
        if (cancelado) return
        setMedida({ path, estado: 'erro', res: null, erroMsg: String(e) })
      }
    })()

    return () => { cancelado = true }
    // `onDestino` fora das dependências de propósito: o pai costuma passar função
    // nova a cada render, e isso remediria o arquivo em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  const info = res ? vereditoInfo(res.veredito, res.portoes) : null
  const temErro = !!res?.erros?.length

  // A exceção que não colapsa: portão em aviso ou reprova fica ao lado do
  // veredito. O resto vai pro `ver medidas`, fechado. Cada portão aparece de um
  // lado só, nunca nos dois.
  const portoes = res?.portoes ?? []
  const expostos = portoes.filter(p => p.status !== 'ok')
  const guardados = portoes.filter(p => p.status === 'ok')

  if (modo === 'etereo') {
    /* A ordem importa: erro de rede primeiro, medição que não fechou depois, e só
       então o portão. Um arquivo que nem abriu não tem portão pra reprovar. */
    const reprovado = portoes.find(p => p.status === 'reprova')
    const frase =
      estado === 'erro' ? `Não deu pra conferir o arquivo. ${erroMsg.slice(0, 140)}`
        : temErro ? `A medição não fechou: ${res?.erros.join('. ')}`
          : reprovado ? (FRASE_ETEREA[reprovado.nome] ?? reprovado.obs ?? FRASE_GENERICA)
            : null

    return (
      <div style={secao}>
        {estado === 'vazio' && <p style={pequeno}>grave alguma coisa primeiro</p>}

        {/* Enquanto mede, o botão é o que fala. Marca vazada, sem número: os 5 s
            são estimativa do backend, e contador regressivo que erra é pior que
            contador nenhum. */}
        {estado === 'medindo' && (
          <div style={barraQuieta}>
            <span aria-hidden style={marcaOca} />
            conferindo o som
            <span style={{ marginLeft: 'auto', ...qualificadorTok, letterSpacing: 0, textTransform: 'none' }}>
              uns 5 s
            </span>
          </div>
        )}

        {/* A recusa: uma frase, e ela termina numa ação. */}
        {frase && (
          <div style={recusa}>
            <span style={recusaPalavra}>regravar</span>
            <p style={recusaFrase}>{frase}</p>
          </div>
        )}

        {/* O diagnóstico sai da tela, não do app: os quatro portões continuam
            aqui, com os mesmos números da tela completa. Aberto por padrão quando
            reprovou — o que está errado não se esconde atrás de um clique. */}
        {estado === 'pronto' && res && portoes.length > 0 && (
          <details className="medir-det" open={!!frase}>
            <summary style={resumo}>
              <svg className="medir-caret" width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
                <path d="M0.5 0.5 L6 4.5 L0.5 8.5 Z" fill="none" stroke={t45} strokeWidth="1" />
              </svg>
              medidas do take
            </summary>
            <div style={{ ...lista, paddingTop: ESP.md }}>
              {portoes.map(p => <LinhaPortao key={p.nome} p={p} t={res} />)}
            </div>
          </details>
        )}

        <style>{`
          .medir-det > summary { list-style: none; }
          .medir-det > summary::-webkit-details-marker { display: none; }
          .medir-det[open] .medir-caret { transform: rotate(90deg); }
          .medir-caret { transform-origin: 50% 50%; transition: transform 0.15s; }
        `}</style>
      </div>
    )
  }

  return (
    <div style={secao}>
      {/* ── VAZIO: tem desenho, não é null ── */}
      {estado === 'vazio' && (
        <Faixa estado="ok" titulo="SEM TAKE" frase="grave alguma coisa primeiro" />
      )}

      {/* ── CARREGANDO: esqueleto com a mesma anatomia ── */}
      {estado === 'medindo' && (
        <>
          <Faixa estado="aviso" palavra="" titulo="MEDINDO" frase="leva uns 5 segundos" />
          <div style={lista}>
            {NOMES_MORTOS.map(n => <LinhaMorta key={n} nome={n} piscando />)}
          </div>
        </>
      )}

      {/* ── ERRO: também desenhado ── */}
      {estado === 'erro' && (
        <>
          <Faixa estado="reprova" palavra="" titulo="NÃO DEU PRA MEDIR" frase={erroMsg.slice(0, 200)} />
          <div style={lista}>
            {NOMES_MORTOS.map(n => <LinhaMorta key={n} nome={n} />)}
          </div>
        </>
      )}

      {estado === 'pronto' && res && info && (
        <>
          <Faixa
            estado={temErro ? 'reprova' : info.estado}
            palavra={temErro ? '' : undefined}
            titulo={temErro ? 'NÃO GASTE RENDER' : info.titulo}
            frase={temErro ? `a medição não fechou: ${res.erros.join('. ')}` : info.frase}
            direita={<>{res.arquivo}<br />{minSeg(res.dur_s)}</>}
          />

          {/* o que está errado nunca se esconde atrás de um clique */}
          {expostos.length > 0 && (
            <div style={lista}>
              {expostos.map(p => <LinhaPortao key={p.nome} p={p} t={res} />)}
            </div>
          )}

          {/* o resto sob demanda */}
          {guardados.length > 0 && (
            <details className="medir-det">
              <summary style={resumo}>
                <svg className="medir-caret" width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
                  <path d="M0.5 0.5 L6 4.5 L0.5 8.5 Z" fill="none" stroke={t45} strokeWidth="1" />
                </svg>
                ver medidas
              </summary>
              <div style={{ ...lista, paddingTop: ESP.md }}>
                {guardados.map(p => <LinhaPortao key={p.nome} p={p} t={res} />)}
              </div>
            </details>
          )}

          {/* a receita: é o que a pessoa confere antes de gastar */}
          <p style={pequeno}>
            cama <span style={{ color: t70 }}>{res.destino}</span>
            {', '}{num(res.receita.esticar, 0)}x
            {', '}janela {num(res.receita.janela)} s
            {', '}−{num(res.receita.escuro_db, 0)} dB @ {khz(res.receita.escuro_hz)}
            {', '}teto {khz(res.receita.teto_hz)}
          </p>
        </>
      )}

      <style>{`
        @keyframes medir-pulso { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .medir-det > summary { list-style: none; }
        .medir-det > summary::-webkit-details-marker { display: none; }
        .medir-det[open] .medir-caret { transform: rotate(90deg); }
        .medir-caret { transform-origin: 50% 50%; transition: transform 0.15s; }
      `}</style>
    </div>
  )
}

/* ── estilos de bloco (página normal, uma coluna) ────────────────── */
//
// Sem título aqui: a `Fabrica` já envolve este componente numa `Secao` numerada.
// Dois títulos seria repetição.
//
// Sem caixa, sem moldura, sem fundo: o que separa os blocos é ESPAÇO. Moldura que
// não separa nada é ruído, e ruído é o que estamos tirando.

const secao: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: ESP.lg,
}

const faixa: React.CSSProperties = {
  display: 'flex', alignItems: 'stretch', gap: ESP.md,
}

const faixaTitulo: React.CSSProperties = {
  margin: 0, font: VALOR_G, fontWeight: 800,
  fontSize: 'clamp(28px, 8.5vw, 46px)', letterSpacing: '0.02em',
  overflowWrap: 'anywhere',
}

const faixaFrase: React.CSSProperties = {
  margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: 1.5, color: t70,
  overflowWrap: 'anywhere',
}

const faixaArquivo: React.CSSProperties = {
  marginLeft: 'auto', flexShrink: 0, textAlign: 'right',
  fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: t25,
  fontVariantNumeric: 'tabular-nums',
}

const lista: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: ESP.md,
}

const linhaPortao: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(96px, 120px) auto 1fr',
  alignItems: 'baseline', columnGap: ESP.sm, rowGap: ESP.xs,
}

const rotuloPortao: React.CSSProperties = { ...rotuloTok, fontSize: 10 }

const valorPortao: React.CSSProperties = { ...valorTok, fontSize: 20 }

const legendaTxt: React.CSSProperties = {
  fontFamily: MONO, fontSize: 11, color: t45, lineHeight: 1.4,
}

const resumo: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: ESP.xs,
  cursor: 'pointer', width: 'fit-content',
  ...rotuloTok,
}

const pequeno: React.CSSProperties = {
  margin: 0, fontFamily: MONO, fontSize: 11, lineHeight: 1.6,
  color: t45, fontVariantNumeric: 'tabular-nums',
}

/* ── modo etéreo ─────────────────────────────────────────────────── */
//
// Mesma anatomia da faixa de ação do TOCAR: marca à esquerda, rótulo, régua à
// direita. Sem cor de estado — quem diz "espera" é a marca VAZADA, e quem diz
// "recusou" é a barra sólida à esquerda da frase.

const barraQuieta: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: ESP.sm,
  padding: `${ESP.md}px ${ESP.md}px`,
  border: LINHA, borderRadius: 3,
  ...rotuloTok, color: t70,
}

const marcaOca: React.CSSProperties = {
  width: 9, height: 9, borderRadius: '50%', flex: 'none',
  border: `1px solid ${t45}`,
}

const recusa: React.CSSProperties = {
  display: 'flex', gap: ESP.sm, alignItems: 'flex-start',
  padding: `${ESP.sm}px ${ESP.md}px`,
  borderLeft: `2px solid ${t45}`,
}

const recusaPalavra: React.CSSProperties = {
  ...rotuloTok, color: t100, flex: 'none', paddingTop: 3, lineHeight: 1.4,
}

const recusaFrase: React.CSSProperties = {
  margin: 0, fontFamily: MONO, fontSize: 13, lineHeight: 1.5, color: t100,
  overflowWrap: 'anywhere',
}
