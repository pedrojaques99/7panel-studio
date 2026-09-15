# Auditoria — src/musica

## Superfícies

Uma linha por tela. **Preencha antes de consertar qualquer coisa.** Classificar
depois de mexer é justificar o que já foi feito.

- **A aquisição** — quem não é cliente ainda. Persuadir, provar, converter.
- **B trabalho** — quem usa todo dia. Velocidade, densidade, teclado.
- **C confiança** — dinheiro, permissão, ação destrutiva. Não pode mentir.

Aplicar instinto de A numa tela B é o erro mais caro do frontend Visant.

| Arquivo | Superfície (A/B/C) | Variável de negócio que move | Notas |
|---|---|---|---|
| src/musica/Musica.tsx | B | iterações ouvidas por hora — o loop escrever→ouvir→corrigir | Casca de 3 colunas. Cabeçalho de 40px e UM primário (SALVAR), que só existe quando há mudança não salva. Teclado na ordem de guarda: Ctrl+Enter toca, Ctrl+S salva, Ctrl+. para, espaço toca fora de campo. |
| src/musica/Repertorio.tsx | B | segundos até achar o take certo entre N músicas | Busca é o único controle sempre aberto. Renomear/excluir atrás do ⋯. **Excluir é a ilha C**: confirma na linha e o backend move pra .trash/. |
| src/musica/Versoes.tsx | B | takes não perdidos por medo de editar | Ver uma versão não restaura, só carrega no editor. **Restaurar é a ilha C**: salva versão NOVA, então restaurar por engano também tem volta. |
| src/musica/diff.ts | B | proposta julgada em vez de ignorada | LCS de linhas pra faixa de proposta dizer "+4 −1". Diferença de conjunto contaria bloco movido como reescrita. |
| src/musica/Musica.estreito.test.tsx | B | as três colunas alcançáveis no celular | Guarda a regra que o navegador da ferramenta não consegue medir: abaixo de 860px sai a tira de abas e nenhuma coluna some. |

## Tela vista

Uma linha por tela ABERTA, com o que foi visto. Sem isto o portão não abre —
um AnimatePresence travado passa por tsc, ESLint, motion-lint, impeccable,
audit:design e copy-lint sem acender nada.

Cada linha carrega: rota, largura, estado do dado, e o que aconteceu.

- `/musica` · 1920×911 · **backend no ar, acervo com 2 músicas e 5 versões** ·
  Abriu direto na `take-01` (última da sessão anterior, guardada no localStorage).
  Editor CodeMirror com gutter e destaque, coluna de versões v4→v0 com autor e
  recado, transporte com bpm 122 lido da música. Console sem erro.
- **Editar → salvar, medido pelo DOM**: `execCommand('insertText')` no
  `.cm-content`, e então "não salvo" + `SALVAR` + `+ recado` aparecem (não existiam
  antes: um primário só, e só quando há o que salvar). Depois do clique em SALVAR,
  `v3` entra na coluna, o rótulo "não salvo" some e o botão SALVAR **deixa de
  existir** — em vez de ficar desabilitado.
- **Prévia de versão**: clique em `v0` carrega o código antigo no editor, o
  cabeçalho passa a dizer "vendo v0, editar aqui parte desta versão" e a linha
  oferece "restaurar como versão nova".
- **Restaurar (classe C), verificado no dado**: gerou `v4 · restaurado de v0` e as
  versões v0–v3 continuam na lista. A linha do tempo não perdeu elo nenhum.
- **Proposta do CLI**: `jam.py push` chegou na tela em ~1s e a faixa leu
  `claude · +2 −1 · hpf 320 no pad: tira o low e deixa o baixo dono do grave`,
  com OUVIR / ACEITAR / ✕. O `+2 −1` sai do LCS de linhas, não de diferença de
  conjunto.
- `/musica` · **backend PARADO** · Antes do conserto: centro dizia "nenhuma música
  ainda", com o acervo cheio. Depois: "não consegui falar com o backend, então não
  sei o que tem no acervo" + "tentar de novo", que ao subir o Flask repovoou o
  repertório sem recarregar a página.
- **390 px: medido pela metade, e é honesto dizer qual metade.** `resize_window`
  redimensiona a janela, mas a aba roda destacada (`outerWidth` volta `0`) e o
  viewport continuou 1920 — o mesmo artefato registrado na auditoria da
  `/fabrica`. O que deu pra medir de verdade: constringindo `#root` a 390px,
  `scrollWidth` do root fica **390, zero rolagem lateral da página**. Os dois
  `div` que aparecem com 440 são o layout de DESKTOP sendo espremido, porque
  `matchMedia` continua lendo 1920 — não é defeito a 390. O que a constrição NÃO
  prova é a media query, e por isso ela virou teste:
  `src/musica/Musica.estreito.test.tsx` fixa que abaixo de 860px sai a tira de
  abas e as três colunas se revezam (nenhuma some), e que no desktop a tira não
  existe. **Não avaliado**: legibilidade e alvo de toque num aparelho real.

## Achados

Cinco defeitos, todos encontrados **usando** a tela, nenhum deles pego por tsc,
build ou detector. Todos consertados nesta rodada.

1. **A tela mentia sobre o disco.** Depois de salvar, "não salvo" continuava
   aceso e o `SALVAR` nunca saía — o backend grava `code.rstrip() + '\n'` e a
   comparação crua nunca batia. É a espinha 9 (a UI não pode mentir sobre o
   banco) na forma mais barata de acontecer. Conserto: comparar sem o espaço do
   fim (`Musica.tsx`), verificado no navegador depois.
2. **Prévia de versão morria no mesmo quadro.** Carregar a `v0` escrevia no
   CodeMirror, o `updateListener` não distingue escrita de digitação, e o pai
   entendia "o usuário digitou" e saía da prévia. Conserto: marcar a escrita
   externa (`StrudelEditor.tsx`, `aplicandoExterno`).
3. **Comentário apagava o andamento.** Uma versão salva sem bpm gravava `0`, e a
   tela abria em 120 uma música de 122. Conserto em dois lados, porque o dado
   ruim já estava no disco: a escrita herda o bpm anterior, e a leitura pula
   versão com bpm zero (`_ultimo_bpm`). Teste: `test_versao_sem_bpm_herda_o_andamento`
   e `test_historico_antigo_com_bpm_zero_nao_engana_a_tela`.
4. **Vazio silencioso: com o backend parado, a tela dizia "nenhuma música ainda".**
   Mentira — o acervo tem duas, e a tela ainda convidava a criar a terceira num
   backend que não responde. O erro real só aparecia num canto do transporte.
   Achado só porque o portão manda ver a tela com o backend PARADO. Conserto:
   três estados (carregando / falhou / vazio) em vez de dois, com a frase certa
   ("não consegui falar com o backend, então não sei o que tem no acervo") e um
   "tentar de novo" que recupera sem F5 — verificado nos dois sentidos, derrubando
   e subindo o Flask.

5. **`--bpm` do CLI era no-op silencioso** (achado da rodada anterior, na jam
   bridge): o feedback do painel sobrescrevia o bpm logo depois do push. Agora
   proposta escreve `prop_bpm`, aplicado só no aceite.

Detectores: `impeccable` zero, `copy` zero (39 strings), `ruído` zero.
`audit:design` não existe neste repo. Testes: 24 no backend (`test_songs.py` +
`test_jam_bridge.py`), 7 no front (`diff.test.ts`, `Musica.estreito.test.tsx`).

## Portão

```
impeccable  zero · copy  zero (41 strings) · ruído  zero
audit:design  PULADO — este repo não tem o script
tsc -b  limpo · eslint  limpo nos arquivos desta rodada
vitest  90 passando (9 arquivos) · pytest  24 passando (songs + jam)
vite build  ok
```

`use-knob-drag.ts` continua com 6 achados de `react-hooks/refs` — é anterior a
esta rodada e fora do alvo. Registrado para não passar por limpo.
