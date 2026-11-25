# Auditoria — src/final

## Superfícies

Uma linha por tela. **Preencha antes de consertar qualquer coisa.** Classificar
depois de mexer é justificar o que já foi feito.

- **A aquisição** — quem não é cliente ainda. Persuadir, provar, converter.
- **B trabalho** — quem usa todo dia. Velocidade, densidade, teclado.
- **C confiança** — dinheiro, permissão, ação destrutiva. Não pode mentir.

Aplicar instinto de A numa tela B é o erro mais caro do frontend Visant.

| Arquivo | Superfície (A/B/C) | Variável de negócio que move | Notas |
|---|---|---|---|
| src/final/Arranjo.tsx | B | tempo do clique à ideia arranjada: mover/cortar/fade sem modal, M/S e volume por trilha | janela principal; densidade e teclado acima de explicação |
| src/final/Biblioteca.tsx | B | achar e trazer o material da era5/era6 em 1 gesto (arrastar ou duplo clique) | prévia antes de usar |
| src/final/Final.tsx | B | do material à faixa exportada: transporte, sessão salva sozinha, export WAV versionado | export grava em disco (C leve: não pode sobrescrever) — versão v<k> nova sempre |
| src/final/Onda.tsx | B | ler onde está o som no clipe pra cortar no lugar certo | canvas |
| src/final/PianoRoll.tsx | B | escrever melodia sem nota errada (linhas presas na escala) | teclado do PC/MIDI como atalho |
| src/final/TrackFx.tsx | B | colorir a trilha (drive, eq, reverb...) sem sair da tela e ouvir no export igual | rack da SynthPanel reaproveitado |
| src/final/EsticarClipe.tsx | B | transformar um trecho em textura (paulstretch) sem passar pela Fábrica | render no backend, ⌘Z volta |

## Tela vista

Uma linha por tela ABERTA, com o que foi visto. Sem isto o portão não abre —
um AnimatePresence travado passa por tsc, ESLint, motion-lint, impeccable,
audit:design e copy-lint sem acender nada.

Cada linha carrega: rota, largura, estado do dado, e o que aconteceu.
Antes de medir qualquer coisa, confira que a página hidratou (veja
`visant-killer/references/ambiente.md`) — metade dos achados de uma sessão
foram o dev server mentindo, não a tela.

- /final · 1568×772 · sessão "primeira" com 2 trilhas (claraboia 3:53 + first.mid 10 notas) · hidratou (texto FINAL e 59 itens no DOM); tocou, moveu clipe, ⌘Z, export salvo em final/primeira-v1-3m 57s.wav (pico −5,1 dBFS). Visto: onda saía preta (canvas sem color-mix, consertado), nomes wav/mp3 duplicados (consertado).
- /final · 1568×726 · sessão de teste (corredor-sem-fim + 3 pontos de automação) e a sessão real "primeira" (9 trilhas) · hidratou; tocou, ●/espaço, painel era6 (3/5 ao vivo), folha de atalhos, automação desenhada e exportada (WAV segue a curva com erro de até 0,5 dB). corta-scan: 18 achados → 4, todos camadas intencionais (ver Achados).
- /final · 1568×772 (DPR alto, 2398 px CSS) · sessão real "sessao 2" (9 trilhas) só pra olhar, e sessão de teste "sessao 3" pra tudo que edita · hidratou (59+ itens, clipes e onda); rack da trilha (drive medido no render offline: forma de onda muda, reverb deixa cauda 10x), Paulstretch 2x (3:53 → 7:45.8, depois restaurado), roll com régua, velocity, laço, Z, hover e notas fantasma, play com teclas acesas, step input (3 notas), grupo de clipes ⌘D/⌘C/⌘V/Delete, ⇧ arrastar na régua marcando ciclo, biblioteca pelo teclado. corta-scan: 5 achados, todos os já mantidos (alças de borda, miolo do knob); zero texto cortado.

## Achados


**Nota: 84/100.** Portão: 3 de 4 verdes; o `audit:design` foi PULADO (o keyboard-ui não tem
scanner de token). Julgamento T2 feito com `visant-frontend` + `visant-motion` carregados.
`revenue-centric-design` ficou de fora: a rota não vende nada.

| # | Achado | Onde | Conserto |
|---|---|---|---|
| 1 | 6 dicas de uso espalhadas em tooltip, parágrafo e estado vazio (`ensina-a-usar`) | Arranjo, Biblioteca, PianoRoll, Final | tudo numa folha de atalhos (`?`), aberta só quando pedida; exceção escrita no `ATALHOS` |
| 2 | separador "·" e travessão em texto de tela (7) | Final, Arranjo | spans com espaçamento |
| 3 | glifo ⇧ lido como seta | Final | "shift ⌘Z" |
| 4 | extensão (.wav/.mp3) comida pela reticência do nome (13 itens, corta-scan) | Biblioteca | nome encolhe, extensão `flex: none` |
| 5 | curva de fade 8 px fora do clipe (altura da trilha no clipe) | Arranjo | `ALTO_CLIPE` |
| 6 | editor de clipe de áudio com 300 px pra 3 faders (orçamento de cromo) | Final | linha `auto` |
| 7 | abrir sessão regravava o arquivo (autosave sem mudança) | Final | compara com o último JSON salvo |
| 8 | solo esquecido numa trilha vazia cala a música sem sinal nenhum (visto na sessão real) | Arranjo | trilha calada aparece apagada |
| 9 | automação em rampa linear de ganho: até 18 dB acima da linha desenhada no meio | motor | rampa exponencial no ganho = reta em dB (medido no WAV) |
| 10 | transição de 120 ms escrita à mão | Final (CSS) | `var(--dur-press) var(--ease-out)` |

Mantidos de propósito (corta-scan): camada de automação por cima da pista, alças de borda
sobre o clipe, svg do fade e o miolo do `VintageKnob` (design system, não mexido).

Não verificado: 390 px (DAW de mesa, sem uso em celular previsto), tema claro (a rota é
escura), backend parado (a biblioteca mostra o erro; o autosave mostra "not saved").


## Rodada 2 — 2026-10-09 (fases 1 a 4 do PLAN-final-pro.md)

**Nota: 88/100.** Portão: 3 de 4 verdes, `audit:design` PULADO (o keyboard-ui segue sem scanner de
token). Julgamento T2 com `visant-frontend` + `visant-motion` carregados; `revenue-centric-design` fora
(a rota não vende). motion-lint limpo. 52 testes (notas, clipes, PianoRoll, modelo).

| # | Achado | Onde | Conserto |
|---|---|---|---|
| 1 | seta em caractere na folha de atalhos (`← →`, `↑ ↓`) | Final | nome da tecla por extenso, como o "shift" da rodada 1 |
| 2 | ponto e vírgula em texto de tela | Final (atalhos) | dois pontos |
| 3 | bolinha no cabeçalho de grupo da biblioteca ("era5 · melodia", vem do backend) | Biblioteca | separa em spans com espaço na tela |
| 4 | relógio mostrava "-1:60.0" com o Transport em −0,001 s; 59,97 s viraria "0:60.0"; BAR "0.0" | modelo `relogio`/`compassoBatida` | arredonda antes de separar o minuto, piso em 0 (com teste) |
| 5 | falso positivo do portão: nome de `it()` em `*.test.tsx` lido como copy (10 achados) | killer-scan | regra: pula `.test.`/`.spec.` como já pulava `__tests__` (motivo escrito no script) |

Advogado do diabo (respondido por mim, com evidência):

- **Duas portas pro mesmo dado: DECISÃO SUA.** A trilha agora tem dois lowpass (o `corte` no
  popover de efeitos do cabeçalho, `Arranjo.tsx` ~380, e o CUTOFF do rack) e dois reverbs (o
  "space", envio pra sala da casa, e o REVERB/DECAY do rack, inserido). São coisas diferentes no
  áudio, mas na tela a pessoa escolhe por sorte. Recomendo: o popover do cabeçalho vira só um
  atalho que abre o painel de baixo, e "space" entra no rack como a seção "send" (mantém a sala da
  casa, que é o som da era6).
- **Altura do painel:** o rack força 330 px quando há trilha selecionada; num clipe de áudio o lado
  esquerdo tem só 3 faders e o stretch. Aceito porque foi o pedido; se incomodar, o rack pode recolher.
- **Seguir a agulha no roll** pula de página (como Logic), sem animação: certo pra frequência alta.

Proposta de gosto (não aplicada, regra zero; mexe em componente que precisa de permissão):

| Proposta | Por quê |
|---|---|
| knobs do `EffectsRack` com uma cor só (accent) em vez de 12 matizes | o resto da rota é monocromático vintage; arco-íris de knob é o "card arco-íris" do catálogo |

Não verificado: 390 px e tema claro (mesmo motivo da rodada 1); backend parado com o rack (não
depende de backend) e com o stretch (o erro cai na linha de status do bloco, lido no código,
não visto); ⇧ arrastar com mouse real (o automador perde o shift no arrasto: coberto por teste de
componente e por evento direto). Uma vez o roll rolou na vertical sozinho durante o play; em duas
remedidas com registro de scroll não reproduziu. Popover de sessões não abriu pelo clique do
automador (abre por evento direto); conferir com mouse real.
