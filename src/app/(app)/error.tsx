'use client'

import { RotateCcw, TriangleAlert } from 'lucide-react'

export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className='grid min-h-[60vh] place-items-center p-6'>
      <div className='max-w-md space-y-3 text-center'>
        <TriangleAlert className='mx-auto size-10 text-amber-500' />
        <h1 className='text-lg font-semibold'>Não foi possível carregar os dados</h1>
        <p className='text-sm text-slate-500'>
          A consulta demorou demais ou o banco não respondeu. Tente de novo; se repetir, reduza os filtros de texto.
        </p>
        {error.digest && <p className='font-mono text-xs text-slate-400'>código: {error.digest}</p>}
        <button
          onClick={reset}
          className='inline-flex items-center gap-2 rounded-lg bg-marca-800 px-4 py-2 text-sm font-medium text-white hover:bg-marca-900'
        >
          <RotateCcw className='size-4' /> Tentar de novo
        </button>
      </div>
    </div>
  )
}
