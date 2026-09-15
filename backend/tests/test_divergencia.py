# -*- coding: utf-8 -*-
"""
A defesa contra a causa-raiz, e nao contra o sintoma.

O bug do overlap nao aconteceu porque alguem escreveu Paulstretch errado. Aconteceu
porque existiam DUAS implementacoes — `dashboard_server.py` e `_tools/paulstretch.py` —
e uma foi corrigida sem a outra. Consertar so o numero deixaria a estrutura que produz
o bug intacta.

Entao este arquivo importa as duas e exige que produzam saida IDENTICA, bit a bit, com
a mesma seed. Se alguem mexer numa e esquecer a outra, o teste falha nomeando as duas.

A CLI mora fora deste repo (`Jacao Ambients/_tools/`). Quando ela nao esta montada — CI,
maquina de outra pessoa — o teste pula com aviso, em vez de falhar por ausencia.
"""
import os
import importlib.util

import numpy as np
import pytest

from dsp.paulstretch import paulstretch as ps_app

CLI = os.environ.get(
    'JACAO_TOOLS_DIR',
    r'Z:\jaques.dsgn\sfx_music\Jacão Ambients\_tools',
)
CLI_PS = os.path.join(CLI, 'paulstretch.py')


def _carrega_cli():
    spec = importlib.util.spec_from_file_location('paulstretch_cli', CLI_PS)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pulou = pytest.mark.skipif(
    not os.path.exists(CLI_PS),
    reason='CLI de Jacao Ambients nao montada (defina JACAO_TOOLS_DIR)',
)


@pulou
@pytest.mark.parametrize('fator,janela,overlap', [
    (8.0, 0.25, 4),
    (12.0, 0.50, 4),     # a receita `eno`
    (7.0, 0.30, 4),      # a receita `aphex`
    (10.0, 0.70, 4),     # a receita `mount-shrine`
    (8.0, 0.25, 2),      # o modo antigo tem que continuar reproduzindo render antigo
])
def test_app_e_cli_produzem_o_mesmo_audio(fator, janela, overlap):
    cli = _carrega_cli()
    x = np.random.default_rng(3).standard_normal(44100).astype(np.float32) * 0.2

    a = ps_app(44100, x, fator, janela, seed=11, overlap=overlap)
    b = cli.paulstretch(44100, x, fator, janela, seed=11, overlap=overlap)

    assert a.shape == b.shape, (
        'app e CLI divergiram no TAMANHO da saida — alguem mexeu num motor so.\n'
        '  app: %s\n  cli: %s\n  %s' % (a.shape, b.shape, CLI_PS)
    )
    assert np.array_equal(a, b), (
        'app e CLI divergiram no CONTEUDO — alguem mexeu num motor so.\n'
        '  maior diferenca: %.3e\n  %s' % (float(np.max(np.abs(a - b))), CLI_PS)
    )


@pulou
def test_o_padrao_de_overlap_e_o_mesmo_dos_dois_lados():
    """O bug em uma linha: os defaults tinham que bater e nao batiam."""
    import inspect
    cli = _carrega_cli()
    d_app = inspect.signature(ps_app).parameters['overlap'].default
    d_cli = inspect.signature(cli.paulstretch).parameters['overlap'].default
    assert d_app == d_cli == 4
