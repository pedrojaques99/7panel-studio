// discreto-fita — discreet music: a melodia é curta, a fita é longa. bpm 84.
//
// Eno gravou isso com dois gravadores ligados um no outro: o que entrava voltava
// segundos depois, por cima do que estava entrando. Aqui o eco longo (delaytime
// alto, feedback 0.6) faz o mesmo — a peça é feita quase toda do próprio rastro,
// e o filtro no retorno vai escurecendo cada volta, como fita gastando.
//
// Tocar por 30 segundos não mostra nada. Isso precisa de cinco minutos parado.
//
// estatico: as duas fitas começam juntas e ficam. O que muda com o tempo é o
// acúmulo do próprio eco — no minuto um se ouve a melodia, no minuto quatro se
// ouve o rastro dela sobre si mesma. A forma é o feedback enchendo a sala, e
// isso já é um começo-meio-fim; só não é feito de entrada de instrumento.
stack(
  note("<bb3 ~ d4 ~ f4 ~ ~ c4>").slow(6)
    .s("triangle").attack(0.6).release(2.5)
    .delay(0.6).delaytime(1.5).delayfeedback(0.6)
    .lpf(sine.slow(37).range(600, 2400))
    .room(0.85).size(7).gain(0.24)
    .pan(sine.slow(19).range(0.3, 0.7)),

  // a segunda fita: mesma melodia, período 11, uma quinta abaixo. Sozinha é
  // pobre; contra a primeira é o que dá a impressão de que alguém decidiu algo.
  note("<eb3 ~ g3 ~ bb3 ~ ~ f3>").slow(11)
    .s("sine").attack(1).release(3)
    .delay(0.5).delaytime(2.25).delayfeedback(0.55)
    .room(0.8).size(6).gain(0.2)
    .pan(sine.slow(23).range(0.7, 0.3)),

  note("bb1").s("sine").slow(17).attack(3).release(6).gain(0.16)
)
