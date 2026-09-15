/**
 * Portão da linha do tempo.
 *
 * Duas coisas são testadas aqui, e uma terceira é deliberadamente NÃO testada.
 *
 * 1. O RECORTE. `detectarCamadas` fatia texto, e texto é onde este tipo de código
 *    mente: vírgula dentro de string, comentário no fim da linha, arrow function
 *    com vírgula dentro. Cada um desses tem caso aqui porque cada um existe nos
 *    takes reais de `patterns/`.
 * 2. O RECORTE AVALIA. Um fatiador que devolve trecho sintaticamente quebrado
 *    passa em todo teste de offset e falha no app. Então os takes REAIS do
 *    repertório são fatiados e cada camada é avaliada com o MESMO escopo do
 *    player (core+mini+tonal, sem transpiler) e consultada por 2 ciclos. Se um
 *    corte cair no lugar errado, quebra aqui.
 * 3. NÃO se testa desenho. jsdom não faz layout nem canvas; um teste de canvas em
 *    jsdom afirma que `fillRect` foi chamado, o que não é a mesma coisa que a
 *    faixa aparecer no lugar certo. Isso se confere com o olho.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { evalScope } from '@strudel/core'
import { miniAllStrings } from '@strudel/mini'
import {
  detectarCamadas,
  reescrever,
  alternarMudo,
  alternarSolo,
  girarFx,
  limparTudo,
  lerFx,
  escreverFx,
  fxVazio,
  xDoCiclo,
  faseDoCiclo,
  MARCA,
  casaDoCiclo,
  arranjoDaCamada,
  arranjoDoTake,
  conflitoDeArranjo,
  PADRAO_ARRANJO,
  alternarCasa,
  casasDaCamada,
  escreverCasas,
  gradeDoTake,
  sincronizarGrade,
  amostraDaCamada,
  trocarAmostra,
  removerCasa,
} from './camadas'

describe('detectarCamadas', () => {
  it('separa os argumentos de primeiro nível do stack', () => {
    const c = detectarCamadas('stack(\n  s("bd*4"),\n  s("hh*8")\n)')
    expect(c.map(x => x.base)).toEqual(['s("bd*4")', 's("hh*8")'])
  })

  it('não se engana com vírgula dentro de string mini', () => {
    const c = detectarCamadas('stack(s("bd*4, hh*8"), s("cp"))')
    expect(c).toHaveLength(2)
    expect(c[0].base).toBe('s("bd*4, hh*8")')
  })

  it('não se engana com vírgula dentro de chamada aninhada nem de arrow', () => {
    const src = 'stack(\n  n("0 3").sometimesBy(0.2, x => x.add(7)).scale("a1:minor"),\n  s("bd")\n)'
    const c = detectarCamadas(src)
    expect(c).toHaveLength(2)
    expect(c[1].base).toBe('s("bd")')
  })

  it('corta o comentário de fim de linha fora da camada', () => {
    // Se `fim` incluísse o comentário, pendurar `.gain(0)` depois dele
    // comentaria o FX — é o bug que este caso existe pra travar.
    const src = 'stack(\n  s("bd*4").n(4),   // KICK - MALADO\n  s("hh*8")\n)'
    const c = detectarCamadas(src)
    expect(c[0].base).toBe('s("bd*4").n(4)')
    expect(src.slice(c[0].inicio, c[0].fim)).toBe('s("bd*4").n(4)')
  })

  it('usa o comentário em caixa alta como rótulo, e a prosa não', () => {
    const alta = detectarCamadas('stack(\n  s("x").n(4), // KICK - MALADO\n  s("y")\n)')
    expect(alta[0].rotulo).toBe('kick')
    const prosa = detectarCamadas('stack(\n  // Kit VHULTO indice via probe\n  s("tr909_bumbo"), s("y")\n)')
    expect(prosa[0].rotulo).not.toContain('kit')
  })

  it('tira o prefixo de banco que todas as camadas repetem', () => {
    const c = detectarCamadas('stack(s("um_banco_longo_kick"), s("um_banco_longo_hats"))')
    expect(c.map(x => x.rotulo)).toEqual(['kick', 'hats'])
  })

  it('take sem stack é uma camada só, e não zero', () => {
    const c = detectarCamadas('// comentário\ns("bd*4").gain(0.9)\n')
    expect(c).toHaveLength(1)
    expect(c[0].base).toBe('s("bd*4").gain(0.9)')
  })

  it('código vazio não vira camada fantasma', () => {
    expect(detectarCamadas('')).toEqual([])
    expect(detectarCamadas('   \n // só comentário \n')).toEqual([])
  })
})

describe('fx: o código é o estado', () => {
  it('escrever e ler de volta dá o mesmo estado', () => {
    const e = girarFx(girarFx(alternarMudo(fxVazio()), 'abafa'), 'eco')
    const texto = 's("bd")' + escreverFx(e)
    expect(lerFx(texto)).toEqual({ base: 's("bd")', fx: e })
  })

  it('estado limpo não deixa marcador nenhum no código', () => {
    expect(escreverFx(fxVazio())).toBe('')
    const src = 'stack(s("bd"), s("hh"))'
    const c = detectarCamadas(src)
    expect(reescrever(src, c, new Map([[0, fxVazio()]]))).toBe(src)
  })

  it('mudo aparece como .gain(0) escrito, não como estado escondido', () => {
    const src = 'stack(\n  s("bd*4"),\n  s("hh*8")\n)'
    const c = detectarCamadas(src)
    const novo = reescrever(src, c, new Map([[0, alternarMudo(c[0].fx)]]))
    expect(novo).toContain(`s("bd*4")${MARCA}.gain(0)`)
    // e relendo o código novo, o botão volta aceso sozinho
    expect(detectarCamadas(novo)[0].fx.mudo).toBe(true)
  })

  it('girar o fx dá a volta e some', () => {
    let e = fxVazio()
    e = girarFx(e, 'corta'); expect(e.niveis.corta).toBe(1)
    e = girarFx(e, 'corta'); expect(e.niveis.corta).toBe(2)
    e = girarFx(e, 'corta'); expect(e.niveis.corta).toBeUndefined()
  })

  it('duas camadas mudando juntas não desalinham os offsets', () => {
    // O bug clássico: reescrever da esquerda pra direita muda o comprimento e
    // corrompe a camada seguinte. Solo é o caso que dispara isso.
    const src = 'stack(\n  s("bd"),\n  s("hh"),\n  s("cp")\n)'
    const c = detectarCamadas(src)
    const novo = reescrever(src, c, alternarSolo(c, 1))
    const lidas = detectarCamadas(novo)
    expect(lidas.map(x => x.base)).toEqual(['s("bd")', 's("hh")', 's("cp")'])
    expect(lidas.map(x => x.fx.mudo)).toEqual([true, false, true])
  })

  it('solo no mesmo lugar duas vezes desfaz', () => {
    const src = 'stack(s("bd"), s("hh"))'
    const c1 = detectarCamadas(src)
    const um = reescrever(src, c1, alternarSolo(c1, 0))
    const c2 = detectarCamadas(um)
    const dois = reescrever(um, c2, alternarSolo(c2, 0))
    expect(detectarCamadas(dois).every(x => !x.fx.mudo)).toBe(true)
  })

  it('limpar tudo devolve o código ao que o autor escreveu', () => {
    const src = 'stack(\n  s("bd"),\n  s("hh")\n)'
    const c1 = detectarCamadas(src)
    const sujo = reescrever(src, c1, new Map([
      [0, alternarMudo(fxVazio())],
      [1, girarFx(fxVazio(), 'eco')],
    ]))
    const c2 = detectarCamadas(sujo)
    expect(reescrever(sujo, c2, limparTudo(c2))).toBe(src)
  })
})

describe('tempo → pixel', () => {
  it('a fase é sempre 0..1, inclusive antes do play (relógio negativo)', () => {
    expect(faseDoCiclo(3.25)).toBeCloseTo(0.25)
    expect(faseDoCiclo(-0.25)).toBeCloseTo(0.75)
    expect(faseDoCiclo(NaN)).toBe(0)
  })

  it('x respeita o gutter e não vaza da largura', () => {
    expect(xDoCiclo(0, 80, 480)).toBe(80)
    expect(xDoCiclo(1, 80, 480)).toBe(480)
    expect(xDoCiclo(2, 80, 480)).toBe(480)
    expect(xDoCiclo(-1, 80, 480)).toBe(80)
  })
})

/* ── o portão que vale por todos: os takes de verdade ────────────── */

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../patterns')
const takes = readdirSync(DIR).filter((f: string) => f.endsWith('.js'))

beforeAll(async () => {
  await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'))
  miniAllStrings()
})

describe('recortar take real e avaliar cada camada', () => {
  it.each(takes)('%s', (arquivo: string) => {
    const src = readFileSync(join(DIR, arquivo), 'utf-8')
    const camadas = detectarCamadas(src)
    expect(camadas.length).toBeGreaterThan(0)

    let comEvento = 0
    for (const c of camadas) {
      // MESMA forma que o componente usa: expressão crua, escopo global do
      // strudel. Se o corte estiver errado, isto estoura com SyntaxError.
      const pat = new Function(`return (${c.base})`)()
      expect(pat, `camada ${c.indice} (${c.rotulo}) não virou padrão`).toBeTruthy()
      // Olha uma janela larga, não os dois primeiros ciclos: camada com
      // `.mask()` pode estar apagada no começo de propósito, e camada com
      // `.slow(19)` só fala uma vez a cada 19. Consultar perto do zero fazia o
      // teste chamar de mudo o que era só arranjo bem feito.
      const haps = pat.queryArc(0, 64)
      expect(Array.isArray(haps)).toBe(true)
      if (haps.length) comEvento++
    }
    // Um take em que NENHUMA camada produz evento é take mudo — o recorte
    // acertou a sintaxe e errou o conteúdo, o que é igualmente inútil.
    expect(comEvento).toBeGreaterThan(0)
  })

  it('reescrever um take real não estraga a sintaxe de nenhuma camada', () => {
    const src = readFileSync(join(DIR, takes[0]), 'utf-8')
    const c = detectarCamadas(src)
    const novo = reescrever(src, c, new Map(c.map(x => [
      x.indice,
      girarFx(alternarMudo(x.fx), 'abafa'),
    ])))
    for (const cam of detectarCamadas(novo)) {
      expect(() => new Function(`return (${cam.base}${escreverFx(cam.fx)})`)()).not.toThrow()
    }
  })
})

/**
 * O arranjo: a ponte entre a linha do tempo (um ciclo) e a grade (64 ciclos).
 *
 * A casa é DERIVADA do relógio, não contada. Estes testes existem porque a
 * versão contada passa em qualquer teste curto e erra na live: só depois de
 * alguns minutos a soma dos erros vira uma casa inteira de diferença.
 */
describe('casaDoCiclo', () => {
  it('cada casa dura porCasa ciclos', () => {
    expect(casaDoCiclo(0, 8, 8)).toBe(0)
    expect(casaDoCiclo(7, 8, 8)).toBe(0)
    expect(casaDoCiclo(8, 8, 8)).toBe(1)
    expect(casaDoCiclo(47, 8, 8)).toBe(5)      // a "casa 6/8" da régua
  })

  it('dá a volta, e a volta é exata mesmo longe do zero', () => {
    expect(casaDoCiclo(64, 8, 8)).toBe(0)
    expect(casaDoCiclo(64 * 100 + 8, 8, 8)).toBe(1)
  })

  it('não explode com relógio antes do play nem com arranjo vazio', () => {
    expect(casaDoCiclo(-3, 8, 8)).toBe(0)
    expect(casaDoCiclo(NaN, 8, 8)).toBe(0)
    expect(casaDoCiclo(10, 0, 8)).toBe(0)
    expect(casaDoCiclo(10, 8, 0)).toBe(0)
  })
})

describe('arranjoDaCamada', () => {
  it('lê casas e ciclos por casa', () => {
    expect(arranjoDaCamada('s("bd").mask("<0 0 0 1 1 1 1 0>/8")')).toEqual({ casas: 8, porCasa: 8 })
    expect(arranjoDaCamada('s("bd").mask("<1 0 1>/4")')).toEqual({ casas: 3, porCasa: 4 })
  })

  it('camada sem máscara não tem arranjo', () => {
    expect(arranjoDaCamada('s("bd").gain(0.5)')).toBeNull()
  })
})

describe('arranjoDoTake', () => {
  it('vale quando as camadas concordam', () => {
    expect(arranjoDoTake([
      's("a").mask("<0 1 1 1 1 0 1 1>/8")',
      's("b").gain(0.3)',                        // sem máscara não atrapalha
      's("c").mask("<0 0 1 1 1 1 1 0>/8")',
    ])).toEqual({ casas: 8, porCasa: 8 })
  })

  it('recusa quando discordam, em vez de adivinhar', () => {
    expect(arranjoDoTake([
      's("a").mask("<0 1 1 1 1 0 1 1>/8")',
      's("b").mask("<1 0 1>/4")',
    ])).toBeNull()
  })

  it('take sem máscara nenhuma não mostra casa', () => {
    expect(arranjoDoTake(['s("a").gain(0.3)', 'note("c3").s("sine")'])).toBeNull()
  })
})

describe('conflitoDeArranjo', () => {
  // Os dois `null` de arranjoDoTake pedem consertos opostos: um é "desenhe a
  // grade", o outro é "acerte a grade que você desenhou". Sem esta separação o
  // exportador só saberia dizer "não dá", que é o pior recado possível.
  it('separa "não tem grade" de "as grades discordam"', () => {
    expect(conflitoDeArranjo(['s("a").gain(0.3)'])).toBe(false)
    expect(conflitoDeArranjo(['s("a").mask("<0 1>/8")', 's("b").gain(0.3)'])).toBe(false)
    expect(conflitoDeArranjo([
      's("a").mask("<0 1 1 1 1 0 1 1>/8")',
      's("b").mask("<1 0 1>/4")',
    ])).toBe(true)
  })

  it('mesmo número de casas com divisor diferente também é conflito', () => {
    expect(conflitoDeArranjo(['s("a").mask("<0 1>/8")', 's("b").mask("<1 0>/4")'])).toBe(true)
  })

  it('concorda com arranjoDoTake: nunca há conflito quando o take tem arranjo', () => {
    const bases = ['s("a").mask("<0 1>/8")', 's("c").mask("<1 1>/8")']
    expect(arranjoDoTake(bases)).not.toBeNull()
    expect(conflitoDeArranjo(bases)).toBe(false)
  })
})

/**
 * O sample da camada. O que este bloco protege é a promessa da rota: o que a
 * tela troca, o arquivo passa a dizer — e SÓ isso. Trocar sample não pode mexer
 * em mais nada da camada, senão a pessoa perde fx escrito à mão sem ver.
 */
describe('amostraDaCamada', () => {
  it('lê banco e índice', () => {
    expect(amostraDaCamada('s("zero_g_ce07_dream_zone").n(27).room(0.7)'))
      .toEqual({ banco: 'zero_g_ce07_dream_zone', n: 27 })
  })

  it('sem .n() o índice é 0 — é o que o superdough usa', () => {
    expect(amostraDaCamada('s("dirt_breaks165").struct("x")'))
      .toEqual({ banco: 'dirt_breaks165', n: 0 })
  })

  it('só conta o .n() colado no s(), não um de dentro de outra função', () => {
    expect(amostraDaCamada('s("banco").gain(0.5).sometimesBy(0.2, x => x.n(9))'))
      .toEqual({ banco: 'banco', n: 0 })
  })

  it('mini-notation com vários bancos não tem "o" índice: recusa', () => {
    expect(amostraDaCamada('s("bd ~ [hh hh]").gain(0.5)')).toBeNull()
  })
})

describe('trocarAmostra', () => {
  // Código numa linha só de propósito: o que está sob teste é o recorte por
  // OFFSET, não a indentação. Quebra de linha aqui só traria escape pro teste.
  const codigo = 'stack(s("banco").n(27).room(0.7).mask("<0 1>/8"), s("outro").n(3))'
  const camada = (i: number) => detectarCamadas(codigo)[i]

  it('troca o índice e não encosta no resto da camada', () => {
    const novo = trocarAmostra(codigo, camada(0), 42)
    expect(novo).toContain('s("banco").n(42).room(0.7).mask("<0 1>/8")')
    expect(novo).toContain('s("outro").n(3)')     // a vizinha fica intacta
  })

  it('camada sem .n() ganha um', () => {
    const c = 'stack(s("banco").struct("x"), s("outro").n(3))'
    expect(trocarAmostra(c, detectarCamadas(c)[0], 5)).toContain('s("banco").n(5).struct("x")')
  })

  it('o resultado continua avaliando', () => {
    const novo = trocarAmostra(codigo, camada(0), 42)
    for (const cam of detectarCamadas(novo)) {
      expect(() => new Function('return (' + cam.base + ')')()).not.toThrow()
    }
  })
})


/* ── o motor do arranjo: ler, escrever, e nunca deixar os dois discordarem ── */

describe('casasDaCamada', () => {
  it('le as casas da mascara', () => {
    expect(casasDaCamada('s("bd").mask("<0 1 1 0>/8")'))
      .toEqual([false, true, true, false])
  })

  it('camada sem mascara devolve null, e null NAO e "tudo desligado"', () => {
    // A diferenca decide o primeiro clique: sem mascara a camada toca em TODAS
    // as casas. Tratar null como [false...] apagaria a camada inteira.
    expect(casasDaCamada('s("bd").gain(0.5)')).toBeNull()
  })
})

describe('escreverCasas', () => {
  it('troca a mascara que ja existe, no lugar dela', () => {
    const fora = escreverCasas('s("bd").mask("<0 1>/8").gain(0.5)', [true, false], 8)
    expect(fora).toBe('s("bd").mask("<1 0>/8").gain(0.5)')
  })

  it('cria a mascara em linha nova, com o recuo da camada', () => {
    const fora = escreverCasas('s("bd")\n    .gain(0.5)', [true, false], 8)
    expect(fora).toBe('s("bd")\n    .gain(0.5)\n    .mask("<1 0>/8")')
  })

  it('nao nasce comentada quando a ultima linha e um comentario', () => {
    // Emendar no fim do texto poria a mascara DENTRO do `//`: o take
    // continuaria tocando igual e o clique nao faria nada, sem erro nenhum.
    const fora = escreverCasas('s("bd").gain(0.5) // a redea', [true, false], 8)
    expect(fora).toContain('\n.mask("<1 0>/8")')
    expect(fora.split('\n').pop()).toBe('.mask("<1 0>/8")')
  })
})

describe('alternarCasa', () => {
  const arranjo = { casas: 4, porCasa: 8 }

  it('alterna a casa no CODIGO, nao num estado de react', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 1 0>/8"),\n  s("hh").mask("<1 1 1 1>/8")\n)'
    const cs = detectarCamadas(cod)
    const fora = alternarCasa(cod, cs[0], 0, arranjo)
    expect(fora).toContain('s("bd").mask("<1 1 1 0>/8")')
    expect(fora).toContain('s("hh").mask("<1 1 1 1>/8")')   // a vizinha nao se mexe
  })

  it('camada sem mascara: o primeiro clique CRIA, herdando o que ja tocava', () => {
    const cod = 'stack(\n  s("bd").gain(0.5),\n  s("hh").mask("<1 1 1 1>/8")\n)'
    const cs = detectarCamadas(cod)
    const fora = alternarCasa(cod, cs[0], 2, arranjo)
    // tocava em tudo; desligar a 3a casa deixa as outras acesas
    expect(fora).toContain('.mask("<1 1 0 1>/8")')
  })

  it('`ligado` explicito e o que faz o arrasto pintar em vez de inverter', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 0 1>/8")\n)'
    const c = detectarCamadas(cod)[0]
    // arrastando pra LIGAR por cima de casas alternadas
    let fora = cod
    for (let k = 0; k < 4; k++) {
      fora = alternarCasa(fora, detectarCamadas(fora)[0], k, arranjo, true)
    }
    expect(fora).toContain('.mask("<1 1 1 1>/8")')
  })

  it('recusa camada com outro numero de casas em vez de esticar', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 1 1 1 1 1 0>/8")\n)'
    const c = detectarCamadas(cod)[0]
    expect(alternarCasa(cod, c, 0, { casas: 4, porCasa: 8 })).toBe(cod)
  })

  it('casa fora da grade nao escreve nada', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 1 0>/8")\n)'
    const c = detectarCamadas(cod)[0]
    expect(alternarCasa(cod, c, 9, arranjo)).toBe(cod)
    expect(alternarCasa(cod, c, -1, arranjo)).toBe(cod)
  })

  it('o bloco de fx sobrevive ao clique', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 1 0>/8")/*fx*/.gain(0).lpf(400)\n)'
    const c = detectarCamadas(cod)[0]
    const fora = alternarCasa(cod, c, 0, arranjo)
    expect(fora).toContain('.mask("<1 1 1 0>/8")')
    expect(fora).toContain('/*fx*/.gain(0).lpf(400)')
  })
})

describe('gradeDoTake', () => {
  it('camada sem mascara aparece acesa em tudo, e marcada como nao-propria', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 1 0>/8"),\n  s("hh").gain(0.2)\n)'
    const g = gradeDoTake(detectarCamadas(cod))
    expect(g.ok).toBe(true)
    if (!g.ok) return
    expect(g.arranjo).toEqual({ casas: 4, porCasa: 8 })
    expect(g.linhas[0]).toMatchObject({ casas: [false, true, true, false], propria: true })
    expect(g.linhas[1]).toMatchObject({ casas: [true, true, true, true], propria: false })
  })

  it('take sem mascara nenhuma cai no padrao do repertorio', () => {
    const g = gradeDoTake(detectarCamadas('stack(\n  s("bd"),\n  s("hh")\n)'))
    expect(g.ok).toBe(true)
    if (!g.ok) return
    expect(g.arranjo).toEqual(PADRAO_ARRANJO)
    expect(g.linhas.every(l => l.casas.length === 8 && l.casas.every(Boolean))).toBe(true)
  })

  it('recusa NOMEANDO quem discorda: senao o conserto vira caca ao tesouro', () => {
    const cod = 'stack(\n  s("bd").mask("<0 1 1 0>/8"),\n  s("hh").mask("<1 0 1>/4")\n)'
    const g = gradeDoTake(detectarCamadas(cod))
    expect(g.ok).toBe(false)
    if (g.ok) return
    expect(g.discordantes.length).toBe(1)
    expect(g.motivo).toContain('discordam')
  })

  it('codigo vazio nao e grade vazia: e recusa com motivo', () => {
    const g = gradeDoTake(detectarCamadas(''))
    expect(g.ok).toBe(false)
  })
})

describe('sincronizarGrade', () => {
  const take = [
    '// ── ARRANJO ── cada casa = 8 ciclos',
    '//              1    2    3    4',
    '//   bumbo      ·    ·    ·    ·   a redea',
    '//   chimbal    ·    ·    ·    ·',
    'stack(',
    '  s("kick").mask("<1 1 0 0>/8"),',
    '  s("hats").mask("<0 1 1 0>/8")',
    ')',
  ].join('\n')

  it('escreve os pontos a partir das mascaras', () => {
    const fora = sincronizarGrade(take, detectarCamadas(take))
    expect(fora).toContain('//   bumbo      ●    ●    ·    ·   a redea')
    expect(fora).toContain('//   chimbal    ·    ●    ●    ·')
  })

  it('preserva rotulo humano, nota e alinhamento — so as casas mudam', () => {
    const fora = sincronizarGrade(take, detectarCamadas(take))
    const antes = take.split('\n')
    const depois = fora.split('\n')
    expect(depois.length).toBe(antes.length)
    depois.forEach((ln, i) => {
      // mesma largura e mesmo texto fora das casas: `bumbo` nao virou `kick`
      expect(ln.length).toBe(antes[i].length)
      expect(ln.replace(/[●·]/g, '.')).toBe(antes[i].replace(/[●·]/g, '.'))
    })
    expect(fora).toContain('a redea')
  })

  it('recusa INTEIRA quando o desenho tem mais linhas que o stack', () => {
    const torto = take.replace('//   chimbal    ·    ·    ·    ·',
      '//   chimbal    ·    ·    ·    ·\n//   sub        ·    ·    ·    ·')
    expect(sincronizarGrade(torto, detectarCamadas(torto))).toBe(torto)
  })

  it('recusa quando a linha tem numero de casas diferente da mascara', () => {
    const torto = take.replace('//   bumbo      ·    ·    ·    ·   a redea',
      '//   bumbo      ·    ·    ·    ·    ·   a redea')
    expect(sincronizarGrade(torto, detectarCamadas(torto))).toBe(torto)
  })

  it('take sem desenho nenhum passa intacto', () => {
    const sem = 'stack(\n  s("kick").mask("<1 1 0 0>/8")\n)'
    expect(sincronizarGrade(sem, detectarCamadas(sem))).toBe(sem)
  })

  it('e idempotente: sincronizar duas vezes da o mesmo arquivo', () => {
    const um = sincronizarGrade(take, detectarCamadas(take))
    const dois = sincronizarGrade(um, detectarCamadas(um))
    expect(dois).toBe(um)
  })
})

/**
 * Remover casa é a operação que MUDA A DURAÇÃO da peça — as outras só mudam o
 * que soa. Por isso o que se prende aqui não é só a máscara: é que o desenho, a
 * régua de números e a máscara saem juntos do mesmo edit. Se um deles ficasse
 * pra trás, `sincronizarGrade` desistiria em silêncio (ela exige contagem
 * igual) e a divergência voltaria sem erro nenhum na tela.
 */
describe('removerCasa', () => {
  const linhas = [
    '// ── ARRANJO ── cada casa = 8 ciclos',
    '//              1    2    3    4',
    '//   bumbo      ●    ·    ●    ·   a rédea',
    '//   chimbal    ·    ●    ●    ·',
    'stack(',
    '  s("kick").mask("<1 0 1 0>/8"),',
    '  s("hats").mask("<0 1 1 0>/8")',
    ')',
  ]
  const TAKE = linhas.join(String.fromCharCode(10))
  const arranjo = { casas: 4, porCasa: 8 }

  it('tira a casa das máscaras e encurta a peça', () => {
    const out = removerCasa(TAKE, detectarCamadas(TAKE), 0, arranjo)
    expect(out).toContain('<0 1 0>/8')
    expect(out).toContain('<1 1 0>/8')
  })

  it('o desenho perde a mesma coluna, e só ela', () => {
    const out = removerCasa(TAKE, detectarCamadas(TAKE), 0, arranjo)
    const desenho = out.split(String.fromCharCode(10)).filter(l => l.includes('bumbo'))[0]
    const marcas = (desenho.match(/[●·]/g) || []).join('')
    expect(marcas).toBe('·●·')          // era ●·●·, saiu a primeira
    expect(desenho).toContain('a rédea') // o comentário do fim sobreviveu
  })

  it('a régua renumera: 1 2 3, nunca 2 3 4', () => {
    const out = removerCasa(TAKE, detectarCamadas(TAKE), 0, arranjo)
    const regua = out.split(String.fromCharCode(10))[1]
    expect((regua.match(/[0-9]/g) || []).join('')).toBe('123')
  })

  it('remover a última casa preserva o alinhamento das outras', () => {
    const out = removerCasa(TAKE, detectarCamadas(TAKE), 3, arranjo)
    expect(out).toContain('<1 0 1>/8')
    const regua = out.split(String.fromCharCode(10))[1]
    expect((regua.match(/[0-9]/g) || []).join('')).toBe('123')
  })

  it('recusa a última casa: arranjo de zero casas não é arranjo', () => {
    const so1 = [
      '//   um   ●',
      'stack(',
      '  s("kick").mask("<1>/8")',
      ')',
    ].join(String.fromCharCode(10))
    expect(removerCasa(so1, detectarCamadas(so1), 0, { casas: 1, porCasa: 8 })).toBe(so1)
  })

  it('o resultado continua avaliando', () => {
    const out = removerCasa(TAKE, detectarCamadas(TAKE), 0, arranjo)
    for (const cam of detectarCamadas(out)) {
      expect(() => new Function('return (' + cam.base + ')')()).not.toThrow()
    }
  })

  it('numa take real do acervo, desenho e máscara continuam de acordo', () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../../patterns')
    const codigo = readFileSync(join(raiz, 'amber-poeira.js'), 'utf8')
    const cs = detectarCamadas(codigo)
    const g = gradeDoTake(cs)
    expect(g.ok).toBe(true)
    if (!g.ok) return

    const out = removerCasa(codigo, cs, 0, g.arranjo)
    expect(out).not.toBe(codigo)

    // A invariante: tantos "1" nas máscaras quantos "●" no desenho, e uma casa
    // a menos que antes em toda camada.
    const g2 = gradeDoTake(detectarCamadas(out))
    expect(g2.ok).toBe(true)
    if (!g2.ok) return
    expect(g2.arranjo.casas).toBe(g.arranjo.casas - 1)

    const uns = g2.linhas.reduce((n, l) => n + l.casas.filter(Boolean).length, 0)
    const preenchidos = (out.match(/●/g) || []).length
    expect(preenchidos).toBe(uns)
  })
})
