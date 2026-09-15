"""
Camada de IA multi-provider pro yt_bot (chat da live).
Sem SDKs — só REST via requests. Providers: gemini | openai | anthropic.

Config (bloco "ai" no bot_config.json):
{
  "enabled": true,
  "provider": "gemini",            # gemini | openai | anthropic
  "model": "gemini-2.5-flash",
  "api_key": "",                   # vazio → cai pra env var do provider
  "base_url": "",                  # só openai-compatível (OpenRouter/Groq/local)
  "system_prompt": "Você é o co-host...",
  "max_reply_chars": 200,          # limite do chat do YouTube
  "trigger": "!ai",
  "cooldown_secs": 15
}
"""

import os
import requests

# Env var padrão por provider (fallback quando api_key do config está vazia)
_ENV_KEYS = {
    'gemini': ('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'VITE_GEMINI_API_KEY'),
    'openai': ('OPENAI_API_KEY', 'OPENROUTER_API_KEY'),
    'anthropic': ('ANTHROPIC_API_KEY',),
}

_DEFAULT_MODEL = {
    'gemini': 'gemini-2.5-flash',
    'openai': 'gpt-4o-mini',
    'anthropic': 'claude-haiku-4-5-20251001',
}


def resolve_key(ai_cfg: dict) -> str:
    key = (ai_cfg.get('api_key') or '').strip()
    if key:
        return key
    provider = ai_cfg.get('provider', 'gemini')
    for env_name in _ENV_KEYS.get(provider, ()):
        v = os.environ.get(env_name)
        if v:
            return v.strip()
    return ''


class AIError(Exception):
    pass


def generate_reply(ai_cfg: dict, user_text: str) -> str:
    """Gera a resposta do bot. Levanta AIError em falha."""
    provider = (ai_cfg.get('provider') or 'gemini').lower()
    model = (ai_cfg.get('model') or _DEFAULT_MODEL.get(provider, '')).strip()
    system = (ai_cfg.get('system_prompt') or
              'Você é o co-host de uma live. Responda em 1-2 frases, curto, direto e amigável.')
    max_chars = int(ai_cfg.get('max_reply_chars', 200))
    key = resolve_key(ai_cfg)
    if not key:
        raise AIError(f'sem API key pro provider "{provider}"')

    if provider == 'gemini':
        text = _gemini(key, model, system, user_text, max_chars)
    elif provider == 'openai':
        text = _openai(key, model, system, user_text, max_chars, ai_cfg.get('base_url') or '')
    elif provider == 'anthropic':
        text = _anthropic(key, model, system, user_text, max_chars)
    else:
        raise AIError(f'provider desconhecido: {provider}')

    text = (text or '').strip().replace('\n', ' ')
    if len(text) > max_chars:
        text = text[:max_chars - 1].rstrip() + '…'
    return text


def _gemini(key, model, system, user_text, max_chars):
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}'
    body = {
        'systemInstruction': {'parts': [{'text': system}]},
        'contents': [{'role': 'user', 'parts': [{'text': user_text}]}],
        'generationConfig': {
            'maxOutputTokens': max(256, max_chars),
            'temperature': 0.8,
            # gemini-2.5/3.x são "thinking" — sem isso o raciocínio consome os tokens
            # e a resposta visível corta. Chat de live quer resposta curta e direta.
            'thinkingConfig': {'thinkingBudget': 0},
        },
    }
    r = requests.post(url, json=body, timeout=20)
    if not r.ok:
        raise AIError(f'gemini {r.status_code}: {r.text[:200]}')
    data = r.json()
    try:
        return data['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError):
        raise AIError(f'gemini resposta vazia: {str(data)[:200]}')


def _openai(key, model, system, user_text, max_chars, base_url):
    base = (base_url or 'https://api.openai.com/v1').rstrip('/')
    r = requests.post(
        f'{base}/chat/completions',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={
            'model': model,
            'messages': [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': user_text},
            ],
            'max_tokens': max(64, max_chars),
            'temperature': 0.8,
        },
        timeout=20,
    )
    if not r.ok:
        raise AIError(f'openai {r.status_code}: {r.text[:200]}')
    try:
        return r.json()['choices'][0]['message']['content']
    except (KeyError, IndexError):
        raise AIError(f'openai resposta vazia: {r.text[:200]}')


def _anthropic(key, model, system, user_text, max_chars):
    r = requests.post(
        'https://api.anthropic.com/v1/messages',
        headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'},
        json={
            'model': model,
            'max_tokens': max(64, max_chars),
            'system': system,
            'messages': [{'role': 'user', 'content': user_text}],
        },
        timeout=20,
    )
    if not r.ok:
        raise AIError(f'anthropic {r.status_code}: {r.text[:200]}')
    try:
        return r.json()['content'][0]['text']
    except (KeyError, IndexError):
        raise AIError(f'anthropic resposta vazia: {r.text[:200]}')
