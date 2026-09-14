# -*- coding: utf-8 -*-
"""
dsp — o motor de audio do 7panel Studio, com UMA implementacao de cada coisa.

Existe porque havia duas. O `/api/stretch` tinha sua propria copia do Paulstretch
com `out_step = half` (overlap=2), enquanto a CLI de `Jacao Ambients/_tools/` rodava
`out_step = win_size // overlap` com overlap=4. Diferenca medida: 9,03 dB de ripple
contra 0,25 dB — um tremolo de 8 Hz audivel em todo render feito pela UI.

Ninguem percebeu porque as duas copias eram plausiveis lendo isoladas. A defesa nao e
disciplina, e `tests/test_divergencia.py`: ele importa as duas e falha se divergirem.
"""
from .paulstretch import paulstretch, ripple_db, fator_efetivo
from .medidas import (
    RECEITA, LIMIAR_PULSO, LIMIAR_PULSO_FLUX, LIMIAR_PICO, LIMIAR_ESTAB,
    duracao, pulso_flux, apitos, cpp, medidas_soltas, destino, veredito, triar,
)
# `domar` (a funcao) NAO e reexportada aqui de proposito: ela tem o mesmo nome do
# modulo `dsp.domar`, e `from .domar import domar` rebindaria o atributo do pacote
# da funcao por cima do modulo — a partir dai `import dsp.domar as D` devolve a
# funcao e todo `D.medir` quebra. Quem quer a funcao usa `from dsp.domar import domar`.
from .domar import medir, cadeia

__all__ = [
    'paulstretch', 'ripple_db', 'fator_efetivo',
    'RECEITA', 'LIMIAR_PULSO', 'LIMIAR_PULSO_FLUX', 'LIMIAR_PICO', 'LIMIAR_ESTAB',
    'duracao', 'pulso_flux', 'apitos', 'cpp', 'medidas_soltas', 'destino', 'veredito',
    'triar', 'medir', 'cadeia',
]
