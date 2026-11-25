/* vocabulário visual da /era6: o mesmo da /mix e da /eq (variáveis vintage do index.css) */
export const estilo = {
  rotulo: {
    font: '500 10px/1 var(--font-vintage-mono, monospace)', letterSpacing: '0.16em',
    textTransform: 'uppercase', color: 'var(--vintage-text-muted)',
  } as React.CSSProperties,
  painel: {
    background: 'var(--vintage-surface-2)', border: '1px solid var(--vintage-border)',
    padding: 14, display: 'grid', gap: 10, alignContent: 'start',
  } as React.CSSProperties,
  botao: (ativo: boolean, desligado = false): React.CSSProperties => ({
    padding: '6px 10px', font: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
    background: ativo ? 'var(--vintage-surface-3)' : 'transparent',
    border: `1px solid ${ativo ? 'var(--vintage-value)' : 'var(--vintage-border)'}`,
    color: desligado ? 'var(--vintage-text-dim)' : ativo ? 'var(--vintage-value)' : 'var(--vintage-label)',
    cursor: desligado ? 'default' : 'pointer',
  }),
  // ícone sem borda: ação secundária não compete com o botão principal do painel
  botaoIcone: (ativo = false): React.CSSProperties => ({
    padding: 4, font: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'transparent', border: '1px solid transparent',
    color: ativo ? 'var(--vintage-value)' : 'var(--vintage-text-muted)', cursor: 'pointer',
  }),
  // o único botão cheio da tela: start/stop
  primario: (ligado: boolean, desligado = false): React.CSSProperties => ({
    padding: '8px 16px', font: '600 12px/1 var(--font-vintage-mono, monospace)', letterSpacing: '0.08em',
    display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase',
    background: desligado ? 'transparent' : ligado ? 'var(--vintage-surface-3)' : 'var(--vintage-accent)',
    border: `1px solid ${desligado ? 'var(--vintage-border)' : 'var(--vintage-accent)'}`,
    color: desligado ? 'var(--vintage-text-dim)' : ligado ? 'var(--vintage-accent)' : 'var(--vintage-surface-1)',
    cursor: desligado ? 'default' : 'pointer',
  }),
}

/*
 * Estilo inline não tem :hover nem :focus-visible. Estas poucas regras entram por um <style>
 * na raiz da /era6: anel de foco nos botões e ações que só aparecem no hover/foco do item.
 */
export const CSS_ERA6 = `
.era6 button:focus-visible, .era6 input:focus-visible { outline: 1px solid var(--vintage-accent); outline-offset: 2px; }
.era6 .era6-so-hover { opacity: 0; transition: opacity 120ms; }
.era6 .era6-item:hover .era6-so-hover, .era6 .era6-item:focus-within .era6-so-hover { opacity: 1; }
`
