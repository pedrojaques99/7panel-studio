// tha-vapor — SAW vol.1, faixa 2: dub lento com vozes ao longe. bpm 92.
//
// "Tha" é a faixa em que o Aphex descobre que espaço é instrumento. Aqui quase
// tudo entra pelo delay: o golpe seco é raro, o que se ouve é o rastro dele
// voltando três vezes, cada vez mais escuro.
//
// Delay em 0.375 (três colcheias) contra um compasso de quatro: o eco nunca cai
// onde o próximo golpe cai, e é isso que faz a batida parecer maior do que é.
//
// A respiração (FX - BREATH VERB) é a "voz" da faixa. Não diz nada, e é por isso
// que funciona: presença humana sem letra pra interpretar.
//
// ── ARRANJO ── cada casa = 8 ciclos (~21 s em 92 bpm)
//              1    2    3    4    5    6    7    8
//   bumbo      ·    ·    ●    ●    ●    ●    ·    ·
//   caixa      ·    ·    ·    ●    ●    ●    ·    ·
//   chimbal    ·    ·    ·    ·    ●    ●    ·    ·
//   respiração ●    ●    ·    ●    ●    ·    ●    ●   sozinha na abertura
//   acorde     ·    ·    ●    ●    ·    ●    ●    ●
//   sub        ·    ●    ●    ●    ●    ●    ●    ·
//   chiado     ●    ●    ●    ●    ●    ●    ●    ●
//
// Em dub o que sai é tão importante quanto o que entra: nos passos 3 e 6 a
// respiração some e o que se ouve dela é só o eco ainda voltando.
stack(
  s("vhulto_sampling_the_world_drumkit_kick").n(6)         // KICK - PUTARIA, longo
    .struct("x ~ ~ ~ ~ ~ x ~").gain(0.8).lpf(300).room(0.3)
    .mask("<0 0 1 1 1 1 0 0>/8"),

  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(12)   // SNARE - CHUBBY
    .struct("~ ~ x ~").gain(0.42)
    .delay(0.6).delaytime(0.375).delayfeedback(0.55)
    .lpf(3200).room(0.6).size(4)
    .mask("<0 0 0 1 1 1 0 0>/8"),

  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(4)         // HAT - RESO
    .struct("~ x ~ x ~ x ~ [x x]").gain(0.13).hpf(5000).pan(0.62)
    .delay(0.3).delaytime(0.1875)
    .mask("<0 0 0 0 1 1 0 0>/8"),

  // a respiração, uma vez a cada 5 compassos, vinda de longe e voltando
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(6)      // FX - BREATH VERB 170
    .struct("x").slow(5)
    .speed(0.75)
    .gain(0.26).lpf(2400)
    .delay(0.5).delaytime(0.75).delayfeedback(0.5)
    .room(0.9).size(7).pan(sine.slow(11).range(0.3, 0.7))
    .mask("<1 1 0 1 1 0 1 1>/8"),

  // acorde de duas notas só — em dub, terça a mais já é informação demais
  note("<[d3,a3] ~ [c3,g3] ~>")
    .s("sawtooth").attack(1.2).release(2.4).sustain(0.8)
    .lpf(sine.slow(23).range(400, 1400)).lpq(5)
    .gain(0.24).room(0.8).size(6)
    .mask("<0 0 1 1 0 1 1 1>/8"),

  note("<d1 ~ ~ ~ c1 ~ ~ ~>").s("sine").attack(0.05).release(1.2).gain(0.6)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_texture").n(5).slow(8).gain(0.06).hpf(3000)
)
