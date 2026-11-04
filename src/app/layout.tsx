import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: { default: 'Consultar Dados', template: '%s · Consultar Dados' },
  description: 'Consulta de empresas de SP por setor, ramo, porte, região e contato.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='pt-BR' className={inter.variable}>
      <body>
        {children}
        <Toaster position='bottom-right' richColors closeButton />
      </body>
    </html>
  )
}
