// concreta-nextel — musique concrète do Brasil de 2003. bpm 83.
//
// Nada aqui é instrumento: é NEXTEL, TELE, RADIO, PHONE, SIREN e um SONAR do kit
// VHULTO. A ideia é a de Pierre Schaeffer — objeto sonoro gravado vale como
// nota — só que o material é barulho de celular tijolo e rádio de pilha.
//
// A harmonia é a diferença de período: cada objeto entra num euclidiano
// diferente (3,8 / 5,16 / 2,9), então o encontro de dois deles é evento raro.
// `.speed()` faz o mesmo objeto soar como outro personagem.
//
// ── A BATIDA ── drum'n'bass em `.fast(2)`, à maneira do Richard
//
// O arquivo roda a 83 bpm e a batida em `.fast(2)`, ou seja, a 166 — dois
// relógios no mesmo arquivo. É o truque de "Ventolin"/"Girl/Boy": o break corre
// enquanto os objetos gravados seguem no ritual lento deles.
//
// O 83 não é gosto, é conta. O break e a peça estão presos numa razão de 2:1
// (o break ocupa MEIO ciclo), então a velocidade do jungle é uma consequência
// do bpm do arquivo, não um número separado. A primeira versão ficou em 92, o
// que jogava o jungle pra 184 — o extremo rápido do gênero, contra uma concreta
// que anda devagar, e soava dois discos tocando juntos. A 83 o break sai a 166,
// que é o andamento em que ele FOI GRAVADO (`breaks165`): o `loopAt` estica
// 1,6%, quase nada. Onde a matemática fecha, o ouvido para de reclamar.
//
// O que faz soar Aphex e não drum'n'bass genérico são três coisas, nesta ordem:
//   1. a caixa é RATCHETADA (`ply("<2 3>")` em 14% dos golpes) — a mesma peça
//      batida 2 ou 3 vezes dentro do próprio tempo, como sequencer travando;
//   2. a caixa é AFINADA no ato (`speed(rand)` em 10%) — o sample sobe e desce
//      de tom sozinho, que é o som de quem editou o break na unha;
//   3. o chimbal PERDE golpe (`degradeBy(0.25)`), então a grade nunca fecha.
// Nada disso muda a COLOCAÇÃO do bumbo e da caixa: o esqueleto 1-e-11 / 5-e-13
// fica de pé o tempo todo. Break que perde o esqueleto vira barulho.
//
// ── ARRANJO ── cada casa = 8 ciclos (~23 s em 83 bpm)
//              1    2    3    4    5    6    7    8
//   drone      ●    ●    ●    ●    ●    ●    ●    ●
//   nextel     ·    ●    ●    ●    ●    ●    ·    ·
//   tele       ·    ·    ●    ●    ●    ·    ●    ·
//   rádio      ●    ●    ·    ●    ●    ●    ·    ·
//   telefone   ·    ·    ·    ·    ●    ●    ●    ·
//   sonar      ●    ●    ●    ·    ●    ●    ●    ●   o pulso da peça
//   sirene     ·    ●    ·    ·    ·    ●    ●    ●   chega por último
//   ─────────────────────────────────────────────────
//   break      ·    ·    ●    ●    ·    ●    ●    ●   breaks165, a fundação
//   bumbo      ·    ·    ●    ●    ·    ●    ●    ●   reforço, mesma grade
//   sub        ·    ·    ·    ●    ·    ●    ●    ●   anda com o BUMBO
//   amen       ·    ·    ·    ·    ·    ●    ●    ●   corte no 4º ciclo
//
// A casa 5 é o furo: a batida inteira SAI e sobram só os objetos gravados, no
// exato momento em que a peça está mais cheia de concreta (nextel, tele, rádio,
// telefone, todos ligados). Aí ela volta na 6. Um break que nunca some não tem
// como voltar, e voltar é a única coisa que um break faz de emocionante.
//
// Concreta é montagem: os objetos precisam ENTRAR um a um pra que o ouvido
// aprenda cada um deles antes de precisar separá-los. Com os sete de uma vez,
// vira barulho de rua — que é o oposto de escutar barulho de rua de propósito.
stack(
  // Cama. Era uma hora de drone Cthulhu (140 MiB pra tocar um naco): agora e o
  // pad escuro do Dream Zone com speed baixa, mesmo efeito por 3 MB.
  //
  // Primeira do stack porque e o chao sobre o qual o resto entra, e porque a
  // linha `drone` do desenho e esta. `stack` e simultaneo: mover argumento
  // nao muda uma nota.
  s("zero_g_ce07_dream_zone").n(193)
    .begin(0.1).end(0.6).speed(0.4).slow(8).gain(0.3).lpf(700),

  s("vhulto_sampling_the_world_drumkit_percs").n(25)        // NEXTEL 2
    .euclid(3, 8).speed("<1 1 0.8 1.25>").gain(0.5).room(0.3)
    .mask("<0 1 1 1 1 1 0 0>/8"),

  s("vhulto_sampling_the_world_drumkit_percs").n(33)        // TELE
    .euclid(5, 16).speed("<1 1.5>").gain(0.4).pan(0.7).delay(0.25)
    .mask("<0 0 1 1 1 0 1 0>/8"),

  s("vhulto_sampling_the_world_drumkit_fx_misc").n(29)      // RADIO
    .euclid(2, 9).speed(0.9).gain(0.32).lpf(3000).pan(0.3)
    .mask("<1 1 0 1 1 1 0 0>/8")/*fx*/.lpf(400).room(0.4),

  s("vhulto_sampling_the_world_drumkit_fx_misc").n(28)      // PHONE
    .struct("<x ~ ~ ~ ~ ~ x ~>").gain(0.28).room(0.6).size(4)
    .mask("<0 0 0 0 1 1 1 0>/8"),

  // O sonar é o metrônomo da peça, mas em 7 — nunca cai onde o resto cai.
  s("vhulto_sampling_the_world_drumkit_percs").n(32)        // SONAR 2
    .struct("x").slow(7).gain(0.4).room(0.8).size(6)
    .mask("<1 1 1 0 1 1 1 1>/8"),

  // A sirene uma vez a cada 11 compassos, com speed baixa e lpf: é o que sobra
  // dela quando está longe.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(39)      // SIREN
    .struct("x").slow(11).speed(0.6).lpf(1200).gain(0.22).room(0.9)
    .mask("<0 1 0 0 0 1 1 1>/8"),

  /* ── a batida ─────────────────────────────────────────────────────── */
  //
  // Segunda tentativa. A primeira era grade programada — bumbo, caixa,
  // fantasma e chimbal escritos passo a passo — e soava a máquina de ritmo,
  // não a drum'n'bass. Três erros concretos, todos meus:
  //   · o sub estava numa grade de 8 passos e o resto em 16, então o segundo
  //     hit dele caía junto da CAIXA. Em dnb o sub anda com o BUMBO;
  //   · o rufo não tinha `.fast(2)`: ficou no relógio da peça enquanto o resto
  //     corria no dobro. Isso não é gosto, é dessincronia;
  //   · não havia break. Drum'n'bass é break gravado, esticado e picado —
  //     programar os golpes um a um dá o esqueleto e perde o balanço, que é
  //     justamente o que a gente ouve.
  //
  // Agora a fundação é `dirt/breaks165` (Dirt-Samples, o banco do TidalCycles):
  // 1,423 s de break com ataques medidos nos 16 avos
  // `0 2 3 4 6 7 8 9 10 11 12 14 15`. `loopAt(0.5)` encaixa ele em MEIO ciclo,
  // então cabem dois compassos de break por ciclo da peça — a concreta segue a
  // 83 e o break corre a 166, travado pela matemática do loopAt em vez do meu
  // `.fast(2)` no olho.
  //
  // Quatro camadas em vez de seis: o break já traz chimbal, fantasma e rufo
  // dentro. O que sobra é reforço de grave e o corte de amen.

  // O break. É a peça inteira; tudo abaixo só sublinha.
  s("dirt_breaks165").struct("x")
    .loopAt(0.5)
    .gain(0.8).shape(0.12).room(0.12)
    .mask("<0 0 1 1 0 1 1 1>/8"),

  // Bumbo de reforço: KICK - KOF nos passos 0 e 10 de 16, que é onde o break já
  // bate. Não é outra batida — é peso embaixo da que existe.
  s("vhulto_sampling_the_world_drumkit_kick").n(3)
    .struct("x ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~")
    .fast(2)
    .gain(0.75).lpf(160).shape(0.3)
    .mask("<0 0 1 1 0 1 1 1>/8"),

  // Sub: jungle sine (dirt/jungbass n7, rms 0,68). MESMA grade do bumbo — é o
  // conserto do erro anterior. A afinação muda por frase, não por golpe.
  s("dirt_jungbass").n(7)
    .struct("x ~ ~ ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~")
    .fast(1)
    .speed("<0.5 0.5 0.6 0.4>")
    .gain(0.55).lpf(320)
    .mask("<0 0 0 1 0 1 1 1>/8"),

  // O corte de amen: 16 fatias do `amencutup`, e só no 4º ciclo da frase. Nos
  // outros três o `~` cala a camada inteira. A ordem das fatias não é a do
  // disco — 0 2 4 6 8 10 12 14 pula de duas em duas e depois volta pelas
  // ímpares, que é o corte que o Richard faz: o break reconhecível tocado na
  // ordem errada. Fatia fora de ordem soa como edição; fatia sorteada soa como
  // defeito, e é por isso que aqui não tem `rand`.
  // `~!7` e não `~ ~ ~`: com `.fast(2)` a alternância também acelera, então
  // três descansos dariam uma virada a cada DOIS ciclos. Sete dão a cada quatro.
  n("<~!7 [0 2 4 6 8 10 12 14 1 3 5 7 9 11 13 15]>")
    .s("dirt_amencutup")
    .fast(2)
    .gain(0.5).shape(0.1)
    .mask("<0 0 0 0 0 1 1 1>/8")
)
