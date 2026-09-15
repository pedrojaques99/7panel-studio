import { describe, expect, it } from 'vitest'
import { conferir, parecido, sonsDoCodigo, trocarSom } from './sons'

const KIT = 'vhulto_sampling_the_world_drumkit_kick'

describe('sonsDoCodigo', () => {
  it('pega o banco de um s() simples', () => {
    expect(sonsDoCodigo(`s("${KIT}").n(5)`)).toEqual([KIT])
  })

  it('pega a forma encadeada .s("sawtooth")', () => {
    expect(sonsDoCodigo('note("c3").s("sawtooth")')).toEqual(['sawtooth'])
  })

  it('pega sound() também', () => {
    expect(sonsDoCodigo('sound("bd sd")').sort()).toEqual(['bd', 'sd'])
  })

  it('abre a mini-notation em vários nomes', () => {
    expect(sonsDoCodigo('s("<bd*2 [sd, hh]>")').sort()).toEqual(['bd', 'hh', 'sd'])
  })

  it('descarta o índice depois dos dois-pontos', () => {
    expect(sonsDoCodigo('s("bd:3 bd:7")')).toEqual(['bd'])
  })

  it('descarta silêncio e números', () => {
    expect(sonsDoCodigo('s("bd ~ 3 ~")')).toEqual(['bd'])
  })

  it('normaliza pra minúscula, como o soundMap', () => {
    expect(sonsDoCodigo('s("Dirt_DR55")')).toEqual(['dirt_dr55'])
  })

  it('não confunde o s de outra função', () => {
    expect(sonsDoCodigo('notes("c3 e3")')).toEqual([])
  })

  it('não olha struct nem note', () => {
    expect(sonsDoCodigo(`s("${KIT}").struct("x ~ x").note("c2")`)).toEqual([KIT])
  })

  it('junta um stack inteiro sem repetir', () => {
    const code = `stack(s("bd").n(1), s("bd").n(2), s("hh"))`
    expect(sonsDoCodigo(code).sort()).toEqual(['bd', 'hh'])
  })
})

describe('parecido', () => {
  it('acha o nome longo com duas letras trocadas', () => {
    expect(parecido('vhulto_sampling_the_world_drumkit_kikc', [KIT])).toBe(KIT)
  })

  it('não sugere nada quando ninguém chega perto', () => {
    expect(parecido('piano_de_cauda', ['bd', 'sd', 'hh'])).toBe(null)
  })

  it('desempata pelo prefixo comum', () => {
    // distância 1 dos dois; o take dizia "kick", então é o que começa igual.
    expect(parecido('kic', ['kick', 'tic'])).toBe('kick')
  })

  it('nome curto não vira sugestão de outro nome curto qualquer', () => {
    // teto 2 aceitaria "sd" a partir de "bd"; o prefixo não salva, então o
    // teto proporcional tem que bastar — aqui aceita, e é o comportamento
    // desejado: com 2 letras, "bd"→"sd" É o erro de digitação provável.
    expect(parecido('bd', ['sd'])).toBe('sd')
  })
})

describe('conferir', () => {
  const CONHECIDOS = new Set([KIT, 'sawtooth', 'bd'])

  it('não acusa ninguém enquanto o banco não chegou', () => {
    expect(conferir(`s("qualquer_coisa")`, null)).toEqual([])
    expect(conferir(`s("qualquer_coisa")`, new Set())).toEqual([])
  })

  it('cala a boca quando todos existem', () => {
    expect(conferir(`s("${KIT}").s("bd")`, CONHECIDOS)).toEqual([])
  })

  it('aponta o que falta com a sugestão', () => {
    const fora = conferir(`s("vhulto_sampling_the_world_drumkit_kikc")`, CONHECIDOS)
    expect(fora).toEqual([{ som: 'vhulto_sampling_the_world_drumkit_kikc', sugestao: KIT }])
  })

  it('aponta o que falta sem sugestão quando não há parecido', () => {
    expect(conferir(`s("dirt_dr55")`, CONHECIDOS)).toEqual([{ som: 'dirt_dr55', sugestao: null }])
  })
})

describe('trocarSom', () => {
  it('troca dentro do s() e devolve o resto intacto', () => {
    expect(trocarSom(`s("kikc").n(5).gain(0.7)`, 'kikc', 'kick'))
      .toBe(`s("kick").n(5).gain(0.7)`)
  })

  it('troca só o token, não o pedaço de outro nome', () => {
    expect(trocarSom(`s("bd bdx")`, 'bd', 'kick')).toBe(`s("kick bdx")`)
  })

  it('preserva o índice depois dos dois-pontos', () => {
    expect(trocarSom(`s("bd:3")`, 'bd', 'kick')).toBe(`s("kick:3")`)
  })

  it('não mexe fora de s()/sound()', () => {
    const code = `note("bd").s("hh") // bd aqui é comentário`
    expect(trocarSom(code, 'bd', 'kick')).toBe(code)
  })

  it('troca em todas as camadas do stack', () => {
    expect(trocarSom(`stack(s("kikc").n(1), s("kikc").n(2))`, 'kikc', 'kick'))
      .toBe(`stack(s("kick").n(1), s("kick").n(2))`)
  })
})
