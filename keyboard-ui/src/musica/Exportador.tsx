/**
 * Botão EXPORTAR do /musica: escolhe a duração e devolve um .wav.
 *
 * O arquivo se chama Exportador e a lógica se chama `exportacao.ts` de propósito:
 * `Exportar.tsx` + `exportar.ts` colidem em disco que não diferencia maiúscula
 * (Windows), e o Vite serve um pelo outro — tela branca com "does not provide an
 * export named". Nomes distintos matam a classe do erro, não só a ocorrência.
 *
 * A tela inteira gira em torno de um fato que não dá pra esconder: gravar é em
 * tempo real. Por isso o custo aparece ANTES do clique — cada duração mostra o
 * tempo que vai levar e quantos compassos vão caber. Ninguém descobre que
 * escolheu 5 minutos de espera depois de já estar esperando.
 *
 * Classe C (ação demorada e que interrompe a escuta): a lista fica fechada por
 * padrão e a gravação é cancelável a qualquer momento. Cancelar não deixa
 * arquivo pela metade — descarta.
 *
 * Cor e ritmo saem de `../fabrica/ui`, como o resto da rota. Nenhum componente
 * novo do design system foi criado aqui.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StrudelService } from '../lib/strudel-service'
import { ACESO, ESP, FUNDO_ALTO, LINHA, MONO, t100, t12, t25, t45, t70 } from '../fabrica/ui'
import type { Corte } from './exportacao'
import { TEMPOS, baixa, corteEmCiclos, duracaoDoArranjo, gravaTake, mmss } from './exportacao'
import { arranjoDoTake, conflitoDeArranjo, detectarCamadas } from './camadas'

type Props = {
  musica: string | null
  code: string
  bpm: number
  svc: StrudelService | null
  /** Índice da versão em prévia, ou null se é o estado atual do editor. */
  vendo: number | null
  /** Última versão salva — entra no nome do arquivo. */
  ultimaVersao: number
  /** Editor com mudança não salva: o arquivo sai marcado como rascunho. */
  sujo: boolean
}

type Fase =
  | { tipo: 'parado' }
  | { tipo: 'gravando'; decorrido: number; total: number }
  | { tipo: 'pronto'; nome: string }
  | { tipo: 'erro'; msg: string }

export function Exportador({ musica, code, bpm, svc, vendo, ultimaVersao, sujo }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const [aberto, setAberto] = useState(false)
  const [fase, setFase] = useState<Fase>({ tipo: 'parado' })
  const abortRef = useRef<AbortController | null>(null)

  const gravando = fase.tipo === 'gravando'

  /**
   * A peça inteira, lida do próprio código.
   *
   * `detectarCamadas` é puro e barato (um scanner de parênteses, sem parser de
   * JS), então o arranjo é derivado aqui em vez de descer como prop. Passar isso
   * pela `Musica.tsx` só criaria um segundo caminho pro mesmo dado — e dois
   * caminhos é como a régua e o arquivo passam a discordar sobre onde a música
   * acaba.
   */
  const peca = useMemo(() => {
    const bases = detectarCamadas(code).map(c => c.base)
    const arranjo = arranjoDoTake(bases)
    if (arranjo) return { corte: duracaoDoArranjo(arranjo, bpm), arranjo, motivo: null }
    return {
      corte: null,
      arranjo: null,
      motivo: conflitoDeArranjo(bases)
        ? 'as camadas discordam da grade'
        : 'sem grade de arranjo no código',
    }
  }, [code, bpm])

  const exportar = useCallback(async (corte: Corte, completa = false) => {
    if (!svc || !code.trim()) return
    setAberto(false)
    setFase({ tipo: 'gravando', decorrido: 0, total: corte.segundos })

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      // Reavaliar do zero: `stop()` zera o relógio do Strudel, então o arquivo
      // começa no ciclo 0 em vez de entrar no meio da volta que estava rodando.
      svc.stop()
      await svc.evaluate(code)

      const stream = svc.getCaptureStream()
      if (!stream) throw new Error('o áudio ainda não subiu. toque a música uma vez antes')

      const { getAudioContext } = await import('superdough')
      const { blob, nome } = await gravaTake({
        stream,
        ctx: getAudioContext(),
        segundos: corte.segundos,
        musica: musica || 'take',
        // Sem isto, exportar o mesmo 3:30 antes e depois de mexer no pad gera
        // dois arquivos com o MESMO nome, e o navegador resolve com "(1)".
        // Qual é qual, ninguém sabe — e o ciclo A/B da rota morre no
        // gerenciador de arquivos.
        versao: vendo !== null ? vendo : ultimaVersao,
        rascunho: sujo && vendo === null,
        completa,
        sinal: ctrl.signal,
        onProgresso: p => setFase({ tipo: 'gravando', decorrido: p.decorrido, total: p.total }),
      })
      baixa(blob, nome)
      setFase({ tipo: 'pronto', nome })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setFase(msg === 'exportação cancelada' ? { tipo: 'parado' } : { tipo: 'erro', msg })
    } finally {
      abortRef.current = null
    }
  }, [svc, code, musica, vendo, ultimaVersao, sujo])

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false) } }
    const fora = (e: PointerEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('keydown', tecla, true)
    document.addEventListener('pointerdown', fora)
    return () => {
      document.removeEventListener('keydown', tecla, true)
      document.removeEventListener('pointerdown', fora)
    }
  }, [aberto])

  if (!musica) return null

  return (
    <div ref={caixaRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: ESP.xs }}>
      {gravando ? (
        <>
          <span style={{ font: `400 10px/1 ${MONO}`, color: t100, fontVariantNumeric: 'tabular-nums' }}>
            gravando {mmss(fase.decorrido)} / {mmss(fase.total)}
          </span>
          {/* A barra é o mesmo dado do número, em forma: de longe se vê que
              falta, de perto se lê quanto. */}
          <span aria-hidden style={{ width: 54, height: 3, background: t12, display: 'block' }}>
            <span style={{
              display: 'block', height: '100%', background: ACESO,
              width: `${Math.min(100, (fase.decorrido / fase.total) * 100)}%`,
            }} />
          </span>
          <button onClick={() => abortRef.current?.abort()} style={botao} title="descarta a gravação">
            cancelar
          </button>
        </>
      ) : (
        <button
          onClick={() => { setAberto(a => !a); if (fase.tipo !== 'parado') setFase({ tipo: 'parado' }) }}
          style={aberto ? { ...botao, borderColor: ACESO, color: t100 } : botao}
          aria-expanded={aberto}
        >
          {vendo !== null ? `exportar v${vendo}` : 'exportar'}
        </button>
      )}

      {fase.tipo === 'pronto' && !aberto && (
        <span style={{ font: `400 10px/1 ${MONO}`, color: t45 }} title="o navegador salvou na sua pasta de downloads">
          {fase.nome}
        </span>
      )}
      {fase.tipo === 'erro' && !aberto && (
        <span style={{ font: `400 10px/1.3 ${MONO}`, color: t100, borderBottom: `1px solid ${t25}` }}>
          {fase.msg}
        </span>
      )}

      {aberto && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 20,
          background: FUNDO_ALTO, border: LINHA, padding: ESP.sm, minWidth: 268,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <div style={{
            font: `500 9px/1 ${MONO}`, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: t45, marginBottom: 4,
          }}>
            duração
          </div>

          {vendo !== null && (
            <p style={{ margin: `0 2px ${ESP.xs}px`, font: `400 10px/1.5 ${MONO}`, color: t100 }}>
              você está vendo a v{vendo}. o arquivo sai com esse take.
            </p>
          )}

          {/* A peça inteira vem primeiro e separada: as outras linhas são um
              alvo que a gente impõe à música (spot, reels), essa é a música
              dizendo o próprio tamanho. Misturar as duas na mesma lista faria
              "completa" parecer só mais um formato. */}
          {peca.corte ? (
            <button
              onClick={() => exportar(peca.corte!, true)}
              className="export-tempo"
              style={linhaTempo}
              title="do compasso 1 ao fim da grade de arranjo, uma volta"
            >
              <span style={{ color: t100, font: `500 13px/1 ${MONO}`, minWidth: 40, textAlign: 'left' }}>
                completa
              </span>
              <span style={{ color: t45, font: `400 10px/1 ${MONO}`, flex: 1, textAlign: 'left' }}>
                arranjo inteiro · {peca.arranjo!.casas} casas
              </span>
              <span style={{
                color: t70, font: `400 10px/1 ${MONO}`, fontVariantNumeric: 'tabular-nums',
                display: 'flex', gap: ESP.xs,
              }}>
                <span>{mmss(peca.corte.segundos, true)}</span>
                <span>{peca.corte.ciclos} comp.</span>
              </span>
            </button>
          ) : (
            /* Desabilitada, não ausente: sumir esconderia o recurso justamente
               de quem ainda não desenhou a grade — que é quem precisa saber que
               ele existe, e o que fazer pra ligá-lo. */
            <div style={{ ...linhaTempo, cursor: 'default' }}>
              <span style={{ color: t45, font: `500 13px/1 ${MONO}`, minWidth: 40, textAlign: 'left' }}>
                completa
              </span>
              <span style={{ color: t45, font: `400 10px/1.4 ${MONO}`, flex: 1, textAlign: 'left' }}>
                {peca.motivo}
              </span>
            </div>
          )}

          <div style={{ borderTop: LINHA, margin: `${ESP.xs}px 2px` }} />

          {TEMPOS.map(t => {
            const corte = corteEmCiclos(t.segundos, bpm)
            return (
              <button
                key={t.rotulo}
                onClick={() => exportar(corte)}
                className="export-tempo"
                style={linhaTempo}
              >
                <span style={{ color: t100, font: `500 13px/1 ${MONO}`, minWidth: 40, textAlign: 'left' }}>
                  {t.rotulo}
                </span>
                <span style={{ color: t45, font: `400 10px/1 ${MONO}`, flex: 1, textAlign: 'left' }}>
                  {t.nota}
                </span>
                {/* O que o arquivo VAI ter: o corte cai no compasso, então quase
                    nunca é o número redondo do rótulo. Dizer aqui evita a
                    surpresa de abrir o wav e achar que deu errado. */}
                <span style={{
                  color: t70, font: `400 10px/1 ${MONO}`, fontVariantNumeric: 'tabular-nums',
                  display: 'flex', gap: ESP.xs,
                }}>
                  <span>{mmss(corte.segundos, true)}</span>
                  <span>{corte.ciclos} comp.</span>
                </span>
              </button>
            )
          })}

          <p style={{
            margin: `${ESP.xs}px 2px 0`, paddingTop: ESP.xs, borderTop: LINHA,
            font: `400 10px/1.5 ${MONO}`, color: t45,
          }}>
            Grava tocando: 3:30 leva 3:30. A música reinicia do compasso 1, o
            arquivo sai em .wav com fade de saída.
          </p>
        </div>
      )}
    </div>
  )
}

const botao: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${t12}`, color: t45, cursor: 'pointer',
  font: `400 11px/1 ${MONO}`, padding: '5px 8px',
}

const linhaTempo: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: ESP.sm,
  background: 'transparent', border: 'none', cursor: 'pointer',
  padding: '7px 6px', textAlign: 'left', width: '100%',
}
