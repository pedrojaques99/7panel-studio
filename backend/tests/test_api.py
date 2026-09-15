# -*- coding: utf-8 -*-
"""
As rotas, end-to-end, pelo test client do Flask. Sem servidor, sem porta, sem UI.

Existe porque o contrato que a UI consome nao mora no `dsp/` e sim aqui: codigo de
status, chave que falta, aviso que nao chega. O bug do `fator_real` e o exemplo — o
motor sempre entregou menos do que o pedido em fonte curta, e a rota nao contava.

`dashboard_server.py` importa `comtypes` e `pycaw` no topo (mixer de audio do Windows).
Neste ambiente o import passa; se nao passasse, o `importorskip` abaixo pularia o
arquivo inteiro em vez de derrubar a coleta — e isso seria um problema a reportar, nao
um resultado aceitavel.
"""
import os
import time

import numpy as np
import pytest

dashboard_server = pytest.importorskip(
    'dashboard_server', reason='dashboard_server nao importou (dependencia de Windows?)')

from conftest import precisa_ffmpeg


@pytest.fixture(scope='module')
def cli():
    dashboard_server.app.config['TESTING'] = True
    return dashboard_server.app.test_client()


@pytest.fixture(scope='module')
def wav_curto(wav_factory):
    """3 s de ruido de amplitude constante: passa nos guardas de tamanho e roda rapido."""
    x = np.random.default_rng(11).standard_normal(44100 * 3).astype(np.float32)
    return wav_factory('api_fonte', x)


@pytest.fixture(scope='module')
def wav_1s(wav_factory):
    """1 s exato — o comprimento que expoe o bug do fator efetivo."""
    x = np.random.default_rng(12).standard_normal(44100).astype(np.float32)
    return wav_factory('api_1s', x)


# --------------------------------------------------------------------------
# /api/triagem
# --------------------------------------------------------------------------

def test_triagem_sem_path_reclama_com_400(cli):
    r = cli.post('/api/triagem', json={})
    assert r.status_code == 400
    assert 'error' in r.get_json()


def test_triagem_com_path_vazio_tambem_e_400(cli):
    assert cli.post('/api/triagem', json={'path': '   '}).status_code == 400


def test_triagem_de_arquivo_inexistente_e_404(cli, tmp_path):
    r = cli.post('/api/triagem', json={'path': str(tmp_path / 'nao-existe.wav')})
    assert r.status_code == 404


@precisa_ffmpeg
def test_triagem_de_wav_real_devolve_o_contrato_inteiro(cli, wav_curto):
    r = cli.post('/api/triagem', json={'path': wav_curto})
    assert r.status_code == 200
    d = r.get_json()
    esperadas = {'arquivo', 'path', 'dur_s', 'pulso', 'pulso_proxy', 'apito_hz',
                 'apito_x', 'apito_estab', 'cpp', 'centroid_hz', 'flatness', 'corr',
                 'veredito', 'destino', 'receita', 'portoes', 'af_notch', 'erros'}
    assert esperadas <= set(d), 'faltou chave do contrato: %s' % (esperadas - set(d))
    assert d['veredito'] in {'pronto', 'notchar', 'achatar', 'nao-estica'}
    assert d['destino'] in {'eno', 'aphex', 'mount-shrine'}
    assert [p['nome'] for p in d['portoes']] == ['pulso', 'cpp', 'apito', 'corr']
    assert all(p['status'] in {'ok', 'aviso', 'reprova'} for p in d['portoes'])
    assert set(d['receita']) == {'esticar', 'janela', 'escuro_hz', 'escuro_db',
                                 'teto_hz', 'ambiencia', 'nivel_ambiencia'}


# --------------------------------------------------------------------------
# /api/domar
# --------------------------------------------------------------------------

def test_domar_sem_path_e_400(cli):
    assert cli.post('/api/domar', json={}).status_code == 400


def test_domar_de_arquivo_inexistente_e_404(cli, tmp_path):
    r = cli.post('/api/domar', json={'path': str(tmp_path / 'nao-existe.wav')})
    assert r.status_code == 404


@precisa_ffmpeg
def test_so_medir_responde_na_hora_com_o_antes(cli, wav_curto):
    """Diagnostico e sincrono de proposito: render e que demora, medir nao."""
    r = cli.post('/api/domar', json={'path': wav_curto, 'so_medir': True})
    assert r.status_code == 200
    d = r.get_json()
    assert d['antes'] and set(d['antes']) == {'faixa_db', 'periodo_s', 'apito_x', 'tremolo_x'}
    assert d['depois'] is None
    assert 'job_id' not in d


@precisa_ffmpeg
def test_domar_de_verdade_vira_job_e_o_status_responde(cli, wav_curto, tmp_path):
    """Render de cama longa passa de qualquer timeout de HTTP, entao vai pra job.

    O polling aqui aceita `running` e `done` — o que se testa e que o job EXISTE e
    responde, nao quanto ele demora.
    """
    out = str(tmp_path / 'api_domado.wav')
    r = cli.post('/api/domar', json={'path': wav_curto, 'out': out})
    assert r.status_code == 200
    d = r.get_json()
    assert d['status'] == 'running'
    assert d['job_id'] and d['out'] == out

    st = None
    for _ in range(60):
        st = cli.get('/api/domar/status/%s' % d['job_id'])
        assert st.status_code == 200
        if st.get_json().get('status') != 'running':
            break
        time.sleep(0.5)

    j = st.get_json()
    assert j['status'] in {'running', 'done'}, 'job falhou: %s' % j.get('error')
    if j['status'] == 'done':
        assert j['antes'] and j['depois']
        assert os.path.exists(out)


def test_status_de_job_inexistente_e_404(cli):
    r = cli.get('/api/domar/status/inexistente')
    assert r.status_code == 404
    assert 'error' in r.get_json()


# --------------------------------------------------------------------------
# /api/stretch — e o aviso que corrige um bug real
# --------------------------------------------------------------------------

def test_stretch_de_arquivo_inexistente_reclama(cli, tmp_path):
    """400 e nao 404: esta rota e mais velha que a triagem e usa outro codigo.

    Registrado como esta, nao como deveria — mudar o codigo aqui quebraria a UI que
    ja trata 400.
    """
    assert cli.get('/api/stretch?path=%s' % (tmp_path / 'nao-existe.wav')).status_code == 400


@pytest.mark.parametrize('fator', ['1.0', '500'])
def test_stretch_recusa_fator_fora_da_faixa(cli, wav_curto, fator):
    r = cli.get('/api/stretch?path=%s&factor=%s' % (wav_curto, fator))
    assert r.status_code == 400


@precisa_ffmpeg
def test_stretch_devolve_o_fator_pedido_e_o_entregue(cli, wav_curto):
    """As tres chaves sao o contrato do aviso. Sem elas a UI nao tem o que mostrar."""
    r = cli.get('/api/stretch?path=%s&factor=4&window=0.25' % wav_curto)
    assert r.status_code == 200
    d = r.get_json()
    assert {'path', 'fator_pedido', 'fator_real', 'fator_ok'} <= set(d)
    assert d['fator_pedido'] == 4.0
    assert os.path.exists(d['path'])
    try:
        os.unlink(d['path'])
    except OSError:
        pass


@precisa_ffmpeg
def test_fonte_curta_avisa_que_entregou_menos_do_que_o_pedido(cli, wav_1s):
    """O bug exposto. 1 s de fonte com janela de 0,5 s pedindo 12x entrega 6,62x —
    45% a menos, porque a ultima janela precisa caber inteira.

    A conta NAO foi corrigida (todos os renders aprovados do acervo sairam assim e
    mexer invalidaria a calibracao). O conserto e este aviso, que antes nao existia:
    a UI entregava 6,6x dizendo 12x e ninguem via.
    """
    r = cli.get('/api/stretch?path=%s&factor=12&window=0.5' % wav_1s)
    assert r.status_code == 200
    d = r.get_json()
    assert d['fator_ok'] is False
    assert d['fator_real'] == pytest.approx(6.62, abs=0.05)
    assert d['fator_real'] < d['fator_pedido'] * 0.6
    try:
        os.unlink(d['path'])
    except OSError:
        pass
