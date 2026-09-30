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
        <div>
          <label htmlFor="label">Plan name</label>
          <input id="label" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          {errors.label && <span role="alert">{errors.label}</span>}
        </div>
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

  it('closes the editor after adding, rather than opening another blank one', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'First' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByLabelText('Plan name')).not.toBeInTheDocument())
  })

  it('reports the id of an added row, so the page can go to it', async () => {
    const onCreated = vi.fn()
    setup({ onCreated })
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'First' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('r1'))
  })

  it('keeps the editor up while an added row is being opened elsewhere', async () => {
    // Closing first would flash the table, new row and all, before the page
    // navigates away. The next page replaces the editor instead.
    const onCreated = vi.fn()
    setup({ onCreated })
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'First' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('r1'))
    expect(screen.getByLabelText('Plan name')).toHaveValue('First')
  })

  it('does not report an edit as a new row', async () => {
    const onCreated = vi.fn()
    const { onSave } = setup({ onCreated })
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByLabelText('Plan name')).not.toBeInTheDocument())
    expect(onCreated).not.toHaveBeenCalled()
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

  const twoRows = [
    { id: 'r1', label: 'HDFC Click2Protect' },
    { id: 'r2', label: 'Max Life Smart' },
  ]

  it('confirms before switching to a different row while dirty, and declining keeps the draft', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup({ rows: twoRows })
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Max Life Smart' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByLabelText('Plan name')).toHaveValue('changed')
    confirmSpy.mockRestore()
  })

  it('switches to the other row once the discard is confirmed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    setup({ rows: twoRows })
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Max Life Smart' }))

    expect(screen.getByLabelText('Plan name')).toHaveValue('Max Life Smart')
    confirmSpy.mockRestore()
  })

  it('confirms before opening a blank draft from + Add while dirty', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add policy' }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByLabelText('Plan name')).toHaveValue('changed')
    confirmSpy.mockRestore()
  })

  it('does not commit on Enter from a select field inside the editor', () => {
    const { onSave } = setup({
      renderEdit: (draft: Draft, set: (patch: Partial<Draft>) => void) => (
        <div>
          <label htmlFor="label">Plan name</label>
          <input id="label" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          <label htmlFor="kind">Kind</label>
          <select id="kind" value="" onChange={() => {}}>
            <option value="">Choose</option>
            <option value="term">Term</option>
          </select>
        </div>
      ),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.keyDown(screen.getByLabelText('Kind'), { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not commit on Enter from a textarea inside the editor', () => {
    const { onSave } = setup({
      renderEdit: (draft: Draft, set: (patch: Partial<Draft>) => void) => (
        <div>
          <label htmlFor="label">Plan name</label>
          <input id="label" value={draft.label} onChange={(e) => set({ label: e.target.value })} />
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value="" onChange={() => {}} />
        </div>
      ),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter' })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('keeps the confirm dialog open, with what was typed, when a delete is rejected', async () => {
    const onDelete = vi.fn(async () => ({ ok: false as const, formError: 'Could not delete.' }))
    setup({
      deleteConfirm: () => ({
        title: 'Delete it?',
        body: 'This cannot be undone.',
        requireTyping: 'DELETE',
      }),
      onDelete,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete HDFC Click2Protect' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.getByText('Could not delete.')).toBeInTheDocument())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('DELETE')
  })
  // Document order stands in for on-screen order: the table has no layout in
  // jsdom, but a row rendered earlier in the tbody is drawn above a later one.
  function isBefore(a: Element, b: Element) {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  }

  it("opens the editor in the row's own place, not at the foot of the table", () => {
    setup({ rows: twoRows })
    fireEvent.click(screen.getByRole('button', { name: 'Edit HDFC Click2Protect' }))
    expect(isBefore(screen.getByLabelText('Plan name'), screen.getByText('Max Life Smart'))).toBe(true)
  })

  it('opens the delete confirmation directly under the row it would delete', () => {
    setup({
      rows: twoRows,
      deleteConfirm: () => ({ title: 'Delete it?', body: 'This cannot be undone.' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete HDFC Click2Protect' }))
    const dialog = screen.getByRole('dialog')
    expect(isBefore(screen.getByText('HDFC Click2Protect'), dialog)).toBe(true)
    expect(isBefore(dialog, screen.getByText('Max Life Smart'))).toBe(true)
  })
})
