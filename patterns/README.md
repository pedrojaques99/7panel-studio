# patterns/ — repertório da jam

Cada `.js` é um take congelado do AnalogBrain: padrão Strudel + header com bpm e nota.

```bash
python backend/jam.py save take-01 --notes "dub techno lento"   # congela a rev atual
python backend/jam.py patterns                                   # lista
python backend/jam.py load take-01 --push                        # propõe no painel
```

Versionado em git de propósito: dá pra voltar num take de semanas atrás com `git log patterns/`.
Nome aceita só letras, números, `-` e `_` (o backend recusa o resto, não sanitiza).

## Portão

`npx vitest run src/musica/patterns.test.ts` (dentro de `keyboard-ui/`) avalia TODO
`.js` daqui com o mesmo escopo do painel e consulta 4 ciclos. Pega erro de sintaxe,
função que não existe e take que virou silêncio sem áudio nenhum — antes da live.

## Samples

Os takes usam os bancos locais de `backend/assets/samples/` (Zero-G Dream Zone,
kit VHULTO), não o `bd`/`hh`/`piano` de fábrica do Strudel. O nome do banco no
`s()` é o slug da PASTA (`vhulto_sampling_the_world_drumkit_kick`), e `.n()` é o
índice do arquivo dentro dela, em ordem alfabética.

Escolher índice no escuro é caro. A ficha técnica:

```bash
python backend/tools/sample_probe.py --bancos
python backend/tools/sample_probe.py "Zero-G - CE07 Dream Zone" --tipo pad --min-dur 8
```

Afinar sample: no superdough, banco sem metadado é afinado por `note` relativo a
**C3**. Instrumento com a raiz no nome (`SANT C#`) precisa descontar: `escrito =
alvo - raiz + c3`. Ver `rhodes-cinza.js`.

## Forma

Take que entra com sete camadas no ciclo 1 e sai com as mesmas sete no ciclo 200
é loop, não música. Toda take daqui tem uma grade de arranjo no cabeçalho e uma
máscara por camada:

```js
// ── ARRANJO ── cada casa = 8 ciclos
//              1    2    3    4    5    6    7    8
//   bumbo      ·    ·    ●    ●    ·    ●    ●    ·
s("...kick").n(5).struct("x ~ ~ x").mask("<0 0 1 1 0 1 1 0>/8")
```

`"<...>/8"` = cada casa dura 8 ciclos; oito casas ≈ 2 min. Reescrever a peça é
reescrever essas oito casas.

O portão (`src/musica/patterns.test.ts`) exige forma em qualquer take com 3+
camadas: máscara, rampa (`saw.slow(N)`) ou períodos primos. Quem é estática de
propósito declara `// estatico: <razão>` — a regra não é "toda peça tem arranjo",
é "toda peça tem uma decisão escrita sobre isso".
