/**
 * Coluna do acervo. Superfície B: a variável é SEGUNDOS ATÉ ACHAR O TAKE CERTO.
 *
 * Por isso a busca é o único controle sempre aberto (é o que se usa toda hora) e
 * renomear/excluir moram atrás do `⋯` — excluir nunca pode ficar a um clique de
 * distância de "abrir". Excluir é classe C: confirma na própria linha, e o backend
 * move pra `.trash/` em vez de apagar.
 *
 * ## O que a linha mostra, e por quê
 *
 * O dado que decide qual take você abre é EM QUE PONTO VOCÊ PAROU NELE. Antes a
 * linha gastava a segunda linha com `v12 · 132bpm`: dois números que crescem em
 * todas as músicas e não separam nenhuma. Agora ela mostra o RECADO da última
 * versão, que é o único campo que devolve contexto sem abrir o arquivo — e ele
 * já vinha do backend sendo jogado fora. O bpm continua existindo, no transporte,
 * no momento em que passa a importar.
 *
 * A marca `claude` só aparece quando a última versão veio do CLI: 'user' é a
 * maioria e não informa nada. Marca que quase toda linha carrega não é marca.
 *
 * ## Fixadas
 *
 * Bloco próprio no topo, ordenado por NOME. Alfabético de propósito: o resto da
 * lista é MRU (o backend devolve por `ts`), e MRU faz o item pular de lugar a
 * cada Ctrl+S. Uma lista que muda de ordem embaixo do dedo nunca vira memória
 * motora. Em cima, `entropia` fica no mesmo pixel a semana inteira.
 *
 * O marcador é um quadrado 5×5 CHEIO vs VAZADO — preenchimento, não cor, porque
 * aqui não existe cor (`fabrica/ui.ts`): tudo é o mesmo verde. E não é estrela:
 * glifo de caractere herda métrica da fonte e desalinha. O gutter fica sempre
 * reservado, favorita ou não, então marcar não mexe no layout.
 *
 * `ACESO` continua exclusivo de "aberta" (a barra esquerda). Fixada usa outro
 * canal, em outro eixo — os dois coexistem na linha sem disputar o topo da escala.
 *
 * ## Hover e foco
 *
 * As regras vivem em `index.css` (`.musica-linha`), não em `style` inline: o
 * `⋯` precisa aparecer em `:hover` E em `:focus-within`, e isso não existe em
 * estilo inline. Antes a classe `musica-acoes` era citada aqui e não tinha regra
 * nenhuma no repo — o botão ficava aceso nas 20 linhas e o comentário do arquivo
 * descrevia um comportamento que não existia.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { quando, type SongSummary } from '../lib/songs-api'
import { ESP, LINHA, MONO, t100, t12, t25, t45, t70 } from '../fabrica/ui'

type Props = {
  itens: SongSummary[]
  aberta: string | null
  onAbrir: (nome: string) => void
  onCriar: (nome: string) => void
  onRenomear: (nome: string, novo: string) => void
  onExcluir: (nome: string) => void
  onFixar: (nome: string, fixada: boolean) => void
  /** Foco programático na busca (atalho `/` da tela). */
  buscaRef?: React.RefObject<HTMLInputElement | null>
}

export function Repertorio({
  itens, aberta, onAbrir, onCriar, onRenomear, onExcluir, onFixar, buscaRef,
}: Props) {
  const [busca, setBusca] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const listaRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? itens.filter(i => i.name.toLowerCase().includes(q)) : itens
  }, [itens, busca])

  /**
   * Dois blocos, um scroller. Fixadas por nome; o resto na ordem que veio (o
   * backend já entrega por mexida mais recente).
   *
   * Buscando, a divisão some: filtrar já destruiu a posição espacial, e um
   * separador ali seria régua sem informação.
   */
  const { fixadas, resto, separa } = useMemo(() => {
    const buscando = busca.trim().length > 0
    const fix = filtrados.filter(i => i.favorito)
      .sort((a, b) => a.name.localeCompare(b.name))
    const out = filtrados.filter(i => !i.favorito)
    if (buscando) return { fixadas: [...fix, ...out], resto: [], separa: false }
    return { fixadas: fix, resto: out, separa: fix.length > 0 && out.length > 0 }
  }, [filtrados, busca])

  const ordem = [...fixadas, ...resto]

  /** ↑↓ andam na lista, Enter abre, F fixa. Só quando o foco está na lista. */
  const navegar = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const alvo = idx + (e.key === 'ArrowDown' ? 1 : -1)
    const els = listaRef.current?.querySelectorAll<HTMLElement>('[data-musica]')
    els?.[Math.max(0, Math.min(alvo, els.length - 1))]?.focus()
  }

  // Escape e clique fora fecham o menu. Antes o único jeito era `onMouseLeave`
  // da linha: no toque o mouse nunca "sai", então o menu ficava aberto pra
  // sempre, por cima das linhas de baixo; no teclado não havia saída nenhuma.
  useEffect(() => {
    if (!menu) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); setConfirmando(null) }
    }
    const fora = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) { setMenu(null); setConfirmando(null) }
    }
    document.addEventListener('keydown', tecla, true)
    document.addEventListener('pointerdown', fora)
    return () => {
      document.removeEventListener('keydown', tecla, true)
      document.removeEventListener('pointerdown', fora)
    }
  }, [menu])

  const linha = (it: SongSummary, idx: number) => {
    const ativa = it.name === aberta
    return (
      <div
        key={it.name}
        data-musica
        data-ativa={ativa || undefined}
        className="musica-linha"
        tabIndex={0}
        onKeyDown={e => {
          navegar(e, idx)
          if (renomeando) return
          if (e.key === 'Enter') { e.preventDefault(); onAbrir(it.name) }
          // `f` seco: a tela devolve tudo que tem modificador, e digitar numa
          // busca não passa por aqui (o input tem handler próprio).
          if (e.key === 'f' || e.key === 'F') { e.preventDefault(); onFixar(it.name, !it.favorito) }
        }}
        onClick={() => !renomeando && onAbrir(it.name)}
      >
        {renomeando === it.name ? (
          <input
            autoFocus
            defaultValue={it.name}
            onClick={e => e.stopPropagation()}
            onBlur={() => setRenomeando(null)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim()
                if (v && v !== it.name) onRenomear(it.name, v)
                setRenomeando(null)
              }
              if (e.key === 'Escape') setRenomeando(null)
            }}
            style={{
              background: 'transparent', border: `1px solid ${t25}`, color: t100,
              font: `400 12px/1.2 ${MONO}`, width: '100%', padding: '2px 4px', outline: 'none',
            }}
          />
        ) : (
          <>
            {/* padding à direita reserva o espaço do ⋯: hover nunca mexe no layout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 26 }}>
              <button
                className="musica-fixar"
                aria-pressed={it.favorito}
                aria-label={`${it.favorito ? 'soltar' : 'fixar'} ${it.name}`}
                title={it.favorito ? 'soltar (F)' : 'fixar no topo (F)'}
                onClick={e => { e.stopPropagation(); onFixar(it.name, !it.favorito) }}
              >
                <span className="musica-marca" data-cheia={it.favorito || undefined} />
              </button>
              <div className="musica-nome" style={{
                font: `400 12px/1.3 ${MONO}`, color: ativa ? t100 : t70,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {it.name}
              </div>
            </div>
            <div
              title={it.message || undefined}
              style={{
                font: `400 10px/1.4 ${MONO}`, color: t45, display: 'flex', gap: ESP.xs,
                paddingLeft: 17, paddingRight: 26,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {it.author === 'claude' && (
                <span style={{ color: t100, font: `400 9px/1.5 ${MONO}` }}>claude</span>
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.message || '—'}
              </span>
              <span style={{ marginLeft: 'auto', color: t25, flexShrink: 0 }}>{quando(it.ts)}</span>
            </div>
          </>
        )}

        <button
          aria-label={`ações de ${it.name}`}
          aria-haspopup="menu"
          aria-expanded={menu === it.name}
          onClick={e => { e.stopPropagation(); setMenu(menu === it.name ? null : it.name); setConfirmando(null) }}
          className="musica-acoes"
        >⋯</button>

        {menu === it.name && (
          <div
            ref={menuRef}
            role="menu"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            style={{
              position: 'absolute', right: 2, top: 24, zIndex: 5,
              background: '#0d120b', border: `1px solid ${t25}`,
              font: `400 11px/1 ${MONO}`, minWidth: 140,
            }}
          >
            <button onClick={() => { onFixar(it.name, !it.favorito); setMenu(null) }} style={itemMenu}>
              {it.favorito ? 'soltar do topo' : 'fixar no topo'}
            </button>
            <button onClick={() => { setRenomeando(it.name); setMenu(null) }} style={itemMenu}>renomear</button>
            {confirmando === it.name ? (
              <div style={{ padding: `${ESP.xs}px ${ESP.sm}px`, color: t100 }}>
                excluir?
                <button onClick={() => { onExcluir(it.name); setMenu(null); setConfirmando(null) }}
                  style={{ ...itemMenu, display: 'inline', width: 'auto', padding: '0 6px', color: t100 }}>sim</button>
                <button onClick={() => setConfirmando(null)}
                  style={{ ...itemMenu, display: 'inline', width: 'auto', padding: '0 6px' }}>não</button>
              </div>
            ) : (
              <button onClick={() => setConfirmando(it.name)} style={itemMenu}>excluir…</button>
            )}
            <div style={{ padding: `2px ${ESP.sm}px ${ESP.xs}px`, color: t25, font: `400 9px/1.3 ${MONO}` }}>
              excluir move pro lixo
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ position: 'relative', borderBottom: LINHA }}>
        <input
          ref={buscaRef}
          value={busca}
          onChange={e => setBusca(e.target.value)}
          onKeyDown={e => {
            // Escape limpa antes de sair: sair deixando a lista filtrada com o
            // campo desfocado esconde metade do acervo sem dizer que escondeu.
            if (e.key === 'Escape') {
              e.stopPropagation()
              if (busca) setBusca('')
              else (e.target as HTMLInputElement).blur()
            }
          }}
          placeholder="buscar"
          aria-label="buscar no repertório"
          style={{
            background: 'transparent', border: 'none',
            color: t100, font: `400 12px/1 ${MONO}`, padding: ESP.sm,
            outline: 'none', width: '100%',
          }}
        />
        <kbd style={{
          position: 'absolute', right: ESP.sm, top: '50%', transform: 'translateY(-50%)',
          font: `400 9px/1 ${MONO}`, color: t25, border: `1px solid ${t12}`,
          padding: '2px 4px', pointerEvents: 'none',
        }}>/</kbd>
      </div>

      <div ref={listaRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {fixadas.map((it, i) => linha(it, i))}

        {/* Régua, não cabeçalho: "FIXADAS" em caixa-alta seria cromo permanente
            numa coluna que precisa de altura, e a posição já diz o que a palavra
            diria. Só existe quando há os dois lados. */}
        {separa && <div style={{ borderTop: LINHA, margin: `${ESP.xs}px 0` }} />}

        {resto.map((it, i) => linha(it, fixadas.length + i))}

        {/* Vazio silencioso é a mentira dominante deste tipo de tela: sem isto,
            buscar "zzz" esvazia a coluna e não dá pra saber se filtrou tudo, se
            o backend caiu, ou se o acervo sumiu. E o termo digitado vira o
            caminho mais curto pra criar. */}
        {ordem.length === 0 && busca.trim() && (
          <div style={{ padding: ESP.sm, font: `400 11px/1.6 ${MONO}`, color: t45 }}>
            nenhuma com “{busca.trim()}”.
            <button
              onClick={() => { onCriar(busca.trim()); setBusca('') }}
              style={{
                display: 'block', marginTop: ESP.xs, background: 'transparent',
                border: `1px solid ${t25}`, color: t70, cursor: 'pointer',
                font: `400 11px/1 ${MONO}`, padding: '4px 8px',
              }}
            >criar “{busca.trim()}”</button>
          </div>
        )}
      </div>

      {/* opcional vazio não é campo: vira botão até ter conteúdo */}
      <div style={{ borderTop: LINHA, padding: ESP.xs }}>
        {criando ? (
          <input
            autoFocus
            placeholder="nome da música"
            onBlur={() => setCriando(false)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim()
                if (v) onCriar(v)
                setCriando(false)
              }
              if (e.key === 'Escape') setCriando(false)
            }}
            style={{
              background: 'transparent', border: `1px solid ${t25}`, color: t100,
              font: `400 12px/1.2 ${MONO}`, width: '100%', padding: '3px 5px', outline: 'none',
            }}
          />
        ) : (
          <button
            onClick={() => setCriando(true)}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              color: t45, font: `400 11px/1.6 ${MONO}`, cursor: 'pointer', padding: `2px ${ESP.xs}px`,
            }}
          >+ música</button>
        )}
      </div>
    </div>
  )
}

const itemMenu: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
  border: 'none', color: t70, cursor: 'pointer', font: `400 11px/1 ${MONO}`,
  padding: `${ESP.xs}px ${ESP.sm}px`,
}
