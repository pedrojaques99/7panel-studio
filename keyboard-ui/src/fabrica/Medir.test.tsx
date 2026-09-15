import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Medir } from './Medir'

/**
 * A regressão que originou este arquivo foi vista na tela, não num teste.
 *
 * Uma gravação de synth saiu com o portão de correlação vermelho (`-0,18`, "some
 * em mono") logo abaixo de um cabeçalho VERDE dizendo "LIBERADO / take limpo".
 *
 * O portão vem do backend como `CORRELACAO` e é desenhado como `MONO`: os testes
 * abaixo procuram o que a TELA mostra, não o que a API manda.
 *
 * `veredito` é o vocabulário técnico da CLI e pesa só pulso e apito; correlação
 * nunca entrou nele. No terminal isso não incomoda, porque as colunas ficam lado a
 * lado e o humano lê as duas. Numa tela vira contradição — e um portão que se
 * contradiz ensina a pessoa a ignorar os dois.
 */

const RECEITA = {
  esticar: 12, janela: 0.5, escuro_hz: 4500, escuro_db: 7,
  teto_hz: 13000, ambiencia: 'Chuva Suave.m4a', nivel_ambiencia: -42,
}

function portao(nome: string, rotulo: string, valor: number, limiar: number,
                status: string, obs = '', unidade = '') {
  return { nome, rotulo, valor, limiar, status, unidade, obs }
}

/** Fonte que passa em tudo que o `veredito` olha e morre no que ele não olha. */
const CORR_REPROVA = {
  arquivo: 'synth-rec-1.webm', path: 'Z:\\x\\synth-rec-1.webm', dur_s: 22,
  pulso: 1.42, pulso_proxy: true,
  apito_hz: 2643, apito_x: 2.61, apito_estab: 0.4,
  cpp: 5.22, centroid_hz: 569, flatness: 0.08, corr: -0.18,
  veredito: 'pronto',
  pode_esticar: false,
  reprovados: ['CORRELACAO'],
  destino: 'mount-shrine', receita: RECEITA,
  portoes: [
    portao('pulso', 'PULSO', 1.42, 3.0, 'ok', 'sem batida que sobreviva'),
    portao('cpp', 'CPP', 5.22, 6.9, 'ok', 'puxa pra mount-shrine'),
    portao('apito', 'APITO', 2.61, 5.0, 'ok', 'nenhum agudo parado', 'x'),
    portao('corr', 'CORRELACAO', -0.18, 0.0, 'reprova', 'some em mono'),
  ],
  af_notch: '', erros: [],
}

const TUDO_OK = {
  ...CORR_REPROVA, corr: 0.7, veredito: 'pronto',
  pode_esticar: true, reprovados: [],
  portoes: [
    ...CORR_REPROVA.portoes.slice(0, 3),
    portao('corr', 'CORRELACAO', 0.7, 0.0, 'ok', 'aguenta mono'),
  ],
}

function mockTriagem(corpo: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => corpo,
  })) as unknown as typeof fetch)
}

beforeEach(() => { vi.restoreAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe('Medir: o cabeçalho concorda com os portões', () => {
  it('portão vermelho NÃO pode ficar debaixo de cabeçalho verde', async () => {
    mockTriagem(CORR_REPROVA)
    render(<Medir path="Z:\\x\\synth-rec-1.webm" onDestino={() => {}} />)

    await waitFor(() => expect(screen.getByText('MONO')).toBeInTheDocument())
    expect(screen.queryByText(/LIBERADO/)).not.toBeInTheDocument()
    expect(screen.getByText(/NÃO GASTE RENDER/)).toBeInTheDocument()
  })

  it('nomeia QUEM reprovou, em vez de mandar procurar', async () => {
    mockTriagem(CORR_REPROVA)
    render(<Medir path="Z:\\x\\synth-rec-1.webm" onDestino={() => {}} />)
    await waitFor(() => expect(screen.getByText(/NÃO GASTE RENDER/)).toBeInTheDocument())
    expect(document.body.textContent).toMatch(/mono/i)
  })

  it('bloqueia o esticar quando um portão reprova, mesmo com veredito "pronto"', async () => {
    const visto: { podeEsticar: boolean }[] = []
    mockTriagem(CORR_REPROVA)
    render(<Medir path="Z:\\x\\a.webm" onDestino={d => { visto.push(d) }} />)
    await waitFor(() => expect(visto).toHaveLength(1))
    expect(visto[0].podeEsticar).toBe(false)
  })

  it('fonte sem reprovação continua verde e liberada', async () => {
    const visto: { podeEsticar: boolean; destino: string }[] = []
    mockTriagem(TUDO_OK)
    render(<Medir path="Z:\\x\\b.webm" onDestino={d => { visto.push(d) }} />)
    await waitFor(() => expect(visto).toHaveLength(1))
    expect(visto[0].podeEsticar).toBe(true)
    expect(visto[0].destino).toBe('mount-shrine')
    expect(screen.getByText(/LIBERADO/)).toBeInTheDocument()
  })

  it('sem fonte, desenha o estado vazio em vez de sumir', () => {
    render(<Medir path={null} onDestino={() => {}} />)
    expect(document.body.textContent?.trim().length).toBeGreaterThan(0)
  })
})

/**
 * Modo etéreo: a mesma medição, sem tela própria.
 *
 * O risco desta simplificação é exatamente um: sumir com a tela e sumir com o
 * portão junto. Estes testes prendem os dois lados — a recusa aparece em
 * português, e as medidas continuam alcançáveis.
 */
describe('modo etéreo', () => {
  it('recusa em português, e não no vocabulário do portão', async () => {
    mockTriagem(CORR_REPROVA)
    render(<Medir path="Z:\x\synth-rec-1.webm" onDestino={() => {}} modo="etereo" />)
    await waitFor(() => expect(screen.getByText(/celular/i)).toBeInTheDocument())
    // a frase termina numa ação, e a ação tem que existir NESTE modo: "baixe o
    // chorus" mandava procurar um controle que o `ajustar` não tem.
    expect(screen.getByText(/grave outro take/i)).toBeInTheDocument()
    expect(screen.getByText(/regravar/i)).toBeInTheDocument()
  })

  it('reprovou: os quatro portões ficam ABERTOS, não atrás de um clique', async () => {
    mockTriagem(CORR_REPROVA)
    const { container } = render(
      <Medir path="Z:\x\synth-rec-1.webm" onDestino={() => {}} modo="etereo" />)
    await waitFor(() => expect(screen.getByText(/celular/i)).toBeInTheDocument())
    const det = container.querySelector('details')
    expect(det).toBeTruthy()
    expect((det as HTMLDetailsElement).open).toBe(true)
    for (const n of ['PULSO', 'CPP', 'APITO', 'MONO']) {
      expect(screen.getByText(n)).toBeInTheDocument()
    }
  })

  it('passou: nenhuma recusa, e as medidas continuam alcançáveis fechadas', async () => {
    mockTriagem(TUDO_OK)
    const { container } = render(
      <Medir path="Z:\x\synth-rec-1.webm" onDestino={() => {}} modo="etereo" />)
    await waitFor(() => expect(container.querySelector('details')).toBeTruthy())
    expect(screen.queryByText(/regravar/i)).not.toBeInTheDocument()
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(false)
    expect(screen.getByText(/medidas do take/i)).toBeInTheDocument()
  })

  it('não desenha o veredito gigante da tela completa', async () => {
    mockTriagem(TUDO_OK)
    render(<Medir path="Z:\x\synth-rec-1.webm" onDestino={() => {}} modo="etereo" />)
    await waitFor(() => expect(screen.getByText(/medidas do take/i)).toBeInTheDocument())
    expect(screen.queryByText('LIBERADO')).not.toBeInTheDocument()
  })
})
