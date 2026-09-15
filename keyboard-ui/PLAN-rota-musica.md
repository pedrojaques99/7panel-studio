# PLAN: rota `/musica` — repertório, editor e histórico

> Onde a música mora. Hoje ela mora num `localStorage` de painel flutuante e num
> `patterns/` que só o CLI enxerga. A rota junta as duas pontas.

## Passo 0 — Classificação de superfície (antes de desenhar, não depois)

Exigência da skill `visant-frontend`: classificar depois de mexer é justificar o
que já foi feito. Uma linha por REGIÃO, porque a tela mistura classes.

| Região | Classe | Variável de negócio que move | Persuasão é |
|---|---|---|---|
| Repertório (coluna esquerda) | **B** | segundos até achar o take certo entre 40 músicas | ruído |
| Editor + transporte (centro) | **B** | iterações ouvidas por hora — o loop escrever→ouvir→corrigir | ruído |
| Faixa de proposta do Claude | **B** | propostas julgadas em vez de ignoradas | ruído |
| Histórico de versões (direita) | **B** | takes não perdidos por medo de editar | ruído |
| **Restaurar versão** (sobrescreve o que está na tela) | **C** | trabalho de sessão não perdido | irrelevante |
| **Excluir música** | **C** | acervo não perdido | irrelevante |

As duas linhas C são o motivo desta tabela existir. Restaurar e excluir são as
únicas ações irreversíveis da tela, e tratá-las como B — botão igual aos outros,
sem confirmação, sem volta — é exatamente o erro que a auditoria da `/fabrica`
pegou em `Medir.tsx`. Aqui: **excluir move pra `patterns/.trash/`**, não apaga; e
**restaurar salva uma versão nova** em vez de sobrescrever, então a linha do tempo
nunca perde um elo.

## O que a rota NÃO é

Knobs, LPF/HPF/delay/reverb, XY pad, cenas, export WAV e o chat do Gemini
**continuam no painel AnalogBrain**, no canvas. Decisão do dono do trabalho.
A rota é escrever, ouvir, guardar e voltar. Cada controle que não serve a isso
custa altura de editor.

## Onde a música mora

```
patterns/take-01.js                  <- a música. Texto. Aberta em qualquer editor, versionada em git.
patterns/.versions/take-01.jsonl     <- histórico append-only: uma linha por versão
patterns/.trash/take-01.js           <- excluída, não apagada
```

Uma linha do `.jsonl`:
```json
{"ts":1788450222.1,"author":"user","message":"tirei o low do pad","bpm":122,"code":"stack(...)"}
```

Append-only de propósito: escrita nova nunca corrompe versão velha, e um `tail`
resolve o debug. Sem banco, sem migração. O `.js` é sempre igual à última linha.

## Backend — `/api/songs/*`

| Rota | O que faz |
|---|---|
| `GET /api/songs` | lista: nome, bpm, versões, quando mexeu, autor da última |
| `GET /api/songs/<nome>` | código atual + metadados + lista de versões (sem o código de cada uma) |
| `POST /api/songs/<nome>` | salva versão: append no `.jsonl` + reescreve o `.js` |
| `GET /api/songs/<nome>/v/<i>` | código de UMA versão (só quando pedido — a lista não carrega tudo) |
| `POST /api/songs/<nome>/restore/<i>` | restaura salvando versão NOVA (`restaurado de v3`) |
| `DELETE /api/songs/<nome>` | move pra `.trash/` |
| `POST /api/songs/<nome>/rename` | renomeia `.js` + `.jsonl` juntos |

Nome continua recusado, não sanitizado (o bug que o teste do `save` pegou).
`/api/jam/*` continua existindo: é o canal da proposta ao vivo, não o do acervo.
`jam save` passa a delegar pro `POST /api/songs`, pra não haver duas verdades.

## CLI — o que eu ganho

```
python backend/jam.py new "cama-eno" -m "drone lento pra abrir a live"   # cria música
python backend/jam.py songs                                              # lista o acervo
python backend/jam.py open take-01                                       # imprime o código
python backend/jam.py versions take-01                                   # linha do tempo
python backend/jam.py comment take-01 -m "o pad tá lamacento no v4"      # comenta sem mexer no som
```

## A tela

Orçamento de chrome: **uma linha de cabeçalho, ~40px**, e o editor começa. Sem
faixa de título, sem grade de métricas, sem breadcrumb — o nome da música já está
no cabeçalho e na aba.

```
┌ take-01 ····························· ● não salvo ······· [ SALVAR ] ┐  40px
├──────────────┬───────────────────────────────────────┬───────────────┤
│ REPERTÓRIO   │                                       │ VERSÕES       │
│ [busca]      │   editor CodeMirror                   │ v7 14:32 você │
│ · take-01  ▸ │   (a área que cresce)                 │   "tirei low" │
│ · cama-eno   │                                       │ v6 14:20 claude
│ · loop-3     │                                       │ v5 13:58 você │
│              ├───────────────────────────────────────┤               │
│              │ ▶  ⟳  122 bpm   JAM ●     erro: ...   │  [restaurar]  │
│              ├───────────────────────────────────────┤               │
│              │ ● claude rev 9  "acid bass"  OUVIR ACEITAR ✕          │
└──────────────┴───────────────────────────────────────┴───────────────┘
```

Regras que valem aqui, todas com a variável que movem:

- **Um primário por superfície.** É `SALVAR`, e ele só existe quando há mudança
  não salva. Sem mudança, some — botão morto é mentira (espinha 2).
- **Zero não renderiza.** Música sem versão não mostra "0 versões". Coluna de
  versões só existe com música aberta.
- **Agrupar por espaço, não por caixa.** Nada de card dentro de card: as três
  colunas são separadas por uma régua de 1px do `t12`, como na `/fabrica`.
- **Hover nunca mexe no layout.** As ações da linha do repertório (⋯) ocupam
  espaço reservado; aparecem no hover E no `focus-visible`.
- **Excluir mora atrás do `⋯`.** Nunca a um clique de distância de "abrir".
- **A cor é a da casa:** `src/fabrica/ui.ts` — um tom só, estado dito por peso e
  palavra, não por hue. Zero componente novo de design system.

## Teclado (a ordem de guarda da skill, que conserta os 4 bugs clássicos)

```
1. combo com modificador  → Ctrl+Enter tocar · Ctrl+S salvar · Ctrl+. parar
2. digitando?             → Escape sai do campo, resto ignora
3. outro modificador?     → devolve pro browser
4. foco em button/a/select? → devolve (senão Enter no botão dispara duas coisas)
5. tecla seca             → ↑↓ anda no repertório, Enter abre
```
Cada atalho anunciado num `<kbd>` no próprio controle. Nada destrutivo em tecla seca.

## Fases

1. **Backend `/api/songs/*`** + testes (inclui: nome perigoso recusado, excluir não
   apaga, restaurar não perde elo, `.jsonl` sobrevive a reinício).
2. **`jam.py`**: `new`, `songs`, `open`, `versions`, `comment`.
3. **Casca da rota** em `src/musica/`: `/musica` no `main.tsx`, três colunas,
   repertório + editor (reusa `StrudelEditor`) + transporte.
4. **Histórico**: lista de versões, prévia, restaurar (C: salva versão nova).
5. **Proposta do Claude** na rota, com diff contra o que está na tela.
6. **Portão**: `tsc -b`, `vite build`, `vitest`, `killer-scan --report`, medir
   `scrollWidth` a 390px, e abrir a tela de verdade no navegador. Tela que compila
   não é tela que alguém viu.

---

# STATUS — entregue em 2026-09-03

| Fase | Estado | Onde |
|---|---|---|
| 1. Backend `/api/songs/*` | feito | `backend/dashboard_server.py`, 7 rotas + `.versions/` e `.trash/` |
| 2. CLI | feito | `backend/jam.py`: `new`, `songs`, `open`, `versions`, `comment`, `save` |
| 3. Rota | feito | `src/musica/` (`Musica`, `Repertorio`, `Versoes`, `diff`), registrada em `main.tsx` |
| 4. Histórico | feito | prévia de versão + restaurar como versão nova |
| 5. Proposta do Claude | feito | faixa com `+N −M` de diff LCS, OUVIR / ACEITAR / ✕ |
| 6. Portão | aberto | `AUDIT-musica.md` — 5 superfícies classificadas, 7 telas vistas |

Duas rotas do jam bridge morreram para não haver duas verdades: `/api/jam/save` e
`/api/jam/patterns` foram substituídas por `/api/songs`. `jam.py save` delega.

Testes: 24 no backend (`test_songs.py`, `test_jam_bridge.py`), 90 no front
(inclui `diff.test.ts` e `Musica.estreito.test.tsx`).

Cinco defeitos achados USANDO a tela, nenhum pego por tsc/build/detector — os
cinco estão em `AUDIT-musica.md`, com o conserto e a verificação de cada um.
