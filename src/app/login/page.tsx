import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Database } from 'lucide-react'
import { ROTAS } from '@/lib/rotas'
import { FormLogin } from './form-login'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <main className='grid min-h-screen lg:grid-cols-2'>
      <section className='relative hidden overflow-hidden bg-marca-950 p-12 text-white lg:flex lg:flex-col lg:justify-between'>
        <Link href={ROTAS.inicio} className='flex w-fit items-center gap-3'>
          <div className='grid size-10 place-items-center rounded-xl bg-white/10'>
            <Database className='size-5' />
          </div>
          <span className='text-lg font-semibold'>Consultar Dados</span>
        </Link>
        <div className='max-w-md space-y-4'>
          <h1 className='text-4xl font-semibold leading-tight'>628 mil empresas de SP, prontas para filtrar.</h1>
          <p className='text-marca-100'>
            Setor, ramo, porte, regime tributário, região e contato — com prioridade de prospecção calculada para cada
            empresa.
          </p>
        </div>
        <p className='text-xs text-marca-200'>Fonte: Receita Federal (cadastro out/2026, ECF 2016–2024) e IBGE.</p>
        <div className='pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-marca-700/40 blur-3xl' />
      </section>

      <section className='relative flex items-center justify-center p-6'>
        <Link
          href={ROTAS.inicio}
          className='absolute left-6 top-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-marca-700'
        >
          <ArrowLeft className='size-4' /> Voltar ao início
        </Link>
        <div className='w-full max-w-sm space-y-8'>
          <div className='space-y-2'>
            <h2 className='text-2xl font-semibold'>Entrar</h2>
            <p className='text-sm text-slate-500'>Use o acesso fornecido pelo administrador.</p>
          </div>
          <FormLogin next={next} />
        </div>
      </section>
    </main>
  )
}
