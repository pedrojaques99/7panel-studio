# PLAN: Jam Bridge — co-composição Claude Code CLI ↔ AnalogBrain

> Um cano entre o terminal (Claude) e o painel Strudel que já roda no browser.
> Objetivo: jam a dois. Eu escrevo padrão, você ouve e edita, no MESMO buffer.

## Realidade do que já existe (não reinventar)

| Peça | Onde | Estado |
|---|---|---|
| REPL Strudel (eval, bpm, LPF/HPF/delay, capture bus) | `src/lib/strudel-service.ts` | pronto |
| Editor + chat Gemini + jam mode + knobs | `src/components/AnalogBrainPanel.tsx` | pronto (editor = `<textarea>`) |
| Manipulação de código por camada (`extractTweakLayers`, `setLayerGain`, `addLayerToStack`) | `src/lib/gemini-client.ts` | pronto — **reusar, é o parser de layers** |
| Bridge processo-externo → UI (queue + poll) | `backend/dashboard_server.py:1179` (`/api/key-event`) | padrão validado a copiar |
| Samples locais mapeados pro Strudel | `/api/samples/strudel-map` | pronto |

Nada de yjs/CRDT/websocket novo. O modelo é **revisão numerada + poll**, igual ao key-event bridge.

---

## Fase 1 — Backend: sessão de jam (Flask, ~60 linhas)

`backend/dashboard_server.py`, novo bloco `# ── Jam bridge ──`:

- Estado em memória + persistido em `backend/jam_session.json`:
  `{ rev, code, author: "claude"|"user", message, bpm, playing, error, ts }`
- `GET  /api/jam/state` → estado atual (o painel faz poll de 1s; e eu leio pelo CLI)
- `POST /api/jam/push` → `{code, author, message}` → `rev += 1`, empilha em histórico
- `POST /api/jam/feedback` → o painel devolve `{error, playing, bpm}` depois do eval
- `GET  /api/jam/log?n=20` → histórico das revisões (é o "git log" da música)

Regra dura: **ninguém sobrescreve ninguém.** O push só incrementa `rev`; quem decide
o que toca é sempre o painel (você).

## Fase 2 — Painel: slot de proposta (sem tocar no design system)

Em `AnalogBrainPanel.tsx`, reusando os componentes que já existem lá:

- Hook `useJamBridge()` (`src/hooks/`): poll 1s do `/api/jam/state`.
- `rev` novo com `author === "claude"` → **não** entra no editor. Cai numa faixa
  "Claude propôs rev N — <message>" com 3 ações: **Ouvir** (evaluate direto, sem
  gravar no editor) · **Aceitar** (vai pro editor) · **Descartar**.
- Toggle **AUTO-JAM**: aceita e toca sozinho. Pra quando você quiser só ouvir eu
  variando enquanto mexe nos knobs.
- Suas edições: debounce 800ms → `POST /api/jam/push` com `author:"user"`.
  Assim `jam get` no CLI me dá exatamente o que está soando aí.
- Depois de todo eval, `POST /api/jam/feedback` com `error` — **é isso que me deixa
  consertar o padrão sozinho** quando eu erro a sintaxe.
- Áudio é sagrado: o poll não passa perto do audio thread, só do estado React.

## Fase 3 — CLI: script `backend/jam.py` (o que eu uso)

```
python jam.py get                      # imprime o código que está soando
python jam.py push patterns/acid.js -m "acid bass 303, cutoff subindo"
python jam.py push - -m "..."          # via stdin (meu caso normal)
python jam.py log                      # histórico de revisões
python jam.py status                   # rev, bpm, playing, último erro
python jam.py watch                    # long-poll: me avisa quando VOCÊ edita
```

## Fase 4 — Biblioteca de padrões versionada

`patterns/` no repo: `*.js` com o padrão + header em comentário (bpm, gênero, notas).
Vira nosso repertório em git — dá pra voltar num take de duas semanas atrás.
`jam.py save <nome>` congela a rev atual como arquivo.

---

## Fora de escopo (deliberado)
- WebSocket / CRDT / edição simultânea caractere-a-caractere → poll resolve, latência de 1s é irrelevante em música de compasso.
- Eu "ouvir" o áudio → não tenho ouvido. Substituto: seu feedback + erro de eval + análise estática do padrão.

## Precisa da sua autorização (design system)
Trocar o `<textarea>` do editor por **`@strudel/codemirror` 1.3.0** (pacote oficial do
Strudel, mesmo minor dos que já estão no `package.json`): syntax highlight e **flash
do evento tocando** — em live coding a dois isso é a diferença entre ver e adivinhar.
Não mexo nisso sem seu OK.

## Ordem de entrega
1. Fase 1 + Fase 3 → em 10 min já dá pra eu empurrar padrão e você ouvir.
2. Fase 2 → o retorno (proposta/aceite/erro) que fecha o loop.
3. Fase 4 → repertório.
4. CodeMirror → só com autorização.

---

# STATUS — implementado em 2026-09-03

| Fase | Estado | Onde |
|---|---|---|
| 1. Backend | feito | `backend/dashboard_server.py` (bloco `# ── Jam bridge`), 7 rotas, estado em `backend/jam_session.json` |
| 2. Painel | feito | `src/hooks/useJamBridge.ts`, faixa de proposta + toggle `JAM/JAM:AUTO` em `AnalogBrainPanel.tsx` |
| 3. CLI | feito | `backend/jam.py` (status/get/push/log/watch/save/patterns/load), zero dependência externa |
| 4. Repertório | feito | `patterns/` + `jam.py save` |
| Editor CodeMirror | feito (autorizado) | `src/components/StrudelEditor.tsx` via `@strudel/codemirror@1.3.0` `initEditor`, highlight do evento tocando por `StrudelService.attachHighlight()` |

Testes: `backend/tests/test_jam_bridge.py` — 13 casos, pelo test client do Flask
(sem servidor, sem porta). Cobre rev/histórico, proposta≠aceita, erro de eval que
volta e é limpo na rev seguinte, bpm, save/load, path traversal recusado e
persistência entre reinícios.

Decisões tomadas com o dono do trabalho:
- Default é **proposta** (Ouvir / Aceitar / ✕). `AUTO-JAM` é toggle, nasce desligado.
- Feedback sonoro vem pelo chat (você fala) + erro de eval automático. Sem campo de
  nota no painel e sem espectro/RMS por camada — proxy fraco de gosto.

Decisão de implementação: usei `initEditor` e **não** `StrudelMirror`. StrudelMirror
traz o próprio `repl()`, que brigaria com o `StrudelService` (dois schedulers, dois
audio graphs). O highlight foi religado à mão com um `Drawer` de `drawTime [0,0]`.

## Três bugs que só apareceram rodando de verdade

1. **O painel atropelava a proposta no mount.** React StrictMode roda o effect duas
   vezes; a segunda passava do guard `firstPush` e empurrava o código do localStorage
   como rev de usuário, matando a rev do CLI. Aconteceu ao vivo: rev 1 → rev 2.
   Conserto: `mountCode` (código igual ao do mount não é edição) + `hydrated` (só
   empurra depois do primeiro poll).
2. **`document.hidden` desligava a bridge.** O poll pulava o fetch com a aba em
   background — e o painel do estúdio vive atrás do OBS. Proposta que só chega com a
   aba na frente é proposta que não chega. Agora poll sempre, 1s visível / 4s oculto.
3. **`--bpm` era no-op silencioso.** O feedback do painel sobrescrevia o bpm logo
   depois do push. Agora proposta do claude escreve `prop_bpm` (sugestão), aplicado só
   no ACEITAR; o bpm vivo continua sendo verdade do painel.

Validado no navegador com a aba **em background**: `jam.online` true, faixa
`claude · rev N` com OUVIR / ACEITAR / ✕, editor CodeMirror com gutter e highlight.
Testes: 14 passando.
