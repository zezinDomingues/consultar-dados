'use client'

import { useActionState, useState } from 'react'
import { ArrowUpRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { entrar, type EstadoLogin } from './actions'

// Campos no mesmo estilo do formulário de contato do site (ícone à esquerda, cantos xl, borda marinho suave).
const CAMPO =
  'campo-oc w-full rounded-xl border border-oc-700/15 bg-white py-3.5 pl-11 pr-4 text-sm text-oc-700 shadow-sm shadow-oc-700/[0.03] outline-none transition placeholder:text-oc-700/35 focus:border-oc-700/45 focus:ring-4 focus:ring-oc-700/[0.07]'

export function FormLogin({ next }: { next?: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {})
  const [verSenha, setVerSenha] = useState(false)

  return (
    <form action={acao} className='space-y-4'>
      <input type='hidden' name='next' value={next ?? ''} />
      <label className='block space-y-1.5'>
        <span className='text-[12px] font-bold uppercase tracking-[0.12em] text-oc-700/70'>E-mail</span>
        <span className='relative block'>
          <Mail className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
          <input
            name='email'
            type='email'
            defaultValue={estado.email}
            key={estado.email}
            autoComplete='email'
            placeholder='seu@email.com.br'
            required
            className={CAMPO}
          />
        </span>
      </label>
      <label className='block space-y-1.5'>
        <span className='text-[12px] font-bold uppercase tracking-[0.12em] text-oc-700/70'>Senha</span>
        <span className='relative block'>
          <LockKeyhole className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
          <input
            name='senha'
            type={verSenha ? 'text' : 'password'}
            autoFocus={!!estado.erro}
            autoComplete='current-password'
            placeholder='••••••••'
            required
            className={`${CAMPO} pr-12`}
          />
          <button
            type='button'
            onClick={() => setVerSenha(v => !v)}
            aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
            className='absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-oc-700/45 transition hover:bg-oc-700/5 hover:text-oc-700'
          >
            {verSenha ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
          </button>
        </span>
      </label>
      {estado.erro && (
        <p role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700'>
          {estado.erro}
        </p>
      )}
      <button
        type='submit'
        disabled={enviando}
        className='group mt-2 flex w-full items-center justify-center gap-2.5 rounded-full bg-oc-700 px-8 py-4 text-[15px] font-bold tracking-wide text-creme shadow-lg shadow-oc-700/15 transition hover:bg-oc-900 disabled:opacity-70'
      >
        {enviando ? <LoaderCircle className='size-4 animate-spin' /> : null}
        {enviando ? 'Entrando…' : 'Entrar na plataforma'}
        {!enviando && <ArrowUpRight className='size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5' />}
      </button>
    </form>
  )
}
