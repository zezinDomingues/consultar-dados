'use client'

import { useActionState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { entrar, type EstadoLogin } from './actions'

export function FormLogin({ next }: { next?: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {})

  return (
    <form action={acao} className='space-y-4'>
      <input type='hidden' name='next' value={next ?? ''} />
      <label className='block space-y-1.5'>
        <span className='text-sm font-medium text-slate-700'>E-mail</span>
        <input
          name='email'
          type='email'
          defaultValue={estado.email}
          key={estado.email}
          autoComplete='email'
          required
          className='h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-100'
        />
      </label>
      <label className='block space-y-1.5'>
        <span className='text-sm font-medium text-slate-700'>Senha</span>
        <input
          name='senha'
          type='password'
          autoFocus={!!estado.erro}
          autoComplete='current-password'
          required
          className='h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-100'
        />
      </label>
      {estado.erro && (
        <p role='alert' className='rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'>
          {estado.erro}
        </p>
      )}
      <button
        type='submit'
        disabled={enviando}
        className='flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-marca-800 text-sm font-semibold text-white transition hover:bg-marca-900 disabled:opacity-70'
      >
        {enviando && <LoaderCircle className='size-4 animate-spin' />}
        Entrar
      </button>
    </form>
  )
}
