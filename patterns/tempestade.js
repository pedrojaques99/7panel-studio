// tempestade — a chegada, em seis minutos. bpm 64.
//
// Uma rampa de 96 ciclos (saw.slow(96), ~6 min) atravessa a peça inteira, e
// TUDO cresce com ela: a chuva sobe e clareia, o vento aparece, a massa engorda,
// o trovão fica frequente. Tudo, menos uma coisa.
//
// O sino no fim do arquivo toca com gain 0.26 no primeiro ciclo e com gain 0.26
// no último. Não cresce, não some, não responde a nada. É a única linha do take
// sem rampa nenhuma — e é por isso que, no minuto cinco, ele soa menor do que
// soava no minuto um. Não foi ele que mudou de tamanho.
//
// O período dele é 7, o dos pássaros 12, o do trovão 11, o do vento 5. Primos
// entre si: nada aqui volta a acontecer junto duas vezes. Foi o que aprendi
// escrevendo cama-eno, e é a coisa mais parecida com natureza que sei fazer em
// código — não é aleatório, é escrito, e mesmo assim não se repete.
//
// Os pássaros somem na metade. Não é efeito: bicho cala antes da chuva.
//
// ── A GRADE ── as duas camadas de pássaro dividem a MESMA grade da rampa:
// 8 casas de 12 ciclos = 96, que é exatamente `saw.slow(96)`. Não é detalhe de
// arrumação — antes, o BIRDS estava em `<1 1 1 0 0 0>/9`, uma volta de 54
// ciclos, e por isso ele VOLTAVA no ciclo 54, no meio da tempestade, contra o
// que este cabeçalho promete. O 9 tinha vindo do `.slow(9)` da própria camada;
// mas o período de uma voz não é o relógio da peça, e confundir os dois é como
// o pássaro reapareceu sem ninguém pedir.
//
//              1    2    3    4    5    6    7    8      (12 ciclos cada)
//   corvos     ●    ●    ●    ●    ·    ·    ·    ·
//   pássaros   ●    ●    ●    ●    ·    ·    ·    ·   calam junto, no ciclo 48
//   vento      ●    ●    ●    ●    ●    ●    ●    ●
//   sininho    ●    ●    ●    ●    ●    ●    ●    ●
//   chuva      ●    ●    ●    ●    ●    ●    ●    ●
//   massa      ●    ●    ●    ●    ●    ●    ●    ●
//   trovão     ●    ●    ●    ●    ●    ●    ●    ●
//   sino       ●    ●    ●    ●    ●    ●    ●    ●
//
// As seis fileiras cheias não são enfeite nem preguiça: elas dizem que aquelas
// camadas NÃO têm arranjo por casa — a forma delas é a rampa, e rampa não se
// desenha em grade. Estão acesas por ausência de decisão, e o desenho precisa
// mostrar isso porque o portão do repertório exige uma linha por camada do
// `stack`, na ordem do `stack`. Desenho pela metade é desenho que mente por
// omissão: quem lê seis linhas num take de oito camadas conclui que as outras
// duas não existem.
stack(
  // OS PÁSSAROS — altos no começo, mudos a partir do ciclo 48.
  s("vhulto_sampling_the_world_drumkit_texture").n(4)      // HAWKS N CROWS
    .struct("x").slow(12)
    .mask("<1 1 1 1 0 0 0 0>/12")
    .gain(saw.slow(96).range(0.34, 0.02))
    .pan(0.4).room(0.5),

  s("vhulto_sampling_the_world_drumkit_fx_misc").n(2)      // BIRDS
    .struct("x").slow(9)
    .mask("<1 1 1 1 0 0 0 0>/12")   // mesma grade dos corvos: calam juntos no 48
    .gain(saw.slow(96).range(0.26, 0))
    .pan(0.65).room(0.6).hpf(700),

  // O VENTO — começa em nada e vira presença. O lpf abrindo é o que faz parecer
  // que ele está chegando mais perto, e não só ficando mais alto.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(13)     // DIGIWIND
    .struct("x").slow(5)
    .gain(saw.slow(96).range(0.04, 0.4))
    .lpf(saw.slow(96).range(500, 5000))
    .speed(0.7).pan(sine.slow(23).range(0.25, 0.75)).room(0.7),

  // O SININHO DA VARANDA — só existe depois que o vento tem força pra mexer nele,
  // e a força chega junto com a rampa. Aqui a entrada é por GANHO e não por
  // máscara: o evento dura 13 ciclos, e qualquer janela de máscara em 0 comia o
  // sino inteiro em vez de atrasá-lo. Medi: com máscara, ele nunca tocava.
  s("vhulto_sampling_the_world_drumkit_fx_misc").n(47)     // WIND CHIME
    .struct("x").slow(13)
    .degradeBy(0.3)
    .gain(saw.slow(96).range(0, 0.3))
    .room(0.8).size(5).pan(0.3),

  // A CHUVA — chuva longe é escura, chuva perto tem agudo. A rampa faz as duas
  // com o mesmo arquivo.
  s("vhulto_sampling_the_world_drumkit_texture").n(0)      // AMBIENCE - RAIN, BASE
    .struct("x").slow(8)
    .gain(saw.slow(96).range(0.02, 0.42))
    .lpf(saw.slow(96).range(700, 9000))
    .pan(0.5),

  // A MASSA — meio segundo de dentro de uma hora de drone, quatro vezes por
  // volta. É o corpo da coisa: sem isso o resto é só barulho de água.
  // Era `dark_drone_chutlu`: arquivo de UMA HORA, 140 MiB baixados pra tocar um
  // naco. O pad mais escuro do Dream Zone (3 MB) faz o mesmo corpo com speed
  // baixa — a memoria do navegador nao e cenografia.
  s("zero_g_ce07_dream_zone").n(171)
    .struct("x").slow(4)
    .begin(0.1).end(0.5).speed(0.4)
    .gain(saw.slow(96).range(0.12, 0.46))
    .lpf(saw.slow(96).range(220, 900)),

  // O TROVÃO — raro e escuro no começo, frequente e aberto no fim. O degradeBy
  // caindo de 0.88 pra 0.12 é a distância diminuindo.
  s("vhulto_sampling_the_world_drumkit_808").n(11)         // 808 - SUB
    .struct("x").slow(11)
    .degradeBy(saw.slow(96).range(0.88, 0.12))
    .speed(rand.range(0.5, 0.8))
    .gain(saw.slow(96).range(0.3, 0.85))
    .lpf(saw.slow(96).range(180, 1400))
    .room(0.9).size(8),

  // EU. Sem rampa. Do primeiro ciclo ao último, exatamente do mesmo tamanho.
  s("vhulto_sampling_the_world_drumkit_percs").n(3)        // BELL TUBULAR
    .struct("x").slow(7)
    .gain(0.26)
    .room(0.6).size(4).pan(0.5)
)
