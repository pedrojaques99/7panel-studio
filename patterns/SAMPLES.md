# Catalogo de samples

Gerado por `python backend/tools/sample_catalog.py`. **Nao edite a mao**: adicionar
arquivo numa pasta empurra o `n` de todos os seguintes, entao o catalogo so vale
recem-gerado. `--check` diz se esta desatualizado.

**509 arquivos** em **21 bancos**.

Como se toca um sample daqui:

```js
s("vhulto_sampling_the_world_drumkit_kick").n(5)   // banco = pasta, n = linha da tabela
  .struct("x ~ ~ x")                               // o ritmo entra por struct
  .begin(0.1).end(0.4)                             // recorte, pra sample longo
  .speed(0.85)                                     // afinacao/velocidade cruas
```

| coluna | o que e |
| --- | --- |
| **n** | o indice do `.n()`. Ordem alfabetica dentro da pasta. |
| **dur** | segundos. Curto aguenta `ply`; longo pede `begin/end` ou `slow`. |
| **rms** | volume medio do arquivo. Compare antes de culpar o `gain`. |
| **brilho** | cruzamentos por segundo: baixo = grave/pad, alto = chiado/metal. |
| **bpm** | andamento que estava no nome do arquivo (loops). Case com o take. |
| **raiz** | nota gravada do banco afinado, com a constante de `.add(note())` pronta. |
| | `note("c2")` toca o arquivo cru. A oitava da raiz e palpite: se soar fora, +-12. |

## Indice

- [atmosfera](#atmosfera--153) — 153
- [efeito](#efeito--114) — 114
- [percussao](#percussao--52) — 52
- [caixa](#caixa--33) — 33
- [baixo](#baixo--31) — 31
- [transicao](#transicao--21) — 21
- [chimbal](#chimbal--19) — 19
- [rufo](#rufo--16) — 16
- [drone](#drone--15) — 15
- [melodico](#melodico--15) — 15
- [loop](#loop--14) — 14
- [bumbo](#bumbo--9) — 9
- [textura](#textura--9) — 9
- [prato](#prato--8) — 8

## atmosfera — 153

*Onde usar:* Cama, e fonte de "fita": corte com `begin/end` e mude a `speed`.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `local` | 0 | 07_02_05.WAV | 10.57 | 0.1659 | 302 |  |  |
| `zero_g_ce07_dream_zone` | 0 | 07_02_01.WAV | 8.52 | 0.168 | 607 |  |  |
| `zero_g_ce07_dream_zone` | 1 | 07_02_02.WAV | 11.77 | 0.1154 | 578 |  |  |
| `zero_g_ce07_dream_zone` | 2 | 07_02_03.WAV | 8.75 | 0.1785 | 325 |  |  |
| `zero_g_ce07_dream_zone` | 3 | 07_02_04.WAV | 10.01 | 0.2238 | 373 |  |  |
| `zero_g_ce07_dream_zone` | 4 | 07_02_05.WAV | 10.57 | 0.1659 | 302 |  |  |
| `zero_g_ce07_dream_zone` | 5 | 07_03_01.WAV | 10.15 | 0.1632 | 478 |  |  |
| `zero_g_ce07_dream_zone` | 6 | 07_03_02.WAV | 7.51 | 0.1864 | 636 |  |  |
| `zero_g_ce07_dream_zone` | 7 | 07_03_03.WAV | 9.33 | 0.1112 | 576 |  |  |
| `zero_g_ce07_dream_zone` | 8 | 07_03_04.WAV | 10.63 | 0.1087 | 1020 |  |  |
| `zero_g_ce07_dream_zone` | 9 | 07_03_05.WAV | 28.08 | 0.1983 | 269 |  |  |
| `zero_g_ce07_dream_zone` | 10 | 07_04_01.WAV | 4.65 | 0.2561 | 89 |  |  |
| `zero_g_ce07_dream_zone` | 11 | 07_04_02.WAV | 10.27 | 0.1142 | 832 |  |  |
| `zero_g_ce07_dream_zone` | 12 | 07_04_03.WAV | 6.28 | 0.0568 | 342 |  |  |
| `zero_g_ce07_dream_zone` | 13 | 07_05_01.WAV | 21.63 | 0.1075 | 1122 |  |  |
| `zero_g_ce07_dream_zone` | 14 | 07_05_02.WAV | 5.7 | 0.1782 | 894 |  |  |
| `zero_g_ce07_dream_zone` | 15 | 07_05_03.WAV | 6.87 | 0.1884 | 1175 |  |  |
| `zero_g_ce07_dream_zone` | 16 | 07_05_04.WAV | 13.36 | 0.1306 | 1157 |  |  |
| `zero_g_ce07_dream_zone` | 17 | 07_06_01.WAV | 4.55 | 0.1793 | 479 |  |  |
| `zero_g_ce07_dream_zone` | 19 | 07_06_03.WAV | 19.5 | 0.0991 | 554 |  |  |
| `zero_g_ce07_dream_zone` | 20 | 07_07_01.WAV | 5.6 | 0.1649 | 2162 |  |  |
| `zero_g_ce07_dream_zone` | 21 | 07_07_02.WAV | 14.98 | 0.0827 | 2051 |  |  |
| `zero_g_ce07_dream_zone` | 22 | 07_07_03.WAV | 6.02 | 0.3019 | 696 |  |  |
| `zero_g_ce07_dream_zone` | 23 | 07_07_04.WAV | 5.84 | 0.1657 | 229 |  |  |
| `zero_g_ce07_dream_zone` | 24 | 07_07_05.WAV | 10.11 | 0.1585 | 742 |  |  |
| `zero_g_ce07_dream_zone` | 25 | 07_08_01.WAV | 17.97 | 0.1685 | 379 |  |  |
| `zero_g_ce07_dream_zone` | 26 | 07_08_02.WAV | 8.43 | 0.1107 | 1298 |  |  |
| `zero_g_ce07_dream_zone` | 27 | 07_08_03.WAV | 8.82 | 0.2177 | 179 |  |  |
| `zero_g_ce07_dream_zone` | 28 | 07_08_04.WAV | 5.96 | 0.2076 | 271 |  |  |
| `zero_g_ce07_dream_zone` | 29 | 07_08_05.WAV | 12.77 | 0.1259 | 416 |  |  |
| `zero_g_ce07_dream_zone` | 30 | 07_09_01.WAV | 9.94 | 0.1708 | 461 |  |  |
| `zero_g_ce07_dream_zone` | 31 | 07_09_02.WAV | 9.51 | 0.1211 | 774 |  |  |
| `zero_g_ce07_dream_zone` | 32 | 07_09_03.WAV | 5.3 | 0.1728 | 312 |  |  |
| `zero_g_ce07_dream_zone` | 33 | 07_09_04.WAV | 7.65 | 0.1796 | 332 |  |  |
| `zero_g_ce07_dream_zone` | 34 | 07_09_05.WAV | 6.57 | 0.1343 | 356 |  |  |
| `zero_g_ce07_dream_zone` | 35 | 07_09_06.WAV | 7.97 | 0.1624 | 384 |  |  |
| `zero_g_ce07_dream_zone` | 36 | 07_09_07.WAV | 5.89 | 0.1537 | 780 |  |  |
| `zero_g_ce07_dream_zone` | 37 | 07_10_01.WAV | 5.26 | 0.1253 | 479 |  |  |
| `zero_g_ce07_dream_zone` | 38 | 07_10_02.WAV | 16.67 | 0.1692 | 256 |  |  |
| `zero_g_ce07_dream_zone` | 39 | 07_11_01.WAV | 7.51 | 0.0721 | 3189 |  |  |
| `zero_g_ce07_dream_zone` | 41 | 07_11_03.WAV | 10.26 | 0.1503 | 657 |  |  |
| `zero_g_ce07_dream_zone` | 42 | 07_11_04.WAV | 6.63 | 0.1522 | 2355 |  |  |
| `zero_g_ce07_dream_zone` | 43 | 07_11_05.WAV | 4.9 | 0.2298 | 698 |  |  |
| `zero_g_ce07_dream_zone` | 44 | 07_12_01.WAV | 4.59 | 0.1182 | 1302 |  |  |
| `zero_g_ce07_dream_zone` | 45 | 07_12_02.WAV | 9.0 | 0.0823 | 1133 |  |  |
| `zero_g_ce07_dream_zone` | 46 | 07_12_03.WAV | 23.61 | 0.2566 | 5146 |  |  |
| `zero_g_ce07_dream_zone` | 47 | 07_13_01.WAV | 13.52 | 0.1585 | 452 |  |  |
| `zero_g_ce07_dream_zone` | 48 | 07_13_02.WAV | 10.71 | 0.1218 | 1675 |  |  |
| `zero_g_ce07_dream_zone` | 49 | 07_13_03.WAV | 6.05 | 0.0831 | 2829 |  |  |
| `zero_g_ce07_dream_zone` | 50 | 07_14_01.WAV | 5.44 | 0.1217 | 129 |  |  |
| `zero_g_ce07_dream_zone` | 51 | 07_14_02.WAV | 7.88 | 0.2684 | 59 |  |  |
| `zero_g_ce07_dream_zone` | 52 | 07_14_03.WAV | 7.14 | 0.1235 | 435 |  |  |
| `zero_g_ce07_dream_zone` | 53 | 07_14_04.WAV | 5.94 | 0.1077 | 1416 |  |  |
| `zero_g_ce07_dream_zone` | 54 | 07_15_01.WAV | 16.85 | 0.2092 | 576 |  |  |
| `zero_g_ce07_dream_zone` | 55 | 07_15_02.WAV | 4.89 | 0.15 | 8754 |  |  |
| `zero_g_ce07_dream_zone` | 72 | 07_17_05.WAV | 5.07 | 0.1377 | 425 |  |  |
| `zero_g_ce07_dream_zone` | 73 | 07_17_06.WAV | 4.94 | 0.0989 | 1079 |  |  |
| `zero_g_ce07_dream_zone` | 74 | 07_17_07.WAV | 5.34 | 0.1029 | 1808 |  |  |
| `zero_g_ce07_dream_zone` | 75 | 07_17_08.WAV | 5.18 | 0.1089 | 3735 |  |  |
| `zero_g_ce07_dream_zone` | 77 | 07_18_02.WAV | 6.21 | 0.1015 | 323 |  |  |
| `zero_g_ce07_dream_zone` | 78 | 07_18_03.WAV | 5.47 | 0.0384 | 1994 |  |  |
| `zero_g_ce07_dream_zone` | 90 | 07_20_01.WAV | 5.94 | 0.0974 | 431 |  |  |
| `zero_g_ce07_dream_zone` | 95 | 07_20_06.WAV | 5.62 | 0.1008 | 550 |  |  |
| `zero_g_ce07_dream_zone` | 116 | 07_24_01.WAV | 7.03 | 0.136 | 3125 |  |  |
| `zero_g_ce07_dream_zone` | 117 | 07_24_02.WAV | 11.29 | 0.1157 | 1122 |  |  |
| `zero_g_ce07_dream_zone` | 120 | 07_24_05.WAV | 8.75 | 0.1816 | 963 |  |  |
| `zero_g_ce07_dream_zone` | 121 | 07_24_06.WAV | 9.1 | 0.1683 | 9698 |  |  |
| `zero_g_ce07_dream_zone` | 122 | 07_24_07.WAV | 7.84 | 0.1451 | 1945 |  |  |
| `zero_g_ce07_dream_zone` | 123 | 07_24_08.WAV | 11.33 | 0.3667 | 903 |  |  |
| `zero_g_ce07_dream_zone` | 124 | 07_24_09.WAV | 8.81 | 0.2017 | 1280 |  |  |
| `zero_g_ce07_dream_zone` | 125 | 07_24_10.WAV | 5.48 | 0.218 | 4902 |  |  |
| `zero_g_ce07_dream_zone` | 126 | 07_25_01.WAV | 35.66 | 0.3399 | 4929 |  |  |
| `zero_g_ce07_dream_zone` | 127 | 07_25_02.WAV | 15.71 | 0.4301 | 1138 |  |  |
| `zero_g_ce07_dream_zone` | 134 | 07_28_01.WAV | 7.84 | 0.2737 | 1122 |  |  |
| `zero_g_ce07_dream_zone` | 135 | 07_28_02.WAV | 6.42 | 0.1264 | 966 |  |  |
| `zero_g_ce07_dream_zone` | 136 | 07_28_03.WAV | 4.24 | 0.1966 | 729 |  |  |
| `zero_g_ce07_dream_zone` | 137 | 07_28_04.WAV | 10.25 | 0.1416 | 2387 |  |  |
| `zero_g_ce07_dream_zone` | 138 | 07_28_05.WAV | 16.94 | 0.4671 | 690 |  |  |
| `zero_g_ce07_dream_zone` | 139 | 07_29_01.WAV | 7.03 | 0.104 | 4900 |  |  |
| `zero_g_ce07_dream_zone` | 140 | 07_29_02.WAV | 11.73 | 0.1035 | 1066 |  |  |
| `zero_g_ce07_dream_zone` | 141 | 07_29_03.WAV | 15.33 | 0.1141 | 2335 |  |  |
| `zero_g_ce07_dream_zone` | 142 | 07_30_01.WAV | 4.75 | 0.0827 | 1539 |  |  |
| `zero_g_ce07_dream_zone` | 143 | 07_30_02.WAV | 11.9 | 0.1392 | 374 |  |  |
| `zero_g_ce07_dream_zone` | 144 | 07_30_03.WAV | 13.99 | 0.1535 | 302 |  |  |
| `zero_g_ce07_dream_zone` | 145 | 07_30_04.WAV | 5.94 | 0.0708 | 475 |  |  |
| `zero_g_ce07_dream_zone` | 146 | 07_30_05.WAV | 6.67 | 0.144 | 336 |  |  |
| `zero_g_ce07_dream_zone` | 148 | 07_30_07.WAV | 4.79 | 0.5216 | 211 |  |  |
| `zero_g_ce07_dream_zone` | 149 | 07_31_01.WAV | 6.15 | 0.075 | 449 |  |  |
| `zero_g_ce07_dream_zone` | 150 | 07_31_02.WAV | 13.27 | 0.125 | 1089 |  |  |
| `zero_g_ce07_dream_zone` | 151 | 07_31_03.WAV | 7.08 | 0.2115 | 185 |  |  |
| `zero_g_ce07_dream_zone` | 152 | 07_32_01.WAV | 10.2 | 0.0937 | 2843 |  |  |
| `zero_g_ce07_dream_zone` | 153 | 07_32_02.WAV | 4.63 | 0.1642 | 1980 |  |  |
| `zero_g_ce07_dream_zone` | 155 | 07_32_04.WAV | 8.37 | 0.1139 | 1763 |  |  |
| `zero_g_ce07_dream_zone` | 156 | 07_33_01.WAV | 4.55 | 0.1467 | 187 |  |  |
| `zero_g_ce07_dream_zone` | 158 | 07_33_03.WAV | 4.34 | 0.1282 | 6500 |  |  |
| `zero_g_ce07_dream_zone` | 159 | 07_34_01.WAV | 9.96 | 0.1428 | 528 |  |  |
| `zero_g_ce07_dream_zone` | 160 | 07_34_02.WAV | 8.61 | 0.1331 | 463 |  |  |
| `zero_g_ce07_dream_zone` | 161 | 07_34_03.WAV | 5.25 | 0.1805 | 239 |  |  |
| `zero_g_ce07_dream_zone` | 162 | 07_35_01.WAV | 6.89 | 0.1872 | 392 |  |  |
| `zero_g_ce07_dream_zone` | 163 | 07_35_02.WAV | 12.84 | 0.0853 | 437 |  |  |
| `zero_g_ce07_dream_zone` | 164 | 07_35_03.WAV | 8.57 | 0.1651 | 797 |  |  |
| `zero_g_ce07_dream_zone` | 165 | 07_36_01.WAV | 10.04 | 0.2142 | 381 |  |  |
| `zero_g_ce07_dream_zone` | 166 | 07_36_02.WAV | 6.94 | 0.2771 | 143 |  |  |
| `zero_g_ce07_dream_zone` | 167 | 07_36_03.WAV | 9.42 | 0.1305 | 355 |  |  |
| `zero_g_ce07_dream_zone` | 168 | 07_36_04.WAV | 7.39 | 0.1411 | 936 |  |  |
| `zero_g_ce07_dream_zone` | 169 | 07_37_01.WAV | 7.59 | 0.1612 | 1343 |  |  |
| `zero_g_ce07_dream_zone` | 170 | 07_37_02.WAV | 9.8 | 0.1266 | 300 |  |  |
| `zero_g_ce07_dream_zone` | 171 | 07_38_01.WAV | 18.4 | 0.1388 | 45 |  |  |
| `zero_g_ce07_dream_zone` | 172 | 07_38_02.WAV | 14.51 | 0.0995 | 151 |  |  |
| `zero_g_ce07_dream_zone` | 173 | 07_38_03.WAV | 13.7 | 0.0987 | 172 |  |  |
| `zero_g_ce07_dream_zone` | 174 | 07_38_04.WAV | 13.07 | 0.1466 | 104 |  |  |
| `zero_g_ce07_dream_zone` | 175 | 07_38_05.WAV | 16.25 | 0.0971 | 171 |  |  |
| `zero_g_ce07_dream_zone` | 176 | 07_39_01.WAV | 7.94 | 0.2239 | 471 |  |  |
| `zero_g_ce07_dream_zone` | 177 | 07_39_02.WAV | 9.8 | 0.1503 | 409 |  |  |
| `zero_g_ce07_dream_zone` | 178 | 07_39_03.WAV | 18.25 | 0.3986 | 1241 |  |  |
| `zero_g_ce07_dream_zone` | 179 | 07_39_04.WAV | 11.38 | 0.3219 | 506 |  |  |
| `zero_g_ce07_dream_zone` | 180 | 07_39_05.WAV | 7.6 | 0.4324 | 728 |  |  |
| `zero_g_ce07_dream_zone` | 181 | 07_40_01.WAV | 9.38 | 0.2674 | 218 |  |  |
| `zero_g_ce07_dream_zone` | 182 | 07_40_02.WAV | 6.28 | 0.281 | 811 |  |  |
| `zero_g_ce07_dream_zone` | 183 | 07_40_03.WAV | 6.21 | 0.3437 | 167 |  |  |
| `zero_g_ce07_dream_zone` | 184 | 07_40_04.WAV | 5.57 | 0.2997 | 102 |  |  |
| `zero_g_ce07_dream_zone` | 185 | 07_41_01.WAV | 7.41 | 0.4143 | 82 |  |  |
| `zero_g_ce07_dream_zone` | 186 | 07_41_02.WAV | 5.95 | 0.3874 | 154 |  |  |
| `zero_g_ce07_dream_zone` | 187 | 07_41_03.WAV | 4.55 | 0.3631 | 314 |  |  |
| `zero_g_ce07_dream_zone` | 188 | 07_41_04.WAV | 4.17 | 0.3482 | 617 |  |  |
| `zero_g_ce07_dream_zone` | 189 | 07_42_01.WAV | 10.02 | 0.202 | 180 |  |  |
| `zero_g_ce07_dream_zone` | 190 | 07_42_02.WAV | 10.03 | 0.2217 | 355 |  |  |
| `zero_g_ce07_dream_zone` | 191 | 07_42_03.WAV | 10.03 | 0.2188 | 708 |  |  |
| `zero_g_ce07_dream_zone` | 192 | 07_42_04.WAV | 9.7 | 0.2129 | 1322 |  |  |
| `zero_g_ce07_dream_zone` | 193 | 07_43_01.WAV | 8.66 | 0.2699 | 71 |  |  |
| `zero_g_ce07_dream_zone` | 194 | 07_43_02.WAV | 9.53 | 0.2644 | 140 |  |  |
| `zero_g_ce07_dream_zone` | 195 | 07_43_03.WAV | 10.06 | 0.2604 | 266 |  |  |
| `zero_g_ce07_dream_zone` | 196 | 07_43_04.WAV | 10.05 | 0.2771 | 540 |  |  |
| `zero_g_ce07_dream_zone` | 197 | 07_44_01.WAV | 9.85 | 0.2979 | 114 |  |  |
| `zero_g_ce07_dream_zone` | 198 | 07_44_02.WAV | 8.0 | 0.3363 | 209 |  |  |
| `zero_g_ce07_dream_zone` | 199 | 07_44_03.WAV | 7.7 | 0.3729 | 405 |  |  |
| `zero_g_ce07_dream_zone` | 200 | 07_44_04.WAV | 7.39 | 0.3749 | 748 |  |  |
| `zero_g_ce07_dream_zone` | 201 | 07_45_01.WAV | 20.39 | 0.2082 | 1155 |  |  |
| `zero_g_ce07_dream_zone` | 202 | 07_45_02.WAV | 14.65 | 0.1459 | 1549 |  |  |
| `zero_g_ce07_dream_zone` | 203 | 07_45_03.WAV | 10.58 | 0.1177 | 2592 |  |  |
| `zero_g_ce07_dream_zone` | 204 | 07_45_04.WAV | 12.08 | 0.1023 | 4732 |  |  |
| `zero_g_ce07_dream_zone` | 205 | 07_45_05.WAV | 10.81 | 0.1744 | 883 |  |  |
| `zero_g_ce07_dream_zone` | 206 | 07_45_06.WAV | 7.98 | 0.1448 | 4811 |  |  |
| `zero_g_ce07_dream_zone` | 207 | 07_45_07.WAV | 12.03 | 0.1357 | 6117 |  |  |
| `zero_g_ce07_dream_zone` | 208 | 07_46_01.WAV | 10.62 | 0.1596 | 5703 |  |  |
| `zero_g_ce07_dream_zone` | 209 | 07_46_02.WAV | 11.01 | 0.2353 | 1309 |  |  |
| `zero_g_ce07_dream_zone` | 210 | 07_46_03.WAV | 13.66 | 0.2247 | 2039 |  |  |
| `zero_g_ce07_dream_zone` | 211 | 07_47_01.WAV | 9.67 | 0.1213 | 4905 |  |  |
| `zero_g_ce07_dream_zone` | 212 | 07_47_02.WAV | 15.95 | 0.1083 | 6497 |  |  |
| `zero_g_ce07_dream_zone` | 213 | 07_47_03.WAV | 16.95 | 0.1588 | 599 |  |  |
| `zero_g_ce07_dream_zone` | 214 | 07_47_04.WAV | 21.68 | 0.1795 | 567 |  |  |
| `zero_g_ce07_dream_zone` | 215 | 07_47_05.WAV | 22.21 | 0.1665 | 451 |  |  |
| `zero_g_ce07_dream_zone` | 216 | 07_47_06.WAV | 17.55 | 0.1616 | 1722 |  |  |

## efeito — 114

*Onde usar:* Evento unico. Com `mask` ou `degradeBy` pesado, pra nao virar tique.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 0 | FX - APITO.wav | 0.68 | 0.369 | 2639 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 1 | FX - BELL CURSED.wav | 10.18 | 0.009 | 3539 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 2 | FX - BIRDS.wav | 9.1 | 0.1349 | 1367 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 3 | FX - BOLHA.wav | 0.35 | 0.1763 | 1379 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 4 | FX - BRASS1 .wav | 10.23 | 0.1084 | 301 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 5 | FX - BREATH SWEEP 130.wav | 14.3 | 0.0081 | 7014 | 130 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 6 | FX - BREATH VERB 170.wav | 7.41 | 0.009 | 2082 | 170 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 7 | FX - CASCAVEL 106.wav | 12.17 | 0.0352 | 4753 | 106 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 8 | FX - CHICOTE.wav | 3.34 | 0.0606 | 3790 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 9 | FX - CHIME SLEIGH.wav | 4.0 | 0.041 | 7216 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 10 | FX - CHIMES.wav | 6.51 | 0.0569 | 8315 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 11 | FX - DIGIBIRD.wav | 2.24 | 0.11 | 3846 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 12 | FX - DIGICROW 140.wav | 6.86 | 0.0431 | 2957 | 140 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 13 | FX - DIGIWIND.wav | 4.0 | 0.1212 | 866 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 14 | FX - DOG.wav | 0.42 | 0.1364 | 1246 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 15 | FX - F1.wav | 13.46 | 0.0192 | 9517 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 16 | FX - GEMIDINHO.wav | 10.77 | 0.0184 | 2379 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 17 | FX - GEMIDINHOINHO.wav | 1.1 | 0.0109 | 1293 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 18 | FX - GIGGLE 2.wav | 0.8 | 0.1651 | 1579 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 19 | FX - GIGGLE.wav | 0.82 | 0.1153 | 2009 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 20 | FX - GO! 160.wav | 0.38 | 0.2131 | 2048 | 160 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 21 | FX - GRITAO.wav | 1.69 | 0.3227 | 2279 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 22 | FX - HORSY.wav | 0.69 | 0.1138 | 2182 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 23 | FX - HOT STAB.wav | 2.87 | 0.1459 | 2996 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 24 | FX - I LOVE YOU.wav | 0.52 | 0.1301 | 2197 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 25 | FX - METAL SCRAPE.wav | 0.76 | 0.2344 | 3604 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 26 | FX - OH YEA.wav | 0.77 | 0.2174 | 2033 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 27 | FX - OWL.wav | 7.99 | 0.1862 | 540 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 28 | FX - PHONE..wav | 0.41 | 0.1059 | 2708 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 29 | FX - RADIO.wav | 1.14 | 0.1859 | 1734 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 30 | FX - RATTLE.wav | 1.97 | 0.0815 | 2339 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 31 | FX - RAVE SYNTH 2.wav | 0.45 | 0.0965 | 2288 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 32 | FX - RIDA.wav | 1.47 | 0.0919 | 1519 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 33 | FX - SCRATCH 1.wav | 0.27 | 0.2358 | 2016 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 34 | FX - SCRATCH 170.wav | 1.4 | 0.114 | 1429 | 170 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 35 | FX - SCRATCH 2.wav | 0.54 | 0.3527 | 1550 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 36 | FX - SCRATCH 3.wav | 0.68 | 0.1343 | 4330 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 37 | FX - SCRATCHED DELAY 170.wav | 6.0 | 0.0388 | 7776 | 170 |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 38 | FX - SHOUT.wav | 1.87 | 0.1284 | 1808 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 39 | FX - SIREN.wav | 1.97 | 0.264 | 1546 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 40 | FX - SONAR.wav | 0.97 | 0.303 | 1123 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 41 | FX - TIRO.wav | 1.3 | 0.3209 | 607 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 42 | FX - TORX.wav | 0.47 | 0.1947 | 908 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 43 | FX - WAVES CRASHING.mp3 | 23.32 | 0.0297 | 1973 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 44 | FX - WEEP.wav | 0.19 | 0.1681 | 2153 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 45 | FX - WHISTLE.wav | 13.38 | 0.0336 | 2858 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 46 | FX - WIND CHIME 2.wav | 7.1 | 0.0947 | 5656 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 47 | FX - WIND CHIME.wav | 7.46 | 0.0919 | 6131 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_misc` | 48 | FX - impact woody.wav | 7.44 | 0.0221 | 1535 |  |  |
| `zero_g_ce07_dream_zone` | 18 | 07_06_02.WAV | 3.66 | 0.1971 | 753 |  |  |
| `zero_g_ce07_dream_zone` | 40 | 07_11_02.WAV | 2.41 | 0.1284 | 5379 |  |  |
| `zero_g_ce07_dream_zone` | 56 | 07_16_01.WAV | 2.27 | 0.0902 | 146 |  |  |
| `zero_g_ce07_dream_zone` | 57 | 07_16_02.WAV | 2.55 | 0.0728 | 288 |  |  |
| `zero_g_ce07_dream_zone` | 58 | 07_16_03.WAV | 2.36 | 0.0857 | 533 |  |  |
| `zero_g_ce07_dream_zone` | 59 | 07_16_04.WAV | 2.2 | 0.0906 | 1052 |  |  |
| `zero_g_ce07_dream_zone` | 60 | 07_16_05.WAV | 2.21 | 0.0888 | 280 |  |  |
| `zero_g_ce07_dream_zone` | 61 | 07_16_06.WAV | 2.02 | 0.0688 | 537 |  |  |
| `zero_g_ce07_dream_zone` | 62 | 07_16_07.WAV | 2.06 | 0.0698 | 1066 |  |  |
| `zero_g_ce07_dream_zone` | 63 | 07_16_08.WAV | 1.76 | 0.0663 | 2096 |  |  |
| `zero_g_ce07_dream_zone` | 64 | 07_16_09.WAV | 1.93 | 0.071 | 1652 |  |  |
| `zero_g_ce07_dream_zone` | 65 | 07_16_10.WAV | 1.76 | 0.0745 | 1211 |  |  |
| `zero_g_ce07_dream_zone` | 66 | 07_16_11.WAV | 1.66 | 0.0651 | 2458 |  |  |
| `zero_g_ce07_dream_zone` | 67 | 07_16_12.WAV | 1.63 | 0.0689 | 3105 |  |  |
| `zero_g_ce07_dream_zone` | 68 | 07_17_01.WAV | 0.75 | 0.1013 | 241 |  |  |
| `zero_g_ce07_dream_zone` | 69 | 07_17_02.WAV | 0.84 | 0.1098 | 375 |  |  |
| `zero_g_ce07_dream_zone` | 70 | 07_17_03.WAV | 0.76 | 0.1151 | 573 |  |  |
| `zero_g_ce07_dream_zone` | 71 | 07_17_04.WAV | 0.84 | 0.0932 | 1437 |  |  |
| `zero_g_ce07_dream_zone` | 76 | 07_18_01.WAV | 2.01 | 0.1355 | 1348 |  |  |
| `zero_g_ce07_dream_zone` | 79 | 07_19_01.WAV | 1.54 | 0.1371 | 306 |  |  |
| `zero_g_ce07_dream_zone` | 80 | 07_19_02.WAV | 1.57 | 0.1216 | 921 |  |  |
| `zero_g_ce07_dream_zone` | 81 | 07_19_03.WAV | 0.42 | 0.1436 | 2970 |  |  |
| `zero_g_ce07_dream_zone` | 82 | 07_19_04.WAV | 0.93 | 0.1524 | 529 |  |  |
| `zero_g_ce07_dream_zone` | 83 | 07_19_05.WAV | 0.24 | 0.165 | 1871 |  |  |
| `zero_g_ce07_dream_zone` | 84 | 07_19_06.WAV | 0.79 | 0.1501 | 404 |  |  |
| `zero_g_ce07_dream_zone` | 85 | 07_19_07.WAV | 1.04 | 0.0764 | 3316 |  |  |
| `zero_g_ce07_dream_zone` | 86 | 07_19_08.WAV | 1.18 | 0.1098 | 1194 |  |  |
| `zero_g_ce07_dream_zone` | 87 | 07_19_09.WAV | 1.06 | 0.1219 | 423 |  |  |
| `zero_g_ce07_dream_zone` | 88 | 07_19_10.WAV | 2.22 | 0.1059 | 674 |  |  |
| `zero_g_ce07_dream_zone` | 89 | 07_19_11.WAV | 2.26 | 0.0709 | 459 |  |  |
| `zero_g_ce07_dream_zone` | 91 | 07_20_02.WAV | 3.84 | 0.0655 | 835 |  |  |
| `zero_g_ce07_dream_zone` | 92 | 07_20_03.WAV | 3.45 | 0.0425 | 4401 |  |  |
| `zero_g_ce07_dream_zone` | 93 | 07_20_04.WAV | 3.34 | 0.0953 | 605 |  |  |
| `zero_g_ce07_dream_zone` | 94 | 07_20_05.WAV | 2.73 | 0.1012 | 1083 |  |  |
| `zero_g_ce07_dream_zone` | 96 | 07_21_01.WAV | 1.71 | 0.0951 | 2734 |  |  |
| `zero_g_ce07_dream_zone` | 97 | 07_21_02.WAV | 1.6 | 0.0674 | 2188 |  |  |
| `zero_g_ce07_dream_zone` | 98 | 07_21_03.WAV | 2.07 | 0.0996 | 2766 |  |  |
| `zero_g_ce07_dream_zone` | 99 | 07_21_04.WAV | 1.66 | 0.1259 | 2769 |  |  |
| `zero_g_ce07_dream_zone` | 100 | 07_22_01.WAV | 0.69 | 0.1866 | 359 |  |  |
| `zero_g_ce07_dream_zone` | 101 | 07_22_02.WAV | 1.15 | 0.0992 | 1886 |  |  |
| `zero_g_ce07_dream_zone` | 102 | 07_22_03.WAV | 1.01 | 0.0988 | 3791 |  |  |
| `zero_g_ce07_dream_zone` | 103 | 07_22_04.WAV | 1.22 | 0.1213 | 586 |  |  |
| `zero_g_ce07_dream_zone` | 104 | 07_22_05.WAV | 1.07 | 0.1266 | 489 |  |  |
| `zero_g_ce07_dream_zone` | 105 | 07_23_01.WAV | 1.41 | 0.1711 | 4638 |  |  |
| `zero_g_ce07_dream_zone` | 106 | 07_23_02.WAV | 1.49 | 0.1806 | 173 |  |  |
| `zero_g_ce07_dream_zone` | 107 | 07_23_03.WAV | 1.07 | 0.2717 | 703 |  |  |
| `zero_g_ce07_dream_zone` | 108 | 07_23_04.WAV | 2.45 | 0.118 | 1447 |  |  |
| `zero_g_ce07_dream_zone` | 109 | 07_23_05.WAV | 1.72 | 0.5447 | 834 |  |  |
| `zero_g_ce07_dream_zone` | 110 | 07_23_06.WAV | 1.91 | 0.5068 | 888 |  |  |
| `zero_g_ce07_dream_zone` | 111 | 07_23_07.WAV | 1.81 | 0.4128 | 713 |  |  |
| `zero_g_ce07_dream_zone` | 112 | 07_23_08.WAV | 1.7 | 0.3973 | 457 |  |  |
| `zero_g_ce07_dream_zone` | 113 | 07_23_09.WAV | 0.82 | 0.3595 | 3650 |  |  |
| `zero_g_ce07_dream_zone` | 114 | 07_23_10.WAV | 1.6 | 0.3164 | 3079 |  |  |
| `zero_g_ce07_dream_zone` | 115 | 07_23_11.WAV | 1.47 | 0.267 | 3102 |  |  |
| `zero_g_ce07_dream_zone` | 118 | 07_24_03.WAV | 2.89 | 0.2555 | 377 |  |  |
| `zero_g_ce07_dream_zone` | 119 | 07_24_04.WAV | 2.4 | 0.2864 | 2817 |  |  |
| `zero_g_ce07_dream_zone` | 128 | 07_26_01.WAV | 2.15 | 0.3454 | 897 |  |  |
| `zero_g_ce07_dream_zone` | 129 | 07_26_02.WAV | 3.39 | 0.4561 | 580 |  |  |
| `zero_g_ce07_dream_zone` | 130 | 07_26_03.WAV | 2.06 | 0.3045 | 2674 |  |  |
| `zero_g_ce07_dream_zone` | 131 | 07_26_04.WAV | 2.9 | 0.1213 | 2656 |  |  |
| `zero_g_ce07_dream_zone` | 132 | 07_27_01.WAV | 2.24 | 0.0496 | 1855 |  |  |
| `zero_g_ce07_dream_zone` | 133 | 07_27_02.WAV | 3.47 | 0.0734 | 8224 |  |  |
| `zero_g_ce07_dream_zone` | 147 | 07_30_06.WAV | 3.45 | 0.209 | 53 |  |  |
| `zero_g_ce07_dream_zone` | 154 | 07_32_03.WAV | 3.94 | 0.2131 | 450 |  |  |
| `zero_g_ce07_dream_zone` | 157 | 07_33_02.WAV | 3.66 | 0.077 | 7544 |  |  |

## percussao — 52

*Onde usar:* O detalhe que tira cara de maquina. Use com `degradeBy`.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_percs` | 0 | PERC - ANKLE.wav | 1.03 | 0.037 | 10113 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 1 | PERC - ANKLES.wav | 1.0 | 0.06 | 8093 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 2 | PERC - ANKLY.wav | 1.62 | 0.0727 | 11744 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 3 | PERC - BELL TUBULAR.wav | 5.4 | 0.0452 | 2558 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 4 | PERC - BOLHA.wav | 0.18 | 0.191 | 650 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 5 | PERC - BONK.wav | 0.47 | 0.0926 | 3071 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 6 | PERC - BREATH 2.wav | 0.41 | 0.1272 | 4048 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 7 | PERC - BREATH 3.wav | 0.43 | 0.0733 | 2211 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 8 | PERC - BREATH.wav | 0.21 | 0.2112 | 2580 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 9 | PERC - BRESTOP.wav | 0.13 | 0.0361 | 5787 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 10 | PERC - CAMEL.wav | 0.24 | 0.0409 | 1143 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 11 | PERC - CLAVE 808.wav | 0.03 | 0.3542 | 2500 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 12 | PERC - CLAVE.wav | 0.49 | 0.0754 | 2367 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 13 | PERC - CONGA.wav | 0.61 | 0.1278 | 998 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 14 | PERC - CONGO.wav | 0.1 | 0.1412 | 3198 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 15 | PERC - CONGY.wav | 0.12 | 0.1159 | 1715 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 16 | PERC - CORRUPTED.wav | 0.86 | 0.1085 | 6659 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 17 | PERC - DEFTONES SNR 142.wav | 0.63 | 0.1029 | 844 | 142 |  |
| `vhulto_sampling_the_world_drumkit_percs` | 18 | PERC - DJEMBE DRY.wav | 0.65 | 0.0522 | 3656 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 19 | PERC - DJEMBE.wav | 0.98 | 0.0572 | 1098 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 20 | PERC - DUMBAK.wav | 1.76 | 0.0942 | 90 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 21 | PERC - FLEXA 89.wav | 0.68 | 0.019 | 2394 | 89 |  |
| `vhulto_sampling_the_world_drumkit_percs` | 22 | PERC - FMUR.wav | 1.29 | 0.094 | 3339 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 23 | PERC - IBEENwav.wav | 0.34 | 0.0445 | 1826 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 24 | PERC - LAZER 1.wav | 0.06 | 0.1687 | 901 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 25 | PERC - NEXTEL 2.wav | 0.13 | 0.56 | 2148 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 26 | PERC - NEXTOL.wav | 0.29 | 0.2358 | 528 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 27 | PERC - NOIZ 140.wav | 0.43 | 0.0406 | 3421 | 140 |  |
| `vhulto_sampling_the_world_drumkit_percs` | 28 | PERC - PAN.wav | 0.36 | 0.1188 | 1280 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 29 | PERC - SHOCK.wav | 0.19 | 0.107 | 2374 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 30 | PERC - SLIP.wav | 0.27 | 0.1752 | 1468 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 31 | PERC - SNARY.wav | 0.5 | 0.0548 | 1666 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 32 | PERC - SONAR 2.wav | 1.71 | 0.193 | 1999 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 33 | PERC - TELE.wav | 0.79 | 0.0953 | 7162 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 34 | PERC - TELERRUPTED.wav | 0.79 | 0.0917 | 3286 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 35 | PERC - TIM.wav | 0.64 | 0.0572 | 3224 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 36 | PERC - TING.wav | 0.24 | 0.028 | 4193 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 37 | PERC - TINGY.wav | 0.36 | 0.1187 | 3962 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 38 | PERC - TOIM.wav | 1.31 | 0.0389 | 6002 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 39 | PERC - TOM 2.wav | 0.22 | 0.2353 | 161 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 40 | PERC - TOM.wav | 0.6 | 0.0374 | 923 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 41 | PERC - TUMBA.wav | 0.13 | 0.2178 | 339 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 42 | PERC - V1.wav | 0.3 | 0.0486 | 870 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 43 | PERC - VOKAY.wav | 0.55 | 0.1895 | 2119 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 44 | PERC - WOODBLOCK.wav | 8.15 | 0.0083 | 1082 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 45 | PERC - WOODY.wav | 0.02 | 0.1984 | 3028 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 46 | PERC - YE.wav | 0.21 | 0.1073 | 2874 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 47 | PERC - YO PIERRE.wav | 0.45 | 0.2516 | 2062 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 48 | PERC - ZAP CS.wav | 0.21 | 0.2366 | 250 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 49 | PERC - ZAP SIMP.wav | 1.5 | 0.0216 | 991 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 50 | PERC - ZAP.wav | 0.16 | 0.2278 | 788 |  |  |
| `vhulto_sampling_the_world_drumkit_percs` | 51 | PERC - whoop.wav | 2.22 | 0.0371 | 676 |  |  |

## caixa — 33

*Onde usar:* Contratempo, e o estilhaco do drill-n-bass quando levado com `ply` + `speed`.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 0 | CLAP -DISTRESS.wav | 0.16 | 0.1376 | 1471 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 1 | RIM - BRO.wav | 0.08 | 0.3947 | 2440 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 2 | RIM - BURR.wav | 0.23 | 0.1946 | 2543 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 3 | RIM - G.wav | 0.19 | 0.1761 | 1651 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 4 | RIM - OAK.wav | 0.24 | 0.1987 | 904 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 5 | SNAP - CHAD.wav | 0.11 | 0.1453 | 2483 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 6 | SNAP - GOLDIE.wav | 0.56 | 0.0564 | 4593 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 7 | SNAP - MASS.wav | 0.08 | 0.1806 | 2462 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 8 | SNAP - OG.wav | 0.25 | 0.0596 | 3606 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 9 | SNARE - 808.wav | 0.16 | 0.1994 | 2825 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 10 | SNARE - BARÕES.wav | 0.21 | 0.2307 | 1249 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 11 | SNARE - CANCER.wav | 0.15 | 0.1677 | 5722 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 12 | SNARE - CHUBBY.wav | 0.73 | 0.1599 | 705 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 13 | SNARE - CLANKER.wav | 0.21 | 0.1628 | 2186 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 14 | SNARE - CRISALIA OPEN.wav | 1.47 | 0.0709 | 2358 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 15 | SNARE - CRISALIA.wav | 0.31 | 0.1165 | 6121 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 16 | SNARE - CRISANTEMO.wav | 0.26 | 0.2023 | 2462 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 17 | SNARE - DARK.wav | 0.38 | 0.144 | 386 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 18 | SNARE - DE FÉ.wav | 0.16 | 0.1254 | 2423 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 19 | SNARE - JERKY.wav | 0.16 | 0.2638 | 3957 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 20 | SNARE - MEMPHIS.wav | 0.11 | 0.3095 | 4073 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 21 | SNARE - ODD.wav | 0.55 | 0.1502 | 8045 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 22 | SNARE - OLDIE.wav | 0.09 | 0.3728 | 1781 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 23 | SNARE - RIMMADO.wav | 0.08 | 0.1638 | 4015 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 24 | SNARE - ROSALIA.wav | 0.34 | 0.1601 | 2149 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 25 | SNARE - RRIM.wav | 0.17 | 0.1389 | 3838 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 26 | SNARE - SHORTY.wav | 0.05 | 0.2547 | 3698 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 27 | SNARE - TAMBA.wav | 0.49 | 0.0956 | 3333 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 28 | SNARE - TEXAS.wav | 0.28 | 0.2202 | 2846 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 29 | SNARE - TX1.wav | 0.17 | 0.0471 | 4176 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 30 | SNARE - TX2.wav | 0.34 | 0.0681 | 5214 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 31 | SNARE - TX3.wav | 0.78 | 0.0598 | 2037 |  |  |
| `vhulto_sampling_the_world_drumkit_snares_claps_n_rims` | 32 | SNARE - WONK.wav | 0.17 | 0.1396 | 3823 |  |  |

## baixo — 31

*Onde usar:* Chao. Afinado por `note` relativo a C3.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_808` | 0 | 808 - BOING.wav | 1.29 | 0.5453 | 24 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 1 | 808 - BUNGA.wav | 2.93 | 0.4801 | 112 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 2 | 808 - DE FUNDIN.wav | 0.43 | 0.535 | 40 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 3 | 808 - EEW.wav | 1.07 | 0.4927 | 241 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 4 | 808 - EXPRESS DC.wav | 1.93 | 0.4041 | 102 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 5 | 808 - HACKER.wav | 1.8 | 0.4965 | 83 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 6 | 808 - HELGA.wav | 2.51 | 0.4586 | 299 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 7 | 808 - IMPORTANT.wav | 2.92 | 0.3969 | 35 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 8 | 808 - JADE.wav | 4.17 | 0.3402 | 58 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 9 | 808 - RIO.wav | 0.81 | 0.396 | 35 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 10 | 808 - SHRED.wav | 5.29 | 0.5161 | 189 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 11 | 808 - SUB.wav | 4.8 | 0.1998 | 39 |  |  |
| `vhulto_sampling_the_world_drumkit_808` | 12 | 808 - SUKA.wav | 1.36 | 0.416 | 90 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 0 | 808 - MOO.wav | 2.14 | 0.5211 | 33 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 1 | BASS - AGULHA.wav | 1.08 | 0.2717 | 63 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 2 | BASS - BOO A.wav | 6.04 | 0.2173 | 56 |  | A → `.add(note(-33))` |
| `vhulto_sampling_the_world_drumkit_bass` | 3 | BASS - DELA.wav | 1.0 | 0.3398 | 50 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 4 | BASS - EASY.wav | 3.81 | 0.4292 | 273 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 5 | BASS - LOG.wav | 18.48 | 0.201 | 87 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 6 | BASS - MOOG BASS LONG.wav | 0.74 | 0.4909 | 130 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 7 | BASS - MOOG BASS SHORRT.wav | 0.5 | 0.4942 | 64 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 8 | BASS - MOOG SHORT.wav | 0.59 | 0.2213 | 87 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 9 | BASS - NASTY.wav | 2.4 | 0.597 | 32 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 10 | BASS - PETRA.wav | 3.56 | 0.287 | 68 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 11 | BASS - REESE.wav | 5.21 | 0.1592 | 76 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 12 | BASS - RISPY.wav | 5.01 | 0.7422 | 40 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 13 | BASS - SICKO.wav | 1.07 | 0.3333 | 736 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 14 | BASS - SILO.wav | 2.57 | 0.6099 | 32 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 15 | BASS - TEXT E.wav | 10.03 | 0.1377 | 175 |  | E → `.add(note(-28))` |
| `vhulto_sampling_the_world_drumkit_bass` | 16 | BASS - UNPLUGGED.wav | 2.02 | 0.3408 | 63 |  |  |
| `vhulto_sampling_the_world_drumkit_bass` | 17 | BASS - WEST.wav | 1.09 | 0.2538 | 32 |  |  |

## transicao — 21

*Onde usar:* Virada entre partes. Sozinho no compasso.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 0 | FX - DOWNER 1.wav | 17.69 | 0.037 | 1994 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 1 | FX - DOWNER 2.wav | 12.73 | 0.0371 | 2463 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 2 | FX - REV CRASH.wav | 6.55 | 0.018 | 3533 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 3 | FX - REV CYMBAL.wav | 8.88 | 0.0193 | 2779 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 4 | FX - REV NOIZ .wav | 0.86 | 0.039 | 2581 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 5 | FX - REV WHISTLE.wav | 10.43 | 0.0692 | 2172 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 6 | FX - REVERSE BREATH.wav | 14.85 | 0.0443 | 6331 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 7 | FX - REVERSE SATANICO.wav | 1.68 | 0.0802 | 2693 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 8 | FX - REVERSE WARNING.wav | 1.45 | 0.1151 | 1370 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 9 | FX - REVESONANSE 1.wav | 6.92 | 0.0567 | 4589 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 10 | FX - REVESONANSE 2.wav | 11.68 | 0.0486 | 3247 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 11 | FX - REWIND.wav | 1.46 | 0.1406 | 1938 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 12 | FX - RISE SOULJA.wav | 1.78 | 0.1885 | 1390 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 13 | FX - SWISH 101.wav | 6.48 | 0.0155 | 1102 | 101 |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 14 | FX - SWISH 202.wav | 5.08 | 0.0513 | 1433 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 15 | FX - TINY REVERSE.wav | 0.74 | 0.1589 | 1499 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 16 | FX - TUIM SATÂNICO 132.wav | 14.55 | 0.0304 | 5624 | 132 |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 17 | FX - TUIM SERIAO.wav | 2.56 | 0.223 | 1634 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 18 | FX - WOOSH 1.wav | 9.56 | 0.0423 | 1707 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 19 | FX - WOOSH 2.wav | 5.48 | 0.0309 | 5467 |  |  |
| `vhulto_sampling_the_world_drumkit_fx_transitions` | 20 | FX - WOOSH 3.wav | 7.79 | 0.0286 | 2017 |  |  |

## chimbal — 19

*Onde usar:* A subdivisao. `gain` baixo e `pan` em sine, senao vira metronomo.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 0 | HAT - FIAMBRE.wav | 0.06 | 0.2442 | 5620 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 1 | HAT - HOAGIE.wav | 0.05 | 0.2058 | 6250 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 2 | HAT - OLDIE.wav | 0.32 | 0.0373 | 4162 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 3 | HAT - PIF.wav | 0.05 | 0.1431 | 7170 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 4 | HAT - RESO.wav | 0.54 | 0.0628 | 6901 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 5 | HAT - RISPY.wav | 0.25 | 0.0391 | 4772 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 6 | HAT - SHORTY.wav | 0.19 | 0.0647 | 1060 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 7 | HAT - STEPZ.wav | 0.04 | 0.1585 | 5769 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 8 | HAT - TINY.wav | 0.07 | 0.1408 | 4183 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 9 | OH - CS80.wav | 0.27 | 0.0733 | 5622 | 80 |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 10 | OH - JUICY.wav | 0.23 | 0.0408 | 6809 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 11 | OH - SPECOPS.wav | 0.39 | 0.0566 | 4154 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 12 | SHAKER - S1.wav | 0.18 | 0.0496 | 5309 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 13 | SHAKER - S2.wav | 0.15 | 0.0144 | 5199 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 14 | SHAKER - S3.wav | 0.2 | 0.0659 | 11335 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 15 | SHAKER - S4.wav | 0.1 | 0.1865 | 7820 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 16 | SHAKER - S5.wav | 0.19 | 0.0811 | 8168 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 17 | SHAKER - S6.wav | 0.6 | 0.1509 | 8642 |  |  |
| `vhulto_sampling_the_world_drumkit_hats_n_shakers` | 18 | SHAKER - S7.wav | 0.4 | 0.0418 | 7272 |  |  |

## rufo — 16

*Onde usar:* Fim de frase, a cada 4 ou 8 compassos. `<~ ~ ~ x>` resolve.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 0 | ROLL - CAMEL.wav | 0.78 | 0.0316 | 5017 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 1 | ROLL - CLUNKY.wav | 0.21 | 0.2475 | 1079 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 2 | ROLL - DUMBAT 88.wav | 0.68 | 0.029 | 2080 | 88 |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 3 | ROLL - F1 103.wav | 0.29 | 0.11 | 1251 | 103 |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 4 | ROLL - F2.wav | 0.19 | 0.0472 | 2392 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 5 | ROLL - FLAMIE.wav | 0.17 | 0.0892 | 2672 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 6 | ROLL - FLAMMY.wav | 0.38 | 0.2203 | 873 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 7 | ROLL - RAW.wav | 0.73 | 0.1816 | 826 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 8 | ROLL - REGGAE.wav | 0.78 | 0.1421 | 1548 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 9 | ROLL - ROLLY 80.wav | 0.94 | 0.2054 | 1884 | 80 |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 10 | ROLL - ROLLY 80_2.wav | 1.31 | 0.2368 | 512 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 11 | ROLL - SHORTIE.wav | 0.18 | 0.1044 | 483 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 12 | ROLL - SMOL.wav | 0.18 | 0.1718 | 1262 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 13 | ROLL - TOM TRANS.wav | 1.95 | 0.1002 | 353 |  |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 14 | ROLL - TOMMY 103.wav | 1.17 | 0.373 | 199 | 103 |  |
| `vhulto_sampling_the_world_drumkit_rolls_n_flams` | 15 | ROLL - TOMTOM.wav | 1.02 | 0.0774 | 163 |  |  |

## drone — 15

*Onde usar:* Fundo continuo. `slow(8)` ou mais, gain baixo.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `dark_drone_chutlu` | 0 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 01 The Master (7 Hz Theta).mp3 | 4071.13 | 0.0314 | 232 |  |  |
| `dark_drone_chutlu` | 1 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 02 Forbidden Mountain (6 Hz Theta).mp3 | 3601.98 | 0.0346 | 357 |  |  |
| `dark_drone_chutlu` | 2 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 03 Forbidden Mountain (2 Hz Delta).mp3 | 3600.0 | 0.0532 | 258 |  |  |
| `dark_drone_chutlu` | 3 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 04 Outer Wastes (4 Hz Theta).mp3 | 3667.35 | 0.0372 | 238 |  |  |
| `dark_drone_chutlu` | 4 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 05 Circumference (4 Hz Theta).mp3 | 3600.0 | 0.041 | 304 |  |  |
| `dark_drone_chutlu` | 5 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 06 Narcotic Incense (6 Hz Theta).mp3 | 3600.0 | 0.0356 | 424 |  |  |
| `dark_drone_chutlu` | 6 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 07 Dream and Flourish (4 Hz Theta).mp3 | 3604.35 | 0.0431 | 425 |  |  |
| `dark_drone_chutlu` | 7 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 08 Vortex of Perplexity (8 Hz Alpha).mp3 | 3757.11 | 0.0382 | 319 |  |  |
| `dark_drone_chutlu` | 8 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 09 Out of the Aeons (5 Hz Theta).mp3 | 3600.0 | 0.0449 | 151 |  |  |
| `dark_drone_chutlu` | 9 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 10 Unutterably Hideous (6 Hz Theta).mp3 | 3600.0 | 0.029 | 216 |  |  |
| `dark_drone_chutlu` | 10 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 11 Horn Marks (5 Hz Theta).mp3 | 3622.92 | 0.0763 | 146 |  |  |
| `dark_drone_chutlu` | 11 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 12 Half Forgotten (6 Hz Theta).mp3 | 3600.0 | 0.0363 | 265 |  |  |
| `dark_drone_chutlu` | 12 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 13 The Ring of Bodies and the Ring of Fire (4 Hz Theta).mp3 | 3600.0 | 0.0354 | 242 |  |  |
| `dark_drone_chutlu` | 13 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 14 Annihilation (6 Hz Theta).mp3 | 3602.12 | 0.0414 | 229 |  |  |
| `dark_drone_chutlu` | 14 | Iron Cthulhu Apocalypse - Dark Ambient Binaural Beat Hours 12-07-2020 - 15 Sleep (10 Hour Loop Version, No Hz).mp3 | 3643.33 | 0.0462 | 337 |  |  |

## melodico — 15

*Onde usar:* Melodia de verdade. A raiz esta no nome: escreva `.add(note(N))` da coluna raiz.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus` | 0 | CHEMICALS (prod @vhulto) 153 Am-Bm.mp3 | 12.59 | 0.0606 | 978 | 153 |  |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus` | 1 | CLUB DER BOHREN (prod @vhulto) 91.wav | 42.2 | 0.0465 | 290 | 91 |  |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus` | 2 | FUTHARK (prod @vhulto) 126.mp3 | 34.32 | 0.2707 | 372 | 126 |  |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus` | 3 | ONE SHOT - MELANKOLIK PAD.wav | 4.33 | 0.1748 | 1613 |  |  |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus` | 4 | SEVDA (prod @vhulto) 165 Bm.mp3 | 162.95 | 0.2886 | 257 | 165 |  |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_bouzouki_sakis` | 0 | BOUZ C#.wav | 5.95 | 0.048 | 579 |  | C# → `.add(note(-25))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_bouzouki_sakis` | 1 | BOUZ E.wav | 4.45 | 0.0981 | 845 |  | E → `.add(note(-28))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_erhu` | 0 | ERHU B.wav | 5.19 | 0.2968 | 684 |  | B → `.add(note(-35))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_erhu` | 1 | ERHU D#.wav | 4.32 | 0.3193 | 627 |  | D# → `.add(note(-27))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_erhu` | 2 | ERHU E.wav | 3.42 | 0.2227 | 673 |  | E → `.add(note(-28))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_moceno_flute` | 0 | MOC A#CC#.wav | 1.19 | 0.3745 | 257 |  |  |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_moceno_flute` | 1 | MOC D.wav | 2.88 | 0.4879 | 302 |  | D → `.add(note(-26))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_moceno_flute` | 2 | MOC F.wav | 6.3 | 0.4357 | 186 |  | F → `.add(note(-29))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_santoor_saberi` | 0 | SANT C#.wav | 9.12 | 0.0327 | 3320 |  | C# → `.add(note(-25))` |
| `vhulto_sampling_the_world_drumkit_zi_melodik_bonus_santoor_saberi` | 1 | SANT G#.wav | 8.35 | 0.0364 | 1161 |  | G# → `.add(note(-32))` |

## loop — 14

*Onde usar:* Ja vem com andamento proprio — veja a coluna bpm e case com o take (ou `.speed()`).

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `drum` | 0 | looperman-l-0186161-0067733-spivkurl-new-acid-emu-stereo-tom-rhythm-136.wav | 7.06 | 0.16 | 119 | 136 |  |
| `drum` | 1 | looperman-l-1726609-0373895-negatiumdumber-mtdrumkit.wav | 18.0 | 0.1156 | 1243 |  |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 0 | PERC - CLOCKY 88.wav | 1.36 | 0.0173 | 1595 | 88 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 1 | PERC LOOP - CHOKO 103.wav | 2.31 | 0.0883 | 6533 | 103 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 2 | PERC LOOP - CHUKI 105.wav | 4.57 | 0.0661 | 4693 | 105 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 3 | PERC LOOP - Exhale 140.wav | 6.86 | 0.024 | 3021 | 140 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 4 | PERC LOOP - FADE 165.wav | 2.91 | 0.0452 | 5102 | 165 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 5 | PERC LOOP - HOLEHEAD 115.wav | 8.35 | 0.0294 | 4584 | 115 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 6 | PERC LOOP - IDK 100.wav | 2.34 | 0.088 | 3161 | 100 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 7 | PERC LOOP - MENTOS 120.wav | 2.0 | 0.035 | 7454 | 120 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 8 | PERC LOOP - RIDIN 86.wav | 2.79 | 0.0176 | 6770 | 86 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 9 | PERC LOOP - SHAKE DAT 89.wav | 2.7 | 0.0284 | 3838 | 89 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 10 | PERC LOOP - STRAIT 165.wav | 2.91 | 0.1498 | 2269 | 165 |  |
| `vhulto_sampling_the_world_drumkit_perc_loops` | 11 | PERC LOOP - SWAGGY 89.wav | 2.7 | 0.076 | 1946 | 89 |  |

## bumbo — 9

*Onde usar:* O pulso. Entra por `.struct("x ~ ~ x")`. Curto (<0.3 s) aguenta `ply`; longo borra.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_kick` | 0 | KICK - ASS.wav | 0.19 | 0.6736 | 57 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 1 | KICK - ASTRA.wav | 0.14 | 0.4638 | 216 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 2 | KICK - CYBER.wav | 0.55 | 0.4446 | 1002 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 3 | KICK - KOF.wav | 0.19 | 0.7716 | 57 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 4 | KICK - MALADO.wav | 0.27 | 0.5683 | 74 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 5 | KICK - PLANT.wav | 0.41 | 0.3279 | 57 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 6 | KICK - PUTARIA.wav | 0.77 | 0.2833 | 78 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 7 | KICK - RAVE.wav | 0.28 | 0.4726 | 177 |  |  |
| `vhulto_sampling_the_world_drumkit_kick` | 8 | KICK - TEKNO.wav | 0.21 | 0.4848 | 77 |  |  |

## textura — 9

*Onde usar:* Chiado, chuva, sala. E o que faz o take ter ar em volta do som.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_texture` | 0 | AMBIENCE - RAIN, BASE.wav | 24.81 | 0.0103 | 481 |  |  |
| `vhulto_sampling_the_world_drumkit_texture` | 1 | AMBIENCE - ROLANJ DUPITER 163.wav | 70.6 | 0.0569 | 80 | 163 |  |
| `vhulto_sampling_the_world_drumkit_texture` | 2 | NOISE - AMAZON AMBIENCE.wav | 82.93 | 0.0091 | 7096 |  |  |
| `vhulto_sampling_the_world_drumkit_texture` | 3 | NOISE - CRISTALIA 153.wav | 3.14 | 0.004 | 5642 | 153 |  |
| `vhulto_sampling_the_world_drumkit_texture` | 4 | NOISE - HAWKS N CROWS 180.wav | 51.53 | 0.0133 | 3334 | 180 |  |
| `vhulto_sampling_the_world_drumkit_texture` | 5 | NOISE - MECHATRONIC RAIN.wav | 28.33 | 0.0051 | 4290 |  |  |
| `vhulto_sampling_the_world_drumkit_texture` | 6 | NOISE - NIGHT.wav | 4.72 | 0.0562 | 1240 |  |  |
| `vhulto_sampling_the_world_drumkit_texture` | 7 | NOISE - SYNTH SCREAM.wav | 44.26 | 0.031 | 741 |  |  |
| `vhulto_sampling_the_world_drumkit_texture` | 8 | NOISE - WTF 98.wav | 6.12 | 0.0135 | 3867 | 98 |  |

## prato — 8

*Onde usar:* Cauda longa: um por frase, nunca um por tempo.

| banco | n | arquivo | dur | rms | brilho | bpm | raiz |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| `vhulto_sampling_the_world_drumkit_rides` | 0 | RIDE - CUP.wav | 0.23 | 0.1344 | 4592 |  |  |
| `vhulto_sampling_the_world_drumkit_rides` | 1 | RIDE - CUPPY.wav | 0.39 | 0.0556 | 4878 |  |  |
| `vhulto_sampling_the_world_drumkit_rides` | 2 | RIDE - LONG.wav | 1.88 | 0.0575 | 4023 |  |  |
| `vhulto_sampling_the_world_drumkit_rides` | 3 | RIDE - ODD.wav | 0.39 | 0.0824 | 5586 |  |  |
| `vhulto_sampling_the_world_drumkit_rides` | 4 | RIDE - OLDRIDE 88.wav | 1.36 | 0.0285 | 3556 | 88 |  |
| `vhulto_sampling_the_world_drumkit_rides` | 5 | RIDE - RIDDYS.wav | 1.36 | 0.0313 | 4018 |  |  |
| `vhulto_sampling_the_world_drumkit_rides` | 6 | RIDE - SWAG 103.wav | 2.33 | 0.0518 | 8018 | 103 |  |
| `vhulto_sampling_the_world_drumkit_rides` | 7 | RIDE - W.wav | 0.34 | 0.0217 | 6140 |  |  |
