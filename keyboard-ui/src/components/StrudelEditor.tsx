import { useEffect, useRef, useState } from 'react'
import { StateEffect } from '@codemirror/state'
import { StrudelService } from '../lib/strudel-service'
import { arrastarNumero } from '../musica/arrastar-numero'

/**
 * O que este componente usa de `@strudel/codemirror`, que não publica tipos.
 * Superfície pequena de propósito: tipar o pacote inteiro seria inventar contrato
 * de código alheio.
 */
type CMView = {
  state: {
    doc: { toString(): string; length: number }
    selection: { main: { head: number } }
  }
  dispatch: (tr: unknown) => void
  destroy: () => void
}
type CMAtualizacao = { docChanged: boolean; state: { doc: { toString(): string } } }
type CMModulo = {
  initEditor: (o: {
    root: HTMLElement
    initialCode: string
    onChange: (v: CMAtualizacao) => void
    onEvaluate: () => boolean
    onStop: () => boolean
  }) => CMView
  codemirrorSettings: {
    get: () => Record<string, unknown>
    set: (v: Record<string, unknown>) => void
  }
  updateMiniLocations: (view: CMView, locs: unknown[]) => void
  highlightMiniLocations: (view: CMView, tempo: number, haps: unknown[]) => void
}

type Props = {
  value: string
  onChange: (code: string) => void
  onEvaluate: () => void
  onStop?: () => void
  fontSize?: number
  accent?: string
  placeholder?: string
}

/**
 * Editor Strudel oficial (@strudel/codemirror `initEditor`) — não o StrudelMirror,
 * que traria um segundo REPL e brigaria com o StrudelService.
 * Ganho sobre o textarea: syntax highlight e flash do evento TOCANDO, via
 * StrudelService.attachHighlight().
 */
export function StrudelEditor({
  value, onChange, onEvaluate, onStop,
  fontSize = 13, accent = '#33ff66', placeholder,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<CMView | null>(null)
  const [ready, setReady] = useState(false)
  const [empty, setEmpty] = useState(!value)

  // Callbacks por ref: o editor é montado uma vez só, mas os handlers do painel
  // são recriados a cada render. Sem isso o Ctrl+Enter fica preso no closure velho.
  const cb = useRef({ onChange, onEvaluate, onStop })
  // Em effect, nunca no render: o editor monta uma vez só, mas os handlers do pai
  // são recriados a cada render, e sem isto o Ctrl+Enter ficaria preso no antigo.
  useEffect(() => { cb.current = { onChange, onEvaluate, onStop } })
  const initial = useRef(value)

  // Escrita vinda de FORA (prévia de versão, proposta aceita, cena) dispara o
  // mesmo updateListener que a digitação. Sem esta marca, carregar a v0 avisava o
  // pai "o usuário digitou" e ele saía do modo prévia no mesmo quadro.
  const aplicandoExterno = useRef(false)

  useEffect(() => {
    let disposed = false
    let dispose = () => {}

    ;(async () => {
      const mod = (await import('@strudel/codemirror')) as unknown as CMModulo
      const { initEditor, codemirrorSettings, updateMiniLocations, highlightMiniLocations } = mod
      if (disposed || !rootRef.current) return

      codemirrorSettings.set({
        ...codemirrorSettings.get(),
        fontSize,
        fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
        isPatternHighlightingEnabled: true,
        isFlashEnabled: true,
        isLineNumbersDisplayed: true,
        isBracketClosingEnabled: true,
        isLineWrappingEnabled: true,
        theme: 'strudelTheme',
      })

      const view = initEditor({
        root: rootRef.current,
        initialCode: initial.current,
        onChange: (v: CMAtualizacao) => {
          if (!v.docChanged) return
          const code = v.state.doc.toString()
          setEmpty(!code)
          if (aplicandoExterno.current) return
          cb.current.onChange(code)
        },
        onEvaluate: () => { cb.current.onEvaluate(); return true },
        onStop: () => { cb.current.onStop?.(); return true },
      })
      viewRef.current = view
      setReady(true)

      // `initEditor` não aceita extensões de fora, e forkar o setup do Strudel
      // pra encaixar uma seria assumir a manutenção do editor deles. `appendConfig`
      // é o caminho oficial do CodeMirror pra pendurar extensão num editor já vivo.
      view.dispatch({
        effects: StateEffect.appendConfig.of(arrastarNumero({
          aoReavaliar: () => {
            // Só reavalia se JÁ está tocando. Arrastar um número com o som
            // parado não pode ligar o áudio na cara de quem só queria mexer no
            // patch — o Ctrl+Enter continua sendo o gesto de começar a tocar.
            if (!StrudelService.get().getState().playing) return
            cb.current.onEvaluate()
          },
        })),
      })

      const detach = StrudelService.get().attachHighlight({
        onMiniLocations: locs => { try { updateMiniLocations(view, locs || []) } catch { /* editor já desmontado */ } },
        onFrame: (haps, time) => { try { highlightMiniLocations(view, time, haps) } catch { /* quadro perdido não é erro */ } },
        onClear: () => { try { updateMiniLocations(view, []) } catch { /* editor já desmontado */ } },
      })

      dispose = () => { detach(); view.destroy() }
    })()

    return () => { disposed = true; dispose() }
    // Monta UMA vez. `fontSize` entra na criação e não muda em tempo de execução
    // nesta tela; recriar o editor a cada render perderia cursor e histórico.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync de fora pra dentro: proposta aceita, knob de layer, cena, mutação.
  // Só escreve se o doc realmente divergiu, senão o cursor pula a cada tecla.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur === value) return
    const pos = Math.min(view.state.selection.main.head, value.length)
    aplicandoExterno.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: cur.length, insert: value },
        selection: { anchor: pos },
      })
    } finally {
      aplicandoExterno.current = false
    }
    setEmpty(!value)
  }, [value, ready])

  return (
    <div
      onWheel={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div ref={rootRef} className="strudel-editor-root" style={{ width: '100%', height: '100%' }} />
      {empty && placeholder && (
        <pre style={{
          position: 'absolute', top: 8, left: 44, margin: 0, pointerEvents: 'none',
          fontFamily: '"Fira Code", "JetBrains Mono", monospace', fontSize,
          lineHeight: 1.7, color: accent, opacity: 0.28, whiteSpace: 'pre-wrap',
        }}>{placeholder}</pre>
      )}
    </div>
  )
}
