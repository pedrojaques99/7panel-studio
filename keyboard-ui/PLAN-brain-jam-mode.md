# PLAN: Brain Jam Mode — Texturas, Moods & Sessions ✅ IMPLEMENTED

## Filosofia
Zero token waste. Tudo que pode ser Strudel puro, é Strudel puro.
LLM só entra quando o user digita no chat. O resto é código curado + transforms diretos.

---

## 1. MOOD TEXTURES — Botões de atmosfera (sem LLM)

Painel de chips/tags clicáveis entre o chat e os layers. Cada chip injeta um layer de textura **direto no código Strudel** sem chamar o Gemini.

### Texturas pré-escritas (Strudel puro):
| Chip | Strudel pattern |
|------|----------------|
| `rain` | `s("hh").speed(rand.range(0.3,0.8)).gain(perlin.range(0.02,0.12)).lpf(sine.slow(0.04).range(800,3000)).room(0.95).size(0.99).delay(0.3).fast(8).degradeBy(0.4)` |
| `vinyl` | `s("hh").speed(0.1).gain(0.06).crush(4).lpf(900).hpf(200).fast(16).degradeBy(0.3)` |
| `wind` | `sine.note("c1").lpf(perlin.slow(0.02).range(100,600)).gain(perlin.slow(0.03).range(0.02,0.08)).attack(4).release(6).slow(12)` |
| `crickets` | `s("hh").speed(rand.range(3,5)).gain(rand.range(0.01,0.05)).fast(6).degradeBy(0.7).hpf(4000).room(0.6).delay(0.15)` |
| `tape hiss` | `s("hh").speed(0.05).gain(0.04).crush(3).lpf(2500).hpf(800).fast(32).degradeBy(0.2)` |
| `fireplace` | `s("cr").speed(rand.range(0.2,0.5)).gain(perlin.range(0.03,0.1)).lpf(1200).room(0.7).fast(3).degradeBy(0.6)` |
| `drone` | `sawtooth.note("c1").add(triangle.note("c1").add(0.03)).lpf(sine.slow(0.05).range(200,800)).gain(0.15).attack(6).release(10).room(0.95).size(0.99).slow(16)` |
| `waves` | `sine.note("e1").lpf(perlin.slow(0.01).range(150,500)).gain(perlin.slow(0.008).range(0.03,0.12)).attack(8).release(12).slow(24).room(0.9)` |

### Comportamento:
- Click → adiciona o layer como novo item no `stack()`
- O chip fica "aceso" enquanto o layer está ativo
- Click de novo → remove o layer do stack
- Cada textura entra com `.gain(valor_baixo)` pra não dominar o mix
- O knob de gain do layer controla o volume individual

### Localização no UI:
Faixa horizontal de chips scrollável logo acima da grid de layers, estilo tags.

---

## 2. MUTATION BUTTONS — Transforms diretos (sem LLM)

Botões que aplicam transformações no código atual via regex/AST, sem chamar API:

| Botão | Ação no código |
|-------|---------------|
| `darker` | Reduz LPF de todos os layers em 30%, aumenta room |
| `warmer` | Adiciona `.crush(12)` nos layers que não têm, reduz HPF |
| `degrade` | Aumenta `.degradeBy()` em todos os layers (+0.15) |
| `sparse` | Dobra os `.slow()` values → tudo mais lento e espaçado |
| `glitch` | Adiciona `.sometimes(x=>x.speed(-1))` no layer mais ativo |
| `lo-fi` | Aplica `.crush(8).lpf(2500)` global |

### Localização:
Mesma faixa dos mood chips, segunda fileira ou separados por `|`.

---

## 3. SCENE SNAPSHOTS — Salvar/restaurar estados

### Modelo de dados:
```ts
type Scene = {
  name: string
  code: string
  volume: number
  lpf: number
  hpf: number
  delay: number
  reverb: number
  bpm: number
  mutedLayers: Record<number, number>
  timestamp: number
}
```

### Comportamento:
- Botão `SAVE` na toolbar → salva estado completo com nome auto-gerado (Scene 1, Scene 2...)
- Lista de scenes como chips na settings area
- Click numa scene → restaura tudo (código + FX + BPM)
- Max 12 scenes, persistido no localStorage
- Long-press/right-click → rename ou delete

---

## 4. STYLE CARDS — Novos moods (custo zero, só melhora o prompt)

Adicionar cards ao `style-cards.ts` — só ativam quando o user usa o chat:

| Card | Keywords | Vibe |
|------|----------|------|
| `mount-shrine` | mount shrine, drone ambient, tape loops, lo-fi ambient | Tape warble, hiss texture, washed out, devotional |
| `nature` | nature, field recording, organic, forest, garden | Layered organic textures, bird-like patterns, gentle |
| `vaporwave` | vaporwave, vapor, nostalgic, retro, mallsoft, late night | Slowed 80%, chopped samples, heavy reverb+delay, detuned |
| `analog-warmth` | analog, analogic, warm, vintage, tube, vinyl, tape | Crush 10-12 bits, slight detune, LP filtered, saturated |
| `rain-ambient` | rain, rainy, storm, thunder, water, ocean | Noise textures, sparse hits, massive reverb, low energy |

---

## 5. NOVO: CONTEXT INJECT — O Brain sabe o que tá tocando (custo mínimo)

Quando o user manda mensagem no chat, incluir no prompt **sem custo extra significativo** (~200 tokens):

```
CURRENT STATE:
- BPM: 85
- Layers: [triangle gain:0.15, sine gain:0.18, rim gain:1]  
- Master FX: LPF 5.5k, HPF 53, DLY 0%, RVB 0%
- Active textures: rain, vinyl
```

Isso permite o LLM dar respostas contextuais ("escurece mais" → ele sabe o LPF atual e ajusta).

---

## Ordem de implementação

1. **Mood Texture chips** — maior impacto visual e funcional, zero LLM
2. **Style cards novos** — copiar/colar, zero risco  
3. **Mutation buttons** — transforms regex simples
4. **Scene snapshots** — localStorage save/restore
5. **Context inject** — uma string a mais no prompt

## Estimativa: ~400 linhas de código total
