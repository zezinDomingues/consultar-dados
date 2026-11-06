'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { Copy, KeyRound, LoaderCircle, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { adicionarPacote, redefinirSenha, type Retorno } from '@/app/dashboard/usuarios/actions'

export function FormPacote({ userId }: { userId: string }) {
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(adicionarPacote, {})
  useEffect(() => {
    if (estado.ok) toast.success(estado.mensagem ?? 'Pacote adicionado.')
    if (estado.erro) toast.error(estado.erro)
  }, [estado])
  return (
    <form action={acao} className='mt-3 flex flex-wrap gap-2'>
      <input type='hidden' name='user_id' value={userId} />
      <input name='quantidade' type='number' min={1} required placeholder='qtd.' className='h-9 w-24 rounded-lg border border-slate-200 px-2 text-sm' />
      <input name='observacao' maxLength={200} placeholder='nota (nº do pedido…)' className='h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm' />
      <button type='submit' disabled={salvando} className='inline-flex h-9 items-center gap-1.5 rounded-lg bg-marca-800 px-3 text-xs font-semibold text-creme disabled:opacity-60'>
        {salvando ? <LoaderCircle className='size-3.5 animate-spin' /> : <PackagePlus className='size-3.5' />} Adicionar leva
      </button>
    </form>
  )
}

export function RedefinirSenha({ userId }: { userId: string }) {
  const [pendente, iniciar] = useTransition()
  const [senha, setSenha] = useState<string | null>(null)
  if (senha) {
    return (
      <div className='flex items-center gap-2'>
        <code className='rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm'>{senha}</code>
        <button type='button' onClick={() => navigator.clipboard.writeText(senha).then(() => toast.success('Copiada.'))} className='inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs'>
          <Copy className='size-3.5' /> Copiar
        </button>
      </div>
    )
  }
  return (
    <button
      type='button'
      disabled={pendente}
      onClick={() => {
        if (!window.confirm('Gerar uma senha nova? A atual deixa de funcionar.')) return
        iniciar(async () => {
          const r = await redefinirSenha(userId)
          if (r.erro) toast.error(r.erro)
          else setSenha(r.senha ?? null)
        })
      }}
      className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-marca-400 disabled:opacity-60'
    >
      {pendente ? <LoaderCircle className='size-3.5 animate-spin' /> : <KeyRound className='size-3.5' />} Redefinir senha
    </button>
  )
}
