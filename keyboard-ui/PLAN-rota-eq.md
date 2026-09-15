# PLAN — rota /eq: domar o chiado com a mão

> Rota nova e solta. Abre um arquivo qualquer — inclusive um MP3 já renderizado que
> nunca passou pela esteira do `/fabrica` — e deixa a pessoa tirar chiado, pôr grave e
> pôr reverb com um gesto, ouvindo antes de gastar render.

Origem do pedido: uma cama de 1 h saiu chiada demais, com pouco grave e seca. O
diagnóstico já existia escrito no repo — `dsp/domar.py` diz, no próprio cabeçalho, que o
shelf negativo no agudo é *"o que separa nuvem de chiado"*. O que falta não é DSP: é
**mão**. Hoje `escuro_db` é um número num POST.

---

## Decisões tomadas (com o Jaques, antes de escrever)

| Questão | Decisão |
|---|---|
| Onde mora a rota | **Rota nova e solta**, não 4º passo da esteira |
| Motor | **Reusa `/api/domar`** + estágio novo de gosto por cima |
| Controle | **Mesa XY manda, knobs afinam** |
| Componentes | **Registry Visant** — nada escrito à mão |

---

## 1. Por que o motor não é novo

`dsp/domar.py` já ataca os três defeitos do esticado (ONDA, APITO, BRILHO) com limiares
calibrados contra o acervo real, e o cabeçalho manda não mexer neles. Escrever um
`/api/eq` do zero jogaria isso fora para reganhar a mesma coisa pior.

Mas o `domar` é **correção medida**: ele mede um defeito e conserta na proporção do
número. Grave realçado e reverb são **gosto**. O próprio módulo recusa isso por escrito:

> *"Nao comprime com ratio, nao satura, nao adiciona reverb. Cama nao leva efeito: leva
> correcao."*

Então a cadeia fica em dois estágios explícitos, e a tela mostra a divisa:

```
arquivo  ──▶  DOMAR (existe, correção)  ──▶  GOSTO (novo, escolha)  ──▶  saída
              notch de apito                 low shelf  (grave)
              shelf escuro   ◀── o chiado    reverb     (wet/decay)
              achatar
              alvo LUFS
```

**Isso não é purismo.** É o que permite dizer na tela "isto foi medido" e "isto foi você
que escolheu" — e é o que impede o próximo agente de recalibrar um limiar do acervo
porque alguém queria mais grave numa faixa.

### 1.1 O que muda no backend

`dsp/domar.py` — `cadeia()` e `domar()` ganham parâmetros, **sem tocar em limiar existente**:

| Param | Default | O quê |
|---|---|---|
| `grave_db` | `0.0` | low shelf, 0 = desligado (comportamento de hoje, intacto) |
| `grave_hz` | `110.0` | canto do shelf |
| `reverb_wet` | `0.0` | 0 = desligado |
| `reverb_decay` | `2.5` | segundos |

Entram na cadeia **depois** do shelf escuro e **antes** do achatador — achatar por último
continua garantindo que o nível final é o alvo, que é a razão da ordem atual.

`/api/domar` repassa os quatro. Como todos default 0/desligado, **nenhuma chamada
existente muda de resultado.**

### 1.2 O reverb — a única peça sem resposta pronta

ffmpeg não tem Freeverb. As saídas reais:

1. **`afir` (convolução)** com um IR curto — qualidade de verdade, custo: precisa do
   arquivo de IR. Dá pra gerar 3 IRs sintéticos (rajada de ruído + decaimento
   exponencial) com o próprio ffmpeg, uma vez, e versionar em `backend/assets/ir/`.
2. **`aecho` empilhado** — barato, metálico. Em cama longa isso aparece.
3. **Render no browser** com o `Tone.Reverb` que já existe no `fx-rack.ts` — mas 1 h em
   `OfflineAudioContext` é pesado e joga o render pro lado errado.

**Proposta: (1).** Três IRs — `curto` / `sala` / `catedral` — gerados por script, e o knob
DECAY escolhe entre eles + ajusta o wet. É o caminho ffmpeg-de-fábrica, coerente com o
"nenhum DSP escrito a mão" que o `domar.py` já defende.

> ⚠️ Único ponto do plano que ainda não está provado em código. Se o `afir` pesar demais
> numa faixa de 1 h, caio pro (3) só para o preview e mantenho (1) no render.

---

## 2. A UI — tudo do registry, nada escrito à mão

O `visant-ui.vercel.app` já tem o kit de áudio inteiro. **Não se escreve componente
nenhum nesta rota:**

| Peça | Papel na tela |
|---|---|
| `@visant/vintage-xy-pad` | a mesa. X = escuro ↔ brilho, Y = grave |
| `@visant/vintage-knob` | RVB, DECAY, ALVO |
| `@visant/vintage-parametric-eq` | a curva, em "avançado" — banda/ganho/Q, eixo x log |
| `@visant/vintage-meter` | LUFS medido, antes e depois |
| `@visant/vintage-oscilloscope` | a onda do trecho tocando |
| `@visant/vintage-led` | estado do job de render |
| `@visant/vintage-theme` | as vars `--vintage-*` que todas as peças acima consomem |
| `@visant/use-knob-drag` | hook, vem junto por dependência |

Elas já resolvem o que normalmente vira slop: o XY pad já tem **captura de ponteiro** e
**teclado** (seta 2%, Shift 10%), e já corrigiu o rótulo de 2,8:1 pra 5,4:1 de contraste.
O paramétrico já usa **eixo x logarítmico** e soma os sinos em dB — a curva desenhada é a
resposta, não uma ilustração dela. Reescrever isso à mão seria repagar bugs já pagos.

### 2.1 Anatomia da tela

Um gesto principal, e o resto é apoio. Nada de parede de knobs.

```
┌──────────────────────────────────────────────────────────┐
│  ARQUIVO  era-eno-2_…_chuva_1h.mp3        [ solta aqui ]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ┌────────────────────────┐    ANTES  ▁▃▅█▅▃  -16,0     │
│   │                        │    DEPOIS ▁▃▅▇▅▃  -16,0     │
│   │           ·            │ GRAVE                       │
│   │                        │  ▲          ○      ○     ○  │
│   └────────────────────────┘             RVB  DECAY ALVO │
│    ESCURO ──────── BRILHO                                │
│                                                          │
│   ~~~~~~~~~~~~~~ onda ~~~~~~~~~~~~~~   ▶ 0:42 / 60:00    │
├──────────────────────────────────────────────────────────┤
│  ▸ avançado — a curva, banda a banda                     │
├──────────────────────────────────────────────────────────┤
│  ● medido                          [ RENDERIZAR 1 H ]    │
└──────────────────────────────────────────────────────────┘
```

Regras que a tela obedece:

- **Um dedo resolve 80%.** A mesa carrega os dois eixos do pedido real: chiado e corpo.
- **O paramétrico fica fechado.** Quem quer nomear frequência abre; quem quer só tirar o
  chiado nunca vê. O de faders é o EQ de quem ouve, o paramétrico é o de quem mistura.
- **Preview é ao vivo, render é explícito.** Mexer na mesa muda o som na hora (Tone.js,
  browser). O botão de render é o único que gasta 1 h de ffmpeg — e ele diz isso no rótulo.
- **ANTES e DEPOIS coexistem.** Sem A/B um EQ é adivinhação. O BYPASS do paramétrico já
  faz isso na curva; o medidor faz no número.
- **A divisa medido/escolhido é visível.** O que o `domar` mediu aparece marcado como
  medido, e não como um knob que a pessoa pôs ali.

### 2.2 Preview ao vivo

`lib/fx-rack.ts` já tem a cadeia Tone.js com `reverbWet`, `reverbDecay`, `cutoff` e
`denoise`. O preview mapeia a mesa nela — não instancia nada novo. O render final vai pro
backend, que é a fonte de verdade; o preview é aproximação declarada como tal.

---

## 3. O encanamento que falta (isto é o trabalho real)

O `keyboard-ui` **não está pronto pra consumir o registry**. Medido agora:

```
components.json          não existe
alias @/                 não existe (nem vite.config.ts nem tsconfig.app.json)
src/lib/utils.ts (cn)    não existe
--vintage-* no CSS       0 ocorrências
```

Sem os quatro, `npx shadcn add @visant/vintage-xy-pad` instala um componente que importa
`@/lib/utils`, não resolve, e — quando resolver — renderiza sem cor nenhuma, porque toda
peça do kit consome `var(--vintage-*)`. **É o modo de falha nº 1 da skill do registry:
instala e parece quebrado.** Então a ordem é:

1. `src/lib/utils.ts` com `cn` (clsx + tailwind-merge — **as duas já estão no package.json**)
2. alias `@/` → `src/` no `vite.config.ts` **e** no `tsconfig.app.json` (os dois, senão o
   editor mente ou o build mente)
3. `components.json` com aliases + `"registries": { "@visant": "https://visant-ui.vercel.app/r/{name}.json" }`
4. `npx shadcn@latest add @visant/vintage-theme` **primeiro** — traz as `--vintage-*`
5. só então as peças

O projeto já tem `src/lib/vintage-components/` com cópias locais (`InteractiveKnob`,
`VintageMeter`, `VintageSlider`). **Não mexer nelas.** Retrofitar app que já roda é risco
sem receita; a rota nova consome do registry e as cópias antigas ficam onde estão. Se
alguma virar canônica depois, é outra tarefa.

> Nota pro próximo: `Z:\Cursor\Vintageuiuxlibrary` **também** tem uma pasta `keyboard-ui`.
> Não é duplicata — é fork, com contagem de arquivos e de painéis diferente. `diff -rq`
> antes de qualquer ideia de "reconciliar".

---

## 4. Rota

Sem router: `main.tsx` tem um mapa `views` por `pathname`. Entra uma linha.

```tsx
'/eq':  <Eq />,
'/eq/': <Eq />,
```

Arquivos novos: `src/eq/Eq.tsx`, `src/eq/ui.ts` (só se a rota precisar desviar do
`vintage-theme`), `src/eq/Eq.test.tsx`.

Entrada de arquivo: drop na tela + `/api/assets/list` pro acervo. `/api/audio/peaks` já
serve a onda.

---

## 5. Ordem de execução

| # | Passo | Prova de que funcionou |
|---|---|---|
| 1 | Encanamento do registry (§3) | `add @visant/vintage-theme` e as vars aparecem no CSS |
| 2 | Instalar as 7 peças | render de teste com cor, foco visível e teclado no XY |
| 3 | `grave_db`/`grave_hz` no `domar.py` + rota | job com `grave_db=0` sai **byte a byte** igual ao de hoje |
| 4 | IRs + `reverb_wet`/`reverb_decay` | as 3 IRs geradas, `afir` roda em 1 h em tempo aceitável |
| 5 | `Eq.tsx` com mesa + knobs + preview | mexer na mesa muda o som na hora |
| 6 | Medidor antes/depois + render + LED de job | render de 1 h fecha no alvo declarado |
| 7 | Paramétrico no "avançado" | curva bate com o que o ffmpeg fez |
| 8 | `/visant-killer` na rota | nota, e o que ela apontar |

Testes: `Eq.test.tsx` no padrão do `Fabrica.test.tsx`, mais um `a11y.test.tsx` no padrão
do `Tocar.a11y.test.tsx` (teclado na mesa é requisito, não bônus).

---

## 6. O que este plano NÃO faz

- Não mexe nos limiares do `domar.py`. Eles são do acervo.
- Não retrofita `lib/vintage-components/` nem o `AnalogBrainPanel`.
- Não toca na esteira do `/fabrica`.
- Não escreve componente de UI. Se algum faltar, **colhe pro registry primeiro** e
  consome de lá — não escreve local.

---

# EXECUTADO — 2026-08-31

Tudo do plano foi feito, menos o paramétrico (§7, com motivo abaixo). O que a
execução ENSINOU e o plano não sabia:

## 1. O `afir` não faz dry/wet, e isso quase passou

O plano dizia "usa `afir` com `dry`/`wet`". Errado, e o erro era silencioso: o render
saía no alvo de LUFS certinho, então parecia funcionar. Medido:

| tentativa | resultado |
|---|---|
| `afir=dry=1:wet=0.3:irnorm=1` | saída a **−53,7 LUFS**, nivelador compensando **+37,7 dB** |
| `afir=dry=0:wet=1` (qualquer `irnorm`) | −70,0 LUFS — cauda muda |
| `irnorm` 1 / 0 / −1 | −47,1 / +2,9 / +0,5 LUFS **no mesmo material** |

Amplificar 38 dB no fim levanta o chão de ruído junto — o defeito exato que esta rota
existe pra combater. Um EQ que conserta chiado reintroduzindo chiado.

**Conserto:** o `afir` devolve praticamente só a cauda, então a mistura passou a ser
explícita — `asplit` + `amix=weights=1 <wet>:normalize=0`. O seco passa em ganho 1
**sempre**; a cauda entra pesada. Resultado = `seco + w·cauda`, que é o que um dry/wet
deveria fazer, e o seco nunca perde nível aconteça o que acontecer com a cauda.

**E `irnorm=-1` não é gosto, é requisito.** Com o default (`irnorm=1`) o filtro
normaliza o IR por dentro e a amplitude do arquivo vira irrelevante: o mesmo material
com dois IRs separados por 20 dB deu **−47,1 LUFS nos dois**. A calibração seria
descartada em silêncio e o reverb sairia inaudível — medido, correlação **1,0000** com
o seco. Está escrito no docstring do `_calibra` pra ninguém "arrumar" pro default.

Depois do conserto: nivelamento **−4,1 dB** (era +37,7), correlação **0,858**,
diferença a −5,4 dB. O reverb existe e o seco não paga por ele.

## 2. O risco que o plano marcou não existia

`afir` em 1 h de áudio: **4,7 s, 769× tempo real**. O fallback pro Tone.js não foi
preciso. Gerar+calibrar um IR novo: 0,2 s, cacheado em `backend/assets/ir/`.

## 3. O paramétrico ficou de fora, de propósito

`vintage-parametric-eq` modela cada banda como **sino** (peaking). A cadeia daqui é de
**shelves**. Desenhar sinos pra representar shelves seria uma curva que mente — e a
peça se vende justamente por "a curva desenhada é a resposta, não uma ilustração dela".
Melhor não ter gráfico que ter gráfico errado. O arquivo foi removido; é um
`shadcn add` de distância se algum dia a cadeia ganhar bandas de verdade.

No lugar dele entrou o que é honesto: **espectro FFT ao vivo** (`vintage-oscilloscope`
com o `AnalyserNode` no FIM da cadeia, pra mostrar o que sai e não o arquivo) e
**medidores** antes/depois (`vintage-meter`, `readOnly`).

## 4. O encanamento tinha uma armadilha a mais

Além dos quatro itens previstos, faltava `paths` no **`tsconfig.json` raiz**: o shadcn
CLI lê ele (não o `tsconfig.app.json`) pra resolver os aliases do `components.json`.
Sem isso ele criou uma pasta literal chamada `@`. Está comentado no arquivo.

## 5. Ver a tela mudou o eixo do grave

Só olhando é que apareceu: com o eixo 0…+10, o repouso (grave = 0) deixava o punho
**encostado na borda de baixo**, cortado ao meio e por cima dos rótulos. Controle cujo
repouso mora na quina parece quebrado antes de alguém tocar nele. Virou **bipolar,
−6…+10** — que de quebra torna "tirar grave" possível, e é um pedido tão legítimo
quanto pôr.

## Provas

| O quê | Como ficou |
|---|---|
| Render sem os params novos | **byte a byte idêntico** ao código anterior (md5) |
| Suíte do backend | **143 passando** (+7 novos no `test_domar.py`) |
| Suíte do front | **72 passando** (+6 novos em `Eq.test.tsx`) |
| Typecheck | 75 erros, **idênticos ao baseline** — nenhum novo |
| Build | passa |
| Gesto na tela | arrastar move `−7,0/+0,0` → `−9,9/+6,3`; teclado move (teste estrito) |
| Console | sem erros |

## 6. Dois defeitos que só apareceram com som passando

Testes, typecheck e build passavam com os dois presentes. Nenhum aparece sem alguém
dar play.

**Silêncio total por cross-origin.** O áudio vem do backend (`:5000`) e a página roda
no vite (`:5173+`) — origens diferentes. `createMediaElementSource` num elemento
cross-origin sem CORS declarado marca a mídia como contaminada e o nó passa a emitir
**zeros**: o player anda, a duração corre, o console fica limpo, e não sai nada. O
`/api/preview` já devolvia `Access-Control-Allow-Origin: *`; o que faltava era o
elemento **pedir** em modo CORS. Conserto: `crossOrigin="anonymous"` no `<audio>`.

**O `mode` do osciloscópio não vale com analisador ao vivo.** Com um `AnalyserNode`
a peça chama SEMPRE `getFloatTimeDomainData`, seja qual for o `mode` — não existe
nenhuma chamada a `getFloatFrequencyData` no arquivo. Pedir `fft` entrega amostras de
tempo a um desenho que espera magnitude em dB, e sai uma parede cravada no talo em
toda a banda. A rota passou a usar `mode="wave"`, que é o que de fato chega.

> Isto é bug do item do registry, não desta rota. A correção canônica é lá
> (`@visant/vintage-oscilloscope`): ou `fft` lê `getFloatFrequencyData`, ou o modo
> não deveria ser aceito junto com `analyser`.
