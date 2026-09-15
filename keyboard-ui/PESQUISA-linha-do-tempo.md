# PESQUISA — linha do tempo de arranjo (o que já existe público e validado)

> Motivo: hoje a rota `/musica` mostra a peça **duas vezes e nenhuma inteira**.
> `Timeline.tsx` desenha **1 ciclo** (4 tempos, canvas na mão, 565 linhas) e
> `GradeArranjo.tsx` desenha **8 casas × 8 ciclos** como grade de liga/desliga.
> Não existe uma tela onde a `girassol-fita` inteira (233 s / 64 ciclos) apareça
> com todas as camadas e você dê zoom até ver a nota. Antes de escrever isso na
> mão, este documento mede o que já existe.

Data da medição: 2026-09-10. Downloads = npm, última semana.

---

## O problema tem dois eixos, e só um deles tem lib pronta

| eixo | dado | quantidade | existe lib validada? |
|---|---|---|---|
| **A. áudio renderizado** | `.wav` em `era3/` (Python) e export do Strudel | 1 buffer, 233–377 s | **sim, e é dominante** |
| **B. eventos de pattern** | `queryArc()` por camada, 8 camadas × 64 ciclos | ~3–15 mil retângulos | **não** |

Tratar os dois como "um problema de timeline" é o que leva a reinventar. São
decisões separadas.

---

## Eixo A — áudio: `wavesurfer.js` v7, sem discussão

| lib | dl/semana | última versão | veredito |
|---|---|---|---|
| **wavesurfer.js** | **661.497** | 7.12.11 · 2026‑07‑17 | **escolhida** |
| **@wavesurfer/react** | **126.726** | 1.0.12 · 2025‑12‑04 | wrapper oficial, peer `react ^19` ✅ |
| peaks.js (BBC) | 5.631 | 4.0.0 · 2025‑08‑30 | bom, mas 100× menor e exige `audiowaveform` (binário C++) pra gerar picos |
| waveform-playlist | 1.164 | 4.3.3 · **2022‑02‑26** | multitrack de verdade, mas parado há 4 anos |
| wavesurfer-multitrack | 8.594 | 0.4.12 · 2024‑07‑16 | oficial, mas versão 0.x e parada |

`wavesurfer.js` v7 tem **zero dependências** e entrega de fábrica exatamente o
vocabulário do Premiere:

- **zoom**: `minPxPerSec` — contínuo, de "faixa inteira em 800 px" a "1 ms";
- **régua**: plugin `timeline` (marcas em segundo/compasso, formatação livre);
- **tira de visão geral**: plugin `minimap` — a barrinha do Premiere embaixo;
- **regiões**: plugin `regions` — as **casas** e os marcos Fibonacci (89 s, 144 s,
  233 s) viram regiões nomeadas, arrastáveis, com clique-pra-pular;
- **hover**: plugin `hover` — cursor com timecode.

Custo real: +1 dep de ~50 kB, zero transitiva.

## Eixo B — eventos de pattern: **não existe** componente validado

Isto é a parte importante da pesquisa, porque é o resultado negativo.

**Timelines genéricas** (agenda/gantt) — todas erram a semântica:

| lib | dl/semana | por que não serve |
|---|---|---|
| vis-timeline | 134.150 | eixo é `Date` (data do calendário), item é `<div>`. 10 mil divs = morre. |
| frappe-gantt | 78.237 | tarefa de projeto, granularidade de dia |
| react-calendar-timeline | 57.665 | ainda em `0.30.0-beta.4`; semântica de calendário |
| dhtmlx-gantt | 23.233 | licença comercial pra uso não-GPL |
| dnd-timeline | 5.917 | headless e honesto, mas 5,9k/semana não é "validado" |
| @xzdarcy/react-timeline-editor | 4.787 | o mais parecido com DAW, mas 4,7k/semana e API travada em `1.0.0` |

**Piano rolls de música** — todos abandonados ou de brinquedo:

| lib | dl/semana | última versão |
|---|---|---|
| webaudio-pianoroll | **11** | 2019 |
| react-piano-roll | **3** | 2019 |
| @minagishl/react-piano-roll | — | "falling notes", não é arranjo |

**O pianoroll do próprio Strudel** (`@strudel/draw`, já é dependência): tem
`cycles`, `fold`, `smear`, `playhead` — mas a doc oficial **não tem zoom
nenhum**. `cycles` é uma janela fixa que rola; não dá pra abrir a peça inteira e
fechar de novo. Serve pro que já serve (fundo do editor), não pra este pedido.

### O que fazer no eixo B então

Não escrever um componente de timeline. Escrever **o desenho** (que já existe e
já é bom: canvas fora do React, camada estática em cache, degradação `pesado`) e
importar **a matemática de zoom/pan**, que é a parte de fato difícil e que tem a
lib mais validada do ecossistema inteiro:

| primitiva | dl/semana | papel |
|---|---|---|
| **d3-scale** | **40.276.713** | `px ↔ segundo/ciclo`, `.domain()/.range()`, `invert()` |
| **d3-zoom** | **17.112.392** | roda, pinça, arrasto, inércia, `scaleExtent`, `translateExtent` |
| d3-axis | 11.449.719 | régua (opcional — o canvas já desenha a dele) |

`d3-zoom` sobre `<canvas>` é o padrão de fato: é assim que o painel Performance
do Chrome DevTools, o Grafana e os observáveis do Observable fazem timeline
zoomável. Ele resolve sozinho os detalhes que **sempre** saem errados na mão:
zoom ancorado no cursor (e não no centro), limite de pan que não deixa sair da
peça, pinça no trackpad, `wheel` com `ctrlKey` do macOS, e composição de
transforms sem acumular erro de ponto flutuante.

Alternativas checadas e descartadas: `react-zoom-pan-pinch` (1,3 M/sem — **já
está no `package.json`**, mas aplica `transform: scale()` em DOM: a régua e o
texto esticariam junto, e é isso que faz timeline parecer brinquedo);
`@use-gesture/react` (3,6 M/sem — resolve o gesto, não resolve a escala);
`@visx/zoom` (110 k/sem — é `d3-zoom` embrulhado, dep a mais sem ganho).

---

## Recomendação em uma frase

**`wavesurfer.js` + `@wavesurfer/react`** pro áudio, **`d3-scale` + `d3-zoom`**
pro canvas de patterns que já existe. Três deps, todas com número, nenhuma
componente de UI nova inventada.

Total: `wavesurfer.js` (0 deps transitivas) + `@wavesurfer/react` + `d3-scale` +
`d3-zoom` (d3-* têm 2–3 micro-deps cada, todas `d3-*`).

---

## O que ainda precisa ser decidido antes do plano de execução

1. **Qual eixo primeiro** — a linha do tempo do `.wav` (eixo A, chega hoje) ou a
   do pattern vivo (eixo B, é o pedido literal de "arranjos e patterns")?
2. **Onde mora** — substitui a `Timeline.tsx` atual, ou é uma terceira superfície
   (aba/rota) e a régua de 1 ciclo continua pro jam?
3. **A grade de arranjo** (`GradeArranjo.tsx`) vira a *camada de casas* dentro da
   nova linha do tempo, ou continua tela separada?
