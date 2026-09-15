// stone-em-foco — SAW vol.2: sem batida, sem tônica, sem consolo. bpm 56.
//
// O volume 2 é outro disco: nenhuma faixa tem nome, quase nenhuma tem ritmo, e
// a sensação de assombro vem de um detalhe técnico — as fitas do Richard estavam
// gastas, e a rotação oscilava. A afinação inteira do disco respira.
//
// Aqui isso é literal: `speed(sine.slow(N).range(0.994, 1.006))` faz cada camada
// desafinar meio por cento pra cada lado, cada uma no seu período (13, 17, 29).
// Nunca desafinam juntas, então nunca dá pra dizer QUAL delas está errada. Esse
// é o som do volume 2, e não tem a ver com reverb.
//
// Não há bumbo, caixa nem chimbal neste arquivo. De propósito: a única coisa que
// marca tempo é o sino, e ele vem a cada 9 compassos.
//
// estatico: nada entra e nada sai. O volume 2 é sobre um estado que já estava
// acontecendo quando você chegou e continua depois que você sai — arranjo com
// começo e fim contaria uma história, e a peça é justamente sobre não haver
// história. A variação vem da afinação respirando em 13/17/29, não de camadas.
stack(
  // a placa de fundo: pad escuro, quase parado, rodando em 6 compassos
  s("zero_g_ce07_dream_zone").n(171)
    .struct("x").slow(6)
    .begin(0.1).end(0.55)
    .speed(sine.slow(11).range(0.994, 1.006))
    .gain(0.34).lpf(sine.slow(31).range(700, 2000))
    .room(0.85).size(8).pan(0.42),

  // a segunda placa, uma quinta abaixo (speed 0.66) e em outro período
  s("zero_g_ce07_dream_zone").n(193)
    .struct("x").slow(11)
    .begin(0.15).end(0.6)
    .speed(sine.slow(17).range(0.66, 0.668))
    .gain(0.26).lpf(900)
    .room(0.9).size(9).pan(0.6),

  // o agudo que não resolve: uma nota só, com ataque de 4 s, entrando em 7
  note("f5").s("triangle")
    .struct("x").slow(7)
    .attack(4).release(3).sustain(0.7)
    .gain(0.11).room(0.9).size(9)
    .pan(sine.slow(29).range(0.3, 0.7)),

  // o sino: a única coisa com ataque no arquivo inteiro, a cada 9 compassos
  s("vhulto_sampling_the_world_drumkit_percs").n(3)        // PERC - BELL TUBULAR
    .struct("x").slow(9)
    .speed(sine.slow(29).range(0.985, 1.015))
    .gain(0.2).room(0.85).size(8),

  // grave surdo, sem ataque perceptível
  note("f1").s("sine").struct("x").slow(13)
    .attack(3).release(7).gain(0.3),

  s("vhulto_sampling_the_world_drumkit_texture").n(0).slow(8).gain(0.08).hpf(1200)
)
