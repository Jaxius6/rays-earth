import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'rays.earth',
  description: 'A live, real-time, planet-wide map of luminous human presence',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  themeColor: '#0b0b0b',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}