from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
import threading
from datetime import datetime
import comtypes

app = Flask(__name__)
CORS(app)

@app.before_request
def init_com():
    try:
        comtypes.CoInitialize()
    except Exception:
        pass

CONFIG_FILE = "keyboard_config.json"
UI_DIR = "ui"
ASSETS_DIR = "assets"

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"buttons": {}}

def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

def ensure_dirs():
    for d in [UI_DIR, ASSETS_DIR]:
        if not os.path.exists(d):
            os.makedirs(d)

# --- Audio session helpers ---

DISPLAY_NAMES = {
    'chrome': 'Google Chrome',
    'firefox': 'Firefox',
    'msedge': 'Edge',
    'opera': 'Opera',
    'brave': 'Brave',
    'discord': 'Discord',
    'discordptb': 'Discord',
    'discordcanary': 'Discord',
    'discorddevelopment': 'Discord',
    'spotify': 'Spotify',
    'vlc': 'VLC',
    'obs64': 'OBS Studio',
    'obs32': 'OBS Studio',
    'steamwebhelper': 'Steam',
    'steam': 'Steam',
    'teams': 'Teams',
    'slack': 'Slack',
    'zoom': 'Zoom',
    'skype': 'Skype',
    'whatsapp': 'WhatsApp',
    'telegram': 'Telegram',
    'mpc-hc64': 'MPC-HC',
    'mpc-hc': 'MPC-HC',
    'winamp': 'Winamp',
    'foobar2000': 'foobar2000',
    'audacity': 'Audacity',
    'reaper': 'REAPER',
    'ableton': 'Ableton',
    'fl': 'FL Studio',
}

def get_display_name(exe_name: str) -> str:
    key = exe_name.lower().replace('.exe', '')
    for k, v in DISPLAY_NAMES.items():
        if k in key:
            return v
    return key.capitalize()

def get_mic_data():
    try:
        from pycaw.pycaw import AudioUtilities, IAudioMeterInformation, IAudioEndpointVolume
        import comtypes
        device = AudioUtilities.GetMicrophone()
        if not device:
            return None
        meter = device.Activate(IAudioMeterInformation._iid_, comtypes.CLSCTX_ALL, None)
        meter = meter.QueryInterface(IAudioMeterInformation)
        ep_vol = device.Activate(IAudioEndpointVolume._iid_, comtypes.CLSCTX_ALL, None)
        ep_vol = ep_vol.QueryInterface(IAudioEndpointVolume)
        return {
            'pid': -1,
            'name': 'mic',
            'display_name': 'Microphone',
            'volume': round(ep_vol.GetMasterVolumeLevelScalar(), 3),
            'muted': bool(ep_vol.GetMute()),
            'peak': round(meter.GetPeakValue(), 3),
            'is_input': True,
        }
    except Exception:
        return None

def get_running_known_apps():
    """Return set of display_names for known apps currently running (no audio session)."""
    try:
        import psutil
        running = set()
        for p in psutil.process_iter(['name']):
            name = p.info['name'] or ''
            key = name.lower().replace('.exe', '')
            for k, v in DISPLAY_NAMES.items():
                if k in key:
                    running.add(v)
                    break
        return running
    except Exception:
        return set()

def get_sessions_data():
    try:
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume, IAudioMeterInformation
        sessions = AudioUtilities.GetAllSessions()
        result = []
        seen_display = set()

        for session in sessions:
            try:
                volume_ctl = session._ctl.QueryInterface(ISimpleAudioVolume)
                meter = session._ctl.QueryInterface(IAudioMeterInformation)
                pid = session.ProcessId
                if session.Process is None:
                    proc_name = 'system'
                    display = 'System'
                else:
                    proc_name = session.Process.name()
                    display = get_display_name(proc_name)
                seen_display.add(display)
                result.append({
                    'pid': pid,
                    'name': proc_name,
                    'display_name': display,
                    'volume': round(volume_ctl.GetMasterVolume(), 3),
                    'muted': bool(volume_ctl.GetMute()),
                    'peak': round(meter.GetPeakValue(), 3),
                })
            except Exception:
                continue

        # Add running known apps that have no audio session yet
        for display in get_running_known_apps():
            if display not in seen_display:
                result.append({
                    'pid': -2,
                    'name': display.lower(),
                    'display_name': display,
                    'volume': 1.0,
                    'muted': False,
                    'peak': 0.0,
                    'inactive': True,
                })

        return result
    except ImportError:
        return []

# --- Routes ---

@app.route('/')
def index():
    return send_from_directory(UI_DIR, 'index.html')

@app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify(load_config())

@app.route('/api/config', methods=['POST'])
def update_config():
    new_config = request.json
    save_config(new_config)
    return jsonify({"status": "success"})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    filename = file.filename
    # Smart routing by filename prefix
    prefix_map = [
        ('synth-rec-', 'synth'),
        ('drone-',     'drone'),
        ('ps_',        'ps_'),
        ('session',    'session_'),
        ('drum-',      'drum'),
    ]
    subfolder = ''
    for prefix, folder in prefix_map:
        if filename.startswith(prefix):
            subfolder = folder
            break
    date_prefix = datetime.now().strftime('%Y-%m-%d')
    if subfolder:
        dest_dir = os.path.join(ASSETS_DIR, subfolder)
        os.makedirs(dest_dir, exist_ok=True)
        target_path = os.path.join(dest_dir, f"{date_prefix}_{filename}")
    else:
        target_path = os.path.join(ASSETS_DIR, filename)
    file.save(target_path)
    abs_path = os.path.abspath(target_path)
    return jsonify({"status": "success", "path": abs_path})

@app.route('/api/preview', methods=['GET'])
def preview_file():
    path = request.args.get('path', '')
    if not path or not os.path.isfile(path):
        return jsonify({'error': 'file not found'}), 404
    ext = os.path.splitext(path)[1].lower()
    mime = {'mp3': 'audio/mpeg', 'mp4': 'video/mp4', 'wav': 'audio/wav', 'ogg': 'audio/ogg'}.get(ext.lstrip('.'), 'application/octet-stream')
    directory = os.path.dirname(os.path.abspath(path))
    filename = os.path.basename(path)
    resp = send_from_directory(directory, filename, mimetype=mime)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

@app.route('/api/audio/sessions', methods=['GET'])
def get_audio_sessions():
    sessions = get_sessions_data()
    mic = get_mic_data()
    if mic:
        sessions.insert(0, mic)
    return jsonify(sessions)

@app.route('/api/audio/sessions/volume', methods=['POST'])
def set_session_volume():
    try:
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume
        data = request.json
        pid = int(data.get('pid'))
        vol = max(0.0, min(1.0, float(data.get('volume', 1.0))))
        for session in AudioUtilities.GetAllSessions():
            if session.ProcessId == pid:
                volume_ctl = session._ctl.QueryInterface(ISimpleAudioVolume)
                volume_ctl.SetMasterVolume(vol, None)
                return jsonify({'status': 'ok'})
        return jsonify({'error': 'session not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/audio/sessions/mute', methods=['POST'])
def set_session_mute():
    try:
        from pycaw.pycaw import AudioUtilities, ISimpleAudioVolume
        data = request.json
        pid = int(data.get('pid'))
        muted = bool(data.get('muted', False))
        for session in AudioUtilities.GetAllSessions():
            if session.ProcessId == pid:
                volume_ctl = session._ctl.QueryInterface(ISimpleAudioVolume)
                volume_ctl.SetMute(muted, None)
                return jsonify({'status': 'ok'})
        return jsonify({'error': 'session not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/yt-stream', methods=['GET'])
def yt_stream():
    """Proxy YouTube audio through Flask to avoid browser CORS restrictions."""
    import subprocess, urllib.request
    from flask import Response, stream_with_context
    url = request.args.get('url', '')
    if not url:
        return jsonify({'error': 'missing url'}), 400
    try:
        result = subprocess.run(
            ['yt-dlp', '--get-url', '-f', 'bestaudio/best', url],
            capture_output=True, text=True, timeout=15
        )
        stream_url = result.stdout.strip().splitlines()[0]
        if not stream_url:
            return jsonify({'error': 'yt-dlp returned no URL'}), 500
    except FileNotFoundError:
        return jsonify({'error': 'yt-dlp not found — pip install yt-dlp'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # Proxy the stream so browser never sees googlevideo.com (CORS fix)
    range_header = request.headers.get('Range', '')
    req = urllib.request.Request(stream_url, headers={
        'User-Agent': 'Mozilla/5.0',
        'Range': range_header,
    })
    try:
        remote = urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        return jsonify({'error': f'proxy open failed: {e}'}), 502

    status = remote.status
    content_type = remote.headers.get('Content-Type', 'audio/webm')
    content_length = remote.headers.get('Content-Length')
    content_range = remote.headers.get('Content-Range')

    def generate():
        while True:
            chunk = remote.read(65536)
            if not chunk:
                break
            yield chunk

    headers = {
        'Content-Type': content_type,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
    }
    if content_length:
        headers['Content-Length'] = content_length
    if content_range:
        headers['Content-Range'] = content_range

    return Response(stream_with_context(generate()), status=status, headers=headers)


# ── Paulstretch ──────────────────────────────────────────────

# Aqui morava uma SEGUNDA implementacao do Paulstretch, com `out_step = half`
# (overlap=2). A CLI de `Jacao Ambients/_tools/` rodava overlap=4. Medido:
# 9,03 dB de ripple contra 0,25 dB — tremolo de 8 Hz em todo render feito pela UI.
#
# A copia foi removida. O motor agora mora em `dsp/paulstretch.py`, unico, e
# `tests/test_divergencia.py` falha se ele divergir da CLI.
from dsp.paulstretch import paulstretch as _paulstretch, fator_efetivo


@app.route('/api/duration', methods=['GET'])
def get_duration():
    import subprocess, json as _json, re
    path = request.args.get('path', '').strip()
    if not path or not os.path.exists(path):
        return jsonify({'error': 'file not found'}), 400
    try:
        r = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json',
             '-show_format', '-show_streams', path],
            capture_output=True, timeout=10
        )
        info = _json.loads(r.stdout)

        # webm de MediaRecorder NAO traz duracao: o container e escrito em stream e
        # o header sai sem `format.duration`. Toda gravacao da /fabrica caia aqui e a
        # tela ficava sem o unico numero que ela mostra. Tres tentativas, da mais
        # barata pra mais cara.
        duration = None
        try:
            duration = float(info.get('format', {}).get('duration'))
        except (TypeError, ValueError):
            pass

        if duration is None:
            for st in info.get('streams', []):
                try:
                    duration = float(st.get('duration'))
                    break
                except (TypeError, ValueError):
                    continue

        if duration is None:
            # ultimo recurso: decodifica pra nada e le o tempo final do ffmpeg.
            # Custa um passe de decode, e so acontece em arquivo sem duracao no header.
            d = subprocess.run(
                ['ffmpeg', '-i', path, '-f', 'null', '-'],
                capture_output=True, timeout=120
            )
            err = (d.stderr or b'').decode('utf-8', 'replace')
            m = re.findall(r'time=(\d+):(\d+):(\d+(?:\.\d+)?)', err)
            if m:
                h, mi, sec = m[-1]
                duration = int(h) * 3600 + int(mi) * 60 + float(sec)

        if duration is None:
            return jsonify({'error': 'sem duracao no arquivo'}), 500
        return jsonify({'duration': duration})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/stretch', methods=['GET'])
def stretch_audio():
    import os, hashlib, subprocess, tempfile
    import numpy as np
    from scipy.io import wavfile

    path        = request.args.get('path', '').strip()
    factor      = float(request.args.get('factor', '8.0'))
    window      = float(request.args.get('window', '0.25'))
    trim_start  = request.args.get('trim_start', '').strip()  # e.g. "0:30" or "30"
    trim_end    = request.args.get('trim_end', '').strip()    # e.g. "1:00" or "60"

    if not path or not os.path.exists(path):
        return jsonify({'error': 'file not found'}), 400
    if factor < 1.1 or factor > 200:
        return jsonify({'error': 'factor must be 1.1–200'}), 400

    assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
    os.makedirs(assets_dir, exist_ok=True)

    trim_tag = f'|{trim_start}-{trim_end}' if (trim_start or trim_end) else ''
    key      = hashlib.md5(f'{path}|{factor}|{window}{trim_tag}'.encode()).hexdigest()[:14]
    out_path = os.path.join(assets_dir, f'ps_{key}.wav')
    meta_path = out_path[:-4] + '.json'
    if os.path.exists(out_path):
        # O fator efetivo vem do sidecar, nao de recalcular: no acerto de cache o
        # audio nao foi decodificado, entao `len(audio)` nao existe aqui. Sem isto
        # um render que saiu CURTO (fonte de 1 s pedindo 12x entrega 6,62x) perdia o
        # aviso pra sempre a partir da segunda vez — a UI mostrava o alerta uma vez e
        # nunca mais, que e pior do que nunca ter mostrado.
        resp = {'path': out_path}
        try:
            with open(meta_path, encoding='utf-8') as fh:
                resp.update(json.load(fh))
        except (OSError, ValueError):
            pass          # render antigo, anterior ao sidecar: responde sem o aviso
        return jsonify(resp)

    # decode input to PCM WAV via ffmpeg — apply trim if requested
    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    tmp.close()
    try:
        cmd = ['ffmpeg', '-y']
        if trim_start:
            cmd += ['-ss', trim_start]
        cmd += ['-i', path]
        if trim_end:
            cmd += ['-to', trim_end]
        cmd += ['-ar', '44100', '-ac', '2', '-f', 'wav', tmp.name]

        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            return jsonify({'error': r.stderr.decode()[-300:]}), 500

        sr, data = wavfile.read(tmp.name)
        if data.dtype == np.int16:
            audio = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            audio = data.astype(np.float32) / 2147483648.0
        else:
            audio = data.astype(np.float32)

        stretched = _paulstretch(sr, audio, factor, window)

        out_int16 = np.clip(stretched * 32767, -32768, 32767).astype(np.int16)
        wavfile.write(out_path, sr, out_int16)
        # O fator pedido quase nunca e o entregue: a ultima janela precisa caber
        # inteira, entao fonte curta estica menos (1 s com janela 0,5 s pedindo 12x
        # devolve 6,62x). A conta NAO foi mexida — todos os renders aprovados do
        # acervo sairam assim. Aqui so se avisa, pra UI poder mostrar.
        real, _prev, _win = fator_efetivo(len(audio), sr, factor, window)
        aviso = {'fator_pedido': factor, 'fator_real': round(real, 2),
                 'fator_ok': abs(real - factor) <= factor * 0.05}
        # Sidecar: no proximo acerto de cache o audio nao sera decodificado e
        # `len(audio)` nao existira. Sem gravar aqui, o aviso de fator curto some
        # a partir da segunda chamada.
        try:
            with open(meta_path, 'w', encoding='utf-8') as fh:
                json.dump(aviso, fh)
        except OSError:
            pass          # sidecar e conveniencia; nao pode derrubar o render
        return jsonify({'path': out_path, **aviso})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'ffmpeg timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try: os.unlink(tmp.name)
        except: pass


# ── Triagem e Domar ──────────────────────────────────────────────────────────
#
# A esteira e SEED -> TRIAGEM -> ESTICAR -> DOMAR. A triagem existe porque medir
# custa segundos e esticar custa horas: 60 das 331 faixas do acervo reprovam NA
# FONTE, e todo render gasto nelas foi tempo jogado fora.

@app.route('/api/triagem', methods=['POST'])
def api_triagem():
    """Mede a fonte antes de gastar render. Devolve os 4 portoes + destino + receita."""
    from dsp.medidas import triar

    body = request.get_json(silent=True) or {}
    path = (body.get('path') or '').strip()
    if not path:
        return jsonify({'error': 'informe path'}), 400
    if not os.path.exists(path):
        return jsonify({'error': 'file not found: %s' % path}), 404
    try:
        return jsonify(triar(path))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


_domar_jobs = {}


def _run_domar(job_id, kw):
    from dsp.domar import domar
    job = _domar_jobs[job_id]
    try:
        job.update(domar(**kw))
        job['status'] = 'done'
        job['progress'] = 100
    except Exception as e:
        job['status'] = 'error'
        job['error'] = str(e)


@app.route('/api/domar', methods=['POST'])
def api_domar():
    """Conserta a cama depois de esticar: notch -> shelf escuro -> teto -> achatar -> limiter.

    Sempre mede antes E depois — correcao so entra com numero dos dois lados. Render
    de cama longa demora minutos, entao roda em job; `so_medir` responde na hora.
    """
    import threading, uuid

    body = request.get_json(silent=True) or {}
    path = (body.get('path') or '').strip()
    if not path:
        return jsonify({'error': 'informe path'}), 400
    if not os.path.exists(path):
        return jsonify({'error': 'file not found: %s' % path}), 404

    kw = {'entrada': path, 'so_medir': bool(body.get('so_medir'))}
    # Os quatro ultimos sao a camada de GOSTO da rota /eq (grave e reverb). Todos
    # default 0/desligado no `domar()`, entao chamada que nao os manda sai identica
    # ao que saia antes deles existirem.
    for k, conv in (('alvo_faixa', float), ('limiar_pico', float), ('corte_pico', float),
                    ('escuro_hz', float), ('escuro_db', float), ('teto_hz', float),
                    ('forca', float), ('alvo_lufs', float), ('achatar', bool),
                    ('grave_db', float), ('grave_hz', float),
                    ('reverb_wet', float), ('reverb_decay', float)):
        if body.get(k) is not None:
            kw[k] = conv(body[k])

    if kw['so_medir']:
        from dsp.domar import domar
        try:
            return jsonify(domar(**kw))
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    saida = (body.get('out') or '').strip()
    if not saida:
        base, _ext = os.path.splitext(path)
        saida = base + '_domado.mp3'
    kw['saida'] = saida

    job_id = uuid.uuid4().hex[:12]
    _domar_jobs[job_id] = {'status': 'running', 'progress': 0, 'out': saida}
    threading.Thread(target=_run_domar, args=(job_id, kw), daemon=True).start()
    return jsonify({'job_id': job_id, 'status': 'running', 'out': saida})


@app.route('/api/domar/status/<job_id>', methods=['GET'])
def api_domar_status(job_id):
    job = _domar_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'job not found'}), 404
    return jsonify(job)


_ytdl_jobs = {}

def _run_ytdl(job_id, cmd, out_path, assets_dir, file_prefix):
    import subprocess, re as _re
    job = _ytdl_jobs[job_id]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            low = line.lower()
            if 'post-process' in low or 'extracting audio' in low or 'converting' in low or 'merging' in low:
                job['phase'] = 'processing'
            m = _re.search(r'(\d+(?:\.\d+)?)%', line)
            if m and job['phase'] == 'downloading':
                job['progress'] = float(m.group(1))
        proc.wait()
        if proc.returncode != 0:
            job['status'] = 'error'
            job['error'] = 'yt-dlp exited with error'
            return
        final = out_path
        if not os.path.exists(final):
            candidates = [f for f in os.listdir(assets_dir) if f.startswith(file_prefix)]
            if candidates:
                final = os.path.join(assets_dir, sorted(candidates)[-1])
            else:
                job['status'] = 'error'
                job['error'] = 'download produced no file'
                return
        job['path'] = final
        job['progress'] = 100
        job['phase'] = 'done'
        job['status'] = 'done'
    except FileNotFoundError:
        job['status'] = 'error'
        job['error'] = 'yt-dlp not found — pip install yt-dlp'
    except Exception as e:
        job['status'] = 'error'
        job['error'] = str(e)


@app.route('/api/yt-download', methods=['GET', 'POST'])
def yt_download():
    import re, time
    data  = request.json or {} if request.method == 'POST' else {}
    url      = (data.get('url') or request.args.get('url', '')).strip()
    start    = (data.get('start') or request.args.get('start', '')).strip()
    end      = (data.get('end') or request.args.get('end', '')).strip()
    fmt      = (data.get('format') or request.args.get('format', 'mp3')).strip().lower()
    filename = (data.get('filename') or request.args.get('filename', '')).strip()
    if fmt not in ('mp3', 'mp4'):
        return jsonify({'error': 'format must be mp3 or mp4'}), 400
    if not url:
        return jsonify({'error': 'missing url'}), 400

    assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
    os.makedirs(assets_dir, exist_ok=True)

    if filename:
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', filename)
        if not safe_name.lower().endswith(f'.{fmt}'):
            safe_name += f'.{fmt}'
        out_path = os.path.join(assets_dir, safe_name)
    else:
        slug = re.sub(r'[^a-zA-Z0-9]', '_', url)[-40:]
        trim_tag = f'_{start.replace(":","")}-{end.replace(":","")}'.rstrip('-') if (start or end) else ''
        out_path = os.path.join(assets_dir, f'yt_{slug}{trim_tag}.{fmt}')

    if os.path.exists(out_path):
        return jsonify({'path': out_path, 'status': 'done', 'progress': 100})

    if fmt == 'mp3':
        cmd = ['yt-dlp', '-x', '--audio-format', 'mp3', '--audio-quality', '0',
               '--newline', '-o', out_path, '--no-playlist']
    else:
        cmd = ['yt-dlp', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
               '--merge-output-format', 'mp4',
               '--newline', '-o', out_path, '--no-playlist']

    if start or end:
        section = f'*{start or "0"}-{end or "inf"}'
        cmd += ['--download-sections', section, '--force-keyframes-at-cuts']

    cmd.append(url)

    file_prefix = os.path.splitext(os.path.basename(out_path))[0]
    job_id = f'ytdl_{int(time.time()*1000)}'
    _ytdl_jobs[job_id] = {'status': 'downloading', 'progress': 0, 'phase': 'downloading', 'path': '', 'error': ''}
    t = threading.Thread(target=_run_ytdl, args=(job_id, cmd, out_path, assets_dir, file_prefix), daemon=True)
    t.start()
    return jsonify({'job_id': job_id})


@app.route('/api/yt-download/status/<job_id>')
def yt_download_status(job_id):
    job = _ytdl_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'unknown job'}), 404
    return jsonify(job)


# ── Open in Explorer ────────────────────────────────────────────────────────

@app.route('/api/open-explorer', methods=['POST'])
def open_explorer():
    import subprocess
    path = (request.json or {}).get('path', '').strip()
    if not path:
        return jsonify({'error': 'missing path'}), 400
    abs_path = os.path.abspath(path)
    subprocess.Popen(['explorer', '/select,', abs_path])
    return jsonify({'status': 'ok'})


# ── Assets list ─────────────────────────────────────────────────────────────

@app.route('/api/assets/list', methods=['GET'])
def list_assets():
    assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
    if not os.path.isdir(assets_dir):
        return jsonify([])
    AUDIO_EXTS = {'.wav', '.mp3', '.ogg', '.webm', '.m4a', '.mp4', '.flac'}
    folder_filter = request.args.get('folder', '').strip()
    files = []
    for root, _dirs, filenames in os.walk(assets_dir):
        rel = os.path.relpath(root, assets_dir)
        folder = '' if rel == '.' else rel.replace('\\', '/')
        for f in sorted(filenames):
            ext = os.path.splitext(f)[1].lower()
            if ext not in AUDIO_EXTS:
                continue
            if folder_filter and folder != folder_filter and not f.lower().startswith(folder_filter.lower()):
                continue
            full = os.path.join(root, f)
            stat = os.stat(full)
            files.append({
                'name': f,
                'path': os.path.abspath(full),
                'folder': folder or folder_filter if f.lower().startswith(folder_filter.lower()) else folder,
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                'size': stat.st_size,
            })
    return jsonify(files)


# ── Strudel samples map ─────────────────────────────────────────────────────
#
# O sintoma que esta secao tem que parar de produzir: SILENCIO SEM RECADO.
# Quando alguma coisa aqui falha, o take toca, o relogio anda, a linha do tempo
# desenha — e nao sai som. Quem nao e dev procura o defeito no volume.
#
# Duas armadilhas ja pagas, documentadas pra nao voltarem:
#
# 1. As raizes permitidas eram preenchidas DENTRO de `/strudel-map`. Um reload
#    do servidor com a aba ja aberta deixava `/samples/file` respondendo 403 em
#    tudo ate alguem pedir o mapa de novo — e 403 em audio nao aparece em lugar
#    nenhum, so some o som. Agora saem do import, junto com o processo.
#
# 2. A varredura anda 21 bancos / centenas de arquivos a cada chamada. Lenta o
#    bastante pra a aba desistir antes da resposta em disco frio. Agora tem
#    cache com TTL e `?fresh=1` pra forcar.

EXTRA_SAMPLE_DIRS = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'auto-video-editor-ai', 'scripts', '.render-assets', 'ambient')),
]

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'assets', 'samples'))

# Calculado no IMPORT, nao numa rota: ver armadilha 1 acima.
_ALLOWED_SAMPLE_ROOTS = [SAMPLES_DIR] + [os.path.abspath(d) for d in EXTRA_SAMPLE_DIRS]

AUDIO_EXTS = {'.wav', '.mp3', '.ogg', '.flac', '.webm', '.m4a'}

_sample_map_cache = {'quando': 0.0, 'mapa': None}
SAMPLE_MAP_TTL = 60.0  # s


def _walk_sample_dir(base_dir, result, prefix=''):
    """Uma pasta com audio = um banco. Nome do banco = caminho relativo em slug."""
    import re
    if not os.path.isdir(base_dir):
        return
    for root, _dirs, filenames in os.walk(base_dir):
        audio_files = sorted(
            f for f in filenames
            if os.path.splitext(f)[1].lower() in AUDIO_EXTS
        )
        if not audio_files:
            continue
        rel = os.path.relpath(root, base_dir).replace(os.sep, '/')
        slug = re.sub(r'[^a-zA-Z0-9]+', '_', rel).strip('_').lower()
        if not slug or slug == '.':
            slug = prefix or 'local'
        elif prefix:
            slug = f'{prefix}_{slug}'
        result[slug] = [os.path.abspath(os.path.join(root, f)) for f in audio_files]


def _build_sample_map():
    result = {}
    _walk_sample_dir(SAMPLES_DIR, result)
    for extra in EXTRA_SAMPLE_DIRS:
        _walk_sample_dir(extra, result, 'ambient')
    return result


def _sample_map(fresh=False):
    import time
    agora = time.time()
    fresco = agora - _sample_map_cache['quando'] < SAMPLE_MAP_TTL
    if not fresh and _sample_map_cache['mapa'] is not None and fresco:
        return _sample_map_cache['mapa']
    mapa = _build_sample_map()
    _sample_map_cache['mapa'] = mapa
    _sample_map_cache['quando'] = agora
    return mapa


@app.route('/api/samples/strudel-map', methods=['GET'])
def strudel_sample_map():
    fresh = request.args.get('fresh', '') in ('1', 'true', 'yes')
    return jsonify(_sample_map(fresh=fresh))


@app.route('/api/samples/health', methods=['GET'])
def samples_health():
    """
    Por que o banco esta vazio — em portugues, pra tela poder repetir.

    Existe porque "o backend devolveu um mapa vazio" nao e diagnostico: pode ser
    pasta que nao existe, pasta vazia, ou disco fora do ar. Sao consertos
    diferentes, e sem nomear qual e a pessoa so tem a opcao de chutar. Quem
    responde essa pergunta e quem tem o disco na mao, que e este processo.
    """
    mapa = _sample_map(fresh=request.args.get('fresh', '') in ('1', 'true', 'yes'))
    arquivos = sum(len(v) for v in mapa.values())
    raizes, avisos = [], []
    for raiz in _ALLOWED_SAMPLE_ROOTS:
        existe = os.path.isdir(raiz)
        # Conta por raiz varrendo SO ela: dizer "243 bancos" nao ajuda quem
        # precisa saber QUAL das duas pastas sumiu.
        proprio = {}
        if existe:
            _walk_sample_dir(raiz, proprio)
        raizes.append({
            'caminho': raiz,
            'existe': existe,
            'bancos': len(proprio),
            'arquivos': sum(len(v) for v in proprio.values()),
        })
        if not existe:
            avisos.append(f'a pasta {raiz} nao existe neste computador')
        elif not proprio:
            avisos.append(f'a pasta {raiz} existe mas nao tem nenhum audio dentro')
    if not mapa:
        avisos.append('nenhuma pasta com audio foi encontrada — o take vai tocar mudo')
    return jsonify({
        'ok': bool(mapa) and not avisos,
        'bancos': len(mapa),
        'arquivos': arquivos,
        'raizes': raizes,
        'avisos': avisos,
        'cache_em_segundos': SAMPLE_MAP_TTL,
    })


@app.route('/api/samples/file', methods=['GET'])
def serve_sample_file():
    path = request.args.get('path', '')
    if not path or not os.path.isfile(path):
        return jsonify({'error': 'not found'}), 404
    abs_path = os.path.abspath(path)
    if not any(abs_path.startswith(root) for root in _ALLOWED_SAMPLE_ROOTS):
        return jsonify({'error': 'forbidden'}), 403
    ext = os.path.splitext(path)[1].lower()
    mime = {
        '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
        '.flac': 'audio/flac', '.webm': 'audio/webm', '.m4a': 'audio/mp4',
    }.get(ext, 'application/octet-stream')
    directory = os.path.dirname(abs_path)
    filename = os.path.basename(abs_path)
    resp = send_from_directory(directory, filename, mimetype=mime)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


# ── Waveform peaks (server-side, cached) ────────────────────────────────────

_peaks_cache: dict = {}  # abs_path → [float]

@app.route('/api/audio/peaks', methods=['GET'])
def audio_peaks():
    import subprocess as _sp, struct as _struct
    path = request.args.get('path', '').strip()
    buckets = min(int(request.args.get('buckets', '80')), 200)
    if not path or not os.path.isfile(path):
        return jsonify({'error': 'not found'}), 404

    cache_key = f"{path}:{buckets}"
    if cache_key in _peaks_cache:
        return jsonify(_peaks_cache[cache_key])

    try:
        cmd = [
            'ffmpeg', '-i', path,
            '-ac', '1', '-ar', '8000', '-f', 's16le',
            '-acodec', 'pcm_s16le', '-v', 'quiet', '-'
        ]
        proc = _sp.run(cmd, capture_output=True, timeout=15)
        if proc.returncode != 0:
            return jsonify({'error': 'decode failed'}), 500

        raw = proc.stdout
        samples = _struct.unpack(f'<{len(raw)//2}h', raw)
        total = len(samples)
        step = max(1, total // buckets)
        peaks = []
        for i in range(buckets):
            start = i * step
            chunk = samples[start:start + step]
            if chunk:
                peaks.append(max(abs(s) for s in chunk) / 32768.0)
            else:
                peaks.append(0.0)
        mx = max(peaks) if peaks else 1.0
        if mx > 0:
            peaks = [round(v / mx, 3) for v in peaks]

        _peaks_cache[cache_key] = peaks
        return jsonify(peaks)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Audio normalize (loudnorm) ───────────────────────────────────────────────

_norm_jobs: dict = {}  # job_id → { status, progress, path, error }

@app.route('/api/audio/normalize', methods=['POST'])
def audio_normalize():
    import subprocess as _sp
    data = request.json or {}
    path = data.get('path', '').strip()
    target_lufs = data.get('target_lufs', -16)
    if not path or not os.path.isfile(path):
        return jsonify({'error': 'file not found'}), 400
    try:
        target_lufs = float(target_lufs)
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid target_lufs'}), 400

    base, ext = os.path.splitext(path)
    out_path = f"{base}_balanced{ext}"
    job_id = str(_uuid.uuid4())
    _norm_jobs[job_id] = {'status': 'running', 'progress': 0, 'path': None, 'error': None}

    def _run():
        try:
            # Pass 1: measure loudness
            cmd1 = [
                'ffmpeg', '-y', '-i', path,
                '-af', f'loudnorm=I={target_lufs}:print_format=json',
                '-f', 'null', '-'
            ]
            r1 = _sp.run(cmd1, capture_output=True, text=True)
            # Parse measured values from stderr
            import json as _json
            stderr = r1.stderr
            json_start = stderr.rfind('{')
            json_end = stderr.rfind('}')
            if json_start == -1 or json_end == -1:
                raise RuntimeError('loudnorm pass 1 failed: no JSON output')
            measured = _json.loads(stderr[json_start:json_end + 1])
            _norm_jobs[job_id]['progress'] = 50
            # Pass 2: apply normalization
            af = (
                f"loudnorm=I={target_lufs}"
                f":measured_I={measured['input_i']}"
                f":measured_LRA={measured['input_lra']}"
                f":measured_TP={measured['input_tp']}"
                f":measured_thresh={measured['input_thresh']}"
                f":linear=true:print_format=summary"
            )
            cmd2 = ['ffmpeg', '-y', '-i', path, '-af', af, out_path]
            r2 = _sp.run(cmd2, capture_output=True, text=True)
            if r2.returncode != 0:
                raise RuntimeError(r2.stderr[-500:])
            _norm_jobs[job_id].update({'status': 'done', 'progress': 100, 'path': os.path.abspath(out_path)})
        except Exception as e:
            _norm_jobs[job_id].update({'status': 'error', 'error': str(e)})

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({'job_id': job_id, 'status': 'running'})

@app.route('/api/audio/normalize/status/<job_id>', methods=['GET'])
def audio_normalize_status(job_id):
    job = _norm_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'unknown job'}), 404
    return jsonify(job)


# ── WAV → MP3 converter ──────────────────────────────────────────────────────

import uuid as _uuid
_conv_jobs: dict = {}  # job_id → { status, progress, path, error }

@app.route('/api/convert/wav-to-mp3', methods=['POST'])
def convert_wav_to_mp3():
    import subprocess, threading, re
    data = request.json or {}
    path    = data.get('path', '').strip()
    bitrate = data.get('bitrate', '192k').strip()
    output  = data.get('output', '').strip()

    if bitrate not in ('128k', '192k', '320k'):
        return jsonify({'error': 'invalid bitrate'}), 400
    if not path or not os.path.isfile(path):
        return jsonify({'error': 'file not found'}), 400

    if output:
        out_path = output
    else:
        base, _ = os.path.splitext(path)
        out_path = base + '.mp3'
        if os.path.abspath(out_path) == os.path.abspath(path):
            out_path = base + '_converted.mp3'

    job_id = _uuid.uuid4().hex[:12]
    _conv_jobs[job_id] = {'status': 'converting', 'progress': 0, 'path': '', 'error': ''}

    def run():
        try:
            # get duration first
            dur_r = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', path],
                capture_output=True, timeout=10
            )
            import json as _j
            total_secs = float(_j.loads(dur_r.stdout).get('format', {}).get('duration', 0) or 0)

            proc = subprocess.Popen(
                ['ffmpeg', '-y', '-i', path, '-codec:a', 'libmp3lame', '-b:a', bitrate,
                 '-progress', 'pipe:2', out_path],
                stderr=subprocess.PIPE, stdout=subprocess.DEVNULL
            )
            for line in proc.stderr:
                txt = line.decode(errors='ignore').strip()
                m = re.search(r'out_time_ms=(\d+)', txt)
                if m and total_secs > 0:
                    pct = min(99, int(int(m.group(1)) / 1_000_000 / total_secs * 100))
                    _conv_jobs[job_id]['progress'] = pct
            proc.wait(timeout=300)
            if proc.returncode != 0:
                _conv_jobs[job_id].update({'status': 'error', 'error': 'ffmpeg failed'})
            else:
                _conv_jobs[job_id].update({'status': 'done', 'progress': 100, 'path': os.path.abspath(out_path)})
        except Exception as e:
            _conv_jobs[job_id].update({'status': 'error', 'error': str(e)})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'job_id': job_id})


@app.route('/api/convert/status/<job_id>', methods=['GET'])
def convert_status(job_id):
    job = _conv_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'job not found'}), 404
    return jsonify(job)


# ── Session Builder: multi-track audio + visual → MP4 ───────────────────────

@app.route('/api/session/build', methods=['POST'])
def session_build():
    import subprocess, threading, tempfile, re as _re, json as _j
    data = request.json or {}
    audio_paths = [p.strip() for p in data.get('audio_paths', [])]
    visual_path = data.get('visual_path', '').strip()
    visual_type = data.get('visual_type', 'image')   # 'image' | 'video'
    xfade_sec   = max(0.0, float(data.get('xfade_sec', 1.0)))
    output_name = (data.get('output_name', '') or 'session').strip()
    ps_factor   = float(data.get('ps_factor', 1.0))
    ps_window   = float(data.get('ps_window', 0.25))

    if not audio_paths:
        return jsonify({'error': 'no audio_paths provided'}), 400
    if not visual_path or not os.path.isfile(visual_path):
        return jsonify({'error': 'visual file not found'}), 400
    for p in audio_paths:
        if not os.path.isfile(p):
            return jsonify({'error': f'audio file not found: {p}'}), 400

    job_id = _uuid.uuid4().hex[:12]
    _conv_jobs[job_id] = {'status': 'building', 'progress': 0, 'path': '', 'error': ''}

    def run():
        tmp_wav = None
        try:
            assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
            os.makedirs(assets_dir, exist_ok=True)
            out_path = os.path.join(assets_dir, f'{output_name}_{job_id[:6]}.mp4')

            # ── Step 1: merge audio tracks (with acrossfade if 2+) ──────────
            if len(audio_paths) == 1:
                merged_wav = audio_paths[0]
            else:
                tmp_wav = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
                tmp_wav.close()
                merged_wav = tmp_wav.name

                n = len(audio_paths)
                inputs = []
                for p in audio_paths:
                    inputs += ['-i', p]

                # Build acrossfade filter chain
                parts, prev = [], '[0:a]'
                for i in range(1, n):
                    label = '[outa]' if i == n - 1 else f'[cf{i}]'
                    parts.append(f'{prev}[{i}:a]acrossfade=d={xfade_sec}:c1=tri:c2=tri{label}')
                    prev = f'[cf{i}]' if i < n - 1 else '[outa]'
                filter_str = ';'.join(parts)

                cmd = ['ffmpeg', '-y'] + inputs + [
                    '-filter_complex', filter_str,
                    '-map', '[outa]',
                    '-ar', '44100', '-ac', '2',
                    merged_wav,
                ]
                r = subprocess.run(cmd, capture_output=True, timeout=600)
                if r.returncode != 0:
                    err = r.stderr.decode(errors='ignore')[-400:]
                    _conv_jobs[job_id].update({'status': 'error', 'error': err})
                    return

            _conv_jobs[job_id]['progress'] = 50

            # ── Step 1b: apply Paulstretch if requested ───────────────────────
            if ps_factor > 1.0:
                _conv_jobs[job_id].update({'status': 'building', 'progress': 52, 'ps_active': True})
                ps_in  = tempfile.NamedTemporaryFile(suffix='_psin.wav',  delete=False)
                ps_out = tempfile.NamedTemporaryFile(suffix='_psout.wav', delete=False)
                ps_in.close(); ps_out.close()
                try:
                    import numpy as np
                    from scipy.io import wavfile as _wf

                    # decode to raw WAV
                    dec = subprocess.run(
                        ['ffmpeg', '-y', '-i', merged_wav, '-ar', '44100', '-ac', '2', ps_in.name],
                        capture_output=True, timeout=600,
                    )
                    if dec.returncode != 0:
                        raise RuntimeError('ffmpeg PS decode: ' + dec.stderr.decode(errors='ignore')[-300:])

                    sr, raw = _wf.read(ps_in.name)
                    if raw.dtype == np.int16:
                        audio = raw.astype(np.float32) / 32768.0
                    elif raw.dtype == np.int32:
                        audio = raw.astype(np.float32) / 2147483648.0
                    else:
                        audio = raw.astype(np.float32)

                    stretched = _paulstretch(sr, audio, ps_factor, ps_window)
                    out_int16 = np.clip(stretched * 32767, -32768, 32767).astype(np.int16)
                    _wf.write(ps_out.name, sr, out_int16)

                    # swap merged_wav to stretched output
                    if tmp_wav:
                        try: os.unlink(tmp_wav.name)
                        except: pass
                    tmp_wav   = ps_out
                    merged_wav = ps_out.name
                except Exception as ps_err:
                    _conv_jobs[job_id].update({'status': 'error', 'error': f'PS error: {ps_err}'})
                    return
                finally:
                    try: os.unlink(ps_in.name)
                    except: pass

            # ── Step 2: get merged audio duration for progress tracking ──────
            dur_r = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', merged_wav],
                capture_output=True, timeout=10,
            )
            total_secs = float(_j.loads(dur_r.stdout).get('format', {}).get('duration', 0) or 1)

            # ── Step 3: combine audio with visual → MP4 ──────────────────────
            if visual_type == 'image':
                cmd_v = [
                    'ffmpeg', '-y',
                    '-loop', '1', '-i', visual_path,
                    '-i', merged_wav,
                    '-c:v', 'libx264', '-tune', 'stillimage',
                    '-c:a', 'aac', '-b:a', '192k',
                    '-shortest', '-pix_fmt', 'yuv420p',
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                    '-progress', 'pipe:2',
                    out_path,
                ]
            else:  # video loop
                cmd_v = [
                    'ffmpeg', '-y',
                    '-stream_loop', '-1', '-i', visual_path,
                    '-i', merged_wav,
                    '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k',
                    '-shortest',
                    '-map', '0:v:0', '-map', '1:a:0',
                    '-progress', 'pipe:2',
                    out_path,
                ]

            proc = subprocess.Popen(cmd_v, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL)
            for line in proc.stderr:
                txt = line.decode(errors='ignore').strip()
                m = _re.search(r'out_time_ms=(\d+)', txt)
                if m and total_secs > 0:
                    pct = 50 + min(49, int(int(m.group(1)) / 1_000_000 / total_secs * 50))
                    _conv_jobs[job_id]['progress'] = pct
            proc.wait(timeout=7200)

            if proc.returncode != 0:
                _conv_jobs[job_id].update({'status': 'error', 'error': 'ffmpeg video combine failed'})
            else:
                _conv_jobs[job_id].update({
                    'status': 'done', 'progress': 100,
                    'path': os.path.abspath(out_path),
                })
        except Exception as e:
            _conv_jobs[job_id].update({'status': 'error', 'error': str(e)})
        finally:
            if tmp_wav:
                try: os.unlink(tmp_wav.name)
                except: pass

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'job_id': job_id})


# ── Audio toggle state (per-key subprocess tracking) ────────────────────────
import subprocess as _subprocess

_audio_procs: dict = {}  # key_id → Popen

@app.route('/api/audio/play-toggle', methods=['POST'])
def audio_play_toggle():
    data = request.json or {}
    key = data.get('key', '')
    path = data.get('path', '')

    proc = _audio_procs.get(key)
    if proc and proc.poll() is None:
        proc.kill()
        _audio_procs.pop(key, None)
        return jsonify({'status': 'stopped'})

    if not path or not os.path.isfile(path):
        return jsonify({'error': 'file not found'}), 404

    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mixer_controller.py')
    p = _subprocess.Popen(['python', script_path, path])
    _audio_procs[key] = p
    return jsonify({'status': 'playing'})


@app.route('/api/audio/stop-all', methods=['POST'])
def audio_stop_all():
    stopped = []
    for key, proc in list(_audio_procs.items()):
        if proc.poll() is None:
            proc.kill()
            stopped.append(key)
    _audio_procs.clear()
    return jsonify({'status': 'ok', 'stopped': stopped})


# ── Key-event bridge (AHK → Python → Flask → React UI) ──────────────────────
import queue as _queue
_key_event_queue: _queue.Queue = _queue.Queue(maxsize=64)

@app.route('/api/key-event', methods=['POST'])
def post_key_event():
    data = request.json or {}
    key = data.get('key', '')
    if key:
        try:
            _key_event_queue.put_nowait({'key': key})
        except _queue.Full:
            pass
    return jsonify({'status': 'ok'})

@app.route('/api/key-event/poll', methods=['GET'])
def poll_key_event():
    """Returns immediately with pending key press, or empty after timeout."""
    import time
    timeout = float(request.args.get('timeout', 2))
    deadline = time.time() + min(timeout, 5)
    while time.time() < deadline:
        try:
            ev = _key_event_queue.get_nowait()
            return jsonify(ev)
        except _queue.Empty:
            time.sleep(0.05)
    return jsonify({})

# ── Jam bridge (Claude Code CLI ↔ AnalogBrain) ───────────────────────────────
# Revisão numerada + poll. Ninguém sobrescreve ninguém: push só incrementa rev,
# quem decide o que toca é sempre o painel.
_JAM_FILE = os.path.join(os.path.dirname(__file__), 'jam_session.json')
_PATTERNS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'patterns'))
_JAM_LOG_MAX = 50
_jam_lock = threading.Lock()

_jam_state = {
    'rev': 0,
    'code': '',
    'author': 'user',
    'message': '',
    'bpm': 120,
    'playing': False,
    'error': None,
    'accepted_rev': 0,
    'prop_bpm': 0,
    'ts': 0.0,
}
_jam_log: list = []


def _jam_load():
    try:
        with open(_JAM_FILE, encoding='utf-8') as f:
            data = json.load(f)
        _jam_state.update(data.get('state', {}))
        _jam_log[:] = data.get('log', [])[-_JAM_LOG_MAX:]
    except Exception:
        pass


def _jam_persist():
    try:
        with open(_JAM_FILE, 'w', encoding='utf-8') as f:
            json.dump({'state': _jam_state, 'log': _jam_log}, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


_jam_load()


@app.route('/api/jam/state', methods=['GET'])
def jam_state():
    """Estado atual da jam. Painel faz poll; CLI lê via jam.py get."""
    with _jam_lock:
        return jsonify(dict(_jam_state))


@app.route('/api/jam/push', methods=['POST'])
def jam_push():
    """Nova revisão. author='claude' entra como proposta, não sobrescreve o editor."""
    import time
    data = request.json or {}
    code = data.get('code', '')
    if not str(code).strip():
        return jsonify({'error': 'code vazio'}), 400
    author = 'claude' if data.get('author') == 'claude' else 'user'
    with _jam_lock:
        _jam_state['rev'] += 1
        _jam_state['code'] = code
        _jam_state['author'] = author
        _jam_state['message'] = data.get('message', '')
        _jam_state['ts'] = time.time()
        if data.get('bpm'):
            if author == 'claude':
                _jam_state['prop_bpm'] = int(data['bpm'])
            else:
                _jam_state['bpm'] = int(data['bpm'])
        elif author == 'claude':
            _jam_state['prop_bpm'] = 0
        # revisão nova = erro antigo não vale mais
        _jam_state['error'] = None
        if author == 'user':
            _jam_state['accepted_rev'] = _jam_state['rev']
        _jam_log.append({
            'rev': _jam_state['rev'],
            'author': author,
            'message': _jam_state['message'],
            'code': code,
            'ts': _jam_state['ts'],
        })
        del _jam_log[:-_JAM_LOG_MAX]
        _jam_persist()
        return jsonify({'status': 'ok', 'rev': _jam_state['rev']})


@app.route('/api/jam/feedback', methods=['POST'])
def jam_feedback():
    """Painel devolve resultado do eval — é isso que me deixa consertar sintaxe."""
    data = request.json or {}
    with _jam_lock:
        for k in ('error', 'playing', 'bpm', 'accepted_rev'):
            if k in data:
                _jam_state[k] = data[k]
        _jam_persist()
        return jsonify({'status': 'ok'})


@app.route('/api/jam/log', methods=['GET'])
def jam_log():
    n = max(1, min(int(request.args.get('n', 20)), _JAM_LOG_MAX))
    full = request.args.get('code') == '1'
    with _jam_lock:
        items = _jam_log[-n:]
        if not full:
            items = [{k: v for k, v in it.items() if k != 'code'} for it in items]
        return jsonify(list(reversed(items)))


def _pattern_path(name: str) -> str:
    """Resolve nome → patterns/<slug>.js, barrando path traversal."""
    slug = str(name).strip()
    # Recusa em vez de sanitizar: nome "../x" viraria "x" e salvaria no arquivo errado.
    if not slug or not all(c.isalnum() or c in '-_' for c in slug):
        raise ValueError('nome inválido: use letras, números, - e _')
    path = os.path.abspath(os.path.join(_PATTERNS_DIR, slug + '.js'))
    if os.path.dirname(path) != _PATTERNS_DIR:
        raise ValueError('nome inválido')
    return path





# ── Acervo de músicas (rota /musica) ─────────────────────────────────────────
# A música é um .js legível em patterns/. O histórico é um .jsonl append-only ao
# lado: escrita nova nunca corrompe versão velha, e um `tail` resolve o debug.
# Nada aqui apaga: excluir move pra .trash/, restaurar salva versão NOVA.
_VERSIONS_DIR = os.path.join(_PATTERNS_DIR, '.versions')
_TRASH_DIR = os.path.join(_PATTERNS_DIR, '.trash')


def _song_paths(name):
    """(.js, .jsonl) do nome dado. Recusa nome torto em vez de sanitizar."""
    js = _pattern_path(name)                      # ja valida o nome
    slug = os.path.splitext(os.path.basename(js))[0]
    return js, os.path.join(_VERSIONS_DIR, slug + '.jsonl')


def _read_versions(jsonl):
    out = []
    try:
        with open(jsonl, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    out.append(json.loads(line))
                except Exception:
                    continue          # linha torta nao derruba o historico inteiro
    except FileNotFoundError:
        pass
    return out


def _append_version(name, code, author, message, bpm):
    import time
    js, jsonl = _song_paths(name)
    os.makedirs(_VERSIONS_DIR, exist_ok=True)
    # bpm herda da versao anterior quando nao vem: um comentario ou um save sem
    # tempo nao pode APAGAR o andamento da musica. Aconteceu — a tela abriu em 120
    # uma musica de 122 porque o comentario anterior gravou bpm 0.
    if not bpm:
        anteriores = _read_versions(jsonl)
        for v in reversed(anteriores):
            if v.get('bpm'):
                bpm = v['bpm']
                break
    entry = {
        'ts': time.time(),
        'author': 'claude' if author == 'claude' else 'user',
        'message': message or '',
        'bpm': int(bpm or 0),
        'code': code,
    }
    with open(jsonl, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    with open(js, 'w', encoding='utf-8') as f:
        f.write(code.rstrip() + '\n')
    return entry


def _ultimo_bpm(versions):
    """Ultimo bpm NAO-ZERO. Historico antigo tem versao com bpm 0 gravado; ler o
    ultimo cegamente faria a tela abrir uma musica de 122 em 120."""
    for v in reversed(versions):
        if v.get('bpm'):
            return v['bpm']
    return 0


def _song_summary(slug, favoritos=None):
    js, jsonl = _song_paths(slug)
    versions = _read_versions(jsonl)
    last = versions[-1] if versions else {}
    try:
        mtime = os.path.getmtime(js)
    except OSError:
        mtime = 0.0
    if favoritos is None:
        favoritos = _read_favoritos()
    return {
        'name': slug,
        'favorito': slug in favoritos,
        'versions': len(versions),
        'bpm': _ultimo_bpm(versions),
        'author': last.get('author') or 'user',
        'message': last.get('message') or '',
        'ts': last.get('ts') or mtime,
    }


@app.route('/api/songs', methods=['GET'])
def songs_list():
    try:
        slugs = sorted(f[:-3] for f in os.listdir(_PATTERNS_DIR) if f.endswith('.js'))
    except FileNotFoundError:
        slugs = []
    favoritos = _read_favoritos()          # le o arquivo UMA vez, nao uma por musica
    items = [_song_summary(s, favoritos) for s in slugs]
    items.sort(key=lambda it: it['ts'], reverse=True)   # mexida mais recente primeiro
    return jsonify(items)


@app.route('/api/songs/<name>', methods=['GET'])
def song_get(name):
    try:
        js, jsonl = _song_paths(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    try:
        with open(js, encoding='utf-8') as f:
            code = f.read()
    except FileNotFoundError:
        return jsonify({'error': 'nao existe'}), 404
    # Lista de versoes SEM o codigo de cada uma: 40 versoes de 2 KB viram 80 KB por
    # clique na lista. O codigo de uma versao vem em /v/<i>, quando pedido.
    versions = [
        {'i': i, 'ts': v.get('ts'), 'author': v.get('author'),
         'message': v.get('message'), 'bpm': v.get('bpm'),
         'chars': len(v.get('code') or '')}
        for i, v in enumerate(_read_versions(jsonl))
    ]
    return jsonify({'name': name, 'code': code, 'versions': versions,
                    'favorito': name in _read_favoritos(),
                    'bpm': _ultimo_bpm(_read_versions(jsonl))})


@app.route('/api/songs/<name>', methods=['POST'])
def song_save(name):
    data = request.json or {}
    code = data.get('code') or ''
    if not str(code).strip():
        return jsonify({'error': 'nada pra salvar'}), 400
    try:
        _song_paths(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    os.makedirs(_PATTERNS_DIR, exist_ok=True)
    entry = _append_version(name, code, data.get('author', 'user'),
                            data.get('message', ''), data.get('bpm', 0))
    _, jsonl = _song_paths(name)
    return jsonify({'status': 'ok', 'name': name,
                    'version': len(_read_versions(jsonl)) - 1, 'ts': entry['ts']})


@app.route('/api/songs/<name>/v/<int:i>', methods=['GET'])
def song_version(name, i):
    try:
        _, jsonl = _song_paths(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    versions = _read_versions(jsonl)
    if not 0 <= i < len(versions):
        return jsonify({'error': 'versao nao existe'}), 404
    v = versions[i]
    return jsonify({'i': i, 'code': v.get('code') or '', 'ts': v.get('ts'),
                    'author': v.get('author'), 'message': v.get('message'),
                    'bpm': v.get('bpm')})


@app.route('/api/songs/<name>/restore/<int:i>', methods=['POST'])
def song_restore(name, i):
    """Restaurar SALVA uma versao nova. A linha do tempo nunca perde um elo."""
    try:
        _, jsonl = _song_paths(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    versions = _read_versions(jsonl)
    if not 0 <= i < len(versions):
        return jsonify({'error': 'versao nao existe'}), 404
    v = versions[i]
    data = request.json or {}
    entry = _append_version(name, v.get('code') or '', data.get('author', 'user'),
                            data.get('message') or 'restaurado de v%d' % i,
                            v.get('bpm') or 0)
    return jsonify({'status': 'ok', 'version': len(versions), 'code': entry['code']})


@app.route('/api/songs/<name>', methods=['DELETE'])
def song_delete(name):
    """Move pra .trash/. Nada aqui apaga de verdade."""
    import time
    try:
        js, jsonl = _song_paths(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not os.path.exists(js):
        return jsonify({'error': 'nao existe'}), 404
    os.makedirs(_TRASH_DIR, exist_ok=True)
    stamp = int(time.time())
    slug = os.path.splitext(os.path.basename(js))[0]
    os.replace(js, os.path.join(_TRASH_DIR, '%s.%d.js' % (slug, stamp)))
    if os.path.exists(jsonl):
        os.replace(jsonl, os.path.join(_TRASH_DIR, '%s.%d.jsonl' % (slug, stamp)))
    favs = _read_favoritos()
    if name in favs:      # favorito de musica que nao existe mais e lixo silencioso
        _write_favoritos([n for n in favs if n != name])
    return jsonify({'status': 'ok', 'trash': _TRASH_DIR})


@app.route('/api/songs/<name>/rename', methods=['POST'])
def song_rename(name):
    novo = (request.json or {}).get('name', '')
    try:
        js, jsonl = _song_paths(name)
        js2, jsonl2 = _song_paths(novo)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not os.path.exists(js):
        return jsonify({'error': 'nao existe'}), 404
    if os.path.exists(js2):
        return jsonify({'error': 'ja existe uma musica com esse nome'}), 409
    os.replace(js, js2)
    if os.path.exists(jsonl):
        os.makedirs(_VERSIONS_DIR, exist_ok=True)
        os.replace(jsonl, jsonl2)
    favs = _read_favoritos()
    if name in favs:      # favorito segue a musica; nao fica preso ao nome velho
        _write_favoritos([novo if n == name else n for n in favs])
    return jsonify({'status': 'ok', 'name': novo})


# ── favoritos ────────────────────────────────────────────────────────────────
#
# Um arquivo com uma lista de nomes, e nao um campo dentro de cada versao: favorito
# e opiniao de AGORA sobre a musica, nao um fato daquela versao. Gravar junto da
# versao faria o historico responder "esta musica era favorita em marco?", que e
# pergunta que ninguem faz, e obrigaria a reescrever historico pra desfavoritar.
#
# Nome renomeado ou excluido some do arquivo junto — favorito pendurado em musica
# que nao existe vira lixo silencioso.

def _favoritos_file():
    """Calculado na hora, e nao uma constante de import: `_PATTERNS_DIR` e trocado
    em teste (monkeypatch) e um caminho congelado escreveria no acervo de verdade."""
    return os.path.join(_PATTERNS_DIR, '.favoritos.json')


def _read_favoritos():
    try:
        with open(_favoritos_file(), encoding='utf-8') as f:
            dados = json.load(f)
        return [n for n in dados if isinstance(n, str)] if isinstance(dados, list) else []
    except (OSError, ValueError):
        return []          # arquivo torto nao pode derrubar o acervo inteiro


def _write_favoritos(nomes):
    os.makedirs(_PATTERNS_DIR, exist_ok=True)
    with open(_favoritos_file(), 'w', encoding='utf-8') as f:
        json.dump(sorted(set(nomes)), f, ensure_ascii=False, indent=1)


@app.route('/api/songs/<name>/favorito', methods=['POST'])
def song_favorito(name):
    try:
        js, _ = _song_paths(name)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not os.path.exists(js):
        return jsonify({'error': 'nao existe'}), 404

    atuais = _read_favoritos()
    # get_json(silent=True), e nao request.json: sem corpo, `request.json` levanta
    # 415 no Flask novo. E chamar sem corpo e justamente a forma ergonomica —
    # `POST /favorito` alterna, que e o que a tela e o curl querem.
    pedido = (request.get_json(silent=True) or {}).get('favorito')
    novo = (name not in atuais) if pedido is None else bool(pedido)   # sem corpo = alterna
    if novo:
        atuais.append(name)
    else:
        atuais = [n for n in atuais if n != name]
    _write_favoritos(atuais)
    return jsonify({'status': 'ok', 'name': name, 'favorito': novo})


# ── YouTube live chat redirect ───────────────────────────────────────────────
_yt_live_video_id = ''

_yt_chat_msgs: list = []
_YT_CHAT_MAX = 20

@app.route('/api/yt/set-live', methods=['POST'])
def yt_set_live():
    global _yt_live_video_id
    _yt_live_video_id = (request.json or {}).get('video_id', '')
    return jsonify({'status': 'ok', 'video_id': _yt_live_video_id})

def _read_bot_cfg():
    import json as _json
    try:
        with open(CONFIG_FILE, encoding='utf-8') as f:
            return _json.load(f)
    except Exception:
        return {}

def _write_bot_cfg(cfg):
    import json as _json
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        _json.dump(cfg, f, indent=2, ensure_ascii=False)

@app.route('/api/bot/commands', methods=['GET'])
def get_bot_commands():
    cfg = _read_bot_cfg()
    cmds = cfg.get('commands', {})
    return jsonify([{'trigger': k, 'response': v} for k, v in cmds.items()])

@app.route('/api/bot/commands', methods=['POST'])
def set_bot_commands():
    items = request.json or []
    cfg = _read_bot_cfg()
    cfg['commands'] = {c['trigger']: c['response'] for c in items if c.get('trigger')}
    _write_bot_cfg(cfg)
    return jsonify({'status': 'ok'})

_mod_alerts: list = []

@app.route('/api/bot/mod-alert', methods=['POST'])
def post_mod_alert():
    alert = request.json or {}
    alert['dismissed'] = False
    _mod_alerts.append(alert)
    if len(_mod_alerts) > 50:
        _mod_alerts.pop(0)
    return jsonify({'status': 'ok'})

@app.route('/api/bot/mod-alerts', methods=['GET'])
def get_mod_alerts():
    return jsonify(_mod_alerts)

@app.route('/api/bot/mod-alerts/<msg_id>/dismiss', methods=['POST'])
def dismiss_mod_alert(msg_id):
    for a in _mod_alerts:
        if a.get('id') == msg_id:
            a['dismissed'] = True
    return jsonify({'status': 'ok'})

@app.route('/api/bot/mod-alerts/<msg_id>/delete', methods=['POST'])
def delete_mod_alert(msg_id):
    """Delete the YouTube message and dismiss the alert."""
    # The actual YT deletion is done by yt_bot.py via a queue
    _delete_queue.append(msg_id)
    for a in _mod_alerts:
        if a.get('id') == msg_id:
            a['dismissed'] = True
    return jsonify({'status': 'ok'})

_delete_queue: list = []

@app.route('/api/bot/delete-queue', methods=['GET'])
def get_delete_queue():
    items = list(_delete_queue)
    _delete_queue.clear()
    return jsonify(items)


@app.route('/api/bot/auto-msgs', methods=['GET'])
def get_auto_msgs():
    cfg = _read_bot_cfg()
    return jsonify(cfg.get('auto_msgs', []))

@app.route('/api/bot/auto-msgs', methods=['POST'])
def set_auto_msgs():
    cfg = _read_bot_cfg()
    cfg['auto_msgs'] = request.json or []
    _write_bot_cfg(cfg)
    return jsonify({'status': 'ok'})


# ── yt_bot.py process control (Streamer Focus) ───────────────────────────────
# bot_config.json é o arquivo real que o yt_bot.py lê no boot (video_id / banned).
_BOT_DIR = os.path.dirname(os.path.abspath(__file__))
BOT_CONFIG_FILE = os.path.join(_BOT_DIR, 'bot_config.json')
BOT_SCRIPT = os.path.join(_BOT_DIR, 'yt_bot.py')
BOT_LOG = os.path.join(_BOT_DIR, 'bot.log')
# yt_bot autentica por OAuth (client_secret.json -> yt_token.json), NÃO pelo api_key do config.
BOT_OAUTH_CLIENT = os.path.join(_BOT_DIR, 'client_secret.json')
BOT_TOKEN = os.path.join(_BOT_DIR, 'yt_token.json')
_bot_proc = None  # subprocess.Popen | None


def _bot_log_tail(n=6):
    try:
        with open(BOT_LOG, encoding='utf-8', errors='replace') as f:
            lines = [ln.rstrip() for ln in f.readlines() if ln.strip()]
        return lines[-n:]
    except Exception:
        return []

def _read_bot_file():
    try:
        with open(BOT_CONFIG_FILE, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def _write_bot_file(cfg):
    with open(BOT_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

def _bot_running():
    return _bot_proc is not None and _bot_proc.poll() is None

@app.route('/api/bot/status', methods=['GET'])
def bot_status():
    cfg = _read_bot_file()
    running = _bot_running()
    exit_code = None
    if _bot_proc is not None and not running:
        exit_code = _bot_proc.poll()
    return jsonify({
        'running': running,
        'pid': (_bot_proc.pid if running else None),
        'video_id': cfg.get('video_id', ''),
        # readiness real: o bot precisa de OAuth, não do api_key
        'has_oauth_client': os.path.exists(BOT_OAUTH_CLIENT),
        'has_token': os.path.exists(BOT_TOKEN),
        'exit_code': exit_code,
        'log': _bot_log_tail(),
    })

@app.route('/api/bot/toggle', methods=['POST'])
def bot_toggle():
    global _bot_proc
    import subprocess
    if _bot_running():
        try:
            _bot_proc.terminate()
        except Exception:
            pass
        _bot_proc = None
        return jsonify({'status': 'ok', 'running': False})
    # start — sem credencial o bot crasha na hora; falha explícita é melhor que crash mudo.
    # Basta o yt_token.json (gerado pelo yt_auth_helper, que reusa o OAuth client
    # do visantlabs/Drive) OU um client_secret.json próprio.
    if not os.path.exists(BOT_TOKEN) and not os.path.exists(BOT_OAUTH_CLIENT):
        return jsonify({
            'status': 'error',
            'error': 'Sem credencial do YouTube. Rode uma vez no terminal: '
                     'cd backend && python yt_auth_helper.py — ele reusa o OAuth client que você já tem '
                     '(visantlabs/Drive), não precisa baixar nada.'
        }), 400
    try:
        log = open(BOT_LOG, 'w', encoding='utf-8')
        _bot_proc = subprocess.Popen(
            ['python', '-u', BOT_SCRIPT],
            cwd=_BOT_DIR,
            stdout=log, stderr=subprocess.STDOUT,
        )
        return jsonify({'status': 'ok', 'running': True, 'pid': _bot_proc.pid})
    except Exception as e:
        _bot_proc = None
        return jsonify({'status': 'error', 'error': str(e)}), 500

_AI_DEFAULTS = {
    'enabled': False,
    'provider': 'gemini',
    'model': 'gemini-2.5-flash',
    'api_key': '',
    'base_url': '',
    'system_prompt': 'Você é o co-host de uma live. Responda em 1-2 frases, curto, direto e amigável.',
    'max_reply_chars': 200,
    'trigger': '!ai',
    'cooldown_secs': 15,
    # Marca de bot nas respostas da IA — o post sai com o OAuth do dono do canal,
    # então sem prefixo a resposta parece ter sido escrita pelo próprio streamer.
    'reply_prefix': '🤖',
}

@app.route('/api/bot/ai-config', methods=['GET', 'POST'])
def bot_ai_config():
    cfg = _read_bot_file()
    ai = {**_AI_DEFAULTS, **(cfg.get('ai') or {})}
    if request.method == 'POST':
        patch = request.json or {}
        # não sobrescreve a key com vazio (o painel não reenvia a key salva)
        if 'api_key' in patch and not (patch.get('api_key') or '').strip():
            patch.pop('api_key')
        ai = {**ai, **patch}
        cfg['ai'] = ai
        _write_bot_file(cfg)
        return jsonify({'status': 'ok'})
    # full=1 → bot local recebe a config completa (com key). Senão, redige.
    if request.args.get('full') == '1':
        return jsonify(ai)
    redacted = {**ai, 'api_key': ''}
    redacted['has_api_key'] = bool((ai.get('api_key') or '').strip())
    return jsonify(redacted)

@app.route('/api/bot/config', methods=['GET', 'POST'])
def bot_config():
    if request.method == 'POST':
        patch = request.json or {}
        cfg = _read_bot_file()
        for k in ('video_id', 'api_key', 'channel_id', 'banned_words', 'obs_pass'):
            if k in patch:
                cfg[k] = patch[k]
        _write_bot_file(cfg)
        return jsonify({'status': 'ok'})
    cfg = _read_bot_file()
    # nunca vaza segredos completos pro front — só flags de "preenchido"
    return jsonify({
        'video_id': cfg.get('video_id', ''),
        'channel_id': cfg.get('channel_id', ''),
        'banned_words': cfg.get('banned_words', []),
        'has_api_key': bool(cfg.get('api_key')),
        'has_obs_pass': bool(cfg.get('obs_pass')),
    })


# ── Overlay state (briefing / ticker / timer) ────────────────────────────────
_overlay_briefing: dict = {}
_overlay_ticker: dict = {}
_overlay_timer: dict = {}   # { start: ms|null, stopped: secs|null, config: {...} }

@app.route('/api/overlay/briefing', methods=['GET', 'POST'])
def overlay_briefing():
    global _overlay_briefing
    if request.method == 'POST':
        _overlay_briefing = request.json or {}
        return jsonify({'status': 'ok'})
    return jsonify(_overlay_briefing)

@app.route('/api/overlay/ticker', methods=['GET', 'POST'])
def overlay_ticker():
    global _overlay_ticker
    if request.method == 'POST':
        _overlay_ticker = request.json or {}
        return jsonify({'status': 'ok'})
    return jsonify(_overlay_ticker)

@app.route('/api/overlay/timer', methods=['GET', 'POST'])
def overlay_timer():
    global _overlay_timer
    if request.method == 'POST':
        _overlay_timer = request.json or {}
        return jsonify({'status': 'ok'})
    return jsonify(_overlay_timer)


@app.route('/api/yt/chat-msg', methods=['POST'])
def yt_chat_msg():
    global _yt_chat_msgs
    msg = request.json or {}
    _yt_chat_msgs.append(msg)
    if len(_yt_chat_msgs) > _YT_CHAT_MAX:
        _yt_chat_msgs = _yt_chat_msgs[-_YT_CHAT_MAX:]
    return jsonify({'status': 'ok'})

@app.route('/api/yt/chat-msgs', methods=['GET'])
def yt_chat_msgs():
    return jsonify(_yt_chat_msgs)

@app.route('/yt-chat')
def yt_chat_redirect():
    from flask import redirect
    if not _yt_live_video_id:
        return '<p style="color:white;font-family:sans-serif;padding:20px">Nenhuma live ativa. Inicie o bot primeiro.</p>', 404
    return redirect(f'https://www.youtube.com/live_chat?v={_yt_live_video_id}&is_popout=1')


# ── OBS Replay trigger (called by yt_bot.py) ────────────────────────────────
@app.route('/api/obs/replay', methods=['POST'])
def obs_replay():
    import asyncio
    try:
        import obsws_python as obs
        data = request.json or {}
        url  = data.get('obs_url', 'ws://localhost:4455')
        pwd  = data.get('obs_pass', '')

        async def _save():
            cl = obs.ReqClient(host=url.replace('ws://', '').split(':')[0],
                               port=int(url.split(':')[-1]),
                               password=pwd or None,
                               timeout=5)
            cl.save_replay_buffer()
            cl.disconnect()

        asyncio.run(_save())
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Window Title Monitor ─────────────────────────────────────────────────────
import threading
import time as _time

# Patterns that indicate sensitive content is visible in the active window
_SENSITIVE_PATTERNS = [
    '.env', '.env.local', '.env.production', '.env.development',
    'credentials', 'secret', 'secrets',
    '.pem', '.key', '.p12', '.pfx',
    'id_rsa', 'id_ed25519',
    'api_key', 'apikey', 'access_token',
    'password', 'passwd',
    '.htpasswd', 'auth.json', 'service_account',
]

_shield_state = {
    'alert': False,
    'window_title': '',
    'matched_pattern': '',
}
_shield_subscribers: list = []
_shield_lock = threading.Lock()

def _get_active_window_title() -> str:
    try:
        import ctypes
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return ''
        buf = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value
    except Exception:
        return ''

def _window_monitor_thread():
    prev_alert = False
    while True:
        title = _get_active_window_title().lower()
        matched = next((p for p in _SENSITIVE_PATTERNS if p in title), None)
        alert = matched is not None

        with _shield_lock:
            _shield_state['alert'] = alert
            _shield_state['window_title'] = title
            _shield_state['matched_pattern'] = matched or ''

        if alert != prev_alert:
            # notify SSE subscribers
            data = {'alert': alert, 'pattern': matched or '', 'title': title}
            with _shield_lock:
                dead = []
                for q in _shield_subscribers:
                    try:
                        q.put_nowait(data)
                    except Exception:
                        dead.append(q)
                for q in dead:
                    _shield_subscribers.remove(q)
            prev_alert = alert

        _time.sleep(1)

_monitor_thread = threading.Thread(target=_window_monitor_thread, daemon=True)
_monitor_thread.start()


@app.route('/api/shield/status', methods=['GET'])
def shield_status():
    with _shield_lock:
        return jsonify(_shield_state.copy())


@app.route('/api/shield/stream', methods=['GET'])
def shield_stream():
    """SSE endpoint — pushes events when alert state changes."""
    import queue as _q
    from flask import Response, stream_with_context

    sub_queue: _q.Queue = _q.Queue(maxsize=10)
    with _shield_lock:
        _shield_subscribers.append(sub_queue)

    def generate():
        # send current state immediately on connect
        with _shield_lock:
            state = _shield_state.copy()
        yield f"data: {json.dumps(state)}\n\n"

        while True:
            try:
                event = sub_queue.get(timeout=30)
                yield f"data: {json.dumps(event)}\n\n"
            except Exception:
                # heartbeat to keep connection alive
                yield "data: {\"heartbeat\":true}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )


if __name__ == '__main__':
    import socket, sys
    # Single-instance guard: se :5000 já está ocupada, sai limpo em vez de
    # acumular processos zombie. use_reloader=False evita o reloader do Flask
    # que dobra processos (causa histórica dos pythons órfãos).
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.settimeout(0.3)
    try:
        probe.bind(('127.0.0.1', 5000))
        probe.close()
    except OSError:
        print("Port 5000 already in use - another dashboard_server is running. Exiting.")
        sys.exit(0)
    ensure_dirs()
    print("Dashboard running at http://localhost:5000")
    app.run(port=5000, debug=True, use_reloader=False)