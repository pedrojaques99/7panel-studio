// granular-sonho — o mesmo pad, picado em grão. bpm 120.
//
// Síntese granular na mão: em vez de tocar o sample, toca-se 1/500 dele, 16
// vezes por ciclo, cada vez de um ponto diferente. `begin` vem de um sinal
// (perlin anda devagar, rand pula) e `end` é sempre `begin + 0.002` — dois
// milésimos do arquivo, que num pad de 18 s dá uns 36 ms: grão.
//
// O tamanho do grão é a única coisa que importa aqui. Aumente `end` pra 0.02 e
// vira loop nervoso; abaixe pra 0.0005 e vira zumbido de tom fixo.
//
// `begin`/`end` vêm DEPOIS do `struct`, e isso não é estilo: medido, sinal antes
// do struct é amostrado uma vez por ciclo e os 16 grãos saem todos do mesmo
// ponto do arquivo — um grão só, repetido, sem nuvem nenhuma.
//
// A posição é perlin (varredura lenta) MAIS rand (tremor por grão): só perlin
// dá 0.000, 0.000, 0.001 dentro de um ciclo, que é imperceptível.
//
// ── ARRANJO ── cada casa = 8 ciclos (~16 s em 120 bpm)
//              1    2    3    4    5    6    7    8
//   nuvem 1    ●    ●    ●    ●    ●    ●    ●    ●
//   nuvem 2    ·    ·    ●    ●    ·    ●    ●    ·   a oitava acima
//   grão big   ·    ●    ●    ●    ●    ●    ●    ●   dá origem à nuvem
//   bumbo      ·    ·    ·    ●    ●    ●    ·    ·   o único pulso da peça
//
// O grão gigante entra DEPOIS da nuvem, e é o contrário do que a ordem
// cronológica pediria: primeiro o ouvido recebe a poeira, depois descobre de
// qual pedra ela veio. Explicar antes tira a graça.
stack(
  // nuvem principal: perlin varre o pad devagar, então o timbre muda de lugar
  s("zero_g_ce07_dream_zone").n(171)
    .struct("x*16")
    .begin(perlin.slow(6).range(0.05, 0.85).add(rand.range(0, 0.04)))
    .end(perlin.slow(6).range(0.05, 0.85).add(rand.range(0, 0.04)).add(0.002))
    .speed("<1 1 0.75 1.5>")
    .gain(0.42).pan(rand)
    .room(0.6).size(4),

  // segunda nuvem: rand puro, uma oitava acima, mais rala. É o chiado com
  // altura que faz a primeira parecer intencional.
  s("zero_g_ce07_dream_zone").n(185)
    .struct("x*32")
    .begin(rand.range(0, 0.9))
    .end(rand.range(0, 0.9).add(0.001))
    .speed(2)
    .degradeBy(0.6)
    .gain(0.16).pan(rand).hpf(1200)
    .mask("<0 0 1 1 0 1 1 0>/8"),

  // grão gigante: o mesmo material, mas 2 s de uma vez, a cada 4 compassos — o
  // ouvido usa isso pra entender que as nuvens vêm de algum lugar.
  s("zero_g_ce07_dream_zone").n(171)
    .struct("x").slow(4)
    .begin(0.2).end(0.32).speed(0.5)
    .gain(0.3).lpf(1600).room(0.85).size(8)
    .mask("<0 1 1 1 1 1 1 1>/8"),

  s("vhulto_sampling_the_world_drumkit_kick").n(5)
    .struct("x ~ ~ ~ ~ ~ [~ x] ~").gain(0.5).lpf(260)
    .mask("<0 0 0 1 1 1 0 0>/8")
)
