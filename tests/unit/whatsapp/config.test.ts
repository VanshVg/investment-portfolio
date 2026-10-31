import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConnected, whatsappConfig } from '@/lib/whatsapp/config'

const REQUIRED = {
  WHATSAPP_ACCESS_TOKEN: 'token',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_APP_SECRET: 'secret',
  WHATSAPP_VERIFY_TOKEN: 'verify',
}

function stub(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

afterEach(() => vi.unstubAllEnvs())

describe('whatsappConfig', () => {
  it('is null until all four required variables are set', () => {
    for (const missing of Object.keys(REQUIRED)) {
      stub({ ...REQUIRED, [missing]: '' })
      expect(whatsappConfig(), `without ${missing}`).toBeNull()
      expect(isConnected()).toBe(false)
      vi.unstubAllEnvs()
    }
  })

  it('reads the variables, with defaults for the API version and language', () => {
    stub(REQUIRED)
    expect(whatsappConfig()).toEqual({
      accessToken: 'token',
      phoneNumberId: '1234567890',
      appSecret: 'secret',
      verifyToken: 'verify',
      apiVersion: 'v23.0',
      language: 'en',
    })
    expect(isConnected()).toBe(true)
  })

  it('takes the API version and language when given', () => {
    stub({ ...REQUIRED, WHATSAPP_API_VERSION: 'v24.0', WHATSAPP_TEMPLATE_LANGUAGE: 'en_US' })
    expect(whatsappConfig()).toMatchObject({ apiVersion: 'v24.0', language: 'en_US' })
  })
})
