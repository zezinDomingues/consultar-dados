'use client'

import { RotateCcw, TriangleAlert } from 'lucide-react'
import { FOCO } from '@/components/ui/foco'
import { cn } from '@/lib/utils'

// Erro genérico de qualquer tela do painel (a Consulta tem o próprio, com a dica dos filtros).
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className='grid min-h-[60vh] place-items-center p-6'>
      <div role='alert' className='max-w-md space-y-3 text-center'>
        <TriangleAlert className='mx-auto size-10 text-amber-500' aria-hidden />
        <h1 className='font-serif text-xl font-bold text-marca-800'>Não foi possível abrir esta tela</h1>
        <p className='text-sm text-slate-500'>
          O servidor ou o banco de dados não respondeu a tempo. Tente de novo em instantes; se continuar, avise o
          administrador e informe o código abaixo.
        </p>
        {error.digest && <p className='font-mono text-xs text-slate-500'>código: {error.digest}</p>}
        <button
          type='button'
          onClick={reset}
          className={cn(
            'inline-flex items-center gap-2 rounded-full bg-marca-800 px-5 py-2 text-sm font-semibold text-creme hover:bg-marca-900',
            FOCO
          )}
        >
          <RotateCcw className='size-4' aria-hidden /> Tentar de novo
        </button>
      </div>
    </div>
  )
}
