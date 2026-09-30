import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// The saved mode is stubbed rather than written: app_settings is one shared
// row, and whatsapp-schema.test.ts reads it in parallel.
const { mockRunSender, mockGetWhatsAppMode } = vi.hoisted(() => ({
  mockRunSender: vi.fn(),
  mockGetWhatsAppMode: vi.fn(),
}))
vi.mock('@/lib/whatsapp/send', () => ({ runSender: mockRunSender }))
vi.mock('@/lib/whatsapp/settings', () => ({ getWhatsAppMode: mockGetWhatsAppMode }))

const { sendQueuedWhatsApp } = await import('@/lib/whatsapp/daily')

const CREDENTIALS = {
  WHATSAPP_ACCESS_TOKEN: 'token',
  WHATSAPP_PHONE_NUMBER_ID: '123',
  WHATSAPP_APP_SECRET: 'secret',
  WHATSAPP_VERIFY_TOKEN: 'verify',
}

const client = {} as SupabaseClient

afterEach(() => {
  vi.unstubAllEnvs()
  mockRunSender.mockReset()
  mockGetWhatsAppMode.mockReset()
})

describe('sendQueuedWhatsApp', () => {
  it('does nothing without the Meta credentials, whatever the saved mode', async () => {
    for (const key of Object.keys(CREDENTIALS)) vi.stubEnv(key, '')
    mockGetWhatsAppMode.mockResolvedValue('live')
    expect(await sendQueuedWhatsApp(client, '2027-03-01')).toEqual({
      mode: 'off',
      sent: 0,
      skipped: 0,
      failed: 0,
      deferred: 0,
    })
    expect(mockRunSender).not.toHaveBeenCalled()
  })

  it('runs the sender in the saved mode, linking the production renewals page', async () => {
    for (const [key, value] of Object.entries(CREDENTIALS)) vi.stubEnv(key, value)
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'kunba.example.app')
    mockGetWhatsAppMode.mockResolvedValue('test')
    mockRunSender.mockResolvedValue({ mode: 'test', sent: 1, skipped: 0, failed: 0, deferred: 0 })

    expect(await sendQueuedWhatsApp(client, '2027-03-01')).toMatchObject({ mode: 'test', sent: 1 })
    expect(mockRunSender).toHaveBeenCalledTimes(1)
    expect(mockRunSender.mock.calls[0]![1]).toMatchObject({
      today: '2027-03-01',
      mode: 'test',
      renewalsUrl: 'https://kunba.example.app/renewals',
    })
  })

  it('links the local app when not deployed', async () => {
    for (const [key, value] of Object.entries(CREDENTIALS)) vi.stubEnv(key, value)
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    mockGetWhatsAppMode.mockResolvedValue('live')
    mockRunSender.mockResolvedValue({ mode: 'live', sent: 0, skipped: 0, failed: 0, deferred: 0 })

    await sendQueuedWhatsApp(client, '2027-03-01')
    expect(mockRunSender.mock.calls[0]![1].renewalsUrl).toBe('http://localhost:3000/renewals')
  })
})
