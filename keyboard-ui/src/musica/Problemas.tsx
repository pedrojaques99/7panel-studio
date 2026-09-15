/**
 * A faixa que diz, em português, por que o take está tocando mudo.
 *
 * ## Para quem isto é escrito
 *
 * Para quem NÃO abre o console. Então nenhuma linha daqui usa palavra de dev:
 * não tem "sound not found", não tem "getTrigger", não tem stack. Tem o nome do
 * som, o que fazer, e um botão que faz.
 *
 * ## Por que é faixa, e não toast nem badge
 *
 * O sintoma deste defeito é SILÊNCIO — nada pisca, nada trava, o relógio anda.
 * Toast some antes de a pessoa entender o que leu; badge some na periferia de
 * uma tela que já é cheia. A faixa fica, ocupa altura enquanto o problema
 * existe e some sozinha quando ele acaba: zero px em repouso, que é como o
 * resto desta rota trata erro (ver a faixa de `strudel.error` em `Musica.tsx`).
 *
 * ## Cor não carrega nada aqui
 *
 * O design system é um tom só (ver `fabrica/ui.ts`). Alerta é dito por PALAVRA
 * e por POSIÇÃO — em cima do transporte, onde o olho já está entre corrigir e
 * ouvir —, nunca por vermelho.
 */
import { useEffect, useState } from 'react'
import { diagnostico, type Problema } from '../lib/diagnostico'
import { parecido } from './sons'
import { ACESO, ESP, FUNDO, FUNDO_ALTO, MONO, t100, t25, t45 } from '../fabrica/ui'

export type ProblemasProps = {
  /** Tudo que o motor sabe tocar. `null` = ainda carregando; sem sugestão. */
  sonsConhecidos: Set<string> | null
  /** Troca o nome no código. Sem isto, o botão de conserto não aparece. */
  onTrocarSom?: (de: string, para: string) => void
}

const botao: React.CSSProperties = {
  background: ACESO, border: 'none', borderRadius: 2,
  padding: '3px 8px', cursor: 'pointer', color: FUNDO,
  font: `500 10px ${MONO}`, letterSpacing: '0.06em', whiteSpace: 'nowrap',
}

/**
 * Quantos problemas distintos cabem antes de a faixa virar parede.
 *
 * Três, e o resto vira contagem. Um take quebrado de verdade (banco inteiro
 * fora) acusa DEZENAS de nomes de uma vez, e uma faixa de trinta linhas empurra
 * o editor pra fora da tela — trocando um defeito invisível por um que impede
 * de trabalhar. Três nomes já dizem qual é o padrão.
 */
const TETO = 3

export function Problemas({ sonsConhecidos, onTrocarSom }: ProblemasProps) {
  const [lista, setLista] = useState<Problema[]>([])

  // Uso legítimo de effect: o caderno é sistema externo (o motor escreve nele
  // de fora do React, uma vez por evento que falha).
  useEffect(() => diagnostico().assinar(setLista), [])

  if (!lista.length) return null

  const mostrar = lista.slice(0, TETO)
  const escondidos = lista.length - mostrar.length

  return (
    <div
      role="alert"
      style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2,
        padding: `${ESP.xs}px ${ESP.sm}px`,
        borderTop: `1px solid ${t25}`, background: FUNDO_ALTO,
        font: `400 11px/1.45 ${MONO}`, color: t100,
      }}
    >
      {mostrar.map(p => {
        // A sugestão é calculada aqui, e não guardada no caderno, porque o banco
        // muda DEPOIS do erro: o sample entra, `sonsConhecidos` cresce, e o que
        // não tinha parecido passa a ter. Guardar congelaria a resposta velha.
        const dica = p.tipo === 'som-ausente' && p.som
          ? parecido(p.som, sonsConhecidos ?? [])
          : null
        return (
          <div key={p.chave} style={{ display: 'flex', alignItems: 'center', gap: ESP.xs }}>
            <span>
              {p.texto}
              {p.vezes > 1 && <span style={{ color: t45 }}>{` (${p.vezes}×)`}</span>}
              {p.tipo === 'som-ausente' && (
                <span style={{ color: t45 }}>
                  {dica ? ` · quis dizer ${dica}?` : ' · essa camada toca muda'}
                </span>
              )}
            </span>
            {dica && p.som && onTrocarSom && (
              <button
                style={{ ...botao, marginLeft: 'auto' }}
                onClick={() => {
                  onTrocarSom(p.som!, dica)
                  diagnostico().esquecerSom(p.som!)
                }}
              >trocar no código</button>
            )}
          </div>
        )
      })}
      {escondidos > 0 && (
        <span style={{ color: t45 }}>
          {`e mais ${escondidos} — provavelmente o banco inteiro não entrou`}
        </span>
      )}
    </div>
  )
}
