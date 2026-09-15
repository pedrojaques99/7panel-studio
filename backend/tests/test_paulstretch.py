# -*- coding: utf-8 -*-
"""
O portao do motor. Este arquivo existe por causa de um bug real, nao por higiene.

O `/api/stretch` tinha `out_step = half` (overlap=2) enquanto a CLI rodava overlap=4.
Todo render feito pela UI saia com 9 dB de tremolo a 8 Hz — o "chiado de panela de
pressao" — e ninguem viu, porque as duas copias eram plausiveis lendo isoladas.

Os numeros abaixo (9,03 / 0,25 / 0,00 dB) foram documentados em `PLANO-eno-stretch.md`
por medicao, ANTES deste teste existir, e `ripple_db` os reproduz por um caminho
independente (geometria da janela, sem render). Bater nos tres e a prova de que o
medidor e a implementacao concordam.
"""
import numpy as np
import pytest

from dsp.paulstretch import paulstretch, ripple_db, fator_efetivo

SR = 44100


# --------------------------------------------------------------------------
# O bug do overlap
# --------------------------------------------------------------------------

def test_ripple_overlap_2_e_a_catastrofe_documentada():
    """overlap=2 -> 9,03 dB. E o bug, e o teste o fixa pra ninguem 'otimizar' de volta."""
    assert ripple_db(11025, 2) == pytest.approx(9.03, abs=0.05)


def test_ripple_overlap_4_e_o_padrao_correto():
    """overlap=4 -> 0,25 dB. 36x menos ripple, ao custo de 2x de CPU."""
    assert ripple_db(11025, 4) == pytest.approx(0.25, abs=0.05)


def test_ripple_overlap_8_e_perfeito():
    assert ripple_db(11025, 8) == pytest.approx(0.0, abs=0.01)


def test_ripple_cai_monotonicamente_com_overlap():
    vals = [ripple_db(11025, ov) for ov in (2, 4, 8, 16)]
    assert vals == sorted(vals, reverse=True)


@pytest.mark.parametrize('win', [2048, 8192, 11025, 22050])
def test_overlap_4_fica_abaixo_de_1_db_em_qualquer_janela(win):
    """O invariante que importa: qualquer janela usada na pratica tem que somar plano."""
    assert ripple_db(win, 4) < 1.0


def test_janela_e_ajustada_pra_ser_divisivel_pelo_passo():
    """`win_size -= win_size % overlap` nao e cosmetico.

    Sem isso o passo nao divide a janela, a soma COLA quebra e o ripple volta mesmo
    com overlap=4. Uma janela primo-ish tem que continuar plana.
    """
    assert ripple_db(11027, 4) < 1.0


# --------------------------------------------------------------------------
# O motor em si
# --------------------------------------------------------------------------

def _ruido(n, seed=1):
    return np.random.default_rng(seed).standard_normal(n).astype(np.float32) * 0.2


@pytest.mark.parametrize('fator', [2.0, 8.0, 20.0])
def test_o_tamanho_da_saida_bate_com_o_previsto(fator):
    """`fator_efetivo` tem que prever o render exatamente, sem rodar o render."""
    x = _ruido(SR)
    y = paulstretch(SR, x, stretch=fator, window_sec=0.25, seed=7)
    _, previsto, _ = fator_efetivo(x.size, SR, fator, 0.25)
    assert y.size == previsto


def test_fonte_curta_entrega_MENOS_do_que_o_pedido():
    """Bug real, e de proposito nao corrigido na conta — so exposto.

    A ultima janela precisa caber inteira, entao a entrada util e `n - win_size`.
    Em 1 s com janela de 0,5 s pedindo 12x, saem 6,62x — 45% a menos. A CLI faz
    identico e todos os renders aprovados do acervo sairam assim; mexer aqui
    invalidaria a calibracao. O conserto e o aviso na UI.
    """
    x = _ruido(SR)
    real, _, _ = fator_efetivo(x.size, SR, 12.0, 0.5)
    assert real == pytest.approx(6.62, abs=0.05)


@pytest.mark.parametrize('dur_s,minimo', [(2, 9.2), (10, 11.4), (60, 11.9)])
def test_o_fator_converge_pro_pedido_conforme_a_fonte_cresce(dur_s, minimo):
    real, _, _ = fator_efetivo(SR * dur_s, SR, 12.0, 0.5)
    assert real >= minimo
    assert real <= 12.0


def test_fonte_menor_que_a_janela_nao_estica_nada():
    """Nao pode estourar: o laco nunca roda, e a UI precisa de um numero, nao de excecao."""
    real, out_len, win = fator_efetivo(1000, SR, 12.0, 0.5)
    assert real == 0.0 and out_len == 0 and win > 1000


def test_seed_torna_o_render_reproduzivel():
    """Sem isso nao da pra comparar overlap 2 contra 4 — foi assim que se provou
    que o apito de 9.641 Hz vem da fonte e nao do algoritmo."""
    x = _ruido(SR)
    a = paulstretch(SR, x, 8.0, 0.25, seed=42)
    b = paulstretch(SR, x, 8.0, 0.25, seed=42)
    assert np.array_equal(a, b)


def test_seeds_diferentes_dao_render_diferente():
    x = _ruido(SR)
    a = paulstretch(SR, x, 8.0, 0.25, seed=1)
    b = paulstretch(SR, x, 8.0, 0.25, seed=2)
    assert not np.array_equal(a, b)


def test_normaliza_pra_092_de_pico():
    x = _ruido(SR) * 10.0          # entrada estourada de proposito
    y = paulstretch(SR, x, 8.0, 0.25, seed=7)
    assert float(np.max(np.abs(y))) == pytest.approx(0.92, abs=0.01)


def test_preserva_mono_e_estereo():
    mono = _ruido(SR)
    assert paulstretch(SR, mono, 4.0, 0.25, seed=7).ndim == 1
    est = np.stack([_ruido(SR, 1), _ruido(SR, 2)], axis=1)
    out = paulstretch(SR, est, 4.0, 0.25, seed=7)
    assert out.ndim == 2 and out.shape[1] == 2


def test_saida_nao_tem_nan_nem_inf():
    y = paulstretch(SR, _ruido(SR), 12.0, 0.5, seed=7)
    assert np.isfinite(y).all()


def test_overlap_2_produz_mais_tremolo_que_overlap_4_no_render_real():
    """O teste caro, e o unico que prova o bug no audio e nao so na geometria.

    Mede modulacao de 3-30 Hz no envelope da saida, que e exatamente o medidor de
    `tremolo` do domar.py. Ruido branco esticado deveria ser liso; com overlap=2 ele
    ganha uma batida na taxa de quadro.
    """
    x = _ruido(SR * 2)
    def tremolo(y):
        hop = 160
        n = y.size // hop
        e = np.sqrt((y[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
        e = e - e.mean()
        F = np.abs(np.fft.rfft(e * np.hanning(e.size)))
        f = np.fft.rfftfreq(e.size, hop / SR)
        b = (f >= 3) & (f <= 30)
        return float(F[b].max() / (np.median(F[b]) + 1e-12))

    ruim = tremolo(paulstretch(SR, x, 8.0, 0.25, seed=7, overlap=2))
    bom = tremolo(paulstretch(SR, x, 8.0, 0.25, seed=7, overlap=4))
    assert ruim > bom, 'overlap=2 deveria tremer mais que overlap=4'
