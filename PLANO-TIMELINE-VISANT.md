# PLANO — a timeline da casa (`@visant/timeline`)

> Pedido do dono (16/09/2026): *"uma timeline decente e completa e modular pra esse tipo de
> operação, vídeo, áudio, todos os projetos reusarem ela de forma dinâmica e inteligente, proativa
> mostrando só o necessário conforme o projeto. Nível apple-vercel-visant."*
>
> Base factual: `keyboard-ui/PESQUISA-linha-do-tempo.md` (10/09) e `keyboard-ui/PLAN-linha-do-tempo.md`
> (fases 0–3 construídas). Este plano **continua** aqueles dois, não os substitui.

## A tese em uma frase

A timeline difícil já existe e está testada; o que falta é **tirar a palavra "ciclo" do eixo** e
empacotar o que sobrou.

---

## 1. O que já está pronto (e é mais do que parece)

| arquivo | linhas | testes | o que resolve |
|---|---|---|---|
| `keyboard-ui/src/musica/escala.ts` | ~190 | **18** | ciclo↔px, zoom, limites de pan, enquadrar, **nível de detalhe** |
| `keyboard-ui/src/musica/consulta.ts` | ~190 | **15** | cache por faixa e por ciclo, **orçamento de 8 ms por quadro** |
| `keyboard-ui/src/musica/LinhaDoTempo.tsx` | ~830 | **14** | canvas fora do React, d3-zoom, régua, minimapa, agulha, gestos |
| `keyboard-ui/src/musica/relogio.ts` | — | — | fonte única do tempo (existe porque grade e régua já discordaram) |

`npm run test` no 7panel: **377 passando**. Zoom medido no navegador travando em 1,0× (peça
inteira) e 64,0× (um ciclo na tela).

**As três decisões que valem ouro e que nenhum pacote de prateleira traz:**

1. **Nível de detalhe medido em px por ciclo, não em `k` cru** (`PLAN` §LOD). Zoom aberto não
   consulta nada; zoom fechado tem poucos ciclos na tela. É o que impede a explosão que mata a
   `vis-timeline` com 10 mil `<div>`.
2. **Orçamento por quadro** (`consulta.ts`): estourou, devolve parcial **e avisa na régua**. A
   agulha continua andando porque lê o relógio, não a consulta.
3. **A tela não mente**: quando o texto do editor diverge do que está tocando, as casas desenham
   vazadas e a régua escreve `editado · ctrl+enter`. Nunca se escolhe um dos dois em silêncio.

Essas três viram **invariantes do pacote**. Qualquer perfil novo herda as três.

## 2. O que falta, e é o pedido de hoje

- O eixo é **ciclo**, não segundo. Vídeo e áudio precisam de segundo.
- Não existe `Clip`, `Track` nem `Keyframe`. Hoje uma trilha é um argumento do `stack(...)` e um
  clipe é uma casa booleana da `.mask()` (`musica/camadas.ts:1-36`).
- Sem forma de onda. A fase 5 do plano antigo (wavesurfer) nunca começou.
- Sem arrastar clipe nem borda.
- Três telas de timeline convivendo, porque a fase 4 (apagar as velhas) foi adiada de propósito.

E fora do 7panel existe uma segunda timeline, de vídeo real:
`auto-video-editor-ai/apps/web/src/app/cortar/timeline.tsx` (151 linhas, DOM na mão, `Trecho
{id, ini, fim}`, playhead arrastável, picos de onda). É o segundo consumidor, e prova que o
problema é transversal.

---

## 3. A pesquisa de mercado, refeita em 16/09

Regra da casa: procurar antes de construir. Foi feito, e o resultado é **negativo de novo**.

| candidato | licença | estado | veredito |
|---|---|---|---|
| [twick](https://github.com/ncounterspecialist/twick) | **NOASSERTION** (Sustainable Use) | 533 ⭐ | **não**: proíbe redistribuir como SDK, e a timeline vai pro kit |
| [designcombo/react-video-editor](https://github.com/designcombo/react-video-editor) | **NOASSERTION** | 1.795 ⭐ | **não**, mesmo motivo |
| [reactvideoeditor.com](https://www.reactvideoeditor.com/features/timeline) | proprietária | US$ 65/mês | **não** |
| [react-timeline-editor](https://github.com/xzdarcy/react-timeline-editor) | MIT | parado desde 25/01/2026, 42 issues | **não**: sem áudio, API travada |
| [canvas-timeline](https://github.com/techsquidtv/canvas-timeline) | MPL-2.0 | **criado em 04/07/2026**, 16 ⭐ | **referência de arquitetura**, não dependência |
| [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) v7 | BSD-3 | 10.416 ⭐, push 10/09/2026 | **sim**, é a trilha de áudio |
| [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | Apache-2.0 | padrão da indústria | **modelo de dados**, só que sem binding JS |

O `canvas-timeline` acerta o desenho da casa (núcleo headless + camada React + renderizador em
canvas), e é exatamente a arquitetura abaixo. Com dois meses de vida e 16 estrelas, ele não pode
ser a fundação de todos os projetos, mas confirma o caminho.

**Dependências do pacote:** `d3-scale`, `d3-zoom` (já usadas, 40 M e 17 M por semana),
`wavesurfer.js` + `@wavesurfer/react` na trilha de áudio. Nada mais.

---

## 4. Arquitetura — três camadas e um perfil

```
@visant/timeline-core      puro, sem DOM     modelo, escala, consulta, LOD, orçamento
@visant/timeline-canvas    canvas 2D         régua, faixas, agulha, minimapa
@visant/timeline-react     React + d3-zoom   montagem, gestos, atalhos
  perfis/                  declaração        o que aparece, por projeto
```

### O eixo vira tempo, e a unidade vira adaptador

O núcleo passa a falar **segundo**. O 7panel entra com um adaptador ciclo↔segundo, que já existe
(`segundosPorCiclo` em `escala.ts`). A régua é plugável: m:ss, compasso, ciclo, timecode SMPTE.

### O modelo de dados

Inspirado no OpenTimelineIO, sem adotar a biblioteca (é C++ e Python):

```ts
Timeline { duracao, taxa, trilhas: Trilha[] }
Trilha   { id, tipo: 'video'|'audio'|'pattern'|'marca', itens: Item[] }
Item     { id, ini, fim, fonte?, dados? }   // clip, casa, região, marcador
Chave    { t, valor, curva? }               // keyframe, quando o perfil liga automação
```

Uma **casa** do 7panel é um `Item` de trilha `pattern`; um **trecho** do auto-video-editor é um
`Item` de trilha `video`; um **zoom** do gravador de aula é uma `Chave`. Um modelo, três leituras.

### Os perfis, que é o "mostrar só o necessário"

O perfil declara o que existe. O que não está declarado **não aparece na tela**, não é só
desabilitado. É a mesma regra do onboard: ícone antes de rótulo, e só o passo da vez.

| perfil | trilhas | gestos | não tem |
|---|---|---|---|
| `pattern` (7panel) | pattern, marca | pintar casa, mudo, solo | arrastar borda, automação |
| `corte` (auto-video-editor) | video, audio, marca | arrastar clipe e borda, cortar | pintar, pattern |
| `aula` (gravador do curso) | video, **zoom**, marca | mover e ajustar zoom, marcar take | pattern, mixagem |
| `audio` (Jacão) | audio, marca | região, trim, fade | video |

---

## 5. Fases

Cada fase é um commit que roda, e nenhuma quebra o 7panel.

| # | entrega | como se verifica |
|---|---|---|
| **0** | Extrair `escala.ts` e `consulta.ts` pro `core`, **com os 33 testes junto**, ainda falando ciclo | `npm run test` do 7panel continua 377 verde, agora importando do pacote |
| **1** | Generalizar o eixo pra segundo, com adaptador de ciclo. Régua plugável | os 18 testes de escala reescritos em segundo, mais um teste do adaptador que prova `ciclo→s→ciclo` |
| **2** | Modelo de dados (`Timeline/Trilha/Item/Chave`) e o perfil `pattern` reproduzindo a tela de hoje | tela nova ao lado da atual, mesma casa acesa no mesmo instante (o método que pegou o bug do `casa 2/8`) |
| **3** | `timeline-canvas` extraído, com régua, faixas, agulha e minimapa | os 14 testes da `LinhaDoTempo` reapontados, sem mudar asserção |
| **4** | Trilha de áudio com `wavesurfer.js` v7 (a fase 5 que nunca começou) | onda do `.wav` da `girassol-fita`, zoom casado com o eixo |
| **5** | Perfil `corte`: arrastar clipe e borda, com o auto-video-editor como cobaia | as 151 linhas de DOM de lá apagadas, e o corte continua saindo igual |
| **6** | Perfil `aula`: trilha de zoom por keyframe, importando a trilha de cursor do gravador | um export com zoom que segue o cursor, sem abrir o FollowCursor |
| **7** | Apagar `Timeline.tsx` e `GradeArranjo.tsx` (a fase 4 adiada do plano antigo) | `npm run test` verde com os testes das velhas migrados |

A fase 6 é o encontro com a outra frente: o gravador do curso precisa exatamente de uma trilha de
zoom por keyframe, e é o que o FollowCursor faz em 315 linhas (`zoom_engine.py`) mais 625 de
análise de clique (`activity_analyzer.py`).

---

## 6. Onde o pacote mora

Nasce em `7panel_studio/packages/timeline/`, porque é lá que estão os 33 testes e o canvas que
funciona. **Migra pra repositório próprio quando o segundo consumidor entrar** (fase 5), e não
antes: pacote sem segundo consumidor é abstração adivinhada.

Licença de saída: **MIT**, pra poder ir no kit do aluno. Isso proíbe copiar código de dentro do
`canvas-timeline` (MPL-2.0) e de qualquer coisa NOASSERTION. Ler para aprender, sim; colar, não.

## 7. O que este plano NÃO é

Não é um clone de CapCut, não é editor de vídeo, não tem mixer, não tem efeito, não tem render.
Não adota `twick` nem `designcombo`. Não escreve componente novo no design system: tudo sai de
`fabrica/ui.ts`, como as telas que ele substitui. E não toca em `camadas.ts`, `relogio.ts` nem
`patterns.test.ts`.

## 8. Riscos

| risco | saída |
|---|---|
| Generalizar o eixo quebra a tela que funciona hoje | fase 0 extrai **sem mudar semântica**; a troca pra segundo só na 1, com os testes reescritos |
| O pacote vira abstração adivinhada | só migra de repo com o segundo consumidor real na mão |
| `wavesurfer` e o canvas brigarem pelo mesmo zoom | o núcleo é dono do eixo; o wavesurfer recebe `minPxPerSec` derivado, nunca o contrário |
| Perfil virar `if` espalhado | perfil é **dado**, declarado num objeto, e o teste de cada perfil lista o que aparece |
| O 7panel congelar esperando o pacote | as três telas continuam vivas até a fase 7 |

## 9. Decisões que dependem do dono

- [x] **Ordem decidida em 16/09: o perfil `aula` primeiro** (fase 6 antes da 4 e da 5). Motivo: é
      o que o dono precisa agora pra gravar o curso, e é onde a timeline encontra a outra frente,
      o gravador. Áudio (Jacão) e corte (auto-video-editor) vêm depois, nessa ordem.
- [ ] **Nome do pacote.** `@visant/timeline` ou outro.
- [ ] Se a fase 7 (apagar as duas telas velhas do 7panel) entra neste ciclo ou fica pra depois.
