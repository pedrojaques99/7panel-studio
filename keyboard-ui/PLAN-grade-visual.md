# PLAN: a grade de arranjo vira componente, e o desenho para de mentir

> Substitui o `PLAN-grade-arranjo.md`, que propunha tornar o comentário ASCII
> clicável dentro do CodeMirror. Aquele plano casava linha-do-desenho com
> camada-do-stack **pela ordem** — e o repertório real não respeita essa ordem.
> Medido: em `entropia.js` o desenho lista `bumbo` em 2º e o `stack` tem `fx` em
> 2º. Clicar no bumbo mudaria o fx, em silêncio, escrevendo no arquivo.

## Passo 0 — Classificação de superfície

| Região | Classe | Variável de negócio que move | Persuasão é |
|---|---|---|---|
| Grade (ler a forma da peça) | **B** | arranjos ouvidos por hora | ruído |
| Coluna acesa (casa tocando) | **B** | segundos até saber ONDE a peça está | ruído |
| **Alternar casa** (reescreve o `.js`) | **C** | take não perdido | irrelevante |
| **Normalização do repertório** (uma vez, 14 arquivos) | **C** | desenho que discorda do som | irrelevante |

## A raiz: quem é a fonte da verdade

Hoje o arranjo existe **duas vezes** — o desenho no comentário e a `.mask()` no
código — e as duas podem discordar sem ninguém perceber. Não dá pra apagar o
desenho (ele é como se lê a peça num diff, no git, fora do app) e não dá pra
apagar a máscara (é ela que toca). Então a raiz não é "apagar um", é **parar de
tratá-los como duas fontes**:

> **A `.mask()` é a única fonte da verdade dos VALORES.
> O desenho é derivado dela — só os `●`/`·` são reescritos.
> Rótulo e nota da linha são do autor e nunca são tocados.**

Por que não regenerar o desenho inteiro: o rótulo que `detectarCamadas` deriva
do sample seria `kick`, e o autor escreveu `bumbo`. E linhas têm nota no fim
(`a nuvem é a peça`). Regenerar tudo trocaria escrita humana por identificador
de máquina — perda real, em nome de uma consistência que só a coluna precisa.

## Como o pareamento deixa de ser adivinhação

Depois da normalização a regra é dura e verificável: **linha _n_ do desenho ↔
camada _n_ do `stack`.** O que garante isso não é confiança, é portão:

`patterns.test.ts` passa a exigir, em toda take com bloco `ARRANJO`:
1. nº de linhas do desenho == nº de camadas do `stack`;
2. as casas de cada linha == as casas da `.mask()` da camada de mesmo índice
   (camada sem `.mask()` == todas as casas ligadas).

Take que não bate **reprova o build**. É o que torna o desvio impossível de
voltar, e é a parte do plano que não é opcional.

### A normalização (uma vez, 14 arquivos)

Script propõe o pareamento casando o padrão de casas de cada linha com a máscara
de cada camada — que é único na maioria das takes. Onde houver empate ou sobra,
o script **para e lista**, e eu confiro a olho. Sem auto-aplicar palpite: é
escrita em arquivo de repertório.

## O componente `GradeArranjo.tsx`

Nível Apple, neste design system, não é brilho — é **precisão, contenção e
estado honesto**. `fabrica/ui.ts` é monocromático de propósito (um hue só,
significado carregado por PESO e PREENCHIMENTO). Então:

- **Casa acesa = preenchida** (`ACESO`), apagada = contorno `t12`. Nunca cor de
  estado — sobrevive a print em P&B e a daltonismo, que é a regra da casa.
- **Coluna tocando** marcada por um traço fino acima da coluna, derivado de
  `casaDoCiclo()` — o MESMO relógio (`@strudel/core` `getTime`) que a régua da
  `Timeline` lê. Duas vistas, uma derivação: não têm como discordar do instante.
- **O indicador anda fora do React.** Só uma coisa muda a 60 fps — qual coluna é
  "agora". A grade é estática em React; o traço é um elemento posicionado que um
  `rAF` move mutando `style`. Re-renderizar 40 células por quadro pra mover um
  traço é o erro que a `Timeline` já tinha resolvido com canvas.
- **Responde no `pointerdown`**, não no `click`: o toque acontece quando o dedo
  encosta. E **arrastar pinta**, com o modo travado pela primeira célula
  (ligar-ou-desligar decidido no início do gesto, como Ableton e Logic) — sem
  isso, desenhar 8 casas são 8 cliques.
- **Teclado**: setas movem, espaço alterna. A grade é uma matriz; navegação por
  matriz é o que um teclado espera dela.
- **Rodapé com a conta fechando o ciclo**: `8 × 8 = 64 comp. · 2:08 em 140 bpm`,
  vindo de `duracaoDoArranjo()` — o MESMO número que a linha `completa` do
  exportador mostra. A pessoa desenha a forma e vê a duração do arquivo mudar.

### O que o componente NÃO faz

Sem gain por casa, sem cor por camada, sem zoom, sem meia-opacidade pra "fade".
A `.mask()` só sabe **0 e 1** — interface que sugere mais do que o formato aceita
mente sobre o instrumento. Sem componente novo no design system: tudo sai de
`fabrica/ui.ts`.

### Recusa, não sanitização

Camadas com grades divergentes (`/8` com 8 casas vs `/4` com 6) não viram grade:
o componente diz quais camadas discordam e não desenha. Um take sem `.mask()`
nenhuma desenha a grade toda acesa e o primeiro clique CRIA a máscara, com as 8
casas herdando o que já tocava. Nunca "some": sumir esconde o recurso de quem
mais precisa dele.

## Escopo dos arquivos

- `camadas.ts`: `casasDaCamada`, `escreverCasas`, `alternarCasa`,
  `sincronizarGrade`, `gradeDoTake`, `PADRAO_ARRANJO`.
- `GradeArranjo.tsx`: o componente.
- `Musica.tsx`: monta a grade acima da `Timeline`, com o mesmo `onAplicar`.
- `scripts/normalizar-arranjo.mjs`: a passada única, com relatório.
- `camadas.test.ts` + `patterns.test.ts`: o portão.
