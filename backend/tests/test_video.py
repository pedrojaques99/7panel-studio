# -*- coding: utf-8 -*-
"""
dsp/video.py: casar o audio ja renderizado com o visual escolhido (PLAN-mix-export-video.md).

O que nao pode quebrar:
  - vídeo (`tipo: 'video'`) sai cortado no tamanho do audio (-shortest manda, nao o loop);
  - imagem (`tipo: 'imagem'`) tambem funciona, mesmo sem ter o que copiar;
  - visual que sumiu do disco estoura erro claro, nao trace do ffmpeg.
"""
import os

import pytest

from conftest import precisa_ffmpeg
from dsp import video


@pytest.fixture(scope='module')
def audio_5s(wav_factory):
    import numpy as np
    x = np.random.default_rng(7).standard_normal(44100 * 5).astype(np.float32) * 0.3
    return wav_factory('video_audio5', x)


@precisa_ffmpeg
def test_compoe_video_cortado_no_tamanho_do_audio(audio_5s, video_factory, tmp_path):
    # loop de 2s, audio de 5s: precisa repetir o loop, e o resultado tem que parar em 5s,
    # nao em multiplo de 2s (e o -shortest que garante isso)
    loop = video_factory('loop2s', dur_s=2.0)
    item = {'id': 'v1', 'tipo': 'video', 'caminho': loop}
    saida = str(tmp_path / 'saida.mp4')

    r = video.compor_video(audio_5s, item, saida)

    assert os.path.isfile(saida)
    assert r['dur_s'] == pytest.approx(5.0, abs=0.3)


@precisa_ffmpeg
def test_compoe_imagem_estatica(audio_5s, imagem_factory, tmp_path):
    img = imagem_factory('still1')
    item = {'id': 'i1', 'tipo': 'imagem', 'caminho': img}
    saida = str(tmp_path / 'saida_img.mp4')

    r = video.compor_video(audio_5s, item, saida)

    assert os.path.isfile(saida)
    assert r['dur_s'] == pytest.approx(5.0, abs=0.3)


@precisa_ffmpeg
def test_visual_sumido_do_disco_estoura_erro_claro(audio_5s, tmp_path):
    item = {'id': 'v-sumido', 'tipo': 'video', 'caminho': str(tmp_path / 'nao-existe.mp4')}
    with pytest.raises(RuntimeError, match='sumiu do disco'):
        video.compor_video(audio_5s, item, str(tmp_path / 'saida.mp4'))
