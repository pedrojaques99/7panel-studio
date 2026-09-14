// Esteira SEED → TRIAGEM → ESTICAR → DOMAR.
// Carrega o arquivo de um painel para o próximo. Mesmo molde de note-bus / capture-bus:
// um Set de handlers, subscribe devolve o unsubscribe. Sem lib nova.

export type StretchStage = 'seed' | 'triagem' | 'esticar' | 'domar'

export type StretchReceita = {
  esticar: number
  janela: number
  escuro_hz: number
  escuro_db: number
  teto_hz: number
}

export type StretchMsg = {
  stage: StretchStage
  /** caminho absoluto no disco (backend) */
  path: string
  destino?: 'eno' | 'aphex' | 'mount-shrine'
  receita?: StretchReceita
}

type StretchHandler = (msg: StretchMsg) => void

const subs = new Set<StretchHandler>()

export function publishStretch(msg: StretchMsg): void {
  // Cada assinante é isolado de propósito. Sem o try/catch, um painel que estoura
  // aborta o forEach: os assinantes registrados DEPOIS dele nunca recebem, e a
  // exceção sobe pro onClick que publicou. A esteira não mostra erro — ela só
  // parece travada, que é o defeito mais caro de diagnosticar.
  subs.forEach(fn => {
    try {
      fn(msg)
    } catch (e) {
      console.error('[stretch-bus] assinante estourou em "%s":', msg.stage, e)
    }
  })
}

export function subscribeStretch(fn: StretchHandler): () => void {
  subs.add(fn)
  return () => { subs.delete(fn) }
}
