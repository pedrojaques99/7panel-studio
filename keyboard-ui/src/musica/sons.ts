/**
 * Os sons que o take PEDE, e quais deles o motor não tem.
 *
 * ## Por que conferir o texto, se o runtime já acusa
 *
 * Porque o runtime acusa TARDE e caro: o erro do superdough só existe quando um
 * evento tenta tocar, uma vez por evento, com o take já rodando mudo. Ler o
 * texto antes de avaliar dá o nome errado na hora do Ctrl+Enter — antes de a
 * pessoa ouvir o silêncio e começar a desconfiar do volume.
 *
 * Os dois caminhos convivem de propósito e caem na mesma fila (`diagnostico`):
 * este pega o que está escrito, o outro pega o que aconteceu. Um take que monta
 * o nome em tempo de execução escapa daqui e é pego lá; um take que nunca chega
 * a tocar (porque o banco não entrou) é pego aqui e nunca chegaria lá.
 *
 * ## O que este módulo NÃO faz
 *
 * Não avalia o código. É leitura de texto, sem `new Function`: roda a cada
 * tecla, se preciso, sem risco e sem custo.
 */
import { distance } from 'fastest-levenshtein'

/**
 * `s("...")` e `sound("...")`, incluindo a forma encadeada (`.s("triangle")`).
 *
 * `\bs\(` não casa dentro de `notes(` — a borda de palavra exige um caractere
 * não-palavra antes do `s`, e `e` é palavra. Casa em `s(`, ` s(` e `.s(`, que
 * são as três formas que o repertório usa.
 */
const RE_SOM = /\b(?:s|sound)\(\s*(["'`])([^"'`]*)\1/g

/**
 * O que separa um nome do outro dentro da mini-notation.
 *
 * `<a b>` (alternância), `[a, b]` (empilhado), `a*2` (repetição), `a/2`, `a!3`,
 * `a@2` (peso), `a?` (chance), `~` (silêncio). Tudo isso é gramática, não nome.
 */
const SEPARADORES = /[\s<>[\]{}(),!*/@?|~.]+/

/** Token vira nome? Número puro é índice de mini-notation, não banco. */
function ehNome(tok: string): boolean {
  if (!tok) return false
  if (!/[a-z]/i.test(tok)) return false      // "3", "0.5" — número, não nome
  return /^[a-z0-9_-]+$/i.test(tok)
}

/**
 * Todo nome de som citado no código, em minúsculas e sem repetir.
 *
 * Minúsculas porque `registerSound` do superdough faz `toLowerCase()`: as
 * chaves do banco são minúsculas, e comparar cru faria `s("Dirt_DR55")`
 * aparecer como inexistente sem ser.
 *
 * O `:n` do fim (`bd:3`) é índice de sample, não parte do banco — sai.
 */
export function sonsDoCodigo(codigo: string): string[] {
  const achados = new Set<string>()
  RE_SOM.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_SOM.exec(codigo)) !== null) {
    for (const bruto of m[2].split(SEPARADORES)) {
      const tok = bruto.split(':')[0]
      if (ehNome(tok)) achados.add(tok.toLowerCase())
    }
  }
  return [...achados]
}

/**
 * Teto de distância pra uma sugestão valer a pena.
 *
 * Proporcional ao tamanho porque um erro de digitação escala com o nome:
 * `vhulto_sampling_the_world_drumkit_kick` tem 38 letras e trocar duas nele é o
 * mesmo tipo de escorregão que trocar uma em `bd`. Teto fixo ou não pegaria o
 * nome longo, ou sugeriria `sd` pra quem escreveu `bd` — e sugestão errada é
 * pior que nenhuma: manda corrigir o que estava certo.
 */
function teto(nome: string): number {
  return Math.max(2, Math.floor(nome.length * 0.34))
}

/**
 * O nome existente mais parecido, ou `null` quando nada chega perto.
 *
 * `fastest-levenshtein` (lib validada, ~1kB, sem dependências) faz a conta; o
 * que este módulo põe em cima é o teto e a preferência por prefixo.
 *
 * A preferência por prefixo desempata a favor da causa real: quem erra um nome
 * de banco quase sempre erra o FIM dele (o `_kick` que virou `_kikc`, a pasta
 * que mudou de nome). Entre dois candidatos à mesma distância, o que começa
 * igual é o que a pessoa estava tentando escrever.
 */
export function parecido(nome: string, conhecidos: Iterable<string>): string | null {
  const alvo = nome.toLowerCase()
  const lim = teto(alvo)
  let melhor: string | null = null
  let melhorD = Infinity
  let melhorPre = -1
  for (const c of conhecidos) {
    const d = distance(alvo, c)
    if (d > lim) continue
    const pre = prefixoComum(alvo, c)
    if (d < melhorD || (d === melhorD && pre > melhorPre)) {
      melhor = c; melhorD = d; melhorPre = pre
    }
  }
  return melhor
}

function prefixoComum(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

export type SomFaltando = { som: string; sugestao: string | null }

/**
 * Os sons do código que o motor não conhece.
 *
 * `conhecidos` nulo ou vazio devolve lista VAZIA — "ainda não sei", não
 * "nenhum existe". É a mesma regra de três estados de `camadasSemSom`, e pela
 * mesma razão: enquanto o banco chega pela rede, acusar todo nome do take de
 * inexistente seria a tela inventando um defeito que não existe.
 */
export function conferir(codigo: string, conhecidos: Set<string> | null): SomFaltando[] {
  if (!conhecidos || !conhecidos.size) return []
  const fora: SomFaltando[] = []
  for (const som of sonsDoCodigo(codigo)) {
    if (conhecidos.has(som)) continue
    fora.push({ som, sugestao: parecido(som, conhecidos) })
  }
  return fora
}

/**
 * Troca um nome de som por outro NO CÓDIGO.
 *
 * Só dentro de `s("...")`/`sound("...")`, e só o token inteiro: um `bd` solto
 * numa string de `note()` ou no meio de um comentário fica onde está. Busca-e-
 * -troca global reescreveria o que ninguém pediu — e o contrato desta rota é
 * que o que a tela muda, a pessoa vê aparecer escrito e reconhece.
 */
export function trocarSom(codigo: string, de: string, para: string): string {
  const alvo = de.toLowerCase()
  RE_SOM.lastIndex = 0
  return codigo.replace(RE_SOM, (inteiro, aspa: string, dentro: string) => {
    const novo = dentro.replace(/[^\s<>[\]{}(),!*/@?|~]+/g, tok => {
      const [base, ...resto] = tok.split(':')
      if (base.toLowerCase() !== alvo) return tok
      return [para, ...resto].join(':')
    })
    if (novo === dentro) return inteiro
    return inteiro.slice(0, inteiro.indexOf(aspa) + 1) + novo + aspa
  })
}
