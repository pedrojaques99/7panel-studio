import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `@/` é o alias que todo componente do registry Visant importa (`@/lib/utils`,
  // `@/hooks/…`). Precisa existir aqui E no tsconfig.app.json: só aqui, o editor
  // acusa erro num build que passa; só lá, o build quebra num editor que não acusa.
  // `import.meta.url` porque o pacote é ESM e não tem `__dirname`.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5174 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // @strudel/core importa @kabelsalat/web, que só publica os named exports no
    // build ESM ("module") — externalizado, o Node pega o "main" e o import
    // estoura antes de qualquer teste rodar. Inline = o Vite resolve como no app.
    server: { deps: { inline: [/@strudel\//, '@kabelsalat/web'] } },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
      exclude: ['src/lib/visualizers/**', 'src/lib/synesthizer.ts'],
    },
  },
})
