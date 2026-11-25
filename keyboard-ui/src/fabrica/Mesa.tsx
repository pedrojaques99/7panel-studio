/**
 * MESA — uma ou mais camadas de `Tocar`, tocando juntas, com UM gravador.
 *
 * ## Por que grade, e por que assim
 *
 * Uma cama de ambient raramente é um timbre: é taça de vidro por baixo, TX81Z no meio e
 * piano de armário por cima. Fazer isso com UM sintetizador obriga a gravar três vezes e
 * empilhar depois — e o que se perde nisso é justamente ouvir a soma enquanto se toca.
 *
 * ## As três decisões que evitam o overkill
 *
 * 1. **A mesa não tem motor.** Ela não sabe o que é uma voz, um filtro ou um sample. Cada
 *    camada é um `<Tocar>` inteiro e intacto — a mesa só decide quantos existem, qual está
 *    no ar e quem aperta o gravar. Zero DSP aqui dentro.
 *
 * 2. **O teclado toca TODAS as camadas ligadas.** Não há camada "em foco", porque foco
 *    pediria uma regra a mais na cabeça de quem toca, e a leitura natural de três
 *    sintetizadores abertos é um acorde saindo nos três. Quem escolhe quem soa é o
 *    play/pause — que é exatamente o gesto que ele pediu.
 *
 * 3. **Um gravador só, e ele mora na barra fixa.** Com três camadas a página fica longa e
 *    a faixa de ação sumiria pra cima justo quando ela é mais necessária — gravar é o gesto
 *    que fecha a sessão. Então a barra parou de rolar com o conteúdo, e o `Tocar` deixou de
 *    ter GRAVAR próprio em qualquer número de camadas: N botões seriam N takes de uma coisa
 *    que o ouvido escuta como uma.
 *
 * ## O gravador compartilhado
 *
 * Não precisou de roteamento: `createFxChain` já conecta todo `outputGain` em
 * `getMasterCaptureNode()`, então o stream master **já é** a soma das camadas. O gravador
 * daqui é o mesmo do `Tocar` (MediaRecorder → `/api/upload` → `onGravado`), apontado pra
 * esse stream em vez do destino de uma camada só.
 *
 * O botão de NOTAS continua dentro de cada camada, e é de propósito: áudio é da SOMA,
 * nota é de QUEM TOCOU.
 *
 * ## Salvar pra re-editar
 *
 * Salva a montagem (as camadas, a voz de cada uma, quem está no ar) — não o áudio, que o
 * GRAVAR já virou arquivo. Vai pra DISCO em `era 5/_mesas/*.json` e não pra
 * `localStorage`: "música pra re-editar" que some quando ele limpa o navegador não é
 * música salva.
 *
 * A voz de cada camada chega por callback do próprio `Tocar` — a mesa não fuça dentro
 * dele. E guarda só preset + sample: knob a knob faria o arquivo salvo envelhecer junto
 * com a lista de parâmetros.
 *
 * Cor e peso: ver `ui.ts`. Camada pausada não muda de hue, muda de PREENCHIMENTO.
 */
import { useCallback, useRef, useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Tocar, type ModoTocar, type EstadoCamada } from './Tocar'
import { resolveUrl } from '../lib/api'
import { getMasterCaptureStream } from '../lib/audio-context'
import {
  ACESO, ACESO_FRACO, ESP, LINHA, MONO, TRANSICAO, t100, t70, t45, t25, t12,
} from './ui'

/** Teto de camadas. Três cobrem a cama (chão, meio, brilho); a quarta é vontade de DAW. */
const MAX_CAMADAS = 3

type Camada = { id: number; ligada: boolean; voz: EstadoCamada | null }

type MesaSalva = { nome: string; salvo_em: string; camadas: number }

type EstadoRec = 'vazio' | 'gravando' | 'subindo' | 'ok' | 'erro'

export function Mesa({ onGravado, modo = 'completo' }: {
  onGravado: (path: string, durSeg: number) => void
  modo?: ModoTocar
}) {
  const [camadas, setCamadas] = useState<Camada[]>([{ id: 1, ligada: true, voz: null }])
  const proximoId = useRef(2)
  const grade = camadas.length > 1

  const [rec, setRec] = useState<EstadoRec>('vazio')
  const [erro, setErro] = useState('')
  const [decorrido, setDecorrido] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const pedacosRef = useRef<Blob[]>([])
  const t0Ref = useRef(0)
  const timerRef = useRef<number | null>(null)

  const addCamada = useCallback(() => {
    setCamadas(cs => cs.length >= MAX_CAMADAS
      ? cs
      : [...cs, { id: proximoId.current++, ligada: true, voz: null }])
  }, [])

  const tirarCamada = useCallback((id: number) => {
    setCamadas(cs => (cs.length <= 1 ? cs : cs.filter(c => c.id !== id)))
  }, [])

  const alternar = useCallback((id: number) => {
    setCamadas(cs => cs.map(c => (c.id === id ? { ...c, ligada: !c.ligada } : c)))
  }, [])

  /* A voz de cada camada chega por callback do próprio `Tocar`: a mesa não fuça dentro
     dele, ele é que conta o que virou. Guardar só isso é o que faz a mesa salva
     sobreviver a mudança de knob lá dentro. */
  const anotarVoz = useCallback((id: number, voz: EstadoCamada) => {
    setCamadas(cs => cs.map(c => (c.id === id
      ? (c.voz?.presetId === voz.presetId && c.voz?.samplePath === voz.samplePath ? c : { ...c, voz })
      : c)))
  }, [])

  /* ── mesas salvas ─────────────────────────────────────────────────── */

  const [salvas, setSalvas] = useState<MesaSalva[]>([])
  const [gaveta, setGaveta] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [recado, setRecado] = useState('')
  /** Reabrir remonta as camadas do zero, então a chave muda e o `Tocar` renasce. */
  const [geracao, setGeracao] = useState(0)

  const listarMesas = useCallback(async () => {
    try {
      const r = await fetch(resolveUrl('/api/mesa/listar'))
      setSalvas(r.ok ? await r.json() : [])
    } catch { setSalvas([]) }
  }, [])

  const salvarMesa = useCallback(async () => {
    setSalvando(true); setRecado('')
    try {
      const r = await fetch(resolveUrl('/api/mesa/salvar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          dados: { camadas: camadas.map(c => ({ ligada: c.ligada, voz: c.voz })) },
        }),
      })
      const j = await r.json()
      setRecado(r.ok ? `salva como ${j.nome}` : (j?.error ?? 'não salvou'))
      if (r.ok) { setNome(''); void listarMesas() }
    } catch { setRecado('não salvou') } finally { setSalvando(false) }
  }, [nome, camadas, listarMesas])

  const abrirMesa = useCallback(async (n: string) => {
    try {
      const r = await fetch(resolveUrl(`/api/mesa/listar?nome=${encodeURIComponent(n)}`))
      if (!r.ok) { setRecado('não abriu'); return }
      const j = await r.json()
      const cs: { ligada?: boolean; voz?: EstadoCamada | null }[] = j?.dados?.camadas ?? []
      if (cs.length === 0) { setRecado('mesa vazia'); return }
      proximoId.current = 1
      setCamadas(cs.slice(0, MAX_CAMADAS).map(c => ({
        id: proximoId.current++, ligada: c.ligada !== false, voz: c.voz ?? null,
      })))
      setGeracao(g => g + 1)
      setGaveta(false)
      setRecado(`abriu ${n}`)
    } catch { setRecado('não abriu') }
  }, [])

  /* ── o gravador da mesa: o stream master, que já é a soma ──────────── */

  const pararTudo = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null }
    const r = recRef.current
    if (r && r.state !== 'inactive') { try { r.stop() } catch { /* noop */ } }
    recRef.current = null
  }, [])

  const gravarTudo = useCallback(() => {
    if (rec === 'gravando') { pararTudo(); return }
    const stream = getMasterCaptureStream()
    if (!stream) { setRec('erro'); setErro('sem stream master'); return }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm'
    pedacosRef.current = []
    const r = new MediaRecorder(stream, { mimeType: mime })
    r.ondataavailable = e => { if (e.data.size > 0) pedacosRef.current.push(e.data) }
    r.onstop = async () => {
      const dur = Math.max(0, (Date.now() - t0Ref.current) / 1000)
      const blob = new Blob(pedacosRef.current, { type: mime })
      if (blob.size === 0) { setRec('erro'); setErro('gravação vazia'); return }
      setRec('subindo')
      try {
        const fd = new FormData()
        fd.append('file', blob, `mesa-rec-${Date.now()}.webm`)
        const res = await fetch(resolveUrl('/api/upload'), { method: 'POST', body: fd })
        if (!res.ok) { setRec('erro'); setErro(`upload falhou (${res.status})`); return }
        const json = await res.json()
        const caminho: string | undefined = json?.path
        if (!caminho) { setRec('erro'); setErro('resposta sem path'); return }
        setRec('ok')
        onGravado(caminho, dur)
      } catch (e) {
        setRec('erro')
        setErro(e instanceof Error ? e.message : 'falha no upload')
      }
    }
    r.start(250)
    recRef.current = r
    t0Ref.current = Date.now()
    setDecorrido(0); setErro(''); setRec('gravando')
    timerRef.current = window.setInterval(
      () => setDecorrido((Date.now() - t0Ref.current) / 1000), 200)
  }, [rec, pararTudo, onGravado])

  const mm = `${Math.floor(decorrido / 60)}:${String(Math.floor(decorrido % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: ESP.md }}>
      <div style={{
        display: 'grid',
        /* Uma camada ocupa a largura toda, como sempre ocupou. Duas ou três dividem,
           e abaixo de 900 px voltam a empilhar: coluna estreita quebra o teclado. */
        gridTemplateColumns: grade ? 'repeat(auto-fit, minmax(440px, 1fr))' : '1fr',
        gap: ESP.md,
      }}>
        {camadas.map((c, i) => (
          <div key={c.id} style={{
            display: 'flex', flexDirection: 'column', gap: ESP.xs,
            border: grade ? LINHA : 'none',
            borderRadius: grade ? 8 : 0,
            padding: grade ? ESP.sm : 0,
            /* Camada pausada não some: fica um degrau abaixo na escala. Sumir faria
               perder de vista o que está montado. */
            opacity: c.ligada ? 1 : 0.55,
            transition: TRANSICAO,
          }}>
            {grade && (
              <div style={{ display: 'flex', alignItems: 'center', gap: ESP.xs }}>
                <button
                  type="button"
                  onClick={() => alternar(c.id)}
                  aria-pressed={c.ligada}
                  aria-label={`${c.ligada ? 'pausar' : 'tocar'} a camada ${i + 1}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: ESP.xs,
                    padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                    font: `700 10px ${MONO}`, letterSpacing: '0.14em',
                    background: c.ligada ? ACESO_FRACO : 'transparent',
                    border: `1px solid ${c.ligada ? ACESO : t12}`,
                    color: c.ligada ? ACESO : t45,
                    transition: TRANSICAO,
                  }}>
                  {/* tocando é triângulo cheio, pausado é a barra dupla vazada */}
                  <span aria-hidden style={{ font: `11px ${MONO}`, lineHeight: 1 }}>
                    {c.ligada ? '▶' : '❙❙'}
                  </span>
                  CAMADA {i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => tirarCamada(c.id)}
                  aria-label={`tirar a camada ${i + 1}`}
                  style={{
                    marginLeft: 'auto', padding: '5px 10px', borderRadius: 4,
                    lineHeight: 1, cursor: 'pointer', background: 'transparent',
                    border: `1px solid ${t12}`, color: t45, font: `12px ${MONO}`,
                  }}>×</button>
              </div>
            )}
            <ErrorBoundary>
              <Tocar
                key={`${geracao}-${c.id}`}
                onGravado={onGravado}
                modo={modo}
                ligada={c.ligada}
                /* Quem grava áudio é sempre a barra: um take, não N. As NOTAS ficam
                   por camada, porque nota é de quem tocou — áudio é da soma. */
                semGravacao
                estadoInicial={c.voz ?? undefined}
                onEstado={e => anotarVoz(c.id, e)}
              />
            </ErrorBoundary>
          </div>
        ))}
      </div>

      {/* ── barra fixa ────────────────────────────────────────────────
          Com três camadas empilhadas a página fica longa, e a faixa de ação some pra
          cima justo quando ela é mais necessária: gravar é o gesto que fecha a sessão.
          Por isso ela deixou de rolar com o conteúdo. O `padding` embaixo da grade é
          o que impede a barra de tapar a última camada. */}
      <div style={{ height: 78 }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
        borderTop: LINHA, background: 'rgba(8,11,7,0.94)',
        backdropFilter: 'blur(8px)',
        padding: `${ESP.sm}px ${ESP.md}px`,
        display: 'flex', alignItems: 'center', gap: ESP.md, flexWrap: 'wrap',
      }}>
        {camadas.length < MAX_CAMADAS && (
          <button
            type="button"
            onClick={addCamada}
            style={{
              padding: '10px 18px', borderRadius: 6, cursor: 'pointer',
              font: `700 11px ${MONO}`, letterSpacing: '0.16em',
              background: 'transparent', border: `1px solid ${t12}`, color: t45,
            }}>
            + SYNTH
          </button>
        )}

        <button
          type="button"
          onClick={gravarTudo}
          aria-pressed={rec === 'gravando'}
          disabled={rec === 'subindo'}
          style={{
            display: 'flex', alignItems: 'center', gap: ESP.xs,
            padding: '10px 22px', borderRadius: 6,
            cursor: rec === 'subindo' ? 'progress' : 'pointer',
            font: `700 11px ${MONO}`, letterSpacing: '0.16em',
            background: rec === 'gravando' ? ACESO_FRACO : 'transparent',
            border: `1px solid ${rec === 'gravando' ? ACESO : t25}`,
            color: rec === 'gravando' ? ACESO : t100,
            transition: TRANSICAO,
          }}>
          <span aria-hidden style={{
            width: 11, height: 11, borderRadius: rec === 'gravando' ? 2 : '50%',
            background: rec === 'gravando' ? ACESO : 'transparent',
            border: `1px solid ${rec === 'gravando' ? ACESO : t45}`,
          }} />
          {rec === 'gravando' ? `PARAR ${mm}`
            : rec === 'subindo' ? 'SUBINDO…'
              : grade ? 'GRAVAR TUDO' : 'GRAVAR'}
        </button>

        {/* salvar e abrir: a mesa, não o áudio. O take já virou arquivo no GRAVAR. */}
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && nome.trim()) void salvarMesa() }}
          placeholder="nome da mesa"
          aria-label="nome da mesa"
          style={{
            width: 150, padding: '9px 10px', borderRadius: 4,
            background: 'transparent', border: LINHA, outline: 'none',
            font: `11px ${MONO}`, color: t100,
          }}
        />
        <button
          type="button"
          onClick={() => void salvarMesa()}
          disabled={!nome.trim() || salvando}
          style={{
            padding: '10px 16px', borderRadius: 6,
            cursor: nome.trim() && !salvando ? 'pointer' : 'default',
            font: `700 11px ${MONO}`, letterSpacing: '0.16em',
            background: 'transparent',
            border: `1px solid ${nome.trim() ? t25 : t12}`,
            color: nome.trim() ? t70 : t25,
          }}>
          {salvando ? 'SALVANDO…' : 'SALVAR'}
        </button>
        <button
          type="button"
          onClick={() => { setGaveta(g => !g); if (!gaveta) void listarMesas() }}
          aria-expanded={gaveta}
          style={{
            padding: '10px 16px', borderRadius: 6, cursor: 'pointer',
            font: `700 11px ${MONO}`, letterSpacing: '0.16em',
            background: gaveta ? ACESO_FRACO : 'transparent',
            border: `1px solid ${gaveta ? ACESO : t12}`, color: gaveta ? ACESO : t45,
          }}>
          ABRIR
        </button>

        <span style={{ font: `10px ${MONO}`, color: t45 }}>
          {rec === 'erro' ? erro
            : recado ? recado
              : rec === 'ok' ? 'take no acervo'
                : `${camadas.filter(c => c.ligada).length} de ${camadas.length} no ar`}
        </span>

        {/* A lista sobe da própria barra: gaveta que nasce longe do botão faz procurar. */}
        {gaveta && (
          <div style={{
            position: 'absolute', bottom: '100%', left: ESP.md, marginBottom: ESP.xs,
            width: 320, maxHeight: 260, overflowY: 'auto',
            border: LINHA, borderRadius: 6, background: 'rgba(8,11,7,0.98)',
          }}>
            {salvas.length === 0 ? (
              <div style={{ padding: ESP.sm, font: `11px ${MONO}`, color: t45 }}>
                nenhuma mesa salva ainda
              </div>
            ) : salvas.map(m => (
              <button
                key={m.nome}
                type="button"
                onClick={() => void abrirMesa(m.nome)}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: ESP.sm, width: '100%',
                  textAlign: 'left', padding: '8px 10px', cursor: 'pointer',
                  background: 'transparent', border: 'none', borderBottom: LINHA,
                  font: `11px ${MONO}`, color: t100,
                }}>
                <span style={{ flex: 1 }}>{m.nome}</span>
                <span style={{ font: `10px ${MONO}`, color: t45 }}>
                  {m.camadas} camada{m.camadas === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
