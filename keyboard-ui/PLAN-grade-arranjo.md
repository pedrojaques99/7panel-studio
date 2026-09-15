> **SUPERADO por `PLAN-grade-visual.md`.** A regra central deste plano — casar
> linha do desenho com camada do stack **pela ordem** — nao valia contra o
> repertorio real: 9 das 20 takes tinham ordens diferentes. Clicar no `bumbo`
> mudaria o `fx`, em silencio. Nao execute daqui.

# PLAN: grade de arranjo clicável + sync com a linha do tempo

> Hoje o arranjo de uma take existe **duas vezes**: como desenho ASCII no
> comentário e como `.mask("<...>/8")` no código. As duas podem discordar, e
> quando discordam ninguém percebe — você lê o desenho, decide pelo desenho, e
> o som é outro. Este plano apaga uma das duas: o desenho vira o controle.

## Passo 0 — Classificação de superfície (antes de desenhar, não depois)

| Região | Classe | Variável de negócio que move | Persuasão é |
|---|---|---|---|
| Grade clicável (as 8 linhas do comentário) | **B** | arranjos ouvidos por hora — o loop desenhar→ouvir→corrigir | ruído |
| Coluna acesa (casa que está tocando) | **B** | compassos que o dono não conta de cabeça | ruído |
| Casa na régua da linha do tempo (`casa 6/8`) | **B** | segundos até saber ONDE a peça está | ruído |
| **Alternar casa** (reescreve o `.js`) | **C** | take não perdido: o desenho nunca discorda do som | irrelevante |
| **Degradação `pesado`** (grade congelada) | **C** | a timeline não pode mentir sobre o que toca | irrelevante |

As duas linhas C são o motivo do plano. Alternar casa **escreve no arquivo** —
é escrita de dado, não interação. E a degradação existente congela a grade no
ciclo 0, que numa peça com máscara é o ciclo onde quase nada toca: a tela fica
vazia enquanto a música está cheia. Isso é a espinha 9 (*a UI não pode mentir
pro banco*) aplicada a áudio.

## O que este plano NÃO é

Sem knob de gain por casa, sem cor por camada, sem zoom, sem casa com meia
opacidade pra "fade", sem arrastar pra pintar várias casas. A `.mask()` só sabe
**0 e 1** — interface que sugere mais do que o formato aceita mente sobre o
instrumento. Sem componente novo de design system: tudo sai de `src/fabrica/ui.ts`,
o mesmo que a `Timeline.tsx` já usa (`ACESO`, `t100`, `t45`, `t12`, `MONO`).

## A decisão de forma: a grade mora no comentário

A grade **não** ganha painel, aba nem modo. As 8 linhas de comentário que a take
já tem viram alvo de clique **no lugar onde estão**, dentro do CodeMirror — como
o quadradinho de cor que o Xcode desenha em cima de um literal de cor.

Consequências, todas a favor:

- o `.js` continua sendo a verdade, versionado em git, aberto em qualquer editor;
- quem não usa a rota (o CLI, o `jam.py`, o próximo agente) lê o mesmo arquivo;
- **não existe representação a escolher**, então não existe representação errada;
- zero altura roubada do editor — a grade já ocupava essas linhas.

Custo honesto: take sem grade desenhada não ganha a interface. É aceitável — o
`README.md` de `patterns/` já exige grade em toda take com 3+ camadas, e o
portão `patterns.test.ts` já reprova quem não tem forma declarada.

## Como a casa vira máscara

Tradução literal, sem inferência: `●` = 1, `·` = 0, oito casas, `/8` = cada casa
dura 8 ciclos.

```
//   bumbo      ·    ·    ·    ●    ●    ●    ●    ·
     .mask("<0    0    0    1    1    1    1    0>/8")
```

O par (linha do desenho → camada do `stack`) **não é adivinhado por nome**. É
resolvido pela ordem em que as camadas aparecem no `stack`, usando o
`detectarCamadas()` de `camadas.ts` — o mesmo detector que a `Timeline.tsx` já
consome. Escrever um segundo parser aqui recriaria exatamente a duplicação que
este plano existe pra apagar.

Regra de **recusa, não de sanitização** (a mesma do `save`): grade cujo número de
linhas não bate com o número de camadas do `stack`, ou casa que não é `●`/`·`,
não vira interface — as linhas ficam texto morto e a régua diz por quê. Uma
grade que a gente adivinha é pior que uma grade que não clica.

## Escrita: o mesmo contrato do mudo

`camadas.ts` já reescreve código (`alternarMudo` põe um `.gain(0)` visível no
editor). A grade usa o mesmo caminho e a mesma promessa:

1. clicar alterna o caractere no comentário **e** o dígito na `.mask()`, no mesmo
   `reescrever()`, num edit só — nunca um sem o outro;
2. camada sem `.mask()` ganha uma no primeiro clique, com as 8 casas herdando o
   que o desenho já dizia;
3. **sem salvar e sem confirmar.** `Ctrl+Z` é a rede; `Ctrl+S` continua sendo só
   marcar versão. Diálogo em ação reversível é imposto por desconfiança;
4. reavaliação debounced no mesmo caminho do mudo — a escrita é no texto, o som
   vem da reavaliação, e nunca existe estado de arranjo fora do arquivo.

## A sync com a linha do tempo

As duas vistas olham escalas diferentes do mesmo relógio: a timeline mostra **um
ciclo**, a grade mostra **64** (8 casas × 8 ciclos). Elas precisam concordar
sobre o instante, e hoje não há nada ligando as duas.

### 1. Um relógio, uma derivação (sem estado novo)

`Timeline.tsx:310` já faz `const ciclo = Math.max(0, Math.floor(agora))` a partir
de `getTime()` do `@strudel/core` — que é `scheduler.now()`, a mesma fonte que o
agendador do som usa. A casa sai daí, por derivação pura:

```ts
export function casaDoCiclo(ciclo: number, casas = 8, porCasa = 8): number {
  return Math.floor(ciclo / porCasa) % casas
}
```

Mora em `camadas.ts`, ao lado de `faseDoCiclo` (`camadas.ts:426`) e `xDoCiclo`,
pelo mesmo motivo que aquelas duas moram juntas: **desenho e clique não podem
divergir**. Nada de contador incrementado por ciclo — contador acumula erro, e
casa errada aos 3 minutos de live é o bug que só aparece na hora.

O `porCasa` sai do próprio `/8` da máscara, não de uma constante: take com `/4`
existe e a grade tem que segui-la.

### 2. A régua da timeline passa a dizer a casa

A régua já diz compasso e tempo. Ganha `casa 6/8` — três caracteres que fazem as
duas vistas nomearem o mesmo instante. Sem isso o dono traduz "ciclo 47" pra
"casa 6" de cabeça, que é a conta que a interface deveria estar fazendo.

**Zero não renderiza:** take sem `.mask()` não mostra casa nenhuma.

### 3. O defeito de verdade: `pesado` congela no ciclo errado

`Timeline.tsx:317-322`: quando uma consulta passa de 16 ms, a grade congela e a
régua passa a dizer "grade fixa". A degradação está certa — consulta cara no
thread do som é pior que grade parada. **O ciclo escolhido é que está errado**:
congela em `0`, e no ciclo 0 de qualquer take com máscara quase tudo está
desligado. Na `ssba-18` o ciclo 0 tem 2 camadas de 8: a tela mostra uma peça
quase vazia enquanto a música está no auge.

Conserto, em ordem:

1. congelar no **último ciclo consultado com sucesso**, não em 0 — a tela mostra
   o estado mais recente que foi verdade, em vez de um que nunca foi;
2. a régua diz **em que ciclo** congelou (`grade fixa · ciclo 47`); "fixa" sem o
   ciclo não deixa ninguém julgar se aquilo ainda vale;
3. ~~reconsultar quando a **casa** muda, não quando o ciclo muda~~ — **cortado
   na implementação, e o corte é o item mais útil deste plano.** A ideia era 8×
   menos consulta. Ela quebra qualquer camada que alterna por ciclo: a
   `ssba-18` tem `note("<[c#3,e3,g#3] [a2,c#3,e3] ...>")`, um acorde por ciclo.
   Reconsultando por casa, a timeline mostraria o mesmo acorde por 8 ciclos —
   ou seja, trocaria uma grade parada por uma grade **errada**, que é pior. A
   consulta continua por ciclo.

Achado durante a leitura, e é o que realmente estava quebrado: **`pesado` nunca
era resetado quando a take mudava.** Um take caro contaminava todos os seguintes
até dar F5, e o sintoma — grade parada num take leve — não parecia ter causa.
`pesado` é medição de UM take, não condição da tela.

### 4. Seleção é uma só

`sel` já existe na `Timeline.tsx`. Clicar numa linha da grade seleciona a mesma
camada na timeline, e vice-versa. Duas seleções pra oito camadas seria a doença
deste plano em outra roupa.

### O que eu recusei na sync

- **hover na casa pra pré-ouvir** (scrub): mexe no agendador pra dar informação
  que a coluna acesa já dá;
- **timeline de 64 ciclos**: vira minimapa, e minimapa de 8×8 é a grade — de novo
  duas representações da mesma coisa;
- **animar a passagem da coluna acesa**: é um evento de 17 s. Movimento ali chama
  atenção pro relógio, não pra música.

## Fases

| # | Entrega | Portão |
|---|---|---|
| 1 | `casaDoCiclo` + `parseGrade`/`escreverGrade` em `camadas.ts` | vitest: ida-e-volta desenho↔máscara; grade inválida recusada |
| 2 | Conserto do `pesado` (reset por take + congela no ciclo atual) | vitest verde; consulta segue por ciclo |
| 3 | `casa n/8` na régua da timeline | vitest de `Timeline` + zero-não-renderiza |
| 4 | Casa clicável no editor, escrita via `reescrever()` | vitest: um clique = um edit com comentário e máscara juntos |
| 5 | Seleção compartilhada grade↔timeline | vitest: `sel` único |

Fases 1 e 2 valem sozinhas: a 2 conserta um defeito que já está em produção
hoje, sem a grade existir. Se o plano parar depois da 2, o dia valeu.

## Portões de saída

- `npx vitest run src/musica/` verde (hoje: 43 testes na `keyboard-ui`);
- `npx vitest run src/musica/patterns.test.ts` verde — as 21 takes de `patterns/`
  continuam avaliando e produzindo evento;
- **teste de divergência**: para toda take de `patterns/`, desenho e máscaras têm
  que dizer a mesma coisa. É a defesa que este plano deve ao bug do overlap — não
  basta consertar o número, tem que existir um teste que prenda as duas
  representações juntas enquanto as duas existirem;
- `npm run build` e typecheck limpos;
- viewport estreito medido a 390px (`Musica.estreito.test.tsx` já cobre a rota).

## Estado (10/09/2026)

Fases **1, 2 e 3 entregues**: `casaDoCiclo`/`arranjoDaCamada`/`arranjoDoTake` em
`camadas.ts`, o conserto do `pesado` e a `casa n/8` na régua da timeline.
196 testes verdes em `src/musica/`, `tsc --noEmit` limpo, `npm run build` ok.

Fora do plano, pedido do dono na mesma rodada e do mesmo formato: **trocar de
música agora para a atual e começa a selecionada** (`Musica.tsx`, no `abrir`).
Antes, o editor mostrava a take nova e o alto-falante seguia na antiga — a
mesma doença deste plano (o que se lê ≠ o que soa), uma camada acima. `stop()`
antes do `evaluate()`, porque parar zera o relógio e a take nova entra na casa
1 em vez de cair no meio do arranjo da anterior. Selecionar com o som **parado**
não liga nada. Preso por `Musica.troca.test.tsx`, que foi verificado reprovando
sem o conserto.

Fases **4 e 5 não começaram** — a casa clicável no editor e a seleção
compartilhada. É onde mora a decisão de mexer no CodeMirror, e ela não foi
tomada ainda.

## O que não foi verificado

O plano é leitura de código (`Timeline.tsx`, `camadas.ts`, `patterns.test.ts`)
mais a rota aberta em `localhost:5174/musica`. Nada foi executado com som. O
ganho da reconsulta por casa (fase 2, item 3) é estimativa: precisa ser medido
com a `ssba-18` tocando antes de virar promessa.
