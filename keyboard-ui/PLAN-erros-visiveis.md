# PLAN — erro de som virar recado, não silêncio

## O sintoma que abriu isto

No console de `/musica`, tocando `xtal-vidro`:

```
[getTrigger] error: sound vhulto_sampling_the_world_drumkit_kick not found! Is it loaded?
Error: sound vhulto_sampling_the_world_drumkit_kick not found! Is it loaded?
```

…repetido uma vez por evento. Na tela: **nada**. O relógio anda, a linha do tempo
desenha, o take "toca" — e não sai som. Quem não é dev procura o defeito no
volume, no take, na placa de som. Em tudo menos no lugar certo.

Medido enquanto isto foi escrito: o backend **estava de pé** e o mapa **tinha** a
chave certa (`vhulto_sampling_the_world_drumkit_kick`, 9 arquivos, entre 243
bancos). Ou seja: não é "o nome está errado no take". É a janela entre a aba
abrir e o banco entrar — ou um soluço de uma requisição só — e disso não sobrava
nenhum sinal na tela.

## O que já existe (e não vou refazer)

- `strudel-service.ts` já tem `samplesLocais: carregando|ok|falhou` + `samplesErro`
  + `bancosCaidos`, e `Musica.tsx` já pinta a faixa de aviso com botão de reparo.
- `consulta.ts: camadasSemSom()` já marca a camada muda na linha do tempo.
- `sonsConhecidos()` já lê a **união** das duas cópias de `soundMap`.

O buraco é outro: **quando o banco carrega bem e mesmo assim um evento falha**,
nada disso dispara. E quando falha na hora de carregar, o conserto depende de a
pessoa notar a faixa e clicar.

## As quatro mudanças

### 1. Frontend — ouvir o log do próprio Strudel (cobre TODO o padrão)

`@strudel/core/logger.mjs` despacha `document` → `CustomEvent('strudel.log')` em
todo `errorLogger`. É gancho **oficial**, não macaqueação de `console`. Todo erro
de runtime do agendador passa por ali, inclusive o `not found`.

Novo `src/lib/diagnostico.ts`:

- assina `strudel.log`, agrupa por mensagem (o mesmo erro vem 1×/evento) e conta;
- reconhece `sound X not found` e guarda o nome do som separado;
- expõe `assinar(cb)`, `limpar()` e `problemas()`.

Nada de React aqui — módulo puro, testável, igual `consulta.ts`.

### 2. Frontend — dizer o que escrever no lugar

`src/musica/sons.ts`:

- `sonsDoCodigo(code)` → todo nome dentro de `s("...")`/`sound("...")`, inclusive
  mini-notation com vários (`s("bd sd")`, `<a b>`, `a:3`);
- `parecido(nome, conhecidos)` → sugestão via **`fastest-levenshtein`** (lib
  validada, já instalada como dependência direta) com teto de distância — sem
  sugestão ruim, melhor nenhuma;
- `conferir(code, conhecidos)` → os nomes que não existem, cada um com sugestão.

Roda **no evaluate**, antes de tocar: o nome errado aparece na hora, não depois
de 200 eventos mudos.

### 3. Frontend — o painel, escrito pra quem não é dev

Faixa nova em `Musica.tsx`, acima do transporte, irmã da que já existe:

```
⚠ o som “vhulto_sampling_the_world_drumkit_kikc” não existe no motor   (42×)
  quis dizer vhulto_sampling_the_world_drumkit_kick?   [trocar no código]
```

e, quando o banco é que não entrou:

```
⚠ o banco local não carregou — por isso o take toca mudo   [tentar de novo]
```

`[trocar no código]` reescreve o texto. Mesma regra do resto da rota: **o que a
tela muda, a pessoa vê aparecer escrito**.

### 4. Prevenção — os dois lados

**Frontend:** `loadLocalSamples` passa a **repetir sozinho** (3 tentativas,
1s/3s/8s) antes de declarar `falhou`. Causa nº 1 da falha é o backend subindo
depois da aba; repetir sozinho conserta antes de virar pergunta.

**Backend (`dashboard_server.py`):**

- `_ALLOWED_SAMPLE_ROOTS` passa a ser calculado **no import**, não dentro de
  `/api/samples/strudel-map`. Hoje, um reload do servidor com a aba já aberta faz
  `/api/samples/file` responder **403** em tudo até alguém pedir o mapa de novo —
  isto é exatamente a mesma doença: sample some, sem recado;
- o mapa ganha **cache** (a varredura são 243 bancos / milhares de arquivos) com
  `?fresh=1` pra forçar;
- `/api/samples/health` novo: quantos bancos, quantos arquivos, quais raízes
  existem e quais não, e uma lista de `avisos` em português. É o que a faixa da
  tela mostra quando o mapa vem vazio, no lugar de "não sei".

## Fora de escopo, de propósito

- Não vou mexer no grafo de áudio nem no agendador.
- Não vou inventar componente novo do design system — a faixa usa a mesma
  anatomia da faixa de samples que já está lá.
- Não vou tentar de-duplicar o mojibake do `ambient` (`Emaús`/`Ema?s` aparecem
  duas vezes no mapa): é outro defeito, de outra pasta, e cabe em outro passo.

## Como se confere

- `npm run test` (vitest) — testes novos para `diagnostico.ts` e `sons.ts`;
- `npm run typecheck`;
- na mão: subir a rota com o backend **desligado**, ver a faixa; ligar o backend,
  ver a auto-reparação; escrever `s("vhulto_kikc")` e ver a sugestão.

---

## Feito — o que ficou no disco

| arquivo | o quê |
| --- | --- |
| `src/lib/diagnostico.ts` | ouve `strudel.log`, agrupa e conta. Novo. |
| `src/musica/sons.ts` | lê os nomes do código, sugere o parecido, troca no texto. Novo. |
| `src/musica/Problemas.tsx` | a faixa. Novo. |
| `src/lib/strudel-service.ts` | confere antes de tocar; repete o banco sozinho 3× (1s/3s/8s); pergunta a causa ao `/health` quando o mapa vem vazio. |
| `src/musica/Musica.tsx` | monta a faixa e liga o `trocar no código`. |
| `backend/dashboard_server.py` | raízes no import (fim do 403 mudo), cache do mapa, `/api/samples/health`. |
| `src/lib/diagnostico.test.ts`, `src/musica/sons.test.ts` | 36 testes novos. |

Conferido:

- `npx vitest run` → **534 testes, 25 arquivos, tudo passa** (36 são novos);
- `npx tsc -b` → nenhum erro nos arquivos tocados (o repo já tinha erros antigos
  em `SynthPanel`, `DrumMachinePanel`, `RetroTVPanel` — não mexi neles);
- `npx eslint` nos três arquivos novos → limpo;
- backend pelo `test_client`, medido:
  - `/api/samples/health` → `ok: true, 243 bancos, 2567 arquivos`, as duas raízes
    contadas em separado;
  - áudio pedido **antes** do mapa → **200** (era 403);
  - mapa frio 0,05 s → em cache 0,001 s.

**Falta um passo manual:** o `dashboard_server.py` que está de pé na porta 5000
ainda roda o código velho (`/api/samples/health` responde 404 nele). Reiniciar.

---

## O que a prova na tela revelou (e virou conserto nº 5)

Testado no navegador, em `localhost:5174/musica`, com `xtal-vidro` tocando:
trocar `_kick` por `_kikc` → Ctrl+Enter → a faixa acusa e sugere → clicar
`trocar no código`.

O código voltava certo, **mas a faixa continuava acusando e o contador subia**
(35× → 38× em 2,5 s). Causa: o take NO AR ainda era o antigo. O texto estava
consertado e o motor seguia errando — e quem lê isso lê "eu já troquei e ele
insiste", e passa a desconfiar do botão.

Conserto: `trocar no código` reavalia **se já estava tocando**. Reavaliar é
barato e é em fase (ver `camadas.ts`), então o som volta sem o relógio pular.
Parado continua parado — botão de conserto de texto que começa a tocar sozinho
faz duas coisas, e a segunda ninguém pediu.

Medido depois do conserto: clicar → linha 20 volta a `..._kick` e a faixa
**some** (lista vazia, nenhum erro novo chegando).

Este defeito não aparece em teste unitário nenhum. Só aparece com o dedo.
