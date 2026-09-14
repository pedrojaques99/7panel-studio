"""
Gera o yt_token.json reaproveitando o GOOGLE_CLIENT_ID/SECRET que JÁ existe
(mesmo client do visantlabs/Drive + Gmail). Espelho do gmail-auth-helper.ts.

Reusa o redirect http://localhost:53682 que JÁ está autorizado no OAuth client
(foi adicionado pro Drive) — então NÃO precisa mexer no console pra URI, nem
baixar client_secret.json.

Pré-requisito único: YouTube Data API v3 habilitada no projeto. Via Cloud Shell:
  gcloud services enable youtube.googleapis.com --project=249091792739

Rodar UMA vez:
  cd backend && python yt_auth_helper.py

Faça login com a conta DONA DO CANAL e permita. Gera backend/yt_token.json.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 53682
REDIRECT_URI = f'http://localhost:{PORT}'
SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'yt_token.json')

# Onde procurar o client já existente (mesma credencial do Drive/Gmail)
ENV_CANDIDATES = [
    r'Z:\Cursor\visantlabs-os\.env',
    r'Z:\Cursor\visantlabs-os\.env.local',
    r'Z:\Cursor\jaques-folio-org\.env.local',
]


def _from_env_files(name):
    for path in ENV_CANDIDATES:
        if not os.path.exists(path):
            continue
        try:
            with open(path, encoding='utf-8') as f:
                for line in f:
                    m = re.match(rf'\s*{name}\s*=\s*(.+)', line)
                    if m:
                        return m.group(1).strip().strip('"').strip("'")
        except Exception:
            pass
    return ''


def get_client():
    cid = os.environ.get('GOOGLE_CLIENT_ID') or _from_env_files('GOOGLE_CLIENT_ID')
    sec = os.environ.get('GOOGLE_CLIENT_SECRET') or _from_env_files('GOOGLE_CLIENT_SECRET')
    if not cid or not sec:
        print('ERRO: GOOGLE_CLIENT_ID/SECRET nao encontrados nos .env conhecidos.')
        print('Procurei em:\n  ' + '\n  '.join(ENV_CANDIDATES))
        sys.exit(1)
    return cid, sec


_result = {}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencia o log do http.server
        pass

    def do_GET(self):
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        code = (params.get('code') or [None])[0]
        err = (params.get('error') or [None])[0]

        def reply(msg):
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(msg.encode('utf-8'))

        if err:
            reply(f'Erro: {err}. Pode fechar esta aba.')
            _result['error'] = err
            return
        if not code:
            reply('Sem code na URL.')
            return

        cid, sec = _result['client']
        body = urllib.parse.urlencode({
            'code': code,
            'client_id': cid,
            'client_secret': sec,
            'redirect_uri': REDIRECT_URI,
            'grant_type': 'authorization_code',
        }).encode()
        try:
            req = urllib.request.Request(
                'https://oauth2.googleapis.com/token', data=body,
                headers={'Content-Type': 'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(req, timeout=20) as r:
                tokens = json.loads(r.read().decode())
        except Exception as e:
            detail = ''
            if hasattr(e, 'read'):
                try:
                    detail = e.read().decode()
                except Exception:
                    pass
            reply(f'Falha ao trocar o code: {e} {detail}')
            _result['error'] = f'{e} {detail}'
            return

        if not tokens.get('refresh_token'):
            reply('Resposta sem refresh_token.')
            _result['error'] = f'sem refresh_token: {tokens}'
            return

        # formato "authorized_user" — o que Credentials.from_authorized_user_file espera
        with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'type': 'authorized_user',
                'client_id': cid,
                'client_secret': sec,
                'refresh_token': tokens['refresh_token'],
            }, f, indent=2)
        reply('Pronto! Token salvo. Pode fechar esta aba e voltar pro terminal.')
        _result['ok'] = True


def main():
    cid, sec = get_client()
    _result['client'] = (cid, sec)

    auth_url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode({
        'client_id': cid,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': SCOPE,
        'access_type': 'offline',
        'prompt': 'consent',
    })

    print(f'\nUsando o OAuth client existente: {cid[:18]}...')
    print('\nAbra no browser e permita o acesso ao YouTube')
    print('(faca login com a conta DONA DO CANAL):\n')
    print(auth_url + '\n')
    print(f'Aguardando callback em {REDIRECT_URI} ...\n')

    srv = HTTPServer(('localhost', PORT), Handler)
    while not _result.get('ok') and not _result.get('error'):
        srv.handle_request()
    srv.server_close()

    if _result.get('error'):
        print(f'FALHOU: {_result["error"]}')
        sys.exit(1)
    print(f'SUCESSO! Token salvo em {TOKEN_FILE}')
    print('Agora o botao "Iniciar Bot" no painel funciona.')


if __name__ == '__main__':
    main()
