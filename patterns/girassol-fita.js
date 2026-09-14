// girassol-fita — tri-phi 1/3: Aphex × shoegaze × razão áurea. bpm 89.
//
// O trio inventado: quem faz o timbre (Aphex), quem faz a massa (shoegazer) e
// quem faz a FORMA (o nerd de Fibonacci). A regra da série é que a terceira
// cabeça não pode ser decoração — se φ só aparece no texto do release, ele não
// tocou em nada. Aqui ele decide bpm, duração de frase, delay e panorama.
//
// ── ARRANJO ── cada casa = 8 ciclos (~21 s em 89 bpm)
//              1    2    3    4    5    6    7    8
//   sino       ·    ·    ●    ·    ·    ·    ·    ●   a peça é ele
//   pad        ·    ●    ●    ●    ●    ●    ·    ·
//   baixo      ·    ·    ●    ·    ●    ●    ●    ●
//   rhodes     ·    ·    ●    ●    ●    ●    ●    ●
//   bumbo      ·    ·    ●    ●    ●    ●    ·    ·   entra em 0,382
//   caixa      ·    ●    ●    ●    ●    ●    ·    ·
//   chimbal    ·    ●    ●    ●    ●    ●    ·    ·
//   parede     ·    ●    ●    ·    ●    ●    ●    ·   abre em 0,618
//   fita       ●    ●    ●    ●    ●    ●    ●    ●
//
// A casa 5 é o ponto áureo das oito: 8 × 0,618 = 4,94. É lá que a parede
// shoegaze abre e come tudo. Não é "no meio" nem "no fim" — é no lugar onde a
// espera já cansou mas ainda não desistiu, que é o que 0,618 significa.
//
// ── OS QUATRO φ QUE DÁ PRA OUVIR ────────────────────────────────────────
//
//   1. SINO INARMÔNICO. Um sino de verdade tem parciais em 1, 2, 3, 4×. Este
//      tem em 1 e 1,618× — o `superimpose` que soma 8,3 semitons (= φ em
//      intervalo) cria um parcial que não pertence a harmônica nenhuma. Sai um
//      metal sem fundamental clara: você ouve a batida, não a nota. É por isso
//      que soa "caixinha de música estragada" e não "sino".
//
//   2. DELAY EM MS DE FIBONACCI. `delaytime(0.233)` contra um ciclo de 0,674 s:
//      233 ms não é divisor de nada aqui, então o eco nunca cai em cima do
//      golpe seguinte. Vira nuvem em vez de repetição. Delay em 1/8 soa como
//      efeito; delay em número primo-ish soa como sala.
//
//   3. FRASES DE 5, 8 E 13. Sino em 8, rhodes em 5, baixo em 13. As três voltam
//      juntas ao início só a cada 520 ciclos (~6 min) — mais do que a peça
//      dura. Na prática: nunca repete.
//
//   4. PAN POR ÂNGULO ÁUREO. Cada camada senta num ponto do estéreo girado
//      137,5° em relação à anterior (0.5, 0.88, 0.26, 0.64, 0.12...). É a
//      distribuição do girassol: a que mais demora a amontoar duas sementes no
//      mesmo lugar. Aqui: nenhuma voz senta em cima de outra.
//
// ── POR QUE 89 BPM ── Fibonacci, e cai onde o shoegaze mora: rápido demais pra
// drone, lento demais pra batida. O break entra em meia-velocidade percebida.
stack(
  // ── SINO φ ──────────────────────────────────────────────────────────
  // A frase tem 8 notas e o `<>` gira uma por ciclo, então a mesma sequência
  // leva 8 ciclos pra fechar. O `add(note(8.3))` é o parcial áureo: 8,3
  // semitons = razão 1,618. Somado à MESMA voz, não é harmonia — é timbre.
  note("<f#4 c#5 a4 e5 g#4 b4 f#5 c#4>")
    .s("triangle")
    .superimpose(x => x.add(note(8.3)).gain(0.5).pan(0.72))   // o parcial φ
    .attack(0.005).decay(0.22).sustain(0.02).release(1.1)
    .delay(0.45).delaytime(0.233).delayfeedback(0.5)          // Fibonacci ms
    .room(0.7).size(6)
    .gain(0.24).pan(0.5)
    .degradeBy(0.18)
    .mask("<0 0 1 0 0 0 0 1>/8")/*fx*/.gain(0),                                          // o que falta compõe

  // ── PAD DE FITA ─────────────────────────────────────────────────────
  // Progressão que não pede resolução — o shoegazer só aguenta acorde com nona.
  // `speed` em sine.slow(21) desafina meio por cento pra cada lado: o pad soa
  // gravado em fita, não tocado num sinte. 21 é Fibonacci e não bate com o 16
  // do filtro, então a respiração nunca alinha com a abertura.
  note("<[f#2,c#3,g#3] [d2,a2,f#3] [c#2,g#2,e3] [a1,e2,c#3]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.07)))     // 7 cents: batimento lento
    .attack(2.6).release(3.4).sustain(0.85)
    .lpf(sine.slow(16).range(420, 1500)).lpq(3)
    .speed(sine.slow(21).range(0.995, 1.005))
    .room(0.9).size(7).gain(0.2).pan(0.38)
    .mask("<0 1 1 1 1 1 0 0>/8"),

  // ── BAIXO EM 13 ─────────────────────────────────────────────────────
  // Cinco notas em `slow(13)`: a nota dura 13 ciclos e a frase leva 65 pra
  // fechar. Contra o pad em 4 isso significa que o baixo quase nunca troca
  // junto com o acorde — e a fricção de meio compasso é o que dá o peso.
  // (`struct` antes de `s`: o portão do repo exige, e o motivo é real — sinal
  // escrito antes do struct é amostrado uma vez por ciclo, não por evento.)
  note("<f#1 d1 c#1 a0 e1>")
    .struct("x").slow(13)
    .s("sine")
    .attack(0.08).release(4.0)
    .gain(0.55).lpf(120)
    .mask("<0 0 1 0 1 1 1 1>/8"),

  // ── RHODES-FM EM 5 ──────────────────────────────────────────────────
  // Cinco notas contra o sino em 8: 40 ciclos pra reencontrar. É a camada que
  // parece improvisada e não é — é só período coprimo.
  note("<c#5 g#4 e5 b4 f#5>")
    .struct("x*2").slow(5)
    .s("sine")
    .superimpose(x => x.add(note(12)).gain(0.35))   // 2ª harmônica = brilho de DX
    .attack(0.004).decay(0.3).sustain(0.05).release(0.7)
    .lpf("<2200 2200 4200 4200 4200 4200>/8")       // abre junto com a bateria
    .delay(0.3).delaytime(0.144).delayfeedback(0.4)
    .room(0.5).gain(0.17).pan(0.88)
    .mask("<0 0 1 1 1 1 1 1>/8"),

  // ── BATERIA (casa 4 = 0,382) ────────────────────────────────────────
  // Kit VHULTO, índices dos takes já validados (kick PLANT n5, snare DARK n17,
  // hat OLDIE n2). O bumbo não cai no 1-e-3: `x ~ ~ [~ x] ~ x ~ ~` deixa o
  // tempo forte vazio duas vezes em oito. Break de Aphex é isso — a grade está
  // lá, o pé é que não está.
  s("vhulto_sampling_the_world_drumkit_kick").n(5)
    .struct("x ~ ~ [~ x] ~ x ~ ~")
    .gain(0.72).lpf(340).shape(0.25)
    .mask("<0 0 1 1 1 1 0 0>/8"),
  s("vhulto_sampling_the_world_drumkit_snares_claps_n_rims").n(17)
    .struct("<[~ ~ x ~]!4 [~ ~ x [x x]]>")           // a 4ª frase quebra
    .gain(0.34).room(0.65).size(4).lpf(3800)
    .off(0.089, x => x.gain(0.1).hpf(2000).pan(0.26))  // 89 ms: o eco é Fibonacci
    .mask("<0 1 1 1 1 1 0 0>/8"),
  s("vhulto_sampling_the_world_drumkit_hats_n_shakers").n(2)
    .struct("[~ x]*4")
    .gain(rand.range(0.06, 0.15)).hpf(6500)
    .pan(sine.slow(13).range(0.26, 0.74))
    .degradeBy(0.12)
    .mask("<0 1 1 1 1 1 0 0>/8"),

  // ── PAREDE SHOEGAZE (casa 5 = 0,618) ────────────────────────────────
  // O mesmo acorde do pad uma oitava acima, com `shape` alto ANTES do reverb.
  // Essa ordem é a peça inteira: distorcer e depois molhar dá parede;
  // molhar e depois distorcer dá lama. `lpq` baixo e `lpf` fechado em 3,6 k
  // porque parede shoegaze não é brilhante — é grossa.
  note("<[f#3,c#4,g#4,a4] [d3,a3,f#4,c#5] [c#3,g#3,e4,b4] [a2,e3,c#4,g#4]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.14)).pan(0.24))   // 14 cents: o coro sujo
    .superimpose(x => x.add(note(-0.11)).pan(0.76))
    .attack(5.5).release(6.0).sustain(0.9)
    .shape(0.55).lpf(3600).hpf(180)
    .room(0.95).size(9)
    .gain(0.19).pan(0.62)
    .mask("<0 1 1 0 1 1 1 0>/8"),

  // ── FITA ────────────────────────────────────────────────────────────
  // Chiado constante, quase inaudível, o tempo todo. Sem isso as camadas ficam
  // soltas no vazio digital e a peça deixa de soar gravada.
  s("dirt_wind").n(0)
    .struct("x").slow(21)
    .gain(0.055).hpf(900).lpf(7000).room(0.35)
)
