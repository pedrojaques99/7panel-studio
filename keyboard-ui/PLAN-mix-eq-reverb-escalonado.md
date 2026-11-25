# /mix — EQ, reverb, card da música e entrada escalonada

Pedido: "preciso de um novo parametro de EQ e outro Reverb. Preciso que a música
tocando tb seja um card com os parametros. Preciso que o gap possa ser maior, e
preciso de um parametro para que as texturas comecem em sequencia, pra nao
começar tudo ao mesmo tempo ficando bugado"

## Reuso, não invenção

`backend/dsp/domar.py` (rota `/eq`) já tem os dois efeitos validados por ouvido:
- **EQ**: shelf de agudo (`treble=g=...:f=4500:w=0.6`), bipolar — mesmo filtro
  serve pra escurecer (g negativo) ou clarear (g positivo).
- **Reverb**: convolução com IR sintético (`_ir()`/`_calibra()` — ruído rosa com
  decaimento exponencial, calibrado por RMS, cauda abafada em 9 kHz). Já cacheado
  em `backend/assets/ir/`.

`dsp/mix.py` importa e reusa essas duas funções em vez de reimplementar EQ/reverb.

## Parâmetros — 1 knob cada, não a mesa XY inteira do /eq

A /mix já tem NÍVEL e GAP por camada; a pedida foi "um parâmetro de EQ e outro de
reverb", não a régua completa (escuro+grave+decay do /eq). Fica:

- `eq_db` (-12..+12): um tom só, bipolar, mesmo shelf de 4500 Hz do /eq.
- `reverb_wet` (0..1): decay fixo em 2.5 s (mesmo default do /eq) — sala fixa,
  só a quantidade é knob.

Essas duas se aplicam tanto às camadas de ambiência quanto à música (novo card).

## Card da música

Hoje a música só tem escolha de arquivo — o ganho pro limiar (-20 LUFS) é
automático, sem controle. Vira um `paramCard` igual aos de ambiência (mesmo
componente visual), com NÍVEL (offset em dB sobre o alvo automático), EQ e RVB.
Sem GAP/RESPIRA/atraso — não fazem sentido pra faixa de base.

## GAP maior

Knob do frontend vai de 0-60 pra 0-300 s (5 min). Clamp do backend
(`mix_routes.py`) sobe de 120 pra 300 pra bater com o knob — hoje ele já corta
silenciosamente o que passasse de 120, o que faria o knob mentir.

## Entrada escalonada

Um knob GLOBAL (não por camada) no painel de ambiência: "atraso entre camadas",
0-10 s. Camada `i` começa `i × atraso_s` depois da música. Aplicado:

- no preview do browser: `setTimeout` escalonado em vez de tocar todas no mesmo
  `useEffect` tick;
- no render do backend: filtro `adelay=<ms>:all=1` por camada, antes da mixagem.

Isso resolve o "tudo começa junto e buga" sem inventar um sistema de agendamento
— é silêncio no início de cada stream, que é o que `adelay` já faz de fábrica.

## Contrato novo (`POST /api/mix/render`)

```jsonc
{
  "musica": "...",
  "musica_params": { "nivel_db": 0, "eq_db": 0, "reverb_wet": 0 },  // opcional
  "atraso_s": 0,                                                    // opcional, 0-10
  "camadas": [
    { "id": "...", "nivel_db": 0, "gap_s": 0, "respira": true,
      "eq_db": 0, "reverb_wet": 0 }
  ]
}
```

Tudo com default 0/desligado — nenhum mix salvo antigo muda de som ao carregar
sem os campos novos (mesma garantia que `grave_db`/`reverb_wet` já têm no /eq).

## Arquivos tocados

- `backend/dsp/mix.py` — EQ/reverb/atraso na cadeia ffmpeg, reusando `dsp.domar._ir`.
- `backend/mix_routes.py` — aceita e valida os campos novos, clamp de gap maior.
- `keyboard-ui/src/mix/modelo.ts` — `Camada.eq_db/reverb_wet`, tipo `MusicaParams`.
- `keyboard-ui/src/mix/Mix.tsx` — knobs novos nos cards, card da música, knob de
  atraso, stagger no preview do browser.
- `backend/tests/test_mix.py` — cobertura mínima dos três (eq, reverb, atraso).
