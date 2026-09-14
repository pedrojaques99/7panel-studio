// confield-vidro — Autechre tardio (Confield/Draft), o lado ambiente. bpm 108.
//
// O Autechre depois de 2001 não escreve ritmo: escreve RELAÇÃO, e o ritmo é o
// que sobra do encontro. Aqui não existe nenhum compasso escrito à mão. Cada
// voz metálica roda num euclidiano de tamanho PRIMO — 11, 13, 17, 19 — e o
// mínimo múltiplo comum entre eles é 46.189 ciclos. Traduzindo: a peça não
// repete um compasso inteiro em quatro horas de execução.
//
// Por isso ela não tem quebra escrita nem virada. Não precisa: o que segura a
// escuta não é a surpresa, é o fato de que nenhuma coincidência entre duas
// vozes acontece duas vezes. É o oposto do acido-303, onde a quebra é fraseada
// e a graça é justamente reconhecer a frase.
//
// Nada aqui é afinado, de propósito. Vidro, metal e clique não têm nota — têm
// altura. Sem tônica, sem acorde, e o único grave é um seno que não resolve.
//
// ── ARRANJO ── cada casa = 8 ciclos (~18 s em 108 bpm)
//              1    2    3    4    5    6    7
//   drone      ●    ●    ●    ●    ●    ●    ●
//   vidro      ●    ●    ●    ●    ●    ●    ●   euclid 3-em-11
//   metal      ·    ●    ●    ·    ●    ●    ●   euclid 5-em-13
//   tink       ·    ·    ●    ●    ●    ·    ●   euclid 7-em-17
//   clique     ·    ·    ·    ●    ●    ●    ·   euclid 11-em-19
//   sub        ·    ●    ●    ●    ●    ●    ●
//
// As camadas entram por densidade, não por melodia: cada uma que entra aumenta
// a chance de coincidência, e é isso que a peça vai revelando.
stack(
  // Monólito: 12 s de pad esticados em 11 compassos, respirando em 31.
  s("dirt_pad").n(0)
    .struct("x").slow(11)
    .speed(0.7)
    .gain(0.28).lpf(sine.slow(31).range(400, 1400))
    .room(0.85).size(9).pan(0.48)
    .mask("<1 1 1 1 1 1 1>/8"),

  // Vidro em 3-de-11. O sample e o `speed` são sorteados POR GOLPE (depois do
  // euclid), então cada toque soa como um copo diferente — nunca o mesmo objeto
  // duas vezes. Sorteio de TIMBRE é legítimo aqui; sorteio de colocação não,
  // e por isso a grade é euclidiana e não aleatória.
  s("dirt_glasstap").n(irand(3))
    .euclid(3, 11)
    .speed(rand.range(0.8, 1.9))
    .gain(rand.range(0.3, 0.5)).hpf(1200)
    .room(0.8).size(8).pan(rand.range(0.2, 0.8))
    .mask("<1 1 1 1 1 1 1>/8"),

  // Metal em 5-de-13, meia velocidade: barra grande, longe.
  s("dirt_metal").n(irand(9))
    .euclid(5, 13)
    .speed(rand.range(0.45, 0.7))
    .gain(rand.range(0.18, 0.32)).lpf(3000)
    .room(0.9).size(9).pan(rand.range(0.1, 0.5))
    .mask("<0 1 1 0 1 1 1>/8"),

  // Tink em 7-de-17: o mais agudo e o mais raro.
  s("dirt_tink").n(irand(5))
    .euclid(7, 17)
    .speed(rand.range(1.0, 1.6))
    .gain(rand.range(0.2, 0.36)).hpf(2500)
    .room(0.75).size(7).pan(rand.range(0.4, 0.9))
    .mask("<0 0 1 1 1 0 1>/8"),

  // Clique em 11-de-19, seco: é o que dá sensação de mecanismo, não de sala.
  s("dirt_click").n(irand(4))
    .euclid(11, 19)
    .speed(rand.range(0.9, 1.4))
    .gain(rand.range(0.08, 0.16)).hpf(900)
    .room(0.25)
    .mask("<0 0 0 1 1 1 0>/8"),

  // O grave que não resolve: mesma nota sempre, a cada 19 compassos.
  note("d1").s("sine").struct("x").slow(19)
    .attack(2.5).release(6).gain(0.3).lpf(140)
    .mask("<0 1 1 1 1 1 1>/8")
)
