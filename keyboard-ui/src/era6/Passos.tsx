/**
 * Fileira de passos da camada de percussão. Aceso = pulso do padrão; o passo que está soando
 * ganha a borda de accent. Clicar liga/desliga o passo (o padrão vira "à mão"); girar pulses ou
 * rotate volta pro Euclides. Só tokens `--vintage-*`, sem peça do design system.
 */
import { estilo } from './estilo'

export function Passos({ padrao, atual, manual, onAlternar }: {
  padrao: boolean[]; atual: number; manual: boolean; onAlternar: (k: number) => void
}) {
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 3, alignItems: 'center' }}
      title="click a step to toggle it. Turning pulses or rotate goes back to euclid.">
      {padrao.map((on, k) => (
        <button key={k} type="button" aria-label={`step ${k + 1}`} aria-pressed={on} onClick={() => onAlternar(k)}
          style={{
            flex: 1, height: 14, padding: 0, cursor: 'pointer', minWidth: 0,
            // a cada 4 passos um respiro: dá pra contar o tempo de olho
            marginLeft: k && k % 4 === 0 ? 4 : 0,
            background: on ? (k === atual ? 'var(--vintage-accent)' : 'var(--vintage-value)') : 'transparent',
            border: `1px solid ${k === atual ? 'var(--vintage-accent)' : on ? 'var(--vintage-value)' : 'var(--vintage-border)'}`,
            opacity: on || k === atual ? 1 : 0.7,
          }} />
      ))}
      <span style={{ ...estilo.rotulo, fontSize: 9, width: 44, textAlign: 'right', color: manual ? 'var(--vintage-accent)' : 'var(--vintage-text-dim)' }}>
        {manual ? 'hand' : 'euclid'}
      </span>
    </div>
  )
}
