/**
 * O acervo da /final: era5, era6 e o que já saiu daqui. Arrasta pra linha do tempo, ou
 * duplo clique pra virar trilha nova no ponto da agulha. Ouvir antes é um clique no ▶.
 * Teclado: ↓ da busca entra na lista, ↑↓ anda, espaço ouve, Enter usa.
 */
import { useMemo, useRef, useState } from 'react'
import { FileMusic, Music2, Play, Search, Square } from 'lucide-react'
import { resolveUrl } from '../lib/api'
import { estilo } from '../era6/estilo'

export type ItemBiblioteca = { grupo: string; nome: string; caminho: string; tipo: 'audio' | 'midi'; dur_s: number | null; mb: number }
export const MIME_ITEM = 'application/x-final-item'

const mmss = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

export function Biblioteca({ itens, erro, onUsar }: {
  itens: ItemBiblioteca[]; erro: string | null; onUsar: (i: ItemBiblioteca) => void
}) {
  const [busca, setBusca] = useState('')
  const [ouvindo, setOuvindo] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const m = new Map<string, ItemBiblioteca[]>()
    for (const i of itens) {
      if (q && !`${i.grupo} ${i.nome}`.toLowerCase().includes(q)) continue
      m.set(i.grupo, [...(m.get(i.grupo) ?? []), i])
    }
    return [...m]
  }, [itens, busca])

  const ouvir = (i: ItemBiblioteca) => {
    audio.current?.pause()
    if (ouvindo === i.caminho) { setOuvindo(null); return }
    const a = new Audio(resolveUrl(`/api/mix/file?path=${encodeURIComponent(i.caminho)}`))
    a.volume = 0.7
    a.onended = () => setOuvindo(null)
    void a.play()
    audio.current = a
    setOuvindo(i.caminho)
  }

  return (
    <aside aria-label="library" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0, borderRight: '1px solid var(--vintage-border)', background: 'var(--vintage-surface-1)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--vintage-border)' }}>
        <Search size={12} color="var(--vintage-text-muted)" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="search library" aria-label="search library"
          onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); e.currentTarget.closest('aside')?.querySelector<HTMLElement>('.final-item')?.focus() } }}
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--vintage-label)', font: 'inherit', outline: 'none' }} />
      </label>
      <div role="listbox" aria-label="library items" style={{ overflowY: 'auto', minHeight: 0, padding: '4px 0 16px' }}
        onKeyDown={e => {
          // da busca, ↓ entra na lista
          if (e.key === 'ArrowDown' && e.target === e.currentTarget) { e.preventDefault(); e.currentTarget.querySelector<HTMLElement>('.final-item')?.focus() }
        }}>
        {erro && <p style={{ padding: 12, color: 'var(--vintage-meter-red)' }}>{erro}</p>}
        {!erro && !itens.length && <p style={{ padding: 12, color: 'var(--vintage-text-muted)' }}>loading…</p>}
        {grupos.map(([g, lista]) => (
          <section key={g}>
            <h3 style={{ ...estilo.rotulo, margin: 0, padding: '12px 12px 6px', display: 'flex', gap: 10 }}>
              {/* o backend separa o grupo com bolinha (u00b7); na tela a separação é espaço */}
              {g.split(/\s*·\s*/).map(x => <span key={x}>{x}</span>)}
            </h3>
            {lista.map(i => (
              <div key={i.caminho} className="final-item" draggable tabIndex={0} role="option" aria-selected={ouvindo === i.caminho}
                onKeyDown={e => {
                  // teclado: ↑↓ anda, espaço ouve, Enter usa; nada disso chega no atalho global (espaço = play)
                  const lista = [...(e.currentTarget.closest('aside')?.querySelectorAll<HTMLElement>('.final-item') ?? [])]
                  const k = lista.indexOf(e.currentTarget)
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); lista[k + (e.key === 'ArrowDown' ? 1 : -1)]?.focus() }
                  else if (e.key === ' ' && i.tipo === 'audio') { e.preventDefault(); e.stopPropagation(); ouvir(i) }
                  else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onUsar(i) }
                }}
                onDragStart={e => { e.dataTransfer.setData(MIME_ITEM, JSON.stringify(i)); e.dataTransfer.effectAllowed = 'copy' }}
                onDoubleClick={() => onUsar(i)}
                title={i.nome}
                style={{ display: 'grid', gridTemplateColumns: '18px 1fr auto', alignItems: 'center', gap: 6, padding: '5px 12px', cursor: 'grab' }}>
                {i.tipo === 'audio' ? (
                  <button type="button" onClick={() => ouvir(i)} aria-label={ouvindo === i.caminho ? `stop ${i.nome}` : `preview ${i.nome}`} style={estilo.botaoIcone(ouvindo === i.caminho)}>
                    {ouvindo === i.caminho ? <Square size={10} /> : <Play size={10} />}
                  </button>
                ) : <Music2 size={11} color="var(--vintage-accent)" aria-hidden />}
                {/* nome encolhe com reticência; a extensão nunca some (wav e mp3 do mesmo nome) */}
                <span style={{ display: 'flex', minWidth: 0, color: 'var(--vintage-label)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nome}</span>
                  <span style={{ flex: 'none', color: 'var(--vintage-text-dim)' }}>{i.caminho.slice(i.caminho.lastIndexOf('.'))}</span>
                </span>
                <span style={{ color: 'var(--vintage-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{i.tipo === 'midi' ? <FileMusic size={10} /> : mmss(i.dur_s)}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}
