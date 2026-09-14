# -*- coding: utf-8 -*-
"""
O acerto de cache do /api/stretch tem que avisar igual ao render.

Regressao de um defeito que eu mesmo introduzi: o aviso de fator curto
(`fator_real`/`fator_ok`) foi acrescentado so no caminho que RENDERIZA. No acerto
de cache a rota retornava cedo com `{path}` puro, entao um render que saiu curto
mostrava o alerta uma unica vez e nunca mais.

"Avisa na primeira vez e cala nas seguintes" e pior que nunca ter avisado: a pessoa
aprende que aquele arquivo esta bom. Como o cache e por (path, fator, janela), a
segunda chamada e exatamente a que acontece quando alguem volta pra conferir.

O conserto e um sidecar `ps_<key>.json` gravado junto do wav.
"""
import json
import os

import numpy as np
import pytest
from scipy.io import wavfile

from conftest import precisa_ffmpeg

dashboard_server = pytest.importorskip(
    'dashboard_server', reason='backend nao importavel neste ambiente')


@pytest.fixture
def cliente():
    dashboard_server.app.config['TESTING'] = True
    return dashboard_server.app.test_client()


@pytest.fixture
def fonte_curta(tmp_path):
    """1 s: curto de proposito — pedindo 12x com janela 0,5 s entrega 6,62x."""
    p = str(tmp_path / 'curta.wav')
    x = np.random.default_rng(7).standard_normal(44100) * 0.2
    wavfile.write(p, 44100, (x * 32767).astype(np.int16))
    return p


def _rendes(cliente, path):
    return cliente.get('/api/stretch', query_string={
        'path': path, 'factor': 12.0, 'window': 0.5})


@precisa_ffmpeg
def test_o_aviso_sobrevive_ao_acerto_de_cache(cliente, fonte_curta):
    limpar = []
    try:
        r1 = _rendes(cliente, fonte_curta)
        assert r1.status_code == 200, r1.get_data(as_text=True)
        d1 = r1.get_json()
        limpar += [d1['path'], d1['path'][:-4] + '.json']

        assert d1['fator_ok'] is False
        assert d1['fator_real'] == pytest.approx(6.62, abs=0.05)

        # segunda chamada: mesmo path/fator/janela -> acerto de cache
        d2 = _rendes(cliente, fonte_curta).get_json()
        assert d2['path'] == d1['path'], 'deveria ter batido no cache'
        assert d2['fator_ok'] is False, 'o aviso sumiu no acerto de cache'
        assert d2['fator_real'] == d1['fator_real']
        assert d2['fator_pedido'] == d1['fator_pedido']
    finally:
        for f in limpar:
            try: os.unlink(f)
            except OSError: pass


@precisa_ffmpeg
def test_render_grava_o_sidecar_ao_lado_do_wav(cliente, fonte_curta):
    d = _rendes(cliente, fonte_curta).get_json()
    meta = d['path'][:-4] + '.json'
    try:
        assert os.path.exists(meta), 'sem sidecar o cache nao tem como avisar'
        with open(meta, encoding='utf-8') as fh:
            guardado = json.load(fh)
        assert set(guardado) == {'fator_pedido', 'fator_real', 'fator_ok'}
        assert guardado['fator_real'] == d['fator_real']
    finally:
        for f in (d['path'], meta):
            try: os.unlink(f)
            except OSError: pass


@precisa_ffmpeg
def test_render_antigo_sem_sidecar_responde_sem_estourar(cliente, fonte_curta):
    """Compatibilidade: os `ps_*.wav` que ja existem em assets/ nao tem sidecar.

    Devem seguir respondendo — sem o aviso, que e o comportamento de antes —, nunca
    com erro.
    """
    d = _rendes(cliente, fonte_curta).get_json()
    meta = d['path'][:-4] + '.json'
    try:
        os.unlink(meta)                      # simula render anterior ao sidecar
        r = _rendes(cliente, fonte_curta)
        assert r.status_code == 200
        assert r.get_json()['path'] == d['path']
        assert 'fator_real' not in r.get_json()
    finally:
        for f in (d['path'], meta):
            try: os.unlink(f)
            except OSError: pass
