# -*- coding: utf-8 -*-
"""
O acervo de musicas da rota /musica, pelo test client do Flask.

As duas primeiras regras existem porque a tabela de superficie classificou
*restaurar* e *excluir* como classe C (acao irreversivel): elas nao podem mentir.
  * excluir move pra .trash/ — nada aqui apaga de verdade;
  * restaurar SALVA versao nova — a linha do tempo nunca perde um elo, entao
    dar Ctrl+Z depois de restaurar por engano continua possivel.
O resto guarda o contrato que a tela consome: lista de versoes sem codigo (peso),
nome recusado e nao sanitizado, e .jsonl que sobrevive a linha torta.
"""
import json
import os

import pytest

dashboard_server = pytest.importorskip(
    'dashboard_server', reason='dashboard_server nao importou (dependencia de Windows?)')


@pytest.fixture()
def cli(tmp_path, monkeypatch):
    pats = tmp_path / 'patterns'
    pats.mkdir()
    monkeypatch.setattr(dashboard_server, '_PATTERNS_DIR', str(pats))
    monkeypatch.setattr(dashboard_server, '_VERSIONS_DIR', str(pats / '.versions'))
    monkeypatch.setattr(dashboard_server, '_TRASH_DIR', str(pats / '.trash'))
    dashboard_server.app.config['TESTING'] = True
    return dashboard_server.app.test_client()


def _save(cli, nome, code, **kw):
    return cli.post('/api/songs/' + nome, json={'code': code, **kw})


# ── classe C: as duas acoes irreversiveis ────────────────────────────────────

def test_excluir_move_pra_trash_e_nao_apaga(cli, tmp_path):
    _save(cli, 'take-01', 's("bd sd")', message='primeira')
    assert cli.delete('/api/songs/take-01').status_code == 200

    assert cli.get('/api/songs').get_json() == []
    assert cli.get('/api/songs/take-01').status_code == 404

    trash = tmp_path / 'patterns' / '.trash'
    js = [f for f in os.listdir(trash) if f.endswith('.js')]
    jsonl = [f for f in os.listdir(trash) if f.endswith('.jsonl')]
    assert len(js) == 1 and len(jsonl) == 1, 'musica e historico vao juntos pro lixo'
    assert 's("bd sd")' in open(trash / js[0], encoding='utf-8').read()


def test_restaurar_salva_versao_nova_em_vez_de_sobrescrever(cli):
    _save(cli, 'take-01', 'v0', message='primeira')
    _save(cli, 'take-01', 'v1', message='segunda')
    _save(cli, 'take-01', 'v2', message='terceira')

    r = cli.post('/api/songs/take-01/restore/0', json={})
    assert r.status_code == 200 and r.get_json()['code'] == 'v0'

    song = cli.get('/api/songs/take-01').get_json()
    assert song['code'].strip() == 'v0'
    assert [v['message'] for v in song['versions']] == [
        'primeira', 'segunda', 'terceira', 'restaurado de v0',
    ], 'restaurar nao pode comer as versoes que ja existiam'


def test_restaurar_versao_inexistente_nao_mexe_no_acervo(cli):
    _save(cli, 'take-01', 'v0')
    assert cli.post('/api/songs/take-01/restore/9', json={}).status_code == 404
    assert len(cli.get('/api/songs/take-01').get_json()['versions']) == 1


# ── contrato que a tela consome ──────────────────────────────────────────────

def test_lista_de_versoes_nao_carrega_o_codigo(cli):
    """40 versoes de 2 KB seriam 80 KB por clique na lista. Codigo so em /v/<i>."""
    _save(cli, 'take-01', 's("bd")' * 500, message='pesada')
    versions = cli.get('/api/songs/take-01').get_json()['versions']
    assert 'code' not in versions[0]
    assert versions[0]['chars'] == len('s("bd")' * 500)
    assert cli.get('/api/songs/take-01/v/0').get_json()['code'] == 's("bd")' * 500


def test_lista_do_acervo_vem_da_mexida_mais_recente(cli):
    _save(cli, 'antiga', 'a')
    _save(cli, 'nova', 'b')
    nomes = [it['name'] for it in cli.get('/api/songs').get_json()]
    assert nomes == ['nova', 'antiga']


def test_resumo_traz_autor_e_recado_da_ultima_versao(cli):
    _save(cli, 'take-01', 'a', author='user', message='minha')
    _save(cli, 'take-01', 'b', author='claude', message='acid bass', bpm=122)
    item = cli.get('/api/songs').get_json()[0]
    assert item['author'] == 'claude' and item['message'] == 'acid bass'
    assert item['bpm'] == 122 and item['versions'] == 2


def test_salvar_vazio_recusado(cli):
    assert _save(cli, 'take-01', '   ').status_code == 400
    assert cli.get('/api/songs').get_json() == []


@pytest.mark.parametrize('nome', ['../fora', 'com espaco', 'ponto.js', ''])
def test_nome_torto_recusado_e_nao_sanitizado(cli, nome):
    assert _save(cli, nome, 's("bd")').status_code in (400, 404, 405)
    assert cli.get('/api/songs').get_json() == []


def test_renomear_leva_o_historico_junto(cli):
    _save(cli, 'take-01', 'a', message='uma')
    _save(cli, 'take-01', 'b', message='duas')
    assert cli.post('/api/songs/take-01/rename', json={'name': 'cama-eno'}).status_code == 200

    assert cli.get('/api/songs/take-01').status_code == 404
    song = cli.get('/api/songs/cama-eno').get_json()
    assert len(song['versions']) == 2, 'historico nao pode ficar orfao com o nome velho'


def test_renomear_pra_nome_ocupado_recusa(cli):
    _save(cli, 'take-01', 'a')
    _save(cli, 'take-02', 'b')
    r = cli.post('/api/songs/take-01/rename', json={'name': 'take-02'})
    assert r.status_code == 409
    assert cli.get('/api/songs/take-01').get_json()['code'].strip() == 'a'


def test_linha_torta_no_jsonl_nao_derruba_o_historico(cli, tmp_path):
    _save(cli, 'take-01', 'a', message='boa')
    jsonl = tmp_path / 'patterns' / '.versions' / 'take-01.jsonl'
    with open(jsonl, 'a', encoding='utf-8') as f:
        f.write('{isso nao e json\n')
    _save(cli, 'take-01', 'b', message='depois da linha torta')

    versions = cli.get('/api/songs/take-01').get_json()['versions']
    assert [v['message'] for v in versions] == ['boa', 'depois da linha torta']


def test_versao_sem_bpm_herda_o_andamento(cli):
    """Comentario nao pode apagar o tempo da musica — aconteceu na tela, em 120x122."""
    _save(cli, 'take-01', 'a', bpm=122, message='take')
    _save(cli, 'take-01', 'a', message='so um comentario')     # sem bpm
    assert cli.get('/api/songs').get_json()[0]['bpm'] == 122

    _save(cli, 'take-01', 'b', bpm=90, message='mudei o andamento')
    assert cli.get('/api/songs').get_json()[0]['bpm'] == 90


def test_historico_antigo_com_bpm_zero_nao_engana_a_tela(cli, tmp_path):
    """Dado ja gravado com bpm 0 existe no disco; a leitura tem que passar por cima."""
    _save(cli, 'take-01', 'a', bpm=122)
    jsonl = tmp_path / 'patterns' / '.versions' / 'take-01.jsonl'
    with open(jsonl, 'a', encoding='utf-8') as f:
        legado = {'ts': 1, 'author': 'claude', 'message': 'legado', 'bpm': 0, 'code': 'a'}
        f.write(json.dumps(legado) + os.linesep)
    assert cli.get('/api/songs').get_json()[0]['bpm'] == 122
    assert cli.get('/api/songs/take-01').get_json()['bpm'] == 122


# ── favoritos ────────────────────────────────────────────────────────────────
#
# Favorito e opiniao de agora, nao fato de versao: por isso mora num arquivo
# proprio e nao dentro do historico. Estes testes guardam as tres coisas que a
# tela assume — que o flag viaja na lista, que renomear leva o favorito junto, e
# que arquivo torto nao derruba o acervo.

def test_favorito_alterna_e_viaja_na_lista(cli):
    _save(cli, 'entropia', 's("bd")')
    assert cli.get('/api/songs').get_json()[0]['favorito'] is False

    r = cli.post('/api/songs/entropia/favorito')          # sem corpo = alterna
    assert r.get_json()['favorito'] is True
    assert cli.get('/api/songs').get_json()[0]['favorito'] is True
    assert cli.get('/api/songs/entropia').get_json()['favorito'] is True

    assert cli.post('/api/songs/entropia/favorito').get_json()['favorito'] is False


def test_favorito_explicito_e_idempotente(cli):
    _save(cli, 'take-01', 's("bd")')
    for _ in range(2):
        assert cli.post('/api/songs/take-01/favorito',
                        json={'favorito': True}).get_json()['favorito'] is True
    assert cli.get('/api/songs').get_json()[0]['favorito'] is True


def test_favoritar_musica_que_nao_existe_da_404(cli):
    assert cli.post('/api/songs/fantasma/favorito').status_code == 404


def test_renomear_leva_o_favorito_junto(cli):
    _save(cli, 'take-01', 's("bd")')
    cli.post('/api/songs/take-01/favorito')
    cli.post('/api/songs/take-01/rename', json={'name': 'tempestade'})
    lista = {i['name']: i['favorito'] for i in cli.get('/api/songs').get_json()}
    assert lista == {'tempestade': True}


def test_arquivo_de_favoritos_torto_nao_derruba_a_lista(cli, tmp_path):
    _save(cli, 'take-01', 's("bd")')
    (tmp_path / 'patterns' / '.favoritos.json').write_text('{isso nao e json', encoding='utf-8')
    r = cli.get('/api/songs')
    assert r.status_code == 200
    assert r.get_json()[0]['favorito'] is False


def test_excluir_solta_o_favorito(cli, tmp_path):
    _save(cli, 'take-01', 's("bd")')
    cli.post('/api/songs/take-01/favorito')
    cli.delete('/api/songs/take-01')
    favs = json.loads((tmp_path / 'patterns' / '.favoritos.json').read_text(encoding='utf-8'))
    assert favs == []
