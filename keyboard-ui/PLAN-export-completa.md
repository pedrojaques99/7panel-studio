# PLAN: exportar a música completa, do início ao fim do arranjo

> Hoje o painel de duração só oferece **cortes de formato** (spot, reels, single,
> club). Todos são um *pedaço* medido em segundos de rádio, não a peça. Se o take
> tem grade de arranjo — e as takes com 3+ camadas têm, o `patterns.test.ts` exige
> — então a peça já declara onde termina: `casas × porCasa` ciclos. Exportar 3:30
> de uma peça de 2:08 grava a volta duas vezes e corta no meio da segunda.

## O dado que já existe

`camadas.ts` tem `arranjoDoTake(bases) → {casas, porCasa} | null`. É o mesmo
detector que a `Timeline.tsx` consome pra dizer `casa 6/8` na régua. Nenhum
parser novo: a régua e o exportador vão discordar sobre onde a peça termina
zero vezes, porque leem a mesma função.

Duração completa = `casas * porCasa * (60/bpm) * 4`. Sem arredondamento —
já é número inteiro de ciclos por construção, ao contrário de `corteEmCiclos`,
que arredonda um alvo em segundos.

## A decisão de forma

A linha `completa` entra **no topo** da lista de durações, separada por régua
das outras, porque é de outra natureza: as outras são um alvo que a gente impõe
à música, essa é a música dizendo o próprio tamanho.

Mostra o mesmo par que as outras linhas (`m:ss.d` + `N comp.`), então o custo
em tempo de relógio continua visível antes do clique — a peça pode ser longa.

## Recusa, não adivinhação

`arranjoDoTake` devolve `null` em dois casos diferentes, e a tela precisa dizer
qual, senão o usuário não sabe o que consertar:

| situação | o que a linha diz |
|---|---|
| nenhuma camada tem `.mask()` | `sem grade de arranjo no código` |
| camadas com grades diferentes | `as camadas discordam da grade` |

Nos dois casos a linha aparece desabilitada, não some. Sumir esconderia a
existência do recurso de quem mais precisa dele.

`conflitoDeArranjo(bases)` em `camadas.ts` separa os dois casos sem mexer na
assinatura de `arranjoDoTake` (a `Timeline` já a consome).

## O nome do arquivo

`entropia-v7-completa-2m08s.wav`. O marcador `completa` entra junto do `-v7`
porque a pergunta "esse wav é a peça inteira ou um corte?" é a primeira que se
faz no gerenciador de arquivos, e a duração sozinha não responde.

## Escopo

- `exportacao.ts`: `duracaoDoArranjo()`, marcador `completa` em `nomeArquivo()`.
- `camadas.ts`: `conflitoDeArranjo()`.
- `Exportador.tsx`: a linha nova; detecta o arranjo a partir do `code` que já
  recebe (`detectarCamadas` é puro e barato) — **`Musica.tsx` não muda**.
- `exportacao.test.ts` / `camadas.test.ts`: os casos acima.

Sem componente novo de design system. Cor e ritmo saem de `fabrica/ui`.
