// desintegracao — the disintegration loops, agora em fita de verdade. bpm 78.
//
// Basinski pôs uma fita de 20 anos pra digitalizar e ela foi se desfazendo no
// cabeçote enquanto tocava. Ele não parou a gravação: a peça É a fita morrendo.
//
// A v0 fazia isso com `s("piano")` e `s("hh")` — som de fábrica, sem sujeira
// nenhuma pra desfazer. Agora a fonte é fita de verdade:
//   zero_g_ce07_dream_zone   Zero-G "Dream Zone", CD de sample dos anos 90.
//                            n(171) = 07_38_01: o pad mais escuro dos 217
//                            (zcr 45 — quase não tem agudo, é só corpo).
//   ...texture               NOISE - MECHATRONIC RAIN: 28 s de chiado real,
//                            que é o que sobra quando o resto se vai.
//   ...perc_loops            PERC - CLOCKY 88: um relógio, e ele só aparece
//                            no fim, quando já não há música pra cobrir.
//
// Índices vêm medidos, não chutados: `python backend/tools/sample_probe.py
// "Zero-G - CE07 Dream Zone" --tipo pad`. Trocar de pad é trocar UM número.
//
// A frase NUNCA muda. O que muda é só o desgaste, numa rampa de 64 ciclos
// (~3 min em 78 bpm): volume 0.55->0.08, lpf 3000->300, buracos 0->60%,
// crush 16->5 bits. No fim a rampa volta a zero e a fita "recomeça" inteira —
// única mentira do take, de propósito: numa live ninguém espera a fita acabar.
//
// A rampa aparece escrita por extenso: o painel avalia o take como UMA
// expressão (sem transpiler), então `const` aqui é "Unexpected token 'const'".
stack(
  // A FITA. begin/end recortam meio segundo de dentro do pad — o ataque do
  // sample fica de fora, então a nota parece que já estava tocando.
  s("zero_g_ce07_dream_zone").n(171)
    .begin(0.08).end(0.42).speed(0.85).slow(2)
    .gain(saw.slow(64).range(0.55, 0.08))
    .lpf(saw.slow(64).range(3000, 300))
    .degradeBy(saw.slow(64).range(0, 0.6))
    .crush(saw.slow(64).range(16, 5))
    .room(0.78).size(6)
    .pan(sine.slow(29).range(0.4, 0.6)),

  // A mesma fita uma oitava abaixo (speed 0.5 = metade da frequência e o dobro
  // da duração) e quatro vezes mais lenta. Grave é o que a fita perde por
  // último, então essa camada envelhece devagar.
  s("zero_g_ce07_dream_zone").n(185)
    .begin(0.1).end(0.45).speed(0.5).slow(4)
    .gain(saw.slow(64).range(0.3, 0.12))
    .lpf(saw.slow(64).range(1100, 260)).lpq(2)
    .room(0.85).size(8),

  // CHIADO: entra ao contrário de todo o resto — começa quase inaudível e sobe
  // enquanto a música some. No fim do ciclo é a única coisa que sobrou.
  s("vhulto_sampling_the_world_drumkit_texture").n(5)
    .slow(8)
    .gain(saw.slow(64).range(0.03, 0.34))
    .hpf(1800)
    .pan(sine.slow(37).range(0.3, 0.7)),

  // O relógio da sala. Mudo nos dois primeiros terços, audível no fim.
  s("vhulto_sampling_the_world_drumkit_perc_loops").n(0)
    .slow(4)
    .gain(saw.slow(64).range(0, 0.16))
    .lpf(2400).room(0.5)
)
