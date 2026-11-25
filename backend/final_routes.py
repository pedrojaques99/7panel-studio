"""Rota /final: mesa de arranjo (trilhas + clipes + piano roll) que junta era5 e era6.

Plano em `Jacão Ambients/PLANO-final.md`. O áudio é servido pelo /api/mix/file (a raiz
JACAO já é permitida lá); aqui só se lista o acervo, guarda projeto e grava o export.

  GET    /api/final/biblioteca         áudio e .mid de era5/era6/final, por grupo
  GET    /api/final/projetos           projetos salvos, mais recente primeiro (sem as trilhas)
  GET    /api/final/projetos/<id>      um projeto inteiro
  POST   /api/final/projetos           {id, nome, ...} — mesmo id sobrescreve
  DELETE /api/final/projetos/<id>
  POST   /api/final/salvar             multipart {audio: wav, projeto: json, nome, dur_s}
                                       → final/<nome>-v<k>-<Mm SSs>.wav (+ .json)
  POST   /api/final/gravacao           multipart {audio: wav, nome} → final/_gravacoes/<nome>-<data>.wav
                                       (o REC do microfone vira arquivo pra o clipe apontar)
"""
import json, os, re
from datetime import datetime

from flask import Blueprint, jsonify, request

from mix_routes import duracao_s

bp = Blueprint('final', __name__)

JACAO = os.environ.get('JACAO_AMBIENTS_DIR', r'Z:\jaques.dsgn\sfx_music\Jacão Ambients')
FINAL = os.path.join(JACAO, 'final')
PROJETOS = os.path.join(FINAL, '_projetos')
GRAVACOES = os.path.join(FINAL, '_gravacoes')

AUDIO = ('.wav', '.mp3', '.flac', '.ogg', '.m4a')
MIDI = ('.mid', '.midi')

# (grupo, pasta). Só o nível de cima de cada pasta: o resto da era é rascunho.
FONTES = [
    ('era5', ('era 5',)),
    ('era5 · melodia', ('era 5', '_melodia')),
    ('era5 · 1h', ('era 5', '1h')),
    ('era6', ('era6',)),
    ('era6 · banco', ('era6', '_banco')),
    ('final', ('final',)),
    ('final · gravações', ('final', '_gravacoes')),
]


def fontes():
    return [(g, os.path.join(JACAO, *partes)) for g, partes in FONTES]


@bp.route('/api/final/biblioteca', methods=['GET'])
def final_biblioteca():
    out = []
    for grupo, pasta in fontes():
        if not os.path.isdir(pasta):
            continue
        for f in sorted(os.listdir(pasta), key=str.lower):
            p = os.path.join(pasta, f)
            ext = os.path.splitext(f)[1].lower()
            if not os.path.isfile(p) or ext not in AUDIO + MIDI:
                continue
            out.append(dict(grupo=grupo, nome=os.path.splitext(f)[0], caminho=p,
                            tipo='midi' if ext in MIDI else 'audio',
                            dur_s=duracao_s(p) if ext in AUDIO else None,
                            mb=round(os.path.getsize(p) / 1048576, 1)))
    return jsonify({'itens': out})


def _slug(s, padrao='faixa'):
    return re.sub(r'[^\w\-]+', '-', (s or padrao).lower(), flags=re.UNICODE).strip('-')[:60] or padrao


def _caminho_projeto(ident):
    return os.path.join(PROJETOS, _slug(ident, 'projeto') + '.json')


@bp.route('/api/final/projetos', methods=['GET'])
def final_projetos():
    if not os.path.isdir(PROJETOS):
        return jsonify({'projetos': []})
    out = []
    for f in os.listdir(PROJETOS):
        if not f.endswith('.json'):
            continue
        p = os.path.join(PROJETOS, f)
        try:
            with open(p, encoding='utf-8') as fh:
                doc = json.load(fh)
        except (OSError, ValueError):
            continue
        out.append({'id': doc.get('id', f[:-5]), 'nome': doc.get('nome', f[:-5]),
                    'trilhas': len(doc.get('trilhas', [])),
                    'modificado': datetime.fromtimestamp(os.path.getmtime(p)).isoformat(timespec='seconds')})
    out.sort(key=lambda d: d['modificado'], reverse=True)
    return jsonify({'projetos': out})


@bp.route('/api/final/projetos/<path:ident>', methods=['GET'])
def final_projeto(ident):
    p = _caminho_projeto(ident)
    if not os.path.exists(p):
        return jsonify({'error': 'projeto não existe'}), 404
    with open(p, encoding='utf-8') as f:
        return jsonify(json.load(f))


@bp.route('/api/final/projetos', methods=['POST'])
def final_projeto_salvar():
    doc = request.get_json(force=True) or {}
    if not doc.get('id') or not isinstance(doc.get('trilhas'), list):
        return jsonify({'error': 'projeto sem id ou trilhas'}), 400
    os.makedirs(PROJETOS, exist_ok=True)
    p = _caminho_projeto(doc['id'])
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)
    return jsonify({'ok': True, 'id': doc['id']})


@bp.route('/api/final/projetos/<path:ident>', methods=['DELETE'])
def final_projeto_apagar(ident):
    p = _caminho_projeto(ident)
    if not os.path.exists(p):
        return jsonify({'error': 'projeto não existe'}), 404
    os.remove(p)
    return jsonify({'ok': True})


@bp.route('/api/final/salvar', methods=['POST'])
def final_salvar():
    audio = request.files.get('audio')
    if not audio:
        return jsonify({'error': 'sem audio'}), 400
    arq = request.files.get('projeto')
    projeto = json.loads(arq.read().decode('utf-8')) if arq else {}
    nome = _slug(request.form.get('nome') or projeto.get('nome'))
    dur = float(request.form.get('dur_s') or 0)
    os.makedirs(FINAL, exist_ok=True)
    # versão k = próxima livre pra esse nome (convenção da casa: <nome>-v<k>-<Mm SSs>.wav)
    ks = [int(m.group(1)) for f in os.listdir(FINAL) if (m := re.match(rf'{re.escape(nome)}-v(\d+)-', f))]
    k = max(ks, default=0) + 1
    base = f'{nome}-v{k}-{int(dur // 60)}m {int(dur % 60):02d}s'
    wav = os.path.join(FINAL, base + '.wav')
    audio.save(wav)
    with open(os.path.join(FINAL, base + '.json'), 'w', encoding='utf-8') as f:
        json.dump(projeto, f, ensure_ascii=False, indent=1)
    return jsonify({'ok': True, 'wav': wav, 'nome': base})


@bp.route('/api/final/gravacao', methods=['POST'])
def final_gravacao():
    audio = request.files.get('audio')
    if not audio:
        return jsonify({'error': 'sem audio'}), 400
    os.makedirs(GRAVACOES, exist_ok=True)
    base = f"{_slug(request.form.get('nome'), 'rec')}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    caminho = os.path.join(GRAVACOES, base + '.wav')
    k = 1
    while os.path.exists(caminho):
        k += 1
        caminho = os.path.join(GRAVACOES, f'{base}-{k}.wav')
    audio.save(caminho)
    return jsonify({'ok': True, 'caminho': caminho})
