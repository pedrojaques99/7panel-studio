# -*- coding: utf-8 -*-
"""
Paulstretch — Nasca Octavian Paul, porte Python.

## overlap: por que 4 e nao 2 (o bug da panela de pressao)

A janela Hann e aplicada duas vezes (analise + sintese), entao o envelope efetivo e
Hann^2. Como cada quadro recebe FASE SORTEADA, os quadros somam em POTENCIA e nao em
amplitude — o envelope de potencia empilhado e Hann^4. Com passo de saida = janela/2
isso nao soma constante, e sobra ripple na taxa de quadro:

    hop = janela/2   ->  9,03 dB de ripple   (tremolo de 8 Hz com janela de 0,25 s)
    hop = janela/4   ->  0,25 dB
    hop = janela/8   ->  0,00 dB

9 dB de tremolo a 8 Hz em cima de conteudo agudo = chiado de panela de pressao. Nao e
artefato do algoritmo, e overlap errado. `overlap=4` e o padrao; `overlap=2` fica
disponivel so pra reproduzir render antigo.

O `win_size -= win_size % overlap` nao e cosmetico: sem ele o passo nao divide a
janela, a soma COLA quebra e o ripple volta mesmo com overlap=4.

Este arquivo e copia fiel do core de `Jacao Ambients/_tools/paulstretch.py`.
`tests/test_divergencia.py` falha se os dois divergirem.
"""
import numpy as np
from numpy.fft import rfft, irfft


def paulstretch(samplerate, snd, stretch, window_sec=0.25, seed=None, overlap=4):
    """
    snd: array float32, shape (amostras,) ou (amostras, canais)
    stretch: float > 1. 8.0 = 8x mais lento.
    window_sec: janela de analise em segundos; maior = mais onirico.
    seed: fixa o sorteio de fase, pra render reproduzivel.
    overlap: quadros sobrepostos. 4 = correto (0,25 dB de ripple);
             2 = comportamento antigo, com 9 dB de tremolo na taxa de quadro.
    """
    rng = np.random.default_rng(seed)

    mono = snd.ndim == 1
    if mono:
        snd = snd[:, np.newaxis]
    nsamples, nch = snd.shape

    overlap = max(2, int(overlap))
    win_size = max(16 * overlap, int(window_sec * samplerate))
    win_size -= win_size % overlap        # divisivel pelo passo, senao o ripple volta
    half = win_size // 2

    # Hann aplicada duas vezes (analise + sintese) = Hann^2 efetiva
    window = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(win_size) / win_size)).astype(np.float32)

    out_step = win_size // overlap     # passo de saida (COLA: janela/4)
    in_step = out_step / stretch       # passo de entrada (pode ser fracionario)

    out_len = int(nsamples / in_step * out_step) + win_size * 2
    result = np.zeros((out_len, nch), dtype=np.float32)

    in_pos = 0.0
    out_pos = 0

    while True:
        i0 = int(in_pos)
        if i0 + win_size > nsamples:
            break
        frame = snd[i0:i0 + win_size, :]

        for ch in range(nch):
            seg = frame[:, ch] * window
            freq = rfft(seg)
            mag = np.abs(freq)
            # sorteio de fase — o coracao do Paulstretch
            phase = rng.uniform(0.0, 2 * np.pi, len(freq))
            freq = mag * np.exp(1j * phase)
            out = irfft(freq).astype(np.float32) * window
            result[out_pos:out_pos + win_size, ch] += out

        in_pos += in_step
        out_pos += out_step

    result = result[:out_pos + win_size]
    peak = float(np.max(np.abs(result)))
    if peak > 0:
        result *= 0.92 / peak
    return result[:, 0] if mono else result


def fator_efetivo(nsamples, samplerate, stretch, window_sec=0.25, overlap=4):
    """O fator que voce REALMENTE recebe. Quase nunca e o que voce pediu.

    O laco so processa quadro que cabe inteiro na entrada, entao a ultima janela nao
    vira material: a entrada util e `nsamples - win_size`, nao `nsamples`. Em fonte
    longa isso some, em fonte curta e brutal:

        fonte de  1 s, janela 0,5 s, pedido 12x  ->   6,62x   (45% a menos)
        fonte de  2 s                            ->   9,31x
        fonte de 10 s                            ->  11,46x
        fonte de 60 s                            ->  11,91x

    Nao e defeito desta copia — a CLI faz igual, e todos os renders aprovados do acervo
    sairam assim. Por isso a conta NAO foi mexida: mudar aqui invalidaria a calibracao
    inteira. O conserto e avisar, e e pra isso que esta funcao existe: `/api/stretch`
    devolve o fator efetivo e a UI mostra quando ele foge do pedido.

    Devolve (fator_real, out_len, win_size).
    """
    overlap = max(2, int(overlap))
    win_size = max(16 * overlap, int(window_sec * samplerate))
    win_size -= win_size % overlap
    out_step = win_size // overlap
    in_step = out_step / float(stretch)
    if nsamples < win_size:
        return 0.0, 0, win_size
    n_quadros = int((nsamples - win_size) / in_step) + 1
    out_len = n_quadros * out_step + win_size
    return out_len / float(nsamples), out_len, win_size


def ripple_db(win_size, overlap):
    """Ripple do envelope de POTENCIA empilhado, em dB. O medidor do bug do overlap.

    Cada quadro sai com fase sorteada, entao os quadros somam em potencia: o que se
    empilha e window^2 elevado ao quadrado (analise x sintese) = Hann^4. Se a soma dos
    Hann^4 deslocados nao for constante, o que sobra e tremolo na taxa de quadro.

    Nao mede um render: mede a geometria da janela, entao e barato e deterministico.
    E o que `tests/test_paulstretch.py` usa pra provar que 9,03 -> 0,25 dB continua
    valendo, sem depender de ffmpeg nem de arquivo de audio.
    """
    overlap = max(2, int(overlap))
    win_size = int(win_size)
    win_size -= win_size % overlap
    step = win_size // overlap
    w = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(win_size) / win_size)
    # Hann^2 aplicada por quadro (analise + sintese); potencia = (Hann^2)^2 = Hann^4
    pot = (w ** 2) ** 2
    n = win_size * 4
    acc = np.zeros(n + win_size * 2)
    for start in range(0, n, step):
        acc[start:start + win_size] += pot
    # olha so o miolo, onde a sobreposicao ja esta em regime
    miolo = acc[win_size:n]
    if miolo.max() <= 0:
        return float('inf')
    # 10*log10 e nao 20: o que se empilha aqui JA e potencia (Hann^4), porque a fase
    # sorteada faz os quadros somarem em potencia. Com 20*log10 o numero sai no dobro
    # (18,06 dB em vez de 9,03) — conferido contra o valor documentado no plano.
    return float(10 * np.log10(miolo.max() / max(miolo.min(), 1e-12)))
