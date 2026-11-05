'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle, SendHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { enviarMensagemManual } from '@/app/dashboard/disparos/actions'

/** Resposta manual da equipe, pelo mesmo número que fez o contato. */
export function Responder({ id, desabilitado }: { id: number; desabilitado?: string }) {
  const [texto, setTexto] = useState('')
  const [pendente, iniciar] = useTransition()

  if (desabilitado) return <p className='rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500'>{desabilitado}</p>

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        iniciar(async () => {
          const r = await enviarMensagemManual(id, texto)
          if (r.erro) toast.error(r.erro)
          else {
            toast.success(r.mensagem ?? 'Enviada.')
            setTexto('')
          }
        })
      }}
      className='flex items-end gap-2'
    >
      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={2}
        maxLength={3000}
        placeholder='Responder pelo WhatsApp (sai pelo número que fez o contato)…'
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit()
        }}
        className='min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
      />
      <button
        type='submit'
        disabled={pendente || !texto.trim()}
        className='grid size-11 shrink-0 place-items-center rounded-full bg-marca-800 text-creme transition hover:bg-marca-950 disabled:opacity-50'
        aria-label='Enviar'
      >
        {pendente ? <LoaderCircle className='size-4 animate-spin' /> : <SendHorizontal className='size-4' />}
      </button>
    </form>
  )
}
