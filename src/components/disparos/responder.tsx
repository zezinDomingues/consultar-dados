'use client'

import { useRef, useState, useTransition } from 'react'
import { LoaderCircle, SendHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { enviarMensagemManual } from '@/app/dashboard/disparos/actions'

/**
 * Resposta manual da equipe, pelo mesmo número que fez o contato. Sai WhatsApp de verdade: um envio por vez.
 * O Ctrl+Enter não passa pelo botão (requestSubmit ignora o botão desabilitado), por isso a trava fica no próprio
 * envio: a ref segura o 2º disparo no mesmo instante (antes de o estado `pendente` chegar à tela) e o texto fica
 * só leitura enquanto a mensagem está saindo.
 */
export function Responder({ id, desabilitado }: { id: number; desabilitado?: string }) {
  const [texto, setTexto] = useState('')
  const [pendente, iniciar] = useTransition()
  const enviando = useRef(false)

  if (desabilitado) return <p className='rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500'>{desabilitado}</p>

  function enviar() {
    const corpo = texto
    if (enviando.current || pendente || !corpo.trim()) return
    enviando.current = true
    iniciar(async () => {
      try {
        const r = await enviarMensagemManual(id, corpo)
        if (r.erro) toast.error(r.erro)
        else {
          toast.success(r.mensagem ?? 'Enviada.')
          setTexto('')
        }
      } catch {
        toast.error('Não foi possível enviar agora. Confira a conversa antes de tentar de novo.')
      } finally {
        enviando.current = false
      }
    })
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        enviar()
      }}
      className='flex items-end gap-2'
      aria-busy={pendente}
    >
      <label htmlFor={`responder-${id}`} className='sr-only'>
        Mensagem para o contato
      </label>
      <textarea
        id={`responder-${id}`}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        readOnly={pendente}
        rows={2}
        maxLength={3000}
        placeholder='Responder pelo WhatsApp (sai pelo número que fez o contato)…'
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            enviar()
          }
        }}
        className='min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none read-only:bg-slate-50 read-only:text-slate-500 focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
      />
      <button
        type='submit'
        disabled={pendente || !texto.trim()}
        className='grid size-11 shrink-0 place-items-center rounded-full bg-marca-800 text-creme transition hover:bg-marca-950 disabled:opacity-50'
        aria-label={pendente ? 'Enviando a mensagem' : 'Enviar mensagem (Ctrl+Enter)'}
      >
        {pendente ? <LoaderCircle className='size-4 animate-spin' aria-hidden /> : <SendHorizontal className='size-4' aria-hidden />}
      </button>
    </form>
  )
}
