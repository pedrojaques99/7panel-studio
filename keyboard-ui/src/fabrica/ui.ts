/**
 * A escala da fábrica. Um tom só, e o resto é peso.
 *
 * Monocromático de verdade: TUDO na tela é o mesmo verde fósforo, variando só em
 * luminosidade. Não existe âmbar, não existe vermelho, não existe cinza neutro.
 * Cor deixou de carregar significado, então significado passa a ser carregado por
 * PESO, PREENCHIMENTO e POSIÇÃO, que é o que sobrevive num print em preto e branco
 * e o que uma pessoa daltônica lê igual.
 *
 * A regra que substitui a cor: o que decide é o mais claro da tela, e só existe UM
 * mais claro por bloco. Se dois elementos disputam o topo da escala, um dos dois não
 * devia estar ali.
 *
 * ## Como dizer "reprovado" sem vermelho
 *
 * Era `cor: RED`. Agora é: o rótulo vira palavra explícita, a barra vira sólida em
 * vez de vazada, e o valor sobe pro topo da escala. Três sinais redundantes, nenhum
 * deles cromático. Um print monocromático continua legível, e é o teste.
 */

/* ── o tom ───────────────────────────────────────────────────────── */

/** O único hue do app. Tudo abaixo é este verde em luminosidades diferentes. */
export const TOM = '#33ff66'

export const FUNDO = '#080b07'
export const FUNDO_ALTO = '#0d120b'

/**
 * Escala de tinta, do que decide ao que quase some.
 *
 * Use SEMPRE de cima pra baixo, e economize o topo: `t100` é para o número que
 * decide, um por bloco. Rótulo nunca passa de `t45`.
 */
export const t100 = '#d9ffe3'
export const t70 = 'rgba(217,255,227,0.70)'
export const t45 = 'rgba(217,255,227,0.45)'
export const t25 = 'rgba(217,255,227,0.25)'
export const t12 = 'rgba(217,255,227,0.12)'
export const t06 = 'rgba(217,255,227,0.06)'

/** Aceso. O único uso de saturação cheia, e só no estado ativo. */
export const ACESO = TOM
export const ACESO_FRACO = 'rgba(51,255,102,0.16)'

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

/* ── tipografia ──────────────────────────────────────────────────── */
//
// O app usa `--fs-*` de 8 a 13 px, densidade de painel flutuante em canvas com zoom.
// A fábrica é página normal e usa escala legível. Desvio consciente, documentado.

export const ROTULO = `500 10px/1 ${MONO}`
export const CORPO = `400 13px/1.5 ${MONO}`
export const VALOR = `500 30px/1 ${MONO}`
export const VALOR_G = `500 46px/1 ${MONO}`

/** Rótulo: sempre maiúsculo, espaçado, no fundo da escala. */
export const rotulo = {
  font: ROTULO,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: t45,
}

/** Número que decide: topo da escala, `tabular-nums`, sem cor de estado. */
export const valor = {
  font: VALOR,
  color: t100,
  fontVariantNumeric: 'tabular-nums' as const,
}

/** Qualificador: a régua que dá sentido ao valor. Colado nele, um degrau abaixo. */
export const qualificador = {
  font: `400 11px/1 ${MONO}`,
  color: t45,
}

/* ── estado sem cor ──────────────────────────────────────────────── */

export type Estado = 'ok' | 'aviso' | 'reprova'

/**
 * Como cada estado aparece, agora que hue não está disponível.
 *
 * `preenche`  barra sólida em vez de vazada. É o sinal mais forte, e o único que
 *             sobrevive a um print minúsculo.
 * `tinta`     onde o valor cai na escala. Reprova sobe ao topo, ok fica no meio:
 *             o que está errado é o que chama.
 * `palavra`   o rótulo dito por extenso. Sem isso, monocromático vira adivinhação.
 */
export const ESTADO: Record<Estado, { tinta: string; preenche: boolean; palavra: string }> = {
  ok: { tinta: t70, preenche: false, palavra: '' },
  aviso: { tinta: t100, preenche: false, palavra: 'atenção' },
  reprova: { tinta: t100, preenche: true, palavra: 'reprovado' },
}

/* ── ritmo ───────────────────────────────────────────────────────── */

/** Uma escala de espaço só, para os blocos não flutuarem em distâncias aleatórias. */
export const ESP = { xs: 6, sm: 10, md: 18, lg: 30, xl: 52 } as const

/** Transição do repo (5 ocorrências nos painéis). Não há SSoT de motion aqui. */
export const TRANSICAO = 'opacity 0.15s'

export const LINHA = `1px solid ${t12}`
