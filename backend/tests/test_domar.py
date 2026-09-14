# -*- coding: utf-8 -*-
"""
A rede de seguranca: mede a cama esticada, monta a cadeia, mede de novo.

`cadeia()` e logica pura — cada elo so entra se o numero pedir — entao a maior parte
daqui roda sem audio nenhum e e instantanea. Os limiares vieram do acervo real e estao
citados nos comentarios com o numero que os justifica.

O teste que mais importa e o par
`test_onda_de_6s_com_19db_de_faixa_e_ressaca_e_achata` /
`test_deriva_de_218s_e_respiracao_da_cama_e_NAO_achata`: achatar a respiracao lenta
nao e um bug tolerado, e o resultado certo — a cama ficaria chapada.
"""
import os
import sys

import numpy as np
import pytest

import dsp.domar  # noqa: F401  — garante que o submodulo entre no sys.modules

# `dsp/__init__.py` faz `from .domar import domar`, o que rebinda o ATRIBUTO `dsp.domar`
# pra funcao. Pegar o modulo pelo sys.modules e o jeito de alcancar `medir` e `cadeia`
# sem depender dessa colisao de nome.
_D = sys.modules['dsp.domar']
medir = _D.medir
cadeia = _D.cadeia
domar = _D.domar

from conftest import precisa_ffmpeg

# assinatura: (faixa, periodo, picos, alvo_faixa, limiar_pico, corte_pico_db,
#              escuro_hz, escuro_db, teto_hz, achatar, forca)
PADRAO = dict(alvo_faixa=6.0, limiar_pico=5.0, corte_pico_db=14.0,
              escuro_hz=4500.0, escuro_db=7.0, teto_hz=13000.0, achatar=True)


def _cadeia(faixa=3.0, periodo=6.0, picos=(), **kw):
    p = dict(PADRAO)
    p.update(kw)
    return cadeia(faixa, periodo, list(picos), **p)


# --------------------------------------------------------------------------
# NOTCH — so pra pico que passa do limiar, e cortando ate virar ~3x
# --------------------------------------------------------------------------

def test_pico_abaixo_do_limiar_nao_vira_notch():
    """4,9x e cor, nao apito. Notchar ali so tira material."""
    af, notas = _cadeia(picos=[(9641.0, 4.9)])
    assert 'equalizer' not in af
    assert not any('notch' in n for n in notas)


def test_pico_no_limiar_ja_vira_notch():
    af, _ = _cadeia(picos=[(9641.0, 5.0)])
    assert 'equalizer=f=9641' in af


def test_o_corte_leva_o_pico_ate_tres_vezes_a_vizinhanca():
    """20*log10(10.5/3) = 10,88 dB. A formula antiga (log10 suave) cortava 4,9 dB
    e o apito continuava la — este numero e o conserto."""
    af, notas = _cadeia(picos=[(9641.0, 10.5)])
    assert 'equalizer=f=9641:t=q:w=9:g=-10.9' in af
    assert '10.5x' in notas[0]


def test_pico_monstruoso_para_no_teto_do_corte():
    """20*log10(73.4/3) = 27,8 dB — a cama4. O teto de 14 dB existe pra o notch nao
    abrir um buraco audivel na banda."""
    af, _ = _cadeia(picos=[(3483.0, 73.4)], corte_pico_db=14.0)
    assert 'equalizer=f=3483:t=q:w=9:g=-14.0' in af


def test_cada_pico_ganha_o_seu_proprio_notch():
    af, notas = _cadeia(picos=[(3483.0, 25.0), (9641.0, 7.8), (1000.0, 30.0)])
    assert af.count('equalizer=') == 3
    assert len([n for n in notas if n.startswith('notch')]) == 3


# --------------------------------------------------------------------------
# SHELF ESCURO e TETO — so entram se o parametro pedir
# --------------------------------------------------------------------------

def test_shelf_escuro_so_entra_com_db_positivo():
    assert 'treble=g=-7.0:f=4500:w=0.6' in _cadeia(escuro_db=7.0)[0]
    assert 'treble' not in _cadeia(escuro_db=0.0)[0]


def test_teto_so_entra_com_hz_positivo():
    assert 'lowpass=f=13000:poles=2' in _cadeia(teto_hz=13000.0)[0]
    assert 'lowpass' not in _cadeia(teto_hz=0.0)[0]


def test_a_ordem_e_notch_shelf_teto_achatar_limiter():
    """Achatar por ultimo porque nao adianta achatar antes de tirar o que muda a
    energia media — e porque assim o nivel final e o alvo."""
    af, _ = _cadeia(faixa=19.0, periodo=6.0, picos=[(9641.0, 10.5)])
    elos = af.split(',')
    nomes = [e.split('=')[0] for e in elos]
    assert nomes == ['equalizer', 'treble', 'lowpass', 'dynaudnorm', 'alimiter']


def test_o_limiter_entra_sempre_e_por_ultimo():
    for kw in ({}, dict(escuro_db=0.0, teto_hz=0.0, achatar=False),
               dict(faixa=19.0, periodo=6.0)):
        af, _ = _cadeia(**kw)
        assert af.split(',')[-1] == 'alimiter=limit=0.891:level=disabled'


# --------------------------------------------------------------------------
# ACHATADOR — os dois lados da porta
# --------------------------------------------------------------------------

def test_onda_de_6s_com_19db_de_faixa_e_ressaca_e_achata():
    """A cama3-bass: 19,0 dB de faixa num periodo de 6,0 s. Isso e ressaca."""
    af, notas = _cadeia(faixa=19.0, periodo=6.0)
    assert 'dynaudnorm' in af
    assert any('achata' in n for n in notas)


def test_deriva_de_218s_e_respiracao_da_cama_e_NAO_achata():
    """A cama4: 8,3 dB num periodo de 218 s. Passa do alvo de faixa, mas o periodo
    esta FORA de 1-60 s — isso e o respiro de proposito da cama.

    Nao achatar aqui e o resultado CERTO: achatado, ficaria chapado. E o achatador
    nem conseguiria: janela de ~1 s contra uma deriva de minutos (na EP01 ele mexeu
    5 dB e nao corrigiu nada).
    """
    af, notas = _cadeia(faixa=8.3, periodo=218.0)
    assert 'dynaudnorm' not in af
    assert not any('achata' in n for n in notas)


def test_faixa_dentro_do_alvo_nao_precisa_de_achatador():
    """Cama boa fica em 3-6 dB. Se ja esta la, mexer so piora."""
    assert 'dynaudnorm' not in _cadeia(faixa=6.0, alvo_faixa=6.0, periodo=6.0)[0]
    assert 'dynaudnorm' in _cadeia(faixa=6.01, alvo_faixa=6.0, periodo=6.0)[0]


@pytest.mark.parametrize('periodo,achata', [
    (0.99, False),   # mais rapido que 1 s nao e onda, e textura
    (1.00, True),
    (60.0, True),
    (60.01, False),  # mais lento que 1 min ja e respiracao
])
def test_a_janela_de_periodo_da_ressaca_e_de_1_a_60_segundos(periodo, achata):
    assert ('dynaudnorm' in _cadeia(faixa=19.0, periodo=periodo)[0]) is achata


def test_achatar_false_desliga_o_elo_mas_mantem_o_resto():
    """Em mix sequenciada (`sequenciar.py`) a faixa dinamica E o arco entre faixas.
    Notch e shelf continuam valendo — na EP02 o apito caiu de 8,0x pra 4,0x."""
    af, _ = _cadeia(faixa=19.0, periodo=6.0, picos=[(9641.0, 10.5)], achatar=False)
    assert 'dynaudnorm' not in af
    assert 'equalizer' in af and 'treble' in af


# --------------------------------------------------------------------------
# A JANELA DO ACHATADOR — 0,15x o periodo, presa, e g SEMPRE impar
# --------------------------------------------------------------------------

def _g(af):
    elo = [e for e in af.split(',') if e.startswith('dynaudnorm')][0]
    return int([p for p in elo.split(':') if p.startswith('g=')][0][2:])


@pytest.mark.parametrize('periodo,g_esperado', [
    (2.0, 7),     # 0,30 s -> preso no piso de 0,6 s -> 6 -> impar 7
    (6.0, 9),     # 0,90 s -> 9  (a cama3: janela 0,9 s levou 19,0 dB a 6,6 dB)
    (13.0, 21),   # 1,95 s -> 20 -> 21
    (40.0, 61),   # 6,00 s -> 60 -> 61
    (59.0, 81),   # 8,85 s -> preso no teto de 8 s -> 80 -> 81
])
def test_a_janela_e_015_do_periodo_presa_entre_06s_e_8s(periodo, g_esperado):
    """Janela grande demais passa por cima da onda: na cama3, 4,2 s deixou 17,0 dB
    de 19,0. Ela tem que ACOMPANHAR a onda, nao filtra-la."""
    assert _g(_cadeia(faixa=19.0, periodo=periodo)[0]) == g_esperado


@pytest.mark.parametrize('periodo', [1.0, 2.5, 4.0, 6.0, 7.3, 12.0, 20.0, 33.3, 45.0, 60.0])
def test_g_sai_sempre_impar_porque_o_dynaudnorm_exige(periodo):
    """Nao e estetica: com g par o ffmpeg recusa o filtro e a cadeia inteira nao roda."""
    g = _g(_cadeia(faixa=19.0, periodo=periodo)[0])
    assert g % 2 == 1
    assert 3 <= g <= 301


def test_a_forca_do_achatador_vai_pro_filtro():
    """m=20 levanta o chao de ruido junto e a cama soa estourada (cama6 v1). O padrao
    e 12, e quem quiser mudar tem que ser explicito."""
    assert 'm=12' in _cadeia(faixa=19.0, periodo=6.0)[0]
    assert 'm=20' in _cadeia(faixa=19.0, periodo=6.0, forca=20)[0]


# --------------------------------------------------------------------------
# MEDIR — com audio de verdade
# --------------------------------------------------------------------------

@precisa_ffmpeg
def test_a_ressaca_sai_com_periodo_de_alguns_segundos_e_faixa_alta(wav_factory, sinais):
    """Onda de 6 s. Medido: 12,9 dB de faixa, periodo 5,3 s.

    O periodo nao bate 6,0 exato e nao ha bug: o arquivo tem 6 s, ou seja UM ciclo,
    e a resolucao do espectro do envelope nesse comprimento e grosseira. O que o
    portao precisa e cair dentro de 1-60 s, e cai com folga.
    """
    p = wav_factory('domar_ressaca', sinais['ressaca'], sinais['sr'])
    faixa, periodo, picos, tre = medir(p)
    assert 4.5 <= periodo <= 7.5
    assert faixa > 6.0, 'onda lenta tem que passar do alvo de faixa'
    assert 1.0 <= periodo <= 60.0, 'tem que cair na janela que o achatador atende'


@precisa_ffmpeg
def test_ruido_de_amplitude_constante_tem_faixa_baixa(wav_factory):
    """O contraponto: sem onda nenhuma, a faixa fica em decimos de dB (medido 0,49).

    Nao uso o `liso` do conftest aqui de proposito — ver o teste seguinte.
    """
    x = np.random.default_rng(3).standard_normal(44100 * 4).astype(np.float32)
    faixa, periodo, picos, tre = medir(wav_factory('domar_plano', x))
    assert faixa < 3.0
    assert 'dynaudnorm' not in _cadeia(faixa=faixa, periodo=periodo)[0]


@precisa_ffmpeg
def test_o_liso_do_conftest_NAO_tem_faixa_baixa_e_isso_e_da_fonte(wav_factory, sinais):
    """Registro de uma armadilha, nao um defeito do `medir`.

    O `liso` e um passeio aleatorio (`cumsum` de gaussiana). Ele nao tem PULSO — que e
    pra isso que existe — mas passeia muito de nivel: mede 20,3 dB de faixa, mais que
    a propria `ressaca`. Sao dois medidores diferentes: `pulso_flux` olha onset,
    `medir` olha p90-p10 do envelope.

    Quem for escrever teste de faixa dinamica precisa de ruido de amplitude constante,
    nao do `liso`.
    """
    faixa, _, _, _ = medir(wav_factory('domar_liso', sinais['liso'], sinais['sr']))
    assert faixa > 10.0


@precisa_ffmpeg
def test_o_apito_aparece_nos_picos_da_medicao(wav_factory, sinais):
    faixa, periodo, picos, tre = medir(wav_factory('domar_apito', sinais['apito'], sinais['sr']))
    assert picos
    hz, razao = picos[0]
    assert hz == pytest.approx(9641, rel=0.02)
    assert razao >= 5.0


@precisa_ffmpeg
def test_arquivo_curto_demais_nao_da_medida(wav_factory):
    """Menos de 1 s a 16 kHz: devolve None, e o `domar` transforma isso em ValueError."""
    assert medir(wav_factory('domar_curto', np.zeros(4410, dtype=np.float32) + 0.1)) is None


@precisa_ffmpeg
def test_domar_recusa_arquivo_sem_audio_com_erro_claro(wav_factory):
    with pytest.raises(ValueError):
        domar(wav_factory('domar_curto2', np.zeros(4410, dtype=np.float32) + 0.1))


# --------------------------------------------------------------------------
# DOMAR — a fachada
# --------------------------------------------------------------------------

@precisa_ffmpeg
def test_so_medir_devolve_o_antes_e_nao_renderiza_nada(wav_factory, sinais):
    """A UI precisa do diagnostico na hora; o render de cama longa demora minutos."""
    r = domar(wav_factory('domar_sm', sinais['ressaca'], sinais['sr']), so_medir=True)
    assert set(r['antes']) == {'faixa_db', 'periodo_s', 'apito_x', 'tremolo_x'}
    assert r['depois'] is None
    assert r['out'] is None and r['af'] == '' and r['notas'] == []


@precisa_ffmpeg
def test_domar_completo_achata_a_ressaca_e_mede_dos_dois_lados(wav_factory, sinais, tmp_path):
    """O contrato do modulo em uma linha: correcao so entra com numero antes E depois.

    Medido na ressaca sintetica: 12,9 dB -> 3,0 dB, que e a faixa de uma cama boa.
    """
    ent = wav_factory('domar_full', sinais['ressaca'], sinais['sr'])
    out = str(tmp_path / 'domado.wav')
    r = domar(ent, saida=out)

    assert r['depois'] is not None
    assert os.path.exists(out) and os.path.getsize(out) > 1000
    assert r['depois']['faixa_db'] < r['antes']['faixa_db'], 'a onda tinha que ter baixado'
    assert r['depois']['faixa_db'] < 6.0, 'tinha que chegar na faixa de cama boa'
    assert any('achata' in n for n in r['notas'])


@precisa_ffmpeg
def test_domar_nivela_pro_alvo_de_lufs(wav_factory, sinais, tmp_path):
    """8,6 dB de espalhamento no primeiro lote foi o defeito que isto conserta. O
    YouTube so ABAIXA o que esta alto — sem nivelar, o ouvinte mexe no volume."""
    ent = wav_factory('domar_lufs', sinais['ressaca'], sinais['sr'])
    r = domar(ent, saida=str(tmp_path / 'nivelado.wav'), alvo_lufs=-16.0)
    assert r['lufs'] is not None
    assert r['lufs'] == pytest.approx(-16.0, abs=1.5)
    assert any('nivelou' in n for n in r['notas'])


# --------------------------------------------------------------------------
# GRAVE e REVERB — a camada de GOSTO da rota /eq.
#
# O contrato que estes testes guardam nao e "o grave funciona": e que ele fica
# DESLIGADO sozinho. `domar` roda em lote sobre o acervo, e um default diferente de
# zero aqui mudaria calado o som de tudo que ja foi domado.
# --------------------------------------------------------------------------

def test_sem_grave_a_cadeia_sai_igual_a_de_antes():
    """O default e 0.0, e 0.0 nao pode nem aparecer na cadeia."""
    assert 'bass' not in _cadeia()[0]


def test_grave_vira_low_shelf_em_110hz():
    af, notas = _cadeia(grave_db=5.0)
    assert 'bass=g=5.0:f=110:w=0.7' in af
    assert any('grave +5.0 dB' in n for n in notas)


def test_grave_negativo_tambem_passa():
    """Tirar grave e tao valido quanto por. `if grave_db:` cobre os dois lados."""
    assert 'bass=g=-3.0:f=110:w=0.7' in _cadeia(grave_db=-3.0)[0]


def test_grave_entra_depois_do_shelf_escuro():
    """A ordem e a decisao: quem escolhe o grave precisa ouvir a cama ja escurecida."""
    af = _cadeia(grave_db=5.0, escuro_db=7.0)[0]
    assert af.index('treble=') < af.index('bass=')


def test_grave_respeita_a_frequencia_pedida():
    assert 'bass=g=4.0:f=80:w=0.7' in _cadeia(grave_db=4.0, grave_hz=80.0)[0]


def test_limiter_fecha_a_cadeia_por_padrao():
    assert _cadeia()[0].endswith(_D.LIMITER)


def test_com_reverb_o_limiter_sai_da_cadeia():
    """Cauda de reverb SOMA energia: limitar antes dela deixaria o pico escapar.

    Com `com_limiter=False` o `domar()` recoloca o limiter depois da convolucao.
    """
    af = _cadeia(com_limiter=False)[0]
    assert 'alimiter' not in af

