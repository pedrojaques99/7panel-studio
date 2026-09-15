/**
 * O que dá pra provar da grade sem áudio nem layout.
 *
 * Testa-se o CONTRATO: clicar escreve no código, e escreve a máscara E o
 * desenho no mesmo edit. Não se testa a agulha (posição depende de relógio de
 * áudio e de layout, e jsdom não tem nenhum dos dois) nem o arrasto por toque
 * (`elementFromPoint` em jsdom devolve o que o layout diria, e não há layout).
 * Isso se confere com o olho, e está dito aqui pra ninguém achar que está coberto.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GradeArranjo } from './GradeArranjo'

const TAKE = [
  '// ── ARRANJO ── cada casa = 8 ciclos',
  '//              1    2    3    4',
  '//   bumbo      ·    ·    ·    ·   a rédea',
  '//   chimbal    ·    ·    ·    ·',
  'stack(',
  '  s("kick").mask("<1 1 0 0>/8"),',
  '  s("hats").mask("<0 1 1 0>/8")',
  ')',
].join('\n')

function montar(codigo = TAKE) {
  const onAplicar = vi.fn()
  render(<GradeArranjo codigo={codigo} bpm={140} tocando={false} onAplicar={onAplicar} sel={0} onSel={() => {}} />)
  return onAplicar
}

describe('GradeArranjo', () => {
  it('desenha uma casa por coluna e uma linha por camada', () => {
    montar()
    expect(screen.getAllByRole('gridcell')).toHaveLength(8)   // 2 camadas x 4 casas
    expect(screen.getByLabelText('bumbo, casa 1 de 4')).toBeInTheDocument()
  })

  it('a casa diz se está acesa, e diz sem depender de cor', () => {
    montar()
    // kick = <1 1 0 0>
    expect(screen.getByLabelText('bumbo, casa 1 de 4')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('bumbo, casa 3 de 4')).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicar escreve a MÁSCARA e o DESENHO no mesmo edit', async () => {
    const onAplicar = montar()
    await userEvent.click(screen.getByLabelText('bumbo, casa 3 de 4'))

    expect(onAplicar).toHaveBeenCalledTimes(1)
    const saiu = onAplicar.mock.calls[0][0] as string
    expect(saiu).toContain('.mask("<1 1 1 0>/8")')          // o som
    expect(saiu).toContain('//   bumbo      ●    ●    ●    ·   a rédea')  // o desenho
  })

  it('o rótulo humano e a nota sobrevivem ao clique', async () => {
    const onAplicar = montar()
    await userEvent.click(screen.getByLabelText('chimbal, casa 1 de 4'))
    const saiu = onAplicar.mock.calls[0][0] as string
    expect(saiu).toContain('chimbal')      // e não `hats`
    expect(saiu).toContain('a rédea')
  })

  it('espaço no teclado alterna: a grade é matriz, e teclado espera matriz', async () => {
    const onAplicar = montar()
    const casa = screen.getByLabelText('bumbo, casa 1 de 4')
    casa.focus()
    await userEvent.keyboard(' ')
    expect(onAplicar).toHaveBeenCalledTimes(1)
    expect(onAplicar.mock.calls[0][0]).toContain('.mask("<0 1 0 0>/8")')
  })

  it('seta move o foco pela matriz', async () => {
    montar()
    screen.getByLabelText('bumbo, casa 1 de 4').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByLabelText('bumbo, casa 2 de 4')).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByLabelText('chimbal, casa 2 de 4')).toHaveFocus()
  })

  it('não deixa a seta sair da grade', async () => {
    montar()
    screen.getByLabelText('bumbo, casa 1 de 4').focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}')
    expect(screen.getByLabelText('bumbo, casa 1 de 4')).toHaveFocus()
  })

  it('camada sem máscara aparece acesa e MARCADA como sem grade', () => {
    montar(TAKE.replace('  s("hats").mask("<0 1 1 0>/8")', '  s("hats").gain(0.2)'))
    // segue sendo `chimbal`: o nome e do autor, nao do sample. E acesa em tudo,
    // porque camada sem mascara toca sempre — nao porque alguem escolheu isso.
    expect(screen.getByLabelText('chimbal, casa 4 de 4')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('chimbal, casa 1 de 4')).toHaveAttribute('aria-pressed', 'true')
  })

  it('recusa NOMEADA quando as camadas discordam da grade', () => {
    montar(TAKE.replace('s("hats").mask("<0 1 1 0>/8")', 's("hats").mask("<1 0 1>/4")'))
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0)
    expect(screen.getByText(/discordam da grade/)).toBeInTheDocument()
    // nomeia a camada como voce a ve (`chimbal`), nao como o sample se chama
    // (`hats`): uma recusa que fala outro vocabulario nao ajuda a consertar.
    expect(screen.getByText(/chimbal/)).toBeInTheDocument()
  })

  it('mostra a mesma duração que o exportador daria', () => {
    montar()
    // 4 casas x 8 ciclos = 32 ciclos; a 140 bpm o ciclo tem 1,714 s
    expect(screen.getByText('32 comp.')).toBeInTheDocument()
    expect(screen.getByText('0:54.9')).toBeInTheDocument()
  })

  /**
   * A coluna. O pedido foi "desativar a casa 1 de todos": o que precisa ser
   * verdade é que UM clique resolve as N camadas, num edit só — porque o custo
   * real de fazer célula a célula não é o clique, é o desfazer.
   */
  describe('clique no número da casa', () => {
    it('apaga a coluna inteira em uma edição só', async () => {
      const onAplicar = montar()
      // casa 2 está acesa nas duas camadas (<1 1 0 0> e <0 1 1 0>)
      await userEvent.click(screen.getByLabelText(/apagar a casa 2 em todas as 2 camadas/))
      expect(onAplicar).toHaveBeenCalledTimes(1)
      const saida = onAplicar.mock.calls[0][0] as string
      expect(saida).toContain('<1 0 0 0>/8')
      expect(saida).toContain('<0 0 1 0>/8')
    })

    /**
     * A escala do gesto, que é o coração desta régua: o segundo clique numa
     * coluna já vazia REMOVE a casa, em vez de acender de volta.
     *
     * O relato que gerou isto: "ainda tá tocando a coluna mesmo desativada,
     * fica o silêncio tocando". Estava certo — apagada, a coluna continua
     * ocupando os mesmos `porCasa` compassos. Quem apagou a coluna inteira já
     * disse o que queria; o que faltava era deixar terminar a frase.
     */
    it('coluna já vazia: o clique remove a casa e a peça encurta', async () => {
      const apagada = TAKE
        .replace('<1 1 0 0>', '<1 0 0 0>')
        .replace('<0 1 1 0>', '<0 0 1 0>')
      const onAplicar = montar(apagada)
      await userEvent.click(screen.getByLabelText(/remover a casa 2 do arranjo/))
      const saida = onAplicar.mock.calls[0][0] as string
      // 4 casas viram 3, e a coluna que sai é a vazia — as outras não se mexem.
      expect(saida).toContain('<1 0 0>/8')
      expect(saida).toContain('<0 1 0>/8')
    })

    it('a régua diz qual dos dois gestos vai acontecer, antes do clique', () => {
      montar()
      // coluna com casa acesa: apaga
      expect(screen.getByLabelText(/apagar a casa 2 em todas as 2 camadas/)).toBeInTheDocument()
      // coluna vazia (casa 4 está apagada nas duas): remove
      expect(screen.getByLabelText(/remover a casa 4 do arranjo/)).toBeInTheDocument()
    })

    it('o desenho do comentário vai junto, no mesmo edit', async () => {
      const onAplicar = montar()
      await userEvent.click(screen.getByLabelText(/apagar a casa 2 em todas as 2 camadas/))
      const saida = onAplicar.mock.calls[0][0] as string

      // A invariante da tela inteira: quantos "1" existem nas máscaras, tantos
      // "●" existem no desenho. O fixture entra de propósito com o desenho todo
      // apagado e as máscaras acesas — se `sincronizarGrade` não rodasse junto,
      // esta conta ficaria em zero contra dois, que é a divergência original.
      const uns = saida.split('mask("<').slice(1)
        .map(t => t.slice(0, t.indexOf('>')))
        .join(' ')
        .split(' ')
        .filter(d => d === '1').length
      const preenchidos = (saida.match(/●/g) || []).length
      expect(preenchidos).toBe(uns)
      expect(uns).toBe(2)          // uma casa por camada sobrou acesa
    })
  })

  /**
   * Fase 5 do plano: UMA seleção, duas vistas. O que se prende aqui é a metade
   * da grade — o rótulo devolve o índice da camada. A outra metade (a régua da
   * linha do tempo mostrando o mesmo índice) está em `Timeline.test.tsx`, e as
   * duas juntas são o contrato: o número que sai daqui é o que entra lá.
   */
  describe('seleção compartilhada', () => {
    it('clicar no rótulo devolve o índice da camada', async () => {
      const onSel = vi.fn()
      render(<GradeArranjo codigo={TAKE} bpm={140} tocando={false} onAplicar={() => {}} sel={0} onSel={onSel} />)
      await userEvent.click(screen.getAllByTitle(/escolher chimbal/)[0])
      expect(onSel).toHaveBeenCalledWith(1)
    })
  })
})
