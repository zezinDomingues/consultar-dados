'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'

export function Copiar({ texto, rotulo = 'Copiado' }: { texto: string; rotulo?: string }) {
  return (
    <button
      type='button'
      title='Copiar'
      onClick={async () => {
        await navigator.clipboard.writeText(texto)
        toast.success(`${rotulo}: ${texto}`)
      }}
      className='rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700'
    >
      <Copy className='size-3.5' />
    </button>
  )
}
