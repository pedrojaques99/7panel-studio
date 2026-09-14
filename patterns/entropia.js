// entropia — a máquina escolhendo sozinha. bpm 140.
//
// Aqui nada está escrito, nem o sample: `irand(52)` sorteia qual dos 52 percs
// toca em cada evento, `rand` mexe na velocidade e no pan, `degradeBy` decide o
// que não acontece. Duas voltas nunca são iguais — e é isso que se está ouvindo,
// não o material.
//
// O oposto de cama-eno: lá o resultado é escrito e nunca se repete; aqui não é
// escrito e não se repete. A diferença aparece no ouvido em 30 s.
//
// A rédea são os dois golpes fixos (bumbo no 1, chimbal em 8), que dão chão ao
// sorteio. Sem eles não é música, é ruído aleatório.
//
// ── ARRANJO ── cada casa = 8 ciclos (~14 s em 140 bpm)
//              1    2    3    4    5    6    7    8
//   percs      ●    ●    ●    ●    ●    ●    ●    ●   a nuvem é a peça
//   fx         ·    ·    ·    ●    ●    ●    ·    ·   o sorteio dos efeitos
//   bumbo      ·    ●    ●    ●    ●    ●    ●    ·
//   chimbal    ·    ·    ●    ●    ·    ●    ●    ·
//   sub        ·    ·    ●    ●    ●    ●    ●    ·
//
// Aleatório sem forma vira paisagem: em trinta segundos o ouvido entende a
// regra e para de prestar atenção. Com a rédea entrando e saindo, a MESMA nuvem
// soa diferente — solta na abertura, presa no meio, solta de novo no fim. O que
// muda não é o sorteio, é o que ele tem pra empurrar.
//
// ORDEM DA CADEIA, medida: sinal (`irand`, `rand`, `perlin`) tem que vir DEPOIS
// do `struct`. Antes, ele é amostrado uma vez por ciclo e os 8 eventos saem com
// o mesmo valor — o take toca, não dá erro, e simplesmente não sorteia nada.
// Foi o que aconteceu na v0: 10 eventos, 2 samples distintos.
stack(
  s("vhulto_sampling_the_world_drumkit_percs")
    .struct("x*8")
    .n(irand(52))
    .speed(rand.range(0.6, 0.65))
    .gain(rand.range(0.13, 0.5))
    .pan(rand)
    .degradeBy(0.35)
    .sometimesBy(0.15, x => x.crush(4))
    .sometimesBy(0.1, x => x.ply(3)),

  s("vhulto_sampling_the_world_drumkit_fx_misc")
    .struct("x*2")
    .n(irand(48))
    .speed(rand.range(0.5, 1.2))
    .gain(rand.range(0.1, 0.3))
    .degradeBy(0.75)
    .room(0.5).pan(rand)
    .mask("<0 0 0 1 1 1 0 0>/8"),

  // as duas rédeas
  s("vhulto_sampling_the_world_drumkit_kick").n(3)
    .struct("x ~ ~ ~").gain(0.85).shape(0.3)
    .mask("<0 1 1 1 1 1 1 0>/8"),
  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(8)
    .struct("x*8").gain(0.14).pan(0.5)
    .mask("<0 0 1 1 0 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_808").n(11)
    .struct("<x ~>").note("<c2 g1 eb2 f1>").gain(0.5).lpf(500)
    .mask("<0 0 1 1 1 1 1 0>/8")
)
