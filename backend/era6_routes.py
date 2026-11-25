"""Rota /era6: banco de samples da mesa granular e gravação das sessões.

Plano em `Jacão Ambients/era6/PLANO-era6.md`. O banco é montado offline por
`era6/_ferramentas/preparar_banco.py`; aqui só se lê o banco.json e se grava a saída.
Os wavs do banco são servidos pelo /api/mix/file (a raiz JACAO já é permitida lá).

  GET  /api/era6/banco            itens do banco (sem os marcados como apito; ?todos=1 inclui)
  POST /api/era6/salvar           multipart {audio: wav, sessao: json, nome, capa?: png, cicatriz?: png}
                                  → era6/<nome>-v<k>-<Mm SSs>.wav (+ .capa.png, .cicatriz.png)
  GET  /api/era6/sessoes          sessões gravadas, mais recente primeiro
  GET  /api/era6/presets          presets salvos da mesa (os de fábrica moram no front)
  POST /api/era6/presets          {nome, ...estado} — mesmo nome sobrescreve
  DELETE /api/era6/presets/<nome>
"""
import json, os, re

from flask import Blueprint, jsonify, request

bp = Blueprint('era6', __name__)

JACAO = os.environ.get('JACAO_AMBIENTS_DIR', r'Z:\jaques.dsgn\sfx_music\Jacão Ambients')
ERA6 = os.path.join(JACAO, 'era6')
BANCO_JSON = os.path.join(ERA6, '_banco', 'banco.json')
PRESETS_JSON = os.path.join(ERA6, '_presets.json')

_cache = {'mtime': None, 'itens': []}


def _banco():
    if not os.path.exists(BANCO_JSON):
        return []
    m = os.path.getmtime(BANCO_JSON)
    if _cache['mtime'] != m:
        with open(BANCO_JSON, encoding='utf-8') as f:
            _cache['itens'] = json.load(f).get('itens', [])
        _cache['mtime'] = m
    return _cache['itens']


@bp.route('/api/era6/banco', methods=['GET'])
def era6_banco():
    todos = request.args.get('todos') == '1'
    itens = [i for i in _banco() if todos or not i.get('apito')]
    return jsonify({'itens': itens, 'total': len(_banco()), 'existe': os.path.exists(BANCO_JSON)})


def _slug(s):
    return re.sub(r'[^\w\-]+', '-', (s or 'sessao').lower(), flags=re.UNICODE).strip('-')[:60] or 'sessao'


@bp.route('/api/era6/salvar', methods=['POST'])
def era6_salvar():
    audio = request.files.get('audio')
    if not audio:
        return jsonify({'error': 'sem audio'}), 400
    # a sessão vem como arquivo: campo de texto passa de 500 KB numa take longa e o
    # Werkzeug 3.1 recusa com 413 (max_form_memory_size). Texto fica aceito pra take antiga
    arq = request.files.get('sessao')
    sessao = json.loads(arq.read().decode('utf-8') if arq else (request.form.get('sessao') or '{}'))
    nome = _slug(request.form.get('nome'))
    dur = float(request.form.get('dur_s') or sessao.get('dur_s') or 0)
    os.makedirs(ERA6, exist_ok=True)
    # versão k = próxima livre pra esse nome (convenção da casa: <nome>-v<k>-<Mm SSs>.wav)
    ks = [int(m.group(1)) for f in os.listdir(ERA6) if (m := re.match(rf'{re.escape(nome)}-v(\d+)-', f))]
    k = max(ks, default=0) + 1
    base = f'{nome}-v{k}-{int(dur // 60)}m {int(dur % 60):02d}s'
    wav = os.path.join(ERA6, base + '.wav')
    audio.save(wav)
    # a partitura pintada (PLANO-visual-era6.md) mora ao lado do áudio
    for campo in ('capa', 'cicatriz'):
        f = request.files.get(campo)
        if f:
            f.save(os.path.join(ERA6, f'{base}.{campo}.png'))
    # fontes.json: licença de cada sample usado, pra checar antes de lançar
    banco = {i['id']: i for i in _banco()}
    fontes = [{'id': s, 'licenca': banco.get(s, {}).get('licenca', '?'), 'origem': banco.get(s, {}).get('origem')}
              for s in sorted(set(sessao.get('samples', [])))]
    sessao['fontes'] = fontes
    with open(os.path.join(ERA6, base + '.json'), 'w', encoding='utf-8') as f:
        json.dump(sessao, f, ensure_ascii=False, indent=1)
    return jsonify({'ok': True, 'wav': wav, 'nome': base,
                    'avisos': [f['id'] for f in fontes if f['licenca'].startswith('⚠')]})


@bp.route('/api/era6/sessoes', methods=['GET'])
def era6_sessoes():
    if not os.path.isdir(ERA6):
        return jsonify({'sessoes': []})
    wavs = [f for f in os.listdir(ERA6) if f.endswith('.wav')]
    wavs.sort(key=lambda f: os.path.getmtime(os.path.join(ERA6, f)), reverse=True)
    return jsonify({'sessoes': [{'nome': f[:-4], 'caminho': os.path.join(ERA6, f),
                                 'tem_json': os.path.exists(os.path.join(ERA6, f[:-4] + '.json'))} for f in wavs]})


def _presets():
    if not os.path.exists(PRESETS_JSON):
        return {}
    with open(PRESETS_JSON, encoding='utf-8') as f:
        return json.load(f)


def _grava_presets(doc):
    os.makedirs(ERA6, exist_ok=True)
    tmp = PRESETS_JSON + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    os.replace(tmp, PRESETS_JSON)


@bp.route('/api/era6/presets', methods=['GET'])
def era6_presets():
    return jsonify({'presets': list(_presets().values())})


@bp.route('/api/era6/presets', methods=['POST'])
def era6_preset_salvar():
    p = request.get_json(force=True) or {}
    nome = (p.get('nome') or '').strip()
    if not nome:
        return jsonify({'error': 'preset sem nome'}), 400
    p.pop('fabrica', None)
    doc = _presets()
    doc[nome] = p
    _grava_presets(doc)
    return jsonify({'ok': True, 'nome': nome})


@bp.route('/api/era6/presets/<path:nome>', methods=['DELETE'])
def era6_preset_apagar(nome):
    doc = _presets()
    if doc.pop(nome, None) is None:
        return jsonify({'error': 'preset não existe'}), 404
    _grava_presets(doc)
    return jsonify({'ok': True})
