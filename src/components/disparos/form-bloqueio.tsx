'use client'

import { useActionState, useEffect, useRef } from 'react'
import { Ban, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { bloquearTelefone, type Retorno } from '@/app/dashboard/disparos/actions'

export function FormBloqueio({ grupos }: { grupos: { id: number; nome: string }[] }) {
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(bloquearTelefone, {})
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem ?? 'Bloqueado.')
      form.current?.reset()
    }
    if (estado.erro) toast.error(estado.erro)
  }, [estado])
  const entrada = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-marca-400'
  return (
    <form ref={form} action={acao} className='flex flex-wrap gap-2'>
      <input name='telefone' required placeholder='(11) 99999-9999' className={`${entrada} w-40`} />
      <select name='grupo_id' defaultValue='' className={entrada}>
        <option value=''>Todos os grupos</option>
        {grupos.map(g => (
          <option key={g.id} value={g.id}>
            {g.nome}
          </option>
        ))}
      </select>
      <input name='observacao' maxLength={200} placeholder='motivo (cliente, parceiro…)' className={`${entrada} min-w-0 flex-1`} />
      <button type='submit' disabled={salvando} className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-red-300 hover:text-red-700 disabled:opacity-60'>
        {salvando ? <LoaderCircle className='size-3.5 animate-spin' /> : <Ban className='size-3.5' />} Nunca contatar
      </button>
    </form>
  )
}
