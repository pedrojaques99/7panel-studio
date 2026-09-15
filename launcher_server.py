"""Servidor do Jaques Launcher (:4000).

Substitui o `python -m http.server`: continua servindo os arquivos estáticos
(launcher.html etc), mas ganha endpoints que um servidor estático não tem:

  GET  /api/apps          -> catálogo de apps + status (online medido no servidor
                             via socket, na porta principal) + grupo.
  POST /api/start/<key>   -> liga (start limpo: libera as portas antes) — grava o
                             stdout/stderr num logfile por app.
  POST /api/stop/<key>    -> desliga (mata as portas do app).
  GET  /api/logs/<key>    -> últimas linhas do logfile do app (pra ver por que
                             um start falhou sem abrir terminal).

O APPS abaixo é a ÚNICA fonte da verdade: o launcher.html se monta a partir do
/api/apps, então pra adicionar/editar um card basta mexer aqui.
"""
import json
import os
import socket
import subprocess
import time
from collections import deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))          # ...\7panel_studio
_PAI = os.path.dirname(BASE)
# o 7panel_studio já morou em Z:\Cursor e hoje mora dentro do jaques-os — resolve os
# dois layouts, senão JAQUES vira Z:\Cursor\jaques-os\jaques-os e todo start falha.
if os.path.basename(_PAI).lower() == "jaques-os":
    JAQUES = _PAI                                          # Z:\Cursor\jaques-os
    CURSOR = os.path.dirname(_PAI)                         # Z:\Cursor
else:
    CURSOR = _PAI
    JAQUES = os.path.join(CURSOR, "jaques-os")
PROSPECT = os.path.join(JAQUES, "ProspectOS", "ProspectOS")

# stdout/stderr de cada app vai pra cá — é o que dá o "log num clique" quando um
# start falha, sem trazer de volta as janelas de terminal.
LOG_DIR = os.path.join(BASE, ".launcher-logs")
os.makedirs(LOG_DIR, exist_ok=True)

# Cada app: key, nome, ícone (codepoint), url de abrir, portas que provam que está
# no ar, e os passos de start (cwd + comando de shell). start=[] => sem botão ligar.
APPS = [
    {
        "key": "jaques", "name": "Jaques OS", "icon": "\u2699", "grupo": "Jaques",
        "url": "http://localhost:5173",
        # ports[0] = porta que define online/dot; as demais s\u00f3 s\u00e3o liberadas no start.
        # 3003 = backend server.js (npm run dev sobe backend + vite juntos via concurrently).
        "ports": [5173, 3003],
        "start": [{"cwd": JAQUES, "cmd": "npm run dev"}],
    },
    {
        "key": "conteudo", "name": "Conteudo OS", "icon": "\U0001F4CA", "grupo": "Jaques",
        "url": "http://localhost:5173/conteudo.html", "ports": [5173, 3003],
        "start": [{"cwd": JAQUES, "cmd": "npm run dev"}],  # mesmo vite do Jaques OS
    },
    {
        "key": "prospect", "name": "Prospect OS", "icon": "\U0001F3AF", "grupo": "Jaques",
        "url": "http://localhost:5555", "ports": [5555, 5556],
        "start": [
            {"cwd": os.path.join(PROSPECT, "backend"), "cmd": "py app.py"},
            {"cwd": os.path.join(PROSPECT, "frontend"), "cmd": "npm run dev"},
        ],
    },
    {
        "key": "finance", "name": "Finance", "icon": "\U0001F4B0", "grupo": "Jaques",
        "url": "http://localhost:567/financas/dashboard", "ports": [567],
        "start": [{"cwd": os.path.join(CURSOR, "jaques-folio-org"), "cmd": "npx next dev -p 567"}],
    },
    {
        "key": "visantlabs", "name": "Visant Labs", "icon": "\U0001F9EA", "grupo": "Visant",
        "url": "http://localhost:3000", "ports": [3000, 3100, 3001],
        "start": [{"cwd": os.path.join(CURSOR, "visantlabs-os"), "cmd": "npm run dev:all"}],
    },
    {
        "key": "visantboard", "name": "Visant Board", "icon": "\U0001F5C2", "grupo": "Visant",
        "url": "http://localhost:7777", "ports": [7777],
        "start": [{"cwd": r"Z:\Jobs 2.0\2026\@Automations\gpt-image-generator\visant-board",
                   "cmd": "npx next dev -p 7777"}],
    },
    {
        "key": "mockup", "name": "Mockup Store", "icon": "\U0001F5BC", "grupo": "Visant",
        "url": "http://localhost:4100", "ports": [4100, 4200],
        "start": [
            {"cwd": r"Z:\BOXY\mockup-store", "cmd": "bun run scripts/render-server.ts"},
            {"cwd": r"Z:\BOXY\mockup-store", "cmd": "npx next dev --port 4100"},
        ],
    },
    {
        "key": "panel", "name": "7Panel Studio", "icon": "\U0001F3B9", "grupo": "Studio",
        "url": "http://localhost:5174", "ports": [5174, 5000],  # 5000 = dashboard_server backend
        "start": [
            {"cwd": os.path.join(BASE, "backend"), "cmd": "python dashboard_server.py"},
            {"cwd": os.path.join(BASE, "keyboard-ui"), "cmd": "npm run dev"},
        ],
    },
    {
        "key": "streamer", "name": "Streamer Focus", "icon": "\U0001F534", "grupo": "Studio",
        "url": "http://localhost:5174/streamer", "ports": [5174],
        "start": [{"cwd": os.path.join(BASE, "keyboard-ui"), "cmd": "npm run dev"}],
    },
]

# Ordem em que os grupos aparecem na home.
GRUPOS = ["Jaques", "Visant", "Studio"]

APPS_POR_KEY = {a["key"]: a for a in APPS}

# CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP: sem janela de console (o problema dos
# "vários terminais abrindo") e em grupo próprio. NÃO usar DETACHED_PROCESS junto: ele
# faz o Windows IGNORAR o CREATE_NO_WINDOW e é o que deixava as janelas aparecerem.
_SEM_JANELA = 0x08000000 | 0x00000200


def _porta_no_ar(porta):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.25)
        return s.connect_ex(("127.0.0.1", porta)) == 0


def _pids_nas_portas(portas):
    """PIDs escutando (LISTENING) qualquer uma das portas, via Get-NetTCPConnection.
    NÃO usar `netstat`: ele omite silenciosamente algumas portas (visto na prática
    com o vite no 5555), enquanto o Get-NetTCPConnection lê a MIB TCP direto."""
    lista = ",".join(str(p) for p in portas)
    cmd = (
        "$ErrorActionPreference='SilentlyContinue';"
        f"(Get-NetTCPConnection -LocalPort {lista} -State Listen)."
        "OwningProcess | Sort-Object -Unique"
    )
    saida = subprocess.run(
        ["powershell", "-NoProfile", "-Command", cmd],
        capture_output=True, text=True, creationflags=_SEM_JANELA,
    ).stdout
    return {p.strip() for p in saida.splitlines() if p.strip().isdigit()}


def _liberar_portas(portas):
    """Mata quem estiver ocupando as portas do app ANTES de subir — evita
    EADDRINUSE e o vite escalando pra outra porta (a fonte do 'conflito')."""
    for pid in _pids_nas_portas(portas):
        subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True,
                       creationflags=_SEM_JANELA)


def _status_apps():
    saida = []
    for app in APPS:
        # online/dot definido pela porta principal (a que a url abre), não por
        # qualquer porta — senão um backend sozinho no ar esconderia o botão Ligar.
        saida.append({
            "key": app["key"], "name": app["name"], "icon": app["icon"],
            "grupo": app.get("grupo", "Outros"),
            "url": app["url"], "port": app["ports"][0],
            "online": _porta_no_ar(app["ports"][0]),
            "pode_ligar": bool(app["start"]),
        })
    return saida


def _logfile(key):
    return os.path.join(LOG_DIR, f"{key}.log")


def _ler_log(key, linhas=140):
    caminho = _logfile(key)
    if not os.path.exists(caminho):
        return ""
    with open(caminho, "r", encoding="utf-8", errors="replace") as f:
        return "".join(deque(f, maxlen=linhas))


def _ligar(key):
    app = APPS_POR_KEY.get(key)
    if not app or not app["start"]:
        return False
    _liberar_portas(app["ports"])          # start limpo: sem conflito de porta
    time.sleep(0.4)                          # dá tempo do SO liberar o socket
    # log truncado a cada start: o que interessa é a subida atual.
    log = open(_logfile(key), "w", encoding="utf-8")
    log.write(f"=== start {key} @ {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
    log.flush()
    for passo in app["start"]:
        log.write(f"\n$ {passo['cmd']}  (cwd={passo['cwd']})\n")
        log.flush()
        # sem janela (CREATE_NO_WINDOW) + stdout/stderr no logfile: nenhum terminal
        # aparece E o log fica gravado pra diagnosticar falha de start.
        subprocess.Popen(
            passo["cmd"], cwd=passo["cwd"], shell=True, creationflags=_SEM_JANELA,
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            close_fds=True,
        )
    log.close()  # os filhos já herdaram o handle; podemos fechar o nosso
    return True


def _desligar(key):
    app = APPS_POR_KEY.get(key)
    if not app:
        return False
    _liberar_portas(app["ports"])
    return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def log_message(self, *args):  # silêncio: o launcher roda escondido
        pass

    def _json(self, dados, status=200):
        corpo = json.dumps(dados).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        if self.path == "/":
            self.path = "/launcher.html"
        if self.path.startswith("/api/apps"):
            return self._json({"apps": _status_apps(), "grupos": GRUPOS})
        if self.path.startswith("/api/logs/"):
            key = self.path.rsplit("/", 1)[-1]
            return self._json({"log": _ler_log(key)})
        return super().do_GET()

    def do_POST(self):
        # drena o corpo (mesmo vazio) pra não dessincronizar keep-alive
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho:
            self.rfile.read(tamanho)
        # nunca deixar do_POST explodir sem resposta (isso vira ERR_EMPTY_RESPONSE
        # no browser); qualquer falha volta como JSON com o erro.
        acao = None
        if self.path.startswith("/api/start/"):
            acao = _ligar
        elif self.path.startswith("/api/stop/"):
            acao = _desligar
        if acao:
            key = self.path.rsplit("/", 1)[-1]
            try:
                ok = acao(key)
                return self._json({"ok": ok}, status=200 if ok else 400)
            except Exception as e:
                return self._json({"ok": False, "erro": str(e)}, status=500)
        self.send_error(404)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4000), Handler).serve_forever()
