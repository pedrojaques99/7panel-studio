# -*- coding: utf-8 -*-
"""
O cano entre o CLI e o painel AnalogBrain, pelo test client do Flask.

O que precisa valer, e por que:
  * push incrementa rev e NUNCA perde o codigo anterior — o historico e o "git log"
    da musica; sem ele nao ha como voltar num take.
  * push do claude nao marca accepted_rev — e proposta, quem aceita e o painel.
  * feedback carrega o erro de eval de volta — e o unico canal que deixa o agente
    consertar sintaxe sem o humano copiar mensagem de erro.
"""
import json
import os

import pytest

dashboard_server = pytest.importorskip(
    'dashboard_server', reason='dashboard_server nao importou (dependencia de Windows?)')


@pytest.fixture()
def cli(tmp_path, monkeypatch):
    monkeypatch.setattr(dashboard_server, '_JAM_FILE', str(tmp_path / 'jam.json'))
    monkeypatch.setattr(dashboard_server, '_PATTERNS_DIR', str(tmp_path / 'patterns'))
    dashboard_server._jam_state.update({
        'rev': 0, 'code': '', 'author': 'user', 'message': '',
        'bpm': 120, 'playing': False, 'error': None, 'accepted_rev': 0, 'ts': 0.0,
    })
    dashboard_server._jam_log[:] = []
    dashboard_server.app.config['TESTING'] = True
    return dashboard_server.app.test_client()


def _push(cli, code, author='claude', **kw):
    return cli.post('/api/jam/push', json={'code': code, 'author': author, **kw})


def test_push_incrementa_rev_e_guarda_historico(cli):
    assert _push(cli, 's("bd sd")', message='beat 1').get_json()['rev'] == 1
    assert _push(cli, 's("bd*4")', message='beat 2').get_json()['rev'] == 2

    st = cli.get('/api/jam/state').get_json()
    assert st['rev'] == 2 and st['code'] == 's("bd*4")' and st['author'] == 'claude'

    log = cli.get('/api/jam/log?n=5&code=1').get_json()
    assert [it['rev'] for it in log] == [2, 1]          # mais nova primeiro
    assert log[1]['code'] == 's("bd sd")'               # take antigo intacto


def test_proposta_do_claude_nao_conta_como_aceita(cli):
    _push(cli, 's("hh*8")', author='claude')
    assert cli.get('/api/jam/state').get_json()['accepted_rev'] == 0

    cli.post('/api/jam/feedback', json={'accepted_rev': 1})
    assert cli.get('/api/jam/state').get_json()['accepted_rev'] == 1


def test_edicao_do_humano_ja_entra_aceita(cli):
    _push(cli, 's("bd")', author='user')
    st = cli.get('/api/jam/state').get_json()
    assert st['accepted_rev'] == st['rev'] == 1


def test_erro_de_eval_volta_no_state_e_rev_nova_limpa(cli):
    _push(cli, 's("bd', message='torto')
    cli.post('/api/jam/feedback', json={'error': 'Unexpected end of input', 'playing': False})
    assert cli.get('/api/jam/state').get_json()['error'] == 'Unexpected end of input'

    _push(cli, 's("bd")', message='consertado')
    assert cli.get('/api/jam/state').get_json()['error'] is None


def test_push_vazio_recusado(cli):
    assert _push(cli, '   ').status_code == 400
    assert cli.get('/api/jam/state').get_json()['rev'] == 0


def test_bpm_do_humano_vira_bpm_vivo(cli):
    _push(cli, 's("bd")', author='user', bpm=142)
    assert cli.get('/api/jam/state').get_json()['bpm'] == 142


def test_estado_sobrevive_reinicio_do_servidor(cli, tmp_path, monkeypatch):
    _push(cli, 's("bd sd")', message='antes do restart')
    # simula processo novo lendo o arquivo persistido
    dashboard_server._jam_state.update({'rev': 0, 'code': '', 'message': ''})
    dashboard_server._jam_log[:] = []
    dashboard_server._jam_load()
    st = cli.get('/api/jam/state').get_json()
    assert st['rev'] == 1 and st['message'] == 'antes do restart'


def test_bpm_da_proposta_nao_mexe_no_bpm_vivo(cli):
    """Painel e a verdade do bpm. Proposta so SUGERE, em prop_bpm."""
    cli.post('/api/jam/feedback', json={'bpm': 160})
    _push(cli, 's("bd")', author='claude', bpm=122)
    st = cli.get('/api/jam/state').get_json()
    assert st['bpm'] == 160 and st['prop_bpm'] == 122

    # push sem bpm limpa a sugestao antiga
    _push(cli, 's("bd*2")', author='claude')
    assert cli.get('/api/jam/state').get_json()['prop_bpm'] == 0
