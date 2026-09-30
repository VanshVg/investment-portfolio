import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminClient, ensureUser, signedInClient } from '../helpers/db'
import { createFakeProvider } from '@/lib/whatsapp/fake'

const EMAIL = 'whatsapp-actions-admin@example.test'
const PASSWORD = 'test-password-123'
const MOBILE = '+919812366001'

// Connection and saving are stubbed: the shared app_settings row is written
// only by whatsapp-schema.test.ts, so parallel suites cannot race over it.
const { state, mockSave, revalidatePath, mockCreateServerSupabase } = vi.hoisted(() => ({
  state: { provider: null as unknown },
  mockSave: vi.fn(),
  revalidatePath: vi.fn(),
  mockCreateServerSupabase: vi.fn(),
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/supabase/server', () => ({ createServerSupabase: mockCreateServerSupabase }))
vi.mock('@/lib/whatsapp/connection', () => ({
  whatsappProvider: () => state.provider,
  appUrl: (path: string) => path,
}))
vi.mock('@/lib/whatsapp/settings', async (original) => ({
  ...(await original<typeof import('@/lib/whatsapp/settings')>()),
  saveWhatsAppMode: mockSave,
}))

const { setWhatsAppMode, sendTestMessage } = await import(
  '@/app/(app)/settings/reminders/whatsapp-actions'
)

const admin = adminClient()
let userId: string

async function setAdvisorMobile(mobile: string | null) {
  await admin.from('profiles').update({ mobile }).eq('id', userId)
}

beforeAll(async () => {
  const user = await ensureUser(EMAIL, PASSWORD, 'admin')
  userId = user!.id
  mockCreateServerSupabase.mockImplementation(() => signedInClient(EMAIL, PASSWORD))
})

beforeEach(async () => {
  state.provider = createFakeProvider()
  mockSave.mockReset().mockResolvedValue(true)
  await setAdvisorMobile(MOBILE)
})

afterAll(() => setAdvisorMobile(null))

describe('setWhatsAppMode', () => {
  it('saves a valid mode as the signed-in admin', async () => {
    expect(await setWhatsAppMode('live')).toEqual({ ok: true, id: 'live' })
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), 'live', userId)
    expect(revalidatePath).toHaveBeenCalledWith('/settings/reminders')
  })

  it('refuses anything that is not a mode', async () => {
    expect(await setWhatsAppMode('loud')).toMatchObject({ ok: false })
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('refuses Test and Live until the Meta keys are configured, but allows Off', async () => {
    state.provider = null
    for (const mode of ['test', 'live']) {
      expect(await setWhatsAppMode(mode)).toEqual({
        ok: false,
        formError: 'WhatsApp is not connected yet. Add the Meta keys in Vercel first.',
      })
    }
    expect(await setWhatsAppMode('off')).toMatchObject({ ok: true })
  })

  it('refuses Test mode when the advisor has no number to preview on', async () => {
    await setAdvisorMobile(null)
    expect(await setWhatsAppMode('test')).toEqual({
      ok: false,
      formError: 'Add your mobile number above first: Test mode sends every message to it.',
    })
  })

  it('reports a save the database refused', async () => {
    mockSave.mockResolvedValue(false)
    expect(await setWhatsAppMode('off')).toMatchObject({ ok: false, formError: expect.any(String) })
  })
})

describe('sendTestMessage', () => {
  it('sends Meta’s hello_world to the advisor’s own number', async () => {
    const result = await sendTestMessage()
    expect(result).toEqual({ ok: true, id: 'wamid.fake-1' })
    expect((state.provider as ReturnType<typeof createFakeProvider>).sent).toEqual([
      { to: MOBILE, template: 'hello_world', params: [] },
    ])
  })

  it('reports Meta’s reason when the message is refused', async () => {
    state.provider = createFakeProvider(() => ({
      ok: false,
      retryable: false,
      error: 'Template name does not exist',
    }))
    expect(await sendTestMessage()).toEqual({
      ok: false,
      formError: 'WhatsApp refused the test message: Template name does not exist',
    })
  })

  it('needs the connection and the advisor’s number', async () => {
    await setAdvisorMobile(null)
    expect(await sendTestMessage()).toMatchObject({ ok: false })
    await setAdvisorMobile(MOBILE)
    state.provider = null
    expect(await sendTestMessage()).toMatchObject({ ok: false })
  })
})
