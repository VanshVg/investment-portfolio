import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript tests through the @ alias', async () => {
    const mod = await import('@/app/page')
    expect(typeof mod.default).toBe('function')
  })
})
