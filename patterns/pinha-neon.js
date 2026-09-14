// pinha-neon — tri-phi 2/3: a faixa do nerd. bpm 144 (Fibonacci).
//
// Aqui a terceira cabeça assume o comando e as outras duas trabalham pra ela.
// A ideia é uma só: TRÊS CICLOS COPRIMOS DE FIBONACCI RODANDO JUNTOS.
//
//   bumbo    frase de 8      `<...>` de 8 casas
//   ácido    frase de 13     .slow(13) na casa de notas
//   sino     frase de 5
//
//   mmc(5, 8, 13) = 520 ciclos. Em 144 bpm um ciclo é 1,67 s, então a
//   combinação só se repete inteira depois de 14 minutos. A peça dura 2m24s.
//   Tradução: o padrão vira e vira e NUNCA fecha. É a pinha — as espirais de
//   escamas são 5 num sentido, 8 no outro, 13 no terceiro, e é por isso que
//   você não consegue achar o "começo" de uma pinha olhando.
//
// ── ARRANJO ── cada casa = 8 ciclos (~13 s em 144 bpm)
//              1    2    3    4    5    6    7    8
//   bumbo      ●    ●    ●    ●    ●    ·    ●    ●   sai na 6
//   caixa      ·    ·    ●    ●    ●    ●    ●    ●
//   chimbal    ·    ●    ●    ●    ●    ·    ●    ·
//   ácido      ·    ·    ●    ●    ●    ·    ●    ·   a linha é a faixa
//   sub        ·    ·    ●    ●    ●    ·    ●    ●
//   sino       ·    ●    ·    ●    ●    ●    ●    ·
//   parede     ●    ●    ●    ●    ●    ●    ●    ●
//   dobra      ·    ●    ·    ·    ·    ●    ●    ·   só no buraco
//   blip       ·    ·    ·    ·    ·    ●    ●    ·
//
// ── O BURACO ── casa 6 = 8 × 0,618 ≈ 4,94, arredondado pra frente porque a
// bateria precisa de uma casa inteira pra fazer falta. Tudo que percute sai e
// sobra parede + sino por 13 s. Não é breakdown de festa (aquele tira o grave e
// mantém o pulso); é o pulso INTEIRO sumindo, o que dá vertigem. Volta na 7
// sem virada nenhuma — virada avisando que vai voltar estraga o susto.
//
// ── ÁCIDO ── a cabeça Aphex. `sometimesBy(.., x => x.add(12))` é o slide de
// oitava do sequencer da 303, e `ply(2)` é o stutter — a mesma nota batida duas
// vezes dentro do próprio tempo. Os dois são ACIDENTE DE MÁQUINA, não escolha
// de nota: acid com nota errada vira erro, acid com nota repetida vira 1988.
stack(
  // ── BUMBO EM 8 ──────────────────────────────────────────────────────
  // Kick TEKNO n8. Sete ciclos iguais e o 8º quebra: tira o tempo 2 e dobra o
  // 4. Um em oito é o suficiente pro corpo notar e longe demais pra virar
  // padrão — a mesma regra do acido-303, porque ela funciona.
  s("vhulto_sampling_the_world_drumkit_kick").n(8)
    .struct("<[x ~ ~ x]!7 [x ~ x [x x]]>")
    .gain("0.95 0.8 0.86 0.82").lpf(150).shape(0.35)
    .crush(9)                                     // o SPU: 9 bits em tudo
    .mask("<1 1 1 1 1 0 1 1>/8"),

  // Caixa DARK n17 no contratempo, com cópia 89 ms depois (Fibonacci) pra soar
  // numa sala. A 4ª frase vira flam.
  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(17)
    .struct("<[~ ~ x ~]!3 [~ ~ x [x x]]>")
    .gain(0.36).room(0.4).lpf(5200)
    .off(0.089, x => x.gain(0.11).hpf(2200).pan(0.72))
    .mask("<0 0 1 1 1 1 1 1>/8"),

  // ── CHIMBAL EM 5 ────────────────────────────────────────────────────
  // Euclidiano 5-em-8: a distribuição mais espalhada possível de 5 golpes em 8
  // casas. É o mesmo critério do ângulo áureo, só que em tempo em vez de
  // espaço — espalhar sem amontoar.
  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(7)
    .euclid(5, 8)
    .gain(rand.range(0.12, 0.24)).hpf(7000)
    .pan(sine.slow(21).range(0.28, 0.72))
    .degradeBy(0.08)
    .mask("<0 1 1 1 1 0 1 0>/8"),

  // ── ÁCIDO EM 13 ─────────────────────────────────────────────────────
  // Treze graus na casa `<>`, um por ciclo: a linha leva 13 ciclos pra fechar
  // contra o bumbo em 8 e o chimbal em 5. O filtro anda em perlin.slow(13) e a
  // ressonância respira em 8 — invertidos de propósito em relação às frases,
  // pra abertura de filtro nunca coincidir com a quebra da bateria.
  n("0 <0 7 3> 12 <0 5> 7 <3 10 5> 0 <7 12 14 0 3 7 10 12 5 14 0 7 3>")
    .fast(2)
    .sometimesBy(0.24, x => x.add(12))        // slide de oitava
    .sometimesBy(0.13, x => x.ply(2))         // stutter de sequencer
    .scale("f#1:minor")
    .s("sawtooth")
    .lpf(perlin.slow(13).range(240, 2800))
    .lpq(sine.slow(8).range(9, 19))
    .attack(0.008).decay(0.13).sustain(0).release(0.05)
    .shape(0.4)
    .gain("0.54 0.34 0.42 0.36 0.46 0.34 0.44 0.36")
    .delay(0.32).delaytime(0.144).delayfeedback(0.44)   // Fibonacci ms
    .pan(0.44)
    .mask("<0 0 1 1 1 0 1 0>/8"),

  // Sub separado: a 303 filtrada não segura chão nenhum sozinha.
  note("<f#1 f#1 d1 c#1 f#1 a0 d1 c#1>").s("sine")
    .attack(0.01).release(0.6).gain(0.6).lpf(110)
    .mask("<0 0 1 1 1 0 1 1>/8"),

  // ── SINO φ EM 5 ─────────────────────────────────────────────────────
  // O mesmo sino inarmônico da faixa 1 (parcial em +8,3 semitons = razão φ),
  // aqui em frase de 5. Ele é a única voz que NÃO sai no buraco, junto com a
  // parede — a peça inteira desce pra essas duas e sobe de volta.
  note("<c#5 g#5 f#5 b4 e5>").s("triangle")
    .superimpose(x => x.add(note(8.3)).gain(0.45).pan(0.78))
    .struct("x ~ ~ x ~ ~ x ~").slow(5)
    .attack(0.004).decay(0.18).sustain(0).release(0.9)
    .delay(0.4).delaytime(0.377).delayfeedback(0.48)     // Fibonacci ms
    .room(0.75).size(6).gain(0.16).pan(0.34)
    .mask("<0 1 0 1 1 1 1 0>/8"),

  // ── PAREDE ──────────────────────────────────────────────────────────
  // Camada base, presente da casa 4 em diante.
  note("<[f#3,c#4,a4] [d3,a3,f#4] [c#3,g#3,e4] [a2,e3,c#4]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.12)).pan(0.26))
    .attack(3.0).release(4.0).sustain(0.88)
    .shape(0.5).lpf(4000).hpf(200)
    .room(0.92).size(8).gain(0.15).pan(0.66)
    .mask("<1 1 1 1 1 1 1 1>/8"),
  // A dobra do buraco: MESMA parede, só na casa 6, uma oitava acima e mais
  // alta. Quando a bateria sai, ela é o que sobra — e sobra maior do que era.
  note("<[f#4,c#5,a5] [d4,a4,f#5] [c#4,g#4,e5] [a3,e4,c#5]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(-0.13)).pan(0.7))
    .attack(4.0).release(5.0).sustain(0.9)
    .shape(0.6).lpf(3200).hpf(240)
    .room(0.96).size(9).gain(0.17).pan(0.3)
    .mask("<0 1 0 0 0 1 1 0>/8"),

  // ── BLIP ────────────────────────────────────────────────────────────
  // FX - BOLHA n3 em euclidiano 3-em-16, bitcrushado. O bip de memory card:
  // some antes de você decidir se ouviu. Serve de cola entre a grade de 8 e a
  // de 13, que sem isso soam como duas músicas.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(3)
    .euclid(3, 16)
    .speed(rand.range(1.3, 2.1))
    .crush(5).coarse(3)
    .gain(0.14).room(0.3).pan(sine.slow(8).range(0.2, 0.8))
    .mask("<0 0 0 0 0 1 1 0>/8")/*fx*/.gain(0)
)
