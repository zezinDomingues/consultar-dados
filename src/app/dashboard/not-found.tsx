import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'
import { FOCO } from '@/components/ui/foco'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

export const metadata: Metadata = { title: 'Página não encontrada' }

// 404 dentro do painel (com o menu): endereço inexistente, CNPJ/ID inválido ou registro que não existe mais.
export default function NaoEncontradaPainel() {
  return (
    <div className='grid min-h-[calc(100dvh-3.5rem)] place-items-center p-6 lg:min-h-dvh'>
      <div className='max-w-md text-center'>
        <div className='mx-auto grid size-16 place-items-center rounded-2xl bg-marca-50 text-marca-700'>
          <SearchX className='size-8' aria-hidden />
        </div>
        <p className='mt-5 rotulo-secao'>Erro 404</p>
        <h1 className='mt-2 font-serif text-[1.75rem] font-bold leading-tight tracking-[-0.01em] text-marca-800'>
          Página não encontrada
        </h1>
        <p className='mt-2 text-sm text-slate-500'>
          O endereço pode estar incompleto ou o registro (empresa, campanha, grupo ou usuário) não existe mais.
        </p>
        <Link
          href={ROTAS.dashboard}
          className={cn(
            'mt-6 inline-flex items-center gap-2 rounded-full bg-marca-800 px-5 py-2.5 text-sm font-bold tracking-wide text-creme shadow-md shadow-marca-900/15 transition hover:bg-marca-950',
            FOCO
          )}
        >
          <ArrowLeft className='size-4' aria-hidden /> Voltar ao início do painel
        </Link>
      </div>
    </div>
  )
}
