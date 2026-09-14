# Rota `/mix`: música + ambiência por cima, com preview e render

> **Status (2026-09-14): implementado.** O plano foi aprovado com três decisões:
> - a rota se chama `/mix` (o nome `/ambiente` foi descartado);
> - a música vem de todas as pastas do acervo;
> - o catálogo aponta pra onde cada arquivo já está, sem mover nada.
>
> | Parte | Arquivo |
> |---|---|
> | backend (rotas) | `backend/mix_routes.py` (blueprint registrado no `dashboard_server.py`) |
> | backend (DSP) | `backend/dsp/mix.py` |
> | front | `keyboard-ui/src/mix/{Mix.tsx, modelo.ts}` + entrada em `main.tsx` |
> | testes | `backend/tests/test_mix.py` (13) · `keyboard-ui/src/mix/Mix.test.tsx` (10) |
> | bug corrigido | `dsp/medidas.py` agora procura a ambiência em `raw_records/` |
>
> **Chips de filtro:** foram autorizados. Ficaram como botões `aria-pressed` no mesmo estilo da `/eq`, sem componente novo no registry.
>
> Os endpoints abaixo usam o prefixo `/api/mix/*`, e não os nomes `/api/ambiente/*` do rascunho.

## 1. O que existe hoje (mapeado em 2026-09-14)

### Onde estão as ambiências

| Lugar | O que tem | Observação |
|---|---|---|
| `backend/assets/ambients` | 14 camas: cave, wind (wheat-breeze), birds, forest-rain, fireplace, thunder, library, brown-noise, vinyl… | 9 mp3 com o mesmo tamanho, mas md5 diferente (não são duplicata) |
| `backend/assets/ps_`, `mp3/`, `samples/…VHULTO…/TEXTURE`, `samples/dirt/{wind,birds,insect,fire,outdoor}` | chuva-trovão-vento, woodland stream, enchanted-forest, texturas de pack | |
| `auto-video-editor-ai/scripts/.render-assets` | as mesmas camas (original, `ambient-new`, `ambient-compressed`) + morning/afternoon/night | cache de render |
| `liminal-stage` | 13 camas no R2 (worker `liminal-upload`), mono 96k, com **ganho e pontos de loop medidos** em `ambientMix.ts` | melhor metadado de loop que existe |
| R2 `bible-radio` / `auto-video-editor` | `radio/ambient/pool` (público), `radio-normalized/…`, morning/afternoon/night/rain | **nenhum arquivo exclusivo**: são cópias das camas locais |
| `Jacão Ambients/raw_records` | gravações próprias (Rua Campo Erê, chuvas, Rec-2) + `_tratados` | medidas de voz/evento/oscilação no `catalogo-geral.json` |

### O que já dá pra reusar

| Precisa | Já existe |
|---|---|
| catálogo | `backend/tools/ambient_catalog.py` → `backend/assets/ambients_catalog.json` (**feito**: dedup por md5, variantes, R2, loop do liminal, medidas) |
| roteamento | tabela de pathname em `src/main.tsx` (mesmo padrão do `/musica`) |
| tokens | `src/fabrica/ui.ts` (o `/musica` usa) |
| lista / seleção | `musica/Repertorio.tsx`, `musica/Amostras.tsx` |
| forma de onda | `components/AudioPlayerPanel.tsx` + `GET /api/audio/peaks` |
| volume / knob | `lib/vintage-components/VintageSlider.tsx`, `components/ui/vintage-knob.tsx` |
| botões | `VintageButton.tsx`, `InteractiveToggle.tsx` |
| progresso de export | `musica/Exportador.tsx` (`ProgressoExport`) |
| job assíncrono no backend | padrão `POST /api/domar` + `GET /api/domar/status/<id>` |
| mixagem de cama (DSP) | `Jacão Ambients/_prod/_tools/ambiente.py`: costura de loop, respiração com ciclos primos, ganho por LUFS, `--domar` |
| loop sem emenda no navegador | `liminal-stage/src/audio/looper.ts` (`SeamlessLoop`, crossfade de potência constante) |

### Resultado do catálogo (2026-09-14)

- **Volume:** 173 arquivos viraram 141 únicos por md5, que viraram **127 ambiências**. 32 cópias idênticas foram agrupadas.
- **Por categoria:** pássaros 39 · cidade 30 · chuva 22 · vento 14 · textura 10 · ruído 8 · floresta 6 · noite 5 · interior 4 · água 3 · fogo 3 · caverna 1 · outro 9.
- **Por origem:** próprio 43 · pack 58 · web 25 · gerado 1.
- **Metadados:**
  - 13 têm loop medido (vem do liminal).
  - 39 têm medida de voz/evento (vem do `catalogo-geral.json` da Jacão).
- **Só existem no R2 do liminal:** `chuva-leve`, `chuva-trovao`, `costa`.
- **Mesmo arquivo com nome diferente:**
  - `enchanted-forest` = `ps_night-forest-grilo`
  - `Birds.m4a` = `Rua Campo Erê 6.m4a`
- **Com voz acima de 5%** (a UI tem que avisar): `Nova Gravação`, `Rua Campo Erê`, `Rua Campo Erê 2/3/5`.

**Nenhuma lib nova.** O preview é Web Audio nativo e o render é ffmpeg, que o backend já usa. Não precisa de wavesurfer, porque o endpoint de peaks já existe.

## 2. A rota

```
/ambiente
┌─ MÚSICA ───────────────────┐ ┌─ AMBIÊNCIA ─────────────────────────┐
│ Repertorio (songs + wavs   │ │ filtros: chuva vento pássaros       │
│ da era3 + stretch/1h)      │ │ caverna fogo cidade noite  [próprio]│
│ forma de onda (peaks)      │ │ lista do ambients_catalog.json      │
└────────────────────────────┘ │ ⚠ voz / evento alto (das medidas)   │
                               └─────────────────────────────────────┘
┌─ MIX ──────────────────────────────────────────────────────────────┐
│ ▶ preview   nível da ambiência [VintageSlider]  respiração [knob]  │
│ sugestão: "abaixo do limiar" (−14 LU sob a música)                 │
│ export: [mp3 320] [wav 24]   duração: = música | 1h | 3h           │
│ ████████░░░ 62%  (Exportador / ProgressoExport)                    │
└────────────────────────────────────────────────────────────────────┘
```

Até 2 camadas de ambiência (lugar + textura), igual ao `ambiente.py`. Com mais que isso vira sopa.

## 3. O que é "inteligente"

As decisões vêm do que a casa já mediu, não de gosto:

1. **Ganho automático por LUFS.** O catálogo guarda o LUFS de cada cama. O mix começa com a música a −20 e a ambiência a −34 LUFS de pico. Cama alta demais vira evento (`ambiente.py`, seção Níveis).
2. **Loop sem emenda.** Usa `loop.head/end` do liminal quando existe. Quando não existe, costura cauda com cabeça (`unidade_loop`). No preview, crossfade de potência constante (`SeamlessLoop`).
3. **Respiração.** A ambiência sobe e desce em ciclo de 210 s, e a textura em 137 s, ciclos primos entre si pra nunca virarem pulso.
4. **Aviso antes do render.**
   - Ambiência com `voz > 0` gera alerta: fala num fundo é o pior evento possível (`CATALOGO.md`).
   - `evento` alto gera alerta: carro ou moto passando.
   - Unidade curta que repete muitas vezes numa hora (portão `unidade < 8 min`) também gera alerta.
5. **Sugestão por destino.** A música triada como `eno` sugere chuva suave, `aphex` sugere rua e `mount-shrine` sugere chuva forte (`triagem.RECEITA`).
6. **Preview fiel ao render.** O preview de 30 s é renderizado no backend com a mesma cadeia do export, e o ▶ toca esse arquivo. Assim o que se ouve é o que sai. O Web Audio fica só pra ajuste de nível em tempo real.

## 4. Backend

| Endpoint | Faz |
|---|---|
| `GET /api/ambients/catalog` | serve `ambients_catalog.json`, filtrável por `?categoria=` |
| `GET /api/ambients/file?id=` | serve a variante local principal; cai pra URL do R2 se só existir remoto |
| `POST /api/ambiente/render` `{musica, camadas:[{id,nivel_lufs,respira}], duracao, formato, preview_s?}` | job: **porta a lógica do `ambiente.py`** pra `backend/dsp/ambiente.py` (costura, respiração, LUFS, limiter −1 dBTP, `domar` opcional) |
| `GET /api/ambiente/status/<id>` | progresso, igual ao `/api/domar/status` |

**Bug a corrigir no caminho:** `dsp/medidas.py` monta o arquivo de ambiência como `JACAO_AMBIENTS_DIR/<arquivo>`, mas os arquivos moram em `raw_records/`. Hoje a receita da triagem aponta pra arquivo que não existe.

## 5. Fases

1. **Catálogo:** feito. Rodar `python backend/tools/ambient_catalog.py` de novo quando entrar cama nova.
2. **Backend:** `dsp/ambiente.py` + os 4 endpoints + teste do render com uma música da era3 e `cave`.
3. **Rota:** entrada em `main.tsx` + página `ambiente/Ambiente.tsx` montada só com componentes existentes.
4. **Polimento:** aviso de voz/evento, sugestão por destino, preset salvo.

## 6. Decisões suas antes da fase 2

- [ ] Nome da rota: `/ambiente` ou `/mix`?
- [ ] Fonte de "música": só `songs` do 7panel, ou também as pastas `era3` e `stretch/1h`?
- [ ] Consolidar os arquivos numa pasta só (`backend/assets/ambients`) ou manter o catálogo apontando pra onde cada um já está? (hoje: aponta, não move)
- [ ] **[pede permissão]** chips de filtro por categoria. Não achei chip/tag no design system. Pode ser `InteractiveToggle` em linha ou precisa de componente novo.
