# -*- coding: utf-8 -*-
"""
Os medidores que decidem se vale gastar render — e pra onde a fonte puxa.

Cada sinal do `sinais` existe pra provocar UM medidor e tem gabarito conhecido, entao
aqui nao se afirma "o numero X" e sim "o vao entre os dois grupos". Onde ha numero
absoluto ele veio de medicao, e o comentario diz qual.

O teste central do arquivo e `test_apito_e_nota_tem_o_mesmo_pico_e_so_a_estabilidade_separa`.
Se ele cair, a triagem inteira esta errada: seria voltar a notchar melodia.
"""
import os

import numpy as np
import pytest

from dsp.medidas import (
    LIMIAR_ESTAB, LIMIAR_PICO, LIMIAR_PULSO, LIMIAR_PULSO_FLUX,
    apitos, correlacao, cpp, destino, medidas_soltas, pulso_flux, triar, veredito,
)

from conftest import precisa_ffmpeg


@pytest.fixture(scope='module')
def wavs(wav_factory, sinais):
    """Grava os sinais uma vez por modulo — as medidas leem por ffmpeg, precisam de arquivo."""
    return {k: wav_factory(k, sinais[k], sinais['sr'])
            for k in ('pulsado', 'liso', 'harmonico', 'apito', 'nota', 'ressaca')}


# --------------------------------------------------------------------------
# PULSO — o portao da ressaca
# --------------------------------------------------------------------------

@precisa_ffmpeg
def test_pulso_separa_batida_de_ruido_liso(wavs):
    """`pulso_flux` e PROXY (spearman 0,66 contra o librosa), entao so a SEPARACAO vale.

    Nao ha valor absoluto pra afirmar: no `pulsado` a mediana do onset e ~0 entre as
    batidas e a razao p95/mediana explode (medido: 5,0e11). O que o portao promete e
    ordenar, e a ordem tem que ser brutal.
    """
    p = pulso_flux(wavs['pulsado'])
    liso = pulso_flux(wavs['liso'])
    assert p > liso * 100, 'batida a 2 Hz tem que ficar ordens de grandeza acima do liso'


@precisa_ffmpeg
def test_ruido_liso_passa_abaixo_do_limiar_do_proxy(wavs):
    """Sem periodicidade de amplitude, nada sobrevive ao stretch. Medido: 1,12 contra 3,0."""
    assert pulso_flux(wavs['liso']) < LIMIAR_PULSO_FLUX


@precisa_ffmpeg
def test_pulsado_reprova_no_limiar(wavs):
    assert pulso_flux(wavs['pulsado']) >= LIMIAR_PULSO_FLUX


@precisa_ffmpeg
def test_fonte_curta_demais_nao_tem_pulso_pra_medir(wav_factory):
    """Menos de 40 quadros nao da estatistica; tem que devolver None, nao numero inventado."""
    assert pulso_flux(wav_factory('pisca', np.zeros(2205, dtype=np.float32) + 0.1)) is None


# --------------------------------------------------------------------------
# CPP — o que separa `eno` de `mount-shrine`
# --------------------------------------------------------------------------

@precisa_ffmpeg
def test_serie_harmonica_da_cpp_bem_acima_do_ruido(wavs):
    """No acervo: melodico 11-28 (analogbrain 28,2), drone 5-6 (silenthill 6,3).

    Medido nos sinais: harmonico 12,4 contra liso 4,7 — cai nos dois grupos certos.
    """
    h = cpp(wavs['harmonico'])
    r = cpp(wavs['liso'])
    assert h > r * 2, 'harmonia clara tem que dobrar o CPP do ruido'
    assert h > 6.9 >= r, 'os dois tem que cair em lados opostos do corte do destino'


@precisa_ffmpeg
def test_cpp_de_fonte_curta_e_none(wav_factory):
    assert cpp(wav_factory('cpp_curto', np.zeros(2205, dtype=np.float32) + 0.1)) is None


# --------------------------------------------------------------------------
# APITO — a descoberta central: apito e nota tem a mesma altura
# --------------------------------------------------------------------------

@precisa_ffmpeg
def test_apito_sai_na_frequencia_certa_e_estavel(wavs):
    """Senoide parada de 9.641 Hz: tem que ser o maior pico e estar em ~todo quadro.

    Medido: 9641,5 Hz, 69,5x a mediana local, estabilidade 1,00.
    """
    picos = apitos(wavs['apito'])
    assert picos, 'nao achou pico nenhum num sinal que e literalmente uma senoide aguda'
    hz, razao, estab = picos[0]
    assert hz == pytest.approx(9641, rel=0.02)
    assert razao >= LIMIAR_PICO
    assert estab >= LIMIAR_ESTAB


@precisa_ffmpeg
def test_apito_e_nota_tem_o_mesmo_pico_e_so_a_estabilidade_separa(wavs):
    """**O teste que sustenta o projeto.** Se ele cair, a triagem notcha melodia.

    `apito` e `nota` sao a MESMA senoide de 9.641 Hz. A unica diferenca e que a nota
    entra e sai (porta de 0,7 Hz). Frequencia igual, pico da mesma ordem — o que
    separa e permanencia:

        apito  9641 Hz  69,5x  estabilidade 1,000   -> notcha
        nota   9641 Hz  35,6x  estabilidade 0,625   -> passa

    E o mesmo vao do acervo (nota/textura 82-88%, apito 93-99%, nada entre 88 e 93).
    """
    a_hz, a_r, a_e = apitos(wavs['apito'])[0]
    n_hz, n_r, n_e = apitos(wavs['nota'])[0]

    assert a_hz == pytest.approx(n_hz, rel=0.02), 'e a mesma senoide nos dois'
    assert n_r >= LIMIAR_PICO, 'a nota tambem e um pico ALTO — nao e altura que separa'
    assert a_e >= LIMIAR_ESTAB, 'o apito esta parado: tem que passar de 0,90'
    assert n_e < LIMIAR_ESTAB, 'a nota vai e vem: tem que ficar abaixo de 0,90'


@precisa_ffmpeg
def test_ruido_sem_parcial_nao_tem_pico_que_conte(wavs):
    """Ruido nao pode gerar apito falso: medido, o maior pico do `liso` da 1,37x."""
    picos = apitos(wavs['liso'])
    assert picos
    assert picos[0][1] < LIMIAR_PICO


@precisa_ffmpeg
def test_apitos_de_arquivo_curto_devolve_lista_vazia(wav_factory):
    """Menos de 2 s: devolve [], nao estoura. A UI precisa de lista, nao de excecao."""
    assert apitos(wav_factory('apito_curto', np.zeros(22050, dtype=np.float32) + 0.1)) == []


# --------------------------------------------------------------------------
# VEREDITO — tabela-verdade das 4 saidas, sem audio
# --------------------------------------------------------------------------

@pytest.mark.parametrize('pulso,pico,estab,esperado', [
    (1.0, 1.0, 0.00, 'pronto'),      # nada errado
    (1.0, 30.0, 0.99, 'notchar'),    # parcial parado e alto
    (9.0, 1.0, 0.00, 'achatar'),     # so pulso: vira ressaca
    (9.0, 30.0, 0.99, 'nao-estica'), # os dois: nao vale o render
])
def test_a_tabela_verdade_das_quatro_saidas(pulso, pico, estab, esperado):
    assert veredito(pulso, pico, estab) == esperado


def test_pico_alto_mas_instavel_e_NOTA_e_passa():
    """O bug que quase tirou a melodia da cama5.

    Primeira versao marcava `analogbrain-1780665883415` como notchar por um pico de
    29,2x em 2.643 Hz. So que 2.643 Hz e mi7 — nota da melodia. Estabilidade 0,84.
    """
    assert veredito(1.0, 29.2, 0.84) == 'pronto'


def test_estavel_mas_baixo_tambem_passa():
    """Estabilidade sozinha nao condena: parcial permanente e fraco e so cor."""
    assert veredito(1.0, 4.9, 1.00) == 'pronto'


def test_a_fronteira_do_pico_e_inclusiva():
    assert veredito(1.0, LIMIAR_PICO, LIMIAR_ESTAB) == 'notchar'
    assert veredito(1.0, LIMIAR_PICO - 0.01, LIMIAR_ESTAB) == 'pronto'
    assert veredito(1.0, LIMIAR_PICO, LIMIAR_ESTAB - 0.01) == 'pronto'


def test_o_proxy_usa_um_limiar_de_pulso_mais_baixo():
    """`pulso_flux` nao e o pulso do librosa: 3,0 contra 8,0. A flag tem que valer."""
    assert veredito(5.0, 1.0, 0.0, proxy=True) == 'achatar'
    assert veredito(5.0, 1.0, 0.0, proxy=False) == 'pronto'
    assert LIMIAR_PULSO_FLUX < LIMIAR_PULSO


# --------------------------------------------------------------------------
# DESTINO — os cortes do recalibrador, e as duas ancoras de ouvido
# --------------------------------------------------------------------------

def test_ancora_de_ouvido_a_fonte_da_cama5_tem_que_dar_eno():
    """`analogbrain-1780665883415`: escuro mas muito harmonico. Saiu eno e confirmou
    no ouvido — e o unico rotulo verdadeiro que existe, junto com o de baixo."""
    assert destino({'centroid_hz': 569, 'flatness': 0.08, 'cpp': 28.2}) == 'eno'


def test_ancora_de_ouvido_o_silenthill_tem_que_dar_mount_shrine():
    """`silenthill-type-`: centroide parecido com o da cama5, CPP metade. So o CPP separa."""
    assert destino({'centroid_hz': 514, 'flatness': 0.09, 'cpp': 6.3}) == 'mount-shrine'


@pytest.mark.parametrize('cent,esperado', [(2381, 'aphex'), (2380, 'eno')])
def test_a_fronteira_do_centroide_e_2381(cent, esperado):
    """Brilhante demais vai pro aphex, custe o que custar ao resto."""
    assert destino({'centroid_hz': cent, 'flatness': 0.0, 'cpp': 20.0}) == esperado


@pytest.mark.parametrize('flat,esperado', [(0.14020, 'aphex'), (0.14019, 'eno')])
def test_a_fronteira_da_flatness_e_014020(flat, esperado):
    """Sujo tambem vai pro aphex, mesmo sendo escuro: la a estranheza e o ponto."""
    assert destino({'centroid_hz': 100, 'flatness': flat, 'cpp': 20.0}) == esperado


@pytest.mark.parametrize('harm,esperado', [(6.9, 'mount-shrine'), (6.91, 'eno')])
def test_a_fronteira_do_cpp_e_69(harm, esperado):
    assert destino({'centroid_hz': 100, 'flatness': 0.1, 'cpp': harm}) == esperado


def test_o_brilho_ganha_do_cpp():
    """A ordem dos ifs importa: brilhante vai pro aphex mesmo com CPP de drone."""
    assert destino({'centroid_hz': 9000, 'flatness': 0.9, 'cpp': 1.0}) == 'aphex'


def test_dict_vazio_nao_estoura_e_cai_no_drone():
    """Sem medida nenhuma tudo vira 0 — e 0 <= 6,9, entao mount-shrine. Nao pode levantar."""
    assert destino({}) == 'mount-shrine'


@precisa_ffmpeg
def test_o_harmonico_medido_de_verdade_puxa_pra_eno(wavs):
    """Fecha o circuito: medida real -> destino, sem numero na mao. Medido: centroide
    401,8 Hz, flatness 0,0003, CPP 12,4."""
    assert destino(medidas_soltas(wavs['harmonico'])) == 'eno'


@precisa_ffmpeg
def test_o_apito_medido_de_verdade_puxa_pra_aphex(wavs):
    """Senoide de 9,6 kHz sobre ruido: centroide 10.995 Hz. Brilhante = aphex."""
    assert destino(medidas_soltas(wavs['apito'])) == 'aphex'


# --------------------------------------------------------------------------
# CORRELACAO — o portao do "some em mono"
# --------------------------------------------------------------------------

@precisa_ffmpeg
def test_canais_identicos_dao_correlacao_um(wav_factory, sinais):
    x = sinais['liso']
    assert correlacao(wav_factory('corr_ident', np.stack([x, x], 1))) == pytest.approx(1.0, abs=0.01)


@precisa_ffmpeg
def test_oposicao_de_fase_da_menos_um_e_e_isso_que_some_em_mono(wav_factory, sinais):
    """R = -L: som lindo no fone, silencio no celular. O portao existe pra isso."""
    x = sinais['liso']
    c = correlacao(wav_factory('corr_fase', np.stack([x, -x], 1)))
    assert c == pytest.approx(-1.0, abs=0.01)
    assert c <= 0, 'correlacao <= 0 e o que a triagem reprova'


@precisa_ffmpeg
def test_mono_devolve_um_porque_nao_ha_o_que_somar_errado(wavs):
    assert correlacao(wavs['liso']) == pytest.approx(1.0, abs=0.01)


# --------------------------------------------------------------------------
# TRIAR — o contrato que a UI consome
# --------------------------------------------------------------------------

CHAVES = {'arquivo', 'path', 'dur_s', 'pulso', 'pulso_proxy', 'apito_hz', 'apito_x',
          'apito_estab', 'cpp', 'centroid_hz', 'flatness', 'corr', 'veredito',
          'destino', 'receita', 'portoes', 'af_notch', 'erros'}


@precisa_ffmpeg
def test_triar_devolve_o_contrato_inteiro(wavs):
    d = triar(wavs['harmonico'])
    assert CHAVES <= set(d), 'faltou chave do contrato: %s' % (CHAVES - set(d))
    assert d['arquivo'] == os.path.basename(wavs['harmonico'])
    assert d['veredito'] in {'pronto', 'notchar', 'achatar', 'nao-estica'}
    assert d['destino'] in {'eno', 'aphex', 'mount-shrine'}
    assert d['erros'] == []


@precisa_ffmpeg
def test_os_quatro_portoes_saem_na_ordem_e_com_o_formato_da_UI(wavs):
    """Ordem pulso/cpp/apito/corr e fixa: a UI desenha a coluna nessa sequencia."""
    portoes = triar(wavs['harmonico'])['portoes']
    assert [p['nome'] for p in portoes] == ['pulso', 'cpp', 'apito', 'corr']
    for p in portoes:
        assert set(p) == {'nome', 'rotulo', 'valor', 'limiar', 'status', 'unidade', 'obs'}
        assert p['status'] in {'ok', 'aviso', 'reprova'}
        assert isinstance(p['valor'], (int, float))
        assert isinstance(p['limiar'], (int, float))
        assert p['obs'], 'portao sem obs nao explica nada pra quem le'


@precisa_ffmpeg
def test_a_receita_vem_completa_com_as_sete_chaves(wavs):
    r = triar(wavs['harmonico'])['receita']
    assert set(r) == {'esticar', 'janela', 'escuro_hz', 'escuro_db', 'teto_hz',
                      'ambiencia', 'nivel_ambiencia'}
    assert r['esticar'] > 1.0 and r['janela'] > 0.0


@precisa_ffmpeg
def test_o_apito_reprova_no_portao_e_ja_sai_com_o_notch_pronto(wavs):
    """Fonte com apito: portao 'reprova' e `af_notch` preenchido pra rodar antes de esticar."""
    d = triar(wavs['apito'])
    apito = [p for p in d['portoes'] if p['nome'] == 'apito'][0]
    assert apito['status'] == 'reprova'
    assert d['veredito'] == 'notchar'
    assert 'equalizer=f=9641' in d['af_notch']


@precisa_ffmpeg
def test_a_nota_so_avisa_e_nao_gera_notch(wavs):
    """Mesmo pico, estabilidade baixa: aviso, e `af_notch` VAZIO. Notchar tiraria a musica."""
    d = triar(wavs['nota'])
    apito = [p for p in d['portoes'] if p['nome'] == 'apito'][0]
    assert apito['status'] == 'aviso'
    assert d['veredito'] == 'pronto'
    assert d['af_notch'] == ''


@precisa_ffmpeg
def test_estereo_fora_de_fase_reprova_no_portao_de_correlacao(wav_factory, sinais):
    x = sinais['liso']
    d = triar(wav_factory('triar_fase', np.stack([x, -x], 1)))
    corr = [p for p in d['portoes'] if p['nome'] == 'corr'][0]
    assert corr['status'] == 'reprova'
    assert 'mono' in corr['obs']


@precisa_ffmpeg
def test_arquivo_inexistente_nao_estoura(tmp_path):
    """Robustez minima: a triagem varre pasta inteira, um arquivo ruim nao pode derrubar."""
    d = triar(str(tmp_path / 'nao-existe.wav'))
    assert isinstance(d, dict) and 'erros' in d


@precisa_ffmpeg
def test_arquivo_inexistente_avisa_em_erros(tmp_path):
    """FALHA CONHECIDA — defeito do CODIGO, nao do teste.

    Nenhuma medida levanta excecao num arquivo que o ffmpeg nao le: cada uma devolve
    None/[]/{} pelos seus proprios guardas de tamanho, entao `erros` sai vazio. O
    resultado e que `triar` de um arquivo inexistente responde `veredito='pronto'`,
    `destino='mount-shrine'`, `dur_s=0.0` e nenhum aviso — indistinguivel de uma
    fonte boa. Quem chamar isso gasta render em nada.

    O conserto e no `triar`: marcar erro quando a decodificacao nao devolve amostra
    (ex.: `dur_s == 0` ou `pulso is None and not pk and not med`).
    """
    assert triar(str(tmp_path / 'nao-existe.wav'))['erros']


@precisa_ffmpeg
def test_arquivo_invalido_avisa_em_erros(tmp_path):
    """Mesmo defeito do teste acima, agora com arquivo que EXISTE e nao e audio."""
    p = tmp_path / 'lixo.wav'
    p.write_bytes(b'isto nao e um wav' * 200)
    assert triar(str(p))['erros']
