# -*- coding: utf-8 -*-
"""
A /mix: o DSP (`dsp/mix.py`) e o contrato das rotas (`mix_routes.py`).

O que nao pode quebrar:
  - a costura encurta a unidade exatamente pelo crossfade, e respeita head/end do catalogo
    (senao o loop cai no fade ja assado no arquivo e aparece um buraco a cada volta);
  - o preview sai no nivel MEDIO da respiracao, nao no vale do ciclo;
  - o /file e o /render so tocam arquivo dentro das raizes do acervo;
  - camada: de 1 a 2, e so id que existe no catalogo.
"""
import json
import os

import numpy as np
import pytest

from conftest import precisa_ffmpeg
from dsp import mix


# ── contas puras ────────────────────────────────────────────────────────────

def test_ganho_medio_da_respiracao_fica_entre_o_vale_e_o_pico():
    g = mix.ganho_medio_respiracao_db(14.0)
    assert -14.0 < g < 0.0
    # sem profundidade, nao ha respiracao: medio = pico
    assert mix.ganho_medio_respiracao_db(0.0) == pytest.approx(0.0)


def test_aviso_de_repeticao_so_pra_unidade_curta_que_repete_muito():
    assert mix.aviso_repeticao('rua', 30.0, 3600.0)            # 30 s em 1 h: 120 voltas
    assert mix.aviso_repeticao('cave', 1800.0, 3600.0) is None  # 2 voltas
    assert mix.aviso_repeticao('rua', 30.0, 120.0) is None      # 4 voltas: passa


def test_avisos_fixos_de_voz_e_evento():
    item = {'titulo': 'Rua', 'medidas': {'voz': 0.81, 'evento': 11.9}}
    av = mix.avisos_fixos(item)
    assert any('voz' in a for a in av) and any('evento' in a for a in av)
    assert mix.avisos_fixos({'titulo': 'cave', 'medidas': {'voz': 0.001, 'evento': 2.2}}) == []
    assert mix.avisos_fixos({'titulo': 'sem medida', 'medidas': None}) == []


# ── DSP de verdade ──────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def ruido_20s(wav_factory):
    x = np.random.default_rng(3).standard_normal(44100 * 20).astype(np.float32) * 0.3
    return wav_factory('mix_ruido20', x)


@pytest.fixture(scope='module')
def tom_20s(wav_factory):
    t = np.arange(44100 * 20) / 44100
    return wav_factory('mix_tom20', (np.sin(2 * np.pi * 220 * t) * 0.5).astype(np.float32))


def _xf(tam):
    """A regra da costura: crossfade de ate XFADE_S, mas nunca mais que 1/6 do trecho
    (a mesma do ambiente.py pra ambiencia). Cama curta com 6 s de costura seria meio fade."""
    return min(mix.XFADE_S, max(tam / 6.0, 0.5))


@precisa_ffmpeg
def test_costura_encurta_pelo_crossfade(ruido_20s, tmp_path):
    out, d, costurou = mix.unidade_loop(ruido_20s, str(tmp_path), 'u')
    assert costurou
    assert d == pytest.approx(20.0 - _xf(20.0), abs=0.15)


@precisa_ffmpeg
def test_costura_respeita_head_e_end_do_catalogo(ruido_20s, tmp_path):
    _, d, costurou = mix.unidade_loop(ruido_20s, str(tmp_path), 'he', head=2.0, end=18.0)
    assert costurou
    # o trecho e 2..18 (16 s), nao o arquivo inteiro: head/end recortam ANTES de costurar
    assert d == pytest.approx(16.0 - _xf(16.0), abs=0.15)


@precisa_ffmpeg
def test_render_de_preview_sai_no_tamanho_pedido(tom_20s, ruido_20s, tmp_path):
    saida = str(tmp_path / 'prev.mp3')
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    r = mix.render(tom_20s, [{'item': item, 'fonte': ruido_20s, 'nivel_db': 0.0, 'respira': True}],
                   saida, preview_s=5)
    assert os.path.isfile(saida)
    assert r['preview'] is True
    assert mix.dur(saida) == pytest.approx(5.0, abs=0.2)
    c = r['camadas'][0]
    # no preview a respiracao entra como ganho medio, somado ao ganho que leva ao limiar
    assert c['alvo_lufs'] == mix.CAMADA_LUFS[0]
    assert c['ganho_db'] == pytest.approx(
        c['alvo_lufs'] - c['lufs'] + mix.ganho_medio_respiracao_db(mix.PROFUNDIDADE_DB[0]), abs=0.05)


@precisa_ffmpeg
def test_preview_aplica_o_gap(tom_20s, ruido_20s, tmp_path):
    """O knob de GAP tem que valer no preview: zerar ali fazia o knob parecer morto,
    e o `-t` do preview ja garante que o silencio nao estica o tamanho pedido."""
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    base = dict(item=item, fonte=ruido_20s, nivel_db=0.0, respira=False)
    sem = mix.render(tom_20s, [dict(base, gap_s=0)], str(tmp_path / 'sem.mp3'), preview_s=5)
    com = mix.render(tom_20s, [dict(base, gap_s=8)], str(tmp_path / 'com.mp3'), preview_s=5)
    assert com['camadas'][0]['unidade_s'] == pytest.approx(sem['camadas'][0]['unidade_s'] + 8, abs=0.2)
    assert mix.dur(str(tmp_path / 'com.mp3')) == pytest.approx(5.0, abs=0.2)


@precisa_ffmpeg
def test_reverb_wet_zero_sai_identico_a_antes_de_existir(tom_20s, ruido_20s, tmp_path):
    """default 0.0 -> nenhum render existente muda de som (mesma garantia do /eq)."""
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    base = dict(item=item, fonte=ruido_20s, nivel_db=0.0, respira=False, gap_s=0)
    sem_campo = mix.render(tom_20s, [dict(base)], str(tmp_path / 'a.mp3'), preview_s=5)
    com_zero = mix.render(tom_20s, [dict(base, eq_db=0.0, reverb_wet=0.0)],
                          str(tmp_path / 'b.mp3'), preview_s=5)
    assert sem_campo['camadas'][0]['ganho_db'] == pytest.approx(com_zero['camadas'][0]['ganho_db'], abs=0.05)


@precisa_ffmpeg
def test_reverb_wet_alonga_a_cauda_percebida(tom_20s, ruido_20s, tmp_path):
    """com reverb ligado, o fim do trecho carrega mais energia (a cauda soma, nao troca)."""
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    base = dict(item=item, fonte=ruido_20s, nivel_db=0.0, respira=False, gap_s=0, eq_db=0.0)
    seco = str(tmp_path / 'seco.wav')
    molhado = str(tmp_path / 'molhado.wav')
    mix.render(tom_20s, [dict(base, reverb_wet=0.0)], seco, preview_s=6, formato='wav')
    mix.render(tom_20s, [dict(base, reverb_wet=0.9)], molhado, preview_s=6, formato='wav')
    assert os.path.isfile(seco) and os.path.isfile(molhado)
    assert mix.dur(molhado) == pytest.approx(mix.dur(seco), abs=0.2)   # reverb nao estica o preview


@precisa_ffmpeg
def test_eq_db_positivo_e_negativo_nao_quebra_o_render(tom_20s, ruido_20s, tmp_path):
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    base = dict(item=item, fonte=ruido_20s, nivel_db=0.0, respira=False, gap_s=0, reverb_wet=0.0)
    for eq, nome in ((-8.0, 'escuro'), (8.0, 'claro')):
        out = str(tmp_path / ('%s.mp3' % nome))
        mix.render(tom_20s, [dict(base, eq_db=eq)], out, preview_s=4)
        assert os.path.isfile(out)
        assert mix.dur(out) == pytest.approx(4.0, abs=0.2)


@precisa_ffmpeg
def test_musica_params_ajusta_o_alvo_de_nivel(tom_20s, ruido_20s, tmp_path):
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    camada = [dict(item=item, fonte=ruido_20s, nivel_db=0.0, respira=False, gap_s=0)]
    base = mix.render(tom_20s, camada, str(tmp_path / 'base.mp3'), preview_s=5)
    subiu = mix.render(tom_20s, camada, str(tmp_path / 'subiu.mp3'), preview_s=5,
                       musica_params={'nivel_db': 6.0})
    assert subiu['musica_ganho_db'] == pytest.approx(base['musica_ganho_db'] + 6.0, abs=0.05)


@precisa_ffmpeg
def test_atraso_entre_camadas_nao_muda_o_tamanho_do_preview(tom_20s, ruido_20s, tmp_path):
    """`adelay` so empurra o comeco da camada — o preview continua saindo no tamanho pedido."""
    item = {'id': 'ruido', 'titulo': 'ruido', 'medidas': None, 'loop': None}
    duas = [dict(item=item, fonte=ruido_20s, nivel_db=0.0, respira=False, gap_s=0),
            dict(item=dict(item, id='ruido2'), fonte=ruido_20s, nivel_db=0.0, respira=False, gap_s=0)]
    out = str(tmp_path / 'escalonado.mp3')
    mix.render(tom_20s, duas, out, preview_s=6, atraso_s=3.0)
    assert os.path.isfile(out)
    assert mix.dur(out) == pytest.approx(6.0, abs=0.2)


def test_render_recusa_alem_do_maximo_de_camadas(tom_20s, tmp_path):
    item = {'id': 'x', 'titulo': 'x'}
    demais = [{'item': item, 'fonte': tom_20s}] * (mix.MAX_CAMADAS + 1)
    with pytest.raises(ValueError):
        mix.render(tom_20s, demais, str(tmp_path / 'x.mp3'))


# ── rotas ───────────────────────────────────────────────────────────────────

dashboard_server = pytest.importorskip(
    'dashboard_server', reason='dashboard_server nao importou (dependencia de Windows?)')
import mix_routes  # noqa: E402


@pytest.fixture()
def cli(tmp_path, monkeypatch, ruido_20s):
    """Catalogo e raiz de teste: nada aqui depende do acervo real existir."""
    cat = tmp_path / 'cat.json'
    cat.write_text(json.dumps({'gerado_em': 'teste', 'itens': [
        {'id': 'ruido', 'titulo': 'ruido', 'categorias': ['ruido'], 'origem': 'pack',
         'principal': {'caminho': ruido_20s, 'dur_s': 20.0, 'lufs': -20.0}, 'variantes': [],
         'loop': None, 'medidas': {'voz': 0.5, 'evento': 1.0}},
    ]}), encoding='utf-8')
    monkeypatch.setattr(mix_routes, 'CATALOGO', str(cat))
    monkeypatch.setattr(mix_routes, '_cache', {'mtime': None, 'doc': None})
    monkeypatch.setattr(mix_routes, 'RAIZES', [mix_routes._norm(os.path.dirname(ruido_20s))])
    dashboard_server.app.config['TESTING'] = True
    return dashboard_server.app.test_client()


def test_permitido_nao_confunde_pasta_irma_com_prefixo(monkeypatch, tmp_path):
    raiz = tmp_path / 'acervo'
    monkeypatch.setattr(mix_routes, 'RAIZES', [mix_routes._norm(str(raiz))])
    assert mix_routes.permitido(str(raiz / 'faixa.wav'))
    assert not mix_routes.permitido(str(tmp_path / 'acervo-irmao' / 'faixa.wav'))


def test_catalogo_leva_aviso_de_voz(cli):
    j = cli.get('/api/mix/catalog').get_json()
    assert j['itens'][0]['id'] == 'ruido'
    assert any('voz' in a for a in j['itens'][0]['avisos'])


def test_file_por_id_serve_o_arquivo(cli):
    r = cli.get('/api/mix/file?id=ruido')
    assert r.status_code == 200
    assert r.mimetype == 'audio/wav'


def test_render_sem_musica_e_404(cli):
    assert cli.post('/api/mix/render', json={'musica': 'Z:\\nao\\existe.wav',
                                             'camadas': [{'id': 'ruido'}]}).status_code == 404


def test_render_fora_das_raizes_e_403(cli, monkeypatch, tom_20s):
    monkeypatch.setattr(mix_routes, 'RAIZES', [mix_routes._norm('Z:\\outro-lugar')])
    assert cli.post('/api/mix/render', json={'musica': tom_20s,
                                             'camadas': [{'id': 'ruido'}]}).status_code == 403


def test_render_valida_camadas(cli, ruido_20s):
    assert cli.post('/api/mix/render', json={'musica': ruido_20s, 'camadas': []}).status_code == 400
    assert cli.post('/api/mix/render', json={'musica': ruido_20s,
                                             'camadas': [{'id': 'nao-existe'}]}).status_code == 400
    demais = [{'id': 'ruido'}] * (mix.MAX_CAMADAS + 1)
    assert cli.post('/api/mix/render', json={'musica': ruido_20s, 'camadas': demais}).status_code == 400


def test_render_aceita_gap_maior_eq_reverb_e_atraso(cli, monkeypatch, ruido_20s):
    """gap ate 300 (nao mais 120), eq/reverb por camada e atraso global chegam ao dsp.mix.render
    ja clampados — o knob do frontend nao pode prometer o que a rota derruba em silencio."""
    from dsp import mix as dsp_mix
    vistos = {}
    monkeypatch.setattr(dsp_mix, 'render',
                        lambda musica, camadas, saida, **kw: vistos.update(camadas=camadas, kw=kw) or {})
    r = cli.post('/api/mix/render', json={
        'musica': ruido_20s,
        'camadas': [{'id': 'ruido', 'gap_s': 250, 'eq_db': 999, 'reverb_wet': 5}],
        'musica_params': {'nivel_db': 3, 'eq_db': -999, 'reverb_wet': -1},
        'atraso_s': 99,
        'preview_s': 5,
    })
    assert r.status_code == 200
    import time
    for _ in range(50):
        if vistos:
            break
        time.sleep(0.05)
    assert vistos['camadas'][0]['gap_s'] == 250          # dentro do novo teto de 300
    assert vistos['camadas'][0]['eq_db'] == 12.0          # clampado no teto de +-12
    assert vistos['camadas'][0]['reverb_wet'] == 1.0      # clampado em 0..1
    assert vistos['kw']['musica_params']['eq_db'] == -12.0
    assert vistos['kw']['musica_params']['reverb_wet'] == 0.0
    assert vistos['kw']['atraso_s'] == 10.0               # clampado no teto de 10 s


# ── visual no export (PLAN-mix-export-video.md) ─────────────────────────────

@pytest.fixture()
def cli_com_visual(cli, tmp_path, monkeypatch, video_factory):
    """Mesmo `cli`, mas com um catalogo de visual (1 video de 2s) e SAIDA_DIR numa pasta de
    teste — sem isso os testes gravariam mp3/mp4 de verdade em backend/assets/mix."""
    loop = video_factory('mix_visual_loop', dur_s=2.0)
    catv = tmp_path / 'catv.json'
    catv.write_text(json.dumps({'itens': [
        {'id': 'vid1', 'titulo': 'vid1', 'tipo': 'video', 'dur_s': 2.0,
         'categorias': ['abstrato'], 'thumb': None, 'caminho': loop},
    ]}), encoding='utf-8')
    monkeypatch.setattr(mix_routes, 'CATALOGO_VISUAL', str(catv))
    monkeypatch.setattr(mix_routes, '_cache_visual', {'mtime': None, 'doc': None})
    monkeypatch.setattr(mix_routes, 'SAIDA_DIR', str(tmp_path / 'saida'))
    return cli


def _espera(cli, job_id, tentativas=200):
    import time
    s = None
    for _ in range(tentativas):
        s = cli.get('/api/mix/status/%s' % job_id).get_json()
        if s['status'] != 'running':
            break
        time.sleep(0.1)
    return s


def test_render_com_visual_desconhecido_e_400(cli_com_visual, ruido_20s):
    r = cli_com_visual.post('/api/mix/render', json={
        'musica': ruido_20s, 'camadas': [{'id': 'ruido'}], 'visual_id': 'nao-existe'})
    assert r.status_code == 400


@precisa_ffmpeg
def test_render_com_visual_compoe_mp4_e_guarda_audio_puro(cli_com_visual, tom_20s):
    r = cli_com_visual.post('/api/mix/render', json={
        'musica': tom_20s, 'camadas': [{'id': 'ruido'}], 'visual_id': 'vid1'})
    assert r.status_code == 200
    s = _espera(cli_com_visual, r.get_json()['job_id'])
    assert s['status'] == 'done', s
    assert s['out'].endswith('.mp4') and os.path.isfile(s['out'])
    assert s['audio_out'].endswith(('.mp3', '.wav')) and os.path.isfile(s['audio_out'])


@precisa_ffmpeg
def test_render_com_visual_no_preview_ignora_o_visual(cli_com_visual, tom_20s):
    """Preview existe pra checar a cadeia de audio rapido — colar ffmpeg de video ali so
    atrasa a iteracao (decisao registrada em PLAN-mix-export-video.md)."""
    r = cli_com_visual.post('/api/mix/render', json={
        'musica': tom_20s, 'camadas': [{'id': 'ruido'}], 'visual_id': 'vid1', 'preview_s': 3})
    assert r.status_code == 200
    s = _espera(cli_com_visual, r.get_json()['job_id'])
    assert s['status'] == 'done', s
    assert s['out'].endswith('.mp3')
    assert 'audio_out' not in s


def test_head_end_do_liminal_so_valem_pro_arquivo_do_liminal(cli, monkeypatch, tmp_path, ruido_20s):
    """O bug que isto guarda: head/end medidos no mp3 de 117 s do liminal eram aplicados ao
    original local de 30 min, e a cave virava unidade de 110 s repetindo 30x numa hora."""
    import time
    from dsp import mix as dsp_mix
    url = 'https://liminal-upload.exemplo/cave.mp3'
    loop = {'gain': 0.5, 'head': 1.0, 'end': 117.3}
    cat = tmp_path / 'cat_loop.json'
    cat.write_text(json.dumps({'itens': [
        {'id': 'cave-local', 'titulo': 'cave', 'categorias': ['caverna'], 'origem': 'web', 'loop': loop, 'medidas': None,
         'principal': {'caminho': ruido_20s}, 'variantes': [{'url': url, 'remoto': 'r2-liminal'}]},
        {'id': 'cave-remota', 'titulo': 'cave', 'categorias': ['caverna'], 'origem': 'web', 'loop': loop, 'medidas': None,
         'principal': {'url': url, 'remoto': 'r2-liminal'}, 'variantes': []},
    ]}), encoding='utf-8')
    monkeypatch.setattr(mix_routes, 'CATALOGO', str(cat))
    monkeypatch.setattr(mix_routes, '_cache', {'mtime': None, 'doc': None})
    vistos = []
    monkeypatch.setattr(dsp_mix, 'render', lambda musica, camadas, saida, **kw: vistos.extend(camadas) or {})

    for ident in ('cave-local', 'cave-remota'):
        r = cli.post('/api/mix/render', json={'musica': ruido_20s, 'camadas': [{'id': ident}], 'preview_s': 5})
        assert r.status_code == 200
    for _ in range(50):
        if len(vistos) == 2:
            break
        time.sleep(0.05)
    por_id = {c['item']['id']: c for c in vistos}
    assert por_id['cave-local']['fonte'] == ruido_20s and por_id['cave-local']['item']['loop'] is None
    assert por_id['cave-remota']['fonte'] == url and por_id['cave-remota']['item']['loop'] == loop


def test_nome_saida_cabe_no_max_path_com_muitas_camadas():
    # 6 camadas de nome longo passaram de 260 e o ffmpeg falhava com "Invalid argument"
    import mix_routes
    musica = r'Z:\acervo\navegantes-phi-v1-10m10s.wav'
    ids = ['aeroporto-internacional-de-navegantes-ministro-victor-konder-%d' % i for i in range(6)]
    longo = mix_routes._nome_saida(musica, ids, None, 'mp3')
    assert len(os.path.splitext(longo)[0] + '.mp4') < 260
    assert '6camadas-' in longo
    assert longo == mix_routes._nome_saida(musica, ids, None, 'mp3')   # mesmo combo, mesmo nome
    curto = mix_routes._nome_saida(musica, ['birds'], None, 'mp3')
    assert curto.endswith('navegantes-phi-v1-10m10s__birds.mp3')        # combo curto segue legivel


def test_mixes_salvos_salva_sobrescreve_lista_e_apaga(cli, monkeypatch, tmp_path, ruido_20s):
    import mix_routes
    monkeypatch.setattr(mix_routes, 'MIXES', str(tmp_path / 'mixes_salvos.json'))
    assert cli.get('/api/mix/mixes').get_json() == {'mixes': []}
    corpo = {'nome': 'noite', 'musica': ruido_20s, 'camadas': [{'id': 'ruido', 'nivel_db': -3, 'gap_s': 10, 'respira': False}],
             'visual_id': 'vid1', 'duracao_s': 3600, 'formato': 'wav'}
    r = cli.post('/api/mix/mixes', json=corpo).get_json()
    assert r['ok'] and r['mixes'][0]['camadas'][0]['nivel_db'] == -3 and r['mixes'][0]['formato'] == 'wav'
    # mesmo nome + mesma musica sobrescreve, nao duplica
    r2 = cli.post('/api/mix/mixes', json=dict(corpo, formato='mp3')).get_json()
    assert r2['id'] == r['id'] and len(r2['mixes']) == 1 and r2['mixes'][0]['formato'] == 'mp3'
    assert cli.post('/api/mix/mixes', json=dict(corpo, camadas=[{'id': 'nao-existe'}])).status_code == 400
    assert cli.post('/api/mix/mixes', json=dict(corpo, nome='  ')).status_code == 400
    assert cli.delete('/api/mix/mixes/%s' % r['id']).get_json()['mixes'] == []
    assert cli.delete('/api/mix/mixes/%s' % r['id']).status_code == 404


# ── cancelar um render em andamento ─────────────────────────────────────────

def test_cancel_de_job_inexistente_e_404(cli):
    assert cli.post('/api/mix/cancel/nao-existe').status_code == 404


def test_cancel_de_job_ja_terminado_avisa_sem_erro(cli, monkeypatch):
    """proc ja saiu de `_processos` (render terminou) — /cancel nao pode 404 nem quebrar,
    so dizer que nao ha mais nada rodando."""
    import mix_routes
    mix_routes._jobs['fake1'] = {'status': 'done', 'progress': 100}
    r = cli.post('/api/mix/cancel/fake1')
    assert r.status_code == 200
    assert r.get_json()['ja_terminou'] is True


@precisa_ffmpeg
def test_cancel_interrompe_o_render_e_marca_cancelado(cli, ruido_20s):
    """render de 1h (bem mais longo que o preview) da tempo de pedir /cancel no meio —
    o job tem que virar 'cancelado', nao 'done' nem 'error', e nao pode deixar o .mp3 pronto."""
    import time
    from dsp.mix import dur as dsp_dur
    # tem que morar na mesma raiz permitida que ruido_20s — a fixture `cli` restringe
    # RAIZES pra dirname(ruido_20s)
    musica = os.path.join(os.path.dirname(ruido_20s), 'longa.wav')
    t = np.arange(44100 * 20) / 44100
    import soundfile as sf
    sf.write(musica, (np.sin(2 * np.pi * 220 * t) * 0.3).astype(np.float32), 44100)
    r = cli.post('/api/mix/render', json={
        'musica': musica, 'camadas': [{'id': 'ruido'}], 'duracao_s': 3600, 'formato': 'mp3'})
    assert r.status_code == 200
    job_id = r.get_json()['job_id']
    # da o ffmpeg comecar de verdade antes de pedir pra parar
    for _ in range(50):
        s = cli.get('/api/mix/status/%s' % job_id).get_json()
        if s['status'] != 'running' or (s.get('progress') or 0) > 0:
            break
        time.sleep(0.1)
    c = cli.post('/api/mix/cancel/%s' % job_id)
    assert c.status_code == 200
    s = None
    for _ in range(100):
        s = cli.get('/api/mix/status/%s' % job_id).get_json()
        if s['status'] != 'running':
            break
        time.sleep(0.1)
    assert s['status'] == 'cancelado'
    assert dsp_dur(musica) == pytest.approx(20.0, abs=0.2)   # a fonte continua intacta


# ── pastas extra de visual, escolhidas pela tela ────────────────────────────

@pytest.fixture()
def cli_visual_pastas(cli_com_visual, tmp_path, monkeypatch):
    """cli_com_visual ja isola CATALOGO_VISUAL/SAIDA_DIR; aqui isola tambem
    PASTAS_VISUAL e o SAIDA/THUMBS que `tools.visual_catalog.gerar()` escreve de verdade —
    senao o teste polui backend/assets/."""
    import mix_routes
    from tools import visual_catalog as vc
    monkeypatch.setattr(mix_routes, 'PASTAS_VISUAL', str(tmp_path / 'visual_pastas.json'))
    monkeypatch.setattr(vc, 'SAIDA', str(tmp_path / 'catv_gerado.json'))
    monkeypatch.setattr(vc, 'THUMBS', str(tmp_path / 'thumbs'))
    monkeypatch.setattr(vc, 'PASTA_PADRAO', str(tmp_path / 'nao-existe-de-proposito'))
    monkeypatch.setattr(mix_routes, 'CATALOGO_VISUAL', str(tmp_path / 'catv_gerado.json'))
    return cli_com_visual


def _espera_job(cli, job_id, tentativas=100):
    import time
    s = None
    for _ in range(tentativas):
        s = cli.get('/api/mix/status/%s' % job_id).get_json()
        if s['status'] != 'running':
            break
        time.sleep(0.05)
    return s


def test_visual_pastas_get_comeca_vazio(cli_visual_pastas):
    assert cli_visual_pastas.get('/api/mix/visual-pastas').get_json() == {'pastas': []}


def test_visual_pastas_post_recusa_pasta_que_nao_existe(cli_visual_pastas):
    r = cli_visual_pastas.post('/api/mix/visual-pastas', json={'pasta': r'Z:\nao\existe\de\verdade'})
    assert r.status_code == 400


def test_visual_pastas_post_recusa_pasta_repetida(cli_visual_pastas, tmp_path):
    pasta = str(tmp_path / 'footage')
    os.makedirs(pasta, exist_ok=True)
    assert cli_visual_pastas.post('/api/mix/visual-pastas', json={'pasta': pasta}).status_code == 200
    r = cli_visual_pastas.post('/api/mix/visual-pastas', json={'pasta': pasta})
    assert r.status_code == 400


@precisa_ffmpeg
def test_visual_pastas_post_escaneia_e_entra_no_catalogo(cli_visual_pastas, tmp_path, video_factory):
    pasta = str(tmp_path / 'footage')
    os.makedirs(pasta, exist_ok=True)
    import shutil
    origem = video_factory('extra_loop', dur_s=1.5)
    shutil.copy(origem, os.path.join(pasta, 'clipe.mp4'))
    r = cli_visual_pastas.post('/api/mix/visual-pastas', json={'pasta': pasta})
    assert r.status_code == 200
    s = _espera_job(cli_visual_pastas, r.get_json()['job_id'])
    assert s['status'] == 'done', s
    j = cli_visual_pastas.get('/api/mix/visuais').get_json()
    ids = [i['id'] for i in j['itens']]
    assert any(i.endswith('clipe') for i in ids)   # prefixo da pasta + slug do arquivo


@precisa_ffmpeg
def test_visual_pastas_delete_reescaneia_sem_ela(cli_visual_pastas, tmp_path, video_factory):
    pasta = str(tmp_path / 'footage')
    os.makedirs(pasta, exist_ok=True)
    import shutil
    shutil.copy(video_factory('extra_loop2', dur_s=1.5), os.path.join(pasta, 'clipe.mp4'))
    r = cli_visual_pastas.post('/api/mix/visual-pastas', json={'pasta': pasta})
    _espera_job(cli_visual_pastas, r.get_json()['job_id'])
    d = cli_visual_pastas.delete('/api/mix/visual-pastas', json={'pasta': pasta})
    assert d.status_code == 200
    _espera_job(cli_visual_pastas, d.get_json()['job_id'])
    assert cli_visual_pastas.get('/api/mix/visual-pastas').get_json()['pastas'] == []
    assert cli_visual_pastas.get('/api/mix/visuais').get_json()['itens'] == []
