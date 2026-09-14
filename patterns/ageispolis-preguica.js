// ageispolis-preguica — SAW vol.1 no andamento arrastado. bpm 100.
//
// O truque desta é o atraso. A caixa e o chimbal entram 20 ms DEPOIS da grade
// (`late`), e é só isso que separa "hip-hop preguiçoso" de "caixa de ritmo".
// Vinte milésimos: menos que isso não se ouve, mais que isso soa errado.
//
// O baixo é um 808 - SUB de verdade, afinado por `note` — e como sample sem
// metadado toca cru em c2, escrever c2/g1 é escrever a nota que se ouve.
//
// ── ARRANJO ── cada casa = 8 ciclos (~19 s em 100 bpm)
//              1    2    3    4    5    6    7    8
//   bumbo      ●    ●    ●    ●    ·    ●    ●    ·   o buraco no 5 é a virada
//   chimbal    ·    ·    ●    ●    ·    ●    ●    ·
//   caixa      ·    ·    ●    ●    ·    ●    ●    ·
//   baixo      ·    ●    ●    ●    ●    ●    ●    ·
//   acorde     ·    ·    ·    ●    ●    ●    ●    ●
//   brinquedo  ·    ·    ·    ·    ●    ●    ·    ·
//   chiado     ●    ●    ●    ●    ●    ●    ●    ●
//
// O passo 5 tira bumbo, caixa e chimbal ao mesmo tempo e deixa acorde + baixo +
// a linha de brinquedo: é o "meio" da faixa, e ele existe só porque o resto
// parou. Uma faixa que nunca para não tem meio, tem duração.
stack(
  s("vhulto_sampling_the_world_drumkit_kick").n(4)         // KICK - MALADO
    .struct("x ~ ~ x ~ ~ x ~").gain(0.85).shape(0.2)
    .mask("<1 1 1 1 0 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(22)   // SNARE - OLDIE
    .struct("~ ~ x ~").late(0.02).gain(0.5).room(0.4)
    .mask("<0 0 1 1 0 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(5)         // HAT - RISPY
    .struct("[x ~ x x]*2").late(0.02)
    .gain(rand.range(0.08, 0.2)).pan(0.58)
    .mask("<0 0 1 1 0 1 1 0>/8"),

  // o baixo: sample de 808, não oscilador. Tem corpo e tem cauda.
  note("<c2 ~ eb2 g1>")
    .s("vhulto_sampling_the_world_drumkit_808").n(11)      // 808 - SUB
    .gain(0.6).lpf(600)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  // acorde com ataque lento, entrando no contratempo: chega sempre um pouco
  // depois do que se espera, que é a piada da faixa inteira.
  note("<[c4,eb4,g4,bb4] ~ [ab3,c4,eb4,g4] ~>")
    .s("sawtooth").attack(0.45).release(1.6).sustain(0.7)
    .lpf(perlin.slow(11).range(700, 2000)).lpq(4)
    .gain(0.22).room(0.65).delay(0.2).delaytime(0.3)
    .mask("<0 0 0 1 1 1 1 1>/8"),

  // linha aguda de brinquedo, três notas, sempre as mesmas
  note("<g5 ~ eb5 ~ ~ c5 ~ ~>")
    .s("square").attack(0.01).release(0.25)
    .gain(0.1).room(0.5).delay(0.35).delaytime(0.375).delayfeedback(0.4)
    .mask("<0 0 0 0 1 1 0 0>/8"),

  s("vhulto_sampling_the_world_drumkit_texture").n(0).slow(8).gain(0.05).hpf(1500)
)
