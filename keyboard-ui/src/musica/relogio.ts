/**
 * O relógio da rota — uma cópia só.
 *
 * ## O bug que este arquivo existe pra impedir
 *
 * A régua da linha do tempo dizia "casa 2/8" enquanto a grade de arranjo, dois
 * centímetros acima, acendia a casa 1. As duas liam o MESMO `getTime`, e mesmo
 * assim discordavam — porque cada uma tinha a sua conversão:
 *
 *   Timeline      ciclo = Math.floor(getTime())                    ✅
 *   GradeArranjo  ciclo = (getTime() * bpm) / (60 * 4)             ❌
 *
 * A segunda vinha de um comentário que dizia "`getTime` é segundo; o ciclo tem
 * 4 tempos". Não é: `getTime` é registrado pelo repl como `scheduler.now()`, e
 * o `Cyclist` do @strudel/core devolve `lastBegin + segundosDesdeOTick * cps`,
 * que é POSIÇÃO EM CICLOS. A conversão extra multiplicava por `bpm/240` — a 108
 * bpm, 0,45 — então a grade andava a menos da metade da velocidade real.
 *
 * ## Por que virou módulo em vez de um número consertado
 *
 * Consertar a linha 253 deixaria de pé a estrutura que gerou o erro: duas telas
 * com duas conversões próprias do mesmo relógio. É a mesma forma do bug de
 * overlap do DSP — duas cópias do mesmo motor, uma corrigida. Aqui a conversão
 * some das duas e passa a existir uma vez, com o contrato escrito no lugar em
 * que ele mora.
 *
 * ## O contrato
 *
 * `getTime()` devolve CICLO, em ponto flutuante. Não é segundo, não é compasso e
 * não depende de bpm. Quem precisar de segundos multiplica por `240 / bpm`, e
 * quem precisar da casa chama `casaDoCiclo` — nunca faz a conta na mão.
 */
import { casaDoCiclo, type Arranjo } from './camadas'

export type Relogio = { getTime: () => number; getIsStarted: () => boolean }

/**
 * Carrega o relógio do @strudel/core.
 *
 * Estoura enquanto nenhum repl existe (antes do primeiro play), e é por isso que
 * quem chama trata a falha como "parado" em vez de como erro — tela que mostra
 * defeito por ainda não ter tocado nada é tela que mente sobre o próprio estado.
 */
export async function carregarRelogio(): Promise<Relogio> {
  const core = await import('@strudel/core')
  return { getTime: core.getTime, getIsStarted: core.getIsStarted }
}

/**
 * O ciclo agora, em ponto flutuante — ou `null` quando não há som.
 *
 * `null` e `0` são coisas diferentes e a distinção importa: parado é "não há
 * onde estar", e ciclo 0 é "está no começo". Devolver 0 nos dois casos faria a
 * agulha desenhar o começo da peça enquanto nada toca.
 */
export function cicloAgora(r: Relogio | null): number | null {
  if (!r) return null
  try {
    if (!r.getIsStarted()) return null
    const c = r.getTime()
    return Number.isFinite(c) ? Math.max(0, c) : null
  } catch {
    // Sem repl ainda: não é erro, é "não começou".
    return null
  }
}

/**
 * A casa agora — a função que as duas vistas chamam, e a razão de as duas
 * concordarem.
 *
 * Aceita o ciclo em ponto flutuante de propósito. `casaDoCiclo` já faz
 * `Math.floor(ciclo / porCasa)`, e `Math.floor(Math.floor(x) / n)` é igual a
 * `Math.floor(x / n)` pra `x >= 0` e `n` inteiro — então tanto faz uma vista
 * arredondar antes (a Timeline precisa de ciclo inteiro pra consultar eventos) e
 * a outra não (a grade precisa da fração pra mover a agulha). A identidade está
 * presa por teste.
 */
export function casaAgora(ciclo: number | null, arranjo: Arranjo | null): number | null {
  if (ciclo === null || !arranjo) return null
  return casaDoCiclo(ciclo, arranjo.casas, arranjo.porCasa)
}
