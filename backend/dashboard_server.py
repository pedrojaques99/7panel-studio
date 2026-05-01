from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
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


# ── Paulstretch ──────────────────────────────────────────────────────────────

def _paulstretch(samplerate, snd, stretch, window_sec=0.25):
    """
    Paulstretch by Nasca Octavian Paul — Python port.
    snd: float32 numpy array, shape (samples,) or (samples, channels)
    stretch: float > 1, e.g. 8.0 = 8× slower
    window_sec: analysis window in seconds; larger = dreamier
    """
    import numpy as np
    from numpy.fft import rfft, irfft

    mono = snd.ndim == 1
    if mono:
        snd = snd[:, np.newaxis]
    nsamples, nch = snd.shape

    win_size = max(16, int(window_sec * samplerate))
    if win_size % 2:
        win_size += 1
    half = win_size // 2

    # Hann window — applied twice (analysis + synthesis) = effective Hann²
    window = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(win_size) / win_size)
    window = window.astype(np.float32)

    in_step  = half / stretch          # input hop (can be fractional)
    out_step = half                    # output hop

    out_len  = int(nsamples / in_step * out_step) + win_size * 2
    result   = np.zeros((out_len, nch), dtype=np.float32)

    in_pos  = 0.0
    out_pos = 0

    while True:
        i0 = int(in_pos)
        if i0 + win_size > nsamples:
            break
        frame = snd[i0:i0 + win_size, :].copy()

        for ch in range(nch):
            seg = frame[:, ch] * window
            freq = rfft(seg)
            mag  = np.abs(freq)
            # randomise phases — the core Paulstretch magic
            phase = np.random.uniform(0.0, 2 * np.pi, len(freq)).astype(np.float32)
            freq  = mag * np.exp(1j * phase)
            out   = irfft(freq).astype(np.float32) * window
            result[out_pos:out_pos + win_size, ch] += out

        in_pos  += in_step
        out_pos += out_step

    result = result[:out_pos + win_size]
    peak = np.max(np.abs(result))
    if peak > 0:
        result *= 0.92 / peak
    return result[:, 0] if mono else result


@app.route('/api/duration', methods=['GET'])
def get_duration():
    import subprocess, json as _json
    path = request.args.get('path', '').strip()
    if not path or not os.path.exists(path):
        return jsonify({'error': 'file not found'}), 400
    try:
        r = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', path],
            capture_output=True, timeout=10
        )
        info = _json.loads(r.stdout)
        duration = float(info['format']['duration'])
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
    if os.path.exists(out_path):
        return jsonify({'path': out_path})

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
        return jsonify({'path': out_path})

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'ffmpeg timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try: os.unlink(tmp.name)
        except: pass


@app.route('/api/yt-download', methods=['GET'])
def yt_download():
    import subprocess, os, re, time
    url   = request.args.get('url', '').strip()
    start = request.args.get('start', '').strip()
    end   = request.args.get('end', '').strip()
    if not url:
        return jsonify({'error': 'missing url'}), 400

    assets_dir = os.path.join(os.path.dirname(__file__), 'assets')
    os.makedirs(assets_dir, exist_ok=True)

    slug = re.sub(r'[^a-zA-Z0-9]', '_', url)[-40:]
    trim_tag = f'_{start.replace(":","")}-{end.replace(":","")}'.rstrip('-') if (start or end) else ''
    out_path = os.path.join(assets_dir, f'yt_{slug}{trim_tag}.mp3')

    if os.path.exists(out_path):
        return jsonify({'path': out_path})

    cmd = ['yt-dlp', '-x', '--audio-format', 'mp3', '--audio-quality', '0',
           '-o', out_path, '--no-playlist']

    if start or end:
        section = f'*{start or "0"}-{end or "inf"}'
        cmd += ['--download-sections', section,
                '--force-keyframes-at-cuts']

    cmd.append(url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        # yt-dlp may add extension suffix — find the actual file
        if not os.path.exists(out_path):
            candidates = [f for f in os.listdir(assets_dir)
                          if f.startswith(f'yt_{slug}{trim_tag}')]
            if candidates:
                out_path = os.path.join(assets_dir, sorted(candidates)[-1])
            else:
                return jsonify({'error': result.stderr[-300:] or 'download failed'}), 500
        return jsonify({'path': out_path})
    except FileNotFoundError:
        return jsonify({'error': 'yt-dlp not found — pip install yt-dlp'}), 500
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'download timed out (>120s)'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
    files = []
    for f in sorted(os.listdir(assets_dir)):
        full = os.path.join(assets_dir, f)
        if os.path.isfile(full):
            files.append({'name': f, 'path': os.path.abspath(full)})
    return jsonify(files)


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