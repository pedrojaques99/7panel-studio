"""Rota /mix: musica por baixo, ate duas ambiencias por cima, visual do loop de 1h, preview e render.

Contrato e decisoes em `keyboard-ui/PLAN-rota-ambiente.md` e `PLAN-mix-export-video.md`
(export com visual). Blueprint em arquivo proprio pra nao engordar o dashboard_server.py;
o DSP mora em `dsp/mix.py` (audio) e `dsp/video.py` (mux do visual escolhido).

  GET  /api/mix/catalog          resumo do ambients_catalog.json (+ avisos de voz/evento)
  GET  /api/mix/musicas          audios das pastas de musica do acervo, por grupo
  GET  /api/mix/file?id=|path=   serve ambiencia (por id do catalogo) ou arquivo permitido
  POST /api/mix/render           job; `preview_s` renderiza so um trecho com a mesma cadeia.
                                  `visual_id` (so fora do preview) compoe um .mp4 irmao do
                                  audio (job.out vira o .mp4, job.audio_out guarda o audio puro)
  GET  /api/mix/status/<id>
  GET  /api/mix/visuais          catalogo de video/imagem pra render de 1h (visual_catalog.json)
  GET  /api/mix/visual-pick?musica=   video escolhido pra essa musica (visual_picks.json)
  POST /api/mix/visual-pick      {musica, visual_id} — grava a escolha
  GET  /api/mix/camada-pick?musica=   ultimo combo de camadas salvo pra essa musica (camada_picks.json)
  POST /api/mix/camada-pick      {musica, camadas} — grava o combo; camadas=[] apaga
"""
import json, os, threading, uuid
from datetime import datetime

from flask import Blueprint, jsonify, redirect, request, send_file

bp = Blueprint('mix', __name__)

AQUI = os.path.dirname(os.path.abspath(__file__))
CATALOGO = os.path.join(AQUI, 'assets', 'ambients_catalog.json')
CATALOGO_VISUAL = os.path.join(AQUI, 'assets', 'visual_catalog.json')
ESCOLHAS_VISUAL = os.path.join(AQUI, 'assets', 'visual_picks.json')
ESCOLHAS_CAMADA = os.path.join(AQUI, 'assets', 'camada_picks.json')   # ultimo combo por musica
USO_CAMADA = os.path.join(AQUI, 'assets', 'camada_uso.json')          # contagem por ambiencia, so em export real
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
        '.ogg': 'audio/ogg', '.webm': 'audio/webm', '.opus': 'audio/ogg', '.aac': 'audio/aac',
        '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png'}


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
_cache_visual = {'mtime': None, 'doc': None}


def catalogo():
    """Relido quando o JSON muda: rodar o ambient_catalog.py de novo nao pede restart."""
    m = os.path.getmtime(CATALOGO)
    if _cache['mtime'] != m:
        with open(CATALOGO, encoding='utf-8') as f:
            _cache.update(mtime=m, doc=json.load(f))
    return _cache['doc']


def catalogo_visual():
    """Mesmo esquema: rodar visual_catalog.py de novo nao pede restart."""
    m = os.path.getmtime(CATALOGO_VISUAL)
    if _cache_visual['mtime'] != m:
        with open(CATALOGO_VISUAL, encoding='utf-8') as f:
            _cache_visual.update(mtime=m, doc=json.load(f))
    return _cache_visual['doc']


def escolhas_visual():
    if not os.path.isfile(ESCOLHAS_VISUAL):
        return {}
    with open(ESCOLHAS_VISUAL, encoding='utf-8') as f:
        return json.load(f)


def grava_escolha_visual(musica, visual_id):
    d = escolhas_visual()
    d[musica] = visual_id
    os.makedirs(os.path.dirname(ESCOLHAS_VISUAL), exist_ok=True)
    with open(ESCOLHAS_VISUAL, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def _le_json(caminho):
    if not os.path.isfile(caminho):
        return {}
    with open(caminho, encoding='utf-8') as f:
        return json.load(f)


def _grava_json(caminho, doc):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)


def uso_camadas():
    return _le_json(USO_CAMADA)


def registra_uso(ids):
    """Chamado só no export de verdade (não no preview de 30s) — é o sinal de combo bom."""
    d = uso_camadas()
    for i in ids:
        d[i] = d.get(i, 0) + 1
    _grava_json(USO_CAMADA, d)


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


def resumo(item, uso=None):
    from dsp.mix import avisos_fixos
    p = item['principal']
    return dict(id=item['id'], titulo=item['titulo'], categorias=item['categorias'],
                origem=item['origem'], dur_s=p.get('dur_s'), lufs=p.get('lufs'),
                local=bool(p.get('caminho')), loop=bool(item.get('loop')), avisos=avisos_fixos(item),
                uso=(uso or {}).get(item['id'], 0))


@bp.route('/api/mix/catalog', methods=['GET'])
def mix_catalog():
    try:
        doc = catalogo()
    except FileNotFoundError:
        return jsonify({'error': 'catalogo nao gerado: rode python backend/tools/ambient_catalog.py'}), 404
    uso = uso_camadas()
    return jsonify({'gerado_em': doc.get('gerado_em'), 'itens': [resumo(i, uso) for i in doc['itens']]})


_cache_dur = {}   # caminho -> (mtime, dur_s) — soundfile.info le so o cabecalho, mas 300+
                  # arquivo por load ainda soma; cacheado por mtime nao pede reler de novo


def duracao_s(caminho):
    try:
        m = os.path.getmtime(caminho)
    except OSError:
        return None
    hit = _cache_dur.get(caminho)
    if hit and hit[0] == m:
        return hit[1]
    dur = None
    try:
        import soundfile as sf
        info = sf.info(caminho)
        dur = round(info.frames / info.samplerate, 1) if info.samplerate else None
    except Exception:
        dur = None
    _cache_dur[caminho] = (m, dur)
    return dur


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
                                mb=round(os.path.getsize(p) / 1048576, 1),
                                dur_s=duracao_s(p),
                                modificado=datetime.fromtimestamp(os.path.getmtime(p)).strftime('%Y-%m-%d')))
    return jsonify({'musicas': out})


@bp.route('/api/mix/file', methods=['GET'])
def mix_file():
    path = request.args.get('path', '')
    ident = request.args.get('id')
    visual_id = request.args.get('visual')
    if ident:
        item = next((i for i in catalogo()['itens'] if i['id'] == ident), None)
        if not item:
            return jsonify({'error': 'ambiencia desconhecida'}), 404
        path = fonte_do_item(item) or ''
        if path.startswith('http'):
            return redirect(path)
    elif visual_id:
        item = next((i for i in catalogo_visual()['itens'] if i['id'] == visual_id), None)
        if not item:
            return jsonify({'error': 'visual desconhecido'}), 404
        path = item['caminho']
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

    from dsp.mix import MAX_CAMADAS

    pedidas = b.get('camadas') or []
    if not 1 <= len(pedidas) <= MAX_CAMADAS:
        return jsonify({'error': 'escolha de 1 a %d ambiencias' % MAX_CAMADAS}), 400
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
            # -60: o fader do preview tambem vai ate la, pra camada ficar de fato muda
            nivel = max(-60.0, min(24.0, float(c.get('nivel_db') or 0.0)))
            gap = max(0.0, min(120.0, float(c.get('gap_s') or 0.0)))
        except (TypeError, ValueError):
            return jsonify({'error': 'nivel_db ou gap_s invalido'}), 400
        camadas.append(dict(item=item, fonte=fonte, nivel_db=nivel, respira=bool(c.get('respira', True)),
                            gap_s=gap))

    try:
        preview_s = float(b['preview_s']) if b.get('preview_s') else None
        duracao_s = float(b['duracao_s']) if b.get('duracao_s') else None
    except (TypeError, ValueError):
        return jsonify({'error': 'duracao invalida'}), 400
    if duracao_s and not 0 < duracao_s <= DURACAO_MAX_S:
        return jsonify({'error': 'duracao entre 0 e 4 h'}), 400

    # visual so entra no export de verdade — o preview de 30s existe pra checar a cadeia de
    # audio rapido, colar ffmpeg de video ali so atrasa a iteracao (ver PLAN-mix-export-video.md)
    visual_item = None
    visual_id = (b.get('visual_id') or '').strip()
    if visual_id and not preview_s:
        visual_item = next((i for i in catalogo_visual()['itens'] if i['id'] == visual_id), None)
        if not visual_item:
            return jsonify({'error': 'visual desconhecido: %s' % visual_id}), 400

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
            if visual_item:
                from dsp.video import compor_video
                job.update(progress=99, compondo=True)
                saida_video = os.path.splitext(saida)[0] + '.mp4'
                compor_video(saida, visual_item, saida_video)
                job.update(out=saida_video, audio_out=saida, compondo=False)
            job.update(status='done', progress=100)
            if not preview_s:   # só o export de verdade conta como "esse combo funcionou"
                registra_uso([c['item']['id'] for c in camadas])
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


def resumo_visual(item):
    thumb = ('/api/mix/file?path=' + item['thumb']) if item.get('thumb') else None
    return dict(id=item['id'], titulo=item['titulo'], tipo=item['tipo'], dur_s=item.get('dur_s'),
                categorias=item['categorias'], thumb=thumb)


@bp.route('/api/mix/visuais', methods=['GET'])
def mix_visuais():
    try:
        doc = catalogo_visual()
    except FileNotFoundError:
        return jsonify({'error': 'catalogo visual nao gerado: rode python backend/tools/visual_catalog.py'}), 404
    return jsonify({'gerado_em': doc.get('gerado_em'), 'itens': [resumo_visual(i) for i in doc['itens']]})


@bp.route('/api/mix/visual-pick', methods=['GET'])
def mix_visual_pick_get():
    musica = request.args.get('musica', '')
    return jsonify({'visual_id': escolhas_visual().get(musica)})


@bp.route('/api/mix/visual-pick', methods=['POST'])
def mix_visual_pick_post():
    b = request.get_json(silent=True) or {}
    musica = (b.get('musica') or '').strip()
    visual_id = (b.get('visual_id') or '').strip()
    if not musica:
        return jsonify({'error': 'musica obrigatoria'}), 400
    if visual_id:
        itens = {i['id'] for i in catalogo_visual()['itens']}
        if visual_id not in itens:
            return jsonify({'error': 'visual desconhecido: %s' % visual_id}), 400
    grava_escolha_visual(musica, visual_id or None)
    return jsonify({'ok': True, 'musica': musica, 'visual_id': visual_id or None})


@bp.route('/api/mix/camada-pick', methods=['GET'])
def mix_camada_pick_get():
    musica = request.args.get('musica', '')
    return jsonify({'camadas': _le_json(ESCOLHAS_CAMADA).get(musica) or []})


@bp.route('/api/mix/camada-pick', methods=['POST'])
def mix_camada_pick_post():
    b = request.get_json(silent=True) or {}
    musica = (b.get('musica') or '').strip()
    if not musica:
        return jsonify({'error': 'musica obrigatoria'}), 400
    camadas = b.get('camadas') or []
    itens = {i['id'] for i in catalogo()['itens']}
    for c in camadas:
        if c.get('id') not in itens:
            return jsonify({'error': 'ambiencia desconhecida: %s' % c.get('id')}), 400
    d = _le_json(ESCOLHAS_CAMADA)
    if camadas:
        d[musica] = camadas
    else:
        d.pop(musica, None)
    _grava_json(ESCOLHAS_CAMADA, d)
    return jsonify({'ok': True, 'musica': musica, 'camadas': camadas})
