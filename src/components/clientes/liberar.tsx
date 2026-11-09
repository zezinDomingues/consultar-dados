'use client'

import { useTransition } from 'react'
import { LoaderCircle, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { liberarEmpresa } from '@/app/dashboard/minhas-empresas/actions'
import { cn } from '@/lib/utils'

export function BotaoLiberar({ cnpj, nome, semSaldo, largo }: { cnpj: string; nome?: string; semSaldo: boolean; largo?: boolean }) {
  const [pendente, iniciar] = useTransition()
  return (
    <button
      type='button'
      disabled={pendente || semSaldo}
      aria-label={nome && !semSaldo ? `Liberar contato de ${nome}` : undefined}
      title={semSaldo ? 'Saldo esgotado' : 'Mostra telefone, WhatsApp, e-mail e endereço (usa 1 do seu saldo)'}
      onClick={() =>
        iniciar(async () => {
          const r = await liberarEmpresa(cnpj)
          if (r.erro) toast.error(r.erro)
          else toast.success(`Contato liberado · saldo: ${r.saldo}`)
        })
      }
      className={cn(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-marca-800 px-3 text-xs font-semibold text-creme outline-none hover:bg-marca-950 focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
        largo && 'w-full'
      )}
    >
      {pendente ? <LoaderCircle aria-hidden className='size-3.5 animate-spin' /> : <LockOpen aria-hidden className='size-3.5' />}
      {semSaldo ? 'Saldo esgotado' : 'Liberar contato'}
    </button>
  )
}
