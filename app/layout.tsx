import './globals.css'
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Worldview',
  description: 'Worldview is an open-source realtime global map platform built with MapLibre and Next.js.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <SiteHeader />
        {children}
        <Footer />
      </body>
    </html>
  )
}
