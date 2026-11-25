# -*- coding: utf-8 -*-
"""
mix.py - musica por baixo, N camadas de ambiencia por cima, cada uma em loop sem emenda.

Porta enxuta do `Jacao Ambients/_prod/_tools/ambiente.py`, onde a tese ja foi ouvida e
aprovada. O que veio de la, e por que:

  NIVEIS      musica a -20 LUFS, ambiencia no LIMIAR (-34 lugar, -40 textura). Audivel
              demais vira evento, e evento a cada volta do loop e cutucao.
  RESPIRACAO  camada em nivel fixo denuncia que e camada: o ouvido acha o patamar em 30 s.
              Cada uma sobe e desce num ciclo proprio (210 s e 137 s, primos entre si) pra
              que as duas nunca subam juntas e virem pulso.
  COSTURA     a cauda entra por cima da cabeca em crossfade. Quando o catalogo traz
              head/end medidos (os do liminal), recorta antes: pula o fade ja assado no
              arquivo, senao a costura cai num buraco.
  GAP         camada tambem aceita um silencio no fim de cada volta (`gap_s`): textura que
              e evento isolado (um canto, uma rajada) nao devia tocar colada nela mesma.

Os presets (LUFS/profundidade/ciclo) so existem pra DUAS posicoes — lugar e textura — porque
so essas duas foram testadas por ouvido. Camada 3+ CICLA por essas mesmas duas posicoes
(`% len(...)`) em vez de inventar um terceiro numero que ninguem ouviu ainda.

O que e novo aqui e o preview FIEL: os 30 s de preview passam pela mesma cadeia do export
(mesmo ganho medido, mesma costura). A unica diferenca e a respiracao: num trecho de 30 s
ela ficaria parada no vale do ciclo de 210 s e o preview sairia mais baixo que o render.
No preview ela vira o ganho MEDIO do ciclo, que e o que o ouvido percebe ao longo do render.
"""
import json, math, os, subprocess, tempfile

from dsp.domar import _ir


class Cancelado(Exception):
    """Render interrompido a pedido — mix_routes distingue disso de erro de verdade
    (job vira status='cancelado', nao 'error', e a tela nao mostra mensagem de falha)."""

MUSICA_LUFS = -20.0
CAMADA_LUFS = (-34.0, -40.0)      # pico do lugar, pico da textura — cicla pra camada 3+
PROFUNDIDADE_DB = (14.0, 10.0)    # idem
CICLO_S = (210.0, 137.0)          # idem
XFADE_S = 6.0
FADE_S = 6.0
LIMITE = 0.891                    # -1 dBFS
FMT = 'aformat=sample_rates=48000:channel_layouts=stereo'
# nao e limiar criativo (esse nao existe mais) — e so pra a linha de comando do ffmpeg nao
# virar um filter_complex gigante. 12 camadas ja é mais textura do que qualquer mix pede.
MAX_CAMADAS = 12
# EQ/reverb da camada e da musica: MESMO shelf e MESMO gerador de IR do /eq (dsp/domar.py) —
# um tom so (bipolar) e uma sala fixa (so o wet e knob aqui), pra nao reinventar o que ja
# foi calibrado e ouvido la.
EQ_HZ = 4500.0
REVERB_DECAY_S = 2.5


def _r(cmd):
    return subprocess.run(cmd, capture_output=True)


def dur(src):
    o = _r(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'csv=p=0', src]).stdout.decode(errors='ignore').strip()
    try:
        return float(o)
    except ValueError:
        return 0.0


def lufs(src, ss=0.0, t=900.0):
    """Loudness integrado. Mede no maximo `t` s: cama de 1 h nao muda de LUFS no minuto 40."""
    cmd = ['ffmpeg', '-hide_banner', '-nostats']
    if ss:
        cmd += ['-ss', '%.3f' % ss]
    cmd += ['-t', '%.3f' % t, '-i', src, '-af', 'loudnorm=I=-14:TP=-1:print_format=json', '-f', 'null', '-']
    txt = _r(cmd).stderr.decode(errors='ignore')
    i = txt.rfind('{')
    try:
        v = float(json.loads(txt[i:txt.rfind('}') + 1])['input_i'])
        return v if math.isfinite(v) else None
    except Exception:
        return None


def respiracao(prof_db, ciclo_s):
    """Cosseno levantado: minimo no inicio do ciclo, pico na metade. `eval=frame` e
    obrigatorio: sem ele o ffmpeg avalia a expressao uma vez e a camada fica fixa."""
    m = 10 ** (-prof_db / 20.0)
    return ",volume=eval=frame:volume='%.6f+%.6f*(0.5-0.5*cos(2*PI*t/%.3f))'" % (m, 1.0 - m, ciclo_s)


def ganho_medio_respiracao_db(prof_db):
    """O ganho medio do cosseno levantado, em dB. E o nivel que o preview de 30 s usa."""
    m = 10 ** (-prof_db / 20.0)
    return 20 * math.log10((1.0 + m) / 2.0)


def unidade_loop(src, tmpdir, tag, xfade=XFADE_S, head=None, end=None):
    """Recorta [head, end] e costura a cauda na cabeca. Devolve (wav, duracao, costurou).

    `tag` da nome ao arquivo e nao e cosmetico: nome fixo fazia uma camada sobrescrever a
    outra no mesmo tmpdir (bug que o ambiente.py ja pagou)."""
    d = dur(src)
    if d <= 0:
        raise RuntimeError('nao li a duracao de %s' % src)
    ini = max(0.0, float(head or 0.0))
    fim = min(float(end), d) if end else d
    tam = fim - ini
    xf = min(xfade, max(tam / 6.0, 0.5))
    out = os.path.join(tmpdir, '%s.wav' % tag)
    if tam <= 2 * xf + 1:
        fc = '[0:a]atrim=%g:%g,asetpts=PTS-STARTPTS,%s[o]' % (ini, fim, FMT)
        costurou = False
    else:
        fc = ('[0:a]%s,asplit=3[a][b][c];'
              '[a]atrim=%g:%g,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=%g[h];'
              '[b]atrim=%g:%g,asetpts=PTS-STARTPTS[m];'
              '[c]atrim=%g:%g,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=%g[t];'
              '[t][h]amix=inputs=2:normalize=0[x];[x][m]concat=n=2:v=0:a=1[o]'
              % (FMT, ini, ini + xf, xf, ini + xf, fim - xf, fim - xf, fim, xf))
        costurou = True
    r = _r(['ffmpeg', '-y', '-v', 'error', '-i', src, '-filter_complex', fc,
            '-map', '[o]', '-c:a', 'pcm_f32le', out])
    if r.returncode != 0 or dur(out) <= 0:
        raise RuntimeError('costura falhou em %s: %s'
                           % (os.path.basename(src), r.stderr.decode(errors='ignore')[-300:]))
    return out, dur(out), costurou


def com_gap(unid_wav, tmpdir, tag, gap_s):
    """Acrescenta `gap_s` de silencio no fim da unidade, antes do -stream_loop repetir —
    e o que separa 'textura em loop continuo' de 'evento que toca, cala, toca nao'."""
    if gap_s <= 0:
        return unid_wav
    out = os.path.join(tmpdir, '%s_gap.wav' % tag)
    r = _r(['ffmpeg', '-y', '-v', 'error', '-i', unid_wav, '-af', 'apad=pad_dur=%.3f' % gap_s,
            '-c:a', 'pcm_f32le', out])
    if r.returncode != 0:
        raise RuntimeError('gap falhou: %s' % r.stderr.decode(errors='ignore')[-300:])
    return out


def avisos_fixos(item):
    """O que da pra avisar ANTES do render, so com as medidas do catalogo."""
    out = []
    med = item.get('medidas') or {}
    voz = med.get('voz') or 0
    if voz > 0.05:
        out.append('%s tem voz em %.0f%% do arquivo: fala num fundo e o pior evento'
                   % (item['titulo'], voz * 100))
    ev = med.get('evento') or 0
    if ev >= 8:
        out.append('%s tem evento %.0fx acima da mediana: transiente que vira cutucao a cada volta'
                   % (item['titulo'], ev))
    return out


def aviso_repeticao(titulo, unidade_s, total_s):
    """Portao `unidade < 8 min` do PRONTUARIO: unidade curta repetindo muito o ouvido acha."""
    if unidade_s and unidade_s < 480 and total_s / unidade_s > 12:
        return ('%s tem unidade de %.1f min e repete %dx: o ouvido acha a volta'
                % (titulo, unidade_s / 60, math.ceil(total_s / unidade_s)))
    return None


def render(musica, camadas, saida, duracao_s=None, formato='mp3', preview_s=None, progresso=None,
           musica_params=None, atraso_s=0.0, registrar_proc=None, deve_cancelar=None):
    """camadas: [{'item': <item do catalogo>, 'fonte': caminho ou url, 'nivel_db': float,
    'respira': bool, 'gap_s': float, 'eq_db': float, 'reverb_wet': float}]

    `nivel_db` e relativo ao limiar da casa: 0 = CAMADA_LUFS do papel da camada (camada 3+
    cicla pelos dois papeis testados). `gap_s` e silencio entre uma volta e a proxima.
    `eq_db`/`reverb_wet` sao o mesmo shelf/reverb do /eq (dsp/domar.py), um so tom e uma
    so sala — default 0.0 nos dois, entao chamada sem eles sai identica a antes deles existir.

    `musica_params`: {'nivel_db', 'eq_db', 'reverb_wet'} — mesmos tres, pra musica tambem
    poder ser ajustada (antes so ia pro alvo automatico de -20 LUFS sem controle nenhum).

    `atraso_s`: segundos entre o inicio de uma camada e a proxima (camada `i` comeca
    `i * atraso_s` depois da musica) — pra nao estourar tudo junto num render com varias
    texturas pesadas."""
    if not 1 <= len(camadas) <= MAX_CAMADAS:
        raise ValueError('de 1 a %d camadas de ambiencia' % MAX_CAMADAS)
    tmp = tempfile.mkdtemp(prefix='mix_')
    dm = dur(musica)
    if dm <= 0:
        raise RuntimeError('nao li a duracao de %s' % musica)
    preview = bool(preview_s)
    total = float(duracao_s) if duracao_s else dm

    if preview:
        T = min(float(preview_s), dm)
        ss = max(0.0, min(dm * 0.3, dm - T))     # 30% pra dentro: o comeco quase sempre e fade
        entradas = ['-ss', '%.3f' % ss, '-t', '%.3f' % T, '-i', musica]
        lm = lufs(musica, ss=ss, t=T)
    elif total > dm + 1:
        T = total
        unid, du, _ = unidade_loop(musica, tmp, 'musica')
        entradas = ['-stream_loop', str(max(math.ceil(T / du), 1) - 1), '-i', unid]
        lm = lufs(unid)
    else:
        T = dm
        entradas = ['-i', musica]
        lm = lufs(musica)
    mp = musica_params or {}
    m_nivel = float(mp.get('nivel_db') or 0.0)
    gm = (MUSICA_LUFS + m_nivel) - lm if lm is not None else 0.0

    # IRs de reverb sao entradas EXTRAS do ffmpeg, adicionadas so quando algum reverb_wet > 0
    # (musica ou camada) e sempre DEPOIS da musica+camadas — o indice de cada uma so e
    # conhecido na hora, entao a lista de flags e o proximo indice andam juntos aqui.
    ir_entradas = []
    proximo_ir_idx = [1 + len(camadas)]

    def _cadeia(input_idx, filtros_secos, wet, tag):
        """[input_idx:a] + `filtros_secos` (sem colchete de rotulo) -> `[tag]`. Com
        `wet` > 0 o seco e a cauda (convolucao com o IR do /eq) se somam antes do
        rotulo — o seco nunca perde nivel, a cauda so ADICIONA (mesma regra do domar.py)."""
        if wet <= 0:
            return ['[%d:a]%s[%s]' % (input_idx, filtros_secos, tag)], '[%s]' % tag
        ir_idx = proximo_ir_idx[0]
        proximo_ir_idx[0] += 1
        ir_entradas.extend(['-i', _ir(REVERB_DECAY_S)])
        return [
            '[%d:a]%s,asplit=2[%sseco][%spre]' % (input_idx, filtros_secos, tag, tag),
            '[%spre][%d:a]afir=irnorm=-1[%scauda]' % (tag, ir_idx, tag),
            '[%sseco][%scauda]amix=inputs=2:weights=1 %.3f:normalize=0[%s]' % (tag, tag, wet, tag),
        ], '[%s]' % tag

    def _eq(eq_db):
        return ',treble=g=%.1f:f=%g:w=0.6' % (eq_db, EQ_HZ) if eq_db else ''

    m_eq = float(mp.get('eq_db') or 0.0)
    m_wet = max(0.0, min(1.0, float(mp.get('reverb_wet') or 0.0)))
    frag, rot_m = _cadeia(0, '%s,volume=%.2fdB%s' % (FMT, gm, _eq(m_eq)), m_wet, 'm')
    cadeias = list(frag)
    rotulos = [rot_m]
    relato, avisos = [], []
    for i, c in enumerate(camadas):
        item = c['item']
        lp = item.get('loop') or {}
        head, end = lp.get('head'), lp.get('end')
        if preview:
            # 30 s de preview nao precisam costurar a cama de 30 min inteira (custava 38 s
            # de espera). Um trecho que cobre o preview com folga basta: com >= 60 s a
            # emenda nem cai dentro do que se ouve.
            ini = float(head or 0.0)
            end = min(float(end), ini + max(T + 2 * XFADE_S + 2, 60.0)) if end else ini + max(T + 2 * XFADE_S + 2, 60.0)
        unid, du, costurou = unidade_loop(c['fonte'], tmp, 'camada%d' % i, head=head, end=end)
        la = lufs(unid)
        p = i % len(CAMADA_LUFS)                # camada 3+ cicla pelos dois papeis testados
        alvo = CAMADA_LUFS[p] + float(c.get('nivel_db') or 0.0)
        ga = alvo - la if la is not None else 0.0
        respira = bool(c.get('respira', True))
        resp = ''
        if respira:
            if preview:
                ga += ganho_medio_respiracao_db(PROFUNDIDADE_DB[p])
            else:
                resp = respiracao(PROFUNDIDADE_DB[p], CICLO_S[p])
        # o gap vale no preview tambem: o `-t T` ja corta no tamanho pedido, entao silencio
        # nao estica o preview — e zerar aqui fazia o knob parecer que nao fazia nada.
        # LUFS ja foi medido antes (acima), o silencio nao puxa o ganho.
        gap_s = max(0.0, float(c.get('gap_s') or 0.0))
        if gap_s > 0:
            unid = com_gap(unid, tmp, 'camada%d' % i, gap_s)
            du += gap_s
        entradas += ['-stream_loop', str(max(math.ceil(T / du), 1) - 1), '-i', unid]
        # entrada escalonada: camada i comeca i*atraso_s depois da musica. `adelay` e
        # silencio puro no comeco do stream — nao desloca a duracao total, que continua
        # cortada em T no mapeamento final.
        atraso_ms = max(0, int(round(i * float(atraso_s or 0.0) * 1000)))
        delay = ',adelay=%d:all=1' % atraso_ms if atraso_ms > 0 else ''
        eq_db = float(c.get('eq_db') or 0.0)
        wet = max(0.0, min(1.0, float(c.get('reverb_wet') or 0.0)))
        frag, rot_c = _cadeia(i + 1, '%s,volume=%.2fdB%s%s%s' % (FMT, ga, resp, _eq(eq_db), delay),
                              wet, 'c%d' % i)
        cadeias += frag
        rotulos.append(rot_c)
        avisos += avisos_fixos(item)
        # no preview a unidade foi recortada de proposito (acima): medir repeticao nela
        # acusaria uma volta que o export nao vai ter. A tela ja avisa pela duracao real.
        rep = None if preview else aviso_repeticao(item['titulo'], du, total)
        if rep:
            avisos.append(rep)
        relato.append(dict(id=item['id'], titulo=item['titulo'], lufs=la, alvo_lufs=alvo,
                           ganho_db=round(ga, 2), unidade_s=round(du, 1), costurou=costurou, respira=respira))

    fade = 1.0 if preview else FADE_S
    # fade nas pontas + teto de seguranca. Nada de compressao: cama nao comprime.
    fc = (';'.join(cadeias)
          + ';%samix=inputs=%d:normalize=0:dropout_transition=0,afade=t=in:st=0:d=%g,'
            'afade=t=out:st=%g:d=%g,alimiter=limit=%g:level=disabled[out]'
          % (''.join(rotulos), len(rotulos), fade, max(T - fade, 0.0), fade, LIMITE))
    codec = ['-c:a', 'libmp3lame', '-b:a', '320k'] if formato == 'mp3' else ['-c:a', 'pcm_s24le']
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    cmd = (['ffmpeg', '-y', '-v', 'error', '-nostats', '-progress', 'pipe:1'] + entradas + ir_entradas
           + ['-filter_complex', fc, '-map', '[out]', '-t', '%.3f' % T, '-ar', '48000', '-ac', '2']
           + codec + [saida])
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, encoding='utf-8', errors='ignore')
    if registrar_proc:
        registrar_proc(p)    # mix_routes guarda o Popen pra poder matar num /cancel
    for linha in p.stdout:
        if deve_cancelar and deve_cancelar():
            p.terminate()
            break
        if progresso and linha.startswith(('out_time_us=', 'out_time_ms=')):
            try:
                progresso(min(99.0, int(linha.split('=', 1)[1]) / 1e6 / T * 100))
            except ValueError:
                pass
    err = p.stderr.read()
    p.wait()
    if deve_cancelar and deve_cancelar():
        raise Cancelado('render cancelado')
    if p.returncode != 0 or not os.path.exists(saida):
        raise RuntimeError('ffmpeg falhou: ' + err[-400:])
    return dict(out=os.path.abspath(saida), dur_s=round(T, 1), preview=preview,
                musica_lufs=lm, musica_ganho_db=round(gm, 2), camadas=relato,
                avisos=avisos, lufs=lufs(saida))
