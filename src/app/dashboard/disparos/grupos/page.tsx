/* eslint-disable @next/next/no-img-element -- logos dos grupos (Storage) */
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CircleCheck, Plus } from 'lucide-react'
import { listarGrupos } from '@/lib/disparos/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { fmtInt } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Grupos' }

export default async function GruposPage({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.disparos)
  const { salvo } = await searchParams
  const grupos = await listarGrupos()
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='max-w-2xl text-sm text-slate-500'>
          Cada grupo é um cliente do disparo: marca, logo, números e campanhas próprios. Ninguém recebe duas vezes do mesmo grupo, e
          quem pede para sair sai daquele grupo. O cliente entra com o login dele e vê só o grupo dele.
        </p>
        <Link href={ROTAS.grupo('novo')} className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme hover:bg-marca-950'>
          <Plus className='size-4' /> Novo grupo
        </Link>
      </div>
      <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-3'>
        {grupos.map(g => (
          <Link
            key={g.id}
            href={ROTAS.grupo(g.id)}
            className={cn(
              'overflow-hidden rounded-2xl border bg-white shadow-sm shadow-marca-900/[0.03] transition hover:border-marca-300',
              String(g.id) === salvo ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200',
              !g.ativo && 'opacity-60'
            )}
          >
            {g.logo_url ? (
              <img src={g.logo_url} alt='' className='aspect-[1.91/1] w-full bg-slate-100 object-cover' />
            ) : (
              <div className='grid aspect-[1.91/1] w-full place-items-center bg-slate-100 font-serif text-2xl font-bold text-slate-400'>{g.nome}</div>
            )}
            <div className='p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <h3 className='font-serif text-lg font-bold text-marca-800'>{g.nome}</h3>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', g.fluxo === 'coleta' ? 'bg-sky-50 text-sky-800' : 'bg-violet-50 text-violet-800')}>
                  {g.fluxo === 'coleta' ? 'coleta' : 'só divulgação'}
                </span>
                {!g.ativo && <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500'>desativado</span>}
                {String(g.id) === salvo && (
                  <span className='inline-flex items-center gap-1 text-xs font-semibold text-emerald-700'>
                    <CircleCheck className='size-3.5' /> salvo
                  </span>
                )}
              </div>
              <p className='mt-1 truncate text-xs text-slate-400'>{g.site_url ?? 'sem site'}</p>
              <dl className='mt-3 grid grid-cols-4 gap-2 text-center'>
                {[
                  ['números', g.numeros],
                  ['campanhas ativas', g.campanhas_ativas],
                  ['enviados', g.enviados],
                  ['logins', g.membros]
                ].map(([r, v]) => (
                  <div key={r} className='rounded-lg bg-slate-50 px-1 py-1.5'>
                    <dd className='font-serif text-lg font-bold text-marca-800'>{fmtInt(v as number)}</dd>
                    <dt className='text-[10px] text-slate-500'>{r}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
