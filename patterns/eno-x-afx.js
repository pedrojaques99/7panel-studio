// eno-x-afx — o encontro. bpm 96.
//
// A harmonia é do Eno: três vozes em 5, 7 e 9 ciclos, então a "progressão" não
// é escrita em lugar nenhum — ela é o desencontro dos três períodos.
// O detalhe é do Aphex: cada voz dobrada 11 cents acima (o batimento faz o som
// parecer molhado sem reverb) e um break que a máscara vai comendo.
stack(
  note("<f3 ab3>").s("sawtooth").slow(5)
    .superimpose(x => x.add(note(0.11)))
    .attack(1.8).release(3).sustain(0.85)
    .lpf(sine.slow(23).range(400, 1500)).lpq(3).gain(0.20)/*fx*/.gain(0),

  note("<c4 eb4>").s("sawtooth").slow(7)
    .superimpose(x => x.add(note(0.11)))
    .attack(2.2).release(3.5).sustain(0.85)
    .lpf(sine.slow(31).range(500, 1800)).lpq(3).gain(0.17),

  note("<ab4 g4>").s("triangle").slow(9)
    .attack(1.2).release(4)
    .delay(0.45).delaytime(0.75).delayfeedback(0.5).gain(0.14),

  // O break do Aphex sob a lei do Eno: o padrão nunca muda, quem muda é o que
  // sobra dele. A máscara tem período 5 contra um break de 1 — o mesmo golpe
  // cai em lugar diferente cada volta. (A máscara é mini puro: `"...".slow()`
  // não existe, string não é Pattern até virar argumento.)
  s("bd ~ ~ [~ bd] ~ ~ sd ~")
    .lpf(400).gain(0.55)
    .mask("<1 1 0 1 0>")
    .room(0.6).size(4),

  s("hh*8").gain(0.1).hpf(7000).pan(sine.slow(13).range(0.25, 0.75))
    .mask("<1 0 0 1 0 0 1>"),

  note("f1").s("sine").slow(11).attack(2).release(4).gain(0.4)/*fx*/.gain(0)
)
