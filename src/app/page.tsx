import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Database, LogIn } from 'lucide-react'
import { ROTAS } from '@/lib/rotas'

// Landing page provisória (pública). A versão completa vem depois; por ora só
// apresenta o produto e leva para o login.
export const metadata: Metadata = {
  title: 'Consultar Dados — empresas de SP para prospectar',
  description:
    '628 mil empresas de São Paulo filtradas por setor, porte, região e regime tributário, com contato e prioridade de prospecção.'
}

export default function LandingPage() {
  return (
    <div className='relative flex min-h-screen flex-col overflow-hidden bg-marca-950 text-white'>
      <div className='pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-marca-700/40 blur-3xl' />
      <div className='pointer-events-none absolute -bottom-48 -left-32 size-[30rem] rounded-full bg-marca-500/20 blur-3xl' />

      <header className='relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6'>
        <Link href={ROTAS.inicio} className='flex items-center gap-2.5'>
          <span className='grid size-9 place-items-center rounded-lg bg-white/10'>
            <Database className='size-4.5' />
          </span>
          <span className='font-semibold'>Consultar Dados</span>
        </Link>
        <Link
          href={ROTAS.login}
          className='inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-medium transition hover:bg-white/10'
        >
          <LogIn className='size-4' /> Entrar
        </Link>
      </header>

      <main className='relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24'>
        <span className='w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-marca-100'>
          Empresas de São Paulo · Lucro Real e Presumido
        </span>
        <h1 className='mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl'>
          Encontre as empresas certas para vender — e saiba como falar com elas.
        </h1>
        <p className='mt-5 max-w-2xl text-lg text-marca-100'>
          628 mil empresas filtradas por setor, porte, região e regime tributário, com contato, prioridade de prospecção
          e um agente de IA que faz a busca por você.
        </p>
        <Link
          href={ROTAS.login}
          className='mt-10 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-marca-950 shadow-lg shadow-black/20 transition hover:bg-marca-50'
        >
          Entrar na plataforma <ArrowRight className='size-4' />
        </Link>
      </main>

      <footer className='relative mx-auto w-full max-w-6xl px-6 py-6 text-xs text-marca-300'>
        © {new Date().getFullYear()} Consultar Dados · Dados da Receita Federal e do IBGE
      </footer>
    </div>
  )
}
