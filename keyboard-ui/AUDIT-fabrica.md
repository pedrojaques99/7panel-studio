# Auditoria — src/fabrica

## Superfícies

Uma linha por tela. **Preencha antes de consertar qualquer coisa.** Classificar
depois de mexer é justificar o que já foi feito.

- **A aquisição** — quem não é cliente ainda. Persuadir, provar, converter.
- **B trabalho** — quem usa todo dia. Velocidade, densidade, teclado.
- **C confiança** — dinheiro, permissão, ação destrutiva. Não pode mentir.

Aplicar instinto de A numa tela B é o erro mais caro do frontend Visant.

| Arquivo | Superfície (A/B/C) | Variável de negócio que move | Notas |
|---|---|---|---|
| src/fabrica/Fabrica.tsx | B | fontes levadas do teclado até a cama sem sair da tela | Casca: espinha de 4 passos e revelação progressiva. Não mede nada, só mostra onde a pessoa está. |
| src/fabrica/Tocar.tsx | B | fontes candidatas geradas por sessão | Substitui o gerador por LLM. Medidores PULSO e ESTICADO REAL ensinam a restrição sem texto. |
| src/fabrica/Medir.tsx | **C** | **horas de render não desperdiçadas** | 60 das 331 faixas do acervo reprovam na fonte. Verde aqui autoriza gastar horas — não pode mentir. |
| src/fabrica/Esticar.tsx | B | decisão de manter ou descartar a cama | A onda antes/depois é o que deixa decidir sem esperar o render inteiro tocar. |
| src/fabrica/Fabrica.test.tsx | B | fluxo que não perde o veredito ao regravar | Teste da casca. Guarda a ordem do fluxo e o reset do veredito. |
| src/fabrica/Medir.test.tsx | C | o cabeçalho não pode contradizer o portão | Teste do achado 1. Guarda a superfície C contra reincidência. |
| src/fabrica/Tocar.a11y.test.tsx | B | o instrumento alcançável por quem não usa mouse | Teste do achado 5. Guarda contra disparo duplicado, que apagaria o toggle do DRONE. |
| src/fabrica/ui.ts | B | um tom só, e estado dito sem cor | Escala monocromática. SSoT de tinta, tipo e espaço da rota. |

`Medir.tsx` é **C** e não B: é o único ponto onde a tela autoriza gasto irreversível
de tempo. Foi por tratá-la como B que passou o defeito principal desta auditoria.

## Tela vista

Uma linha por tela ABERTA, com o que foi visto. Sem isto o portão não abre —
um AnimatePresence travado passa por tsc, ESLint, motion-lint, impeccable,
audit:design e copy-lint sem acender nada.

Cada linha carrega: rota, largura, estado do dado, e o que aconteceu.

### Tela atual: monocromática, um passo por vez

- `/fabrica` · 1568×697 · **em repouso, backend no ar** · Passo 1 mostra QUATRO coisas:
  pílulas de voz (ENO, MOUNT SHRINE, APHEX, SAMPLE), teclado, faixa de ação (DRONE,
  SILENCIAR, GRAVAR, MIC, SEQUÊNCIA) e o disclosure `ajustar` fechado. Console sem
  erro. Os passos 2 e 3 não existem no DOM, o que também impede o sintetizador de
  ficar vivo atrás da tela de medição.
- **Teclado medido, não olhado**: 15 teclas brancas de 44 px, uniformes. Antes eram
  54 px FIXOS, que já estouravam o container de 820 px, ou seja o teclado vazava no
  desktop, não só no celular. Viraram porcentagem.
- **390 px, parcialmente fechado.** `resize_window` redimensiona a janela mas o
  viewport da página continuou 1916, então o teste real de viewport NÃO aconteceu.
  O que foi feito: constringir o `<main>` a 390 px por JS e medir. Resultado
  `scrollWidth 390`, **zero elementos estourando**. Como este layout não tem media
  query, isso prova que nenhuma largura fixa força rolagem lateral. **Não prova
  legibilidade**: tamanho de fonte e alvo de toque continuam sem avaliação.
- **Disclosure `ajustar`**, verificado pelo DOM: `open` vai de `false` para `true` e o
  conteúdo (`ATTACK`) está presente. Registro do meu erro: eu quase reportei "não
  abre" como defeito, baseado em `get_page_text` e clique por referência. Era artefato
  da ferramenta, não da tela. Medir o DOM resolveu o que espremer o olho não resolvia.
- **Pílula SAMPLE**, caminho inteiro exercitado: injetei um WAV sintético de 1,5 s em
  C4 no `input[type=file]`, e a tela respondeu com o nome do arquivo na pílula e
  `sample de 1,5 s em loop, raiz C4`. Decodifica, entra como voz, loopa.
- **MIC**: botão presente na faixa de ação. Roteamento conferido no código, não na
  orelha: `fonte.connect(analise)` e `fonte.connect(capture)`, e nada mais. Nenhuma
  ligação ao master, à cadeia ou ao `entrada`, então microfonia é impossível por
  construção. **Não gravei com microfone de verdade**: a automação não concede a
  permissão, então os quatro estados e o medidor de nível são código revisado, não
  comportamento observado.

### Registro histórico

> **AS LINHAS ABAIXO DESCREVEM UMA TELA QUE NÃO EXISTE MAIS.** Depois delas a rota foi
> refeita duas vezes: as três seções empilhadas viraram **um passo por vez**, e a
> paleta de três cores (verde, âmbar, vermelho) virou **um tom só** (`ui.ts`), com
> estado dito por peso, preenchimento e palavra.
>
> Ficam registradas porque foi nelas que os achados 1 a 4 apareceram, e apagar isso
> apagaria a prova. Mas **nenhuma delas vale como verificação do desenho atual.**
> A tela de hoje ainda não foi aberta com o olho. Enquanto essa linha estiver aqui,
> este portão está aberto nos detectores e **não** na tela.

- `/fabrica` · 1568×743 · **dado real, backend no ar** · Hidratação confirmada (Tone.js
  no console, sem erro). Tocado um acorde de 4 notas (C3 E3 G3 C4) com DRONE ligado,
  gravado 0:22, subido por `/api/upload`, medido por `/api/triagem`. Espinha avançou
  TOCAR→MEDIR→ESTICAR sozinha. **Achado 1** visto aqui.
- `/fabrica` · 1568×743 · **estado vazio** · `SEM FONTE / grave alguma coisa primeiro`
  e `ESTICAR` esmaecido desenhados nas duas seções. Sem `null`, sem buraco.
- `/fabrica` · 1568×743 · **gravando** · Régua ESTICADO REAL subiu 11,5x → 11,8x entre
  0:10 e 0:22, marca dos 30 s desenhada na trilha, preenchimento âmbar abaixo dela.
  PULSO caiu a 0,0 com acorde segurado e subiu a 1,0 (âmbar, fora da zona) ao martelar.
- `/fabrica` · 1568×743 · **sequenciador, grade vazia** · 6 passos com borda tracejada
  e `—`; `TOCAR` desabilitado; medidor PASSO em `2,5 s · = 30 s esticado a 12x` com a
  trilha em segundos ESTICADOS (marca 24 s, teto 48 s).
- `/fabrica` · **390×844 — NÃO VERIFICADO.** Três travamentos do renderer (`CDP
  Page.captureScreenshot` estourou 30 s) impediram a captura. O `resize_window`
  funciona; a captura não. **Pendente, e não deve ser dado como passado.**

### Não verificado, e por quê

- **Legibilidade a 390 px.** O estouro foi medido e é zero (ver "Tela atual"), mas
  tamanho de fonte e alvo de toque nessa largura continuam sem avaliação. A escala de
  tipo da rota é 10 a 46 px, e a de rótulo (10 px) é candidata a ficar pequena demais
  no celular. Precisa de olho humano.
- **Backend parado.** A tela nunca foi aberta com o Flask fora do ar.
- **Microfone com permissão real.** Roteamento conferido no código; captura nunca
  exercitada, porque a automação não concede a permissão do navegador.
- **Trocar de preset com a sequência rodando.** Esse caminho saiu de um efeito e virou
  manipulador durante a limpeza de lint. É logicamente idêntico, e não tem teste.

### Fechado desde a primeira redação

- **Toggle do latch**, que era o defeito relatado pelo dono: confirmado à mão. Com
  DRONE ligado, primeiro clique em C3 dá `SOANDO 1 nota, C3`, segundo clique na mesma
  tecla dá `SOANDO 0, nada soando`, e o resto do acorde não cai junto.
- **Estouro a 390 px** no sentido de rolagem lateral: zero elementos estourando.
  O que destravou foi parar de perseguir screenshot e medir o DOM.

## Achados

### 1 — CONSERTADO · o cabeçalho verde contradizia o portão vermelho

Superfície **C**. Uma gravação de synth saiu com o portão `CORRELACAO` vermelho
(`-0,18`, "some em mono") **debaixo** de um cabeçalho verde `PODE ESTICAR / fonte
limpa`.

Causa: `podeEsticar` era derivado de `veredito !== 'nao-estica'`, e `veredito` é o
vocabulário técnico da CLI, que só pesa pulso e apito. No terminal isso nunca
incomodou (as colunas ficam lado a lado e o humano lê as duas); numa tela vira
contradição, e portão que se contradiz ensina a ignorar os dois.

Conserto: `triar()` passou a devolver `pode_esticar` e `reprovados`, calculados sobre
TODOS os portões; `veredito` ficou intacto para não divergir do `_tools/triagem.py`.
O cabeçalho rebaixa para o pior portão e **nomeia quem reprovou**.
Testes: `backend/tests/test_veredito_coerente.py`, `src/fabrica/Medir.test.tsx`.

### 2 — CONSERTADO · o portão era mais rigoroso que o próprio acervo

Superfície **C**, e o mais grave: o app dizia NÃO ESTIQUE para material que o acervo
teria aceitado.

Eu especifiquei `corr <= 0 → reprova`. Mas no `PRONTUARIO.md` **todos** os arquivos
com correlação negativa (−0,02 · −0,03 · −0,06 · −0,09) estão em "Passa, mas leia
antes"; a tabela "Reprovado na fonte" só tem falha de pulso. Como o synth usa
`Tone.Chorus` (spread de 180°) e reverb estéreo, **toda** gravação saía barrada.

Conserto: negativo é aviso; reprova ficou para o cancelamento real (`<= -0,5`, bem
fora dos −0,09 piores do acervo). As três gravações reais passaram de
`reprova/pode_esticar False` para `aviso/pode_esticar True`.

### 3 — CONSERTADO · latch sem desligar

Superfície B, relatado pelo dono. `notaOn` ignorava tecla já soando e `notaOff` era
no-op sob latch: não havia caminho para soltar uma nota, só o `SILENCIAR`, que derruba
o acorde inteiro. A tecla virou interruptor. **Não confirmado à mão — ver acima.**

### 4 — CONSERTADO · o aviso de fator curto sumia no cache

`/api/stretch` devolvia `{path}` puro no acerto de cache, então um render que saiu
curto mostrava o alerta uma vez e nunca mais. "Avisa na primeira vez e cala nas
seguintes" é pior que nunca avisar: a pessoa aprende que o arquivo está bom.
Conserto: sidecar `ps_<key>.json`. Teste: `backend/tests/test_stretch_cache.py`.

### 5 — ABERTO · teclas do piano não são alcançáveis por teclado

`read_page --filter interactive` lista `DRONE`, `SILENCIAR`, `TOCAR`, `EDITAR`, o
slider e os botões de passo — **nenhuma tecla do piano**. Elas são `div` com handler
de ponteiro. Há atalho de computador (Z X C V…), o que cobre o uso principal, mas
não há foco, `role` nem `aria-pressed`: leitor de tela não vê o instrumento, e `Tab`
não chega nele. Não consertei: mexer na semântica das teclas é decisão sua, e o
atalho já cobre o caminho quente.

### 6 — ABERTO, do repo · não existe SSoT de motion

Nem `--ease-*`, nem `--dur-*`, nem `lib/motion.ts`. Os painéis usam transição inline,
com **16 ocorrências de `transition: 'all 0.15s'`** — o antipadrão que o próprio
`refine-scan` acusa. Alinhei a `Fabrica.tsx` ao vocabulário existente
(`opacity 0.15s`) em vez de importar a convenção de outro projeto só nesta rota, o
que criaria uma segunda família. Estabelecer o SSoT é decisão de dono, e vale para o
app inteiro, não para a fábrica.

### 7 — ABERTO, do design system · `VintageMeter` não serve a medidor com régua

Levantado ao construir os painéis e ainda de pé: a API é `{label, value}` com escala
fixa 0–10 e ponteiro vermelho fixo, num mostrador analógico de 180×140 px. Não tem
`status`/cor, não tem `min`/`max`, não tem variante compacta. Por isso `Medir.tsx`
desenha as evidências em SVG próprio. Se ele for virar o padrão, precisa dessas três
coisas — e isso é editar componente de design system, que não faço sem autorização.

### 8 — CONSERTADO · 32 vícios de copy nos quatro arquivos

O portão duro fechou na primeira passada: 27 achados de `copy` (travessão e bolinha
separadora) e 5 de `ruído` (seta-glifo). Proibições absolutas da casa, e eu deixei
passar em todos os arquivos de interface.

Consertadas 26 linhas, só as apontadas: travessão virou dois-pontos ou ponto
(`fonte limpa: isso vira nuvem`), bolinha virou vírgula ou dois-pontos
(`consonante, filtro respirando`, `MIDI: {nome}`), seta virou palavra
(`dashboard →` → `voltar ao dashboard`, `notch, escuro, teto, achatar, limiter`).
Nenhuma copy fora da lista foi reescrita.

O `−` de sinal e o `—` usado como placeholder de dado ausente ficaram: não são copy,
e o detector não os acusa. Rodar `copy-lint.mjs` direto no `.tsx` dá falso positivo
em aritmética (`n - win`); quem extrai copy de verdade é o detector do `killer-scan`.

## Escala de tipo — desvio consciente

O app usa `--fs-*` de 8 a 13 px, densidade de painel flutuante num canvas com zoom.
`/fabrica` é página normal e usa escala legível (11–34 px). Documentado no cabeçalho
de `Fabrica.tsx`. A primeira versão desta rota herdou a escala de painel e ficou
ilegível — foi o motivo declarado de a rota ter sido refeita.

## Portões

- `refine-scan src/fabrica` → **REFINO ABERTO: zero achado em 6 arquivos**
  (`--self-test` do detector passa nos dois sentidos).
- `killer-scan --report` → `impeccable` zero · `copy` zero (186 strings de interface)
  · `ruído` zero. `audit:design` pulado: o repo não tem o script.
- `tsc -b --noEmit` → zero erro em `src/fabrica/**` e `main.tsx`
  (58 pré-existentes em `visualizers/*`, `synesthizer.ts`, `SynthPanel.tsx`,
  `RetroTVPanel.tsx`, `strudel-service.ts`).
- `vitest` → 55 passando · `pytest` → 134 passando · `vite build` → passa.
- **Este portão NÃO está fechado**: falta a verificação a 390px e a confirmação à mão
  do achado 3.
