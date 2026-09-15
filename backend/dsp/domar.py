# -*- coding: utf-8 -*-
"""
domar.py - tira os tres defeitos que sobram depois de esticar. Mede, conserta, reprova.

Portado FIELMENTE de `_tools/domar.py` do projeto Jacao Ambients. Os limiares foram
calibrados contra o acervo real — nao mexa neles.

## O problema

Paulstretch entrega "nuvem", mas entrega junto tres coisas que o ouvido marca como
defeito. Nenhuma das tres e opiniao — as tres saem em numero na medicao:

  ONDA        O Paulstretch mata o TRANSIENTE, nao a PERIODICIDADE DE AMPLITUDE.
              Faixa com pulso (bateria, baixo ritmico) esticada 12x nao vira nuvem:
              vira ressaca. Cada batida virou um swell de 6 s. Na medicao aparece
              como faixa dinamica p10-p90 grande: cama boa fica em 3-6 dB, a
              `cama3-bass` estava em 19,0 dB com modulacao dominante de 6,0 s.

              Conserto: dynaudnorm com janela curta o bastante pra ACOMPANHAR a
              onda (~0,7x o periodo medido) e achata-la. Numa cama nao ha transiente
              pra o leveler estragar, entao o "pumping" que seria defeito em musica
              aqui e exatamente o que se quer.

  APITO       Um parcial agudo estavel sobrevive ao sorteio de fase e vira senoide
              continua — o "panela de pressao". Sai como pico estreito no espectro
              medio: 3.483 Hz a 25x a mediana na `cama4-drum`, 9.641 Hz a 7,8x na
              `cama2-aphex`.

              Conserto: acha os picos por razao-contra-mediana e notcha cada um com
              `equalizer` (dois polos, Q alto). Cirurgico: nao mexe no resto da banda.

  BRILHO      Esticado de referencia (Eno, 9 Beet Stretch) e ESCURO. O que sobe pra
              cima de ~5 kHz depois do stretch e quase todo residuo do algoritmo,
              nao material. Shelf negativo no agudo e o que separa "nuvem" de
              "chiado".

## Ordem

Notch -> shelf escuro -> achatar. Nessa ordem porque achatar por ultimo garante que
o nivel final e o alvo, e porque nao adianta achatar antes de tirar o que vai mudar
a energia media.

## Nao rode isto num EP sequenciado

O achatador supoe que o arquivo e UMA cama constante. Num EP montado pelo
`sequenciar.py`, a faixa dinamica do arquivo inteiro E o arco entre faixas diferentes —
construido de proposito. Medido nas mixes longas:

    LOOP-fundo-plato    5,8 dB   cama de verdade, passou sem achatar
    EP02-drum            9,0 dB
    MADRUGADA-descida   26,4 dB   <- isso e a curva de descida, nao defeito
    EP01-analogico-arco 30,7 dB   <- isso e o arco

E o achatador nem consegue agir nisso: ele trabalha numa janela de ~1 s e a diferenca de
nivel esta entre faixas separadas por minutos. Em EP01 ele mexeu 5 dB e nao corrigiu nada.

Em mix sequenciada use `achatar=False`: o notch e o shelf continuam valendo (na EP02 o
apito de 9.641 Hz caiu de 8,0x pra 4,0x), o arco fica intacto.

## O nivel final — e por que ele precisa ser declarado

O achatador e `dynaudnorm` com `p=0.95`, que normaliza PICO. Ele nao e so um achatador:
e tambem um maximizador de volume. Nas camas em que ele entrou o nivel subiu junto; nas
que passaram sem achatar ficou onde o `ambiente.py` deixou. Resultado medido no primeiro
lote de 1 h:

    ENO-softpsycho      -11,6 LUFS   (achatou)
    MOUNTSHRINE-11-05   -13,2        (achatou)
    MOUNTSHRINE-v4      -14,8        (achatou)
    ENO-analogloop      -19,4        (nao achatou)
    MOUNTSHRINE-y2k     -20,1        (nao achatou)
    MOUNTSHRINE-ps-do-ps -20,2       (nao achatou)

**8,6 dB de espalhamento** — exatamente o defeito que o `PLANO-mix-jacao.md` diagnosticou
no acervo cru e que a gente consertou la, reintroduzido aqui pela porta dos fundos.

E no YouTube isso nao se resolve sozinho: a plataforma so ABAIXA o que esta alto, nunca
sobe o que esta baixo. Duas camas do mesmo canal com 7 dB de diferenca obrigam o ouvinte
a mexer no volume — que e o oposto de cama.

Por isso `alvo_lufs` existe e vem ligado por padrao. Ele mede a saida DEPOIS da cadeia
inteira e aplica ganho pra fechar no alvo. E medicao, nao estimativa: o `dynaudnorm` nao
tem como saber o nivel final de antemao.

## O que NAO faz

Nao comprime com ratio, nao satura, nao adiciona reverb. Cama nao leva efeito: leva
correcao. Tudo aqui e ffmpeg de fabrica (`equalizer`, `treble`, `lowpass`,
`dynaudnorm`) — nenhum DSP escrito a mao.

## TREMOLO — o quarto medidor, calibrado nos vereditos

Modulacao rapida (3-30 Hz) na saida. Nao se mede na fonte: modulacao de entrada e
dividida pelo fator de stretch e nao sobrevive (6,7 Hz esticado x10 vira 0,67 Hz).
O que aparece nesta banda DEPOIS de esticar e defeito do processo — foi assim que o
ripple de 9 dB do overlap=2 se manifestou.

O limiar veio dos cinco vereditos de ouvido do Jaques, todos medidos aqui:

    cama4  73,4x   reprovada  ("chiado de panela de pressao, n curto")
    cama5  14,9x   "bom mas faltou textura"
    cama8   9,4x   "ta mt massa"
    cama7   8,2x   10/10
    cama6   5,6x   10/10

A ordem batia exata com o julgamento, e o corte foi pra 12 (o vao entre 9,4 e 14,9).

**Ai o sexto ponto derrubou o limiar.** A `t-aphex-zerog-0742-01` mede 20,6x e o Jaques
aprovou 10/10. Entao 12 nao separa nada, e o medidor **nao e portao** — virou coluna
informativa.

O que sobra de verdade: a `cama4`, unica reprovada, mede 73,4x e tem explicacao
mecanica (o ripple de 9 dB do overlap=2, ja corrigido). As outras seis, de 5,6x a
20,6x, foram todas aprovadas. Ou seja, o medidor so distingue catastrofe de normal —
e a catastrofe tinha causa conhecida. Nao ha evidencia de que ele preveja gosto.

Ficou aqui porque detecta regressao do bug de overlap, que e barato de vigiar. Nao
use pra reprovar material.
"""
import os, subprocess
import numpy as np

LIMIAR_TREMOLO = 40.0   # NAO e portao de gosto — ver o cabecalho. So pega catastrofe


def _r(cmd):
    return subprocess.run(cmd, capture_output=True)


def lufs(path):
    t = _r(['ffmpeg', '-hide_banner', '-nostats', '-t', '900', '-i', path, '-af',
            'loudnorm=I=-14:TP=-1:print_format=json', '-f', 'null',
            '-']).stderr.decode(errors='ignore')
    i = t.rfind('{')
    if i < 0:
        return None
    try:
        import json as _j
        return float(_j.loads(t[i:t.rfind('}') + 1])['input_i'])
    except Exception:
        return None


def dur(p):
    o = _r(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'csv=p=0', p]).stdout.decode().strip()
    try:
        return float(o)
    except Exception:
        return 0.0


LIMITER = 'alimiter=limit=0.891:level=disabled'

IR_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      'assets', 'ir')


def _ir(decay, sr=48000):
    """Caminho de um IR sintetico de `decay` segundos, gerado na primeira vez e cacheado.

    ffmpeg nao tem reverb algoritmico. Tem `afir`, que e convolucao — e convolucao
    precisa de um impulso. Em vez de versionar WAV de sala gravada (peso no repo e
    licenca pra rastrear), o impulso e GERADO: rajada de ruido rosa com decaimento
    exponencial. E a mesma tecnica do `Tone.Reverb` que o preview usa no browser, o
    que mantem os dois lados parecidos POR CONSTRUCAO em vez de por sorte.

    O corte em 9 kHz nao e economia de CPU. Cauda de reverb com o agudo inteiro
    RECOLOCA o chiado que o shelf escuro acabou de tirar — que e exatamente o defeito
    que trouxe a rota /eq a existencia. O highpass em 120 Hz impede a cauda de embolar
    o grave que o `grave_db` acabou de por.

    As duas fontes de ruido tem SEMENTE DIFERENTE de proposito: dois ruidos iguais
    convolvem pra uma cauda mono no centro, que e o oposto do que reverb serve pra fazer.

    Medido: convolucao de 1 h com IR de 2,5 s roda a 769x tempo real (4,7 s).
    """
    os.makedirs(IR_DIR, exist_ok=True)
    caminho = os.path.join(IR_DIR, 'ir-%.1fs.wav' % decay)
    if os.path.exists(caminho) and dur(caminho) > 0:
        return caminho
    d = '%.3f' % decay
    cru = caminho + '.cru.wav'
    r = _r(['ffmpeg', '-y', '-v', 'error',
            '-f', 'lavfi', '-i', 'anoisesrc=d=%s:c=pink:r=%d:a=0.5' % (d, sr),
            '-f', 'lavfi', '-i', 'anoisesrc=d=%s:c=pink:r=%d:a=0.5:s=7777' % (d, sr),
            '-filter_complex',
            '[0:a][1:a]join=inputs=2:channel_layout=stereo,'
            'afade=t=out:st=0:d=%s:curve=exp,highpass=f=120,lowpass=f=9000[ir]' % d,
            '-map', '[ir]', '-c:a', 'pcm_f32le', cru])
    if r.returncode != 0 or dur(cru) <= 0:
        raise RuntimeError('nao consegui gerar o IR de %.1fs: %s'
                           % (decay, r.stderr.decode(errors='ignore')[-300:]))
    k = _calibra(cru, sr)
    rc = _r(['ffmpeg', '-y', '-v', 'error', '-i', cru,
             '-af', 'volume=%.6f' % k, '-c:a', 'pcm_f32le', caminho])
    try:
        os.remove(cru)
    except OSError:
        pass
    if rc.returncode != 0 or dur(caminho) <= 0:
        raise RuntimeError('nao consegui calibrar o IR de %.1fs' % decay)
    return caminho


def _calibra(ir, sr, sonda_s=4.0):
    """Por quanto multiplicar o IR pra cauda sair no MESMO nivel do sinal seco.

    Isto e medido, nao deduzido, e a razao esta no numero. Neste build o `afir`
    devolve praticamente SO o molhado — o `dry=1` dele nao ressoma o seco — e o
    nivel de saida muda 47 dB entre as opcoes de `irnorm` (-47,1 / +2,9 / +0,5 LUFS
    no mesmo material). Confiar no `dry`/`wet` do filtro foi tentado e deu cauda
    inaudivel a -70 LUFS, com o nivelador compensando +38 dB no fim e levantando o
    chao de ruido junto — o defeito exato que esta rota existe pra combater.

    **`irnorm=-1` nao e gosto, e requisito.** Com o default (`irnorm=1`) o filtro
    NORMALIZA o IR por dentro e a amplitude do arquivo vira irrelevante: medido, o
    mesmo material com dois IRs separados por 20 dB deu -47,1 LUFS nos DOIS. Ou seja,
    a calibracao daqui seria silenciosamente descartada e o reverb sairia inaudivel
    (correlacao 1,0000 com o seco, medida). Com `-1` a amplitude manda, que e o que
    torna esta funcao capaz de fazer alguma coisa.

    Entao: passa um ruido rosa conhecido pelo convolver e compara a energia que
    entrou com a que saiu. Roda uma vez por `decay` e fica cacheada dentro do
    proprio IR, entao nao custa nada no render.
    """
    sonda = ['-f', 'lavfi', '-i', 'anoisesrc=d=%g:c=pink:r=%d:a=0.5' % (sonda_s, sr)]
    saida_pcm = ['-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', str(sr), '-ac', '1', '-']
    ent = _r(['ffmpeg', '-v', 'error'] + sonda + saida_pcm).stdout
    sai = _r(['ffmpeg', '-v', 'error'] + sonda + ['-i', ir, '-filter_complex',
              '[0:a]aformat=channel_layouts=stereo[p];[p][1:a]afir=irnorm=-1[o]',
              '-map', '[o]'] + saida_pcm).stdout
    a = np.frombuffer(ent, dtype='<f4')
    b = np.frombuffer(sai, dtype='<f4')
    if a.size == 0 or b.size == 0:
        raise RuntimeError('calibracao do IR nao produziu audio')
    rms = lambda v: float(np.sqrt((v.astype(np.float64) ** 2).mean()))
    rb = rms(b)
    if rb <= 1e-9:
        raise RuntimeError('convolucao de calibracao saiu muda')
    return rms(a) / rb


def _pcm(p, sr, max_s=None):
    cmd = ['ffmpeg', '-v', 'error']
    if max_s:
        cmd += ['-t', '%g' % max_s]
    cmd += ['-i', p, '-map', 'a:0', '-f', 'f32le', '-acodec', 'pcm_f32le',
            '-ar', str(sr), '-ac', '1', '-']
    return np.frombuffer(_r(cmd).stdout, dtype='<f4').astype(np.float32)


def medir(path, max_s=600.0):
    """Devolve (faixa_db, periodo_s, [picos]) — os tres numeros que importam."""
    x = _pcm(path, 16000, max_s)
    if x.size < 16000:
        return None
    # --- ONDA: envelope RMS a 20 Hz ---
    hop = 800
    n = x.size // hop
    e = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
    edb = 20 * np.log10(e + 1e-9)
    vivo = edb > (edb.max() - 60)          # ignora fade e silencio das pontas
    faixa = float(np.percentile(edb[vivo], 90) - np.percentile(edb[vivo], 10))
    v = (edb - edb.mean()) * np.hanning(edb.size)
    F = np.abs(np.fft.rfft(v, 8 * v.size))
    fr = np.fft.rfftfreq(8 * v.size, 1 / 20.0)
    m = (fr > 1 / 240.0) & (fr < 2.0)      # de 0,5 s a 4 min
    periodo = float(1.0 / fr[m][int(np.argmax(F[m]))])
    # --- APITO: espectro medio, picos contra a mediana da banda ---
    X = _pcm(path, 44100, max_s)
    N = 8192
    k = max(X.size // N, 1)
    S = np.abs(np.fft.rfft(X[:k * N].reshape(k, N) * np.hanning(N), axis=1)).mean(0)
    f = np.fft.rfftfreq(N, 1 / 44100.0)
    picos = []
    # Piso em 2,5 kHz de proposito. Abaixo disso um pico estreito quase sempre e NOTA
    # (na cama5 o detector achou 1.567 Hz a 11,6x — sol da melodia do synth) e notchar
    # ali tira a musica. Todo apito de stretch que apareceu de verdade no acervo estava
    # acima: 3.483, 4.576 e 9.641 Hz.
    banda = (f > 2500) & (f < 16000)
    Sb, fb = S[banda], f[banda]
    # mediana LOCAL (vizinhanca de +-25%), nao da banda inteira. Com mediana global,
    # qualquer inclinacao de agudo (o shelf escuro daqui mesmo) derruba a mediana e
    # infla a razao de todo mundo — o numero "piorava" depois de consertar.
    razao = np.empty_like(Sb)
    for i, hz in enumerate(fb):
        viz = (fb > hz * 0.75) & (fb < hz * 1.25)
        razao[i] = Sb[i] / (np.median(Sb[viz]) + 1e-12)
    for i in np.argsort(razao)[::-1]:
        hz = float(fb[i])
        if any(abs(hz - q[0]) < hz * 0.12 for q in picos):
            continue                        # ja pegamos esse pico
        picos.append((hz, float(razao[i])))
        if len(picos) >= 6:
            break
    # --- TREMOLO: modulacao rapida (3-30 Hz) na SAIDA ---
    # E aqui e nao na fonte: modulacao de entrada e dividida pelo fator de stretch e
    # nao sobrevive. O que aparece nesta banda depois de esticar e defeito do processo
    # — foi assim que o ripple de 9 dB do overlap=2 se manifestou na cama4 (22,6x).
    hop2 = 160
    n2 = x.size // hop2
    tre = 0.0
    if n2 > 200:
        e2 = np.sqrt((x[:n2 * hop2].reshape(n2, hop2) ** 2).mean(1) + 1e-12)
        e2 = e2 - e2.mean()
        F2 = np.abs(np.fft.rfft(e2 * np.hanning(e2.size)))
        f2 = np.fft.rfftfreq(e2.size, 1 / 100.0)
        b2 = (f2 >= 3) & (f2 <= 30)
        if b2.sum() > 8:
            tre = float(F2[b2].max() / (np.median(F2[b2]) + 1e-12))
    return faixa, periodo, picos, tre


def cadeia(faixa, periodo, picos, alvo_faixa, limiar_pico, corte_pico_db,
           escuro_hz, escuro_db, teto_hz, achatar, forca=12,
           grave_db=0.0, grave_hz=110.0, com_limiter=True):
    """Monta o -af a partir do que foi medido. Cada elo so entra se o numero pedir."""
    af, notas = [], []
    for hz, r in picos:
        if r < limiar_pico:
            continue
        # corta ate o pico virar ~3x a vizinhanca — que e o ponto em que ele deixa
        # de ser evento e vira cor. Formula antiga (log10 suave) cortava 4,9 dB num
        # pico de 10,5x e o apito continuava la.
        g = min(corte_pico_db, 20.0 * np.log10(r / 3.0))
        af.append('equalizer=f=%.0f:t=q:w=9:g=%.1f' % (hz, -g))
        notas.append('notch %.0f Hz -%.1f dB (era %.1fx a mediana)' % (hz, g, r))
    if escuro_db > 0:
        af.append('treble=g=%.1f:f=%g:w=0.6' % (-escuro_db, escuro_hz))
        notas.append('shelf %.0f Hz -%.1f dB' % (escuro_hz, escuro_db))
    # GRAVE — o unico elo daqui que e GOSTO e nao medicao. Desligado por padrao (0.0),
    # entao nenhum render existente muda; quem liga e a rota /eq, com a mao de alguem.
    # Vem DEPOIS do shelf escuro porque tirar agudo ja muda o peso percebido do grave:
    # quem escolhe o numero precisa estar ouvindo a cama ja escurecida.
    if grave_db:
        af.append('bass=g=%.1f:f=%g:w=0.7' % (grave_db, grave_hz))
        notas.append('grave %+.1f dB @ %.0f Hz (gosto, nao medicao)'
                     % (grave_db, grave_hz))
    if teto_hz > 0:
        af.append('lowpass=f=%g:poles=2' % teto_hz)
        notas.append('teto %.0f Hz' % teto_hz)
    # So achata onda na faixa da RESSACA (1 s a 60 s). Deriva mais lenta que isso e a
    # respiracao de proposito da cama — achatar ela deixaria a cama chapada, que e o
    # defeito oposto. A cama4 tem 8,3 dB num periodo de 218 s: isso e respiro, nao onda.
    if achatar and faixa > alvo_faixa and 1.0 <= periodo <= 60.0:
        # A janela do suavizador de ganho tem que ser MUITO menor que a onda pra
        # conseguir acompanha-la. Medido na cama3 (onda de 6,0 s, 19,0 dB):
        #   janela 4,2 s -> 17,0 dB   (passa por cima da onda, nao corrige nada)
        #   janela 0,9 s ->  6,6 dB   (acompanha e achata)
        # Dai o 0,15x do periodo, preso entre 0,6 s e 8 s.
        jan = max(0.6, min(periodo * 0.15, 8.0))
        g = int(round(jan / 0.1))
        g += 1 - (g % 2)                     # dynaudnorm exige g impar
        g = max(3, min(g, 301))
        # `m` e o teto de ganho. m=20 levanta o trecho baixo em ate 26 dB — junto com
        # ele sobe o chao de ruido, e a cama soa "estourada" (feedback do Jaques na
        # cama6 v1). O conserto de primeira escolha pra onda NAO e levantar mais aqui,
        # e esticar mais no Paulstretch: stretch maior ja entrega envelope mais plano.
        af.append('dynaudnorm=f=100:g=%d:p=0.95:m=%g:n=1:b=1' % (g, forca))
        notas.append('achata janela %.1fs forca m=%g (onda medida em %.1fs)'
                     % (g * 0.1, forca, periodo))
    # Com reverb ligado o limiter sai daqui e vai pra DEPOIS da convolucao: cauda de
    # reverb SOMA energia, e limitar antes dela deixaria o pico escapar no fim.
    if com_limiter:
        af.append(LIMITER)
    return ','.join(af), notas


def _resumo(m):
    """(faixa, periodo, picos, tre) -> dict chato pra UI. apito_x e o pior pico."""
    faixa, periodo, picos, tre = m
    return {'faixa_db': float(faixa), 'periodo_s': float(periodo),
            'apito_x': float(max((r for _, r in picos), default=0.0)),
            'tremolo_x': float(tre)}


def domar(entrada, saida=None, so_medir=False, alvo_faixa=6.0, limiar_pico=5.0,
          corte_pico=14.0, escuro_hz=4500.0, escuro_db=7.0, teto_hz=13000.0,
          achatar=True, forca=12.0, alvo_lufs=-16.0,
          grave_db=0.0, grave_hz=110.0, reverb_wet=0.0, reverb_decay=2.5):
    """Mede, monta a cadeia, renderiza, nivela e mede de novo.

    Mesma sequencia do `main()` do domar.py original: cadeia -> ffmpeg -> loudnorm
    medido DEPOIS da cadeia (nao estimado) -> medicao do depois.
    """
    m = medir(entrada)
    if not m:
        raise ValueError('arquivo curto demais ou sem audio: %s' % entrada)
    antes = _resumo(m)
    if so_medir:
        return {'antes': antes, 'depois': None, 'notas': [], 'af': '',
                'out': None, 'lufs': None}

    af, notas = cadeia(m[0], m[1], m[2], alvo_faixa, limiar_pico, corte_pico,
                       escuro_hz, escuro_db, teto_hz, achatar, forca,
                       grave_db=grave_db, grave_hz=grave_hz,
                       com_limiter=not reverb_wet)

    out = saida or os.path.splitext(entrada)[0] + '-domado.wav'
    cod = (['-c:a', 'libmp3lame', '-b:a', '320k'] if out.lower().endswith('.mp3')
           else ['-c:a', 'pcm_s24le', '-ar', '48000'])
    if reverb_wet:
        # `afir` e convolucao, entao o IR entra como SEGUNDA entrada — e duas entradas
        # nao cabem num `-af`. Vira filter_complex, numa passada so: a cadeia de EQ roda
        # primeiro e e o resultado DELA que alimenta o convolver, que e a ordem certa
        # (equalizar a fonte, depois por no espaco — nao o contrario).
        ir = _ir(reverb_decay)
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', entrada, '-i', ir,
               '-filter_complex',
               # `afir` devolve so a cauda (ver `_calibra`), entao a mistura e feita
               # aqui, explicita: o seco passa em ganho 1 SEMPRE e a cauda entra
               # pesada por `reverb_wet`. Resultado = seco + w*cauda, que e o que um
               # dry/wet deveria fazer — e o seco nunca perde nivel, aconteca o que
               # acontecer com a cauda.
               '[0:a]%s,asplit=2[seco][pre];[pre][1:a]afir=irnorm=-1[cauda];'
               '[seco][cauda]amix=inputs=2:weights=1 %.3f:normalize=0,%s[mix]'
               % (af, reverb_wet, LIMITER),
               '-map', '[mix]']
        notas.append('reverb wet %.2f decay %.1fs, IR sintetico (gosto, nao medicao)'
                     % (reverb_wet, reverb_decay))
    else:
        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', entrada, '-af', af]
    r = _r(cmd + cod + ['-ac', '2', out])
    if r.returncode != 0:
        raise RuntimeError('ffmpeg falhou: ' + r.stderr.decode(errors='ignore')[-400:])

    fim = None
    if alvo_lufs:
        # Medido DEPOIS da cadeia, nao estimado: o dynaudnorm normaliza pico e nao tem
        # como saber o nivel final de antemao. Sem isso o achatador decide o volume por
        # acidente, e o lote sai com 8,6 dB de espalhamento — ver o cabecalho.
        atual = lufs(out)
        if atual is not None:
            g = alvo_lufs - atual
            tmp_n = out + '.nivelando' + os.path.splitext(out)[1]
            rn = _r(['ffmpeg', '-y', '-v', 'error', '-i', out, '-af',
                     'volume=%.2fdB,alimiter=limit=0.891:level=disabled' % g]
                    + cod + ['-ac', '2', tmp_n])
            if rn.returncode == 0 and dur(tmp_n) > 0:
                os.replace(tmp_n, out)
                fim = lufs(out)
                notas.append('nivelou %.1f LUFS -> %+.1f dB -> alvo %.1f'
                             % (atual, g, alvo_lufs))
            else:
                notas.append('!! nivelamento falhou, nivel fica como estava')
                fim = atual

    m2 = medir(out)
    return {'antes': antes, 'depois': _resumo(m2) if m2 else None,
            'notas': notas, 'af': af, 'out': out, 'lufs': fim}
