/**
 * /musica: onde a música mora.
 *
 * Antes ela morava em dois lugares que não se falavam — um `localStorage` de painel
 * flutuante e um `patterns/` que só o CLI enxergava. Aqui o take que você ouve é o
 * arquivo que fica, e cada save vira versão com recado.
 *
 * Superfície B em quase tudo (a variável é ITERAÇÕES OUVIDAS POR HORA: escrever →
 * ouvir → corrigir), com duas ilhas de classe C, que são as únicas ações
 * irreversíveis: RESTAURAR e EXCLUIR. As duas foram desenhadas pra não mentir —
 * restaurar salva versão nova, excluir move pro lixo. Ver `PLAN-rota-musica.md`.
 *
 * O que NÃO está aqui, de propósito: knobs, LPF/HPF/delay/reverb, XY pad, cenas,
 * export e chat. Continuam no painel AnalogBrain, no canvas. Cada controle que não
 * serve a escrever/ouvir/guardar custa altura de editor.
 *
 * Cor e ritmo: `../fabrica/ui` — um tom só, estado dito por peso e palavra.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, X } from 'lucide-react'
import { StrudelEditor } from '../components/StrudelEditor'
import { StrudelService, type StrudelState } from '../lib/strudel-service'
import { definirRelogioPosicionavel, relogioPosicionavel } from '../lib/relogio-modo'
import { msgErro, songsApi, type Song, type SongSummary, type SongVersion } from '../lib/songs-api'
import { useJamBridge, type JamProposal } from '../hooks/useJamBridge'
import { diffLinhas, rotuloDiff } from './diff'
import { Exportador } from './Exportador'
import { Timeline } from './Timeline'
import { GradeArranjo } from './GradeArranjo'
import { LinhaDoTempo } from './LinhaDoTempo'
import { TomControl } from '../lib/TomControl'
import { tomDoTake } from '../lib/tom'
import { Problemas } from './Problemas'
import { trocarSom } from './sons'
import { Repertorio } from './Repertorio'
import { Versoes } from './Versoes'
import { ACESO, ESP, FUNDO, FUNDO_ALTO, LINHA, MONO, t100, t12, t25, t45, t70 } from '../fabrica/ui'

const LS_ABERTA = 'musica-aberta'
const LS_VISTA = 'musica-vista-tempo'

/** Abaixo disso as três colunas não são espremidas: uma de cada vez. */
function useEstreito(): boolean {
  const [estreito, setEstreito] = useState(() => window.matchMedia('(max-width: 860px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const on = (e: MediaQueryListEvent) => setEstreito(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return estreito
}

type Aba = 'repertorio' | 'editor' | 'versoes'

export function Musica() {
  const [itens, setItens] = useState<SongSummary[]>([])
  const [aberta, setAberta] = useState<string | null>(() => localStorage.getItem(LS_ABERTA))
  const [versoes, setVersoes] = useState<SongVersion[]>([])
  const [code, setCode] = useState('')
  const [salvo, setSalvo] = useState('')          // último texto que existe em disco
  const [vendo, setVendo] = useState<number | null>(null)
  const [recado, setRecado] = useState('')
  const [pedindoRecado, setPedindoRecado] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  // Três estados, não dois. Com só "tem item / não tem", backend fora do ar vira
  // "nenhuma música ainda" — que é mentira: o acervo está lá, a tela é que não
  // alcança. Vazio silencioso é a mentira dominante deste tipo de tela.
  const [carga, setCarga] = useState<'carregando' | 'ok' | 'falhou'>('carregando')
  const [strudel, setStrudel] = useState<StrudelState>({
    playing: false, code: '', error: null, bpm: 120, tom: 0,
    samplesLocais: 'carregando', samplesErro: null, bancosCaidos: [],
  })
  const [bpm, setBpm] = useState(120)
  const [aba, setAba] = useState<Aba>('editor')

  // Recado curto do que a tela fez SOZINHA (guardou antes de trocar). Some no
  // proximo save: aviso que fica vira cromo.
  const [aviso, setAviso] = useState<string | null>(null)

  // A camada escolhida: a grade de arranjo e a linha do tempo mostram a MESMA,
  // então ela mora aqui e não dentro de nenhuma das duas.
  const [camadaSel, setCamadaSel] = useState(0)

  /**
   * Qual vista do tempo: a nova (`LinhaDoTempo` — a peça inteira, com zoom) ou a
   * clássica (`GradeArranjo` + `Timeline`).
   *
   * As duas velhas continuam montáveis de propósito. Elas são feias, e é por
   * isso que a nova existe — mas a sincronia delas com o relógio é o que
   * funciona hoje, e trocar o que funciona por algo que ninguém rodou ainda,
   * sem volta, é como se perde uma tarde de jam. O interruptor sai quando a
   * nova tiver sido usada de verdade; até lá, backup que não roda não é backup.
   */
  const [vistaNova, setVistaNova] = useState(() => localStorage.getItem(LS_VISTA) !== 'classica')

  /**
   * Tudo que o motor sabe tocar, pra linha do tempo poder dizer quando uma
   * camada pede um som que nao existe (`s("dirt_dr55")`).
   *
   * `null` ate o motor subir — e `null` NAO e vazio: com o banco carregando,
   * marcar as camadas como mudas seria a tela inventando um defeito.
   */
  const [sons, setSons] = useState<Set<string> | null>(null)
  /** `true` quando o agendador em uso tem `setCycle` (NeoCyclist/sync). */
  const [agulhaMovel, setAgulhaMovel] = useState(false)

  const svcRef = useRef<StrudelService | null>(null)
  // `abrir` precisa saber se há som SEM depender de `strudel.playing`: depender
  // recriaria `abrir` a cada play/stop, e `abrirRef` (usada pelo atalho e pela
  // lista) passaria a apontar pra versão velha em alguns quadros.
  const tocandoRef = useRef(false)
  const salvandoRef = useRef(false)
  const buscaRef = useRef<HTMLInputElement | null>(null)
  const estreito = useEstreito()
  // Compara sem o espaço do fim: o backend normaliza a quebra de linha final, e
  // comparar cru deixava a tela dizendo "não salvo" para sempre DEPOIS de salvar.
  // A tela não pode mentir sobre o que está em disco.
  const sujo = code.trimEnd() !== salvo.trimEnd() && code.trim().length > 0

  useEffect(() => {
    const svc = StrudelService.get()
    svcRef.current = svc
    return svc.subscribe(setStrudel)
  }, [])

  useEffect(() => { document.title = aberta ? `música: ${aberta}` : 'música' }, [aberta])

  // Sincronizar com o banco de sons do motor e uso legitimo de effect: e sistema
  // externo, e ele muda sozinho (sample novo entra, reparo roda).
  useEffect(() => {
    const svc = StrudelService.get()
    let vivo = true
    let desouvir = () => {}
    // Chamadas opcionais de proposito: o motor e sistema externo, e quem monta
    // esta rota em teste o substitui por um dublê parcial. Faltando o metodo, o
    // resultado e `null` — que ja e o estado "ainda nao sei" e faz a linha do
    // tempo nao marcar ninguem. Degradar pra silencio informado, nao pra crash.
    const ler = () => { if (vivo) setSons(svc.sonsConhecidos?.() ?? null) }
    Promise.resolve(svc.init?.()).then(() => {
      if (!vivo) return
      ler()
      setAgulhaMovel(svc.podeMoverAgulha?.() ?? false)
      desouvir = svc.ouvirSons?.(ler) ?? (() => {})
    }).catch(() => {})
    return () => { vivo = false; desouvir() }
  }, [])

  const abrirRef = useRef<((nome: string) => void) | null>(null)
  const jaAbriu = useRef(false)

  const recarregarLista = useCallback(async () => {
    try {
      const lista = await songsApi.list()
      setItens(lista)
      setCarga('ok')
      setFalha(null)
      // Reabre a última da sessão anterior. Fica aqui, e não num effect, porque é
      // consequência de ter recebido a lista — não de ter renderizado.
      if (!jaAbriu.current) {
        jaAbriu.current = true
        const alvo = localStorage.getItem(LS_ABERTA)
        if (alvo && lista.some(i => i.name === alvo)) abrirRef.current?.(alvo)
      }
    } catch (e) {
      setCarga('falhou')
      setFalha(msgErro(e))
    }
  }, [])

  // Buscar a lista ao montar é sincronizar com um sistema externo, que é o uso
  // legítimo de effect. O setState acontece depois do await, não no corpo.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recarregarLista() }, [recarregarLista])

  /**
   * O portão contra perda silenciosa de trabalho.
   *
   * Três caminhos trocavam o conteúdo do editor sem olhar pra `sujo`: abrir
   * outra música, ver uma versão antiga e aceitar proposta do CLI. Um clique, e
   * dois minutos de edição não salva sumiam — sem confirmação e sem undo, porque
   * o CodeMirror recebe um documento novo inteiro e não devolve isso.
   *
   * A saída NÃO é um diálogo. Esta rota já resolveu essa classe uma vez, no
   * restaurar: nada se perde, tudo vira elo. Então guardar é o comportamento
   * padrão — a edição vira versão com recado automático, a troca acontece na
   * hora, e o trabalho fica recuperável na coluna da direita. Diálogo custaria
   * um clique em TODA troca; isto custa zero e não perde nada.
   */
  const guardarSeSujo = useCallback(async (motivo: string) => {
    if (!aberta || !sujo) return
    try {
      await songsApi.save(aberta, code, motivo, bpm, 'user')
      const s = await songsApi.get(aberta)
      setSalvo(s.code)
      setVersoes(s.versions)
      setAviso(`guardei sua mudança em v${s.versions.length - 1} antes de trocar`)
    } catch (e) {
      // Se não deu pra guardar, NÃO troca: perder por falha de rede é o mesmo
      // que perder por descuido.
      throw new Error(`não consegui guardar sua mudança (${msgErro(e)}). nada foi trocado.`)
    }
  }, [aberta, sujo, code, bpm])

  const abrir = useCallback(async (nome: string) => {
    try {
      if (nome !== aberta) await guardarSeSujo('antes de abrir ' + nome)
      const s: Song = await songsApi.get(nome)
      setAberta(s.name)
      localStorage.setItem(LS_ABERTA, s.name)
      setCode(s.code)
      setSalvo(s.code)
      setVersoes(s.versions)
      setVendo(null)
      setFalha(null)
      // Take nova, camadas novas: manter o índice antigo apontaria pra uma
      // camada que não é a mesma coisa, e os controles agiriam no escuro.
      setCamadaSel(0)
      if (s.bpm) { setBpm(s.bpm); svcRef.current?.setBPM(s.bpm) }
      // Transpor é da sessão de escuta, não da peça: trocar de música volta ao
      // tom original. Herdar o +3 da take anterior faria a nova abrir num tom
      // que ninguém escolheu — e sem nada na tela explicando por quê.
      svcRef.current?.setTom(0)
      if (estreito) setAba('editor')

      // Trocar de música troca o que SOA, não só o que se lê. Antes, o editor
      // mostrava a take nova enquanto o alto-falante seguia na antiga — a tela
      // mentindo sobre o que toca, que é o defeito que esta rota paga mais caro.
      //
      // `stop()` antes de `evaluate()`, e não troca a quente: parar zera o
      // relógio, então a take nova começa na CASA 1 em vez de cair no meio do
      // arranjo da anterior. Numa peça em que a melodia entra na casa 5, entrar
      // pela casa 6 é ouvir outra música.
      //
      // Só quando já havia som. Selecionar não LIGA o som do nada, senão
      // passear pelo repertório vira 21 partidas de áudio seguidas.
      if (tocandoRef.current) {
        const svc = svcRef.current
        svc?.stop()
        if (s.code.trim()) await svc?.evaluate(s.code).catch(() => {})
      }
    } catch (e) { setFalha(msgErro(e)) }
  }, [estreito, aberta, guardarSeSujo])

  // Ref atualizada em effect (nunca no render): `recarregarLista` precisa chamar
  // `abrir` sem depender dele, senão as duas funções se citam em círculo.
  useEffect(() => { abrirRef.current = abrir }, [abrir])
  useEffect(() => { tocandoRef.current = strudel.playing }, [strudel.playing])

  const salvar = useCallback(async (msg = '') => {
    if (!aberta || !code.trim()) return
    // Ctrl+S preso (ou dois cliques) disparava dois POST, e o .jsonl e
    // append-only: entravam duas versoes identicas. A coluna de versoes e o
    // produto inteiro da direita da tela; uma tecla presa nao pode poluir ela.
    if (salvandoRef.current) return
    salvandoRef.current = true
    try {
      await songsApi.save(aberta, code, msg, bpm, 'user')
      const s = await songsApi.get(aberta)
      setSalvo(s.code)
      setVersoes(s.versions)
      setVendo(null)
      setRecado('')
      setPedindoRecado(false)
      setFalha(null)
      setAviso(null)
      recarregarLista()
    } catch (e) { setFalha(msgErro(e)) }
    finally { salvandoRef.current = false }
  }, [aberta, code, bpm, recarregarLista])

  const tocar = useCallback(async () => {
    const svc = svcRef.current
    if (!svc) return
    if (strudel.playing) { svc.stop(); return }
    if (code.trim()) await svc.evaluate(code).catch(() => {})
  }, [strudel.playing, code])

  const avaliar = useCallback(async () => {
    if (code.trim()) await svcRef.current?.evaluate(code).catch(() => {})
  }, [code])

  // ── Jam bridge: proposta do CLI, com o tamanho da mudança na faixa ──
  // Regex sobre o código inteiro a cada tecla seria desperdício: o tom só muda
  // quando o texto muda, e é isso que o memo diz.
  const tomDaPeca = useMemo(() => tomDoTake(code), [code])

  const jam = useJamBridge({ code, bpm, playing: strudel.playing, error: strudel.error })
  const aceitarProposta = useCallback(async (p: JamProposal) => {
    try { await guardarSeSujo('antes de aceitar proposta do jam') }
    catch (e) { setFalha(msgErro(e)); return }
    setCode(p.code)
    setVendo(null)
    if (p.bpm) { setBpm(p.bpm); svcRef.current?.setBPM(p.bpm) }
    jam.accept(p)
    svcRef.current?.evaluate(p.code).catch(() => {})
  }, [jam, guardarSeSujo])

  const verVersao = useCallback(async (i: number) => {
    if (!aberta) return
    try {
      await guardarSeSujo(`antes de ver v${i}`)
      const v = await songsApi.version(aberta, i)
      setCode(v.code)
      setVendo(i === versoes.length - 1 ? null : i)
    } catch (e) { setFalha(msgErro(e)) }
  }, [aberta, versoes.length, guardarSeSujo])

  const restaurar = useCallback(async (i: number) => {
    if (!aberta) return
    try {
      const r = await songsApi.restore(aberta, i)
      const s = await songsApi.get(aberta)
      setCode(r.code)
      setSalvo(s.code)
      setVersoes(s.versions)
      setVendo(null)
      recarregarLista()
    } catch (e) { setFalha(msgErro(e)) }
  }, [aberta, recarregarLista])

  const criar = useCallback(async (nome: string) => {
    try {
      await songsApi.save(nome, `// ${nome}\nsilence\n`, 'criada', bpm, 'user')
      await recarregarLista()
      abrir(nome)
    } catch (e) { setFalha(msgErro(e)) }
  }, [bpm, recarregarLista, abrir])

  const renomear = useCallback(async (nome: string, novo: string) => {
    try {
      await songsApi.rename(nome, novo)
      await recarregarLista()
      if (aberta === nome) { setAberta(novo); localStorage.setItem(LS_ABERTA, novo); abrir(novo) }
    } catch (e) { setFalha(msgErro(e)) }
  }, [aberta, recarregarLista, abrir])

  const fixar = useCallback(async (nome: string, valor: boolean) => {
    // Otimista: fixar e ergonomia, nao acervo. Se o backend recusar, a lista
    // volta ao que ele disser no proximo recarregar e a falha aparece escrita.
    setItens(prev => prev.map(i => (i.name === nome ? { ...i, favorito: valor } : i)))
    try {
      await songsApi.favoritar(nome, valor)
    } catch (e) {
      setFalha(msgErro(e))
      recarregarLista()
    }
  }, [recarregarLista])

  const excluir = useCallback(async (nome: string) => {
    try {
      await songsApi.remove(nome)
      await recarregarLista()
      if (aberta === nome) {
        setAberta(null); localStorage.removeItem(LS_ABERTA)
        setCode(''); setSalvo(''); setVersoes([])
      }
    } catch (e) { setFalha(msgErro(e)) }
  }, [aberta, recarregarLista])

  /**
   * Teclado, na ordem de guarda que evita os quatro bugs clássicos: combo primeiro,
   * campo de texto depois (com Escape pra sair), outro modificador devolve pro
   * browser, foco em controle devolve, e só então tecla seca.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'Enter') { e.preventDefault(); avaliar(); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); salvar(recado); return }
      if (mod && e.key === '.') { e.preventDefault(); svcRef.current?.stop(); return }

      const alvo = e.target as HTMLElement | null
      const digitando = !!alvo?.closest('input, textarea, .cm-editor, [contenteditable="true"]')
      if (digitando) {
        if (e.key === 'Escape') alvo?.blur()
        return
      }
      if (e.altKey || e.shiftKey || mod) return
      if (alvo?.closest('button, a, select')) return
      if (e.key === ' ') { e.preventDefault(); tocar() }
      // `/` foca a busca: e o controle mais usado da coluna e so se chegava
      // nele com mouse ou N tabs.
      if (e.key === '/') { e.preventDefault(); setAba('repertorio'); buscaRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [avaliar, salvar, tocar, recado])

  const mostraRepertorio = !estreito || aba === 'repertorio'
  const mostraEditor = !estreito || aba === 'editor'
  const mostraVersoes = (!estreito || aba === 'versoes') && !!aberta

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', background: FUNDO,
      color: t100, font: `400 13px/1.5 ${MONO}`, overflow: 'hidden',
    }}>
      {/* ── cabeçalho: uma linha. O nome, o estado, e UM primário ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: ESP.sm, flexWrap: 'wrap',
        padding: `0 ${ESP.sm}px`, height: 40, flexShrink: 0,
        borderBottom: LINHA, background: FUNDO_ALTO,
      }}>
        <span style={{ font: `500 13px/1 ${MONO}`, color: aberta ? t100 : t45, minWidth: 0 }}>
          {aberta || 'música'}
        </span>

        {sujo && (
          <span style={{ font: `400 10px/1 ${MONO}`, color: t45 }} aria-live="polite">
            não salvo
          </span>
        )}
        {vendo !== null && (
          <span style={{ font: `400 10px/1 ${MONO}`, color: t100 }}>
            vendo v{vendo}, editar aqui parte desta versão
          </span>
        )}
        {aviso && (
          <span style={{ font: `400 10px/1 ${MONO}`, color: t70 }} aria-live="polite">
            {aviso}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: ESP.xs }}>
          {/* recado é campo opcional: só existe como botão até ter conteúdo */}
          {sujo && (pedindoRecado || recado ? (
            <input
              autoFocus
              value={recado}
              onChange={e => setRecado(e.target.value)}
              placeholder="o que mudou"
              onKeyDown={e => { if (e.key === 'Enter') salvar(recado) }}
              style={{
                background: 'transparent', border: `1px solid ${t25}`, color: t100,
                font: `400 11px/1 ${MONO}`, padding: '4px 6px', width: 200, outline: 'none',
              }}
            />
          ) : (
            <button onClick={() => setPedindoRecado(true)} style={botaoFantasma}>+ recado</button>
          ))}

          {sujo && (
            <button onClick={() => salvar(recado)} style={botaoPrimario}>
              SALVAR <kbd style={kbd}>Ctrl+S</kbd>
            </button>
          )}
        </div>
      </header>

      {estreito && (
        <nav style={{ display: 'flex', borderBottom: LINHA, flexShrink: 0 }}>
          {(['repertorio', 'editor', 'versoes'] as Aba[]).map(t => (
            <button
              key={t}
              onClick={() => setAba(t)}
              style={{
                flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '6px 0', font: `500 10px/1 ${MONO}`, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: aba === t ? t100 : t45,
                borderBottom: `2px solid ${aba === t ? ACESO : 'transparent'}`,
              }}
            >{t}</button>
          ))}
        </nav>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {mostraRepertorio && (
          <aside style={{
            width: estreito ? '100%' : 210, flexShrink: 0, borderRight: estreito ? undefined : LINHA,
            minWidth: 0,
          }}>
            <Repertorio
              itens={itens}
              aberta={aberta}
              onAbrir={abrir}
              onCriar={criar}
              onRenomear={renomear}
              onExcluir={excluir}
              onFixar={fixar}
              buscaRef={buscaRef}
            />
          </aside>
        )}

        {mostraEditor && (
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {aberta ? (
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <StrudelEditor
                  value={code}
                  onChange={c => { setCode(c); if (vendo !== null) setVendo(null) }}
                  onEvaluate={avaliar}
                  onStop={() => svcRef.current?.stop()}
                  accent={ACESO}
                  placeholder={'// Ctrl+Enter toca · Ctrl+S salva versão'}
                />
              </div>
            ) : (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: ESP.sm,
                padding: ESP.lg, textAlign: 'center', color: t45, font: `400 12px/1.7 ${MONO}`,
              }}>
                {carga === 'falhou' ? (
                  <>
                    <span style={{ color: t100 }}>
                      não consegui falar com o backend, então não sei o que tem no acervo
                    </span>
                    <span>as músicas continuam em patterns/. suba o dashboard_server.py</span>
                    <button onClick={recarregarLista} style={botaoFantasma}>tentar de novo</button>
                  </>
                ) : carga === 'carregando' ? null
                  : itens.length
                    ? 'abra uma música no repertório'
                    : 'nenhuma música ainda. crie a primeira em “+ música”, ou mande uma pelo terminal com jam.py new'}
              </div>
            )}

            {/* ── o que está tocando mudo, e o que escrever no lugar ──
                Irmã da faixa de baixo, e separada dela de propósito: aquela é
                sobre o BANCO não ter entrado; esta é sobre o TAKE pedir um som
                que não existe. As duas dão no mesmo silêncio e têm consertos
                diferentes, e uma faixa só teria que escolher qual mentir. */}
            <Problemas
              sonsConhecidos={sons}
              onTrocarSom={(de, para) => {
                const novo = trocarSom(code, de, para)
                setCode(novo)
                if (vendo !== null) setVendo(null)
                // Reavaliar SÓ se já estava tocando, e por um motivo medido: o
                // take no ar continua sendo o antigo depois da troca, então o
                // motor segue cuspindo o mesmo erro a cada evento e a faixa
                // volta a acusar o nome que a pessoa acabou de consertar. Ela
                // lê "eu já troquei e ele insiste" e desconfia do botão.
                // Reavaliar é barato e é EM FASE (ver `camadas.ts`), então o
                // som volta sem o relógio pular.
                //
                // Parado continua parado: um botão de conserto de texto que
                // começa a tocar sozinho é um botão que faz duas coisas, e a
                // segunda ninguém pediu.
                if (strudel.playing) svcRef.current?.evaluate(novo).catch(() => {})
              }}
            />

            {/* ── o banco de samples local nao carregou ──
                Faixa propria, e nao um `console.error`, porque o sintoma dessa
                falha e SILENCIO: o take toca, o relogio anda, a linha do tempo
                desenha, e nao sai som nenhum. Sem esta linha, a pessoa procura o
                defeito no take, no volume, na timeline — em tudo menos no lugar
                certo. O botao repara sem recarregar a pagina, porque a causa
                mais comum e o backend ter subido DEPOIS da aba. */}
            {(strudel.samplesLocais === 'falhou' || (strudel.bancosCaidos?.length ?? 0) > 0) && (
              <div
                role="alert"
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: ESP.xs,
                  padding: `${ESP.xs}px ${ESP.sm}px`,
                  borderTop: `1px solid ${t25}`, background: FUNDO_ALTO,
                  color: t100, font: `400 11px/1.45 ${MONO}`,
                }}
              >
                <span>
                  {strudel.samplesLocais === 'falhou'
                    ? `samples locais não carregaram${strudel.samplesErro ? ` — ${strudel.samplesErro}` : ''}`
                    : `banco fora do ar: ${(strudel.bancosCaidos ?? []).join(', ')}`}
                  {' '}· camada que usar esses sons toca muda, e a linha do tempo marca “sem som”.
                </span>
                <button
                  onClick={() => { svcRef.current?.recarregarSamples().catch(() => {}) }}
                  style={{
                    marginLeft: 'auto', background: ACESO, border: 'none', borderRadius: 2,
                    padding: '3px 8px', cursor: 'pointer', color: FUNDO,
                    font: `500 10px ${MONO}`, letterSpacing: '0.06em', whiteSpace: 'nowrap',
                  }}
                >tentar de novo</button>
              </div>
            )}

            {/* ── o que quebrou ──
                Faixa própria, com altura, acima do transporte. Antes era um
                trecho de 55% de largura numa linha só, com o texto inteiro
                apenas no `title`: o texto MAIS LIDO do ciclo corrigir→ouvir,
                inacessível no toque e no teclado. Erro merece altura; o bpm não.
                Só existe quando há erro — zero px em repouso. */}
            {(strudel.error || falha) && (
              <div
                role="alert"
                style={{
                  flexShrink: 0, padding: `${ESP.xs}px ${ESP.sm}px`,
                  borderTop: `1px solid ${t25}`, background: FUNDO_ALTO,
                  color: t100, font: `400 11px/1.45 ${MONO}`,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 76, overflowY: 'auto',
                }}
              >
                {strudel.error || falha}
              </div>
            )}

            {/* ── a vista do tempo ──
                Uma das duas, nunca as duas: montar a nova junto das velhas
                poria três leituras do mesmo relógio na tela, que é a forma
                exata do bug que `relogio.ts` existe pra impedir.

                A NOVA recebe as DUAS fontes de propósito. `code` (o buffer)
                manda na FORMA, porque forma é texto e tem que desenhar com o
                som parado — é justamente pra isso que ela serve. `strudel.code`
                (o que soa) manda nos EVENTOS, porque é o único padrão que
                existe avaliado. Quando os dois divergem, ela DIZ — nunca
                escolhe uma das duas em silêncio. Ver o cabeçalho de lá.

                As CLÁSSICAS resolviam isso por serem duas, cada uma ligada numa
                fonte, e continuam exatamente como estavam. */}
            {aberta && vistaNova && (
              <LinhaDoTempo
                codigo={code}
                codigoTocando={strudel.code}
                bpm={bpm}
                tocando={strudel.playing}
                sel={camadaSel}
                onSel={setCamadaSel}
                sonsConhecidos={sons}
                onMoverAgulha={agulhaMovel
                  ? (ciclo: number) => { svcRef.current?.moverAgulha(ciclo) }
                  : undefined}
                onAplicar={c => {
                  setCode(c)
                  if (vendo !== null) setVendo(null)
                  svcRef.current?.evaluate(c).catch(() => {})
                }}
              />
            )}

            {aberta && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: ESP.xs,
                padding: `2px ${ESP.sm}px`, borderTop: LINHA, background: FUNDO_ALTO,
              }}>
                <button
                  onClick={() => {
                    const v = !vistaNova
                    setVistaNova(v)
                    localStorage.setItem(LS_VISTA, v ? 'nova' : 'classica')
                  }}
                  style={{
                    background: 'none', border: 'none', padding: '3px 4px', cursor: 'pointer',
                    color: t45, font: `400 9px ${MONO}`, letterSpacing: '0.06em',
                  }}
                  title={vistaNova
                    ? 'voltar pra grade + régua de um ciclo (o que funciona hoje)'
                    : 'a peça inteira, com zoom'}
                >
                  {vistaNova ? '↩ vista clássica' : '↪ linha do tempo nova'}
                </button>

                {/* ── a volta do agendador ──
                    A agulha clicável exige o `NeoCyclist` (`sync`), que é um
                    agendador DIFERENTE do que esta rota usou até aqui. Isso
                    mexe no que já funciona, então a volta mora ao lado da outra
                    volta — esta fileira é a das saídas de emergência.
                    Recarrega porque trocar de agendador ao vivo seria
                    reconstruí-lo embaixo do som que está tocando. */}
                <button
                  onClick={() => {
                    definirRelogioPosicionavel(!relogioPosicionavel())
                    location.reload()
                  }}
                  style={{
                    marginLeft: 'auto',
                    background: 'none', border: 'none', padding: '3px 4px', cursor: 'pointer',
                    color: t25, font: `400 9px ${MONO}`, letterSpacing: '0.06em',
                  }}
                  title={relogioPosicionavel()
                    ? 'volta pro agendador antigo (Cyclist) — a agulha deixa de ser clicável'
                    : 'liga o agendador com setCycle (NeoCyclist) — a agulha vira clicável'}
                >
                  {relogioPosicionavel() ? 'relógio: sync' : 'relógio: clássico'}
                </button>
              </div>
            )}

            {aberta && !vistaNova && (
              <GradeArranjo
                codigo={code}
                bpm={bpm}
                tocando={strudel.playing}
                sel={camadaSel}
                onSel={setCamadaSel}
                onAplicar={c => {
                  setCode(c)
                  if (vendo !== null) setVendo(null)
                  svcRef.current?.evaluate(c).catch(() => {})
                }}
              />
            )}

            {aberta && !vistaNova && (
              <Timeline
                codigo={strudel.code}
                tocando={strudel.playing}
                sel={camadaSel}
                onSel={setCamadaSel}
                onAplicar={c => {
                  setCode(c)
                  if (vendo !== null) setVendo(null)
                  svcRef.current?.evaluate(c).catch(() => {})
                }}
              />
            )}

            {/* ── transporte ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: ESP.sm, flexWrap: 'wrap',
              padding: `${ESP.xs}px ${ESP.sm}px`, borderTop: LINHA, flexShrink: 0,
              background: FUNDO_ALTO,
            }}>
              <button onClick={tocar} style={botaoIcone} title={strudel.playing ? 'parar (Ctrl+.)' : 'tocar (espaço)'}>
                {strudel.playing ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
              </button>
              <button onClick={avaliar} style={botaoFantasma} title="Ctrl+Enter">
                reavaliar
              </button>

              <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: t45, font: `400 10px/1 ${MONO}` }}>
                <input
                  type="number"
                  value={bpm}
                  min={30}
                  max={300}
                  onChange={e => { const v = Number(e.target.value); setBpm(v); svcRef.current?.setBPM(v) }}
                  style={{
                    width: 46, background: 'transparent', border: `1px solid ${t12}`, color: t100,
                    font: `400 11px/1 ${MONO}`, padding: '3px 4px', outline: 'none',
                  }}
                />
                bpm
              </label>

              {/* ── tom ──
                  Vizinho do bpm de propósito: são as duas coisas que se mexem
                  OUVINDO, não lendo. Diferente do bpm, transpor não é do take:
                  o código salvo continua no tom escrito, e o envelope some ao
                  trocar de música (ver `setTom` no strudel-service). */}
              <TomControl
                semitons={strudel.tom}
                onChange={v => { void svcRef.current?.setTom(v) }}
                tom={tomDaPeca}
                accent={ACESO}
                largura={116}
              />

              <Exportador
                musica={aberta}
                code={code}
                bpm={bpm}
                svc={svcRef.current}
                vendo={vendo}
                ultimaVersao={versoes.length - 1}
                sujo={sujo}
              />

              {!jam.online && (
                <span style={{ font: `400 10px/1 ${MONO}`, color: t45 }}>
                  jam fora do ar
                </span>
              )}

            </div>

            {/* ── proposta do CLI, com o tamanho da mudança dito em número ── */}
            {jam.proposal && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: ESP.xs, flexWrap: 'wrap',
                padding: `${ESP.xs}px ${ESP.sm}px`, borderTop: `1px solid ${ACESO}55`,
                background: 'rgba(51,255,102,0.06)', flexShrink: 0, font: `400 10px/1.4 ${MONO}`,
              }}>
                <span style={{ color: t45 }}>claude</span>
                <span style={{ color: t100 }}>{rotuloDiff(diffLinhas(code, jam.proposal.code))}</span>
                <span style={{
                  flex: 1, minWidth: 60, color: t70,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={jam.proposal.message}>
                  {jam.proposal.message || '(sem recado)'}
                </span>
                <button onClick={() => svcRef.current?.evaluate(jam.proposal!.code).catch(() => {})}
                  style={botaoFantasma}>ouvir</button>
                <button onClick={() => aceitarProposta(jam.proposal!)} style={botaoPrimario}>aceitar</button>
                <button onClick={() => jam.dismiss(jam.proposal!)} style={botaoFantasma} aria-label="descartar"><X size={12} /></button>
              </div>
            )}
          </main>
        )}

        {mostraVersoes && (
          <aside style={{
            width: estreito ? '100%' : 230, flexShrink: 0,
            borderLeft: estreito ? undefined : LINHA, minWidth: 0,
          }}>
            <Versoes versoes={versoes} vendo={vendo} onVer={verVersao} onRestaurar={restaurar} />
          </aside>
        )}
      </div>
    </div>
  )
}

const botaoPrimario: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, background: 'transparent',
  border: `1px solid ${ACESO}`, color: t100, cursor: 'pointer',
  font: `500 11px/1 ${MONO}`, letterSpacing: '0.08em', padding: '5px 10px',
}

const botaoFantasma: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${t12}`, color: t45, cursor: 'pointer',
  font: `400 11px/1 ${MONO}`, padding: '5px 8px',
}

const botaoIcone: React.CSSProperties = {
  background: 'transparent', border: 'none', color: t100, cursor: 'pointer',
  display: 'flex', alignItems: 'center', padding: '4px 6px',
}

const kbd: React.CSSProperties = {
  font: `400 9px/1 ${MONO}`, color: t45, border: `1px solid ${t12}`, padding: '2px 3px',
}
