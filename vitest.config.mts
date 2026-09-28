import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next.js's webpack build resolves this to a no-op for server bundles
      // and to a throwing stub only for client bundles. Vitest has neither
      // half of that — Node's default export condition on the package always
      // resolves to the throwing stub — so importing a route handler (or
      // anything else marked server-only) fails outside of Next's own build.
      // Aliasing it to the package's own empty module reproduces the
      // server-bundle half here, which is what a test importing a route
      // handler needs. Must not be reached for a module that is genuinely
      // importable from a Client Component — this alias silences the exact
      // error `server-only` exists to raise, so it would hide that mistake
      // instead of catching it.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
})
