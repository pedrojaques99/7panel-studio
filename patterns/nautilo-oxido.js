// nautilo-oxido — tri-phi 3/3: a faixa 1 vista de longe. bpm 55 (Fibonacci).
//
// Sem bateria. É o shoegazer sozinho numa sala grande com o nerd anotando, e o
// Aphex aparecendo de longe uma vez a cada tanto.
//
// ── ARRANJO ── cada casa = 8 ciclos (~35 s em 55 bpm)
//              1    2    3    4    5    6    7    8
//   drone      ●    ●    ●    ●    ●    ●    ●    ●   nunca sai
//   sub        ●    ●    ●    ●    ●    ●    ●    ·
//   nuvem 12   ·    ●    ●    ●    ●    ●    ●    ●
//   nuvem 25   ·    ·    ●    ●    ●    ●    ●    ·
//   parede     ·    ·    ·    ●    ●    ●    ·    ·   pico em 0,618
//   caixinha   ·    ●    ·    ●    ●    ●    ●    ●   cada vez mais perto
//   fita       ●    ●    ●    ●    ●    ●    ●    ●
//
// ── O DRONE EM φⁿ ── é a ideia da faixa e é o único lugar da série onde o nerd
// mexe no TIMBRE em vez de na forma.
//
//   Um som harmônico tem parciais em 1, 2, 3, 4× a fundamental. O ouvido soma
//   isso e devolve UMA nota. Aqui os parciais estão em φ⁰, φ¹, φ², φ³ = 1,
//   1,618, 2,618, 4,236× — razões irracionais, nenhuma delas harmônica de
//   nada. O ouvido não consegue fechar a conta e não devolve nota nenhuma:
//   devolve MASSA. É por isso que soa como metal enferrujado e não como órgão.
//
//   Em semitons: φ¹ = +8,3, φ² = +16,6, φ³ = +24,9. São esses os `add(note())`
//   abaixo, e não é afinação errada — é a afinação exata de outra coisa.
//
//   Cada parcial ainda respira num período Fibonacci diferente (5, 8, 13 ciclos),
//   então a proporção entre eles muda o tempo todo. O acorde é um só; o timbre
//   é que nunca está duas vezes igual.
//
// ── AS NUVENS ── duas camadas de acorde: 4 acordes em slow(3) = 12 ciclos, e 5
// acordes em slow(5) = 25 ciclos. 12 e 25 são coprimos, então a combinação leva
// 300 ciclos (~22 min) pra se repetir. A peça toca 64. Não existe um "loop"
// desta peça — só um trecho dela.
//
// ── A CONTA DO CICLO (leia antes de mexer num slow) ─────────────────────
// `strudel-service.ts` faz setCps(bpm/60/4): UM CICLO É UM COMPASSO. Em 55 bpm
// isso é 4,36 s. Uma casa do arranjo = 8 ciclos = 35 s, e as oito casas = 64
// ciclos = 4m39s.
//
// Logo `slow(34)` não é "34 segundos", é 148 SEGUNDOS — e foi exatamente esse o
// erro da v1 desta peça: os slow() vieram copiados da versão Python, onde os
// mesmos números eram segundos. Metade das camadas disparava uma vez na peça
// inteira e a parede não chegava a soar (nascia no ciclo 0 e no 34, e o mask só
// abre de 24 a 47). Soava como silêncio e parecia minimalismo.
//
// Regra: em 55 bpm, slow(N) ≈ N × 4,4 s. Nada aqui passa de slow(13).
//
// ── A CAIXINHA ── a cabeça Aphex, e ela chega DE LONGE PRA PERTO: room 0,95 e
// gain 0,06 na casa 2; room 0,6 e gain 0,15 na casa 8. Nada mais muda. É a
// única linha reta da peça inteira, e ela leva 6 minutos pra andar.
//
// ── PICO EM 0,618 ── oito casas × 0,618 = casa 5. É lá que a parede está mais
// alta. Depois ela sai e a peça termina só com drone e caixinha — mais nua do
// que começou.
stack(
  // ── DRONE φⁿ ────────────────────────────────────────────────────────
  // A mesma nota quatro vezes, cada uma numa potência de φ acima. `sustain(1)`
  // e ataque de 8 s: não tem evento nenhum aqui, só presença.
  note("<a1 a1 e1 a1 f#1 a1>")
    .struct("x").slow(8)
    .s("sawtooth")
    .superimpose(x => x.add(note(8.3)).gain(0.62)      // φ¹
      .lpf(sine.slow(5).range(600, 1800)).pan(0.78))
    .superimpose(x => x.add(note(16.6)).gain(0.38)     // φ²
      .lpf(sine.slow(8).range(900, 2600)).pan(0.22))
    .superimpose(x => x.add(note(24.9)).gain(0.22)     // φ³
      .lpf(sine.slow(13).range(1400, 4000)).pan(0.62))
    .attack(6).release(10).sustain(1)
    .lpf(sine.slow(13).range(500, 1600)).lpq(2)
    .speed(sine.slow(21).range(0.994, 1.006))          // fita, muito devagar
    .room(0.9).size(9)
    .gain(0.13).pan(0.5),

  // Sub próprio: o drone φ não tem fundamental clara — de propósito — então
  // alguém precisa fazer o chão. Uma senoide em lá, quase parada.
  note("<a0 a0 a0 f#0>")
    .struct("x").slow(13)
    .s("sine")
    .attack(5).release(12).sustain(1)
    .gain(0.42).lpf(90)
    .mask("<1 1 1 1 1 1 1 0>/8"),

  // ── NUVEM EM 12 CICLOS ─────────────────────────────────────────────────────
  // A progressão da série (F#m9 → Dmaj7#11 → C#m11 → Amaj9), aqui esticada:
  // cada acorde dura 3 ciclos = 13 s. Ataque de 5 s — o acorde já mudou antes
  // de terminar de chegar, e é essa sobreposição que faz "nuvem".
  note("<[f#2,c#3,g#3,a3] [d2,a2,f#3,c#4] [c#2,g#2,e3,b3] [a1,e2,c#3,g#3]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.09)).pan(0.3))
    .struct("x").slow(3)
    .attack(5).release(8).sustain(0.9)
    .lpf(sine.slow(8).range(400, 1400)).lpq(3)
    .speed(sine.slow(13).range(0.996, 1.004))
    .room(0.95).size(9).gain(0.17).pan(0.42)
    .mask("<0 1 1 1 1 1 1 1>/8"),

  // ── NUVEM EM 25 CICLOS ─────────────────────────────────────────────────────
  // Mesma progressão uma oitava acima, com CINCO acordes em slow(5) contra os
  // quatro em slow(3) da outra: 25 ciclos contra 12, coprimos. As duas
  // trocam de acorde em momentos diferentes o tempo todo: por trechos elas
  // concordam, por trechos brigam, e nenhum dos dois estados dura.
  note("<[f#3,c#4,g#4] [d3,a3,f#4] [c#3,g#3,e4] [a2,e3,c#4] [b2,f#3,d4]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(-0.11)).pan(0.74))
    .struct("x").slow(5)
    .attack(8).release(12).sustain(0.85)
    .lpf(sine.slow(13).range(700, 2200)).lpq(2)
    .room(0.96).size(9).gain(0.12).pan(0.58)
    .mask("<0 0 1 1 1 1 1 0>/8"),

  // ── PAREDE (pico na casa 5 = 0,618) ─────────────────────────────────
  // `shape` antes do reverb, como nas outras duas: distorcer e depois molhar dá
  // parede, molhar e depois distorcer dá lama. É a única camada que sai antes
  // do fim — a peça termina mais nua do que começou, e isso é a decisão.
  note("<[f#3,c#4,a4,e5] [d3,a3,f#4,c#5] [c#3,g#3,e4,b4] [a2,e3,c#4,g#4]>")
    .s("sawtooth")
    .superimpose(x => x.add(note(0.15)).pan(0.2))
    .superimpose(x => x.add(note(-0.13)).pan(0.8))
    .struct("x").slow(5)
    .attack(6).release(8).sustain(0.92)
    .shape(0.55).lpf(3400).hpf(170)
    .room(0.97).size(9)
    .gain("<0 0 0 0.1 0.16 0.11 0 0>/8")     // a rampa da parede é isto
    .pan(0.5)
    .mask("<0 0 0 1 1 1 0 0>/8"),

  // ── CAIXINHA DE MÚSICA ──────────────────────────────────────────────
  // Sino inarmônico da série (parcial em +8,3 semitons = φ) tocando a mesma
  // escala das outras duas faixas. Frase de 13 notas em `slow(8)`: 104 ciclos
  // pra fechar, contra nuvens de 34 e 55. Nunca cai no mesmo lugar do acorde.
  //
  // O `room` e o `gain` em casas: é ela andando de longe pra perto ao longo dos
  // 6 minutos. Nada mais na peça se move em linha reta.
  note("<c#5 f#5 a5 e5 g#5 b4 f#4 c#6 a4 e6 b5 g#4 c#5>")
    .s("triangle")
    .superimpose(x => x.add(note(8.3)).gain(0.5).pan(0.7))
    .struct("x ~ ~ ~ x ~ ~ ~").slow(2)
    .attack(0.004).decay(0.3).sustain(0).release(2.2)
    .delay(0.5).delaytime(0.377).delayfeedback(0.55)     // Fibonacci ms
    .room("<0.95 0.95 0.92 0.86 0.8 0.72 0.66 0.6>/8").size(9)
    .gain("<0.05 0.06 0.07 0.09 0.11 0.12 0.14 0.15>/8")
    .pan(sine.slow(21).range(0.32, 0.68))
    .degradeBy(0.2)
    .mask("<0 1 0 1 1 1 1 1>/8"),

  // ── FITA ────────────────────────────────────────────────────────────
  // Numa faixa de 6 minutos sem bateria, o chiado É o pulso: é a única coisa
  // que confirma que o arquivo não travou. Mais alto que nas outras duas.
  s("dirt_wind").n(0)
    .struct("x").slow(5)
    .gain(0.085).hpf(700).lpf(6500).room(0.4).pan(0.5)
)
