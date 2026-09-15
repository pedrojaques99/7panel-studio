// acido-303 — analogue bubblebath: uma linha de 303 e um kick, mais nada. bpm 132.
// O interesse todo vem do filtro andando devagar (perlin em 8 ciclos) enquanto a
// ressonância respira em 12 — os dois nunca alinham, então nunca repete igual.
//
// ── ARRANJO ── cada casa = 8 ciclos (~15 s em 132 bpm)
//              1    2    3    4    5    6    7    8
//   bumbo      ●    ●    ●    ●    ·    ●    ●    ●
//   clap       ●    ●    ·    ●    ·    ●    ●    ●
//   chimbal    ·    ·    ●    ●    ·    ●    ●    ●
//   aberto     ·    ·    ·    ·    ·    ●    ●    ●
//   303        ·    ●    ●    ●    ●    ●    ●    ·   a linha é a faixa
//   sub        ·    ●    ●    ●    ●    ●    ●    ·
//   ─────────────────────────────────────────────────
//   arpejo     ·    ·    ·    ●    ●    ·    ●    ·   12-bit, o chip
//   stab       ·    ·    ●    ·    ●    ●    ●    ●   o hoover de 93
//   blip       ·    ●    ●    ·    ·    ●    ●    ●   memory card
//
// ── VINTAGE ── as três de cima não são "estilo retrô", são a limitação
// literal: `crush()` corta os bits e `coarse()` corta a taxa de amostragem, que
// é o que o SPU do PS1/PS2 fazia com todo som que passava por ele. Quadrada com
// 6 bits e taxa dividida por 2 soa como aquilo porque É aquilo. O arpejo entra
// na casa 4 — depois que a 303 já se explicou — e some na 6, pra voltar na 7.
//
// Acid não é sobre acrescentar: a 303 fica sozinha na abertura e sozinha de novo
// no passo 5, com o filtro no meio da varredura. É o mesmo material o tempo
// todo, e a forma vem de quem cala.
//
// ── QUEBRAS ── a crítica: "tá muito certinha". Estava — a percussão era a mesma
// grade em todos os 64 ciclos, e o único movimento vinha do filtro. A quebra
// aqui é FRASEADA, não sorteada: cada camada tem um período diferente, e o que
// muda é sempre a ÚLTIMA casa da frase.
//
//   bumbo    frase de 8 ciclos, o 8º quebra           `<x*4!7 ...>`
//   chimbal  frase de 4 ciclos, o 4º dobra a última   `<[~ x]*4!3 ...>`
//   clap     frase de 4 ciclos, o 4º vira flam
//   aberto   frase de 4 ciclos, o 4º anda um tempo pra trás
//
// 8, 4, 4 e 4 com fases diferentes: as quebras quase nunca caem no mesmo ciclo,
// então a peça não fica com um "momento de virada" a cada X compassos — que é
// só outra forma de ser certinha. O que é sorteado é DINÂMICA (gain por golpe,
// buraco ocasional no chimbal), nunca a colocação: acid com nota fora do lugar
// vira erro, acid com golpe mais fraco vira mão humana.
stack(
  // Kit VHULTO (indice via backend/tools/sample_probe.py): kick TEKNO, clap
  // DISTRESS, hat STEPZ, aberto JUICY. Bateria com sujeira propria, nao 909 limpa.
  // O bumbo segura 7 ciclos e quebra no 8º: `[x ~ x [x x]]` tira o tempo 2 e
  // dobra o 4. Um ciclo em oito — o suficiente pro corpo notar, longe demais
  // pra virar padrão. Acento no tempo 1 pelo gain, não pelo sample.
  s("vhulto_sampling_the_world_drumkit_kick").n(8)
    .struct("<x*4!7 [x ~ x [x x]]>")
    .gain("0.95 0.82 0.88 0.84").lpf(140).shape(0.3)
    .mask("<1 1 1 1 0 1 1 1>/8"),
  // Clap: no 4º ciclo o segundo vira flam (`[x x]`). O `.off()` põe uma cópia
  // fraca 1/8 depois — é o que faz o clap soar numa sala em vez de colado.
  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(0)
    .struct("<[~ x ~ x]!3 [~ x ~ [x x]]>")
    .gain(0.3).room(0.35)
    .off(0.125, x => x.gain(0.09).hpf(1800).pan(0.3))
    .mask("<1 1 0 1 0 1 1 1>/8"),
  // O chimbal é onde a mão aparece: contratempo por 3 ciclos e, no 4º, o último
  // dobra (`[~ x x]`). O gain sorteado POR GOLPE (rand depois do struct — antes
  // ele valeria pro ciclo inteiro) tira o clone perfeito, e o degrade de 6%
  // engole um golpe de vez em quando, que é o que um braço cansado faz.
  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(7)
    .struct("<[~ x]*4!3 [[~ x] [~ x] [~ x] [~ x x]]>")
    .gain(rand.range(0.15, 0.27)).pan(0.62)
    .degradeBy(0.06)
    .mask("<0 0 1 1 0 1 1 1>/8"),
  // O aberto marca o fim do compasso; no 4º ciclo ele ANDA um tempo pra trás e
  // deixa o fim sem tampa. Só isso já muda a respiração da frase inteira.
  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(10)
    .struct("<[~ ~ ~ x]!3 [~ ~ x ~]>")
    .gain(0.24).hpf(4000)
    .mask("<0 0 0 0 0 1 1 1>/8"),

  // A linha ganhou uma casa que alterna em 3 (`<3 3 5>`): 3 contra as frases de
  // 4 e 8 da percussão, então a combinação leva 24 ciclos pra se repetir. O
  // `ply(2)` de 12% é o stutter da 303 — a mesma nota batida duas vezes dentro
  // do próprio tempo, que é acidente de sequencer, não nota nova.
  n("0 <0 7> 12 0 <3 3 5> 0 <10 14> 7").fast(2)
    .sometimesBy(0.22, x => x.add(7))       // pula de oitava sozinha, como slide
    .sometimesBy(0.12, x => x.ply(2))       // stutter: bate duas no mesmo tempo
    .scale("a1:minor")
    .s("sawtooth")
    .lpf(perlin.slow(8).range(260, 2600))
    .lpq(sine.slow(12).range(8, 18))
    .attack(0.01).decay(0.14).sustain(0).release(0.06)
    .shape(0.35)
    // Acento: 16 semicolcheias com a 1 e a 9 mais fortes. É o que separa uma
    // linha de 303 tocada de uma linha de 303 digitada.
    .gain("0.56 0.36 0.42 0.38 0.44 0.36 0.46 0.38")
    .delay(0.3).delaytime(0.1875).delayfeedback(0.42)
    .pan(0.45)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  note("<a1 a1 f1 g1>").s("sine").attack(0.01).release(0.5).gain(0.6)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  /* ── vintage ──────────────────────────────────────────────────────── */

  // Arpejo 12-bit: 16 notas por ciclo em lá menor, duas casas alternando por
  // ciclo pra frase não fechar igual. `crush(6)` + `coarse(2)` é o SPU.
  n("0 7 12 14 0 7 14 12 0 5 12 14 <2 4> 7 11 <14 16>")
    .scale("a3:minor").s("square")
    .crush(6).coarse(2)
    .attack(0.005).decay(0.09).sustain(0).release(0.05)
    .gain(0.15).pan(0.35)
    .delay(0.25).delaytime(0.1875).delayfeedback(0.35)
    .mask("<0 0 0 1 1 0 1 0>/8"),

  // Stab: FX - RAVE SYNTH 2 (n31) — o hoover de 93, uma vez a cada 4 compassos
  // e sempre no fim, com a afinação mudando. Stab que vem sempre igual vira
  // carimbo; o que muda de tom soa como alguém girando o pitch na hora.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(31)
    .struct("<~ ~ [~ ~ ~ x] ~>")
    .speed("<1 0.8 1.25 0.9>")
    .crush(7).gain(0.3).room(0.4).pan(0.68)
    .mask("<0 0 1 0 1 1 1 1>/8"),

  // Blip: FX - BOLHA (n3) em euclidiano 3-em-16, afinado pra cima por sorteio a
  // cada golpe. É o bip de menu / memory card: some no meio da batida e você
  // não sabe se ouviu, que é exatamente como aquilo soava.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(3)
    .euclid(3, 16)
    .speed(rand.range(1.4, 2.2))
    .crush(5).coarse(3)
    .gain(0.17).pan(sine.slow(7).range(0.25, 0.75)).room(0.3)
    .mask("<0 1 1 0 0 1 1 1>/8")/*fx*/.gain(0)
)
