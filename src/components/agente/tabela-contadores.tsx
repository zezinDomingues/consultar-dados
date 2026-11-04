'use client'

import Link from 'next/link'
import type { AnexoContadores } from '@/lib/agente/tipos'
import { fmtInt } from '@/lib/formatar'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'
import { hrefConsulta } from '@/lib/empresas/filtros'

export function TabelaContadores({ anexo }: { anexo: AnexoContadores }) {
  return (
    <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
      <header className='flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm'>
        <span className='text-slate-600'>
          <strong className='text-slate-900'>{fmtInt(anexo.total)}</strong> e-mails presentes em 5+ empresas
        </span>
        <Link href={ROTAS.contadores} className='text-xs font-medium text-marca-700 hover:underline'>
          Ver todos →
        </Link>
      </header>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[760px] text-left text-sm'>
          <thead className='text-[11px] uppercase tracking-wide text-slate-500'>
            <tr>
              <th className='px-4 py-2 font-medium'>E-mail</th>
              <th className='px-3 py-2 text-right font-medium'>Empresas</th>
              <th className='px-3 py-2 text-right font-medium'>Lucro Real</th>
              <th className='px-3 py-2 font-medium'>Onde</th>
            </tr>
          </thead>
          <tbody>
            {anexo.itens.map(c => (
              <tr key={c.email} className='border-t border-slate-100 align-top'>
                <td className='max-w-[320px] px-4 py-2.5'>
                  <p className='truncate font-medium text-slate-800'>{c.email}</p>
                  <span
                    className={cn(
                      'mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px]',
                      c.classificacao === 'Escritório contábil' ? 'bg-marca-50 text-marca-800' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {c.classificacao}
                  </span>
                  {c.telefone_mais_frequente && <span className='ml-2 text-xs text-slate-500'>{c.telefone_mais_frequente}</span>}
                </td>
                <td className='px-3 py-2.5 text-right'>
                  <Link href={hrefConsulta({ filtros: { email: c.email } })} className='font-semibold tabular-nums text-marca-700 hover:underline' title='Ver as empresas'>
                    {fmtInt(c.empresas)}
                  </Link>
                </td>
                <td className='px-3 py-2.5 text-right tabular-nums text-slate-600'>{fmtInt(c.lucro_real)}</td>
                <td className='px-3 py-2.5'>
                  <p className='text-slate-700'>{c.municipio_principal}</p>
                  <p className='text-xs text-slate-400'>{c.setor_principal}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
