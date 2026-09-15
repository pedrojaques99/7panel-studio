// realimenta — no-input mixing board: o take toca o próprio eco. bpm 88.
//
// Toshimaru Nakamura pluga a saída da mesa na entrada dela e mexe nos knobs: não
// há fonte, só realimentação. Aqui a fonte existe mas é quase nada — um ZAP a
// cada 8 compassos. Todo o resto é delayfeedback alto (0.82) devolvendo o som no
// delay outra vez, com filtro andando por cima do que já voltou.
//
// 0.82 é o limite honesto: em 0.9 acumula até clipar, e não existe limiter na
// frente do delay do painel. Pra mais eco, baixe o gain na mesma linha.
//
// estatico: as quatro fontes entram juntas porque elas já são raras — uma a cada
// 5, 8 e 13 compassos. Somar arranjo a um material que aparece a cada 40 segundos
// deixaria a peça vazia. Aqui a forma é o feedback: cada disparo demora mais pra
// morrer do que leva pro próximo chegar, então a densidade sobe sozinha.
stack(
  s("vhulto_sampling_the_world_drumkit_percs").n(50)        // ZAP
    .struct("x").slow(8)
    .delay(0.85).delaytime(sine.slow(31).range(0.12, 0.55)).delayfeedback(0.82)
    .lpf(sine.slow(17).range(400, 4000)).lpq(9)
    .gain(0.5).pan(sine.slow(23).range(0.2, 0.8)),

  // Segunda voz do mesmo material, com o delay em outra medida: os dois ecos
  // batem um no outro e produzem um ritmo que ninguém escreveu.
  s("vhulto_sampling_the_world_drumkit_percs").n(29)        // SHOCK
    .struct("x").slow(5)
    .delay(0.8).delaytime(0.1875).delayfeedback(0.78)
    .hpf(sine.slow(13).range(200, 2200))
    .gain(0.34).pan(0.7),

  // Metal raspado: o knob que o Nakamura mexeria. Raro e alto.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(25)      // METAL SCRAPE
    .struct("x").slow(13).speed("<1 0.7 1.4>")
    .delay(0.6).delaytime(0.33).delayfeedback(0.6)
    .gain(0.3).room(0.7),

  // O chão inaudível que faz o resto parecer grande. Dream Zone em speed 0.3, e
  // não o drone de uma hora: 3 MB contra 140 MiB pelo mesmo grave.
  s("zero_g_ce07_dream_zone").n(171)
    .begin(0.2).end(0.7).speed(0.3).slow(16).gain(0.26).lpf(300)
)
