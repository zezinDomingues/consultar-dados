'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { FOCO } from '@/components/ui/foco'
import { cn } from '@/lib/utils'

export function Copiar({ texto, rotulo = 'Copiado' }: { texto: string; rotulo?: string }) {
  return (
    <button
      type='button'
      title='Copiar'
      aria-label={`Copiar ${texto}`}
      onClick={async () => {
        // a área de transferência pode estar bloqueada (http, permissão negada, navegador antigo)
        try {
          await navigator.clipboard.writeText(texto)
          toast.success(`${rotulo}: ${texto}`)
        } catch {
          toast.error(`Não foi possível copiar. Selecione e copie à mão: ${texto}`)
        }
      }}
      className={cn('rounded p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700', FOCO)}
    >
      <Copy className='size-3.5' aria-hidden />
    </button>
  )
}
