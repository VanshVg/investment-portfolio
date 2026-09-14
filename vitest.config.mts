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
    exclude: ['tests/e2e/**'],
    // Integration tests share one live local Postgres instance, and every
    // suite up to this point kept itself safe under file-level parallelism
    // by scoping its reads and writes to rows it created itself. The cron
    // route test is the first exception: the route it exercises reconciles
    // every holding in the database by design, so running it in a worker
    // alongside another file's in-progress fixture races the two — one
    // file's holding gets reconciled by the other's call before its own
    // assertions run. Serializing files removes that race for good, at the
    // cost of running the suite in one worker instead of many.
    fileParallelism: false,
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
      // handler needs.
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
})
