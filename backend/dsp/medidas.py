# -*- coding: utf-8 -*-
"""
medidas.py - diz QUAIS faixas do acervo esticam bem e PRA QUAL lugar, antes de gastar render.

Portado FIELMENTE de `_tools/triagem.py` do projeto Jacao Ambients. Os limiares foram
calibrados contra 331 arquivos reais de audio — nao mexa neles.

## Por que existe

O `domar.py` conserta a cama DEPOIS de esticar. Isso e a rede de seguranca, nao o
plano. O que ele conserta da pra PREVER pela fonte, e prever custa segundos contra os
minutos de um Paulstretch.

  RESSACA   Paulstretch mata o transiente, nao a periodicidade de amplitude. Fonte
            com pulso alto vira onda lenta em vez de nuvem. `bass-only.wav` tem
            pulso 57,8 e virou 19,0 dB de ressaca com periodo de 6,0 s.

  APITO     Pico tonal estreito no agudo. Aqui esta a descoberta que inverteu o plano:
            eu tinha escrito que o apito de 9.641 Hz vinha do overlap errado do
            Paulstretch. **Estava errado.** Rodando a mesma fonte com overlap 2 e 4 o
            pico sai IDENTICO (9.645 Hz a 8,4x nos dois), e so aparece nas fontes
            `analogbrain` — `aphex-synth.wav` nao tem. O apito ja esta NO ARQUIVO: o
            stretch nao o cria, ele o expoe, transformando um parcial de passagem numa
            senoide sustentada de minutos. Por isso se mede na FONTE.

## Apito nao e nota — e a estabilidade que separa

Primeira versao marcava `analogbrain-1780665883415` (a fonte da cama5, a que ficou
boa) como "notchar", por causa de um pico de 29,2x em 2.643 Hz. So que 2.643 Hz e
**mi7**: e nota da melodia, e notchar ali tiraria a musica.

O que separa os dois nao e frequencia nem altura do pico, e **permanencia**:

    apito   parcial parado, presente em ~todo quadro do arquivo   -> estabilidade ~1,0
    nota    entra e sai com a melodia                             -> estabilidade baixa

Entao a `estabilidade` e a fracao de quadros em que aquele bin passa 3x a vizinhanca.
So vira `notchar` quem for alto **e** estavel. Pico alto e instavel e musica: passa.

## Destinos

Nem toda fonte quer o mesmo tratamento. Tres lugares, tres receitas:

  eno            Music for Airports. Harmonia clara e consonante (tom_conf alto),
                 medio-grave, sem ruido. Estica MUITO e fica sereno e claro.
  aphex          Selected Ambient Works. Brilhante ou sujo (centroide alto ou
                 flatness alta). Estica menos e com janela menor, pra sobrar
                 estranheza e brilho em vez de virar algodao.
  mount-shrine   Ambient escuro e chuvoso. Centroide baixo, drone. Estica com janela
                 longa, teto agressivo e a chuva bem mais presente que nas outras.

A classificacao sai de metricas medidas aqui, nao do nome do arquivo — mas e
ponto de partida pra ouvir, nao lei. A cama5 saiu de `eno` e confirmou.
"""
import os, subprocess
import numpy as np

# A ambiencia (chuva, rua) mora FORA deste repo: sao arquivos de audio pesados do acervo
# Jacao Ambients. O RECEITA guarda so o nome do arquivo; o caminho completo se monta com
# esta raiz, que da pra apontar noutro lugar pela env JACAO_AMBIENTS_DIR.
AMBIENTES_DIR = os.environ.get('JACAO_AMBIENTS_DIR',
                               r'Z:\jaques.dsgn\sfx_music\Jacão Ambients')


def caminho_ambiencia(nome):
    """As gravacoes moram em `raw_records/`, nao na raiz do acervo: montar raiz + nome
    apontava pra arquivo que nao existe, e a receita da triagem saia com caminho morto.
    Procura na subpasta primeiro e cai na raiz (layout antigo) se nao achar."""
    for p in (os.path.join(AMBIENTES_DIR, 'raw_records', nome), os.path.join(AMBIENTES_DIR, nome)):
        if os.path.isfile(p):
            return p
    return os.path.join(AMBIENTES_DIR, 'raw_records', nome)

LIMIAR_PULSO = 8.0      # mesma fronteira que o analisar.py usa pro bucket DRUM
# Quando a faixa nao esta no catalogo.json (pasta nova), o pulso e calculado aqui por
# fluxo espectral, sem librosa. E um PROXY, e vale saber o quanto:
#   spearman contra o pulso do librosa nas 26 do _limpo = 0,66  (grosseiro)
#   MAS o top-3 do ranking e exatamente os 3 que o librosa marcou >=8
#     bass-only 9,3 | analogbrain-1781042551104 3,9 | crazy-mono 3,3 | (4o: 2,9)
# Ou seja: serve de PORTAO, nao de medida. 3,0 e o corte, e quem cair entre 2,5 e 3,5
# merece uma olhada no `analisar.py` antes de virar cama.
LIMIAR_PULSO_FLUX = 3.0
LIMIAR_PICO = 5.0       # x a mediana da vizinhanca
# 0,90 nao e chute: no acervo os dois grupos se separam num vao limpo.
#   nota / textura natural : 82%, 84%, 88%   (inclui a fonte da cama5, que funcionou)
#   apito de verdade       : 93%, 97%, 99%, 99%
# Nada caiu entre 88% e 93%. O limiar mora no vao.
LIMIAR_ESTAB = 0.90

# esticar, janela, escuro_hz, escuro_db, teto_hz, ambiencia, nivel da ambiencia
RECEITA = {
    'eno':          (12, 0.50, 4500,  7, 13000, 'Chuva Suave.m4a', -42),
    'aphex':        (7,  0.30, 6000,  4, 16000, 'Rua Campo Erê 3.m4a', -40),
    'mount-shrine': (10, 0.70, 3000, 12,  7000, 'Chuva Forte.m4a', -34),
}


def _pcm(p, sr, max_s=180.0):
    return np.frombuffer(subprocess.run(
        ['ffmpeg', '-v', 'error', '-t', '%g' % max_s, '-i', p, '-map', 'a:0',
         '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', str(sr), '-ac', '1', '-'],
        capture_output=True).stdout, dtype='<f4').astype(np.float32)


def duracao(path):
    """Duracao em segundos, robusta a container sem header.

    `.webm` de gravacao de tela (as `session-grain`) nao declara duracao: o ffprobe
    devolve 'N/A' e o float() quebrava. Fallback: decodifica e le o `time=` final,
    que sempre existe porque ai o ffmpeg contou amostra.
    """
    o = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                        '-of', 'csv=p=0', path], capture_output=True).stdout.decode().strip()
    try:
        return float(o)
    except ValueError:
        pass
    err = subprocess.run(['ffmpeg', '-v', 'error', '-stats', '-i', path, '-map', 'a:0',
                          '-f', 'null', '-'], capture_output=True).stderr.decode(errors='ignore')
    ult = err.rfind('time=')
    if ult < 0:
        return 0.0
    try:
        h, m, sg = err[ult + 5:ult + 16].split(':')
        return int(h) * 3600 + int(m) * 60 + float(sg)
    except Exception:
        return 0.0


def pulso_flux(path, max_s=180.0):
    """Pulso por fluxo espectral: p95 sobre a mediana do envelope de onset. Sem librosa.

    Serve pra pasta que nao passou pelo `analisar.py`. Proxy, nao medida — ver o
    comentario em LIMIAR_PULSO_FLUX.
    """
    sr = 22050
    x = _pcm(path, sr, max_s)
    N, H = 1024, 256
    n = (x.size - N) // H
    if n < 40:
        return None
    idx = np.arange(N)[None, :] + H * np.arange(n)[:, None]
    S = np.log1p(np.abs(np.fft.rfft(x[idx] * np.hanning(N), axis=1)) * 100)
    d = np.diff(S, axis=0)
    d[d < 0] = 0                      # so o que SOBE conta como onset
    onset = d.sum(1)
    return float(np.percentile(onset, 95) / (np.median(onset) + 1e-9))


def apitos(path, n=4):
    """Picos tonais acima de 2,5 kHz: (hz, razao, estabilidade).

    razao        pico contra a mediana LOCAL (+-25%). Local e nao global porque
                 qualquer inclinacao de agudo falseia a razao de todo mundo.
    estabilidade fracao de quadros em que o bin passa 3x a vizinhanca. E o que
                 separa apito (parado, ~1,0) de nota (vai e vem, baixo).

    Piso em 2,5 kHz: abaixo disso pico estreito quase sempre e fundamental de nota.
    """
    X = _pcm(path, 44100)
    if X.size < 44100 * 2:
        return []
    N = 8192
    k = X.size // N
    F = np.abs(np.fft.rfft(X[:k * N].reshape(k, N) * np.hanning(N), axis=1))
    S = F.mean(0)
    f = np.fft.rfftfreq(N, 1 / 44100.0)
    b = (f > 2500) & (f < 16000)
    Sb, fb, Fb = S[b], f[b], F[:, b]
    vizs = [(fb > h * 0.75) & (fb < h * 1.25) for h in fb]
    razao = np.array([Sb[i] / (np.median(Sb[v]) + 1e-12) for i, v in enumerate(vizs)])
    out = []
    for i in np.argsort(razao)[::-1]:
        hz = float(fb[i])
        if any(abs(hz - q) < hz * 0.12 for q, _, _ in out):
            continue
        rq = Fb[:, i] / (np.median(Fb[:, vizs[i]], axis=1) + 1e-12)
        out.append((hz, float(razao[i]), float((rq >= 3.0).mean())))
        if len(out) >= n:
            break
    return out


def veredito(pulso, pico, estab, proxy=False):
    """Tecnico: da pra esticar? So vira notchar quem for alto E estavel."""
    ressaca = pulso >= (LIMIAR_PULSO_FLUX if proxy else LIMIAR_PULSO)
    apito = pico >= LIMIAR_PICO and estab >= LIMIAR_ESTAB
    if ressaca and apito:
        return 'nao-estica'
    if ressaca:
        return 'achatar'
    if apito:
        return 'notchar'
    return 'pronto'


def cpp(path, max_s=120.0):
    """Cepstral Peak Prominence: quao periodico/harmonico e o espectro.

    Medida validada em analise de qualidade de voz. Aqui ela faz o papel de "harmonia
    clara" de um jeito UNIFORME — o `tom_conf` nao servia porque vinha do librosa numas
    faixas e do medidas_soltas noutras, com correlacao 0,137 entre os dois.

    Separa seco o que centroide e flatness nao separavam:
        melodico  analogbrain 28,2 | cigarra 12,3 | aphex-synth 12,1 | analog-loop 11,6
        drone     silenthill   6,3 | fog        5,9 | beach-fossils 5,5 | drone-min 5,0
    """
    sr = 22050
    x = _pcm(path, sr, max_s)
    N, H = 4096, 2048
    n = (x.size - N) // H
    if n < 5:
        return None
    idx = np.arange(N)[None, :] + H * np.arange(n)[:, None]
    S = np.abs(np.fft.rfft(x[idx] * np.hanning(N), axis=1)) + 1e-12
    c = np.abs(np.fft.irfft(np.log(S), axis=1))
    seg = c[:, int(sr / 500):int(sr / 50)]      # quefrencia de 50 a 500 Hz
    return float(np.median(seg.max(1) / (np.median(seg, axis=1) + 1e-12)))


def medidas_soltas(path, max_s=180.0):
    """centroide/flatness/tom_conf minimos pra classificar destino sem o catalogo.json.

    tom_conf aqui e um substituto grosseiro: quanto a energia se concentra em poucos
    parciais estaveis (harmonia clara) contra espalhada (ruido). Nao e Krumhansl-Schmuckler
    como no analisar.py — so o suficiente pra escolher entre tres receitas.
    """
    x = _pcm(path, 44100, max_s)
    if x.size < 44100:
        return {}
    N = 8192
    k = x.size // N
    F = np.abs(np.fft.rfft(x[:k * N].reshape(k, N) * np.hanning(N), axis=1))
    S = F.mean(0) + 1e-12
    f = np.fft.rfftfreq(N, 1 / 44100.0)
    cent = float((S * f).sum() / S.sum())
    flat = float(np.exp(np.log(S).mean()) / S.mean())
    conc = float(np.sort(S)[::-1][:int(S.size * 0.02)].sum() / S.sum())
    return dict(centroid_hz=cent, flatness=flat, tom_conf=conc,
                cpp=cpp(path), dur_s=duracao(path))


def destino(d):
    """Estetico: pra qual dos tres lugares essa fonte puxa. Ponto de partida, nao lei.

    Numeros vindos do `recalibrar.py` sobre as 331 faixas do acervo: busca por cortes nos
    percentis de centroide/flatness/CPP, descartando todo corte que erre uma das ancoras
    de ouvido (`analogbrain-1780665883415` tem que dar eno, `silenthill-type-` tem que
    dar mount-shrine), e ficando com a divisao mais equilibrada entre os que sobram.

    `tom_conf` saiu da conta de proposito: nao e comparavel entre as fontes do acervo
    (correlacao 0,137 entre o Krumhansl do librosa e a concentracao do medidas_soltas).
    Centroide e flatness sao (correlacao log 0,962), e o CPP e medido igual pra todos.
    """
    cent = d.get('centroid_hz') or 0
    flat = d.get('flatness') or 0
    harm = d.get('cpp') or 0
    if cent >= 2381 or flat >= 0.14020:
        return 'aphex'          # brilhante ou sujo: quer sobrar estranheza
    if harm <= 6.9:
        return 'mount-shrine'   # escuro e inarmonico: quer chuva e teto baixo
    return 'eno'                # escuro mas harmonico: aguenta esticar e ficar sereno


def af_notch(picos):
    """-af pra limpar a fonte ANTES de esticar. Corta ate o pico virar ~3x."""
    return ','.join('equalizer=f=%.0f:t=q:w=9:g=%.1f'
                    % (hz, -min(14.0, 20 * np.log10(r / 3.0)))
                    for hz, r, e in picos if r >= LIMIAR_PICO and e >= LIMIAR_ESTAB)


def correlacao(path, max_s=180.0):
    """Correlacao de fase entre L e R. Portao do PRONTUARIO: <= 0 some em mono.

    Estereo largo demais (ou de fase invertida) desaparece quando a plataforma soma os
    canais. Mede o coeficiente de Pearson entre os dois canais decodificados; arquivo
    mono nao tem o que somar errado, entao devolve 1,0.
    """
    canais = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
         'stream=channels', '-of', 'csv=p=0', path],
        capture_output=True).stdout.decode().strip().split('\n')[0].strip()
    try:
        if int(canais) < 2:
            return 1.0
    except ValueError:
        pass
    x = np.frombuffer(subprocess.run(
        ['ffmpeg', '-v', 'error', '-t', '%g' % max_s, '-i', path, '-map', 'a:0',
         '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', '22050', '-ac', '2', '-'],
        capture_output=True).stdout, dtype='<f4').astype(np.float32)
    n = x.size // 2
    if n < 1024:
        return 1.0
    lr = x[:n * 2].reshape(n, 2)
    L, R = lr[:, 0], lr[:, 1]
    if L.std() < 1e-9 or R.std() < 1e-9:
        return 1.0              # canal mudo: nada a perder no mono
    return float(np.corrcoef(L, R)[0, 1])


def _portao(nome, rotulo, valor, limiar, status, obs, unidade=''):
    return dict(nome=nome, rotulo=rotulo, valor=valor, limiar=limiar,
                status=status, unidade=unidade, obs=obs)


def triar(path):
    """Fachada: roda todas as medidas de uma fonte e devolve um dict pra UI.

    Robusta de proposito: medida que estourar vira None no dict e a excecao entra em
    `erros` — o arquivo continua sendo triado com o que deu pra medir.
    """
    erros = []

    def _tenta(f, *a, **k):
        try:
            return f(*a, **k)
        except Exception as e:
            erros.append('%s: %s' % (getattr(f, '__name__', 'medida'), e))
            return None

    dur_s = _tenta(duracao, path)
    pulso = _tenta(pulso_flux, path)
    pk = _tenta(apitos, path) or []
    med = _tenta(medidas_soltas, path) or {}
    corr = _tenta(correlacao, path)

    hz, r, est = pk[0] if pk else (0.0, 0.0, 0.0)
    harm = med.get('cpp')
    cent = med.get('centroid_hz')
    flat = med.get('flatness')

    # veredito e destino usam o mesmo estimador uniforme do triagem.py
    ver = veredito(pulso if pulso is not None else 0.0, r, est, True)
    dest = destino(med)
    e_, j_, ehz, edb, teto, amb, niv = RECEITA[dest]

    # --- portoes, na ordem: pulso, cpp, apito, corr ---
    p = pulso if pulso is not None else 0.0
    if p >= LIMIAR_PULSO_FLUX:
        st_p, obs_p = 'reprova', 'pulso alto: esticado vira ressaca, nao nuvem'
    elif 2.5 <= p <= 3.5:
        st_p, obs_p = 'aviso', 'na zona cinzenta do proxy: confira antes de virar cama'
    else:
        st_p, obs_p = 'ok', 'sem periodicidade de amplitude que sobreviva ao stretch'

    if harm is None:
        obs_c = 'cpp nao medido'
    elif cent is not None and (cent >= 2381 or (flat or 0) >= 0.14020):
        obs_c = 'brilhante ou sujo: puxa pra aphex'
    elif harm <= 6.9:
        obs_c = 'escuro e inarmonico: puxa pra mount-shrine'
    else:
        obs_c = 'escuro mas harmonico: puxa pra eno'

    if r >= LIMIAR_PICO and est >= LIMIAR_ESTAB:
        st_a = 'reprova'
        obs_a = 'parcial parado e alto: e apito, precisa de notch antes de esticar'
    elif r >= LIMIAR_PICO:
        st_a = 'aviso'
        obs_a = 'pico alto mas instavel: isso e NOTA, nao apito — notchar tira a musica'
    else:
        st_a = 'ok'
        obs_a = 'nenhum parcial agudo que vire senoide no stretch'

    # Correlacao NEGATIVA e aviso, nao reprova — e o acervo que diz isso.
    #
    # No PRONTUARIO.md todos os arquivos com correlacao negativa (-0,02, -0,03,
    # -0,06, -0,09) estao na secao "Passa, mas leia antes". A tabela "Reprovado na
    # fonte" so tem falha de PULSO. Ou seja: na pratica calibrada, "some em mono"
    # sempre foi coisa de ler e decidir, nunca de barrar.
    #
    # Eu tinha posto `c <= 0 -> reprova`, mais rigido que o proprio projeto, e o
    # efeito foi imediato: TODA gravacao do synth (que usa chorus com spread de 180
    # e reverb estereo) saia barrada, com o app dizendo NAO ESTIQUE pra material que
    # o acervo teria aceitado. Portao mais rigido que o dado nao protege — so ensina
    # a ignorar o portao.
    #
    # Reprova fica pro cancelamento de verdade. O pior do acervo e -0,09; -0,5 esta
    # bem fora do observado, e ali o material realmente some ao somar.
    c = corr if corr is not None else 1.0
    if c <= -0.5:
        st_r, obs_r = 'reprova', 'canais em oposicao: cancela ao somar em mono'
    elif c <= 0:
        st_r, obs_r = 'aviso', 'some em mono'
    elif c < 0.2:
        st_r, obs_r = 'aviso', 'estereo muito largo: perde corpo na soma mono'
    else:
        st_r, obs_r = 'ok', 'sobrevive a soma mono'

    # --- fonte que nao decodificou nao pode sair verde ---
    #
    # Nenhuma medida ESTOURA quando o ffmpeg nao decodifica: `_pcm` devolve array
    # vazio e cada funcao sai pelo proprio guarda de tamanho (pulso_flux -> None,
    # apitos -> [], medidas_soltas -> {}, correlacao -> 1.0). Como o `_tenta` so
    # captura excecao, `erros` ficava vazio e o dict saia com veredito `pronto` e
    # destino `mount-shrine` — indistinguivel de uma fonte boa.
    #
    # Num painel cujo contrato inteiro e "verde = pode esticar", isso e o defeito
    # mais caro possivel: manda gastar horas de render em nada. `duracao` e o sinal
    # limpo — arquivo valido sempre tem duracao > 0, arquivo inexistente ou nao-audio
    # da 0,0.
    if not dur_s:
        erros.append('nao deu pra decodificar audio de %s' % os.path.basename(path))
        ver = 'nao-estica'
        st_p = st_a = st_r = 'reprova'
        obs_p = obs_a = obs_r = 'arquivo nao decodificou — nao ha o que medir'
        obs_c = 'arquivo nao decodificou'

    portoes = [
        _portao('pulso', 'PULSO', round(p, 2), LIMIAR_PULSO_FLUX, st_p, obs_p),
        _portao('cpp', 'CPP', round(harm, 2) if harm is not None else 0.0,
                6.9, 'ok', obs_c),
        _portao('apito', 'APITO', round(r, 2), LIMIAR_PICO, st_a, obs_a, 'x'),
        _portao('corr', 'CORRELACAO', round(c, 3), 0.0, st_r, obs_r),
    ]

    # --- a decisao da UI olha TODOS os portoes, o `veredito` nao ---
    #
    # `veredito` e o vocabulario tecnico da CLI (`pronto|notchar|achatar|nao-estica`)
    # e ele so pesa pulso e apito — correlacao nunca entrou nessa conta, porque no
    # terminal ela sai como aviso numa coluna ao lado e o humano le as duas.
    #
    # Numa tela isso vira contradicao: uma fonte com correlacao -0,18 saia com o
    # portao CORRELACAO vermelho dizendo "some em mono" DEBAIXO de um cabecalho
    # verde dizendo "pode esticar". Portao que se contradiz na propria tela nao e
    # portao — a pessoa aprende a ignorar os dois.
    #
    # `veredito` fica como esta (mexer nele divergiria do triagem.py); quem decide
    # o botao e este campo, e ele reprova se QUALQUER portao reprovar.
    reprovados = [g['rotulo'] for g in portoes if g['status'] == 'reprova']
    pode_esticar = ver != 'nao-estica' and not reprovados and not erros

    return {
        'arquivo': os.path.basename(path),
        'path': path,
        'pode_esticar': pode_esticar,
        'reprovados': reprovados,
        'dur_s': float(dur_s if dur_s is not None else (med.get('dur_s') or 0.0)),
        'pulso': pulso,
        'pulso_proxy': True,      # veio de pulso_flux e nao do librosa
        'apito_hz': float(hz), 'apito_x': float(r), 'apito_estab': float(est),
        'cpp': harm,
        'centroid_hz': cent,
        'flatness': flat,
        'corr': corr,
        'veredito': ver,
        'destino': dest,
        'receita': {
            'esticar': float(e_), 'janela': float(j_), 'escuro_hz': float(ehz),
            'escuro_db': float(edb), 'teto_hz': float(teto),
            'ambiencia': caminho_ambiencia(amb),
            'nivel_ambiencia': float(niv),
        },
        'portoes': portoes,
        'af_notch': af_notch(pk),
        'erros': erros,
    }
