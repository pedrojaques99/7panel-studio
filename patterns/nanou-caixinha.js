// nanou-caixinha — Aphex Twin, o lado Drukqs de piano preparado. bpm 72.
//
// As peças de piano do Drukqs foram tocadas num Disklavier — piano mecânico —
// com objetos entre as cordas. A sensação de "duas mãos que não se encontram"
// não é interpretação: é a máquina disparando duas vozes com alguns milésimos
// de diferença.
//
// Aqui é isso, e é a peça inteira: a MESMA frase em duas camadas, a segunda
// atrasada 45 ms e 9 cents abaixo. Não é chorus e não é delay — é a mesma nota
// tocada duas vezes quase junto, som que nenhum efeito faz.
//
// A segunda coisa é a fita: `speed(sine.slow(23))` desafina o conjunto meio por
// cento pra cada lado, muito devagar. Piano não desafina, então o ouvido não
// tem onde encaixar isso — soa como gravação velha, não como efeito.
//
// ── ARRANJO ── cada casa = 8 ciclos (~27 s em 72 bpm)
//              1    2    3    4    5    6    7    8
//   frase      ●    ●    ●    ●    ●    ●    ●    ●   a peça é ela
//   gêmea      ·    ·    ●    ●    ●    ·    ●    ●   a segunda mão
//   baixo      ·    ●    ●    ●    ●    ●    ●    ·
//   sala       ●    ●    ●    ●    ●    ●    ●    ●
//   objeto     ·    ·    ·    ●    ·    ●    ●    ·   o que está entre as cordas
//
// A casa 6 tira a gêmea: por um trecho a frase fica sozinha e afinada, e é a
// única vez em que a peça soa "certa". Ela volta torta na 7.
stack(
  // A frase: nove notas em dó menor. Nove contra a grade de quatro — o começo
  // da frase anda pelo compasso e nunca cai duas vezes no mesmo tempo.
  note("<c4 eb4 g4 bb4 g4 eb4 f4 ab4 c5>").s("piano")
    .struct("x")
    .attack(0.01).release(2.2)
    .speed(sine.slow(23).range(0.995, 1.005))
    .gain(0.38).lpf(3800)
    .room(0.82).size(8).pan(0.42),

  // A gêmea: 45 ms depois, 9 cents abaixo, do outro lado. Mesma frase, e é isso
  // que faz o efeito — se a nota fosse outra viraria harmonia, não mão trocada.
  note("<c4 eb4 g4 bb4 g4 eb4 f4 ab4 c5>").s("piano")
    .struct("x")
    .off(0.045, x => x.gain(0.2).lpf(2800).pan(0.62))
    .detune(0.09)
    .speed(sine.slow(17).range(0.994, 1.006))
    .gain(0.001)
    .room(0.9).size(9)
    .mask("<0 0 1 1 1 0 1 1>/8"),

  // O baixo anda em 5 contra a frase em 9: 45 ciclos pra voltar ao início.
  note("<c2 ab1 f1 g1 eb1>").s("piano")
    .struct("x").slow(5)
    .attack(0.02).release(3.5)
    .gain(0.3).lpf(900)
    .room(0.7).size(7)
    .mask("<0 1 1 1 1 1 1 0>/8"),

  // A sala: chiado constante, quase inaudível. Sem isso as notas ficam soltas
  // no vazio digital e o piano deixa de soar gravado.
  s("dirt_wind").n(0)
    .struct("x").slow(13)
    .gain(0.06).hpf(800).lpf(6000).room(0.4),

  // O objeto entre as cordas: um tap de vidro a cada 7 compassos, na altura em
  // que uma corda abafada responderia.
  s("dirt_glasstap").n(2)
    .struct("x").slow(7)
    .speed(0.6)
    .gain(0.16).room(0.85).size(9).pan(0.3)
    .mask("<0 0 0 1 0 1 1 0>/8")
)
