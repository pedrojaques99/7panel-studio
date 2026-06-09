# PLAN: StrudelLM Panel — "AnalogBrain"

> LLM-powered live-coding music via Strudel + retro CRT visualizer integrado + export/render/gravar
> UI: cientista maluco analógico, painel de laboratório vintage com tubos de vácuo e osciloscópios

---

## Conceito

Um painel que combina:
- **Chat com Gemini** (BYOK) para gerar padrões musicais em Strudel code
- **Player Strudel** integrado que executa os patterns em tempo real (Web Audio)
- **Mini-visualizer CRT** embutido no painel (reusa engine do RetroTV)
- **Roteamento de áudio** via Capture Bus (qualquer panel pode capturar o áudio)
- **Export/Render/Gravar** direto do painel

---

## Referência: StrudelLM

- **Repo**: https://github.com/tambo-labs/strudellm
- **Core**: usa `@strudel/web` + `@strudel/core` + `@strudel/codemirror` pra live-coding musical
- **LLM Integration**: prompt de sistema com teoria musical + gêneros + mini-notation do Strudel
- **Auto-correção**: se o código gerado dá erro, o LLM corrige automaticamente
- **Samples**: biblioteca enorme de sons (drums, synths, FX, vocals)

O que vamos REUSAR do conceito:
- O **system prompt** musical (adaptado pro Gemini)
- A lógica de **validação + auto-correção** de código Strudel
- A biblioteca de **samples** do Strudel
- O **evaluate pattern** pipeline

O que NÃO vamos usar:
- Tambo (framework de agentes deles) — substituímos por chamada direta ao Gemini API
- Next.js / auth / DB — não precisamos, é tudo client-side

---

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│              AnalogBrain Panel                   │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │  Chat Area   │  │  CRT Mini-Visualizer   │   │
│  │  (prompt →   │  │  (reusa visualizer     │   │
│  │   gemini →   │  │   engine + post-fx)    │   │
│  │   strudel    │  │                        │   │
│  │   code)      │  │  ┌──────────────────┐  │   │
│  │              │  │  │ scanlines, glow,  │  │   │
│  │  [textarea]  │  │  │ chromatic, bloom  │  │   │
│  │  [send btn]  │  │  └──────────────────┘  │   │
│  │              │  │                        │   │
│  │  AI msgs     │  │  ♦ Play ♦ Stop ♦ BPM  │   │
│  │  w/ code     │  │  ♦ Rec  ♦ Export       │   │
│  └──────────────┘  └────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Strudel Code Editor (mini, collapsible) │   │
│  │  CodeMirror + Strudel syntax             │   │
│  │  [Editable — user can tweak AI output]   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Control Strip (retro knobs & switches)  │   │
│  │  [Vol] [BPM] [Genre] [Complexity]        │   │
│  │  [API Key 🔑] [Model Select]             │   │
│  │  [→ Send to TVPanel] [→ Capture Bus]     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
         │                      │
         ▼                      ▼
    Capture Bus            Note Bus
    (audio stream)         (notas → SynthPanel)
```

---

## Stack Técnico

### Dependências Novas
```
@strudel/web          — engine principal (Web Audio patterns)
@strudel/core         — pattern evaluation
@strudel/mini         — mini-notation parser
@strudel/codemirror   — syntax highlight + autocomplete
@strudel/soundfonts   — instrument samples
```

### Gemini BYOK
- Chamada direta à **Gemini API REST** (não precisa de SDK pesado)
- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- API key salva em localStorage (criptografada com password do user)
- Modelos: `gemini-2.5-flash` (default), `gemini-2.5-pro` (opcional)
- Streaming via `streamGenerateContent` pra resposta progressiva

### Reuso do Projeto Existente
| O que | De onde | Como |
|-------|---------|------|
| Visualizer engine | `lib/visualizer-engine.ts` | Instância mini no painel |
| Post-FX shaders | `lib/visualizers/post-fx-shaders.ts` | CRT, scanlines, bloom |
| Retro design tokens | `lib/retro-tokens.ts` | Knobs, LEDs, chassis |
| SynthKnob | `lib/SynthKnob.tsx` | Controles rotativos |
| Capture Bus | `lib/capture-bus.ts` | Registrar como source |
| Note Bus | `lib/note-bus.ts` | Publicar notas p/ SynthPanel |
| Audio Context | `lib/audio-context.ts` | Compartilhar contexto |
| Panel registration | `App.tsx` panelDefs | Lazy-load novo panel |
| Recording/Export | RetroTVPanel recording logic | MediaRecorder + canvas |

---

## UI Design: "Laboratório Analógico"

### Estética
- **Chassi**: metal escovado escuro (grafite) com parafusos hex expostos
- **Tela CRT**: vidro curvo com borda grossa, phosphor green glow
- **Indicadores**: VU meters de agulha, LEDs âmbar piscantes
- **Chat area**: terminal verde-sobre-preto (phosphor P1), fonte monospace
- **Knobs**: bakelite marrom com indicador branco, legenda gravada
- **Switches**: toggle metálicos de 3 posições (gênero, modo)
- **Label "AI BRAIN"**: placa de metal com texto embossed
- **Cables**: linhas SVG simulando patch cables entre seções
- **Status**: tubo de vácuo que "acende" quando o AI processa (glow animation)

### Layout Zones
1. **Top Bar**: título "ANALOG BRAIN mk.II" + LED status + power switch
2. **Left**: Chat terminal (60% width quando expandido)
3. **Right**: CRT visualizer (canvas 16:9)
4. **Bottom-Left**: Code editor (collapsible, 4 linhas default)
5. **Bottom-Right**: Control strip (knobs horizontais)
6. **Footer**: Patch bay (connections to other panels)

---

## Fases de Implementação

### Fase 1: Core Engine (Strudel + Gemini)
- [ ] Instalar dependências Strudel (`@strudel/web`, `@strudel/core`, `@strudel/mini`)
- [ ] Criar `lib/strudel-service.ts` — wrapper que:
  - Inicializa Strudel Web Audio
  - `evaluate(code)` → executa pattern
  - `stop()` / `play()` / `setBPM()`
  - Conecta output ao AudioContext compartilhado
  - Registra no Capture Bus como source
- [ ] Criar `lib/gemini-client.ts` — chamada REST ao Gemini:
  - BYOK: API key em localStorage
  - System prompt adaptado do StrudelLM (teoria musical + mini-notation + samples)
  - Streaming response
  - Extração de blocos de código Strudel da resposta
  - Auto-correção: se `evaluate()` falha, envia erro de volta ao Gemini
- [ ] Criar `lib/strudel-prompt.md` — system prompt adaptado:
  - Referência completa da mini-notation
  - Samples disponíveis
  - Templates de gêneros (synthwave, lo-fi, techno, ambient, drum & bass)
  - Instruções pra gerar código limpo e funcional

### Fase 2: Componente do Painel
- [ ] Criar `components/AnalogBrainPanel.tsx`
- [ ] Zona de chat: textarea + mensagens (estilo terminal verde)
- [ ] Zona do code editor: CodeMirror com `@strudel/codemirror` (collapsible)
- [ ] Controles: Play/Stop/BPM usando SynthKnob existente
- [ ] API Key input: modal seguro com toggle visibility
- [ ] Model selector: dropdown (gemini-2.5-flash / pro)
- [ ] Registrar no panelDefs em App.tsx (lazy-loaded)
- [ ] Persistence: salvar chat history, último código, settings em localStorage

### Fase 3: Visualizer Integrado
- [ ] Canvas CRT embutido no painel (reusa `visualizer-engine.ts`)
- [ ] Conectar AnalyserNode do Strudel output ao visualizer
- [ ] Aplicar post-FX: scanlines, bloom, chromatic aberration
- [ ] Modos de visualização: scope, bars, radial (subset do TVPanel)
- [ ] Knob de "VIS MODE" pra trocar entre modos
- [ ] Opção de "enviar stream pro TVPanel" (fullscreen no TV)

### Fase 4: Export, Record, Render
- [ ] **Gravar**: MediaRecorder no Strudel audio output (WebM/WAV)
- [ ] **Render**: canvas do visualizer + áudio → WebM com vídeo
- [ ] **Export código**: salvar .strudel / copiar pro clipboard
- [ ] **Export áudio**: converter WebM → MP3 via backend existente
- [ ] Botão de render com progress bar (gravar N segundos/loops)
- [ ] Presets de export: "Audio Only", "Video + Audio", "Code"

### Fase 5: Integração Inter-Panel
- [ ] **→ Note Bus**: extrair notas do pattern Strudel e publicar
  - SynthPanel pode tocar junto com timbres próprios
- [ ] **→ Capture Bus**: já feito na Fase 1, mas refinar
  - TVPanel em fullscreen mostrando o visualizer
- [ ] **← Note Bus**: receber notas de outros panels e incorporar no pattern
- [ ] Sync BPM com SynthPanel/DrumMachine via shared BPM bus
- [ ] "Patch cables" visuais: SVG lines entre AnalogBrain e panels conectados

### Fase 6: Polish & Advanced
- [ ] Presets de gênero com ícones retro (dials que selecionam)
- [ ] Histórico de patterns gerados (carousel com preview)
- [ ] "Drift mode": pedir ao Gemini pra evoluir o pattern gradualmente
- [ ] VU meter de agulha animado com o áudio
- [ ] Undo/Redo no code editor
- [ ] Documentação do system prompt pra o user customizar

---

## System Prompt do Gemini (Resumo)

```markdown
You are AnalogBrain, an AI music composer that writes Strudel live-coding patterns.

## Rules
- Output ONLY valid Strudel mini-notation code in ```strudel blocks
- Use available samples (bd, sd, hh, cp, bass, piano, strings, pad, etc.)
- Keep patterns musical and rhythmically interesting
- Match the requested genre/mood precisely
- Use effects: .lpf() .hpf() .delay() .reverb() .gain() .speed()
- Layer patterns with $: (parallel patterns)
- Keep code under 30 lines for readability

## When errors occur
- You will receive the error message
- Fix the code and explain what went wrong briefly
- Common fixes: missing samples → suggest alternatives, syntax → fix notation

## Available samples
[lista completa dos samples do Strudel]

## Genre templates
[templates pra cada gênero com exemplos]
```

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Strudel Web Audio conflita com Tone.js | Ambos usam AudioContext — criar node bridge, não contextos separados |
| Gemini gera código inválido | Auto-retry com erro msg (max 3 tentativas) |
| Bundle size com Strudel | Tree-shake: só importar `@strudel/core` + `@strudel/mini`, não o REPL completo |
| Latência do streaming Gemini | Mostrar "thinking" animation no tubo de vácuo |
| CORS na API do Gemini | Chamada client-side direta funciona (Gemini permite CORS) |

---

## Estimativa

| Fase | Complexidade | Estimativa |
|------|-------------|------------|
| 1 - Core Engine | Alta | 2-3 sessões |
| 2 - Panel Component | Média | 1-2 sessões |
| 3 - Visualizer | Média | 1 sessão |
| 4 - Export/Record | Média | 1 sessão |
| 5 - Inter-Panel | Baixa-Média | 1 sessão |
| 6 - Polish | Baixa | 1 sessão |
| **Total** | | **~7-9 sessões** |

---

## Resultado Final

Um painel "ANALOG BRAIN mk.II" que parece um equipamento de laboratório dos anos 70, onde vc digita "make me a dark techno beat with acid bassline" e o Gemini gera código Strudel que toca em tempo real, com o CRT mostrando visualizações reativas ao som, podendo gravar, exportar, e rotear o áudio pra qualquer outro panel do studio.
