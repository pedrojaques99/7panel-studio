# -*- coding: utf-8 -*-
"""
A /final: contrato das rotas (`final_routes.py`).

O que nao pode quebrar:
  - a biblioteca lista audio e .mid das pastas da era, e ignora o resto;
  - projeto salvo volta igual, e o id nao escapa da pasta de projetos;
  - o export ganha a proxima versao livre do nome, com o .json do projeto ao lado.
"""
import io
import json
import os

import pytest

import final_routes


@pytest.fixture
def cli(tmp_path, monkeypatch):
    import dashboard_server
    (tmp_path / 'era 5' / '_melodia').mkdir(parents=True)
    (tmp_path / 'era6').mkdir()
    (tmp_path / 'era 5' / 'a.wav').write_bytes(b'RIFF')
    (tmp_path / 'era 5' / 'notas.txt').write_text('x')
    (tmp_path / 'era 5' / '_melodia' / 'first.mid').write_bytes(b'MThd')
    (tmp_path / 'era6' / 'b.wav').write_bytes(b'RIFF')
    monkeypatch.setattr(final_routes, 'JACAO', str(tmp_path))
    monkeypatch.setattr(final_routes, 'FINAL', str(tmp_path / 'final'))
    monkeypatch.setattr(final_routes, 'PROJETOS', str(tmp_path / 'final' / '_projetos'))
    monkeypatch.setattr(final_routes, 'GRAVACOES', str(tmp_path / 'final' / '_gravacoes'))
    return dashboard_server.app.test_client()


def test_biblioteca_lista_audio_e_midi_por_grupo(cli):
    itens = cli.get('/api/final/biblioteca').get_json()['itens']
    por_nome = {i['nome']: i for i in itens}
    assert set(por_nome) == {'a', 'first', 'b'}
    assert por_nome['first']['tipo'] == 'midi' and por_nome['first']['grupo'] == 'era5 · melodia'
    assert por_nome['b']['grupo'] == 'era6'


def test_projeto_salvo_volta_igual(cli):
    doc = {'id': 'p1', 'nome': 'teste', 'bpm': 72, 'trilhas': [{'id': 't1', 'clipes': []}]}
    assert cli.post('/api/final/projetos', json=doc).status_code == 200
    assert cli.get('/api/final/projetos/p1').get_json() == doc
    lista = cli.get('/api/final/projetos').get_json()['projetos']
    assert lista[0]['id'] == 'p1' and lista[0]['trilhas'] == 1
    assert cli.delete('/api/final/projetos/p1').status_code == 200
    assert cli.get('/api/final/projetos/p1').status_code == 404


def test_projeto_sem_trilhas_e_400(cli):
    assert cli.post('/api/final/projetos', json={'id': 'x'}).status_code == 400


def test_id_nao_sai_da_pasta_de_projetos(cli, tmp_path):
    cli.post('/api/final/projetos', json={'id': '../../fora', 'trilhas': []})
    assert not (tmp_path / 'fora.json').exists()
    assert list((tmp_path / 'final' / '_projetos').iterdir())


def test_export_ganha_proxima_versao(cli, tmp_path):
    def manda():
        return cli.post('/api/final/salvar', data={
            'audio': (io.BytesIO(b'RIFF'), 'a.wav'),
            'projeto': (io.BytesIO(json.dumps({'nome': 'Noite'}).encode()), 'p.json'),
            'nome': 'Noite', 'dur_s': '125',
        }, content_type='multipart/form-data').get_json()
    assert manda()['nome'] == 'noite-v1-2m 05s'
    assert manda()['nome'] == 'noite-v2-2m 05s'
    assert (tmp_path / 'final' / 'noite-v2-2m 05s.json').exists()


def test_gravacao_vira_arquivo_sem_sobrescrever(cli, tmp_path):
    def manda():
        return cli.post('/api/final/gravacao', data={'audio': (io.BytesIO(b'RIFF'), 'r.wav'), 'nome': 'Voz 1'},
                        content_type='multipart/form-data').get_json()
    a, b = manda(), manda()
    assert a['ok'] and b['ok'] and a['caminho'] != b['caminho']
    assert os.path.basename(a['caminho']).startswith('voz-1-')
    assert os.path.exists(b['caminho'])
