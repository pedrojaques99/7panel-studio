/**
 * Uma camada da mesa. Composta com peças do design system (VintageKnob, VintageLed,
 * Popover+Command), sem criar componente base.
 *
 * O que aparece depende do estado (AUDIT-UI-era6.md):
 * - vazia (sem sample): só a linha do cabeçalho, sem knob morto na tela
 * - com sample e sem foco: os 6 knobs essenciais
 * - focada: os 12 knobs. Clicar no cabeçalho da camada foca.
 * Knob com drift ligado aparece sempre: estado escondido parece perda de dado.
 *
 * Botão direito no knob liga o drift (igual ao DronePanel). No pan, o drift é a órbita L↔R.
 * O contador no cabeçalho ensina o gesto, que não tem afordância nativa
 * (EXCEÇÃO ao ruido-scan/ensina-a-usar).
 *
 * Cada tipo (textura, melodia, percussão) tem o próprio jogo de knobs; a percussão ganha a
 * fileira de passos (PLANO-tipos-camada-era6.md).
 */
import { useMemo, useState } from 'react'
import { Dice5, Music2, Orbit, Shuffle, TriangleAlert } from 'lucide-react'
import { VintageKnob } from '@/components/ui/vintage-knob'
import { VintageLed } from '@/components/ui/vintage-led'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { FAIXA, ESCALAS, MANUAL, NOMES_NOTA, alternarPasso, alternarCelula, escreverNota, padraoPerc, type Deriva, type NomeParam, type ParamsCamada, type TipoCamada, type NotaFrase } from './modelo'
import { GradeMelodia } from './GradeMelodia'
import type { ItemBanco } from './motor'
import { estilo } from './estilo'
import { SeletorTipo } from './SeletorTipo'
import { Passos } from './Passos'

const KNOBS: Record<TipoCamada, { essenciais: NomeParam[]; avancados: NomeParam[] }> = {
  textura: { essenciais: ['nivel', 'pitch', 'dens', 'tam', 'pos', 'lp'], avancados: ['spray', 'jitter', 'rev', 'pan', 'centro', 'respira'] },
  melodia: { essenciais: ['nivel', 'raiz', 'escala', 'notas', 'salto', 'notaDur'], avancados: ['ataque', 'bpm', 'pitch', 'pos', 'lp', 'centro', 'pan', 'respira'] },
  percussao: { essenciais: ['nivel', 'pulsos', 'passos', 'giro', 'prob', 'decai'], avancados: ['bpm', 'fatias', 'humano', 'pitch', 'lp', 'centro', 'pan'] },
}
// melodia escrita: notes/leap/length não valem (quem decide é a grade); o tempo da grade é o bpm
const KNOBS_FRASE = { essenciais: ['nivel', 'raiz', 'escala', 'bpm', 'ataque', 'lp'] as NomeParam[], avancados: ['pitch', 'pos', 'centro', 'pan', 'respira'] as NomeParam[] }
// escolha (raiz, escala, bpm, tamanho do padrão) não anda sozinha: harmonia e tempo mudam só pela mão
const SEM_DRIFT = new Set<NomeParam>(['nivel', 'respira', 'jitter', 'raiz', 'escala', 'bpm', 'passos', 'fatias', 'mascara'])
// o banco etiqueta em PT; a tela fala inglês
const TIPO_EN: Record<string, string> = { textura: 'texture', ruido: 'noise', tonal: 'tonal', transiente: 'transient' }

export function SeletorSample({ itens, atual, onEscolher, vazio = 'choose sample' }: {
  itens: ItemBanco[]; atual: string | null; onEscolher: (id: string | null) => void; vazio?: string
}) {
  const [aberto, setAberto] = useState(false)
  const grupos = useMemo(() => {
    const g = new Map<string, ItemBanco[]>()
    for (const it of itens) g.set(it.fonte, [...(g.get(it.fonte) ?? []), it])
    return [...g.entries()]
  }, [itens])
  const it = itens.find(i => i.id === atual)
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()}
          style={{ ...estilo.botao(!!atual), minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <Music2 size={12} style={{ flexShrink: 0 }} />
          {it ? (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--vintage-text-muted)' }}>{it.fonte} </span>{it.id.split('/')[1]}
            </span>
          ) : <span style={{ color: 'var(--vintage-text-muted)' }}>{vazio}</span>}
          {it?.licenca.startsWith('⚠') && (
            <TriangleAlert size={11} aria-label="check license before release" style={{ color: 'var(--vintage-meter-yellow)', flexShrink: 0 }} />
          )}
        </button>
      </PopoverTrigger>
      {/* a lista do banco só existe aberta: fechada, montar centenas de itens a cada render travava a mesa */}
      {aberto && <PopoverContent align="start" className="w-96 border-vintage-border bg-vintage-surface-2 p-0 text-vintage-label">
        <Command className="bg-transparent">
          <CommandInput placeholder="search: rain, vhulto, noise, D#" className="text-vintage-label" />
          <CommandList className="max-h-96">
            <CommandEmpty>nothing in the bank</CommandEmpty>
            {atual && (
              <CommandGroup heading="current">
                <CommandItem value="__tirar" onSelect={() => { onEscolher(null); setAberto(false) }}>remove sample</CommandItem>
              </CommandGroup>
            )}
            {grupos.map(([fonte, lista]) => (
              <CommandGroup key={fonte} heading={fonte}>
                {lista.map(i => (
                  <CommandItem key={i.id} value={`${i.id} ${i.tipo} ${TIPO_EN[i.tipo] ?? ''} ${i.nota}`}
                    onSelect={() => { onEscolher(i.id); setAberto(false) }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.id.split('/')[1]}</span>
                    <span style={{ ...estilo.rotulo, fontSize: 9, display: 'flex', gap: 8 }}>
                      <span>{TIPO_EN[i.tipo] ?? i.tipo}</span><span>{i.nota}</span><span>{Math.round(i.dur_s)}s</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>}
    </Popover>
  )
}

function Knob({ p, params, derivas, size, onParam, onDeriva }: {
  p: NomeParam; params: ParamsCamada; derivas: Record<NomeParam, Deriva>; size: number
  onParam: (p: NomeParam, v: number) => void; onDeriva: (p: NomeParam, d: Deriva) => void
}) {
  const f = FAIXA[p]
  const d = derivas[p]
  return (
    <div style={{ display: 'grid', justifyItems: 'center' }}
      onContextMenu={e => { e.preventDefault(); if (!SEM_DRIFT.has(p)) onDeriva(p, { ...d, ligada: !d.ligada }) }}>
      <VintageKnob label={f.rotulo} min={f.min} max={f.max} log={f.log} value={params[p] ?? 0} size={size} fmt={f.fmt}
        accent={d?.ligada ? 'var(--vintage-accent)' : 'var(--vintage-value)'} onChange={v => onParam(p, v)} />
      <span style={{
        width: 5, height: 5, borderRadius: 5, marginTop: 2,
        background: d?.ligada ? 'var(--vintage-accent)' : 'transparent',
        boxShadow: d?.ligada ? '0 0 6px var(--vintage-accent-glow)' : 'none',
      }} />
    </div>
  )
}

export function FaixaCamada({ indice, tipo, params, derivas, sample, itens, focada, piscando, passoAtual, onTipo, onParam, onDeriva, onSample, onFocar, onSortear, onAleatorio,
  frase, passoFrase, gravandoFrase, encaixe, onEncaixe, onFrase, onRecFrase, onPrevia }: {
  indice: number
  tipo: TipoCamada
  passoAtual: number
  onTipo: (t: TipoCamada) => void
  frase: NotaFrase[]
  passoFrase: number
  gravandoFrase: boolean
  encaixe: boolean
  onEncaixe: () => void
  onFrase: (f: NotaFrase[]) => void
  onRecFrase: () => void
  onPrevia: (grau: number) => void
  params: ParamsCamada
  derivas: Record<NomeParam, Deriva>
  sample: string | null
  itens: ItemBanco[]
  focada: boolean
  piscando: boolean
  onParam: (p: NomeParam, v: number) => void
  onDeriva: (p: NomeParam, d: Deriva) => void
  onSample: (id: string | null) => void
  onFocar: () => void
  onSortear: () => void
  onAleatorio: () => void
}) {
  const { essenciais, avancados } = tipo === 'melodia' && frase.length ? KNOBS_FRASE : KNOBS[tipo]
  // só conta o drift dos knobs deste tipo: o dos outros tipos fica guardado, mas não aparece
  const drifts = [...essenciais, ...avancados].filter(p => derivas[p]?.ligada)
  const avancadosVisiveis = focada ? avancados : avancados.filter(p => derivas[p]?.ligada)
  const knobs = sample ? [...essenciais, ...avancadosVisiveis] : []
  const resumo = tipo === 'melodia' ? `${NOMES_NOTA[params.raiz % 12]} ${ESCALAS[params.escala]?.nome ?? ''}`
    : tipo === 'percussao' ? `${Math.round(params.bpm)} bpm` : null
  return (
    <section onClick={onFocar} aria-current={focada || undefined}
      style={{ ...estilo.painel, borderColor: focada ? 'var(--vintage-value)' : 'var(--vintage-border)', padding: sample ? 10 : '6px 10px', gap: 8, cursor: focada ? 'default' : 'pointer' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <VintageLed color="orange" size="sm" active={piscando} />
        <span style={{ ...estilo.rotulo, width: 14, color: focada ? 'var(--vintage-value)' : undefined }}>{indice + 1}</span>
        <SeletorTipo tipo={tipo} onTipo={onTipo} />
        <SeletorSample itens={itens} atual={sample} onEscolher={onSample} />
        {sample && resumo && <span style={{ ...estilo.rotulo, fontSize: 9, color: 'var(--vintage-value)', whiteSpace: 'nowrap' }}>{resumo}</span>}
        {sample && (
          <span title="right-click any knob to let it drift on its own. On pan, drift orbits left and right. Not on level, detune or swell."
            style={{ ...estilo.rotulo, fontSize: 9, display: 'inline-flex', alignItems: 'center', gap: 4, color: drifts.length ? 'var(--vintage-accent)' : 'var(--vintage-text-dim)' }}>
            <Orbit size={12} /> {drifts.length ? `${drifts.length} drift` : 'drift'}
          </span>
        )}
        <button type="button" className="era6-foco" aria-label="random sample"
          title={tipo === 'melodia' ? 'random tonal sample' : tipo === 'percussao' ? 'random transient sample' : 'random sample (texture or noise)'}
          onClick={e => { e.stopPropagation(); onSortear() }} style={estilo.botaoIcone()}><Dice5 size={13} /></button>
        {sample && focada && (
          <button type="button" className="era6-foco" title="randomize this layer's knobs (level stays)" aria-label="randomize knobs"
            onClick={e => { e.stopPropagation(); onAleatorio() }} style={estilo.botaoIcone()}><Shuffle size={13} /></button>
        )}
      </div>
      {sample && tipo === 'melodia' && (
        <GradeMelodia frase={frase} raiz={params.raiz} escala={params.escala} atual={passoFrase} gravando={gravandoFrase} encaixe={encaixe} onEncaixe={onEncaixe}
          onAlternar={(k, g) => onFrase(alternarCelula(frase, k, g))}
          onEscrever={(k, g, len) => onFrase(escreverNota(frase, k, g, len))}
          onLimpar={() => onFrase([])} onRec={onRecFrase} onPrevia={onPrevia} />
      )}
      {sample && tipo === 'percussao' && (
        <Passos padrao={padraoPerc(params)} atual={passoAtual} manual={params.mascara >= MANUAL}
          onAlternar={k => onParam('mascara', alternarPasso(params, k))} />
      )}
      {knobs.length > 0 && (
        // os knobs não focam a camada: girar um knob não pode trocar a camada da mão/XY
        <div onClick={e => e.stopPropagation()}
          style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${focada ? 70 : 60}px, 1fr))`, gap: '4px 6px' }}>
          {knobs.map(p => (
            <Knob key={p} p={p} params={params} derivas={derivas} size={focada ? 52 : 44} onParam={onParam} onDeriva={onDeriva} />
          ))}
        </div>
      )}
    </section>
  )
}
