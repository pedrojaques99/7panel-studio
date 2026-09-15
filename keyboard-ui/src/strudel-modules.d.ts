// Os pacotes @strudel/* não publicam tipos. Declaração ambiente pra o tsc
// parar de reclamar de implicit any nos imports (comportamento em runtime é o mesmo).
declare module '@strudel/core'
declare module '@strudel/mini'
declare module '@strudel/webaudio'
declare module '@strudel/tonal'
declare module '@strudel/draw'
declare module '@strudel/codemirror'
declare module 'superdough'
