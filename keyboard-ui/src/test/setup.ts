import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom não implementa ResizeObserver; Radix (Popover/Command, usados desde a /mix)
// mede o próprio conteúdo com ele, e sem isso o teste quebra antes de qualquer asserção.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// idem pra scrollIntoView: o cmdk (Command, usado desde a /mix) chama no item
// selecionado e o jsdom não implementa.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})
