export const WHITE_NOTES = ['C3','D3','E3','F3','G3','A3','B3','C4','D4','E4','F4','G4','A4','B4','C5'] as const
export type WhiteNote = typeof WHITE_NOTES[number]

export const NOTE_CENTS: Record<WhiteNote, number> = {
  'C3':-1200,'D3':-1000,'E3':-800,'F3':-700,'G3':-500,'A3':-300,'B3':-100,
  'C4':0,'D4':200,'E4':400,'F4':500,'G4':700,'A4':900,'B4':1100,'C5':1200,
}

export const KEY_NOTE: Record<string, WhiteNote> = {
  a:'C4',s:'D4',d:'E4',f:'F4',g:'G4',h:'A4',j:'B4',k:'C5',
  z:'C3',x:'D3',c:'E3',v:'F3',b:'G3',n:'A3',m:'B3',
}

/**
 * As pretas da oitava de cima, na fileira de cima — o mapa clássico de tracker:
 * `w e` ficam entre `a s d`, e `t y u` entre `f g h j`. Assim a mão lê a posição
 * física como leria um piano.
 *
 * Só a oitava de cima ganha pretas porque a fileira acima de `z x c v b n m` é
 * `a s d f g h j`, que já são as brancas de cima — não sobra fileira alinhada. Pra
 * tocar sustenido grave, use a transposição, que a tela já tem.
 *
 * Sem isto o teclado de PC não alcançava nenhum sustenido, e as faixas da era 5
 * estão em Fá# e Si: não dava pra tocar nem a tônica.
 */
export const KEY_BLACK: Record<string, string> = {
  w:'C#4', e:'D#4', t:'F#4', y:'G#4', u:'A#4',
}

export const BLACK_KEYS: { afterWhite: number; cents: number; label: string }[] = [
  { afterWhite: 0, cents: -1100, label: 'C#3' },
  { afterWhite: 1, cents: -900,  label: 'D#3' },
  { afterWhite: 3, cents: -600,  label: 'F#3' },
  { afterWhite: 4, cents: -400,  label: 'G#3' },
  { afterWhite: 5, cents: -200,  label: 'A#3' },
  { afterWhite: 7, cents: 100,   label: 'C#4' },
  { afterWhite: 8, cents: 300,   label: 'D#4' },
  { afterWhite: 10, cents: 600,  label: 'F#4' },
  { afterWhite: 11, cents: 800,  label: 'G#4' },
  { afterWhite: 12, cents: 1000, label: 'A#4' },
]
