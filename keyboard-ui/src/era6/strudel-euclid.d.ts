// o pacote não publica tipos; a era6 só usa o Bjorklund (modelo.ts)
declare module '@strudel/core/euclid.mjs' {
  export function bjorklund(ons: number, steps: number): number[]
}
