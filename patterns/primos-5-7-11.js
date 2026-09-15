// primos-5-7-11 — três percussões, três subdivisões que não se dividem. bpm 104.
//
// Nenhum efeito, nenhuma nota: só o fato aritmético. Um ciclo tem 5 golpes de
// WOODBLOCK, 7 de CLAVE e 11 de TING ao mesmo tempo. Como 5, 7 e 11 são primos,
// o único instante em que os três coincidem é o começo do ciclo — e é por isso
// que dá pra ouvir onde o compasso começa sem ninguém marcar o compasso.
//
// Trocar 11 por 10 destrói a peça: 10 divide por 5 e o padrão colapsa em dois.
//
// ── ARRANJO ── cada casa = 8 ciclos (~18 s em 104 bpm)
//              1    2    3    4    5    6    7    8
//   woodblock  ●    ●    ●    ●    ·    ●    ●    ●   o 5 é o metrônomo
//   clave      ·    ●    ●    ●    ●    ●    ●    ·   entra o 7
//   ting       ·    ·    ●    ●    ●    ●    ·    ·   entra o 11
//   djembe     ·    ·    ·    ●    ●    ●    ·    ·   entra o 13
//   sub        ·    ·    ·    ·    ●    ●    ●    ·
//
// A peça é sobre não-coincidência, então as vozes entram UMA POR VEZ: cada
// entrada acrescenta um período novo, e dá pra ouvir a teia ficando mais densa
// em vez de aparecer pronta. No passo 5 o woodblock sai — sem ele o ouvido
// perde a referência de onde é o "um", que é exatamente o assunto da peça.
stack(
  s("vhulto_sampling_the_world_drumkit_percs").n(44)        // WOODBLOCK
    .struct("x*5").gain(0.5).pan(0.35).room(0.2)
    .mask("<1 1 1 1 0 1 1 1>/8"),

  s("vhulto_sampling_the_world_drumkit_percs").n(12)        // CLAVE
    .struct("x*7").gain(0.38).pan(0.65).speed(1.1)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_percs").n(36)        // TING
    .struct("x*11").gain(0.22).pan(sine.range(0.3, 0.7)).hpf(2500)
    .mask("<0 0 1 1 1 1 0 0>/8"),

  // O 13 é o quarto primo e entra só pra confundir a contagem: um djembe a cada
  // 13 golpes de nada, uma vez por ciclo, em lugar diferente.
  s("vhulto_sampling_the_world_drumkit_percs").n(19)        // DJEMBE
    .struct("x*13").degradeBy(0.92).gain(0.6).room(0.4)
    .mask("<0 0 0 1 1 1 0 0>/8"),

  // Um chão que anda em 3 pra deixar claro que ninguém aqui está em 4.
  s("vhulto_sampling_the_world_drumkit_808").n(11)          // 808 - SUB
    .struct("x*3").note("<c2 c2 eb2>").gain(0.5).lpf(400)
    .mask("<0 0 0 0 1 1 1 0>/8")
)
