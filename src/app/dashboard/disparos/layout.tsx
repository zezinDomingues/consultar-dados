import type { Metadata } from 'next'
import Link from 'next/link'
import { DatabaseZap, Plus, ShieldAlert, TriangleAlert } from 'lucide-react'
import { AbasDisparos, TituloDisparos } from '@/components/disparos/abas'
import { pendenciasServidor } from '@/lib/disparos/config'
import { migracaoAplicada } from '@/lib/disparos/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { ROTAS } from '@/lib/rotas'

export const metadata: Metadata = { title: { default: 'Disparos', template: '%s · Disparos · OficialCert' } }

export default async function DisparosLayout({ children }: { children: React.ReactNode }) {
  const u = await usuarioAtual()
  const cliente = u?.papel === 'cliente' && !!u.produtos?.disparos
  if (u?.papel !== 'admin' && u?.papel !== 'equipe' && !cliente) {
    return (
      <div className='grid min-h-[70vh] place-items-center p-6'>
        <div className='max-w-md space-y-3 text-center'>
          <ShieldAlert className='mx-auto size-10 text-amber-600' aria-hidden />
          <h1 className='text-lg font-semibold'>Área restrita a administradores</h1>
          <p className='text-sm text-slate-500'>
            Os disparos de WhatsApp aparecem para a <strong>equipe</strong> (os ramos de cada um) e para o <strong>admin</strong>.
          </p>
        </div>
      </div>
    )
  }

  if (!(await migracaoAplicada())) {
    return (
      <div className='grid min-h-[70vh] place-items-center p-6'>
        <div className='max-w-lg space-y-3 text-center'>
          <DatabaseZap className='mx-auto size-10 text-marca-600' aria-hidden />
          <h1 className='text-lg font-semibold'>Falta preparar o banco</h1>
          <p className='text-sm text-slate-500'>
            Rode <code className='rounded bg-slate-100 px-1.5 py-0.5'>supabase/migrations/005_disparos_whatsapp.sql</code> no
            SQL Editor do Supabase (e depois a 006, que liga o relógio dos envios).
          </p>
        </div>
      </div>
    )
  }

  const faltam = pendenciasServidor()

  return (
    <div className='space-y-5 px-4 py-5 sm:p-6'>
      <header className='flex flex-wrap items-start justify-between gap-x-4 gap-y-3'>
        <TituloDisparos papel={cliente ? 'cliente' : u.admin ? 'admin' : 'equipe'} />
        {u.admin && (
          <Link
            href={ROTAS.novaCampanha}
            className='inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold tracking-wide text-creme shadow-md shadow-marca-900/15 transition hover:bg-marca-950 sm:mt-6'
          >
            <Plus className='size-4' aria-hidden /> Nova campanha
          </Link>
        )}
      </header>

      {u.admin && faltam.length > 0 && (
        <div
          role='alert'
          className='flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
        >
          <TriangleAlert className='mt-0.5 size-4 shrink-0' aria-hidden />
          <p>
            O servidor ainda não está pronto para enviar: falta uma configuração técnica (
            <span title='variáveis de ambiente do servidor'>{faltam.join(', ')}</span>). Sem ela, o envio, as respostas e o
            formulário não funcionam — avise o responsável técnico.
          </p>
        </div>
      )}

      <AbasDisparos admin={u.admin} />
      {children}
    </div>
  )
}
