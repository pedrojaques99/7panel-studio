# -*- coding: utf-8 -*-
"""
video.py - casa o audio ja renderizado da /mix com o visual do loop de 1h e cospe um mp4.

Porta a tecnica de `Jacao Ambients/_prod/_tools/mixvideo.py` (ja ouvida e aprovada la):
em vez de `-stream_loop -1` — que RECODIFICA a hora inteira de video pra repetir 10 s de
imagem 360x —, monta uma lista de concatenacao com o MESMO arquivo repetido N vezes e usa
o demuxer `concat` com `-c:v copy`: os pacotes de video sao COPIADOS, nao recodificados.
Uma hora de video sai em segundos. So funciona porque todos os segmentos sao o mesmo
arquivo (mesmo codec/resolucao/timebase, comeca com keyframe).

Imagem estatica (`tipo: 'imagem'`) nao tem o que copiar — e 1 frame so — entao recodifica
com `-loop 1` (custo baixo mesmo numa faixa de 1h, e so 1 frame parado).

O audio manda: `-shortest` corta o video no tamanho do audio ja mixado por `dsp.mix.render`
(fade/limiter/nivel ja resolvidos la — aqui so troca o codec pra AAC, nada de nivel de novo).
"""
import math
import os
import subprocess
import tempfile

from dsp.mix import dur


def _r(cmd):
    return subprocess.run(cmd, capture_output=True)


def _lista_concat(video, n):
    """Lista de concatenacao com o mesmo loop repetido n vezes — o caminho pro `-c:v copy`."""
    f = tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8')
    cam = os.path.abspath(video).replace('\\', '/').replace("'", "'\\''")
    for _ in range(n):
        f.write("file '%s'\n" % cam)
    f.close()
    return f.name


def compor_video(audio, item, saida, abr='320k'):
    """item: entrada de visual_catalog.json (`tipo` 'video' ou 'imagem', `caminho`). Muxa
    `audio` (ja renderizado) com o visual, cortado no tamanho do audio. Devolve
    dict(out, dur_s, tipo)."""
    video = item['caminho']
    if not os.path.isfile(video):
        raise RuntimeError('visual sumiu do disco: %s' % video)
    da = dur(audio)
    if da <= 0:
        raise RuntimeError('nao li a duracao de %s' % audio)
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)

    if item['tipo'] == 'video':
        dv = dur(video)
        if dv <= 0:
            raise RuntimeError('nao li a duracao de %s' % video)
        n = max(int(math.ceil(da / dv)) + 1, 1)
        lista = _lista_concat(video, n)
        try:
            r = _r(['ffmpeg', '-y', '-v', 'error',
                    '-f', 'concat', '-safe', '0', '-i', lista,
                    '-i', audio,
                    '-map', '0:v:0', '-map', '1:a:0',
                    '-c:v', 'copy',                         # <- o video NAO e recodificado
                    '-af', 'aresample=48000',
                    '-c:a', 'aac', '-b:a', abr, '-ac', '2',
                    '-shortest', '-movflags', '+faststart', saida])
        finally:
            try:
                os.unlink(lista)
            except OSError:
                pass
    else:  # imagem: 1 frame parado, nao ha o que copiar
        r = _r(['ffmpeg', '-y', '-v', 'error',
                '-loop', '1', '-i', video, '-i', audio,
                '-map', '0:v:0', '-map', '1:a:0',
                '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', abr, '-ac', '2',
                '-shortest', '-movflags', '+faststart', saida])

    if r.returncode != 0 or not os.path.isfile(saida):
        raise RuntimeError('ffmpeg (video) falhou: ' + r.stderr.decode(errors='ignore')[-400:])
    return dict(out=os.path.abspath(saida), dur_s=round(dur(saida), 1), tipo=item['tipo'])
