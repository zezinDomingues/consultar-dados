'use client'

import { useTransition } from 'react'
import { LoaderCircle, LockOpen } from 'lucide-react'
import { toast } from 'sonner'
import { liberarEmpresa } from '@/app/dashboard/minhas-empresas/actions'

export function BotaoLiberar({ cnpj, semSaldo }: { cnpj: string; semSaldo: boolean }) {
  const [pendente, iniciar] = useTransition()
  return (
    <button
      type='button'
      disabled={pendente || semSaldo}
      title={semSaldo ? 'Saldo esgotado' : 'Mostra telefone, WhatsApp, e-mail e endereço (usa 1 do seu saldo)'}
      onClick={() =>
        iniciar(async () => {
          const r = await liberarEmpresa(cnpj)
          if (r.erro) toast.error(r.erro)
          else toast.success(`Contato liberado · saldo: ${r.saldo}`)
        })
      }
      className='inline-flex h-8 items-center gap-1.5 rounded-lg bg-marca-800 px-3 text-xs font-semibold text-creme hover:bg-marca-950 disabled:cursor-not-allowed disabled:opacity-40'
    >
      {pendente ? <LoaderCircle className='size-3.5 animate-spin' /> : <LockOpen className='size-3.5' />} Liberar contato
    </button>
  )
}
