"""Catalogo de TODOS os samples locais — qual usar, onde usar, e como escrever.

`sample_probe.py` responde "como e o arquivo 171 desse banco?". Este responde a
pergunta de antes: "o que eu tenho?". Varre `backend/assets/samples/` inteiro,
mede cada arquivo e escreve dois artefatos:

  patterns/SAMPLES.md            pra ler, agrupado por papel (bumbo, caixa, ...)
  backend/assets/samples_catalog.json   pra grepar na hora de escrever take

O `n` do catalogo e o MESMO que o `.n()` do Strudel: o servidor lista o diretorio
com sorted() e nos tambem. Adicionar arquivo numa pasta empurra o `n` de todos os
seguintes — por isso o catalogo e gerado, nunca editado a mao.

    python backend/tools/sample_catalog.py
    python backend/tools/sample_catalog.py --check   # falha se estiver desatualizado
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sample_probe import AUDIO, SAMPLES, medir            # noqa: E402

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
JSON_OUT = os.path.join(RAIZ, 'backend', 'assets', 'samples_catalog.json')
MD_OUT = os.path.join(RAIZ, 'patterns', 'SAMPLES.md')

# Papel = o que o sample TOCA num take. Vem da pasta, porque o kit ja separa por
# familia; so o que nao tem familia declarada cai na medida.
PAPEL_POR_PASTA = [
    ('ZI MELODIK BONUS', 'melodico'),
    ('HATS N SHAKERS', 'chimbal'),
    ('SNARES CLAPS N RIMS', 'caixa'),
    ('PERC LOOPS', 'loop'),
    ('ROLLS N FLAMS', 'rufo'),
    ('FX TRANSITIONS', 'transicao'),
    ('FX MISC', 'efeito'),
    ('TEXTURE', 'textura'),
    ('RIDES', 'prato'),
    ('PERCS', 'percussao'),
    ('KICK', 'bumbo'),
    ('BASS', 'baixo'),
    ('808', 'baixo'),
    ('Dark Drone', 'drone'),
    ('Dream Zone', 'atmosfera'),
    ('drum', 'loop'),
]

ONDE_USAR = {
    'bumbo': 'O pulso. Entra por `.struct("x ~ ~ x")`. Curto (<0.3 s) aguenta `ply`; longo borra.',
    'caixa': 'Contratempo, e o estilhaco do drill-n-bass quando levado com `ply` + `speed`.',
    'chimbal': 'A subdivisao. `gain` baixo e `pan` em sine, senao vira metronomo.',
    'prato': 'Cauda longa: um por frase, nunca um por tempo.',
    'percussao': 'O detalhe que tira cara de maquina. Use com `degradeBy`.',
    'loop': 'Ja vem com andamento proprio — veja a coluna bpm e case com o take (ou `.speed()`).',
    'rufo': 'Fim de frase, a cada 4 ou 8 compassos. `<~ ~ ~ x>` resolve.',
    'baixo': 'Chao. Afinado por `note` relativo a C3.',
    'melodico': 'Melodia de verdade. A raiz esta no nome: escreva `.add(note(N))` da coluna raiz.',
    'atmosfera': 'Cama, e fonte de "fita": corte com `begin/end` e mude a `speed`.',
    'drone': 'Fundo continuo. `slow(8)` ou mais, gain baixo.',
    'textura': 'Chiado, chuva, sala. E o que faz o take ter ar em volta do som.',
    'efeito': 'Evento unico. Com `mask` ou `degradeBy` pesado, pra nao virar tique.',
    'transicao': 'Virada entre partes. Sozinho no compasso.',
    'ambiente': 'Campo gravado: passaro, agua, floresta.',
    'outro': 'Sem familia declarada — decida por dur e brilho.',
}

SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def papel(rel_pasta, dur, zcr):
    for chave, nome in PAPEL_POR_PASTA:
        if chave.lower() in rel_pasta.lower():
            if nome == 'atmosfera' and dur is not None and dur < 4:
                return 'efeito'
            return nome
    if 'ambient' in rel_pasta.lower():
        return 'ambiente'
    if dur is None:
        return 'outro'
    if dur >= 6:
        return 'atmosfera'
    if zcr and zcr > 4000 and dur < 1:
        return 'chimbal'
    return 'outro'


def bpm_do_nome(nome):
    """Meio kit VHULTO traz o andamento no nome: "PERC LOOP - CHOKO 103.wav"."""
    m = re.search(r'(\d{2,3})\D*$', os.path.splitext(nome)[0])
    if not m:
        return None
    v = int(m.group(1))
    return v if 60 <= v <= 200 else None


def raiz_do_nome(nome):
    """Nota gravada de instrumento amostrado: "SANT C#.wav", "ERHU D#.wav"."""
    base = os.path.splitext(nome)[0].strip()
    m = re.search(r'(?:^|[\s\-_])([A-G][#b]?)$', base)
    return m.group(1) if m else None


def compensacao(raiz):
    """Constante de `.add(note(N))` pra que a nota ESCRITA seja a nota OUVIDA.

    Medido, nao suposto: `note("c2")` vale midi 36 no strudel, e o superdough faz
    `transpose = midi - 36` (util.mjs). Logo **c2 e a nota que toca o arquivo
    cru** — nao c3, apesar do comentario "C3 is middle C" no fonte deles.

    Com isso: pra ouvir o alvo T num sample gravado na raiz R,
        escrito = 36 + midi(T) - midi(R)
    e, mantendo a melodia escrita em notas reais, a constante e N = 36 - midi(R).

    A OITAVA DA RAIZ E CHUTE: o nome do arquivo diz "SANT C#", nao "C#4". Assumo
    oitava 4 (perto do do central, onde instrumento melodico costuma ser
    gravado), entao N = 36 - (60 + semitons). Se sair uma oitava fora, some ou
    tire 12 — um numero so, e o unico palpite deste catalogo inteiro.
    """
    if not raiz:
        return None
    semi = SEMI[raiz[0]] + (1 if raiz.endswith('#') else -1 if raiz.endswith('b') else 0)
    return 36 - (60 + semi)


def medir_via_ffmpeg(caminho):
    """mp3/m4a: decodifica 30 s pra PCM mono e mede igual ao wav.

    Sem ffmpeg na maquina o arquivo entra no catalogo sem numero, e nao fica de
    fora: saber que ele EXISTE ja vale a linha.
    """
    exe = shutil.which('ffmpeg')
    if not exe:
        return None, None, None
    dur = None
    probe = shutil.which('ffprobe')
    if probe:
        try:
            out = subprocess.run(
                [probe, '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'csv=p=0', caminho], capture_output=True, text=True, timeout=30)
            dur = float(out.stdout.strip())
        except Exception:
            pass
    try:
        out = subprocess.run(
            [exe, '-v', 'error', '-t', '30', '-i', caminho,
             '-f', 's16le', '-ac', '1', '-ar', '44100', '-'],
            capture_output=True, timeout=120)
        x = np.frombuffer(out.stdout, dtype='<i2').astype(np.float32) / 32768.0
    except Exception:
        return dur, None, None
    if x.size == 0:
        return dur, None, None
    rms = float(np.sqrt(np.mean(x * x)))
    zcr = float(np.mean(np.abs(np.diff(np.sign(x))) > 0) * 44100 / 2)
    return dur if dur is not None else x.size / 44100.0, rms, zcr


def slug(rel):
    """MESMA regra do servidor (dashboard_server.strudel_sample_map)."""
    s = re.sub(r'[^a-zA-Z0-9]+', '_', rel).strip('_').lower()
    return s if s and s != '.' else 'local'


def varrer(verbose=True):
    itens = []
    for root, _d, files in os.walk(SAMPLES):
        audio = sorted(f for f in files if os.path.splitext(f)[1].lower() in AUDIO)
        if not audio:
            continue
        rel = os.path.relpath(root, SAMPLES).replace(os.sep, '/')
        banco = slug(rel)
        if verbose:
            print(f'  {banco} ({len(audio)})', file=sys.stderr)
        for i, f in enumerate(audio):
            caminho = os.path.join(root, f)
            try:
                dur, rms, zcr = medir(caminho)
            except Exception:
                dur, rms, zcr = medir_via_ffmpeg(caminho)
            pap = papel(rel, dur, zcr)
            # Raiz so vale em banco afinado. "RIM - G.wav" e nome de golpe, nao
            # de nota: dar constante de afinacao pra ele e convidar erro.
            raiz = raiz_do_nome(f) if pap in ('melodico', 'baixo') else None
            itens.append({
                'banco': banco,
                'n': i,
                'arquivo': f,
                'pasta': rel,
                'papel': pap,
                'dur': round(dur, 2) if dur else None,
                'rms': round(rms, 4) if rms else None,
                'brilho': round(zcr) if zcr else None,
                'bpm': bpm_do_nome(f),
                'raiz': raiz,
                'add_note': compensacao(raiz),
                'strudel': f's("{banco}").n({i})',
            })
    return itens


def montar_md(itens):
    por_papel = {}
    for it in itens:
        por_papel.setdefault(it['papel'], []).append(it)

    L = [
        '# Catalogo de samples',
        '',
        'Gerado por `python backend/tools/sample_catalog.py`. **Nao edite a mao**: adicionar',
        'arquivo numa pasta empurra o `n` de todos os seguintes, entao o catalogo so vale',
        'recem-gerado. `--check` diz se esta desatualizado.',
        '',
        f'**{len(itens)} arquivos** em **{len({i["banco"] for i in itens})} bancos**.',
        '',
        'Como se toca um sample daqui:',
        '',
        '```js',
        's("vhulto_sampling_the_world_drumkit_kick").n(5)   // banco = pasta, n = linha da tabela',
        '  .struct("x ~ ~ x")                               // o ritmo entra por struct',
        '  .begin(0.1).end(0.4)                             // recorte, pra sample longo',
        '  .speed(0.85)                                     // afinacao/velocidade cruas',
        '```',
        '',
        '| coluna | o que e |',
        '| --- | --- |',
        '| **n** | o indice do `.n()`. Ordem alfabetica dentro da pasta. |',
        '| **dur** | segundos. Curto aguenta `ply`; longo pede `begin/end` ou `slow`. |',
        '| **rms** | volume medio do arquivo. Compare antes de culpar o `gain`. |',
        '| **brilho** | cruzamentos por segundo: baixo = grave/pad, alto = chiado/metal. |',
        '| **bpm** | andamento que estava no nome do arquivo (loops). Case com o take. |',
        '| **raiz** | nota gravada do banco afinado, com a constante de `.add(note())` pronta. |',
        '| | `note("c2")` toca o arquivo cru. A oitava da raiz e palpite: se soar fora, +-12. |',
        '',
        '## Indice',
        '',
    ]
    ordem = sorted(por_papel, key=lambda p: (-len(por_papel[p]), p))
    for nome in ordem:
        L.append(f'- [{nome}](#{nome}--{len(por_papel[nome])}) — {len(por_papel[nome])}')
    L.append('')

    for nome in ordem:
        lista = sorted(por_papel[nome], key=lambda i: (i['banco'], i['n']))
        L.append(f'## {nome} — {len(lista)}')
        L.append('')
        L.append(f'*Onde usar:* {ONDE_USAR.get(nome, "")}')
        L.append('')
        L.append('| banco | n | arquivo | dur | rms | brilho | bpm | raiz |')
        L.append('| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |')
        for it in lista:
            raiz = f"{it['raiz']} → `.add(note({it['add_note']}))`" if it['raiz'] else ''
            L.append(
                f"| `{it['banco']}` | {it['n']} | {it['arquivo']} | "
                f"{it['dur'] if it['dur'] else ''} | {it['rms'] if it['rms'] else ''} | "
                f"{it['brilho'] if it['brilho'] else ''} | {it['bpm'] or ''} | {raiz} |"
            )
        L.append('')
    return '\n'.join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='nao escreve: sai 1 se o catalogo no disco estiver velho')
    ap.add_argument('-q', '--quiet', action='store_true')
    args = ap.parse_args()

    itens = varrer(verbose=not args.quiet and not args.check)
    md = montar_md(itens)

    if args.check:
        try:
            velho = json.load(open(JSON_OUT, encoding='utf-8'))
        except (OSError, ValueError):
            print('catalogo nao existe: rode python backend/tools/sample_catalog.py')
            return 1
        if velho != itens:
            print('catalogo desatualizado: rode python backend/tools/sample_catalog.py')
            return 1
        print(f'catalogo em dia ({len(itens)} samples)')
        return 0

    with open(JSON_OUT, 'w', encoding='utf-8') as f:
        json.dump(itens, f, ensure_ascii=False, indent=1)
    with open(MD_OUT, 'w', encoding='utf-8') as f:
        f.write(md)
    print(f'{len(itens)} samples catalogados')
    print(os.path.normpath(JSON_OUT))
    print(os.path.normpath(MD_OUT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
