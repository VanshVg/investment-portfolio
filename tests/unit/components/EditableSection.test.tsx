// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditableSection } from '@/components/ledger/EditableSection'

interface Row {
  id: string
  label: string
}
interface Draft {
  label: string
}

function setup(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn(async () => ({ ok: true as const, id: 'r1' }))
  const onDelete = vi.fn(async () => ({ ok: true as const, id: 'r1' }))

  render(
    <EditableSection<Row, Draft>
      title="Life insurance"
      columns={[{ key: 'label', label: 'Plan name' }]}
      rows={[{ id: 'r1', label: 'HDFC Click2Protect' }]}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.label}
      renderRead={(row) => <td>{row.label}</td>}
      renderEdit={(draft, set, errors) => (
        <td>
          <label htmlFor="label">Plan name</label>
          <input id="label" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          {errors.label && <span role="alert">{errors.label}</span>}
        </td>
      )}
      toDraft={(row) => ({ label: row.label })}
      emptyDraft={() => ({ label: '' })}
      onSave={onSave}
      onDelete={onDelete}
      addLabel="Add policy"
      emptyMessage="No policies yet."
      {...overrides}
    />,
  )
  return { onSave, onDelete }
}

describe('EditableSection', () => {
  it('shows rows in read mode until editing starts', () => {
    setup()
    expect(screen.getByText('HDFC Click2Protect')).toBeInTheDocument()
    expect(screen.queryByLabelText('Plan name')).not.toBeInTheDocument()
  })

  it('opens an editor seeded from the row', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    expect(screen.getByLabelText('Plan name')).toHaveValue('HDFC Click2Protect')
  })

  it('commits the whole row in one call', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Max Life Smart' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith({ label: 'Max Life Smart' }, 'r1')
  })

  it('opens a blank draft row from the add button', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    expect(screen.getByLabelText('Plan name')).toHaveValue('')
  })

  it('saves a new row with a null id', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'LIC Jeevan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ label: 'LIC Jeevan' }, null))
  })

  it('keeps the typed values and shows the error when a save fails', async () => {
    // Losing a half-entered policy in front of a client is the worst failure
    // this app can have, so a rejected save must never close the editor.
    const onSave = vi.fn(async () => ({
      ok: false as const,
      fieldErrors: { label: 'Name is required.' },
    }))
    setup({ onSave })

    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Half typed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Name is required.'))
    expect(screen.getByLabelText('Plan name')).toHaveValue('Half typed')
  })

  it('surfaces a form-level error', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, formError: 'Could not save.' }))
    setup({ onSave })
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Could not save.')).toBeInTheDocument())
  })

  it('commits on Enter', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Typed' } })
    fireEvent.keyDown(screen.getByLabelText('Plan name'), { key: 'Enter' })
    await waitFor(() => expect(onSave).toHaveBeenCalled())
  })

  it('cancels an untouched editor on Escape without confirming', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.keyDown(screen.getByLabelText('Plan name'), { key: 'Escape' })
    expect(screen.queryByLabelText('Plan name')).not.toBeInTheDocument()
  })

  it('confirms before discarding edited values', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'changed' } })
    fireEvent.keyDown(screen.getByLabelText('Plan name'), { key: 'Escape' })

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByLabelText('Plan name')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('reopens a blank draft after adding, so entry can continue', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'First' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Plan name')).toHaveValue(''))
  })

  it('shows the empty message when there is nothing to list', () => {
    setup({ rows: [] })
    expect(screen.getByText('No policies yet.')).toBeInTheDocument()
  })

  it('offers delete only when the consequences can be stated', () => {
    setup()
    // No deleteConfirm passed above, so no destructive action is offered.
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()

    setup({
      deleteConfirm: () => ({ title: 'Delete it?', body: 'This cannot be undone.' }),
    })
    expect(screen.getAllByRole('button', { name: 'Delete HDFC Click2Protect' }).length).toBeGreaterThan(0)
  })

  it('hides the edit affordance when the section is not editable', () => {
    setup({ editable: false })
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    // Adding is still available.
    expect(screen.getByRole('button', { name: '+ Add policy' })).toBeInTheDocument()
  })

  it('commits on Enter from a detail field, not just the main row', async () => {
    const { onSave } = setup({
      renderDetails: (draft: Draft, set: (patch: Partial<Draft>) => void) => (
        <div>
          <label htmlFor="note">Note</label>
          <input id="note" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
        </div>
      ),
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'From details' } })
    fireEvent.keyDown(screen.getByLabelText('Note'), { key: 'Enter' })
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ label: 'From details' }, null))
  })
})
