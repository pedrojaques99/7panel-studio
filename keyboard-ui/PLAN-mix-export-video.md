# `/mix`: o export vira vídeo de verdade quando um visual está escolhido

> **Status (2026-09-14): decidido, pronto pra implementar.** Nome do vídeo:
> mesmo nome-base do áudio, `.mp4` ao lado. Preview continua só áudio.

## O buraco (confirmado em `arquivo:linha`)

Hoje a tela deixa escolher um visual (`Mix.tsx:250-258`, `escolherVisual` →
`POST /api/mix/visual-pick`) e mostra um `<video>` de 56×42px tocando junto
no rodapé (`Mix.tsx:694-707`) — mas isso é só **preview no browser**. O botão
"exportar" (`Mix.tsx:748`) manda `POST /api/mix/render` com `musica`,
`camadas`, `duracao_s`, `formato`, `preview_s` — **sem `visualId`**
(`Mix.tsx:401-411`). No backend, `mix_render()` (`mix_routes.py:237-305`) e
`render()` (`dsp/mix.py:152-249`) só tocam áudio: todo `ffmpeg` ali monta
`-filter_complex` de ondas, sem `-i` de vídeo, sem `-map 0:v`, sem saída
`.mp4`. O visual escolhido nunca chega no arquivo final — é decoração da
tela, não parte da composição.

## O que já existe pra reaproveitar

`Z:\jaques.dsgn\sfx_music\Jacão Ambients\_prod\_tools\mixvideo.py` já resolve
exatamente esse problema (casar um mix de 1h com um loop de vídeo) e resolve
bem: em vez de `-stream_loop -1` (que recodifica a hora inteira de vídeo —
dezenas de minutos de CPU), monta uma lista de concatenação com o loop
repetido N vezes e usa o demuxer `concat` com `-c:v copy` — os pacotes de
vídeo são **copiados**, não recodificados. Uma hora de vídeo sai em segundos.
Vou **portar essa técnica** pra dentro do 7panel_studio (não importar o
script de outro repo — projetos diferentes, sem fronteira de pacote entre
eles) num módulo novo `backend/dsp/video.py`.

## Duas famílias de visual, dois caminhos de ffmpeg

`visual_catalog.json` tem `tipo: 'video'` (32 itens, `.mp4/.mov/...`) e
`tipo: 'imagem'` (1 item, still). São casos diferentes:

- **`video`**: técnica do `mixvideo.py` — concat demuxer + `-c:v copy`. Rápido,
  sem perda.
- **`imagem`**: não tem o que copiar (é 1 frame). `-loop 1 -i imagem.jpg -i
  audio -c:v libx264 -tune stillimage -pix_fmt yuv420p -shortest`. Recodifica,
  mas é 1 frame parado — custo de CPU é baixo mesmo numa faixa de 1h.

Os dois casam pelo mesmo contrato: `compor_video(audio_path, item_visual,
saida_mp4, progresso=None) -> dict`.

## Escopo: só o export de verdade grava vídeo, o preview de 30s continua só áudio

Decisão (documento, não assumida em silêncio): **preview continua sem
vídeo**. O preview de 30s existe pra checar rápido a cadeia de mixagem
(`PREVIEW_S`, cadência de 1s de polling) — motivo já registrado no topo do
`Mix.tsx:17-20`. Colar a etapa de vídeo ali só atrasa a iteração sem ajudar
a decidir nível/gap das camadas, que é o que o preview serve. O vídeo entra
só quando `preview_s` é `null`, ou seja, só no botão **exportar**.

Se no futuro isso incomodar (usuário quiser ver o preview com vídeo de
verdade em vez do `<video>` de 56px), é uma extensão de escopo separada —
não bloqueia esta.

## Mudanças

### `backend/dsp/video.py` (novo)

```python
def compor_video(audio_path, item, saida, progresso=None):
    """item: entrada de visual_catalog.json (tipo 'video' ou 'imagem').
    Muxa o áudio já renderizado (mp3/wav, já com fade/limiter aplicados —
    NADA aqui refaz nivelamento) com o loop de vídeo, cortado no tamanho
    do áudio (-shortest — o mix manda, igual ao mixvideo.py)."""
```

- `tipo == 'video'`: ffprobe a duração do vídeo, `n = ceil(dur_audio /
  dur_video) + 1`, lista de concat temporária (mesmo truque do
  `mixvideo.py`: `file '...'` repetido, aspas escapadas), `-map 0:v:0 -map
  1:a:0 -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart`.
- `tipo == 'imagem'`: `-loop 1 -i imagem -i audio -c:v libx264 -tune
  stillimage -pix_fmt yuv420p -c:a aac -b:a 320k -shortest -movflags
  +faststart`.
- Erro (arquivo de vídeo sumiu, ffmpeg falhou) sobe `RuntimeError` — mesmo
  padrão de `dsp/mix.py:245-246`, pro job virar `status: 'error'` do jeito
  que a tela já sabe mostrar.

### `backend/mix_routes.py` — `mix_render()`

- Lê `visual_id = (b.get('visual_id') or '').strip()`.
- Se veio e **não é preview**: valida contra `catalogo_visual()` (mesma
  checagem que `mix_visual_pick_post` já faz em `:344-348` — reaproveita,
  não reinventa) e confere que o arquivo existe no disco.
- Saída deixa de ser só `saida` (áudio): quando há visual,
  - o áudio renderiza pro caminho de sempre (`_nome_saida(..., formato)`) —
    **fica salvo também**, não é descartado. É o "grave tanto o vídeo quanto
    as texturas" — o arquivo de áudio puro continua existindo pra quem quiser
    só o mix sem vídeo.
  - depois, `compor_video()` gera um `.mp4` irmão (mesmo nome-base,
    extensão trocada) em `SAIDA_DIR`.
  - `job['out']` passa a apontar pro `.mp4` (é o resultado principal quando
    tem visual); `job['audio_out']` guarda o caminho do áudio puro.
- `formato` (mp3/wav) continua controlando só o áudio interno/irmão — o
  vídeo sempre carrega áudio AAC 320k (é o que o `.mp4`/YouTube espera;
  mesma escolha do `mixvideo.py`).
- Sem visual escolhido: **zero mudança de comportamento**, mesmo fluxo de
  hoje.

```python
def correr():
    try:
        resultado = render(musica, camadas, saida, ..., progresso=...)
        job.update(resultado, status='done' if not visual_item else 'running', progress=100 if not visual_item else 99)
        if visual_item:
            saida_video = _troca_ext(saida, '.mp4')
            job.update(compondo=True)
            compor_video(saida, visual_item, saida_video)
            job.update(out=saida_video, audio_out=saida, status='done', progress=100, compondo=False)
        if not preview_s:
            registra_uso([c['item']['id'] for c in camadas])
    except Exception as e:
        job.update(status='error', error=str(e))
```

### `keyboard-ui/src/mix/Mix.tsx`

- `renderizar(preview)`: quando `!preview && visualId`, inclui `visual_id:
  visualId` no body de `POST /api/mix/render`.
- Bloco de resultado (`:760-770`): se `job.out` termina em `.mp4`, troca
  `<audio controls>` por `<video controls>` (mesmo elemento, sem componente
  novo); o rótulo já existente (`job.preview ? ... : 'render'`) ganha "· com
  vídeo" quando aplicável. Se `job.audio_out` existir, mostra um link/nota
  pro áudio puro logo abaixo — é um segundo arquivo real no disco, a tela
  não pode escondê-lo.
- `VintageLed` (`:738-743`): rótulo durante a etapa de vídeo vira "compondo
  vídeo" em vez de "renderizando NN%" (o mux por `-c:v copy` é rápido — não
  precisa de progresso fino, só avisar que é outra etapa).

### Tipos (`modelo.ts`)

`Job` ganha `audio_out?: string` e `compondo?: boolean`.

## Casos de borda

- Visual `tipo: imagem` numa faixa de 4h: recodifica 4h de vídeo com 1
  frame parado — CPU baixa (é uma imagem estática), mas ainda é a duração
  inteira; sem otimização especial aqui, primeira versão aceita o custo.
- Vídeo escolhido sumiu do disco entre a escolha e o export (arquivo movido
  fora do catálogo): `compor_video` estoura, job vira `error` com a mensagem
  do ffmpeg — mesmo tratamento que já existe pra qualquer falha de render.
- Trocar de música com job rodando: já é comportamento existente (o polling
  do job antigo segue seu curso) — não mexo nisso aqui.

## Testes a atualizar

- `backend/tests/test_mix.py`: caso novo — render com `visual_id` de
  `tipo: video` produz `.mp4` que existe e tem `-shortest` batendo com a
  duração do áudio (ffprobe); caso com `visual_id` inválido devolve 400
  (mesma mensagem do `visual-pick`); render sem `visual_id` continua idêntico
  ao de hoje (não quebra os testes existentes).
- `keyboard-ui/src/mix/Mix.test.tsx`: `renderizar` inclui `visual_id` no
  fetch quando há visual escolhido e não é preview; resultado mostra
  `<video>` quando `job.out` é `.mp4`.

## Decisões (2026-09-14)

1. **Nome do arquivo de vídeo**: mesmo nome-base do áudio, extensão trocada
   — `assets/mix/faixa__ambiencia1+ambiencia2.mp4` ao lado do `.mp3`/`.wav`.
   Sem pasta separada.
2. **Preview continua só áudio** — confirmado. O `<video>` de 56px no rodapé
   segue sendo a única prévia visual até/se isso virar pedido separado.
