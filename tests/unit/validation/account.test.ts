import { describe, expect, it } from 'vitest'
import { passwordChangeInput } from '@/lib/validation/account'

const valid = {
  currentPassword: 'old-password-123',
  newPassword: 'a-new-password-456',
  confirmPassword: 'a-new-password-456',
}

function errorsFor(input: Record<string, unknown>): Record<string, string> {
  const result = passwordChangeInput.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('passwordChangeInput', () => {
  it('accepts a matching new password of 12 or more characters', () => {
    expect(passwordChangeInput.parse(valid)).toEqual(valid)
  })

  it('requires the current password', () => {
    expect(errorsFor({ ...valid, currentPassword: '' })).toHaveProperty('currentPassword')
  })

  it('requires at least 12 characters, matching the sign-in settings', () => {
    const short = 'eleven-char'
    expect(errorsFor({ ...valid, newPassword: short, confirmPassword: short })).toEqual({
      newPassword: 'Use at least 12 characters.',
    })
  })

  it('refuses more than 72 characters, the most the password hash can use', () => {
    const long = 'x'.repeat(73)
    expect(errorsFor({ ...valid, newPassword: long, confirmPassword: long })).toHaveProperty(
      'newPassword',
    )
  })

  it('reports a mismatched confirmation against the confirmation field', () => {
    expect(errorsFor({ ...valid, confirmPassword: 'a-new-password-457' })).toEqual({
      confirmPassword: 'The two new passwords do not match.',
    })
  })

  it('refuses a new password identical to the current one', () => {
    expect(
      errorsFor({ ...valid, newPassword: valid.currentPassword, confirmPassword: valid.currentPassword }),
    ).toEqual({ newPassword: 'Choose a password different from your current one.' })
  })

  it('keeps spaces: a password is used exactly as typed', () => {
    const spaced = '  spaced password  '
    expect(
      passwordChangeInput.parse({ ...valid, newPassword: spaced, confirmPassword: spaced }).newPassword,
    ).toBe(spaced)
  })
})
