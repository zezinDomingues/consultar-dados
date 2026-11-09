'use client'
/* eslint-disable @next/next/no-img-element -- SVG estático da marca (public/site/marca) */

import { RotateCcw } from 'lucide-react'
import { inter, playfair } from './fontes'
import './globals.css'

// Último recurso: erro no próprio layout raiz. Substitui o <html> inteiro, por isso traz fontes e estilos.
export default function ErroGeral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang='pt-BR' className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <main className='fundo-marinho grid min-h-dvh place-items-center px-6 py-12 text-white'>
          <div role='alert' className='w-full max-w-md text-center'>
            <img src='/site/marca/vertical-escuro.svg' alt='OficialCert' className='mx-auto h-16 w-auto' />
            <h1 className='mt-10 font-serif text-[2rem] font-bold leading-tight'>Algo deu errado</h1>
            <p className='mt-3 text-[15px] font-light leading-relaxed text-areia'>
              A página não pôde ser montada. Tente de novo em instantes; se continuar, avise o administrador.
            </p>
            {error.digest && <p className='mt-3 font-mono text-xs text-areia/80'>código: {error.digest}</p>}
            <div className='mt-8 flex flex-wrap justify-center gap-3'>
              <button
                type='button'
                onClick={reset}
                className='inline-flex items-center gap-2 rounded-full bg-creme px-6 py-3 text-sm font-bold tracking-wide text-oc-700 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ouro'
              >
                <RotateCcw className='size-4' aria-hidden /> Tentar de novo
              </button>
              {/* link comum (não next/link): recarrega do zero, sem depender do roteador que falhou */}
              <a
                href='/'
                className='inline-flex items-center rounded-full border border-ouro/50 px-6 py-3 text-sm font-bold tracking-wide text-creme transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ouro'
              >
                Ir para o site
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
