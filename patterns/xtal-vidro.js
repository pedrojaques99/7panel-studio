// xtal-vidro — SAW vol.1: pad de vidro, break lento, tudo em re menor. bpm 108.
// A batida existe pra você saber que o tempo passa, não pra dançar: kick abafado
// em 320 Hz e caixa com cauda maior que o próprio golpe.
//
// ── ARRANJO ── cada casa = 8 ciclos (~18 s em 108 bpm)
//              1    2    3    4    5    6    7    8
//   bumbo      ·    ●    ●    ●    ●    ●    ·    ·
//   caixa      ·    ·    ●    ●    ●    ●    ·    ·
//   chimbal    ·    ●    ·    ·    ●    ●    ·    ·
//   pad        ●    ●    ●    ●    ●    ●    ●    ●   a camada de vidro fica
//   motivo     ●    ·    ●    ·    ●    ●    ●    ·   a melodia entra tarde
//   baixo      ·    ●    ●    ●    ●    ●    ●    ●
//
// Ambiente não pede clímax: o pad abre sozinho, a batida passa pelo meio e vai
// embora antes do fim. Termina como começou, e é essa simetria que faz o take
// poder rodar em loop numa live sem soar como loop.
stack(
  // Kit VHULTO, indice medido com backend/tools/sample_probe.py — nada de bd/hh
  // de fabrica. `struct` guarda o ritmo; `n` escolhe QUAL golpe.
  s("vhulto_sampling_the_world_drumkit_kick").n(5)          // KICK - PLANT, mole
    .struct("x ~ ~ [~ x] ~ ~ x ~").gain(0.7).lpf(320)
    .mask("<0 1 1 1 1 1 0 0>/8"),
  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(17)   // SNARE - DARK
    .struct("~ ~ x ~").gain(0.4).room(0.6).size(3).lpf(4200)
    .mask("<0 0 1 1 1 1 0 0>/8"),
  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(2)         // HAT - OLDIE
    .struct("x*8").gain(saw.range(0.05, 0.16)).pan(sine.range(0.3, 0.7)).hpf(6000)
    .mask("<0 1 0 0 1 1 0 0>/8"),

  // a camada de vidro: a mesma voz duas vezes, a segunda 12 cents acima. O
  // batimento entre elas é o que soa "molhado" — não é reverb, é desafinação.
  note("<[d3,a3,f4] [c3,g3,e4] [bb2,f3,d4] [a2,e3,c4]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.12)))
    .attack(1.4).release(2.6).sustain(0.8)
    .lpf(sine.slow(16).range(500, 1700)).lpq(4) 
    .room(0.85).size(6).gain(0.22),

  // motivo agudo que aparece e some — degradeBy tira 1 em cada 4 notas, e é a
  // ausência que faz parecer improvisado.
  note("d5 ~ a4 f5 ~ e5 ~ ~").slow(2)
    .s("triangle").attack(0.02).release(0.6)
    .delay(0.5).delaytime(0.375).delayfeedback(0.45)
    .room(0.6).gain(0.18).degradeBy(0.25)
    .mask("<1 0 1 0 1 1 1 0>/8"),

  note("<d2 c2 bb1 a1>")
    .s("sine").attack(0.05).release(0.9).gain(0.5)
    .mask("<0 1 1 1 1 1 1 1>/8")
)
