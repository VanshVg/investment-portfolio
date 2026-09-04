import type { Metadata } from 'next'
import { BRAND } from '@/config/brand'
import { fraunces, inter, plexMono } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: `${BRAND.tagline} for financial advisors.`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
