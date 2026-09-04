import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript tests through the @ alias', async () => {
    const mod = await import('@/config/brand')
    expect(mod.BRAND.name).toBeTruthy()
  })
})
