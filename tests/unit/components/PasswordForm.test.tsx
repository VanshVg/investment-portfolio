// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PasswordForm } from '@/app/(app)/settings/reminders/_components/PasswordForm'
import type { ActionResult } from '@/lib/actions/result'

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
}

describe('PasswordForm', () => {
  it('sends all three fields to the action', async () => {
    const changePassword = vi.fn(async (): Promise<ActionResult> => ({ ok: true, id: 'u1' }))
    render(<PasswordForm changePassword={changePassword} />)
    fill('old-password-123', 'new-password-4567', 'new-password-4567')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password-123',
        newPassword: 'new-password-4567',
        confirmPassword: 'new-password-4567',
      }),
    )
  })

  it('clears every field and confirms once the password is changed', async () => {
    render(<PasswordForm changePassword={async () => ({ ok: true, id: 'u1' })} />)
    fill('old-password-123', 'new-password-4567', 'new-password-4567')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.')
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
  })

  it('keeps what was typed and shows the reason when the change is refused', async () => {
    const changePassword = async (): Promise<ActionResult> => ({
      ok: false,
      fieldErrors: { currentPassword: 'Current password is incorrect.' },
    })
    render(<PasswordForm changePassword={changePassword} />)
    fill('wrong-password-123', 'new-password-4567', 'new-password-4567')
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('New password')).toHaveValue('new-password-4567')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('never shows a password in plain text or offers it to autofill as a login', () => {
    render(<PasswordForm changePassword={async () => ({ ok: true, id: 'u1' })} />)
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password')
    for (const label of ['New password', 'Confirm new password']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'new-password')
    }
  })
})
