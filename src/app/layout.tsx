import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { inter, playfair } from './fontes'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'OficialCert', template: '%s · OficialCert' },
  description: 'Consulta de empresas por estado, setor, ramo, porte, região e contato.'
}

// barra do navegador do celular no marinho da marca (a barra superior do painel também é marinho)
export const viewport: Viewport = { themeColor: '#0b1225' }

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
