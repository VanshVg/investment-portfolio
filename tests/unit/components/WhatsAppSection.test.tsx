// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WhatsAppSection } from '@/app/(app)/settings/reminders/_components/WhatsAppSection'
import type { ActionResult } from '@/lib/actions/result'

const ok = async (): Promise<ActionResult> => ({ ok: true, id: 'x' })

function setup(props: Partial<Parameters<typeof WhatsAppSection>[0]> = {}) {
  const setWhatsAppMode = vi.fn(ok)
  const sendTestMessage = vi.fn(ok)
  render(
    <WhatsAppSection
      connected
      numberHint="7890"
      mode="off"
      advisorHasMobile
      setWhatsAppMode={setWhatsAppMode}
      sendTestMessage={sendTestMessage}
      {...props}
    />,
  )
  return { setWhatsAppMode, sendTestMessage }
}

afterEach(() => vi.restoreAllMocks())

describe('WhatsAppSection', () => {
  it('explains that it is not connected, and offers nothing to switch', () => {
    setup({ connected: false, numberHint: null })
    expect(screen.getByText(/Not connected/)).toHaveTextContent('Add the Meta keys in Vercel')
    for (const name of ['Off', 'Test', 'Live']) {
      expect(screen.getByRole('radio', { name: new RegExp(`^${name}`) })).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: 'Send me a test message' })).toBeDisabled()
  })

  it('shows the connection and the current mode', () => {
    setup({ mode: 'test' })
    expect(screen.getByText(/Connected/)).toHaveTextContent('…7890')
    expect(screen.getByRole('radio', { name: /^Test/ })).toBeChecked()
  })

  it('switches to Test mode and confirms it was saved', async () => {
    const { setWhatsAppMode } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /^Test/ }))
    await waitFor(() => expect(setWhatsAppMode).toHaveBeenCalledWith('test'))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(screen.getByRole('radio', { name: /^Test/ })).toBeChecked()
  })

  it('asks before going Live, and does nothing if the advisor declines', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { setWhatsAppMode } = setup()
    fireEvent.click(screen.getByRole('radio', { name: /^Live/ }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/clients will start receiving/i))
    expect(setWhatsAppMode).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /^Off/ })).toBeChecked()

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('radio', { name: /^Live/ }))
    await waitFor(() => expect(setWhatsAppMode).toHaveBeenCalledWith('live'))
  })

  it('shows why a switch was refused, and keeps the mode it had', async () => {
    const refusal = 'Add your mobile number above first.'
    setup({ setWhatsAppMode: async () => ({ ok: false, formError: refusal }) })
    fireEvent.click(screen.getByRole('radio', { name: /^Test/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal)
    expect(screen.getByRole('radio', { name: /^Off/ })).toBeChecked()
  })

  it('sends a test message and says where to look', async () => {
    const { sendTestMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Send me a test message' }))
    await waitFor(() => expect(sendTestMessage).toHaveBeenCalled())
    expect(await screen.findByRole('status')).toHaveTextContent('Test message sent')
  })

  it('shows why a test message failed', async () => {
    setup({ sendTestMessage: async () => ({ ok: false, formError: 'WhatsApp refused it' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a test message' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('WhatsApp refused it')
  })

  it('needs the advisor’s own number for Test mode and the test message', () => {
    setup({ advisorHasMobile: false })
    expect(screen.getByRole('radio', { name: /^Test/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send me a test message' })).toBeDisabled()
    expect(screen.getByText(/needs your mobile number/i)).toBeInTheDocument()
  })
})
