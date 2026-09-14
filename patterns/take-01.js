// take-01 — dub techno lento, respira no delay. bpm 122 no painel.
stack(
  s("bd ~ ~ ~").gain(0.95),
  s("~ ~ [~ sd] ~").gain(0.5),
  s("hh*8").gain(0.26).pan(sine.range(0.35, 0.65)),
  note("<c2 c2 eb2 g1>")
    .s("sawtooth").lpf(perlin.range(220, 900)).lpq(6)
    .decay(0.35).sustain(0).gain(0.55),
  note("<[c4,eb4,g4] ~ [bb3,d4,g4] ~>")
    .s("triangle").attack(0.08).release(0.9)
    .room(0.7).delay(0.35).gain(0.3)
)
