# -*- coding: utf-8 -*-
"""Deixa `import dsp` e `import dashboard_server` funcionarem rodando pytest da raiz."""
import os
import subprocess
import sys

import numpy as np
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)


def _tem(prog):
    try:
        subprocess.run([prog, '-version'], capture_output=True, timeout=10)
        return True
    except Exception:
        return False


precisa_ffmpeg = pytest.mark.skipif(
    not _tem('ffmpeg'), reason='ffmpeg nao esta no PATH')


@pytest.fixture(scope='session')
def wav_factory(tmp_path_factory):
    """Fabrica WAV sintetico em disco. As medidas leem por ffmpeg, entao precisam de arquivo.

    Devolve `fab(nome, sinal, sr=44100)` -> caminho. `sinal` e float32 mono ou (n,2).
    """
    from scipy.io import wavfile
    d = tmp_path_factory.mktemp('audio')

    def fab(nome, sinal, sr=44100):
        p = str(d / ('%s.wav' % nome))
        x = np.asarray(sinal, dtype=np.float32)
        pico = float(np.max(np.abs(x))) or 1.0
        wavfile.write(p, sr, (np.clip(x / pico * 0.9, -1, 1) * 32767).astype(np.int16))
        return p

    return fab


@pytest.fixture(scope='session')
def sinais():
    """Sinais com propriedade CONHECIDA, pra medida ter gabarito.

    Nao sao "audio de teste": cada um existe pra provocar exatamente um medidor.
    """
    sr, dur = 44100, 6.0
    t = np.arange(int(sr * dur)) / sr
    rng = np.random.default_rng(5)

    # pulso alto: batida seca a 2 Hz sobre ruido — o perfil do `bass-only`
    env = (np.sin(2 * np.pi * 2.0 * t) > 0.85).astype(np.float32)
    env = np.convolve(env, np.exp(-np.arange(2000) / 300.0), mode='same')
    pulsado = (rng.standard_normal(t.size) * env).astype(np.float32)

    # sem pulso: ruido rosa-ish estavel
    liso = np.cumsum(rng.standard_normal(t.size)).astype(np.float32)
    liso = (liso - liso.mean()) / (np.abs(liso).max() + 1e-9)

    # harmonico: serie completa sobre 110 Hz -> CPP alto
    harmonico = sum(np.sin(2 * np.pi * 110 * k * t) / k for k in range(1, 12)).astype(np.float32)

    # apito: senoide aguda ESTAVEL sobre ruido -> razao alta e estabilidade ~1,0
    apito = (rng.standard_normal(t.size) * 0.3 + np.sin(2 * np.pi * 9641 * t) * 0.5).astype(np.float32)

    # nota: mesma senoide, mas entrando e saindo -> razao alta, estabilidade BAIXA
    porta = ((np.sin(2 * np.pi * 0.7 * t) > 0).astype(np.float32))
    nota = (rng.standard_normal(t.size) * 0.3 + np.sin(2 * np.pi * 9641 * t) * 0.5 * porta).astype(np.float32)

    # onda lenta de 6 s: o perfil da ressaca da cama3
    ressaca = (rng.standard_normal(t.size) *
               (0.2 + 0.8 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 6.0)))).astype(np.float32)

    return dict(sr=sr, pulsado=pulsado, liso=liso, harmonico=harmonico,
                apito=apito, nota=nota, ressaca=ressaca)
