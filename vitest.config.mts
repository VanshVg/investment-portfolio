import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Split into projects so only the one file that needs serialization pays
    // for it. `tests/integration/cron-reminders.test.ts` exercises a route
    // that reconciles every holding in the database by design, which races
    // any other file's in-progress fixture on the same live Postgres
    // instance if it runs concurrently with one. Every other suite keeps
    // itself safe under file-level parallelism by scoping its reads/writes to
    // rows it creates itself, so there is no reason to slow all of them down
    // for the one exception. Vitest buckets specs by resolved `maxWorkers`
    // before running them (see `groupSpecs` in vitest's own dist bundle,
    // node_modules/vitest/dist/chunks/index.*.js), and a project resolving
    // to `maxWorkers: 1` (what `fileParallelism: false` does) is shunted into
    // a dedicated bucket that the runner awaits as its own group, strictly
    // after the default-parallelism bucket finishes rather than interleaved
    // with it — so this project's one file never overlaps the "unit"
    // project's files. Confirmed empirically, not just read off the source:
    // the full suite was run three times with this split in place and the
    // pass count held every time (see task-9 report).
    //
    // That ordering is an implementation detail of Vitest's own scheduler
    // (`groupSpecs`), not a documented, versioned API guarantee. A future
    // Vitest upgrade could change how specs get bucketed and reopen the
    // exact race this split exists to avoid — and the symptom would show up
    // as an intermittent failure in some *other* integration file (one that
    // happened to run concurrently with cron-reminders.test.ts again), not
    // as a failure in the cron test itself, which is what would make it hard
    // to trace back here. After bumping the vitest version, re-run the full
    // suite several times and confirm the pass count holds before trusting
    // this split still isolates the race.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/e2e/**', 'tests/integration/cron-reminders.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'cron-serial',
          include: ['tests/integration/cron-reminders.test.ts'],
          // This is the one file whose route-under-test touches every
          // holding in the database by design (see above) — serializing it
          // against itself does nothing (it's a single file); what matters
          // is that Vitest's own bucketing keeps this project's file from
          // overlapping the "unit" project's files. Do not widen this
          // project's `include` without re-confirming that guarantee still
          // holds for whatever else gets added to it.
          fileParallelism: false,
        },
      },
    ],
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
