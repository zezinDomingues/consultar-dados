import type { Metadata } from 'next'
import Link from 'next/link'
import { DatabaseZap, Plus, ShieldAlert, TriangleAlert } from 'lucide-react'
import { AbasDisparos } from '@/components/disparos/abas'
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
          <ShieldAlert className='mx-auto size-10 text-amber-500' />
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
          <DatabaseZap className='mx-auto size-10 text-marca-600' />
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
    <div className='space-y-5 p-6'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='max-w-2xl'>
          <span className='rotulo-secao'>{cliente ? 'WhatsApp' : 'Administrativo'}</span>
          <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>
            {cliente ? 'Meus disparos' : 'Disparos de WhatsApp'}
          </h1>
          <p className='text-sm text-slate-500'>
            Quem já recebeu, quem respondeu e quem pediu a consulta gratuita, separados por ramo — cada pessoa da equipe
            responde os ramos que recebeu. Cada telefone recebe a primeira mensagem uma única vez.
          </p>
        </div>
        {u.admin && (
        <Link
          href={ROTAS.novaCampanha}
          className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold tracking-wide text-creme shadow-md shadow-marca-900/15 transition hover:bg-marca-950'
        >
          <Plus className='size-4' /> Nova campanha
        </Link>
        )}
      </header>

      {u.admin && faltam.length > 0 && (
        <div className='flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
          <TriangleAlert className='mt-0.5 size-4 shrink-0' />
          <p>
            Configuração pendente no servidor (Vercel → Settings → Environment Variables):{' '}
            <strong>{faltam.join(', ')}</strong>. Sem isso o ciclo de envio, o webhook e o formulário não funcionam.
          </p>
        </div>
      )}

      <AbasDisparos admin={u.admin} />
      {children}
    </div>
  )
}
