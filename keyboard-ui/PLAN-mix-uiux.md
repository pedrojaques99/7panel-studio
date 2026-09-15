# `/mix`: redesenho de interação (auditoria visant-killer, 2026-09-14)

> **Status (2026-09-14): implementado.** Decisões tomadas: Popover+Command do
> shadcn (instalados: `popover`, `command`, `dialog`, `button`), recomendação
> com histórico persistido no backend, tudo numa rodada só (A–F).
>
> | Parte | Arquivo |
> |---|---|
> | seletor de categoria (combobox) + JSX | `keyboard-ui/src/mix/Mix.tsx` |
> | heurística de sugestão + comparação de combo | `keyboard-ui/src/mix/modelo.ts` |
> | hover + entrada de camada (CSS, inline não faz `:hover`) | `keyboard-ui/src/index.css` |
> | combo salvo por música + contador de uso real (export) | `backend/mix_routes.py` (`/api/mix/camada-pick`, campo `uso` no `/api/mix/catalog`) |
> | primitivos instalados | `keyboard-ui/src/components/ui/{popover,command,dialog,button}.tsx` |
> | polyfills de teste (Radix/cmdk pedem no jsdom) | `keyboard-ui/src/test/setup.ts` (`ResizeObserver`, `scrollIntoView`) |
> | testes atualizados pro novo fluxo (popover em vez de chip direto) | `keyboard-ui/src/mix/Mix.test.tsx` |
>
> **Débito à parte, também consertado:** `test_render_recusa_tres_camadas` e
> `test_render_valida_camadas` (backend) já falhavam antes de eu mexer em nada — de um
> WIP anterior que subiu `MAX_CAMADAS` de 2 pra 12 sem atualizar esses dois testes.
> Atualizei os dois pra testar o teto de verdade (`MAX_CAMADAS + 1`, não um "3" arbitrário)
> e fiz o mesmo no equivalente do front (`Mix.test.tsx`). 180/180 backend, 544/544 front.

## O que a tela é hoje

`/mix` já implementada (`PLAN-rota-ambiente.md`), com o vocabulário vintage do
resto do studio (`VintageKnob`, `VintageLed`, tokens `--vintage-*` do
`index.css`). Abri a tela em `localhost:5174/mix` com o backend de pé (127
ambiências, 30+ músicas) pra ver de verdade, não só ler o código.

**Superfície: B (trabalho).** É o próprio usuário montando mix todo santo dia,
não alguém sendo convencido a usar. Variável de negócio: tempo até uma
combinação boa, e quantas vezes precisa exportar de novo por ter escolhido mal.

## Achados (confirmados em `arquivo:linha`, com print)

| # | Achado | Onde | Por quê incomoda |
|---|---|---|---|
| 1 | **Zero hover state** | todo `botao()`/`linha`/`paramCard` em `Mix.tsx:56-98` | são só `style` inline com `aria-pressed`; não existe `:hover` em lugar nenhum do arquivo nem no `index.css` pra essas classes. O mouse não avisa nada antes do clique — para uma tela B isso custa tempo, não estética |
| 2 | **Tudo visível de uma vez** | listas de música (`:369`) e ambiência (`:446`) renderizam **todas as linhas junto com todos os chips de categoria já abertos** (`:436-443`) | 127 ambiências + 12 categorias com contagem, todas na tela ao mesmo tempo, antes de o usuário pedir. É exibição, não hierarquia — o padrão "mostra tudo, deixa a pessoa achar" que o `ruido-scan` cataloga como ruído de cromo |
| 3 | **Densidade de rótulo sem hierarquia** | `rotulo` (`:56`) usado repetido em 6+ lugares por tela, sempre mesma caixa-alta/tamanho | cada seção grita igual; nada diz "isto é principal, isto é nota de rodapé" |
| 4 | **Sem componente dinâmico** | adicionar/tirar camada (`:346-349`, `:397-435`) aparece/some sem transição; contador de categoria é estático | toda mudança de estado é um corte seco — o "clica e já era" que o `visant-motion` chamaria de falta de affordance de mudança |
| 5 | **Zero filtro combinado / zero recomendação** | categorias fazem OR simples (`ambFiltrados`, `:194-199`); nada considera o que já está tocando | escolher a 4ª camada exige rolar a lista de 127 de novo, sem a tela sugerir o que combina com as 3 já escolhidas (papel lugar/textura, categoria ainda não usada, sem aviso de repetição) |
| 6 | **Rodapé fixo competindo** | `footer` (`:529-596`): transporte + timecode + vídeo + duração + formato + LED + preview + exportar, tudo na mesma linha, mesmo peso visual | numa janela de 1280px isso já embola (`flex-wrap`); em 390px (mobile) quebra em 3-4 linhas empilhadas sem prioridade |

Tela vista (390×824 e 1456×824, backend real, 127 ambiências, música
`heliosphan-ferro-*`): confirma 1, 2 e 6 a olho. Não achei estouro horizontal
nem texto cortado — os dois `overflow-y: auto` das listas seguram a rolagem
direito.

## O que NÃO muda

- **O vocabulário vintage continua.** `VintageKnob`, `VintageLed`, os tokens
  `--vintage-*`, a fonte mono, o preto de fundo — isso é o design system da
  casa, não "cara de IA". Redesenho aqui é de **interação**, não de skin.
- Duas camadas (lugar/textura), o knob em dB relativo ao limiar, os dois
  previews (browser vs. render) — decisões de produto já validadas, fora de
  escopo.

## Direção proposta

### A. Hover state (sem componente novo)
Adicionar regras `:hover` no `index.css` pros três estilos de botão
(`botao`, `botaoIcone`, `linha`) — muda **cor/borda**, nunca `scale` (proibido
pela própria skill). Reaproveita as variáveis `--vintage-*` que já existem
(`-surface-3` de fundo, `-value` de borda), então é CSS puro, zero biblioteca.

### B. Divulgação progressiva (a mudança que mais importa)
- Categoria vira **combobox de filtro** (tipo `cmdk`/`Popover`, se o registry já
  tiver — ver C) em vez de 12 chips sempre abertos. Mostra só os chips
  **ativos** fora do popover.
- Lista de ambiência abre **fechada por padrão**, com 3 seções sempre visíveis
  no topo: **sugeridas** (ver D), **usadas nesta música antes** (se houver
  histórico), **buscar/ver todas** (expande sob demanda). 127 itens de cara
  vira 5-8 até o usuário pedir mais.
- Mesma lógica pra música: grupo fecha, abre ao clicar — hoje todo grupo já
  vem aberto.

### C. Tags visíveis, sem inventar componente
Categoria de cada item já existe (`a.categorias`) — vira **pill** de verdade
(fundo, não só texto separado por `·`) ao lado do título, reaproveitando o
mesmo `botaoIcone` já usado nos filtros (mesmo componente, contexto diferente,
zero import novo).

### D. Recomendação — proposta de v1 sem backend novo
Heurística **100% client-side**, calculável a partir do que já vem no
catálogo:
1. papel que falta (se as camadas ativas são todas "lugar", sugere "textura" e
   vice-versa — mesma regra que `PAPEL` já aplica);
2. categoria ainda não usada nas camadas ativas;
3. sem aviso de repetição pra duração escolhida (reusa `avisos`, já calculado);
4. desempate por LUFS mais previsível (evita cama muito mais alta/baixa que o
   limiar).

Isso cobre "recomendações" sem tocar no backend. **Fica de fora da v1**, por
exigir persistência nova: "mais usada com essa música" / "combo salvo" — dá
pra fazer depois no mesmo padrão de `visual_picks.json`
(`backend/mix_routes.py:25`), um `camada_picks.json` por música, se topar.

### E. Rodapé com hierarquia
Agrupar por prioridade: **transporte + timecode** (sempre à esquerda, sempre
visível) — **duração/formato** (agrupados, um passo de configuração) —
**ação** (preview/exportar, sempre à direita, visualmente mais pesada que o
resto). Em 390px, duração/formato colapsam num único popover de "opções de
export" em vez de empilhar 6 grupos.

### F. Transição de estado (o "componente dinâmico" pedido)
Entrada/saída de `paramCard` ganha uma transição de opacidade/altura
(`transition: opacity, transform` com os tokens de duração do
`visant-motion`, nunca `scale` isolado); contador de categoria já é reativo
(`contagem[k]`), só falta o pill se redesenhar suave quando o número muda.

## Decisões que preciso de você antes de codar

1. **Filtro de categoria vira combobox/popover** — o registry já tem
   `Popover`/`Command` (shadcn)? Se não tiver, preciso instalar
   (`npx shadcn@latest add popover command`) antes de usar — aviso e uso o
   oficial, não invento um dropdown na mão.
2. **Recomendação v1 só heurística client-side (D)** — topa, ou já quer o
   histórico persistido (mais trabalho, toca o backend)?
3. **Escopo desta rodada**: A+B+C+E+F (interação, sem tocar backend) primeiro,
   D depois? Ou tudo junto?

## Arquivos que a implementação toca

| Parte | Arquivo |
|---|---|
| estilos/hover | `keyboard-ui/src/index.css` (novas regras `:hover`) |
| lógica + JSX | `keyboard-ui/src/mix/Mix.tsx` |
| tipos/heurística de sugestão | `keyboard-ui/src/mix/modelo.ts` |
| testes | `keyboard-ui/src/mix/Mix.test.tsx` |
| (se D virar persistente) | `backend/mix_routes.py`, novo `assets/camada_picks.json` |
