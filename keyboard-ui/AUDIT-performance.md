# Audit de Performance — Soundboard / AudioMixer / Keyboard

Foco: **RAM, CPU, rede, paint cost no browser.** Não inclui estética de código nem
arquitetura — só o que afeta uso de recurso do user.

Ranking por impacto (1 = mais pesado).

> **Status:** quick wins aplicados.  Build production estável: **717 KB / gzip 196 KB**.
>
> **Limpeza:** apagados `lib/ChannelStrip.tsx` (224 linhas dead code) e
> `components/SoundtrackPanel.tsx` (~430 linhas dead code com 3º AudioContext duplicado).
> App.tsx reduzido de 942 → 651 linhas (-31%) — bloco `{false && (...)}` fantasma e
> ~12 useState/funções órfãs apagados.  CSS 49.8 → 47.1 KB (-2.7 KB).
> Type-check sem erros novos nos 5 arquivos alterados.

---

## 🔴 CRÍTICOS (afetam baseline mesmo sem usar nada)

### 1. AudioMixer faz polling agressivo a 100 ms ✅ DONE
`src/components/AudioMixer.tsx:599`
```ts
const id = setInterval(fetchSessions, 100)
```
- **10 req/s** contra Flask `/api/audio/sessions`, sem parar, mesmo quando o painel
  está fora da tela ou o user está em outra janela.
- Cada fetch dispara: `r.json()` → `Map` merge → `setSessions` → re-render de
  todas as strips (cada uma com `VuMeter` de 24 segmentos = 24 divs).
- **Custo:** ~10 fetches/s + 10 re-renders/s × N apps de áudio (tipicamente 4–8).
- **Fix:**
  - Subir intervalo para **250–500 ms** (peak audio meter ainda parece fluido em
    250 ms; humano não percebe diferença abaixo de 120 ms).
  - Pausar quando `document.hidden === true` (evento `visibilitychange`).
  - Pausar quando `available === false` (já fica mostrando offline; segue pingando).

### 2. SbStrip simula VU meter com `setInterval(100ms)` por canal ✅ DONE (removido + memo)
`src/components/AudioMixer.tsx:431-436`
```ts
const id = setInterval(() => {
  const delta = (Math.random() - 0.5) * 0.2
  setPeak(Math.max(0, Math.min(1, base + delta)))
}, 100)
```
- VU **fake** com `Math.random()` — não reflete áudio real; só "agita" a barra.
- N canais soundboard tocando = N intervals × 10 setStates/s, cada um re-renderiza
  24 barras com gradient.
- **Fix:**
  - Ou conecta no `AnalyserNode` do soundboard (1 fonte real) e dispara via 1 RAF
    compartilhado (não setInterval por canal).
  - Ou remove a animação fake — sliderdrag já dá feedback suficiente.

### 3. Cascade de re-renders por `timeupdate` ✅ DONE (throttle 5Hz + RAF coalesce)
`src/components/AudioMixer.tsx:314`, `App.tsx:83`
- `Deck.timeupdate` (4–15 Hz) → `setState` interno → `emit()` → `onDeckStateChange`
  → `App.setDeckStates(prev => ({ ...prev, [keyId]: s }))` → **App inteiro
  re-renderiza** (12 KeyTiles + Mixer + Soundboard + sidebar).
- Mesmo padrão em `SoundboardPanel.tsx:414` com `setKeyStates(prev => new Map(prev))`.
- Com 3 áudios tocando: ~30–45 re-renders/s do `App`.
- **Fix:**
  - Mover `deckStates` pra um Context isolado, ou usar `useSyncExternalStore` com
    seleção por key (cada KeyTile só assina seu próprio `keyId`).
  - Throttle do `timeupdate` pra 5 Hz (suficiente pro display `0:23 / 3:45`):
    ```ts
    let last = 0
    a.addEventListener('timeupdate', () => {
      const now = performance.now()
      if (now - last < 200) return
      last = now
      setState(...)
    })
    ```

### 4. Long-poll de key-events sem pausa em background ✅ DONE
`src/App.tsx:122-147`
- Loop `while (active)` com fetch + `setTimeout(50)` entre polls. Long poll de 2 s
  é OK em teoria, mas:
  - Continua mesmo com aba minimizada / `document.hidden`.
  - Cumulativo com (1): ~12 req/s pro backend só pra existir.
- **Fix:**
  ```ts
  if (document.hidden) { await visibilityWakeup(); continue }
  ```
  Ou pausar via `document.addEventListener('visibilitychange', ...)`.

### 5. Dois `AudioContext` separados ✅ DONE (`lib/audio-context.ts`)
`SoundboardPanel.tsx:26` (`sbCaptureCtx`) e `AudioMixer.tsx:49` (`sharedCtx`).
- Cada `AudioContext` = thread de áudio dedicada + buffer pool + sample rate
  conversion.  Custo fixo de RAM (~5–10 MB) e 1 thread por context.
- **Fix:** Extrair pra `lib/audio-context.ts` singleton compartilhado entre
  Soundboard, Mixer e qualquer painel futuro.  Cada um cria seu próprio
  `MediaStreamAudioDestinationNode` no mesmo ctx (custo desprezível).

---

## 🟡 IMPORTANTES (pioram uso pesado)

### 6. `MockVisualizer` roda RAF a 60 fps continuamente ✅ DONE (cap 30fps + gradient cache + volRef + pausa em hidden)
`AudioMixer.tsx:138-164`
- Quando YouTube toca, vai pro mock visualizer (não tem `MediaElementSource` em
  stream cross-origin). RAF 60 fps + `Math.sin` × 14 + `Math.random` + canvas
  redraw com `createLinearGradient` por frame.
- Por deck mockado.  Se o user roda 3 streams YT: 3 RAF em paralelo, cada um
  alocando gradient/frame (180 alocs/s).
- **Bug latente:** `useEffect(..., [])` faz a closure capturar `volume` inicial e
  nunca atualizar — a barra reage ao volume só por sorte (sine + random).
- **Fix:**
  - Cap em 30 fps (a cada 2 frames).
  - Reusar gradient (não recriar por frame).
  - Mover `volume` pra ref e ler `volRef.current` dentro do RAF.
  - Pausar RAF quando `document.hidden`.

### 7. Style objects inline alocados em cada render
- `KeyTile.tsx:76-89` constrói objeto de ~10 props **por render**, multiplicado
  por 12 keys.
- `Deck` (AudioMixer:378-422) constrói ~15 objetos style por card.
- `ChannelStrip` (AudioMixer:486-522) constrói ~12 objetos por strip.
- Combinado com (3): ~3000 objetos style/s descartados pra GC.
- **Fix:**
  - Mover estilos estáticos pra constantes module-level (já faz isso em alguns
    lugares — `CANVAS_STYLE`, `inp`, `mixActionBtn`).
  - Para variantes, usar Tailwind/CSS classes em vez de inline (você já usa
    Tailwind no `App.tsx`).

### 8. Map allocation por timeupdate no Soundboard ✅ DONE (throttle 5Hz reduz a frequência)
`SoundboardPanel.tsx:414`
```ts
setKeyStates(prev => { const m = new Map(prev); ... })
```
- Por audio playing × 4–15 Hz × ciclo `keyStates` deps em outros effects → cada
  update aloca uma nova `Map<string, KeyState>` cheia.  N keys → O(N) cópia.
- **Fix:** Mover currentTime/duration pra refs (não precisa re-renderizar o
  panel inteiro pra atualizar a posição do VolBar — só pro display, que pode
  assinar via `useSyncExternalStore` ou um sub-componente memoizado).

### 9. AudioContext / Analyser sem teardown ✅ DONE (`disconnectFromCapture` em removeKey/loadMix)
- `SoundboardPanel.tsx:34` cria `MediaElementAudioSourceNode` por audio em
  `connectToCapture`, mas **nunca desconecta** quando a key é removida ou recarregada.
- `audioNodeMap` é `WeakMap`, mas o `<audio>` é mantido em `audioMap` (Map forte),
  então a source também fica.
- **RAM creep:** cada key adicionada/removida/re-load deixa um source pendurado.
- **Fix:** No `removeKey` e ao recarregar src, chamar `source.disconnect()` e remover
  do map.

### 10. Re-emit de `onChannelChange` em alta frequência
`SoundboardPanel.tsx:359-378`
- Effect com deps `[playingIds, keyStates]` — `keyStates` muda 4–15 Hz por audio
  playing, então `onChannelChange` dispara nessa frequência também → re-render
  do `App` → re-render do `AudioMixer` → re-render dos `SbStrip`.
- O array `channels` é **recriado do zero** com novas closures (`setVolume`,
  `seek`, `stop`) a cada chamada → invalida qualquer memo downstream.
- **Fix:**
  - Fechar funções via ref estável (uma única instância por keyId, mesmo identity).
  - Throttle ou só emite quando `playingIds` muda (volume/time não precisam ir
    pelo channel — o SbStrip pode ler direto de uma store).

---

## 🟢 MENORES (cleanup, ganhos pequenos mas fáceis)

### 11. `lib/ChannelStrip.tsx` é dead code ✅ DONE (apagado + também SoundtrackPanel.tsx órfão)
- 224 linhas com `ChannelStrip`, `VuMeter`, `VerticalFader`, `useMicMonitor`,
  `channelIcon`, `ICONS` duplicados do `AudioMixer.tsx` inline.
- Não é importado em lugar nenhum (`grep` em src).
- **Bundle:** ~6–8 KB minified extras.
- **Fix:** Ou usa o lib (extrai pro Mixer importar) ou apaga.  Vai contra
  `MEMORY.md → Always reuse existing logic`.

### 12. App.tsx grava 11 chaves no localStorage por toggle ✅ DONE (1 effect por chave)
`App.tsx:107-119`
- Único useEffect com 11 deps; qualquer toggle dispara 11 `setItem`.
- localStorage é **síncrono** — bloqueia main thread (microscópico, mas
  acumula).
- **Fix:** 1 useEffect por chave, ou debounce + 1 chave JSON única.

### 13. Resize listener dispara 3 setStates em cascata ✅ DONE (1 setState + RAF + early return)
`panel-context.tsx:41-48`
- A cada resize: `setFitScale` + `setAutoScale` + `setScaleOverride` (mesmo que
  não mude). Todos os consumidores do context renderizam 3×.
- **Fix:** Combinar em 1 `setState({ fit, auto, override })`.

### 14. `handleVolume` mantém `localVols` Map indefinidamente ✅ DONE (GC pids ausentes)
`AudioMixer.tsx:545, 605`
- Map nunca é limpo explicitamente; só quando o pid voltar do backend e o
  `expires` tiver passado.  Se um pid sumir do sistema, fica zumbi.
- **Fix:** Limpar em `fetchSessions` antes do merge: deletar PIDs ausentes.

### 15. `MockVisualizer` cria gradient por frame ✅ DONE (gradient cacheado por height)
`AudioMixer.tsx:155-158`
- `createLinearGradient` × 14 barras × 60 fps = 840 gradients/s, descartados.
- **Fix:** Cachear o gradient ao montar; só repintar `fillStyle`.

### 16. `Deck` com `display: none` continua montado
`App.tsx:695` mounta os Decks num `<div style={{ display: 'none' }}>`.
- O componente continua vivo: states, refs, listeners — mas o user não vê.
- Hoje é necessário pra controlar áudio do keyboard.  **Não é bug**, mas:
- Cada Deck adiciona 1 audio element + 1 MediaElementSource + 1 Analyser.
- 12 keys → 12 nodes mesmo se nada toca.
- **Fix:** Lazy-create o `<audio>` só no primeiro `toggle()` (já faz isso) — mas
  os listeners React continuam.  OK por ora.

---

## Resumo: 5 mudanças, ~70% do ganho

Se priorizar por **esforço × impacto**, faz só estas:

| # | Mudança | Esforço | Ganho |
|---|---------|---------|-------|
| 1 | `setInterval(fetchSessions, 100)` → `250` + pausa em `document.hidden` | 5 min | -60% req/s, -60% renders ociosos |
| 2 | Throttle `timeupdate` pra 5 Hz nos Decks e no Soundboard | 10 min | -75% re-renders durante playback |
| 3 | `AudioContext` único compartilhado | 15 min | -1 thread, -5 MB RAM |
| 4 | Apagar `lib/ChannelStrip.tsx` (dead code) | 1 min | -7 KB bundle |
| 5 | RAF cap 30fps em `MockVisualizer` + cache gradient | 10 min | -50% paint cost com YT |

Tempo total: ~40 min.  Resultado: app fica notavelmente mais leve com aba em
background e durante playback ativo.
