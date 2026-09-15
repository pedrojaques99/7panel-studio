/**
 * Portão do repertório: todo `.js` de `patterns/` tem que virar um Pattern de
 * verdade e produzir evento.
 *
 * Take quebrado só aparecia tocando — e tocar exige áudio, ou seja, exige um
 * humano no navegador. Aqui o mesmo escopo do painel (core+mini+tonal) avalia o
 * arquivo e consulta 4 ciclos: erro de sintaxe, nome de função que não existe e
 * padrão que virou silêncio caem aqui, de graça, antes de virar live.
 *
 * Usa `evaluate` do @strudel/core, o MESMO que `StrudelService.evaluate` chama,
 * e sem transpiler — igualzinho ao painel. Isso importa: `eval()` cru aceita
 * `const x = ...` no topo do take, e o painel NÃO (sem transpiler o código vira
 * corpo de arrow function, ou seja, uma expressão só). Um portão que avalia
 * diferente do player aprova take que não toca — foi o que aconteceu.
 *
 * Não valida SOM (nenhum áudio roda no vitest) — valida que o padrão existe.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evalScope, evaluate } from '@strudel/core'
import { miniAllStrings } from '@strudel/mini'
import { detectarCamadas, gradeDoTake, linhasDoDesenho } from './camadas'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../patterns')
const takes = readdirSync(DIR).filter((f: string) => f.endsWith('.js'))

beforeAll(async () => {
  await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'))
  miniAllStrings()
})

/**
 * Quantos eventos o take produz ao longo da volta INTEIRA do arranjo.
 *
 * Lê o `/N` e o número de casas da primeira `.mask()` do arquivo (todas as
 * camadas concordam — `gradeDoTake` recusa quando não concordam) e consulta um
 * ciclo no meio de cada casa. Sem máscara nenhuma, cai no comportamento antigo:
 * os quatro primeiros ciclos.
 */
function amostrarArranjo(pat: any, code: string): number {
  const m = /\.mask\(\s*"\s*<([^>]*)>\s*\/\s*(\d+)\s*"/.exec(code)
  if (!m) return pat.queryArc(0, 4).length
  const casas = m[1].trim().split(/\s+/).filter(Boolean).length
  const porCasa = Number(m[2])
  if (!casas || !porCasa) return pat.queryArc(0, 4).length
  let total = 0
  for (let c = 0; c < casas; c++) {
    const meio = c * porCasa + Math.floor(porCasa / 2)
    total += pat.queryArc(meio, meio + 1).length
  }
  return total
}

describe('patterns/', () => {
  it('tem take pra testar', () => {
    expect(takes.length).toBeGreaterThan(0)
  })

  it.each(takes)('%s avalia e toca', async (file: string) => {
    const code = readFileSync(join(DIR, file), 'utf8')
    const { pattern: pat } = await evaluate(code)
    expect(typeof pat?.queryArc, `${file} não virou pattern`).toBe('function')
    // `silence` é take legítimo (cama-eno abre a live no vazio): só exigimos
    // evento de quem não se declarou silêncio.
    //
    // E a pergunta é feita ao ARRANJO INTEIRO, não aos 4 primeiros ciclos.
    // Antes era `queryArc(0, 4)`, e isso confundia duas coisas muito
    // diferentes: "este take é mudo" e "este take começa vazio". Com máscara,
    // começar vazio é uma decisão comum e boa — a peça entra em camadas. O
    // portão reprovava justamente quem tinha arranjo caprichado, e a única
    // forma de passar seria acender a casa 1 de todo mundo, ou seja, o portão
    // estaria ditando a música. Amostra-se o meio de cada casa: 8 consultas de
    // um ciclo, mais barato que varrer 64 e suficiente pra dizer se existe som
    // em algum lugar da volta.
    if (code.trim().split('\n').pop()?.trim() !== 'silence') {
      const eventos = amostrarArranjo(pat, code)
      expect(eventos, `${file} não produziu evento em nenhuma casa do arranjo`).toBeGreaterThan(0)
    }
  })
})

/**
 * Nome de banco errado não é erro: é SILÊNCIO. `s("vulto_...")` avalia, toca e
 * não sai som — o pior tipo de defeito num take, porque parece que o sample é
 * ruim quando na verdade ele nunca foi carregado.
 *
 * Aqui os nomes usados nos takes são conferidos contra o que existe em
 * `backend/assets/samples/`, aplicando a MESMA regra de slug do servidor
 * (`strudel_sample_map`: caminho relativo → não-alfanumérico vira `_`, tudo
 * minúsculo). Se a regra lá mudar, este teste passa a mentir — está anotado nos
 * dois lados.
 */
const EMBUTIDOS = new Set([
  // EmuSP12 (o CDN que strudel-service carrega no boot)
  'bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'misc', 'mt', 'oh', 'perc', 'rd', 'rim', 'sd',
  'piano',
  // osciladores do superdough
  'sine', 'square', 'triangle', 'sawtooth', 'saw', 'pulse', 'supersaw', 'white', 'pink', 'brown',
])

function bancosLocais(): Set<string> {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../../backend/assets/samples')
  const audio = /\.(wav|mp3|ogg|flac|webm|m4a)$/i
  const achados = new Set<string>()
  const anda = (dir: string, rel: string) => {
    const itens = readdirSync(dir, { withFileTypes: true })
    if (itens.some(e => e.isFile() && audio.test(e.name))) {
      achados.add(rel.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase())
    }
    for (const e of itens) if (e.isDirectory()) anda(join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)
  }
  anda(raiz, '')
  return achados
}

describe('bancos de sample', () => {
  const locais = bancosLocais()

  it('o disco tem banco', () => {
    expect(locais.size).toBeGreaterThan(3)
  })

  it.each(takes)('%s só usa banco que existe', (file: string) => {
    const code = readFileSync(join(DIR, file), 'utf8')
    // pega o conteúdo de todo s("...") e quebra em palavras (mini notation:
    // `s("bd ~ [hh hh]")` usa vários bancos numa string só).
    const usados = [...code.matchAll(/\bs\(\s*"([^"]*)"/g)]
      .flatMap((m: RegExpMatchArray) => m[1].split(/[\s[\]<>(),*/|.:!@?~]+/))
      .filter((p: string) => p && !/^\d+$/.test(p))
    for (const nome of new Set(usados)) {
      expect(
        EMBUTIDOS.has(nome) || locais.has(nome),
        `${file}: banco "${nome}" não existe — o take tocaria mudo`,
      ).toBe(true)
    }
  })
})

/**
 * Sinal (`rand`, `irand`, `perlin`, `sine`…) precisa vir DEPOIS do `.struct()`.
 *
 * Medido, não achado: `s(b).n(irand(52)).struct("x*8")` amostra o sinal UMA vez
 * por ciclo e entrega os 8 eventos com o mesmo valor; o mesmo com `.struct()`
 * antes entrega 8 valores diferentes. Escrito na ordem errada, o take avalia,
 * toca e simplesmente não sorteia nada — e no ouvido isso parece "o sample é
 * chato", não "a cadeia está invertida". Aconteceu em entropia e granular-sonho.
 */
const SINAIS = /\b(rand|irand|perlin|sine|cosine|saw|isaw|tri|square|envL)\b/

describe('ordem da cadeia', () => {
  it.each(takes)('%s: sinal depois do struct', (file: string) => {
    const linhas = readFileSync(join(DIR, file), 'utf8')
      .split('\n')
      .map((l: string) => l.replace(/\/\/.*$/, ''))          // comentário não é código
    let inicio = -1
    const problemas: string[] = []
    const fecha = (fim: number) => {
      if (inicio < 0) return
      const trecho = linhas.slice(inicio, fim)
      const iStruct = trecho.findIndex((l: string) => l.includes('.struct('))
      if (iStruct <= 0) return
      trecho.slice(0, iStruct).forEach((l: string, i: number) => {
        if (/\.\w+\(/.test(l) && SINAIS.test(l)) {
          problemas.push(`linha ${inicio + i + 1}: ${l.trim()} — vem antes do .struct()`)
        }
      })
    }
    linhas.forEach((l: string, i: number) => {
      if (/^\s*(s|note|n)\(/.test(l)) { fecha(i); inicio = i }
    })
    fecha(linhas.length)
    expect(problemas, `${file}: sinal amostrado por ciclo, não por evento`).toEqual([])
  })
})

/**
 * Toda take precisa ter FORMA: começo, meio e fim.
 *
 * A crítica que gerou este portão: "a graça de uma música é ir revelando as
 * camadas aos poucos, não começar e terminar com todos tocando sempre". Estava
 * certa — a maioria das takes entrava com sete camadas no ciclo 1 e saía com as
 * mesmas sete no ciclo 200. Isso é loop, não música.
 *
 * Forma, aqui, é qualquer uma destas três (todas já usadas no acervo):
 *   `.mask("<...>/8")`   grade de arranjo: a camada entra e sai em passos
 *   `saw.slow(N)`        rampa: o parâmetro atravessa a peça (desintegracao)
 *   períodos primos      as vozes nunca coincidem (cama-eno, eno-x-afx)
 *
 * Take sem nenhuma delas precisa DIZER que é assim de propósito, com uma linha
 * `// estatico: <razão>`. A regra não é "toda peça tem que ter arranjo" — é
 * "toda peça tem que ter uma decisão sobre isso, escrita".
 */
const EXCECOES = new Set([
  // A primeira take do dono, de antes desta convenção. Não é minha pra reescrever.
  'take-01.js',
])

describe('forma', () => {
  it.each(takes)('%s tem arranjo, rampa ou diz por que não', (file: string) => {
    if (EXCECOES.has(file)) return
    const code = readFileSync(join(DIR, file), 'utf8')
    const camadas = (code.match(/^\s{2}(s|n|note)\(/gm) || []).length
    if (camadas < 3) return                     // peça de 1-2 vozes não tem o que arranjar

    const temForma = /\.mask\(|saw\.slow\(|\.slow\((5|7|9|11|13|17|19|23|29|31)\)/.test(code)
    const declarado = /\/\/\s*est[áa]tico:/i.test(code)
    expect(
      temForma || declarado,
      `${file}: ${camadas} camadas entrando todas no ciclo 1 e saindo juntas. ` +
      'Ou dá uma grade de arranjo (.mask("<...>/8")), ou escreve "// estatico: <razão>".',
    ).toBe(true)
  })
})


/* ── a grade desenhada e a grade que toca ────────────────────────── */
//
// O ARRANJO de uma take existe em dois lugares: o desenho ASCII no comentario e
// a `.mask()` no codigo. Os dois PODEM discordar, e quando discordam ninguem
// percebe — voce le o desenho, decide pelo desenho, e o som e outro.
//
// A `.mask()` e a fonte da verdade dos valores. Este portao existe pra que o
// desenho nunca deixe de ser o retrato dela: linha `n` do desenho e a camada
// `n` do `stack`, com as mesmas casas. Take que desvia reprova o build, e a
// mensagem diz QUAL linha do desenho corresponde a QUAL camada — senao o
// conserto vira caca ao tesouro num arquivo de 60 linhas.

type LinhaDesenhada = { linha: number; rotulo: string; casas: string }

function casasDesenhadas(code: string): LinhaDesenhada[] {
  const linhas = code.split('\n')
  return linhasDoDesenho(code).map((i: number) => {
    const txt = linhas[i]
    const casas = (txt.match(/[●·]/g) ?? []).map(c => (c === '●' ? '1' : '0')).join('')
    const rotulo = txt.replace(/^\s*\/\/\s*/, '').split(/[●·]/)[0].trim()
    return { linha: i + 1, rotulo, casas }
  })
}

/**
 * O mesmo pareamento, em JSON, pra ferramenta consumir.
 *
 * `ordem[i]` = indice (0-based) da linha do desenho que pertence a camada `i`.
 * `null` quando nenhuma linha bate com a mascara daquela camada: ai nao e
 * reordenacao, e divergencia de valor, e isso um script nao decide sozinho.
 */
function planoDePareamento(real: string[], desenho: LinhaDesenhada[]): (number | null)[] {
  const usadas = new Set<number>()
  return real.map(casas => {
    const j = desenho.findIndex((d, k) => d.casas === casas && !usadas.has(k))
    if (j < 0) return null
    usadas.add(j)
    return j
  })
}

/** O conserto, dito em texto: pra cada camada do stack, que linha do desenho e a dela. */
function comoConsertar(desenho: LinhaDesenhada[], real: string[], rotulos: string[]): string {
  const usadas = new Set<number>()
  const passos = real.map((casas, i) => {
    const j = desenho.findIndex((d, k) => d.casas === casas && !usadas.has(k))
    if (j < 0) return `  camada ${i + 1} (${rotulos[i]}) = ${casas}  <- nenhuma linha do desenho bate`
    usadas.add(j)
    const d = desenho[j]
    const ok = j === i ? 'ja esta no lugar' : `hoje esta na posicao ${j + 1} (linha ${d.linha})`
    return `  camada ${i + 1} (${rotulos[i]}) = ${casas}  <- "${d.rotulo}", ${ok}`
  })
  return passos.join('\n')
}

/**
 * Escotilha pra take cuja divergencia NAO e de ordem — e portanto nao se
 * resolve reordenando o desenho.
 *
 * Existe vazia, e isso e o estado saudavel. So entra aqui take em que consertar
 * o desenho mudaria a PECA (a mascara toca uma coisa, o desenho promete outra) e
 * a escolha for do dono do take, nao de quem esta passando. Quando entrar,
 * entra com o nome e o motivo escritos aqui — a pendencia dita por extenso, em
 * vez de um build vermelho que todo mundo aprende a ignorar.
 *
 * Historico: `concreta-nextel.js` esteve aqui. A camada `siren` tocava
 * `.mask("<1 1 1 1 1 1 1 1>/8")` enquanto o desenho dizia `chega por ultimo`, e
 * a cama (`zero_g_dream_zone`) estava no fim do stack e no topo do desenho.
 * Resolvido: a cama foi pro topo do stack (stack e simultaneo, nao muda uma
 * nota) e a sirene passou a obedecer o desenho, que era a intencao declarada.
 */
const DESENHO_PENDENTE = new Set<string>([])

describe('a grade desenhada e a grade que toca', () => {
  it.each(takes)('%s: linha n do desenho == camada n do stack', (file: string) => {
    if (DESENHO_PENDENTE.has(file)) return
    const code = readFileSync(join(DIR, file), 'utf8')
    const desenho = casasDesenhadas(code)
    if (!desenho.length) return          // take sem desenho nao tem o que conferir

    const camadas = detectarCamadas(code)
    expect(
      desenho.length,
      `${file}: o desenho tem ${desenho.length} linhas e o stack tem ${camadas.length} ` +
      'camadas. Uma linha de desenho por camada, na ordem do stack.',
    ).toBe(camadas.length)

    const grade = gradeDoTake(camadas)
    expect(
      grade.ok,
      `${file}: ${grade.ok ? '' : grade.motivo} (${grade.ok ? '' : grade.discordantes.join(', ')}). ` +
      'Todas as camadas com .mask() precisam do mesmo numero de casas e do mesmo /N.',
    ).toBe(true)
    if (!grade.ok) return

    const real = grade.linhas.map(l => l.casas.map(c => (c ? '1' : '0')).join(''))
    const dito = desenho.map(d => d.casas)
    const rotulos = grade.linhas.map(l => l.rotulo)

    if (process.env.ARRANJO_PLANO && dito.join('|') !== real.join('|')) {
      const linhas = desenho.map(d => d.linha)
      console.log('#PLANO#' + JSON.stringify({
        file, ordem: planoDePareamento(real, desenho), linhas,
      }))
    }

    expect(
      dito.join('|'),
      `${file}: o desenho discorda das mascaras.\n` +
      `${comoConsertar(desenho, real, rotulos)}\n` +
      'Reordene as linhas do desenho pra ordem do stack (rotulo e nota viajam junto).',
    ).toBe(real.join('|'))
  })
})
