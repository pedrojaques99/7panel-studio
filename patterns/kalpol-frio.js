// kalpol-frio — Autechre da era Incunabula, quando o dub techno ainda era
// ambiente. bpm 88.
//
// A ideia inteira: o DELAY é a batida. Existe UM acorde, disparado a cada três
// compassos, e o que preenche o resto do tempo são as repetições dele morrendo
// — feedback em 0,72, tempo de delay em 3/16. Nenhuma camada marca tempo. Tire
// o delay e a peça vira quatro acordes por minuto e silêncio.
//
// Isso é o Basic Channel lido pelo Autechre: o efeito não decora o som, o
// efeito É o arranjo. Por isso o `delaytime` não é redondo — 3/16 contra um
// disparo de 3 compassos faz as repetições caírem em lugares diferentes do
// compasso a cada volta, e daí vem um balanço que ninguém programou.
//
// ── ARRANJO ── cada casa = 8 ciclos (~22 s em 88 bpm)
//              1    2    3    4    5    6    7    8
//   acorde     ●    ●    ●    ●    ●    ●    ●    ●   e o delay dele
//   cama       ●    ●    ●    ●    ●    ●    ●    ●
//   sub        ●    ●    ●    ●    ●    ●    ●    ●   pulso, não linha
//   chiado     ·    ·    ●    ●    ●    ●    ●    ·
//   ferro      ·    ·    ·    ·    ●    ●    ●    ·   um acidente em 11
//
// Não há entrada nem saída de melodia porque não há melodia. O que a grade faz
// é mudar a DENSIDADE do fundo em volta de uma coisa só que nunca muda — que é
// exatamente o que um disco de dub techno faz por nove minutos.
stack(
  // O acorde. Ataque de 300 ms pra soar tocado e não disparado; tudo que se
  // ouve depois disso é repetição, não nota nova.
  note("<[eb3,gb3,bb3] [eb3,gb3,bb3] [db3,f3,ab3]>").s("sawtooth")
    .struct("x").slow(3)
    .attack(0.3).release(1.2).sustain(0.4)
    .gain(0.2).lpf(sine.slow(13).range(700, 2100)).lpq(4)
    .delay(0.62).delaytime(0.1875).delayfeedback(0.72)
    .room(0.8).size(8).pan(0.45),

  // A cama: pad de sino esticado em 12, meia velocidade, filtrado até virar cor.
  s("dirt_pad").n(2)
    .struct("x").slow(12)
    .speed(0.5)
    .gain(0.22).lpf(sine.slow(23).range(300, 900))
    .room(0.85).size(9).pan(0.55),

  // O sub é pulso, não linha: mesma nota, dois por compasso, sem ataque.
  note("eb1").s("sine").struct("x ~ x ~")   // struct na mesma linha: o portão lê
    // `s("sine")` como sinal se ele vier antes do struct (falso positivo)
    .attack(0.15).release(0.8).gain(0.3).lpf(150)
    .mask("<1 1 1 1 1 1 1 1>/8"),

  // Chiado de fita: o ruído que cola as repetições do delay umas nas outras.
  s("dirt_wind").n(1)
    .struct("x").slow(17)
    .gain(0.07).hpf(1500).room(0.5)
    .mask("<0 0 1 1 1 1 1 0>/8"),

  // O acidente: uma barra de metal a cada 11 compassos, com o mesmo delay do
  // acorde. É a única coisa imprevisível da peça, e é rara de propósito.
  s("dirt_metal").n(4)
    .struct("x").slow(11)
    .speed(0.4)
    .gain(0.14).lpf(2200)
    .delay(0.5).delaytime(0.1875).delayfeedback(0.6)
    .room(0.9).size(9).pan(0.68)
    .mask("<0 0 0 0 1 1 1 0>/8")
)
