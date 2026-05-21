import React from 'react'

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{
          padding: 20, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)',
          color: 'var(--status-err)', fontSize: 'var(--fs-sm)', textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Erro no painel</div>
          <div style={{ color: 'var(--text-40)', fontSize: 'var(--fs-xs)' }}>{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 8, padding: '4px 12px', borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--status-err)', background: 'transparent',
              color: 'var(--status-err)', cursor: 'pointer', fontSize: 'var(--fs-xs)',
            }}
          >Tentar novamente</button>
        </div>
      )
    }
    return this.props.children
  }
}
