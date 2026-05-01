"""
YouTube Live Chat Bot
- Comandos configuráveis em bot_config.json
- Moderação: deleta mensagens com palavras proibidas
- !replay (ou comando mapeado) aciona OBS Replay Buffer via Flask
"""

import json
import time
import requests
import pytchat
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
import os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'bot_config.json')
TOKEN_FILE  = os.path.join(os.path.dirname(__file__), 'yt_token.json')
SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl']


def load_config():
    with open(CONFIG_FILE, encoding='utf-8') as f:
        return json.load(f)


def get_youtube_service(config):
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as f:
            f.write(creds.to_json())
    return build('youtube', 'v3', credentials=creds)


def get_active_live_video_id(youtube):
    """Retorna o video_id da live ativa do canal autenticado."""
    resp = youtube.liveBroadcasts().list(
        part='snippet,status',
        broadcastStatus='active',
        broadcastType='all',
        maxResults=5,
    ).execute()
    items = resp.get('items', [])
    if not items:
        raise ValueError('Nenhuma live ativa encontrada no canal.')
    video_id = items[0]['id']
    title = items[0]['snippet'].get('title', '')
    print(f'[bot] Live detectada: "{title}" ({video_id})')
    return video_id


def get_live_chat_id(youtube, video_id):
    resp = youtube.videos().list(part='liveStreamingDetails', id=video_id).execute()
    items = resp.get('items', [])
    if not items:
        raise ValueError(f'Video {video_id} not found or not live')
    details = items[0].get('liveStreamingDetails', {})
    chat_id = details.get('activeLiveChatId')
    if not chat_id:
        raise ValueError('No active live chat found for this video')
    return chat_id


def post_chat_message(youtube, live_chat_id, text):
    youtube.liveChatMessages().insert(
        part='snippet',
        body={
            'snippet': {
                'liveChatId': live_chat_id,
                'type': 'textMessageEvent',
                'textMessageDetails': {'messageText': text},
            }
        }
    ).execute()


def delete_chat_message(youtube, message_id):
    youtube.liveChatMessages().delete(id=message_id).execute()


def trigger_replay(config):
    try:
        r = requests.post(
            f"{config['flask_url']}/api/obs/replay",
            json={'obs_url': config['obs_url'], 'obs_pass': config['obs_pass']},
            timeout=8
        )
        if r.ok:
            print('[replay] ✓ Replay Buffer salvo')
        else:
            print(f'[replay] ✗ {r.text}')
    except Exception as e:
        print(f'[replay] ✗ {e}')


def push_chat_msg(config, msg_id, author, text):
    try:
        requests.post(
            f"{config['flask_url']}/api/yt/chat-msg",
            json={'id': msg_id, 'user': author, 'text': text, 'ts': int(time.time() * 1000)},
            timeout=2
        )
    except Exception:
        pass


def handle_message(youtube, live_chat_id, msg, config):
    author = msg.author.name
    text   = msg.message.strip()
    msg_id = msg.id
    text_lower = text.lower()

    push_chat_msg(config, msg_id, author, text)

    # Moderação — alerta sem deletar automaticamente
    for word in config.get('banned_words', []):
        if word.lower() in text_lower:
            print(f'[mod] ⚠ Palavra proibida "{word}" de {author}: "{text}"')
            try:
                requests.post(
                    f"{config['flask_url']}/api/bot/mod-alert",
                    json={'id': msg_id, 'user': author, 'text': text, 'word': word},
                    timeout=2
                )
            except Exception:
                pass
            return

    # Comandos
    for cmd, response in config.get('commands', {}).items():
        if text_lower.startswith(cmd.lower()):
            print(f'[cmd] {author}: {text}')
            if response == '__replay__':
                trigger_replay(config)
            else:
                try:
                    post_chat_message(youtube, live_chat_id, response)
                except Exception as e:
                    print(f'[cmd] Erro ao responder: {e}')
            return


def main():
    config = load_config()

    video_id = config.get('video_id', '').strip()

    print('[bot] Conectando ao YouTube...')
    youtube = get_youtube_service(config)

    if not video_id:
        print('[bot] Buscando live ativa no canal...')
        video_id = get_active_live_video_id(youtube)
    else:
        print(f'[bot] Usando video_id fixo: {video_id}')

    live_chat_id = get_live_chat_id(youtube, video_id)
    print(f'[bot] Live chat ID: {live_chat_id}')

    # Registra video_id no Flask para o OBS Browser Source usar
    try:
        requests.post(f"{config['flask_url']}/api/yt/set-live", json={'video_id': video_id}, timeout=3)
    except Exception:
        pass

    chat = pytchat.create(video_id=video_id)
    print('[bot] Monitorando chat. Ctrl+C para parar.\n')

    interval = config.get('poll_interval', 5)

    # Track last post time per auto-msg index
    auto_msg_timers: dict[int, float] = {}

    while chat.is_alive():
        # Process delete queue (messages flagged by UI)
        try:
            r = requests.get(f"{config['flask_url']}/api/bot/delete-queue", timeout=2)
            for msg_id in r.json():
                try:
                    delete_chat_message(youtube, msg_id)
                    print(f'[mod] ✓ Mensagem {msg_id} deletada')
                except Exception as e:
                    print(f'[mod] Erro ao deletar {msg_id}: {e}')
        except Exception:
            pass

        # Reload commands + auto-msgs from Flask
        try:
            r = requests.get(f"{config['flask_url']}/api/bot/commands", timeout=2)
            config['commands'] = {c['trigger']: c['response'] for c in r.json()}
        except Exception:
            pass

        try:
            r = requests.get(f"{config['flask_url']}/api/bot/auto-msgs", timeout=2)
            config['auto_msgs'] = r.json()
        except Exception:
            pass

        # Fire auto-msgs if interval elapsed
        for i, am in enumerate(config.get('auto_msgs', [])):
            if not am.get('enabled', True):
                continue
            interval_secs = am.get('intervalMins', 15) * 60
            last = auto_msg_timers.get(i, 0)
            if time.time() - last >= interval_secs:
                try:
                    prefix = am.get('prefix', '').strip()
                    full_text = f"{prefix} {am['text']}".strip() if prefix else am['text']
                    post_chat_message(youtube, live_chat_id, full_text)
                    print(f'[auto] Postado: "{am["text"][:60]}"')
                    auto_msg_timers[i] = time.time()
                except Exception as e:
                    print(f'[auto] Erro: {e}')

        for msg in chat.get().sync_items():
            handle_message(youtube, live_chat_id, msg, config)
        time.sleep(interval)

    print('[bot] Live encerrada.')


if __name__ == '__main__':
    main()
