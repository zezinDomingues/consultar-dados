'use client'

import { startTransition, useActionState, useEffect, useId, useRef, useState, useTransition } from 'react'
import { AlertTriangle, Copy, KeyRound, LoaderCircle, PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { adicionarPacote, redefinirSenha, type Retorno } from '@/app/dashboard/usuarios/actions'
import { cn } from '@/lib/utils'

/** Anel de foco só para teclado (Tab), em todo controle. */
const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2'
const ENTRADA = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50 aria-[invalid=true]:border-red-400'

const copiar = (texto: string) =>
  navigator.clipboard
    .writeText(texto)
    .then(() => toast.success('Copiada.'))
    .catch(() => toast.error('Não deu para copiar: selecione a senha e copie à mão.'))

export function FormPacote({ userId }: { userId: string }) {
  const uid = useId()
  const refForm = useRef<HTMLFormElement>(null)
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(adicionarPacote, {})
  useEffect(() => {
    if (!estado.ok) return
    toast.success(estado.mensagem ?? 'Pacote adicionado.')
    refForm.current?.reset() // gravou: limpa para a próxima leva
  }, [estado])
  // envio sem o "reset" automático do React 19: se o servidor recusar, o que foi digitado continua nos campos
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => acao(fd))
  }
  const erro = !salvando && estado.erro
  return (
    <form ref={refForm} onSubmit={enviar} className='mt-3 space-y-2'>
      <input type='hidden' name='user_id' value={userId} />
      <div className='flex flex-wrap items-end gap-2'>
        <label className='block space-y-1'>
          <span className='text-[11px] font-semibold text-slate-600'>Quantidade</span>
          <input
            name='quantidade'
            type='number'
            min={1}
            max={1000000}
            required
            inputMode='numeric'
            placeholder='qtd.'
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${uid}-erro` : undefined}
            className={cn(ENTRADA, 'block w-24')}
          />
        </label>
        <label className='block min-w-[10rem] flex-1 space-y-1'>
          <span className='text-[11px] font-semibold text-slate-600'>Nota (opcional)</span>
          <input name='observacao' maxLength={200} placeholder='nº do pedido…' className={cn(ENTRADA, 'block w-full min-w-0')} />
        </label>
        <button
          type='submit'
          disabled={salvando}
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg bg-marca-800 px-3 text-xs font-semibold text-creme hover:bg-marca-950 disabled:opacity-60', FOCO)}
        >
          {salvando ? <LoaderCircle className='size-3.5 animate-spin' /> : <PackagePlus aria-hidden className='size-3.5' />} Adicionar leva
        </button>
      </div>
      {erro && (
        <p id={`${uid}-erro`} role='alert' className='flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700'>
          <AlertTriangle aria-hidden className='mt-px size-3.5 shrink-0' /> {estado.erro}
        </p>
      )}
    </form>
  )
}

export function RedefinirSenha({ userId }: { userId: string }) {
  const [pendente, iniciar] = useTransition()
  const [senha, setSenha] = useState<string | null>(null)
  if (senha) {
    return (
      <div role='status' className='flex flex-wrap items-center gap-2'>
        <code className='break-all rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm'>{senha}</code>
        <button
          type='button'
          onClick={() => copiar(senha)}
          className={cn('inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-xs hover:border-marca-300', FOCO)}
        >
          <Copy aria-hidden className='size-3.5' /> Copiar
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
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-marca-400 disabled:opacity-60', FOCO)}
    >
      {pendente ? <LoaderCircle className='size-3.5 animate-spin' /> : <KeyRound aria-hidden className='size-3.5' />} Redefinir senha
    </button>
  )
}
