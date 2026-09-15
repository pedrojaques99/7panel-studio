// heliosphan-ferro — SAW vol.1, o lado que ainda tem esperança. bpm 118.
//
// A fórmula do Richard em 91: um arpejo agudo que não para nunca, um break
// levinho embaixo, e um pad que segura a tristeza pra melodia poder ser alegre.
// Sem o pad, o arpejo vira ringtone. É a terceira voz que dá o peso.
//
// ── ARRANJO ──────────────────────────────────────────────────────────────
// Cada passo da grade = 8 ciclos (~16 s em 118 bpm). Oito passos = ~2 min por
// volta. A peça não começa nem termina com tudo tocando: entra em camadas e
// sai em camadas, que é o que separa música de loop.
//
//              1    2    3    4    5    6    7    8
//   pad        ●    ●    ●    ●    ●    ·    ●    ●     sempre: é a cama
//   arpejo     ·    ●    ●    ●    ·    ●    ●    ·     some no 5 e volta
//   baixo      ·    ·    ●    ●    ●    ●    ●    ·
//   bumbo      ·    ·    ·    ●    ●    ●    ●    ·     a batida entra no 4
//   caixa      ·    ·    ●    ·    ●    ●    ●    ·
//   chimbal    ·    ·    ·    ·    ●    ●    ·    ·     só no auge
//   chiado     ●    ●    ●    ●    ●    ●    ●    ●
//
// O passo 5 é o truque: o arpejo SAI justo quando a bateria fica completa, e
// volta no 6. Tirar a voz principal no auge faz o retorno dela soar como
// acontecimento — se ela nunca sai, nunca volta.
//
// A máscara é `"<...>/8"`: cada passo dura 8 ciclos. Mudar a peça inteira é
// reescrever essas oito casas.
stack(
  // o pad: mesma voz duas vezes, a segunda 10 cents acima. O batimento entre as
  // duas é o que soa "analógico" — não é reverb, é desafinação.
  note("<[e3,g3,b3,f4] [c3,g3,e4] [a2,e3,c4,g4] [d3,a3,f4]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.1)))
    .attack(0.9).release(1.8).sustain(0.85)
    .lpf(sine.slow(19).range(600, 2100)).lpq(3)
    .gain(0.2).room(0.7).size(5)
    .mask("<1 1 1 1 1 0 1 1>/8"),

  n("0 2 4 7 <9 11> 7 4 2").fast(2)
    .scale("e4:minor")
    .s("triangle").attack(0.005).decay(0.18).sustain(0).release(0.25)
    .gain(0.3)
    .delay(0.4).delaytime(0.1875).delayfeedback(0.42)
    .pan(sine.slow(7).range(0.35, 0.65))
    .room(0.4)
    .mask("<0 1 1 1 0 1 1 0>/8"),

  note("<e2 c2 a1 d2>").s("sine").attack(0.03).release(0.7).gain(0.5)
    .mask("<0 0 1 1 1 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_kick").n(5)         // KICK - PLANT
    .struct("x ~ ~ [~ x] ~ ~ x ~").gain(0.72).lpf(420)
    .mask("<0 0 0 1 1 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(17)   // SNARE - DARK
    .struct("~ ~ x ~").gain(0.42).room(0.5).size(3)
    .mask("<0 0 1 0 1 1 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(2)         // HAT - OLDIE
    .struct("x*8").gain(sine.slow(3).range(0.06, 0.15)).hpf(6500)
    .pan(sine.slow(5).range(0.3, 0.7))
    .mask("<0 0 0 0 1 1 0 0>/8"),

  // O chiado é de propósito: SAW foi gravado em fita cassete, e sem ruído nenhum
  // isso soa como plugin. Nunca sai — é a fita, não um instrumento.
  s("vhulto_sampling_the_world_drumkit_texture").n(5).slow(8).gain(0.05).hpf(2000)
)
