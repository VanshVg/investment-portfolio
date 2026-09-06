import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fromPostgrestError, fromZodError } from '@/lib/actions/result'

describe('fromZodError', () => {
  it('maps issues onto their fields', () => {
    const schema = z.object({ name: z.string().min(1, 'Name is required.') })
    const parsed = schema.safeParse({ name: '' })
    const result = fromZodError(parsed.error!)
    expect(result).toEqual({ ok: false, fieldErrors: { name: 'Name is required.' } })
  })

  it('surfaces a whole-object refinement as a form error when it has no path', () => {
    const schema = z.object({ a: z.number() }).refine(() => false, { message: 'Inconsistent.' })
    const parsed = schema.safeParse({ a: 1 })
    const result = fromZodError(parsed.error!)
    expect(result).toEqual({ ok: false, formError: 'Inconsistent.' })
  })

  it('keys a nested issue by its full dotted path instead of the top-level segment', () => {
    const schema = z.object({
      details: z.object({ term_years: z.number().int().positive() }).strict(),
    })
    const parsed = schema.safeParse({ details: { term_years: -5 } })
    const result = fromZodError(parsed.error!)
    expect(result.ok).toBe(false)
    expect((result as { fieldErrors?: Record<string, string> }).fieldErrors).toEqual({
      'details.term_years': 'Too small: expected number to be >0',
    })
  })

  it('keeps unrelated top-level fields distinct when a nested field also fails', () => {
    const schema = z.object({
      name: z.string().min(1, 'Name is required.'),
      details: z.object({ term_years: z.number().int().positive() }).strict(),
    })
    const parsed = schema.safeParse({ name: '', details: { term_years: -5 } })
    const result = fromZodError(parsed.error!)
    expect(result.ok).toBe(false)
    expect((result as { fieldErrors?: Record<string, string> }).fieldErrors).toEqual({
      name: 'Name is required.',
      'details.term_years': 'Too small: expected number to be >0',
    })
  })

  it('maps a whole-object failure on `details` itself to a form error, not an unrendered field key', () => {
    const schema = z.object({
      details: z.object({ policy_number: z.string() }).strict(),
    })
    const parsed = schema.safeParse({ details: { policy_number: 'P1', extra: true } })
    const result = fromZodError(parsed.error!)
    expect(result.ok).toBe(false)
    expect((result as { fieldErrors?: Record<string, string> }).fieldErrors).toBeUndefined()
    expect((result as { formError?: string }).formError).toBeTruthy()
  })
})

describe('fromPostgrestError', () => {
  it('translates the consent check into a field-level message', () => {
    const result = fromPostgrestError({
      code: '23514',
      message:
        'new row for relation "family_members" violates check constraint "family_members_consent_needs_mobile"',
    })
    expect(result).toEqual({
      ok: false,
      fieldErrors: { whatsappConsent: 'Add a mobile number before recording WhatsApp consent.' },
    })
  })

  it('translates the CAGR bound into a field-level message', () => {
    const result = fromPostgrestError({
      code: '23514',
      message: 'violates check constraint "families_cagr_sane"',
    })
    expect(result).toEqual({
      ok: false,
      fieldErrors: { assumedCagr: 'Assumed CAGR must be between 0 and 30%.' },
    })
  })

  it('gives a readable message for a foreign key violation', () => {
    const result = fromPostgrestError({ code: '23503', message: 'insert or update violates foreign key' })
    expect(result).toEqual({
      ok: false,
      formError: 'A linked record is missing or was already deleted. Refresh and try again.',
    })
  })

  it('never leaks raw driver text for an unrecognised error', () => {
    const result = fromPostgrestError({ code: 'XX000', message: 'internal error: pq: something' })
    expect(result).toEqual({ ok: false, formError: 'Could not save. Please try again.' })
  })
})
