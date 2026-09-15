/**
 * O que dá pra provar sem navegador: o corte cai no compasso, o fade tem a forma
 * certa e o nome do arquivo não vira lixo. A gravação em si (MediaRecorder,
 * decodeAudioData) só existe com áudio de verdade e fica de fora de propósito.
 */
import { describe, it, expect } from 'vitest'
import {
  TEMPOS, aplicaFade, corteEmCiclos, duracaoDoArranjo, duracaoFade, mmss, nomeArquivo,
} from './exportacao'

describe('corte no compasso', () => {
  it('3:30 em 140 bpm cai no ciclo inteiro mais próximo', () => {
    const c = corteEmCiclos(210, 140)
    expect(c.ciclos).toBe(123)                 // ciclo = 4 tempos = 1,714 s
    expect(c.segundos).toBeCloseTo(210.86, 1)  // e o arquivo é ISSO, não 210
  })

  it('sempre fecha em número inteiro de ciclos', () => {
    for (const bpm of [72, 88, 104, 120, 132, 140, 168]) {
      for (const t of TEMPOS) {
        const c = corteEmCiclos(t.segundos, bpm)
        const porCiclo = (60 / bpm) * 4
        expect(c.segundos / porCiclo).toBeCloseTo(c.ciclos, 6)
        expect(Number.isInteger(c.ciclos)).toBe(true)
      }
    }
  })

  it('nunca devolve arquivo vazio, mesmo com alvo menor que um ciclo', () => {
    expect(corteEmCiclos(1, 60).ciclos).toBe(1)   // ciclo de 4 s, alvo de 1 s
    expect(corteEmCiclos(0, 120).ciclos).toBe(1)
  })

  it('bpm fora da faixa do painel não estoura a conta', () => {
    expect(corteEmCiclos(60, 0).segundos).toBeGreaterThan(0)
    expect(corteEmCiclos(60, 9999).segundos).toBeGreaterThan(0)
  })

  it('fica perto do alvo: erro menor que meio ciclo', () => {
    for (const bpm of [67, 121, 173]) {
      const porCiclo = (60 / bpm) * 4
      const c = corteEmCiclos(210, bpm)
      expect(Math.abs(c.segundos - 210)).toBeLessThanOrEqual(porCiclo / 2 + 1e-9)
    }
  })
})

describe('a peça inteira', () => {
  it('é casas x porCasa ciclos, sem arredondar nada', () => {
    // 8 casas de 8 ciclos = 64 ciclos; a 120 bpm o ciclo tem 2 s.
    const c = duracaoDoArranjo({ casas: 8, porCasa: 8 }, 120)
    expect(c.ciclos).toBe(64)
    expect(c.segundos).toBeCloseTo(128, 6)
  })

  it('não arredonda pro compasso: já É compasso inteiro', () => {
    for (const bpm of [67, 121, 173]) {
      const c = duracaoDoArranjo({ casas: 6, porCasa: 4 }, bpm)
      expect(c.ciclos).toBe(24)
      expect(c.segundos).toBeCloseTo(24 * (60 / bpm) * 4, 9)
    }
  })

  it('é diferente de qualquer corte de formato — esse é o motivo dela existir', () => {
    const peca = duracaoDoArranjo({ casas: 8, porCasa: 8 }, 140)   // 64 ciclos
    const single = corteEmCiclos(210, 140)                          // 123 ciclos
    expect(peca.ciclos).not.toBe(single.ciclos)
  })

  it('bpm fora da faixa do painel não estoura a conta', () => {
    expect(duracaoDoArranjo({ casas: 4, porCasa: 8 }, 0).segundos).toBeGreaterThan(0)
    expect(duracaoDoArranjo({ casas: 4, porCasa: 8 }, 9999).segundos).toBeGreaterThan(0)
  })

  it('nunca devolve arquivo vazio', () => {
    expect(duracaoDoArranjo({ casas: 0, porCasa: 0 }, 120).ciclos).toBe(1)
  })
})

describe('rótulo de tempo', () => {
  it('mostra o décimo quando pedido, porque é onde mora a diferença', () => {
    expect(mmss(210.857, true)).toBe('3:30.9')
    expect(mmss(210.857)).toBe('3:31')
    expect(mmss(65)).toBe('1:05')
    expect(mmss(9.4, true)).toBe('0:09.4')
  })
})

describe('nome do arquivo', () => {
  it('diz a duração sem precisar abrir', () => {
    expect(nomeArquivo('entropia', 210.86)).toBe('entropia-3m31s.wav')
    expect(nomeArquivo('primos-5-7-11', 60)).toBe('primos-5-7-11-1m00s.wav')
  })

  it('carrega a versão, senão dois takes colidem no mesmo nome', () => {
    expect(nomeArquivo('entropia', 60, 7)).toBe('entropia-v7-1m00s.wav')
    expect(nomeArquivo('entropia', 60, 0)).toBe('entropia-v0-1m00s.wav')
  })

  it('edição não salva vira "rascunho", que é a marcação que funciona sem cor', () => {
    expect(nomeArquivo('entropia', 60, 7, true)).toBe('entropia-rascunho-1m00s.wav')
  })

  it('a peça inteira se anuncia: 2m08s de corte e 2m08s de peça não são o mesmo wav', () => {
    expect(nomeArquivo('entropia', 128, 7, false, true)).toBe('entropia-v7-completa-2m08s.wav')
    expect(nomeArquivo('entropia', 128, 7, false, false)).toBe('entropia-v7-2m08s.wav')
    expect(nomeArquivo('entropia', 128, 7, true, true)).toBe('entropia-rascunho-completa-2m08s.wav')
  })

  it('sem versão conhecida, não inventa número', () => {
    expect(nomeArquivo('entropia', 60, -1)).toBe('entropia-1m00s.wav')
  })

  it('não deixa nome de música virar caminho ou espaço', () => {
    expect(nomeArquivo('take 01/rascunho', 30)).toBe('take-01-rascunho-0m30s.wav')
    expect(nomeArquivo('', 30)).toBe('take-0m30s.wav')
    expect(nomeArquivo('!!!', 30)).toBe('take-0m30s.wav')
  })
})

describe('fade', () => {
  it('é proporcional, com teto e piso', () => {
    expect(duracaoFade(30)).toBe(1.2)      // 3% seria 0,9 — curto demais
    expect(duracaoFade(120)).toBeCloseTo(3.6, 5)
    expect(duracaoFade(300)).toBe(4)       // 3% seria 9 — comeria a peça
  })

  it('termina em silêncio e começa sem clique', () => {
    const sr = 100
    const c = new Float32Array(400).fill(1)
    aplicaFade([c], sr, 1, 0.1)            // 1 s de saída, 0,1 s de entrada
    expect(c[0]).toBe(0)
    expect(c[399]).toBeCloseTo(0, 6)
    expect(c[200]).toBe(1)                 // o miolo não é tocado
    expect(c[350]).toBeLessThan(c[320])    // e desce monotônico
  })

  it('não estoura quando o fade é maior que o áudio', () => {
    const c = new Float32Array(50).fill(1)
    aplicaFade([c], 100, 10, 5)
    expect([...c].every(v => v >= 0 && v <= 1 && Number.isFinite(v))).toBe(true)
  })

  it('trata os canais igual: estéreo não desalinha', () => {
    const a = new Float32Array(200).fill(1)
    const b = new Float32Array(200).fill(1)
    aplicaFade([a, b], 100, 1)
    expect([...a]).toEqual([...b])
  })
})
