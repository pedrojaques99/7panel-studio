/**
 * /fabrica: tocar e ouvir esticado. Um app, não um dashboard.
 *
 * UM PASSO POR VEZ. As três seções já estiveram empilhadas na mesma página, e o
 * resultado era uma parede: a pessoa chegava e via teclado, medidores, sequenciador,
 * portões e forma de onda de uma vez, sem saber onde começar. Agora só o passo
 * corrente existe na tela, e a espinha do topo é a navegação.
 *
 *   1 TOCAR   grava o que você tocou e sobe pro backend
 *   2 MEDIR   mede a fonte antes de gastar render
 *   3 OUVIR   estica com a receita do destino e devolve a onda e o áudio
 *
 * Eram quatro passos anunciados para três seções (ESTICAR e OUVIR dividiam a mesma
 * tela). Espinha que promete um passo sem tela é espinha que mente, então virou três.
 *
 * Sem Strudel e sem LLM: a fonte sai do teclado. O acervo já prova que funciona,
 * `synth-rec-1777939249686` virou a cama6 e saiu daqui, não do gerador.
 *
 * Cor: ver `ui.ts`. Um tom só, e o resto é peso.
 */
import { useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Tocar } from './Tocar'
import { Medir, type Receita } from './Medir'
import { Esticar } from './Esticar'
import {
  FUNDO, ACESO, t100, t70, t45, t25, t12, MONO, ESP, LINHA, TRANSICAO,
} from './ui'

type Destino = 'eno' | 'aphex' | 'mount-shrine'

/**
 * Modo da fábrica.
 *
 * `completo` é a esteira de três passos, com os três destinos na mão.
 *
 * `etereo` faz UM som só — cama clara e flutuante, tipo boot de PS2. Preset
 * travado, receita constante, e por isso **duas telas em vez de três**: MEDIR
 * deixa de ser passo e vira estado do botão de OUVIR. A medição continua rodando
 * igual; ela só perde a tela.
 *
 * Espinha de passos só existe no completo. Navegação precisa de destino
 * alternativo, e aqui a segunda tela só se alcança gravando.
 */
export type ModoFabrica = 'completo' | 'etereo'

const PASSOS = [
  { n: 1, nome: 'TOCAR' },
  { n: 2, nome: 'MEDIR' },
  { n: 3, nome: 'OUVIR' },
] as const

/**
 * A espinha, que é navegação e não decoração.
 *
 * Ela carrega duas informações e nada mais: onde você está, e até onde dá pra
 * voltar. Passo à frente do alcançado não é clicável, porque não existe ainda.
 *
 * Sem cor de estado: corrente é o topo da escala mais o ponto cheio, visitado é um
 * degrau abaixo, e o que ainda não dá pra alcançar quase some. Peso, não hue.
 */
function Espinha({ atual, alcance, ir }: {
  atual: number
  alcance: number
  ir: (i: number) => void
}) {
  return (
    <nav aria-label="passos" style={{ display: 'flex', alignItems: 'center' }}>
      {PASSOS.map((p, i) => {
        const corrente = i === atual
        const alcancavel = i <= alcance
        const tinta = corrente ? t100 : alcancavel ? t70 : t25
        return (
          <div key={p.nome} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <span aria-hidden style={{
                width: 24, height: 1, margin: `0 ${ESP.sm}px`,
                background: i <= alcance ? t25 : t12,
              }} />
            )}
            <button
              type="button"
              onClick={() => alcancavel && ir(i)}
              disabled={!alcancavel}
              aria-current={corrente ? 'step' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: ESP.xs,
                background: 'none', border: 'none', padding: '4px 2px',
                cursor: alcancavel && !corrente ? 'pointer' : 'default',
                color: tinta, font: `500 11px/1 ${MONO}`, letterSpacing: '0.14em',
                transition: TRANSICAO,
              }}>
              <span aria-hidden style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: corrente ? ACESO : alcancavel ? tinta : 'transparent',
                border: `1px solid ${corrente ? ACESO : tinta}`,
              }} />
              {p.nome}
            </button>
          </div>
        )
      })}
    </nav>
  )
}

export function Fabrica({ modo = 'completo' }: { modo?: ModoFabrica } = {}) {
  const etereo = modo === 'etereo'
  const [passo, setPasso] = useState(0)
  const [alcance, setAlcance] = useState(0)
  const [path, setPath] = useState<string | null>(null)
  const [destino, setDestino] = useState<Destino | null>(null)
  const [receita, setReceita] = useState<Receita | null>(null)
  const [podeEsticar, setPodeEsticar] = useState(false)

  useEffect(() => {
    document.title = etereo ? 'Fábrica: etéreo' : 'Fábrica: tocar e ouvir esticado'
  }, [etereo])

  const aoGravar = useCallback((p: string) => {
    // Gravação nova invalida o veredito da anterior. Sem isto a tela levaria o verde
    // da gravação passada para um arquivo que ninguém mediu.
    setPath(p)
    setDestino(null); setReceita(null); setPodeEsticar(false)
    /* No etéreo a gravação vai direto pra tela de ouvir: a medição roda ali, em
       cima do botão, em vez de ocupar um passo só dela. */
    setPasso(etereo ? 2 : 1); setAlcance(etereo ? 2 : 1)
  }, [etereo])

  const aoMedir = useCallback((d: { destino: Destino; receita: Receita; podeEsticar: boolean }) => {
    setDestino(d.destino); setReceita(d.receita); setPodeEsticar(d.podeEsticar)
    // Só avança sozinho quando libera. Fonte reprovada fica na medição, que é onde
    // está a explicação do porquê.
    if (d.podeEsticar) { setPasso(2); setAlcance(2) }
    /* No etéreo não há passo 1 pra onde voltar — a recusa é dita na própria tela
       de ouvir, ao lado do botão que não vai liberar. */
    else setAlcance(etereo ? 2 : 1)
  }, [etereo])

  return (
    <div style={{ minHeight: '100vh', background: FUNDO, color: t70 }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: ESP.lg, flexWrap: 'wrap',
        padding: `${ESP.md}px ${ESP.lg}px`,
        background: FUNDO, borderBottom: LINHA,
      }}>
        <span style={{
          font: `600 11px/1 ${MONO}`, letterSpacing: '0.22em', color: t45,
        }}>{etereo ? <>FÁBRICA <span style={{ color: ACESO }}>ETÉREO</span></> : 'FÁBRICA'}</span>
        {!etereo && <Espinha atual={passo} alcance={alcance} ir={setPasso} />}
        {etereo && passo === 2 && (
          <button
            type="button"
            onClick={() => { setPasso(0); setAlcance(0) }}
            style={{
              background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer',
              color: t45, font: `500 11px/1 ${MONO}`, letterSpacing: '0.14em',
              transition: TRANSICAO,
            }}>GRAVAR OUTRA</button>
        )}
        <a href="/" style={{
          marginLeft: 'auto', font: `400 11px/1 ${MONO}`, color: t25,
          textDecoration: 'none', letterSpacing: '0.06em',
        }}>voltar ao dashboard</a>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: `${ESP.xl}px ${ESP.lg}px 140px` }}>
        {/* Só o passo corrente existe. Montar os três e esconder dois deixaria o
            sintetizador vivo atrás da tela de medição, gastando áudio à toa. */}
        {passo === 0 && (
          <ErrorBoundary><Tocar onGravado={aoGravar} modo={modo} /></ErrorBoundary>
        )}

        {passo === 1 && !etereo && (
          <ErrorBoundary><Medir path={path} onDestino={aoMedir} /></ErrorBoundary>
        )}

        {passo === 2 && (
          <ErrorBoundary>
            {/* `key` no path: gravação nova zera o esticado, o domar e o cronômetro
                de uma vez, que é como o React reseta estado quando a prop muda. */}
            {/* No etéreo os dois moram na mesma tela, e a ORDEM depende do veredito.
                Recusou: a medição vai pra cima, colada no botão que ela travou —
                é a explicação de um botão morto, e explicação atrasada não explica.
                Passou: ela desce pro rodapé e vira gaveta. Um `ver medidas` sozinho
                acima da ação principal é controle sem trabalho a fazer naquela hora,
                e ainda empurra o herói da tela pra baixo. Visto na tela.

                `order` no CSS em vez de duas posições no JSX: trocar de lugar no JSX
                desmontaria o `Medir` e dispararia OUTRA triagem de 5 s no mesmo
                arquivo. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.lg }}>
              {etereo && (
                <div style={{ order: podeEsticar ? 1 : -1 }}>
                  <Medir key={`m-${path ?? 'sem-fonte'}`} path={path} onDestino={aoMedir} modo="etereo" />
                </div>
              )}
              <Esticar
                key={path ?? 'sem-fonte'}
                path={path} destino={destino} receita={receita} habilitado={podeEsticar}
                modo={etereo ? 'enxuto' : 'completo'}
              />
            </div>
          </ErrorBoundary>
        )}
      </main>
    </div>
  )
}
