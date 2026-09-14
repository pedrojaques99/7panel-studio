/**
 * Coluna da linha do tempo da música aberta. Variável: TAKES NÃO PERDIDOS POR MEDO
 * DE EDITAR. Só existe versão porque sem ela editar dá medo.
 *
 * Ver uma versão NÃO restaura: carrega no editor em modo prévia, com a barra
 * dizendo o que você está vendo e como voltar. Restaurar (classe C) salva versão
 * NOVA — a linha do tempo nunca perde um elo, então restaurar por engano também
 * tem volta. E se houver edição não salva na hora de ver, a tela guarda ela numa
 * versão antes de trocar (`Musica.tsx: guardarSeSujo`).
 *
 * ## Duas coisas mudaram de lugar, e por quê
 *
 * O botão RESTAURAR morava dentro da linha selecionada. Selecionar uma versão
 * empurrava todas as de baixo ~26px — o mesmo "mexer no layout" que a coluna do
 * repertório evita com pista reservada. Agora ele vive no rodapé fixo: uma
 * pista só, altura zero em repouso, e sempre no mesmo pixel, que é o que
 * constrói memória motora.
 *
 * O rodapé antes dizia "ver não muda nada. restaurar salva versão nova." — uma
 * regra que se aprende na primeira vez e cobra px verticais para sempre. O
 * rótulo do próprio botão já diz, e a barra do cabeçalho diz no momento em que
 * importa. Mesma altura, agora carregando ação em vez de explicação.
 */
import { useMemo } from 'react'
import { quando, type SongVersion } from '../lib/songs-api'
import { ACESO, ESP, LINHA, MONO, t100, t25, t45, t70 } from '../fabrica/ui'

type Props = {
  versoes: SongVersion[]
  vendo: number | null
  onVer: (i: number) => void
  onRestaurar: (i: number) => void
}

export function Versoes({ versoes, vendo, onVer, onRestaurar }: Props) {
  // O pai re-renderiza a cada tecla digitada no editor (`code` mora lá), e
  // `[...versoes].reverse()` copiava e invertia o array inteiro a cada uma
  // delas. Numa música de 200 versões isso é lixo por keystroke, no caminho
  // crítico da digitação — e aqui a thread de áudio é sagrada.
  const emOrdem = useMemo(() => [...versoes].reverse(), [versoes])

  if (!versoes.length) {
    return (
      <div style={{ padding: ESP.sm, font: `400 11px/1.5 ${MONO}`, color: t25 }}>
        a primeira vez que você salvar, o take fica aqui, e dá pra voltar nele
      </div>
    )
  }

  const ultima = versoes.length - 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{
        font: `500 10px/1 ${MONO}`, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: t45, padding: `${ESP.sm}px ${ESP.sm}px ${ESP.xs}px`,
      }}>
        versões
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {emOrdem.map(v => {
          const ativa = vendo === v.i
          const atual = v.i === ultima
          return (
            <div
              key={v.i}
              data-versao
              className="versao-linha"
              tabIndex={0}
              onClick={() => onVer(v.i)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onVer(v.i) } }}
              style={{
                padding: `${ESP.xs}px ${ESP.sm}px`,
                borderLeft: `2px solid ${ativa ? ACESO : 'transparent'}`,
                background: ativa ? 'rgba(51,255,102,0.06)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', gap: ESP.xs, alignItems: 'baseline' }}>
                <span style={{ font: `500 11px/1.3 ${MONO}`, color: ativa ? t100 : t70 }}>
                  v{v.i}
                </span>
                <span style={{ font: `400 10px/1.3 ${MONO}`, color: t45 }}>
                  {v.author === 'claude' ? 'claude' : 'você'}
                </span>
                <span style={{ marginLeft: 'auto', font: `400 10px/1.3 ${MONO}`, color: t25 }}>
                  {atual ? 'atual' : quando(v.ts)}
                </span>
              </div>
              {v.message && (
                <div style={{
                  font: `400 10px/1.4 ${MONO}`, color: t45,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={v.message}>
                  {v.message}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Uma pista fixa. O botão só tem o que fazer quando você está vendo uma
          versão que não é a atual; nos outros casos a faixa fica vazia e a
          coluna não muda de altura. */}
      <div style={{
        borderTop: LINHA, padding: `${ESP.xs}px ${ESP.sm}px`, minHeight: 30,
        display: 'flex', alignItems: 'center',
      }}>
        {vendo !== null && vendo !== ultima ? (
          <button
            onClick={() => onRestaurar(vendo)}
            style={{
              background: 'transparent', border: `1px solid ${t25}`,
              color: t100, cursor: 'pointer', font: `400 10px/1 ${MONO}`,
              padding: '4px 7px', letterSpacing: '0.06em', width: '100%', textAlign: 'left',
            }}
          >restaurar v{vendo} como versão nova</button>
        ) : (
          <span style={{ font: `400 9px/1.4 ${MONO}`, color: t25 }}>
            clique numa versão pra ouvir como era
          </span>
        )}
      </div>
    </div>
  )
}
