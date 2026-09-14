/**
 * Seletor de sample: `s("banco").n(27)` sem sair da tela.
 *
 * O 27 é índice alfabético dentro da pasta. Até aqui, escolher outro custava
 * rodar `backend/tools/sample_probe.py` num terminal, ler a ficha, voltar e
 * editar o número na mão — uma ida e volta fora do app pra uma decisão que é
 * pura tentativa e erro. É o gesto mais caro do repertório.
 *
 * Três regras, e as três vêm do que a rota já promete:
 *
 * 1. ESCREVE NO CÓDIGO. Andar na lista reescreve o `.n()` no editor, igual ao
 *    mudo e ao fx. Não existe estado de sample fora do arquivo — se existisse,
 *    a tela poderia mostrar um sample e o `.js` guardar outro.
 * 2. OUVE EM CONTEXTO. Cada passo reavalia o take, então o sample novo entra
 *    tocando junto com o resto. Audição solo mente: sample que soa bonito
 *    sozinho some debaixo de um pad.
 * 3. ESCAPE VOLTA. O índice de origem é guardado na abertura e restaurado no
 *    Escape — passear por 200 samples não pode custar o take.
 *
 * A lista não é rolagem infinita: é uma janela de 9 em volta do atual. Duzentos
 * nomes numa coluna não ajudam a escolher, e a decisão aqui é sempre local
 * ("o vizinho serve melhor?").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACESO, ESP, FUNDO_ALTO, LINHA, MONO, t100, t12, t25, t45, t70 } from '../fabrica/ui'
import { bancos, type Banco } from '../lib/samples-api'

const JANELA = 9

export function Amostras({ banco, n, onEscolher, onFechar }: {
  banco: string
  n: number
  /** Chamado a cada passo — escreve no código e reavalia. */
  onEscolher: (n: number) => void
  onFechar: () => void
}) {
  const [dados, setDados] = useState<Banco | null>(null)
  const [erro, setErro] = useState(false)
  const origem = useRef(n)
  const caixa = useRef<HTMLDivElement | null>(null)

  useEffect(() => { origem.current = n /* só na montagem */ }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let morto = false
    bancos().then(m => {
      if (morto) return
      const b = m.get(banco)
      if (b) setDados(b); else setErro(true)
    })
    return () => { morto = true }
  }, [banco])

  const total = dados?.arquivos.length ?? 0

  const andar = useCallback((d: number) => {
    if (!total) return
    onEscolher(Math.min(total - 1, Math.max(0, n + d)))
  }, [n, total, onEscolher])

  useEffect(() => {
    caixa.current?.focus()
  }, [dados])

  const teclado = useCallback((e: React.KeyboardEvent) => {
    // A ordem de guarda da casa: combo com modificador devolve pro browser,
    // tecla seca age, e nada destrutivo em tecla seca.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); andar(1) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); andar(-1) }
    else if (e.key === 'PageDown') { e.preventDefault(); andar(10) }
    else if (e.key === 'PageUp') { e.preventDefault(); andar(-10) }
    else if (e.key === 'Escape') { e.preventDefault(); onEscolher(origem.current); onFechar() }
    else if (e.key === 'Enter') { e.preventDefault(); onFechar() }
  }, [andar, onEscolher, onFechar])

  const visiveis = useMemo(() => {
    if (!dados) return []
    const meio = Math.floor(JANELA / 2)
    let ini = Math.max(0, n - meio)
    ini = Math.min(ini, Math.max(0, total - JANELA))
    return dados.arquivos.slice(ini, ini + JANELA).map((nome, i) => ({ i: ini + i, nome }))
  }, [dados, n, total])

  return (
    <div
      ref={caixa}
      tabIndex={-1}
      onKeyDown={teclado}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onFechar() }}
      style={{
        position: 'absolute', bottom: '100%', left: ESP.sm, zIndex: 20,
        minWidth: 300, maxWidth: 460, outline: 'none',
        background: FUNDO_ALTO, border: LINHA, borderBottom: 'none',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{
        display: 'flex', gap: ESP.xs, alignItems: 'baseline',
        padding: `4px ${ESP.sm}px`, borderBottom: LINHA,
        font: `500 9px ${MONO}`, color: t70, letterSpacing: '0.06em',
      }}>
        <span style={{ color: t100 }}>{banco}</span>
        {/* Zero não renderiza: sem banco carregado não existe "0 de 0". */}
        {total > 0 && <span style={{ color: t45 }}>{n + 1} de {total}</span>}
      </div>

      {erro ? (
        <div style={{ padding: ESP.sm, font: `400 10px ${MONO}`, color: t45 }}>
          {/* A causa, não "algo deu errado": ou o banco não está no disco, ou é
              oscilador (sine, sawtooth) — que não tem arquivo pra escolher. */}
          "{banco}" não é banco de arquivo — oscilador ou pasta ausente.
        </div>
      ) : !dados ? (
        <div style={{ padding: ESP.sm, font: `400 10px ${MONO}`, color: t45 }}>lendo o banco…</div>
      ) : (
        <div>
          {visiveis.map(({ i, nome }) => (
            <button
              key={i}
              onClick={() => onEscolher(i)}
              style={{
                display: 'flex', gap: ESP.sm, width: '100%', textAlign: 'left',
                background: i === n ? 'rgba(217,255,227,0.07)' : 'none',
                border: 'none', borderLeft: `2px solid ${i === n ? ACESO : 'transparent'}`,
                padding: '3px 8px', cursor: 'pointer',
                font: `${i === n ? 500 : 400} 10px ${MONO}`,
                color: i === n ? t100 : t70,
              }}
            >
              <span style={{ color: t25, minWidth: 24, textAlign: 'right' }}>{i}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{
        padding: `3px ${ESP.sm}px`, borderTop: `1px solid ${t12}`,
        font: `400 8px ${MONO}`, color: t25, letterSpacing: '0.06em',
      }}>
        ↑↓ anda e já toca · enter fica · esc volta pro {origem.current}
      </div>
    </div>
  )
}
