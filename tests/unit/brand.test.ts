import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND } from '@/config/brand'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full)
  }
  return out
}

describe('brand configuration', () => {
  it('exposes a name, tagline, and mark', () => {
    expect(BRAND.name).toBe('Kunba')
    expect(BRAND.tagline).toBe('Family Financial Ledger')
    expect(BRAND.mark).toBe('क')
  })

  it('is the only place the product name is written', () => {
    const offenders = walk('src')
      .filter((f) => !f.endsWith(join('config', 'brand.ts')))
      .filter((f) => readFileSync(f, 'utf8').includes(BRAND.name))
    expect(offenders).toEqual([])
  })
})
