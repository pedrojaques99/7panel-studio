# -*- coding: utf-8 -*-
"""
O cabecalho da triagem tem que concordar com os portoes que estao embaixo dele.

Achado olhando a tela, nao rodando teste: uma gravacao de synth saiu com o portao
CORRELACAO vermelho, `-0,18`, dizendo "some em mono" — DEBAIXO de um cabecalho verde
dizendo "PODE ESTICAR / fonte limpa".

A causa nao e bug de calculo: `veredito()` e o vocabulario tecnico da CLI e pesa so
pulso e apito. No terminal isso nunca incomodou, porque a correlacao sai numa coluna
ao lado e o humano le as duas. Numa tela vira contradicao, e portao que se contradiz
na propria tela ensina a pessoa a ignorar os dois.

`veredito` fica como esta — mexer nele divergiria do `_tools/triagem.py`. Quem decide
o botao e `pode_esticar`, e ele reprova se QUALQUER portao reprovar.
"""
import os

import numpy as np
import pytest
from scipy.io import wavfile

from dsp.medidas import triar
from conftest import precisa_ffmpeg


@pytest.fixture
def fora_de_fase(tmp_path):
    """Estereo com R = -L: soma mono da silencio. Sem pulso e sem apito.

    E o caso exato do achado: passa em tudo que o `veredito` olha, e morre no
    portao que ele nao olha.
    """
    p = str(tmp_path / 'fora-de-fase.wav')
    rng = np.random.default_rng(11)
    t = np.arange(int(44100 * 5.0)) / 44100.0
    # acorde sustentado: denso, harmonico, sem transiente
    L = sum(np.sin(2 * np.pi * f * t) for f in (110, 138.6, 164.8, 220)) / 4.0
    L += rng.standard_normal(t.size) * 0.01
    est = np.stack([L, -L], axis=1)
    wavfile.write(p, 44100, (est / np.abs(est).max() * 0.8 * 32767).astype(np.int16))
    return p


@precisa_ffmpeg
def test_correlacao_reprovada_derruba_o_pode_esticar(fora_de_fase):
    d = triar(fora_de_fase)

    corr = next(g for g in d['portoes'] if g['nome'] == 'corr')
    assert corr['status'] == 'reprova', 'o fixture nao esta fora de fase'
    assert d['pode_esticar'] is False, (
        'portao CORRELACAO vermelho com pode_esticar=True: o cabecalho verde volta'
    )
    assert 'CORRELACAO' in d['reprovados']


@precisa_ffmpeg
def test_o_veredito_tecnico_NAO_muda(fora_de_fase):
    """A CLI continua dizendo o que sempre disse — a divergencia seria pior."""
    d = triar(fora_de_fase)
    assert d['veredito'] == 'pronto', (
        'veredito passou a pesar correlacao: isso diverge do _tools/triagem.py'
    )


ANCORA = os.path.join(
    os.environ.get('JACAO_AMBIENTS_DIR', r'Z:\jaques.dsgn\sfx_music\Jacão Ambients'),
    '_limpo', 'analogbrain-1780665883415 - nostalgia vintage melodical synth.wav')


@precisa_ffmpeg
@pytest.mark.skipif(not os.path.exists(ANCORA), reason='acervo nao montado')
def test_a_ancora_de_ouvido_continua_liberada():
    """A guarda nao pode reprovar o que sempre passou.

    Fixture sintetico nao serve de contraprova aqui: o `harmonico` do conftest mede
    pulso 3,15 e apito 5,96 — reprova nos dois, e nao por defeito, e porque serie
    harmonica pura sem chao de ruido tem pico local altissimo. O unico rotulo
    verdadeiro que existe e o ouvido, e ele ja se pronunciou sobre este arquivo:
    e a fonte da cama5, a unica que passou nos tres medidores sem um notch.
    """
    d = triar(ANCORA)
    assert d['reprovados'] == [], 'a guarda passou a reprovar a ancora'
    assert d['pode_esticar'] is True
    assert d['destino'] == 'eno'
    assert d['cpp'] == pytest.approx(28.2, abs=0.5)


@precisa_ffmpeg
def test_arquivo_invalido_nao_pode_esticar(tmp_path):
    p = str(tmp_path / 'falso.wav')
    open(p, 'wb').write(b'isto nao e audio' * 50)
    d = triar(p)
    assert d['pode_esticar'] is False
    assert d['erros']


@pytest.fixture
def levemente_negativa(tmp_path):
    """corr ~ -0,1: decorrelacionado, NAO invertido. E o caso do synth com chorus.

    R = -0,1*L + 0,99*M, com M um acorde independente de L. Como as frequencias nao
    se cruzam, a correlacao fica dominada pelo termo -0,1.
    """
    p = str(tmp_path / 'larga.wav')
    t = np.arange(int(44100 * 5.0)) / 44100.0
    L = sum(np.sin(2 * np.pi * f * t) for f in (110, 138.6, 164.8)) / 3.0
    M = sum(np.sin(2 * np.pi * f * t) for f in (233.1, 277.2, 349.2)) / 3.0
    R = -0.1 * L + 0.99 * M
    est = np.stack([L, R], axis=1)
    wavfile.write(p, 44100, (est / np.abs(est).max() * 0.8 * 32767).astype(np.int16))
    return p


@precisa_ffmpeg
def test_correlacao_levemente_negativa_e_AVISO_e_nao_reprova(levemente_negativa):
    """O acervo trata "some em mono" como ler-e-decidir, nunca como barrar.

    No PRONTUARIO.md todo arquivo com correlacao negativa (-0,02 a -0,09) esta em
    "Passa, mas leia antes"; "Reprovado na fonte" so tem falha de pulso. Um portao
    mais rigido que o dado nao protege: ele barrava TODA gravacao do synth, que usa
    chorus com spread de 180.
    """
    d = triar(levemente_negativa)
    corr = next(g for g in d['portoes'] if g['nome'] == 'corr')
    assert -0.5 < d['corr'] < 0, 'o fixture nao esta na faixa que importa'
    assert corr['status'] == 'aviso', 'voltou a reprovar o que o acervo aceita'
    assert 'CORRELACAO' not in d['reprovados']


@precisa_ffmpeg
def test_oposicao_de_fase_de_verdade_continua_reprovando(fora_de_fase):
    """A folga do limiar nao pode engolir o cancelamento real (R = -L)."""
    d = triar(fora_de_fase)
    corr = next(g for g in d['portoes'] if g['nome'] == 'corr')
    assert d['corr'] < -0.5
    assert corr['status'] == 'reprova'
