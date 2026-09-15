"""Ficha tecnica de um banco de samples — pra escolher indice sem ouvir 217 arquivos.

Os bancos bons daqui (Zero-G Dream Zone, VHULTO) tem nome de arquivo que nao diz
nada: `07_02_01.WAV`. Escrever um take escolhendo `n()` no chute custa uma rodada
de navegador por tentativa. Este script mede o que decide a escolha:

  dur    segundos           pad longo vs golpe curto
  rms    volume medio       sample fraco precisa de gain diferente
  zcr    cruzamentos/s      proxy de brilho: baixo = grave/pad, alto = chiado/hat
  tipo   palpite            pad | corpo | golpe | chiado

O indice impresso e o MESMO que `.n()` no Strudel: o backend ordena os arquivos
do diretorio com sorted(), entao a ordem daqui e a ordem de la. Se alguem
adicionar arquivo na pasta, os indices andam — rode de novo antes de reescrever
take.

    python backend/tools/sample_probe.py "Zero-G - CE07 Dream Zone" --tipo pad
    python backend/tools/sample_probe.py --bancos
"""
import argparse
import os
import struct
import sys

import numpy as np

SAMPLES = os.path.join(os.path.dirname(__file__), '..', 'assets', 'samples')
AUDIO = {'.wav', '.mp3', '.ogg', '.flac', '.webm', '.m4a'}


def bancos():
    """Toda pasta com audio, com o caminho relativo — igual ao walk do servidor."""
    for root, _d, files in os.walk(SAMPLES):
        if any(os.path.splitext(f)[1].lower() in AUDIO for f in files):
            yield os.path.relpath(root, SAMPLES).replace(os.sep, '/')


def ler_wav(caminho, segundos=30):
    """RIFF na mao porque `wave` so abre PCM 8/16 bit.

    Metade do kit VHULTO e 24 bit ou float32 — com o modulo padrao, esses viravam
    linha vazia na ficha, que e pior que nao ter ficha: da a impressao de que o
    sample e ruim quando o leitor e que nao alcanca. Aqui todos abrem.

    Devolve (mono float32 em -1..1, sample rate, duracao total em s).
    """
    with open(caminho, 'rb') as f:
        cab = f.read(12)
        if cab[:4] != b'RIFF' or cab[8:12] != b'WAVE':
            raise ValueError('nao e RIFF/WAVE')
        fmt = None
        while True:
            head = f.read(8)
            if len(head) < 8:
                raise ValueError('sem chunk data')
            cid, tam = struct.unpack('<4sI', head)
            if cid == b'fmt ':
                b = f.read(tam)
                formato, canais, sr, _bps, _align, bits = struct.unpack('<HHIIHH', b[:16])
                fmt = (formato, canais, sr, bits)
            elif cid == b'data':
                if fmt is None:
                    raise ValueError('data antes de fmt')
                formato, canais, sr, bits = fmt
                quadro = canais * bits // 8
                total = tam // quadro
                bruto = f.read(min(tam, segundos * sr * quadro))
                break
            else:
                f.seek(tam + (tam & 1), 1)

    if formato == 3 and bits == 32:                 # IEEE float
        x = np.frombuffer(bruto, dtype='<f4')
    elif formato in (1, 0xFFFE) and bits == 16:
        x = np.frombuffer(bruto, dtype='<i2').astype(np.float32) / 32768.0
    elif formato in (1, 0xFFFE) and bits == 24:     # 3 bytes: monta o int a mao
        b = np.frombuffer(bruto[: len(bruto) // 3 * 3], dtype=np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8)
             | (b[:, 2].astype(np.int8).astype(np.int32) << 16))
        x = v.astype(np.float32) / 8388608.0
    elif formato in (1, 0xFFFE) and bits == 32:
        x = np.frombuffer(bruto, dtype='<i4').astype(np.float32) / 2147483648.0
    elif formato in (1, 0xFFFE) and bits == 8:
        x = (np.frombuffer(bruto, dtype=np.uint8).astype(np.float32) - 128) / 128.0
    else:
        raise ValueError(f'formato {formato} / {bits} bit nao suportado')

    if canais > 1:
        x = x[: x.size // canais * canais].reshape(-1, canais).mean(axis=1)
    return x, sr, total / sr if sr else 0.0


def medir(caminho):
    """Le so os primeiros 30 s: pad de 2 min nao muda de perfil no minuto 2."""
    x, sr, dur = ler_wav(caminho)
    if x.size == 0:
        return dur, 0.0, 0.0
    rms = float(np.sqrt(np.mean(x * x)))
    zcr = float(np.mean(np.abs(np.diff(np.sign(x))) > 0) * sr / 2)
    return dur, rms, zcr


def classificar(dur, rms, zcr):
    if zcr > 4000 and dur < 3:
        return 'chiado'
    if dur >= 6:
        return 'pad'
    if dur >= 1.5:
        return 'corpo'
    return 'golpe'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('banco', nargs='?', help='pasta relativa a assets/samples')
    ap.add_argument('--bancos', action='store_true', help='so lista as pastas')
    ap.add_argument('--tipo', help='filtra: pad, corpo, golpe, chiado')
    ap.add_argument('--min-dur', type=float, default=0.0)
    args = ap.parse_args()

    if args.bancos or not args.banco:
        for b in sorted(bancos()):
            print(b)
        return 0

    d = os.path.join(SAMPLES, args.banco)
    if not os.path.isdir(d):
        print(f'nao existe: {d}', file=sys.stderr)
        return 1
    arquivos = sorted(f for f in os.listdir(d) if os.path.splitext(f)[1].lower() in AUDIO)

    print(f'{"n":>4}  {"dur":>7}  {"rms":>6}  {"zcr":>6}  {"tipo":<7} arquivo')
    for i, f in enumerate(arquivos):
        try:
            dur, rms, zcr = medir(os.path.join(d, f))
        except Exception as e:                      # mp3/m4a: sem decoder aqui
            print(f'{i:>4}  {"-":>7}  {"-":>6}  {"-":>6}  {"?":<7} {f}  ({e})')
            continue
        tipo = classificar(dur, rms, zcr)
        if args.tipo and tipo != args.tipo:
            continue
        if dur < args.min_dur:
            continue
        r = f'{rms:.3f}'
        z = f'{zcr:.0f}'
        print(f'{i:>4}  {dur:7.2f}  {r:>6}  {z:>6}  {tipo:<7} {f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
