// cama-eno — music for airports 2/1: seis vozes, seis períodos primos entre si.
// bpm 60 (mas o bpm quase não importa aqui).
//
// A regra do Eno é uma só: nenhuma fita tem o mesmo comprimento. Cada nota volta
// a cada 7, 11, 13, 17, 19, 23 ciclos — como são primos entre si, o conjunto só
// se repete idêntico depois de 7*11*13*17*19*23 = 6.7 milhões de ciclos. Em 60
// bpm isso é mais tempo do que a sala vai existir. Não é aleatório: é escrito e
// nunca se repete, que é coisa diferente.
//
// Não mexa nos números pra "arredondar". 12 e 18 dividem 6 e a peça vira loop.
//
// estatico: as seis vozes entram juntas e não saem nunca, de propósito. A forma
// aqui não é entrada e saída de camadas — é o desencontro dos períodos, que faz
// o conjunto nunca se repetir. Music for Airports não tem clímax nem virada; ela
// é a mesma coisa o tempo todo e mesmo assim nunca é a mesma coisa. Pôr arranjo
// nisso seria transformar o Eno em música pop.
stack(
  note("d4").s("piano").slow(7).gain(0.40),
  note("f4").s("piano").slow(11).gain(0.34),
  note("a4").s("piano").slow(13).gain(0.30),
  note("c5").s("piano").slow(17).gain(0.26),
  note("e5").s("piano").slow(19).gain(0.22),
  note("d3").s("piano").slow(23).gain(0.30),

  // o chão: uma senóide que leva 4 ciclos pra abrir e 8 pra fechar, então nunca
  // se ouve começar nem terminar.
  note("d2").s("sine").slow(29).attack(4).release(8).gain(0.18)
).room(0.9).size(8)
