# Audio Mixer Panel — Plano de Implementação

## Objetivo
Adicionar um painel de mixagem de áudio estilo OBS à interface, mostrando os programas ativos com áudio, o que está tocando, slider de volume por app, e botão para ocultar da UI.

---

## Stack
- **Backend:** `pycaw` (Windows WASAPI bindings para Python) + `psutil` para nomes de processo
- **Frontend:** Novo componente `AudioMixer.tsx` com polling e design vintage inline

---

## Backend — `dashboard_server.py`

### Novas dependências
```
pip install pycaw psutil comtypes
```

### Novos endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/audio/sessions` | Lista sessões ativas com volume, mute, nome do processo |
| POST | `/api/audio/sessions/volume` | `{ pid, volume: 0.0–1.0 }` — seta volume |
| POST | `/api/audio/sessions/mute` | `{ pid, muted: bool }` — toggle mute |

### Estrutura de retorno de `/api/audio/sessions`
```json
[
  {
    "pid": 1234,
    "name": "chrome.exe",
    "display_name": "Google Chrome",
    "volume": 0.75,
    "muted": false,
    "peak": 0.42
  }
]
```

---

## Frontend — `AudioMixer.tsx`

### Funcionalidades
- Polling a cada 500ms em `/api/audio/sessions`
- Slider de volume por app (0–100%)
- Botão mute por app
- Botão "ocultar" (eye-off) — persiste no localStorage
- Botão para mostrar apps ocultos
- Medidor de peak animado (VU meter) estilo vintage
- Design inline com a paleta existente (dark bg, cyan accents, Red_Hat_Mono)

### Layout — Estilo OBS
```
┌─────────────────────────────────────────────┐
│  AUDIO MIXER                          [⚙]   │
├──────────┬──────────┬──────────┬────────────┤
│ [icon]   │ [icon]   │ [icon]   │            │
│ Chrome   │ Spotify  │ Discord  │            │
│ ████░░░  │ ██████░  │ ███░░░░  │            │
│ [====]   │ [====]   │ [====]   │            │
│  75%     │  100%    │  50%     │            │
│ [M] [👁] │ [M] [👁] │ [M] [👁] │            │
└──────────┴──────────┴──────────┴────────────┘
```

---

## Integração em `App.tsx`
- Adicionar `<AudioMixer />` abaixo do grid de botões existente
- Seção colapsável com título "AUDIO MIXER"

---

## Arquivos a modificar/criar

1. `dashboard_server.py` — adicionar endpoints de áudio
2. `src/components/AudioMixer.tsx` — novo componente (criar)
3. `src/App.tsx` — importar e renderizar `<AudioMixer />`

---

## Ordem de execução

1. Backend: adicionar imports + 3 endpoints
2. Frontend: criar `AudioMixer.tsx`
3. Frontend: integrar em `App.tsx`
