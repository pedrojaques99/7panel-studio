# Streamer Focus — Plano

> App de foco em live/stream dentro do ecossistema Jaques. **Não é um app novo separado** —
> é um **modo/rota** dentro do `keyboard-ui` (`:5174`), exposto como card próprio no launcher.
> Zero duplicação de código, reusa canvas + panel-system + backend `:5000`.

---

## 1. Por que "modo/rota" e não app separado

Os panels de stream já existem no 7Panel, mas estão **acoplados** ao motor compartilhado:

- Mesmo canvas (`react-zoom-pan-pinch`), `panel-context`, `geo`, presets, `PanelHeader`.
- Backend único `:5000` (`dashboard_server.py`) + `yt_bot.py`.
- **Os overlays (OBS browser sources) falam com os panels via `localStorage` same-origin.**
  `OverlayPinned` lê `overlay:pinned`, `OverlayChat` lê o chat, etc. Isso **só funciona na mesma origin `:5174`.**

Um app standalone (`:5175`) teria que copiar todo o motor **e** quebraria a ponte de overlays.
Decisão travada: **rota `/streamer` no mesmo app** + card no launcher. Segue o princípio "não reinventar a roda".

---

## 2. Escopo (o que aparece no Streamer Focus)

| Categoria | Peças | Status |
|---|---|---|
| **Panels** | `obs`, `ytchat`, `briefing`, `timer` | ✅ já existem — só filtrar |
| **Bot control** | start/stop + comandos + banned words do `yt_bot.py` | 🆕 painel novo + endpoints |
| **Overlays existentes** | `/overlay/chat`, `/overlay/briefing`, `/overlay/timer`, `/overlay/pinned` | ✅ já funcionam (same-origin) |
| **Overlays de live novos** | poll/slider, caixa de pergunta (Q&A) | 🆕 fase opcional (design system) |

**Fora de escopo:** soundboard, mixer, synth, drum, visualizer, etc. (ficam só no 7Panel).

---

## 3. Mudanças arquivo-a-arquivo

### 3.1 `keyboard-ui/src/main.tsx` — nova rota
Adicionar `/streamer` renderizando `<App mode="streamer" />` (mesmo componente, prop nova).

```tsx
// path === '/streamer'  →  <App mode="streamer" />
const isStreamer = window.location.pathname.startsWith('/streamer')
// ... views[path] ?? <App mode={isStreamer ? 'streamer' : 'studio'} />
```

### 3.2 `keyboard-ui/src/App.tsx` — filtro de panels por modo
Reusar **exatamente** o mecanismo que já existe pra cloud (`LOCAL_ONLY_PANELS` +
`.filter(p => !IS_CLOUD || ...)`). Adicionar:

```ts
const STREAM_PANELS = new Set<PanelId>(['obs', 'ytchat', 'briefing', 'timer', 'bot'])
// App(props: { mode?: 'studio' | 'streamer' })
// no panelDefs useMemo, encadear:
//   .filter(p => props.mode !== 'streamer' || STREAM_PANELS.has(p.id))
```

- Sidebar mostra só os panels de stream no modo streamer.
- Home button (`localhost:4000/launcher.html`) permanece — volta pro launcher.
- **Layout inicial:** aplicar um preset "stream" default na 1ª carga do modo (posições fixas de OBS/Chat/Briefing/Timer). Usar `applyPositions()` de `presets.ts` com um preset embutido, gated por `localStorage 'streamer-initialized'` pra não sobrescrever o layout do usuário depois.

### 3.3 `launcher.html` — novo card
Adicionar card "Streamer Focus" → `http://localhost:5174/streamer`, com ping de status (reusa o `s-panel` pattern; mesmo servidor, então online = 7Panel online).

```html
<a class="card" href="http://localhost:5174/streamer">
  <span class="icon">🔴</span>
  <span class="name">Streamer Focus</span>
  <span class="port">:5174/streamer</span>
</a>
```

### 3.4 `jaques.vbs` — nada de novo pra subir
O `:5174` e o `yt_bot.py` **já sobem hoje**. Não precisa de processo novo.
(Opcional) adicionar comentário marcando que `/streamer` é servido pelo mesmo `npm run dev`.

### 3.5 Bot control (🆕) — `backend/dashboard_server.py` + painel
`yt_bot.py` roda como processo solto. Pra controlar pelo Streamer Focus:

- **Backend:** 3 endpoints em `dashboard_server.py`:
  - `GET  /api/bot/status` → rodando? último erro? nº de mensagens processadas.
  - `POST /api/bot/toggle` → start/stop do processo `yt_bot.py` (via `subprocess`, tracked como os jobs `_conv_jobs`/`_ytdl_jobs` já fazem).
  - `POST /api/bot/config` → grava `bot_config.json` (video_id, comandos, banned_words).
- **Frontend:** `components/BotPanel.tsx` (`id: 'bot'`) — usa **seu design system** (`PanelHeader`, `closeBtnStyle`, tokens). Status pill + toggle + editor de comandos/banned.

> ⚠️ Componentes novos = seu design system. **Não crio/edito componentes sem sua permissão** —
> o `BotPanel` seria montado só com primitives já existentes (`PanelHeader`, botões dos panels atuais). Confirmar antes.

### 3.6 Overlays de live novos (🆕 — fase opcional)
Você citou "slider, pergunta, etc". Dois overlays novos, seguindo o padrão same-origin já provado:

- `overlay/OverlayPoll.tsx` (`/overlay/poll`) — enquete/slider, lê `overlay:poll` do localStorage.
- `overlay/OverlayQuestion.tsx` (`/overlay/question`) — caixa de pergunta destacada, lê `overlay:question`.
- Painel de controle: botões dentro do `OBSControlPanel` (ou um `LiveOverlaysPanel`) que escrevem esses localStorage keys — **mesmo mecanismo do `OverlayPinned` atual**.

> Esta fase mexe em UI visível na live → **design system obrigatório + sua aprovação de layout** antes.

---

## 4. Fases de execução

| Fase | Entrega | Risco |
|---|---|---|
| **1 — Rota + filtro** | `/streamer` funcional com obs/chat/briefing/timer filtrados + card no launcher | baixo (reusa filtro cloud) |
| **2 — Preset default** | Layout stream inicial auto-aplicado 1x | baixo |
| **3 — Bot control** | endpoints `/api/bot/*` + `BotPanel` | médio (subprocess + design system) |
| **4 — Overlays novos** | poll + question overlays (opcional) | médio (design system + aprovação) |

Fases 1–2 entregam o "Streamer Focus" utilizável já. 3 e 4 são incrementais.

---

## 5. Riscos & notas

- **Overlays dependem de same-origin `:5174`** — não mover pra outra porta. ✅ garantido pelo approach.
- **Preset default não pode pisar no layout do usuário** — gate por `localStorage`.
- **Bot subprocess:** reusar o padrão de jobs trackados já existente em `dashboard_server.py` (não inventar gerenciador de processo novo).
- **Design system:** `BotPanel` e overlays novos precisam da sua confirmação antes de montar.
- **Cloud mode:** `STREAM_PANELS` inclui `obs/ytchat/briefing` que já são `LOCAL_ONLY` — no deploy cloud o `/streamer` fica vazio (esperado; é ferramenta local).

---

## 6. Checklist de arquivos tocados

- [ ] `keyboard-ui/src/main.tsx` — rota `/streamer`
- [ ] `keyboard-ui/src/App.tsx` — prop `mode` + `STREAM_PANELS` + preset default
- [ ] `launcher.html` — card Streamer Focus
- [ ] `jaques.vbs` — comentário (opcional)
- [ ] `backend/dashboard_server.py` — `/api/bot/status|toggle|config` *(fase 3)*
- [ ] `keyboard-ui/src/components/BotPanel.tsx` *(fase 3, design system)*
- [ ] `keyboard-ui/src/overlay/OverlayPoll.tsx` + `OverlayQuestion.tsx` *(fase 4, opcional)*
</content>
</invoke>
