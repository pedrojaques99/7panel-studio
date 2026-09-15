# PLAN: linha do tempo de arranjo — uma tela, um eixo, com zoom

> Substitui `Timeline.tsx` (1 ciclo) **e** `GradeArranjo.tsx` (8 casas × 8 ciclos)
> por uma linha do tempo só, do começo ao fim da peça, com zoom contínuo.
> Pesquisa de libs e os números que sustentam as escolhas: `PESQUISA-linha-do-tempo.md`.
> Áudio (`wavesurfer.js` no `.wav`) é a **fase 5**, fora do caminho crítico.

## A tese em uma frase

As duas telas de hoje **já são a mesma tela em dois níveis de zoom** — a grade é
a peça a 64 ciclos, a timeline é a peça a 1 ciclo — e o que faltava entre elas
era só a escala. Então não se escreve um componente novo: importa-se a escala.

```
                       zoom out ◄──────────────► zoom in
  o que se vê:      blocos de casa           eventos do queryArc
  o que era:        GradeArranjo.tsx         Timeline.tsx
  a fonte:          .mask() do texto         padrão avaliado
```

## As libs, e o limite de cada uma

| dep | dl/semana | faz | **não** faz |
|---|---|---|---|
| `d3-scale` | 40,2 M | `ciclo ↔ px`, `invert()` | não desenha nada |
| `d3-zoom` | 17,1 M | roda/pinça/arrasto, âncora no cursor, `scaleExtent`, `translateExtent` | não desenha nada |

O desenho continua sendo o canvas que já existe — que já está certo: fora do
React, camada estática em cache, degradação declarada. Nenhum componente novo do
design system; tudo de `fabrica/ui.ts`, como as duas telas que ele substitui.

`+2 deps` (`@types/d3-scale`, `@types/d3-zoom` em dev). Nada de `wavesurfer`
nesta fase.

---

## Passo 0 — Classificação de superfície

| Região | Classe | Variável de negócio | Persuasão |
|---|---|---|---|
| Faixas de evento e blocos de casa | **B** | arranjos ouvidos por hora | ruído |
| Régua (casa · compasso · m:ss) | **B** | segundos até saber ONDE a peça está | ruído |
| Agulha do relógio | **B** | compassos que o dono não conta de cabeça | ruído |
| Minimapa + retângulo do viewport | **B** | voltas perdidas procurando o trecho | ruído |
| **Clicar/pintar casa** (reescreve o `.js`) | **C** | take não perdido | irrelevante |
| **Aviso "editado, não aplicado"** | **C** | a timeline não pode mentir sobre o que toca | irrelevante |
| **Degradação por orçamento** (grade congela) | **C** | idem | irrelevante |

As três linhas C são o plano. As B são consequência.

---

## A decisão difícil: buffer × tocando

Hoje isso é resolvido por **serem duas telas**, e está escrito nos dois arquivos:

```
GradeArranjo  ← code          (buffer do editor; funciona antes do 1º play)
Timeline      ← strudel.code  (o que SOA; eventos precisam do padrão real)
```

Fundir sem decidir isto é o jeito de nascer com o bug que `relogio.ts` existe
pra impedir, um andar acima. A regra deste plano:

- **forma** (casas, rótulos, número de camadas) vem do **buffer** — é texto, e
  tem que funcionar com o som parado;
- **eventos** vêm do **tocando** — é o único padrão que existe avaliado;
- quando os dois divergem, **a tela diz isso**: as casas do buffer desenham
  **vazadas** em vez de preenchidas e a régua escreve `editado · ctrl+enter`.
  Nunca se escolhe uma das duas em silêncio.

Isso é a espinha 9 (*a UI não pode mentir pro banco*) na sua forma de áudio: o
único jeito de a tela estar errada é ela afirmar que sabe o que não sabe.

---

## Arquitetura — três arquivos, e só o terceiro toca em React

```
src/musica/
  escala.ts          puro   ciclo↔px, faixa visível, nível de detalhe   ← testável sem DOM
  consulta.ts        puro   cache de eventos por (camada, ciclo) + orçamento
  LinhaDoTempo.tsx   canvas + d3-zoom + os gestos
```

`camadas.ts` e `relogio.ts` **não mudam**. Tudo que a nova tela precisa já está
exportado lá: `arranjoDoTake`, `casasDaCamada`, `alternarCasa`, `sincronizarGrade`,
`removerCasa`, `gradeDoTake`, `detectarCamadas`, `cicloAgora`, `casaAgora`,
`duracaoDoArranjo`, `mmss`. Escrever um segundo detector aqui recriaria a
duplicação que aqueles dois arquivos existem pra ter apagado.

### `escala.ts` — o eixo

```ts
domínio  = [0, arranjo.casas * arranjo.porCasa]   // 64 ciclos, no padrão
alcance  = [GUTTER, largura]
```

`scaleExtent`: **`[1, casas * porCasa]`**. Não é número mágico — `k = 1` é "a peça
inteira cabe" e `k = 64` é "um ciclo ocupa a tela", que é **exatamente a
`Timeline.tsx` de hoje**. A tela antiga vira o fim do curso do zoom.

`translateExtent` prende nos dois extremos: não dá pra empurrar a peça pra fora
da tela. É o que separa uma timeline de um `transform: scale()`.

### Nível de detalhe — a regra que funde as duas telas

Medido em **px por ciclo** (`k` normalizado pela largura), não em `k` cru, senão
a tela troca de comportamento ao redimensionar a janela:

| px por ciclo | desenha | custo de consulta |
|---|---|---|
| `< 6` | só blocos de casa (a `.mask()`) | **zero** — é texto |
| `6 – 40` | casa preenchida + densidade de evento por ciclo | 1 consulta por ciclo visível |
| `> 40` | cada evento como retângulo, igual hoje | idem |

O ganho não é só visual: **nunca se consultam 64 ciclos**. Zoom aberto não
consulta nada; zoom fechado tem poucos ciclos na tela. A explosão que mataria
uma `vis-timeline` (10 mil `<div>`) simplesmente não acontece.

### `consulta.ts` — orçamento, não torcida

Cache `Map<camada, Map<ciclo, Evento[]>>`, invalidado quando o padrão avaliado
muda. Herda os dois acertos da `Timeline.tsx` atual, que não se joga fora:

- teto de **400 eventos** por ciclo;
- **orçamento por quadro**: gastou mais que um quadro consultando, para de
  consultar e a régua escreve `grade parcial` — porque uma grade que parou de
  acompanhar sem avisar é a timeline mentindo. A agulha **continua andando**:
  ela lê o relógio, não a consulta.

Diferença pro de hoje: em vez de congelar a peça inteira num ciclo (`v.pesado`),
congela **por ciclo**, e os ciclos que já couberam no orçamento continuam certos.

---

## Fases

Cada uma é um commit que roda. A tela velha só morre na 4.

| # | entrega | como se verifica |
|---|---|---|
| **0** | `npm i d3-scale d3-zoom` + tipos; `escala.ts` + `escala.test.ts` | vitest: `invert(scale(c)) === c`; `k=1` mostra 64 ciclos; `k=máx` mostra 1; `translateExtent` não deixa sair |
| **1** | `consulta.ts` + teste | cache não reconsulta ciclo repetido; estoura orçamento → devolve parcial e **marca** |
| **2** | `LinhaDoTempo.tsx` **só leitura**: régua, faixas, LOD, agulha, minimapa, zoom/pan | montada ao lado das duas velhas, atrás de um botão. Comparação lado a lado: mesma casa acesa, mesmo instante |
| **3** | escrita: clique/arrasto pintando casa (`alternarCasa` + `sincronizarGrade` no mesmo edit), mudo/solo/fx/sample da camada | `GradeArranjo.test.tsx` e `Timeline.test.tsx` reapontados pra nova e passando sem mudar as asserções |
| **4** | troca em `Musica.tsx`; **apaga** `Timeline.tsx` e `GradeArranjo.tsx`; migra os testes | `npm run test` verde, incluindo `patterns.test.ts` intocado |
| **5** | *(separada)* `wavesurfer.js` + `@wavesurfer/react` no `.wav` — onda, minimapa, regiões nos marcos Fibonacci | fora deste plano |

A fase 2 existir separada da 3 é o ponto do plano: **ver antes de mexer**. Se a
leitura nova discordar da grade velha em qualquer instante, o erro aparece com as
duas na tela — que é como o bug do `casa 2/8` foi pego da primeira vez.

## Gestos (vocabulário de Premiere/FL, nada inventado)

| gesto | faz |
|---|---|
| roda | zoom ancorado no cursor |
| shift + roda, ou arrastar o fundo | pan |
| arrastar no minimapa | move o viewport |
| clique na casa | alterna (escreve no `.js`) |
| arrastar sobre casas | pinta, modo travado pela primeira célula (Ableton/Logic) |
| clique no nome da camada | mudo |
| alt + clique na faixa | só ela |
| `0` / duplo-clique no fundo | volta pra peça inteira |

`pointerdown`, não `click` — o toque acontece quando o dedo encosta. É o que a
`GradeArranjo` já faz e o plano não regride.

## O que este plano NÃO é

Sem arrastar evento pra mudar o tempo dele (a `.mask()` só sabe 0 e 1 — interface
que sugere mais do que o formato aceita mente sobre o instrumento). Sem trilha de
automação, sem corte, sem crossfade, sem cor por camada, sem `wavesurfer` nesta
fase, sem componente novo no design system, sem tocar em `camadas.ts`,
`relogio.ts` ou `patterns.test.ts`.

## Riscos, com a saída de cada um

| risco | saída |
|---|---|
| buffer × tocando divergem e a tela escolhe em silêncio | regra escrita acima; teste na fase 2 com os dois textos diferentes |
| consulta de muitos ciclos trava o agendador do som | LOD (zoom aberto = zero consulta) + orçamento por quadro herdado |
| `d3-zoom` briga com o `ResizeObserver` na largura | `escala.ts` recebe largura como argumento; o transform é reaplicado, não recalculado |
| take sem `.mask()` (arranjo nulo) | domínio cai pra 8 ciclos e o LOD nunca sai do modo evento — degradação, não tela em branco |
| perder um gesto da `GradeArranjo` na migração | fase 3 reaponta os testes ANTES de apagar (fase 4) |

---

# ESTADO — construído em 2026-09-10

Fases 0–3 feitas; a **4 (apagar as velhas) foi deliberadamente NÃO feita**. A
`LinhaDoTempo` é a vista padrão e as duas clássicas continuam inteiras, a um
clique no botão `↩ vista clássica` (lembrado em `localStorage`). Elas são feias
— é por isso que a nova existe — mas a sincronia delas é o que funciona hoje.

| arquivo | linhas | o que é |
|---|---|---|
| `src/musica/escala.ts` | ~190 | puro: ciclo↔px, LOD, enquadrar. **18 testes** |
| `src/musica/consulta.ts` | ~190 | cache por (camada, ciclo) + orçamento. **15 testes** |
| `src/musica/LinhaDoTempo.tsx` | ~830 | canvas + d3-zoom + gestos. **14 testes** |
| `src/musica/Musica.tsx` | +50 | o interruptor entre as duas vistas |

`npm run test`: **377 passando**, incluindo `patterns.test.ts` e os testes das
duas telas velhas, intocados. `tsc` e `eslint` limpos nos arquivos novos.

## Medido no navegador, não suposto

- zoom trava exatamente em **1.0×** (peça inteira) e **64.0×** (um ciclo na tela
  — a `Timeline.tsx` de hoje). `scaleExtent` fazendo o que o plano dizia.
- a roda **não rola a página**: o `d3-zoom` consome o evento.
- o desenho bate com o `//` do take: `bumbo ● ● ● ● ● · ● ●` mostra o buraco na
  casa 6 no lugar certo.

## Dois defeitos achados olhando, não lendo

1. **canvas remontado ficava morto.** O rAF e o `d3-zoom` estavam presos em
   `[aberta]` e liam `telaRef.current`; quando o take recarrega, `n` cai a zero
   por um render e o `<canvas>` é destruído e recriado. Nenhum dos dois effects
   re-rodava. Conserto: o nó vem por **callback ref em estado**, então "o canvas
   trocou" virou dependência de verdade.
2. **tamanho era animação.** O canvas só ganhava dimensão dentro do rAF — e o
   rAF **não dispara em aba de fundo** (medido: 0 quadros em 800 ms com
   `document.hidden`). A tela ficava nos 300×150 de fábrica e o `width:100%`
   esticava pelo aspect-ratio até um bloco vazio de 847px. Conserto: altura vem
   do React e um quadro **síncrono** desenha na montagem.

## Dívida conhecida, não escondida

**Acessibilidade.** A `GradeArranjo` dá `role="gridcell"` e
`aria-label="bumbo, casa 3 de 4"` por casa, com foco por teclado. A nova é
canvas: tem zoom e navegação por teclado (`0`, `+`, `-`, setas), mas **não tem
alvo por casa pro leitor de tela nem foco célula a célula**. É regressão real e
é o motivo mais forte pra `GradeArranjo` continuar montável. Fechar isso pede
uma camada de elementos invisíveis sobre o canvas — trabalho de verdade, não
ajuste.

**Não coberto por teste, por honestidade:** o desenho (jsdom não tem
`getContext`), a agulha (precisa de relógio de áudio) e o aviso
`editado · ctrl+enter` (é pintado). Está escrito no cabeçalho do teste.
