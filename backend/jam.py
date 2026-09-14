#!/usr/bin/env python
"""jam.py — cano entre o terminal e o painel AnalogBrain.

Uso:
    python jam.py status                        # rev, bpm, tocando, ultimo erro
    python jam.py get [-o arquivo]              # codigo que esta soando
    python jam.py push arquivo.js -m "msg"      # propor revisao (author=claude)
    cat p.js | python jam.py push - -m "msg"
    python jam.py log [-n 20] [--code]          # historico de revisoes
    python jam.py watch [--timeout 300]         # bloqueia ate mudar rev/erro
    python jam.py save nome [-m "..."]          # congela a rev atual como versao
    python jam.py songs                         # lista o acervo
    python jam.py open nome [--push]            # le a musica (--push propoe no painel)
    python jam.py new nome [-m] [-f arquivo]    # cria musica no acervo
    python jam.py versions nome [-n 10]         # linha do tempo da musica
    python jam.py comment nome -m "..."         # comenta sem mexer no som

Sem dependencia externa: urllib da stdlib.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get('JAM_API', 'http://localhost:5000')


def _req(path, payload=None, method=None):
    url = f'{API}{path}'
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method or ('POST' if data else 'GET'),
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='replace')
        try:
            msg = json.loads(body).get('error', body)
        except Exception:
            msg = body
        sys.exit(f'! backend recusou ({e.code}): {msg}')
    except urllib.error.URLError as e:
        sys.exit(f'! backend offline em {API} ({e.reason}). Sobe o dashboard_server.py.')


def _fmt_ago(ts):
    if not ts:
        return '-'
    d = max(0, int(time.time() - ts))
    return f'{d}s atras' if d < 90 else f'{d // 60}min atras'


def cmd_status(a):
    s = _req('/api/jam/state')
    mark = 'TOCANDO' if s.get('playing') else 'parado'
    print(f"rev {s['rev']} por {s['author']} ({_fmt_ago(s.get('ts'))}) | bpm {s['bpm']} | {mark}")
    if s.get('message'):
        print(f"  msg: {s['message']}")
    if s['rev'] != s.get('accepted_rev'):
        print(f"  ~ rev {s['rev']} ainda nao aceita no painel (aceita: {s.get('accepted_rev')})")
    if s.get('error'):
        print(f"  ERRO DE EVAL: {s['error']}")
    print(f"  {len(s.get('code') or '')} chars de codigo")


def cmd_get(a):
    s = _req('/api/jam/state')
    code = s.get('code') or ''
    if a.out:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f'rev {s["rev"]} -> {a.out}')
    else:
        sys.stdout.write(code + ('\n' if code and not code.endswith('\n') else ''))


def cmd_push(a):
    if a.file == '-':
        code = sys.stdin.read()
    else:
        with open(a.file, encoding='utf-8') as f:
            code = f.read()
    if not code.strip():
        sys.exit('! nada pra empurrar')
    payload = {'code': code, 'author': a.author, 'message': a.message}
    if a.bpm:
        payload['bpm'] = a.bpm
    r = _req('/api/jam/push', payload)
    print(f'rev {r["rev"]} proposta ({a.author}). No painel: Ouvir / Aceitar / Descartar.')


def cmd_log(a):
    items = _req(f'/api/jam/log?n={a.n}&code={"1" if a.code else "0"}')
    for it in items:
        print(f'rev {it["rev"]:>3} [{it["author"]:>6}] {_fmt_ago(it.get("ts")):>12}  {it.get("message") or "-"}')
        if a.code:
            print('    ' + (it.get('code') or '').replace('\n', '\n    '))


def cmd_watch(a):
    s = _req('/api/jam/state')
    rev, err = s['rev'], s.get('error')
    print(f'esperando mudanca (rev atual {rev})... ctrl+c pra sair', file=sys.stderr)
    deadline = time.time() + a.timeout
    while time.time() < deadline:
        time.sleep(a.interval)
        s = _req('/api/jam/state')
        if s['rev'] != rev:
            print(f'>> rev {s["rev"]} por {s["author"]}: {s.get("message") or "-"}')
            print(s.get('code') or '')
            return
        if s.get('error') and s['error'] != err:
            print(f'>> ERRO DE EVAL na rev {s["rev"]}: {s["error"]}')
            return
    print('(timeout, nada mudou)', file=sys.stderr)


def cmd_save(a):
    """Congela o que esta soando como versao nova da musica."""
    st = _req('/api/jam/state')
    code = st.get('code') or ''
    if not code.strip():
        sys.exit('! nao ha codigo na jam pra salvar')
    r = _req(f'/api/songs/{a.name}', {'code': code, 'author': 'claude',
                                      'message': a.message, 'bpm': st.get('prop_bpm') or st.get('bpm')})
    print(f'{a.name} v{r["version"]} salva')


def cmd_songs(a):
    items = _req('/api/songs')
    if not items:
        print('(acervo vazio — use: jam.py new <nome>)')
        return
    for it in items:
        vs = f'v{it["versions"] - 1}' if it['versions'] else '—'
        bpm = f'{it["bpm"]}bpm' if it['bpm'] else ''
        print(f'{it["name"]:<24} {vs:>4} {bpm:>7} {_fmt_ago(it["ts"]):>12}  '
              f'[{it["author"]}] {it["message"] or ""}'.rstrip())


def cmd_open(a):
    r = _req(f'/api/songs/{a.name}')
    if a.push:
        _req('/api/jam/push', {'code': r['code'], 'author': 'claude',
                               'message': f'do acervo: {a.name}'})
        print(f'{a.name} proposto no painel')
    else:
        sys.stdout.write(r['code'])


def cmd_new(a):
    """Cria musica no acervo. Nasce marcada como minha, pra voce achar na lista."""
    if a.file == '-':
        code = sys.stdin.read()
    elif a.file:
        with open(a.file, encoding='utf-8') as f:
            code = f.read()
    else:
        linhas = ['// ' + a.name]
        if a.message:
            linhas.append('// ' + a.message)
        linhas += ['silence', '']
        code = '\n'.join(linhas)
    r = _req(f'/api/songs/{a.name}', {'code': code, 'author': 'claude',
                                      'message': a.message or 'criada', 'bpm': a.bpm or 0})
    print(f'{a.name} criada (v{r["version"]}). Aparece no repertorio em /musica.')


def cmd_versions(a):
    vs = _req(f'/api/songs/{a.name}')['versions']
    for v in vs[-a.n:]:
        print(f'v{v["i"]:<3} {_fmt_ago(v["ts"]):>12} [{v["author"]:>6}] '
              f'{v["chars"]:>5}ch  {v["message"] or ""}'.rstrip())
    if not vs:
        print('(sem versoes)')


def cmd_comment(a):
    """Comentario e uma versao sem mudanca de codigo: fica no log da musica."""
    r = _req(f'/api/songs/{a.name}')
    _req(f'/api/songs/{a.name}', {'code': r['code'], 'author': 'claude',
                                  'message': a.message})
    print(f'comentario anotado em {a.name}')


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)

    sub.add_parser('status').set_defaults(fn=cmd_status)

    g = sub.add_parser('get'); g.add_argument('-o', '--out'); g.set_defaults(fn=cmd_get)

    pu = sub.add_parser('push')
    pu.add_argument('file', help="arquivo .js ou '-' pra stdin")
    pu.add_argument('-m', '--message', default='')
    pu.add_argument('--bpm', type=int)
    pu.add_argument('--author', choices=['claude', 'user'], default='claude')
    pu.set_defaults(fn=cmd_push)

    lg = sub.add_parser('log'); lg.add_argument('-n', type=int, default=20)
    lg.add_argument('--code', action='store_true'); lg.set_defaults(fn=cmd_log)

    w = sub.add_parser('watch'); w.add_argument('--timeout', type=float, default=300)
    w.add_argument('--interval', type=float, default=1.0); w.set_defaults(fn=cmd_watch)

    sv = sub.add_parser('save'); sv.add_argument('name')
    sv.add_argument('-m', '--message', default=''); sv.set_defaults(fn=cmd_save)

    sub.add_parser('songs').set_defaults(fn=cmd_songs)

    op = sub.add_parser('open'); op.add_argument('name')
    op.add_argument('--push', action='store_true'); op.set_defaults(fn=cmd_open)

    nw = sub.add_parser('new'); nw.add_argument('name')
    nw.add_argument('-m', '--message', default='')
    nw.add_argument('-f', '--file', help="arquivo .js ou '-' pra stdin")
    nw.add_argument('--bpm', type=int); nw.set_defaults(fn=cmd_new)

    vr = sub.add_parser('versions'); vr.add_argument('name')
    vr.add_argument('-n', type=int, default=10); vr.set_defaults(fn=cmd_versions)

    cm = sub.add_parser('comment'); cm.add_argument('name')
    cm.add_argument('-m', '--message', required=True); cm.set_defaults(fn=cmd_comment)

    a = p.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
