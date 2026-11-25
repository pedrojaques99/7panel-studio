# /final nível pro — plano

Meta: todos os componentes da rota burilados até o padrão Logic/Ableton/Bitwig.
Regra da casa: reaproveitar o que já existe (fx-rack, EffectsRack, VintageKnob, /api/stretch,
@tonaljs), nada de componente novo do design system sem permissão, áudio nunca engasga.

## Fase 1 — Rack de FX da trilha (painel de baixo)  ✓
- [x] `Trilha.fx?: Partial<FxParams>` + `Trilha.eq?: {low, mid, high}` (dB) no modelo
- [x] motor: cadeia `createFxChain` por trilha SÓ quando a trilha tem fx (CPU) e `Tone.EQ3` quando tem eq;
      mesma `montar()` → ao vivo e export WAV saem iguais
- [x] `createFxChain(params, capture, saida?)`: saída opcional (antes ia sempre pro master capture)
- [x] drive 0 = distorção em wet 0 (a curva do Tone em k=0 atenua 9,5 dB)
- [x] painel: `EffectsRack` (o painel completo da SynthPanel, sem editar) + EQ low/mid/high em VintageKnob,
      aparece embaixo ao selecionar a trilha (áudio ou melodia), botão "reset fx"
- [x] Paulstretch do clipe de áudio (`EsticarClipe`): `/api/stretch` só do trecho usado, saída em backend/assets
      (já servida pelo `/api/mix/file`, sem rota nova) → troca o arquivo do clipe, nome `<orig> 2x`, ⌘Z volta

## Fase 2 — Piano roll (Tier 1)  ✓ (notas.ts + PianoRoll.test.tsx)
- [x] seleção múltipla: laço, ⇧clique, ⌘A, Esc; mover/esticar/apagar em grupo
- [x] ⌘C ⌘V (na agulha) ⌘D
- [x] teclado: ←→ passo da grade, ↑↓ grau da escala, ⇧↑↓ oitava, ⌥←→ duração
- [x] régua de compassos no topo (clique = seek)
- [x] faixa de velocity embaixo

## Fase 3 — Piano roll (Tier 2/3)  ✓
- [x] grade ocupa a largura toda
- [x] alça do fim do clipe dentro do roll
- [x] ⌘roda zoom ancorado no cursor, ⌥roda altura da linha, Z = enquadrar
- [x] hover: linha acesa + nota fantasma; nome na nota; tecla acende ao tocar
- [x] grade própria do roll (bar 1/4 1/8 1/8T 1/16 off) no cabeçalho; seguir agulha
- [x] Q / ⇧Q quantizar (100/50%), L legato, ↑↓ transpor; notas fantasma das outras trilhas
- [x] T / ⇧T acorde da escala (conta da própria escala, sem lib); step input (botão step + ⌘K/MIDI); aria nas notas

## Fase 4 — Arranjo, Biblioteca, transporte  ✓
- [x] relógio mostrava "-1:60.0" com o Transport em −0,001 s (e 59,97 s viraria "0:60.0") — arredonda antes, piso em 0
- [ ] popover de sessões não abriu com o clique do automador (por evento direto abre) — conferir com mouse real
- [ ] não reproduzido: uma vez o roll rolou na vertical sozinho durante o play
- [x] arranjo: ⇧ clique forma grupo de clipes; arrastar move o grupo; Delete, ⌘D, ⌘C/⌘V (na agulha, cada um na sua trilha) — `clipes.ts` + teste
- [x] régua: ⇧ arrastar marca o ciclo (C desliga e volta ao ciclo do clipe/peça)
- [x] biblioteca: ↓ da busca entra na lista, ↑↓ anda, espaço ouve (sem disparar o play), Enter usa
- [x] folha de atalhos (`?`) com tudo o que entrou
- [x] fechar com `visant-killer` e atualizar `AUDIT.md` (rodada 2: 88/100, portão aberto com audit:design pulado)

## Verificação por fase
`npx tsc --noEmit`, `npx vitest run src/final`, abrir /final, tocar, mexer, exportar e ouvir o WAV.

## Pendente (precisa de você ou de mouse real)
- [ ] DECISÃO: duas portas pro mesmo dado (corte/space no popover do cabeçalho × CUTOFF/REVERB do rack).
      Recomendação: popover vira atalho pro painel de baixo; "space" entra no rack como seção "send"
- [ ] PERMISSÃO: knobs do EffectsRack numa cor só (hoje 12 matizes; mexe em componente)
- [ ] conferir com mouse real: popover de sessões abre? ⇧ arrastar (laço no roll, ciclo na régua)
- [ ] não reproduzido: roll rolou na vertical sozinho uma vez durante o play
