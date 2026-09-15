/**
 * A grade de arranjo: a forma da peça, clicável.
 *
 * ## Por que este componente existe
 *
 * O arranjo de uma take morava em dois lugares — o desenho ASCII no comentário e
 * a `.mask()` no código — e os dois podiam discordar sem ninguém perceber. Você
 * lia o desenho, decidia pelo desenho, e o som era outro. Medido no repertório:
 * em `entropia.js` o desenho listava `bumbo` em 2º e o `stack` tinha `fx` em 2º.
 *
 * A raiz foi fechada em `camadas.ts` (a `.mask()` manda; o desenho é o retrato
 * dela) e prendida em `patterns.test.ts`. Este componente é a outra metade: em
 * vez de digitar `<0 0 0 1 1 1 1 0>` contando dígito por dígito, você clica na
 * forma. Cada clique escreve a máscara E redesenha o comentário no MESMO edit —
 * é `sincronizarGrade` logo depois de `alternarCasa`, sempre os dois juntos.
 *
 * ## O contrato com o código, que é o mesmo do resto da rota
 *
 * O estado dos botões NÃO vive em React: vive no `.js`, e é lido de volta dele.
 * Um botão que muda o arranjo sem o código dizer isso transforma o editor em
 * mentiroso — a pessoa salva a versão, reabre amanhã e o take soa diferente do
 * que está escrito. Por isso não há `useState` de casa aqui: a fonte é o texto.
 *
 * ## Nível de acabamento, e o que isso quer dizer NESTE design system
 *
 * `fabrica/ui.ts` é monocromático de propósito: um hue só, e significado
 * carregado por PESO e PREENCHIMENTO, não por cor. Então o acabamento não está
 * em brilho — está em: casa acesa é PREENCHIDA (sobrevive a print em P&B e a
 * daltonismo); o cabeçote responde no `pointerdown`, não no `click`, porque o
 * toque acontece quando o dedo encosta; arrastar PINTA com o modo travado pela
 * primeira célula, como Ableton e Logic, senão desenhar 8 casas são 8 cliques; e
 * a agulha do relógio anda FORA do React.
 *
 * Nenhum componente novo do design system foi criado. Tudo sai de `fabrica/ui`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESO, ACESO_FRACO, ESP, FUNDO_ALTO, LINHA, MONO, t100, t12, t25, t45, t70,
} from '../fabrica/ui'
import {
  alternarCasa, casaDoCiclo, detectarCamadas, gradeDoTake, linhasDoDesenho,
  removerCasa, sincronizarGrade,
} from './camadas'
import { duracaoDoArranjo, mmss } from './exportacao'
import { carregarRelogio, casaAgora, cicloAgora, type Relogio } from './relogio'

/* O relógio mora em `relogio.ts`. Duas vistas lendo a mesma fonte ainda podiam
   discordar — e discordaram — porque cada uma convertia por conta própria; a
   conversão agora também é uma só. Ver o cabeçalho daquele arquivo. */

type Props = {
  /**
   * O BUFFER do editor — e aqui a `Timeline` logo abaixo faz o oposto de
   * propósito. Ela desenha eventos, então precisa do padrão que está soando;
   * esta grade lê e escreve TEXTO, e tem que funcionar antes do primeiro play.
   */
  codigo: string
  bpm: number
  tocando: boolean
  onAplicar: (codigo: string) => void
  /** A camada escolhida — a MESMA da linha do tempo. Ver as props de lá. */
  sel: number
  onSel: (i: number) => void
}

const LS_ABERTA = 'musica-grade-aberta'

const CELULA = 22
const VAO = 3
const ROTULO_L = 92

export function GradeArranjo({ codigo, bpm, tocando, onAplicar, sel, onSel }: Props) {
  const [aberta, setAberta] = useState(() => localStorage.getItem(LS_ABERTA) !== '0')
  const [foco, setFoco] = useState({ linha: 0, casa: 0 })

  const camadas = useMemo(() => detectarCamadas(codigo), [codigo])
  const grade = useMemo(() => gradeDoTake(camadas), [camadas])

  /**
   * Onde o autor pôs um divisor no desenho (`//  ─────`).
   *
   * As linhas do desenho são contíguas; um buraco entre elas é um divisor, e
   * divisor separa coisa que significa (textura em cima, base rítmica embaixo).
   * A grade estava achatando isso numa pilha só.
   */
  const cortes = useMemo(() => {
    const ln = linhasDoDesenho(codigo)
    const s = new Set<number>()
    for (let i = 1; i < ln.length; i++) if (ln[i] !== ln[i - 1] + 1) s.add(i)
    return s
  }, [codigo])

  // O código que ESTE componente acabou de produzir. Sem isto, um arrasto rápido
  // encadeia edições em cima do `codigo` da prop, que só volta no próximo render
  // do pai — e as casas do meio do gesto se perdem sem erro nenhum.
  const codigoRef = useRef(codigo)
  useEffect(() => { codigoRef.current = codigo }, [codigo])

  const aplicar = useCallback((linha: number, casa: number, ligado: boolean) => {
    const antes = codigoRef.current
    const cs = detectarCamadas(antes)
    const g = gradeDoTake(cs)
    if (!g.ok || !cs[linha]) return
    const comMascara = alternarCasa(antes, cs[linha], casa, g.arranjo, ligado)
    if (comMascara === antes) return
    // Os dois no mesmo edit, sempre. Escrever a máscara sem redesenhar o
    // comentário recriaria, em um clique, a divergência que este arquivo inteiro
    // existe pra fechar.
    const depois = sincronizarGrade(comMascara, detectarCamadas(comMascara))
    codigoRef.current = depois
    onAplicar(depois)
  }, [onAplicar])

  /**
   * A coluna inteira, num edit só.
   *
   * O pedido que gerou isto: "quero desativar a casa 1 de todos, são muito
   * mortos". Fazer isso célula a célula são N cliques e N passos de desfazer —
   * e o desfazer é o pior: consertar o arrependimento custaria tantos Ctrl+Z
   * quantas camadas a peça tem, o que na prática significa que ninguém tenta.
   * Aqui a coluna toda é UMA edição e UM desfazer.
   *
   * O sentido do clique não é fixo: se QUALQUER casa da coluna está acesa, o
   * clique apaga a coluna; se nenhuma está, acende. É o único inverso possível
   * sem guardar memória do que estava ligado — e sem inverso a coluna vira ação
   * de mão única, que numa tela que escreve no arquivo é o mesmo que destrutiva.
   *
   * Camada sem `.mask()` própria ganha uma aqui: ela tocava em tudo por ausência
   * de arranjo, e apagar a casa 1 dela é justamente escrever a decisão que
   * faltava. Isso aparece no código na hora, como todo o resto desta tela.
   */
  const aplicarColuna = useCallback((casa: number) => {
    const inicial = codigoRef.current
    const g0 = gradeDoTake(detectarCamadas(inicial))
    if (!g0.ok) return
    const alvo = !g0.linhas.some(l => l.casas[casa])

    let atual = inicial
    for (let i = 0; i < g0.linhas.length; i++) {
      if (g0.linhas[i].casas[casa] === alvo) continue
      // Redetecta a cada passo: cada escrita move os offsets das camadas
      // seguintes, e usar o recorte velho escreveria no meio da camada errada.
      const c = detectarCamadas(atual)[i]
      if (c) atual = alternarCasa(atual, c, casa, g0.arranjo, alvo)
    }
    if (atual === inicial) return

    const depois = sincronizarGrade(atual, detectarCamadas(atual))
    codigoRef.current = depois
    onAplicar(depois)
  }, [onAplicar])

  /**
   * Remover a casa: a peça vai de N pra N-1 e o trecho some do tempo.
   *
   * Alt+clique, que é o mesmo modificador que a `Timeline` já usa pra "só ela" —
   * o vocabulário da casa para gesto secundário sobre o mesmo alvo. Anunciado no
   * `title` de toda coluna e na linha de ajuda embaixo da grade, porque gesto
   * com modificador que ninguém conta é gesto que não existe.
   *
   * Fica atrás do modificador, e não num botão próprio, por duas razões: apagar
   * a coluna é o gesto de todo dia e remover é o de vez em quando (um primário
   * por superfície), e a régua tem 22px por casa — um segundo alvo ali seria
   * menor que o dedo. Reversível pelo Ctrl+Z, como todo o resto desta tela.
   */
  const removerColuna = useCallback((casa: number) => {
    const antes = codigoRef.current
    const cs = detectarCamadas(antes)
    const g = gradeDoTake(cs)
    if (!g.ok) return
    const depois = removerCasa(antes, cs, casa, g.arranjo)
    if (depois === antes) return
    codigoRef.current = depois
    onAplicar(depois)
  }, [onAplicar])

  /* ── o gesto: clicar e arrastar ────────────────────────────────── */
  //
  // O modo (ligar ou desligar) é decidido na PRIMEIRA célula e as seguintes
  // obedecem. Alternar cada uma sob o dedo inverteria casas alternadas e o
  // desenho viraria ruído — é o motivo de `alternarCasa` aceitar `ligado`.
  const pintando = useRef<null | boolean>(null)

  const celulaEm = (x: number, y: number): { linha: number; casa: number } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const alvo = el?.closest('[data-linha]') as HTMLElement | null
    if (!alvo) return null
    return { linha: Number(alvo.dataset.linha), casa: Number(alvo.dataset.casa) }
  }

  useEffect(() => {
    const soltar = () => { pintando.current = null }
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [])

  const noPointerDown = (linha: number, casa: number, ligada: boolean) => (e: React.PointerEvent) => {
    e.preventDefault()          // não rouba o foco do editor nem seleciona texto
    pintando.current = !ligada
    setFoco({ linha, casa })
    aplicar(linha, casa, !ligada)
  }

  // `pointermove` no contêiner + `elementFromPoint`, e não `pointerenter` por
  // célula: no toque o `pointerenter` não dispara durante o arrasto, então a
  // pintura só funcionaria no mouse.
  const noPointerMove = (e: React.PointerEvent) => {
    if (pintando.current === null) return
    const alvo = celulaEm(e.clientX, e.clientY)
    if (alvo) aplicar(alvo.linha, alvo.casa, pintando.current)
  }

  /* ── a agulha, fora do React ───────────────────────────────────── */
  //
  // Só UMA coisa muda a 60 fps: onde a peça está. Re-renderizar 40 células por
  // quadro pra mover um traço é o erro que a `Timeline` já tinha resolvido com
  // canvas. Aqui é mais barato ainda: um elemento, um `transform` por quadro.
  const gradeRef = useRef<HTMLDivElement>(null)
  const agulhaRef = useRef<HTMLDivElement>(null)
  const colunasRef = useRef<(HTMLElement | null)[]>([])
  const relogio = useRef<Relogio | null>(null)
  const casaAcesa = useRef(-1)

  useEffect(() => {
    let morto = false
    carregarRelogio().then(r => { if (!morto) relogio.current = r }).catch(() => {})
    return () => { morto = true }
  }, [])

  const total = grade.ok ? grade.arranjo.casas * grade.arranjo.porCasa : 0

  useEffect(() => {
    if (!aberta || !grade.ok) return
    let vivo = true
    let quadro = 0

    const passo = () => {
      if (!vivo) return
      quadro = requestAnimationFrame(passo)

      // Sem conversão nenhuma aqui: `cicloAgora` já devolve ciclo, e `null`
      // quando não há som. Foi a conta local que fazia esta grade discordar da
      // régua da linha do tempo.
      const agora = cicloAgora(relogio.current)
      const andando = agora !== null
      const ciclo = agora ?? 0

      const ag = agulhaRef.current
      if (ag) {
        const visivel = andando && tocando
        ag.style.opacity = visivel ? '1' : '0'
        if (visivel) {
          const volta = ((ciclo % total) + total) % total
          ag.style.transform = `translateX(${(volta / total) * (grade.arranjo.casas * (CELULA + VAO))}px)`
        }
      }

      // A casa acesa muda a cada `porCasa` ciclos (uns 14 s), não a cada quadro.
      // Escrever o estilo só na troca evita 60 escritas por segundo em 8 nós.
      const casa = andando && tocando
        ? casaAgora(agora, grade.arranjo) ?? -1
        : -1
      if (casa !== casaAcesa.current) {
        colunasRef.current.forEach((c, i) => {
          if (c) c.style.background = i === casa ? ACESO_FRACO : 'transparent'
        })
        // `data-agora` na coluna inteira, e o CSS decide o resto. Trocar
        // atributo em 9 nos a cada ~14 s e barato; o que NAO pode e re-render.
        const raiz = gradeRef.current
        if (raiz) {
          raiz.querySelectorAll<HTMLElement>('[data-agora]')
            .forEach(e => e.removeAttribute('data-agora'))
          if (casa >= 0) {
            raiz.querySelectorAll<HTMLElement>(`[data-casa="${casa}"]`)
              .forEach(e => { e.dataset.agora = '1' })
          }
        }
        casaAcesa.current = casa
      }
    }

    quadro = requestAnimationFrame(passo)
    return () => { vivo = false; cancelAnimationFrame(quadro) }
    // `bpm` saiu das dependências junto com a conversão: o relógio não depende
    // dele, e mantê-lo aqui reiniciava o rAF a cada digitada no campo de tempo.
  }, [aberta, grade, tocando, total])

  /* ── teclado: a grade é uma matriz, e teclado espera matriz ────── */
  const noTeclado = (linha: number, casa: number, ligada: boolean) => (e: React.KeyboardEvent) => {
    if (!grade.ok) return
    const mover = (dl: number, dc: number) => {
      e.preventDefault()
      const l = Math.max(0, Math.min(grade.linhas.length - 1, linha + dl))
      const c = Math.max(0, Math.min(grade.arranjo.casas - 1, casa + dc))
      setFoco({ linha: l, casa: c })
      const alvo = document.querySelector<HTMLElement>(`[data-linha="${l}"][data-casa="${c}"]`)
      alvo?.focus()
    }
    if (e.key === 'ArrowLeft') return mover(0, -1)
    if (e.key === 'ArrowRight') return mover(0, 1)
    if (e.key === 'ArrowUp') return mover(-1, 0)
    if (e.key === 'ArrowDown') return mover(1, 0)
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      aplicar(linha, casa, !ligada)
    }
  }

  const cabecalho = (
    <button
      onClick={() => { setAberta(a => { localStorage.setItem(LS_ABERTA, a ? '0' : '1'); return !a }) }}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer', padding: `${ESP.xs}px ${ESP.sm}px`,
        display: 'flex', alignItems: 'center', gap: ESP.xs, width: '100%', textAlign: 'left',
        font: `500 9px/1 ${MONO}`, letterSpacing: '0.14em', textTransform: 'uppercase', color: t45,
      }}
      aria-expanded={aberta}
    >
      <span aria-hidden style={{ color: t25 }}>{aberta ? '▾' : '▸'}</span>
      arranjo
    </button>
  )

  if (!aberta) {
    return <div style={{ borderTop: LINHA, background: FUNDO_ALTO, flexShrink: 0 }}>{cabecalho}</div>
  }

  return (
    <div style={{ borderTop: LINHA, background: FUNDO_ALTO, flexShrink: 0 }}>
      {cabecalho}

      {!grade.ok ? (
        /* Recusa NOMEADA: uma grade que a gente adivinha é pior que uma grade
           que não desenha, e "não dá" sem dizer o quê não deixa consertar. */
        <p style={{
          margin: 0, padding: `0 ${ESP.sm}px ${ESP.sm}px`,
          font: `400 10px/1.5 ${MONO}`, color: t45, maxWidth: 460,
        }}>
          {grade.motivo}
          {grade.discordantes.length > 0 && (
            <>
              {' — '}
              <span style={{ color: t100 }}>{grade.discordantes.join(', ')}</span>
              {'. toda camada com .mask() precisa do mesmo número de casas e do mesmo /N.'}
            </>
          )}
        </p>
      ) : (
        <div style={{ padding: `0 ${ESP.sm}px ${ESP.xs}px`, overflowX: 'auto' }}>
          <div
            ref={gradeRef}
            role="grid"
            aria-label="grade de arranjo"
            onPointerMove={noPointerMove}
            style={{ display: 'inline-block', position: 'relative', touchAction: 'none' }}
          >
            {/* ── régua de casas, e o fundo da coluna que está tocando ── */}
            <div style={{ display: 'flex', marginLeft: ROTULO_L }}>
              {Array.from({ length: grade.arranjo.casas }, (_, j) => {
                const acesas = grade.linhas.filter(l => l.casas[j]).length
                return (
                  <button
                    key={j}
                    ref={el => { colunasRef.current[j] = el }}
                    onClick={e => {
                      // O número da casa quer dizer uma coisa só: TIRA ISSO. E
                      // ele escala — primeiro clique apaga a coluna, e se ela
                      // já está vazia o clique seguinte remove a casa.
                      //
                      // Por que não parar no "apagar": apagada, a coluna
                      // continua ocupando os mesmos 8 compassos, e o que se
                      // ouve é silêncio no lugar de uma abertura. Foi o relato
                      // que gerou esta escala — "ainda tá tocando a coluna
                      // mesmo desativada". Quem apagou a coluna toda já disse o
                      // que queria; obrigar a descobrir um modificador pra
                      // terminar a frase é a interface cobrando pedágio.
                      //
                      // "Acender tudo de volta" some daqui e não faz falta: ele
                      // nunca foi inverso de verdade (ligava camadas que jamais
                      // estiveram ligadas). O inverso dos dois gestos é o mesmo
                      // e é melhor — Ctrl+Z.
                      if (e.altKey) { e.preventDefault(); removerColuna(j) }
                      else if (acesas === 0) removerColuna(j)
                      else aplicarColuna(j)
                    }}
                    className="grade-coluna"
                    title={acesas > 0
                      ? `apagar a casa ${j + 1} em todas as camadas`
                        + ` · alt+clique remove a casa (${grade.arranjo.casas} → ${grade.arranjo.casas - 1})`
                      : `remover a casa ${j + 1}: a volta encurta de ${grade.arranjo.casas}`
                        + ` pra ${grade.arranjo.casas - 1} casas`}
                    aria-label={acesas > 0
                      ? `apagar a casa ${j + 1} em todas as ${grade.linhas.length} camadas`
                      : `remover a casa ${j + 1} do arranjo`}
                    style={{
                      width: CELULA, marginRight: VAO, textAlign: 'center',
                      border: 'none', padding: 0, cursor: 'pointer',
                      font: `400 9px/14px ${MONO}`, color: t25,
                      fontVariantNumeric: 'tabular-nums',
                      // O fundo é escrito pelo rAF (coluna que está tocando):
                      // deixar 'transparent' aqui e não no CSS evita que a
                      // classe e o relógio disputem a mesma propriedade.
                      background: 'transparent',
                    }}
                  >
                    {j + 1}
                  </button>
                )
              })}
            </div>

            {/* ── a agulha: onde a peça está, dentro da volta ── */}
            <div
              ref={agulhaRef}
              aria-hidden
              style={{
                position: 'absolute', top: 14, left: ROTULO_L, width: 1, opacity: 0,
                height: grade.linhas.length * (CELULA + VAO), background: ACESO,
                pointerEvents: 'none', willChange: 'transform',
              }}
            />

            {grade.linhas.map((l, i) => (
              <div
                key={l.indice}
                role="row"
                style={{
                  display: 'flex', alignItems: 'center',
                  marginTop: cortes.has(i) ? ESP.xs : 0,
                  paddingTop: cortes.has(i) ? ESP.xs : 0,
                  borderTop: cortes.has(i) ? LINHA : undefined,
                }}
              >
                {/* O rótulo seleciona a camada — a mesma seleção que a régua da
                    linha do tempo usa pros controles de fx. Sem isto, escolher
                    uma camada na grade e agir nela embaixo eram dois gestos em
                    dois lugares pra uma decisão só.

                    Realce por PESO e CLARIDADE, não por cor: `fabrica/ui` é
                    monocromático, e a fileira escolhida é a mais clara da grade
                    do mesmo jeito que a faixa escolhida é a mais clara da
                    timeline. */}
                <button
                  onClick={() => onSel(i)}
                  title={`escolher ${l.rotulo} — os controles da linha do tempo passam a agir nela`}
                  style={{
                    width: ROTULO_L, paddingRight: ESP.xs, textAlign: 'right',
                    background: 'none', border: 'none', cursor: 'pointer',
                    font: `${i === sel ? 500 : 400} 10px/1 ${MONO}`,
                    color: i === sel ? t100 : t45,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {l.rotulo}
                  {/* Camada sem `.mask()` toca em tudo — está acesa por ausência
                      de arranjo, não por escolha. Dizer isso evita que a fileira
                      cheia pareça uma decisão que ninguém tomou. */}
                  {!l.propria && <span style={{ color: t12 }}> ○</span>}
                </button>

                {l.casas.map((ligada, j) => (
                  <button
                    key={j}
                    role="gridcell"
                    data-linha={i}
                    data-casa={j}
                    aria-pressed={ligada}
                    aria-label={`${l.rotulo}, casa ${j + 1} de ${grade.arranjo.casas}`}
                    tabIndex={foco.linha === i && foco.casa === j ? 0 : -1}
                    onPointerDown={noPointerDown(i, j, ligada)}
                    onKeyDown={noTeclado(i, j, ligada)}
                    onFocus={() => { setFoco({ linha: i, casa: j }); onSel(i) }}
                    className="grade-casa"
                    style={{
                      width: CELULA, height: CELULA, marginRight: VAO, marginBottom: VAO,
                      padding: 0, cursor: 'pointer',
                      // Sem cor de estado aqui: quem pinta é o CSS, por
                      // `aria-pressed`. Inline ganharia da classe, e a casa que
                      // está TOCANDO precisa sobrepor a casa que está só acesa.
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* ── a conta, fechando o ciclo com o exportador ──
              É o MESMO `duracaoDoArranjo` que a linha `completa` do Exportador
              usa. Desenhar a forma e ver a duração do arquivo mudar no mesmo
              lugar é o que liga as duas telas. */}
          <p style={{
            margin: `${ESP.xs}px 0 0`, font: `400 10px/1 ${MONO}`, color: t45,
            display: 'flex', gap: ESP.sm, fontVariantNumeric: 'tabular-nums',
          }}>
            <span>
              {grade.arranjo.casas} × {grade.arranjo.porCasa} ={' '}
              <span style={{ color: t70 }}>{total} comp.</span>
            </span>
            <span style={{ color: t100 }}>{mmss(duracaoDoArranjo(grade.arranjo, bpm).segundos, true)}</span>
            <span>em {bpm} bpm</span>
            {/* Os dois gestos da régua, ditos onde a régua está. Atalho que só
                existe no `title` é atalho que ninguém descobre. */}
            <span style={{ marginLeft: 'auto', color: t25 }}>
              nº da casa: clique apaga a coluna · na coluna vazia, remove a casa
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
