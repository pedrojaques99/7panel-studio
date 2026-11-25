/**
 * Painel da era6 com o avançado recolhido (AUDIT-UI-era6.md, peça aprovada em 2026-09-29).
 * Wrapper fino sobre o Collapsible do radix-ui (já instalado), com o visual vintage.
 * O essencial fica sempre à vista; o `avancado` abre num "more". O `resumo` fica no título,
 * então dá pra ler o estado do painel com ele fechado.
 *
 * - `manterMontado`: fechado só esconde (canvas que continua pintando não pode desmontar)
 * - `chave`: o aberto/fechado fica salvo no navegador (conveniência; sem storage, abre no padrão)
 */
import { useState } from 'react'
import { Collapsible } from 'radix-ui'
import { ChevronDown } from 'lucide-react'
import { estilo } from './estilo'

const lerAberto = (chave: string | undefined, padrao: boolean) => {
  if (!chave) return padrao
  try {
    const v = localStorage.getItem(`era6:aberto:${chave}`)
    return v === null ? padrao : v === '1'
  } catch { return padrao }
}

export function PainelRecolhivel({ titulo, resumo, acoes, avancado, children, abertoInicial = false, chave, manterMontado, rotulos = ['more', 'less'] }: {
  titulo: string
  resumo?: React.ReactNode
  acoes?: React.ReactNode
  avancado?: React.ReactNode
  children?: React.ReactNode
  abertoInicial?: boolean
  chave?: string
  manterMontado?: boolean
  rotulos?: [string, string]
}) {
  const [aberto, setAbertoUI] = useState(() => lerAberto(chave, abertoInicial))
  const setAberto = (v: boolean) => {
    setAbertoUI(v)
    if (chave) try { localStorage.setItem(`era6:aberto:${chave}`, v ? '1' : '0') } catch { /* sem storage: só não lembra */ }
  }
  return (
    <Collapsible.Root open={aberto} onOpenChange={setAberto} asChild>
      <section style={estilo.painel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
          <span style={estilo.rotulo}>{titulo}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>{resumo}</span>
          {acoes}
          {avancado && (
            <Collapsible.Trigger asChild>
              <button type="button" className="era6-foco" aria-label={aberto ? rotulos[1] : rotulos[0]}
                style={{ ...estilo.botaoIcone(aberto), gap: 4 }}>
                <span style={{ ...estilo.rotulo, fontSize: 9, color: 'inherit' }}>{aberto ? rotulos[1] : rotulos[0]}</span>
                <ChevronDown size={11} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
              </button>
            </Collapsible.Trigger>
          )}
        </div>
        {children}
        {avancado && (
          <Collapsible.Content forceMount={manterMontado || undefined}
            style={{ display: aberto ? 'grid' : 'none', gap: 10, borderTop: '1px solid var(--vintage-border)', paddingTop: 10 }}>
            {avancado}
          </Collapsible.Content>
        )}
      </section>
    </Collapsible.Root>
  )
}
