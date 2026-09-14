// rhodes-cinza — avril lenta, tocada num santoor amostrado. bpm 72.
//
// Era `s("piano")`: o sample de fábrica do Strudel, o mesmo de todo take do
// mundo. Agora a melodia sai do SANTOOR do kit VHULTO (n=0, "SANT C#") e a voz
// que responde é um ERHU (n=1, "ERHU D#") — corda percutida e corda friccionada,
// as duas com sala e ruído do dia da gravação embutidos.
//
// A CONTA DA AFINAÇÃO, que é o que faz isso funcionar: banco de sample sem
// metadado é afinado por `note` com `transpose = midi - 36` (superdough,
// util.mjs). Medi qual nota escrita dá transpose zero: **c2** — não c3, apesar
// do comentário "C3 is middle C" no fonte deles. Então, pra ouvir o alvo T num
// sample gravado na raiz R:
//
//     escrito = 36 + midi(T) - midi(R)   →   constante N = 36 - midi(R)
//
// Santoor gravado em C#4 → -25. Erhu em D#4 → -27. Os números saem prontos na
// coluna "raiz" de patterns/SAMPLES.md. A melodia segue escrita em fá menor,
// legível, e a conta fica numa linha. A OITAVA da raiz é o único chute (o nome
// do arquivo diz "SANT C#", não "C#4"): se soar uma oitava fora, ±12.
// ── ARRANJO ── cada casa = 8 ciclos (~27 s em 72 bpm; a peça respira devagar)
//              1    2    3    4    5    6    7    8
//   baixo      ·    ●    ●    ●    ●    ●    ●    ·
//   melodia    ●    ●    ●    ●    ●    ●    ●    ●   o santoor é a peça
//   erhu       ·    ·    ·    ●    ●    ·    ●    ·   a resposta, rara
//   cama       ·    ·    ●    ●    ●    ●    ·    ·   o pad quente ao fundo
//   chuva      ●    ●    ●    ●    ●    ●    ●    ●
//
// Peça de piano não tem "drop": o que muda é quanta gente está na sala. Começa
// com uma pessoa tocando, junta mais três no meio, e termina com a mesma pessoa
// sozinha.
stack(
  note("<f2 eb2 db2 c2>").add(note(-25))
    .s("vhulto_sampling_the_world_drumkit_zi_melodik_bonus_santoor_saberi").n(0)
    .gain(0.5).release(2).room(0.5).lpf(1800)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  note("<[f3 c4 ab4 c5 ab4 c4] [eb3 bb3 g4 bb4 g4 bb3] [db3 ab3 f4 ab4 f4 ab3] [c3 g3 eb4 g4 eb4 g3]>")
    .add(note(-25))
    .s("vhulto_sampling_the_world_drumkit_zi_melodik_bonus_santoor_saberi").n(0)
    .gain(sine.slow(8).range(0.35, 0.6))
    .room(0.6).size(4)
    .pan(sine.slow(11).range(0.42, 0.58)),

  // A resposta no erhu: só no terceiro compasso. O silêncio dos outros três é o
  // que faz soar como resposta, e não como acompanhamento.
  note("<~ ~ [ab4 ~ f4 ~] ~>").add(note(-27))
    .s("vhulto_sampling_the_world_drumkit_zi_melodik_bonus_erhu").n(1)
    .gain(0.34).room(0.7).delay(0.22).delaytime(0.5).lpf(3200)
    .mask("<0 0 0 1 1 0 1 0>/8"),

  // Cama: o pad mais quente do Zero-G Dream Zone bem baixo, só pra tirar o ar
  // de sala morta, mais a chuva do kit como ruído de fundo constante.
  s("zero_g_ce07_dream_zone").n(185)
    .begin(0.15).end(0.5).speed(0.5).slow(8)
    .gain(0.12).lpf(900).room(0.9).size(8)
    .mask("<0 0 1 1 1 1 0 0>/8"),

  s("vhulto_sampling_the_world_drumkit_texture").n(0)   // AMBIENCE - RAIN, BASE
    .slow(8).gain(0.07).hpf(900)
)
