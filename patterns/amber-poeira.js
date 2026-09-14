// amber-poeira — Autechre, era Amber (1994). bpm 96.
//
// O Amber é o disco em que a máquina toca uma balada. Não tem nada de quebrado:
// tem uma caixa de ritmo barata, um acorde melancólico e um delay grande, e a
// beleza vem de a máquina não conseguir tocar direito — o swing do DR-55 não é
// programável, é um defeito de circuito.
//
// Aqui isso é literal: a bateria é o `dirt/dr55` (o Boss DR-55 de verdade,
// quatro sons no banco inteiro) com `swingBy(1/3, 4)`. E a melodia roda em
// SETE ciclos contra uma bateria de quatro: as duas só se reencontram a cada
// 28 compassos, então a mesma nota cai num lugar diferente do compasso quase
// sempre. Não é humanização por sorteio — é período contra período, que é como
// o Autechre faz, e é por isso que nunca soa aleatório.
//
// ── ARRANJO ── cada casa = 8 ciclos (~20 s em 96 bpm)
//              1    2    3    4    5    6
//   pad        ●    ●    ●    ●    ●    ●   a cama, nunca sai
//   acordes    ●    ●    ●    ●    ●    ●
//   melodia    ·    ●    ●    ·    ●    ●   cala na 5, volta na 6
//   bumbo      ·    ·    ●    ●    ●    ●
//   chimbal    ·    ·    ●    ●    ●    ●
//   rim        ·    ●    ●    ·    ●    ●
//   sub        ·    ●    ●    ●    ●    ●
//
// A casa 5 tira a melodia justo quando a bateria fica completa. Mesma decisão
// do heliosphan-ferro e pelo mesmo motivo: voz que nunca sai nunca volta, e o
// retorno dela na casa 6 é o único acontecimento da peça.
stack(
  // A cama: 26 s de drone esticados em 16 compassos, filtro andando em 29.
  s("dirt_padlong").n(0)
    .struct("x").slow(16)
    .speed(0.85)
    .gain(0.26).lpf(sine.slow(29).range(600, 1800))
    .room(0.7).size(7)
    .mask("<1 1 1 1 1 1>/8"),

  // Dó menor com a sétima: o acorde do Amber é sempre um que não fecha.
  note("<[c3,eb3,g3,bb3] [ab2,c3,eb3] [bb2,d3,f3,ab3] [g2,bb2,d3]>").s("sawtooth")
    .struct("x")
    .attack(1.1).release(1.8).sustain(0.7)
    .gain(0.13).lpf(sine.slow(19).range(500, 1300))
    .room(0.75).size(7).pan(0.45)
    .mask("<1 1 1 1 1 1>/8"),

  // A melodia no banco arpy (as notas do banco já sobem em escala, então `n` é
  // grau, não índice cego). Sete notas em sete ciclos: a cada volta ela entra
  // num ponto diferente do compasso.
  n("<0 2 4 7 4 2 0>").s("dirt_arpy")
    .struct("x*2").slow(7)
    .gain(0.3).lpf(2600)
    .room(0.8).size(8).delay(0.4).delaytime(0.375).delayfeedback(0.55)
    .pan(0.6)
    .mask("<0 1 1 0 1 1>/8"),

  // DR-55: kick, e o swing de 1/3 que é a assinatura da máquina.
  s("dirt_dr55").n(1)
    .struct("x ~ ~ x ~ ~ x ~")
    .swingBy(1/3, 4)
    .gain(0.55).lpf(200).shape(0.2)
    .mask("<0 0 1 1 1 1>/8"),

  // Chimbal no contratempo, com o gain sorteado por golpe — a máquina é
  // constante, a fita que a gravou não era.
  s("dirt_dr55").n(0)
    .struct("~ x ~ x ~ x ~ x")
    .swingBy(1/3, 4)
    .gain(rand.range(0.1, 0.2)).hpf(5000)
    .room(0.3).pan(0.35)
    .mask("<0 0 1 1 1 1>/8"),

  // O rim entra por último e só marca o 3 — no Amber a percussão é comentário.
  s("dirt_dr55").n(2)
    .struct("~ ~ x ~")
    .gain(0.22).room(0.6).size(5).pan(0.7)
    .delay(0.3).delaytime(0.1875).delayfeedback(0.4)
    .mask("<0 1 1 0 1 1>/8"),

  note("<c2 ab1 bb1 g1>").s("sine").struct("x")
    .attack(0.5).release(1.5).gain(0.32).lpf(180)
    .mask("<0 1 1 1 1 1>/8")
)
