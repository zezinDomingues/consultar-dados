/* eslint-disable @next/next/no-img-element -- SVGs estáticos da marca (public/site/marca) */
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, LogIn } from 'lucide-react'
import { FOCO_ESCURO } from '@/components/ui/foco'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

export const metadata: Metadata = { title: 'Página não encontrada' }

// 404 de qualquer endereço fora do painel, na mesma linguagem do login e do site (marinho, selo, Playfair).
export default function NaoEncontrada() {
  return (
    <main className='fundo-marinho relative isolate grid min-h-dvh place-items-center overflow-hidden px-6 py-12 text-white'>
      <div
        className='pointer-events-none absolute -top-[20%] left-[15%] -z-10 size-[600px] max-w-[150vw] rounded-full opacity-[0.22] blur-3xl'
        style={{ background: 'radial-gradient(circle, #365db9 0%, #213870 50%, transparent 70%)' }}
      />
      <img
        src='/site/marca/simbolo-escuro.svg'
        alt=''
        className='pointer-events-none absolute -bottom-24 -right-24 -z-10 size-[420px] opacity-[0.05]'
      />
      <div className='w-full max-w-lg text-center'>
        <Link href={ROTAS.inicio} className={cn('inline-block rounded-md', FOCO_ESCURO)} aria-label='OficialCert — ir ao site'>
          <img src='/site/marca/vertical-escuro.svg' alt='OficialCert' className='mx-auto h-16 w-auto' />
        </Link>
        <p className='mt-10 flex items-center justify-center gap-3 text-[11px] font-bold uppercase tracking-[0.25em] text-ouro'>
          <span className='h-px w-8 bg-ouro/50' /> Erro 404 <span className='h-px w-8 bg-ouro/50' />
        </p>
        <h1 className='mt-4 font-serif text-[clamp(2rem,6vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em]'>
          Página não encontrada
        </h1>
        <p className='mx-auto mt-4 max-w-md text-[15px] font-light leading-relaxed text-areia'>
          O endereço pode ter mudado ou estar incompleto. Volte ao site ou entre na plataforma.
        </p>
        <div className='mt-8 flex flex-wrap justify-center gap-3'>
          <Link
            href={ROTAS.inicio}
            className={cn(
              'inline-flex items-center gap-2 rounded-full bg-creme px-6 py-3 text-sm font-bold tracking-wide text-oc-700 transition hover:bg-white',
              FOCO_ESCURO
            )}
          >
            <ArrowLeft className='size-4' aria-hidden /> Voltar ao site
          </Link>
          <Link
            href={ROTAS.login}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-ouro/50 px-6 py-3 text-sm font-bold tracking-wide text-creme transition hover:bg-white/[0.06]',
              FOCO_ESCURO
            )}
          >
            <LogIn className='size-4' aria-hidden /> Entrar na plataforma
          </Link>
        </div>
      </div>
    </main>
  )
}
