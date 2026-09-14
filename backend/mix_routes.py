"""Rota /mix: musica por baixo, ate duas ambiencias por cima, preview e render.

Contrato e decisoes em `keyboard-ui/PLAN-rota-ambiente.md`. Blueprint em arquivo proprio pra
nao engordar o dashboard_server.py; o DSP mora em `dsp/mix.py`.

  GET  /api/mix/catalog         resumo do ambients_catalog.json (+ avisos de voz/evento)
  GET  /api/mix/musicas         audios das pastas de musica do acervo, por grupo
  GET  /api/mix/file?id=|path=  serve ambiencia (por id do catalogo) ou arquivo permitido
  POST /api/mix/render          job; `preview_s` renderiza so um trecho com a mesma cadeia
  GET  /api/mix/status/<id>
"""
import os, threading, uuid

from flask import Blueprint, jsonify, redirect, request, send_file

bp = Blueprint('mix', __name__)

AQUI = os.path.dirname(os.path.abspath(__file__))
CATALOGO = os.path.join(AQUI, 'assets', 'ambients_catalog.json')
SAIDA_DIR = os.path.join(AQUI, 'assets', 'mix')
JACAO = os.environ.get('JACAO_AMBIENTS_DIR', r'Z:\jaques.dsgn\sfx_music\Jacão Ambients')

# (grupo, pasta, extensoes). Pasta de MUSICA: ambiencia crua nao entra aqui, entra pelo catalogo.
FONTES_MUSICA = [
    ('era3', os.path.join(JACAO, 'era3'), ('.wav',)),
    ('era3 · stretch 1h', os.path.join(JACAO, 'era3', 'stretch', '1h'), ('.mp3',)),
    ('era eno 2', os.path.join(JACAO, 'era - eno 2'), ('.mp3', '.wav')),
    ('mixes 1h', os.path.join(JACAO, '_prod', '_mixes'), ('.mp3',)),
    ('singles', os.path.join(JACAO, 'singles - jaques'), ('.mp3', '.wav')),
    ('pre-eno', os.path.join(JACAO, 'pre-eno'), ('.mp3', '.wav')),
    ('suno', os.path.join(JACAO, 'suno'), ('.mp3', '.wav')),
]

MIME = {'.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
        '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.opus': 'audio/ogg', '.aac': 'audio/aac'}


def _norm(p):
    return os.path.normcase(os.path.abspath(p))


# O /file serve arquivo do disco: so dentro das raizes de onde musica e ambiencia vem.
RAIZES = [_norm(r) for r in (
    JACAO, os.path.join(AQUI, 'assets'),
    r'Z:\Cursor\auto-video-editor-ai\scripts\.render-assets',
    r'Z:\Cursor\liminal-stage\public\audio',
)]


def permitido(path):
    n = _norm(path)
    return any(n == r or n.startswith(r + os.sep) for r in RAIZES)


_cache = {'mtime': None, 'doc': None}


def catalogo():
    """Relido quando o JSON muda: rodar o ambient_catalog.py de novo nao pede restart."""
    m = os.path.getmtime(CATALOGO)
    if _cache['mtime'] != m:
        import json
        with open(CATALOGO, encoding='utf-8') as f:
            _cache.update(mtime=m, doc=json.load(f))
    return _cache['doc']


def fonte_do_item(item):
    """Arquivo local que existe primeiro (qualquer variante); URL remota so se nao houver."""
    variantes = [item['principal'], *item.get('variantes', [])]
    for v in variantes:
        if v.get('caminho') and os.path.isfile(v['caminho']):
            return v['caminho']
    for v in variantes:
        if v.get('url'):
            return v['url']
    return None


def resumo(item):
    from dsp.mix import avisos_fixos
    p = item['principal']
    return dict(id=item['id'], titulo=item['titulo'], categorias=item['categorias'],
                origem=item['origem'], dur_s=p.get('dur_s'), lufs=p.get('lufs'),
                local=bool(p.get('caminho')), loop=bool(item.get('loop')), avisos=avisos_fixos(item))


@bp.route('/api/mix/catalog', methods=['GET'])
def mix_catalog():
    try:
        doc = catalogo()
    except FileNotFoundError:
        return jsonify({'error': 'catalogo nao gerado: rode python backend/tools/ambient_catalog.py'}), 404
    return jsonify({'gerado_em': doc.get('gerado_em'), 'itens': [resumo(i) for i in doc['itens']]})


@bp.route('/api/mix/musicas', methods=['GET'])
def mix_musicas():
    out = []
    for grupo, pasta, exts in FONTES_MUSICA:
        if not os.path.isdir(pasta):
            continue
        for f in sorted(os.listdir(pasta), key=str.lower):
            p = os.path.join(pasta, f)
            if os.path.isfile(p) and os.path.splitext(f)[1].lower() in exts:
                out.append(dict(grupo=grupo, nome=os.path.splitext(f)[0], caminho=p,
                                mb=round(os.path.getsize(p) / 1048576, 1)))
    return jsonify({'musicas': out})


@bp.route('/api/mix/file', methods=['GET'])
def mix_file():
    path = request.args.get('path', '')
    ident = request.args.get('id')
    if ident:
        item = next((i for i in catalogo()['itens'] if i['id'] == ident), None)
        if not item:
            return jsonify({'error': 'ambiencia desconhecida'}), 404
        path = fonte_do_item(item) or ''
        if path.startswith('http'):
            return redirect(path)
    if not path or not os.path.isfile(path):
        return jsonify({'error': 'not found'}), 404
    if not permitido(path):
        return jsonify({'error': 'forbidden'}), 403
    # conditional=True responde Range: sem isso o <audio> nao consegue pular pro meio
    resp = send_file(path, mimetype=MIME.get(os.path.splitext(path)[1].lower(), 'application/octet-stream'),
                     conditional=True)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


_jobs = {}
DURACAO_MAX_S = 4 * 3600


def _nome_saida(musica, ids, duracao_s, formato):
    base = os.path.splitext(os.path.basename(musica))[0]
    sufixo = '' if not duracao_s else ('__%gh' % round(duracao_s / 3600, 2))
    return os.path.join(SAIDA_DIR, '%s__%s%s.%s' % (base, '+'.join(ids), sufixo, formato))


@bp.route('/api/mix/render', methods=['POST'])
def mix_render():
    from dsp.mix import render

    b = request.get_json(silent=True) or {}
    musica = (b.get('musica') or '').strip()
    if not musica or not os.path.isfile(musica):
        return jsonify({'error': 'musica nao encontrada'}), 404
    if not permitido(musica):
        return jsonify({'error': 'forbidden'}), 403

    pedidas = b.get('camadas') or []
    if not 1 <= len(pedidas) <= 2:
        return jsonify({'error': 'escolha 1 ou 2 ambiencias'}), 400
    itens = {i['id']: i for i in catalogo()['itens']}
    camadas = []
    for c in pedidas:
        item = itens.get(c.get('id'))
        if not item:
            return jsonify({'error': 'ambiencia desconhecida: %s' % c.get('id')}), 400
        fonte = fonte_do_item(item)
        if not fonte:
            return jsonify({'error': 'ambiencia sem arquivo nem url: %s' % item['id']}), 400
        # head/end foram medidos no arquivo do LIMINAL (mono, <=120 s). Aplicados ao original
        # local de 30 min, cortavam a cama em 2 min e multiplicavam a repeticao. So valem
        # quando a fonte usada e aquela mesma variante.
        liminal = {v.get('url') for v in [item['principal'], *item.get('variantes', [])]
                   if v.get('remoto') == 'r2-liminal'}
        if fonte not in liminal:
            item = dict(item, loop=None)
        try:
            nivel = max(-24.0, min(24.0, float(c.get('nivel_db') or 0.0)))
        except (TypeError, ValueError):
            return jsonify({'error': 'nivel_db invalido'}), 400
        camadas.append(dict(item=item, fonte=fonte, nivel_db=nivel, respira=bool(c.get('respira', True))))

    try:
        preview_s = float(b['preview_s']) if b.get('preview_s') else None
        duracao_s = float(b['duracao_s']) if b.get('duracao_s') else None
    except (TypeError, ValueError):
        return jsonify({'error': 'duracao invalida'}), 400
    if duracao_s and not 0 < duracao_s <= DURACAO_MAX_S:
        return jsonify({'error': 'duracao entre 0 e 4 h'}), 400

    job_id = uuid.uuid4().hex[:12]
    if preview_s:
        formato, saida = 'mp3', os.path.join(SAIDA_DIR, '_preview', job_id + '.mp3')
    else:
        formato = 'wav' if b.get('formato') == 'wav' else 'mp3'
        saida = _nome_saida(musica, [c['item']['id'] for c in camadas], duracao_s, formato)
    job = _jobs[job_id] = {'status': 'running', 'progress': 0, 'out': saida, 'preview': bool(preview_s)}

    def correr():
        try:
            job.update(render(musica, camadas, saida, duracao_s=duracao_s, formato=formato,
                              preview_s=preview_s, progresso=lambda p: job.update(progress=round(p, 1))))
            job.update(status='done', progress=100)
        except Exception as e:
            job.update(status='error', error=str(e))

    threading.Thread(target=correr, daemon=True).start()
    return jsonify({'job_id': job_id, **job})


@bp.route('/api/mix/status/<job_id>', methods=['GET'])
def mix_status(job_id):
    job = _jobs.get(job_id)
    if not job:
        return jsonify({'error': 'job not found'}), 404
    return jsonify(job)
