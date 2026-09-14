/**
 * O eixo da linha do tempo: ciclo ↔ pixel, e o nível de detalhe que sai disso.
 *
 * ## Por que este arquivo é puro e separado da tela
 *
 * A `Timeline.tsx` e a `GradeArranjo.tsx` de hoje já são a MESMA vista em dois
 * zooms: a grade é a peça a 64 ciclos, a timeline é a peça a 1 ciclo. O que
 * faltava entre elas não era desenho — era escala. Escala é aritmética, e
 * aritmética que mora dentro de um `useEffect` com canvas não tem como ser
 * verificada; foi assim que a grade e a régua discordaram sobre a casa (ver o
 * cabeçalho de `relogio.ts`). Aqui a conversão existe uma vez, fora do React e
 * fora do canvas, e o teste prende as identidades.
 *
 * ## O contrato
 *
 * A unidade do domínio é CICLO, não segundo — é a unidade em que o relógio do
 * @strudel/core fala (`getTime()` devolve posição em ciclos) e a unidade em que
 * o arranjo é escrito (`.mask("<...>/8")` são 8 CICLOS por casa). Segundo é
 * derivado pro rótulo da régua e para por aí; converter cedo faria a régua
 * mudar de posição ao trocar o bpm, com o arranjo parado no mesmo lugar.
 *
 * ## Por que d3-scale/d3-zoom e não conta na mão
 *
 * A conta de `ciclo → x` é trivial. O que não é trivial, e o que sempre sai
 * errado escrito à mão, é: zoom ancorado no cursor (e não no centro), limite de
 * pan que não deixa empurrar a peça pra fora da tela, composição de transforms
 * sem acumular erro de float, `wheel` com `ctrlKey` do trackpad. `d3-zoom`
 * (17,1 M dl/semana) faz isso e é como o painel Performance do Chrome DevTools
 * e o Grafana desenham timeline zoomável. Ver `PESQUISA-linha-do-tempo.md`.
 */
import { scaleLinear, type ScaleLinear } from 'd3-scale'
import { zoomIdentity, type ZoomTransform } from 'd3-zoom'
import type { Arranjo } from './camadas'

/** Largura do gutter de rótulos. A mesma da `Timeline.tsx`, pra troca não mexer no layout. */
export const GUTTER = 104

/** Sem `.mask()` não há peça de 64 ciclos; mostra-se um punhado e o zoom nasce fechado. */
export const CICLOS_SEM_ARRANJO = 8

/**
 * Quantos ciclos a peça tem.
 *
 * `arranjo` nulo tem dois motivos que aqui dão no mesmo (ninguém escreveu
 * `.mask()`, ou as camadas discordam) — os dois querem dizer "não existe peça
 * de N casas pra desenhar", e a saída é degradar pra uma janela curta em vez de
 * inventar um comprimento. Quem precisa distinguir chama `conflitoDeArranjo`.
 */
export function ciclosDoArranjo(arranjo: Arranjo | null): number {
  if (!arranjo) return CICLOS_SEM_ARRANJO
  const n = arranjo.casas * arranjo.porCasa
  return Number.isFinite(n) && n > 0 ? n : CICLOS_SEM_ARRANJO
}

/**
 * O zoom máximo: `k` em que UM ciclo ocupa a largura útil inteira.
 *
 * Não é número mágico e não é preferência — é a `Timeline.tsx` de hoje. Ela
 * desenha exatamente um ciclo esticado no espaço útil, então o fim do curso do
 * zoom desta tela é a tela que ela substitui. Piso de 1 pra peça de 1 ciclo não
 * gerar `scaleExtent([1, 1])` invertido.
 */
export function zoomMaximo(arranjo: Arranjo | null): number {
  return Math.max(1, ciclosDoArranjo(arranjo))
}

/** A escala base (`k = 1`): a peça inteira cabendo na largura útil. */
export function escalaBase(arranjo: Arranjo | null, largura: number): ScaleLinear<number, number> {
  const util = Math.max(1, largura - GUTTER)
  return scaleLinear().domain([0, ciclosDoArranjo(arranjo)]).range([GUTTER, GUTTER + util])
}

/**
 * A escala depois do zoom. É `transform.rescaleX` — a função do d3 que aplica o
 * transform ao domínio em vez de aplicar ao canvas.
 *
 * A diferença importa e é a razão de não usar `react-zoom-pan-pinch` (que já
 * está no `package.json`): esticar o canvas com `transform: scale()` esticaria
 * a régua, o texto do rótulo e a espessura da linha junto. Rescalando o DOMÍNIO,
 * o desenho é refeito na escala nova e só o EIXO muda — que é o que separa uma
 * timeline de uma lupa.
 */
export function escalaComZoom(
  arranjo: Arranjo | null, largura: number, t: ZoomTransform,
): ScaleLinear<number, number> {
  return t.rescaleX(escalaBase(arranjo, largura))
}

/**
 * Os limites de pan, no formato que o `d3-zoom` pede.
 *
 * Em coordenadas do transform (não da tela): `[[0, -∞], [largura, +∞]]` prende o
 * eixo horizontal nos dois extremos da peça e libera o vertical, que esta tela
 * não usa. Sem isso dá pra empurrar a peça pra fora e ficar olhando pro vazio —
 * o sintoma clássico de timeline escrita à mão.
 */
export function limitesDePan(largura: number): [[number, number], [number, number]] {
  return [[0, -Infinity], [Math.max(1, largura), Infinity]]
}

/** A faixa de ciclos visível agora, já cortada nos limites da peça e em inteiros. */
export function ciclosVisiveis(
  esc: ScaleLinear<number, number>, arranjo: Arranjo | null, largura: number,
): { ini: number; fim: number } {
  const total = ciclosDoArranjo(arranjo)
  const c0 = Math.floor(esc.invert(GUTTER))
  const c1 = Math.ceil(esc.invert(Math.max(GUTTER + 1, largura)))
  return {
    ini: Math.max(0, Math.min(total - 1, c0)),
    // `fim` é exclusivo, e o `+1` no teto é o que garante que o último ciclo da
    // peça seja consultado quando a borda direita cai exatamente nele.
    fim: Math.max(1, Math.min(total, c1 + 1)),
  }
}

/** Quantos pixels vale um ciclo na escala atual. É a medida que decide o detalhe. */
export function pxPorCiclo(esc: ScaleLinear<number, number>): number {
  return Math.abs(esc(1) - esc(0))
}

/**
 * O nível de detalhe.
 *
 * Medido em px POR CICLO e não no `k` cru, senão a tela trocaria de
 * comportamento ao redimensionar a janela — a mesma peça, no mesmo zoom, viraria
 * casas numa janela estreita e eventos numa larga.
 *
 * - `casas`     — só os blocos da `.mask()`. Consulta ZERO: é texto, não padrão.
 *                 É a `GradeArranjo.tsx`.
 * - `densidade` — o bloco da casa mais quantos eventos cada ciclo tem. Uma
 *                 consulta por ciclo visível, mas sem desenhar retângulo por
 *                 evento (a 6–40px, dois eventos caem no mesmo pixel de qualquer
 *                 forma, e desenhar os dois é gastar quadro pra mentir sobre
 *                 resolução).
 * - `eventos`   — cada evento como retângulo. É a `Timeline.tsx`.
 *
 * Os cortes não são arbitrários: abaixo de 6px um ciclo é mais estreito que a
 * borda de um retângulo, e acima de 40px cabem 16 semicolcheias com 2px cada,
 * que é o mínimo em que um evento de bumbo ainda vira forma visível — o mesmo
 * critério de FAIXA=12 que a `Timeline.tsx` já usava.
 */
export type Detalhe = 'casas' | 'densidade' | 'eventos'

export const CORTE_DENSIDADE = 6
export const CORTE_EVENTOS = 40

export function detalheDe(px: number): Detalhe {
  if (px < CORTE_DENSIDADE) return 'casas'
  if (px < CORTE_EVENTOS) return 'densidade'
  return 'eventos'
}

/** `true` quando o nível de detalhe não precisa de padrão avaliado nenhum. */
export function ehSoTexto(d: Detalhe): boolean {
  return d === 'casas'
}

/**
 * O transform que enquadra uma faixa de ciclos — o "0 volta pra peça inteira" e
 * o arrasto do minimapa saem os dois daqui.
 *
 * Construído com `zoomIdentity.scale().translate()` em vez de na mão porque o
 * objeto precisa ser um `ZoomTransform` de verdade: é ele que o `d3-zoom` guarda
 * como estado interno, e um `{k, x, y}` cru faz o próximo gesto do usuário
 * partir do transform ANTERIOR — a tela pula na primeira roda depois do clique.
 */
export function enquadrar(
  arranjo: Arranjo | null, largura: number, ini: number, fim: number,
): ZoomTransform {
  const total = ciclosDoArranjo(arranjo)
  const a = Math.max(0, Math.min(total, ini))
  const b = Math.max(a + 1e-6, Math.min(total, fim))
  const base = escalaBase(arranjo, largura)
  const k = Math.max(1, Math.min(zoomMaximo(arranjo), (base(total) - base(0)) / (base(b) - base(a))))
  // `x` é resolvido no espaço do transform: queremos `k * base(a) + x = GUTTER`.
  return zoomIdentity.translate(GUTTER - k * base(a), 0).scale(k)
}

/** O enquadramento inicial e o do gesto "voltar": a peça inteira. */
export function pecaInteira(): ZoomTransform {
  return zoomIdentity
}

/**
 * Segundos de um ciclo. Um ciclo do Strudel é UM COMPASSO de 4 tempos — não é
 * segundo e não é tempo. Errar isto já custou uma faixa inteira, então a
 * conversão mora aqui e não é refeita em lugar nenhum.
 */
export const TEMPOS_POR_CICLO = 4

export function segundosPorCiclo(bpm: number): number {
  const seguro = Math.max(30, Math.min(300, bpm || 120))
  return (60 / seguro) * TEMPOS_POR_CICLO
}
