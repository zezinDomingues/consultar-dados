import type { Metadata } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
// títulos com a serifa do site institucional (OficialCert)
const playfair = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-playfair' })

export const metadata: Metadata = {
  title: { default: 'OficialCert', template: '%s · OficialCert' },
  description: 'Consulta de empresas por estado, setor, ramo, porte, região e contato.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='pt-BR' className={`${inter.variable} ${playfair.variable}`}>
      <body>
        {children}
        <Toaster position='bottom-right' richColors closeButton />
      </body>
    </html>
  )
}
