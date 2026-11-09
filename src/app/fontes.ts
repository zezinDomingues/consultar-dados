import { Inter, Playfair_Display } from 'next/font/google'

// Fontes da marca num lugar só: o layout raiz e o global-error (que troca o layout inteiro) usam as mesmas.
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
// títulos com a serifa do site institucional (OficialCert)
export const playfair = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-playfair' })
