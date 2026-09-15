// drukqs-quebrado — drill'n'bass: aqui a bateria É a melodia. bpm 168.
// Quase tudo é sometimesBy: o padrão escrito é simples e o que quebra ele é
// sorteado a cada ciclo. Ouvir duas voltas seguidas nunca dá a mesma coisa.
//
// ── ARRANJO ── cada casa = 8 ciclos (~11 s em 168 bpm; a faixa é rápida)
//              1    2    3    4    5    6    7    8
//   bumbo      ●    ●    ·    ●    ●    ●    ·    ●
//   caixa      ·    ●    ·    ●    ●    ●    ·    ●
//   chimbal    ·    ·    ·    ●    ●    ●    ·    ·
//   rim        ·    ·    ·    ·    ●    ●    ·    ·
//   sub        ●    ●    ●    ●    ●    ●    ●    ●   o chão nunca sai
//   acorde     ·    ·    ●    ·    ·    ·    ●    ●   só onde a bateria some
//
// Drill'n'bass cansa em noventa segundos se não parar nunca. Os passos 3 e 7
// tiram a bateria inteira e deixam só sub e acorde: é o ouvido descansando pra
// poder ouvir o estilhaço de novo. O silêncio aqui é parte do arranjo.
stack(
  // Kit VHULTO: KICK - KOF, SNARE - MEMPHIS, HAT - PIF, RIM - BRO. Sample curto
  // e seco aguenta `ply` e `speed` sem virar papa — 909 longa borrava tudo.
  s("vhulto_sampling_the_world_drumkit_kick").n(3)
    .struct("x ~ ~ x ~ ~ x ~").gain(0.95).shape(0.4)
    .sometimesBy(0.2, x => x.ply(3).gain(0.55))
    .mask("<1 1 0 1 1 1 0 1>/8"),

  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(20)
    .struct("~ x ~ [x x]").gain(0.68)
    .sometimesBy(0.35, x => x.ply("<2 3 4>").speed(rand.range(0.9, 1.6)))
    .sometimesBy(0.15, x => x.crush(4))
    .mask("<0 1 0 1 1 1 0 1>/8"),

  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(3)
    .struct("x*16").gain(rand.range(0.06, 0.28)).pan(rand)
    .degradeBy(0.3)
    .sometimesBy(0.2, x => x.speed(1.5).hpf(7000))
    .mask("<0 0 0 1 1 1 0 0>/8"),

  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(1)
    .struct("~ ~ x ~").gain(0.35).degradeBy(0.4)
    .mask("<0 0 0 0 1 1 0 0>/8"),

  // o sub é o único que não quebra: sem chão fixo, o resto vira barulho.
  note("<c1 c1 eb1 g0>").s("sine").attack(0.01).release(0.45).gain(0.72),

  note("<[c4,eb4,g4,bb4] ~ ~ ~>").slow(2)
    .s("triangle").attack(0.35).release(2)
    .lpf(2200).room(0.8).size(5).gain(0.2)
    .mask("<0 0 1 0 0 0 1 1>/8")
)
