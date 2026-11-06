import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { listarContadores, paginaInterna } from '@/lib/empresas/consulta'
import { fmtInt } from '@/lib/formatar'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'
import { hrefConsulta } from '@/lib/empresas/filtros'

export const metadata: Metadata = { title: 'Contadores e grupos' }

const POR_PAGINA = 50

export default async function ContadoresPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  await paginaInterna()
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const pagina = Math.max(1, parseInt(sp.pagina ?? '1', 10) || 1)
  const { itens, total } = await listarContadores(q, pagina, POR_PAGINA)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const href = (p: number) => `${ROTAS.contadores}?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { pagina: String(p) } : {}) })}`

  return (
    <div className='space-y-5 p-6'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='max-w-2xl'>
          <span className='rotulo-secao'>Relacionamento</span>
          <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Contadores e grupos</h1>
          <p className='text-sm text-slate-500'>
            E-mails que aparecem no cadastro de 5 ou mais empresas: escritórios contábeis (um contato fala por dezenas de
            clientes) e grupos econômicos com várias empresas.
          </p>
        </div>
        <form className='relative w-full max-w-sm' action={ROTAS.contadores}>
          <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
          <input
            name='q'
            defaultValue={q}
            placeholder='Buscar e-mail ou nome de cliente'
            className='h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
          />
        </form>
      </header>

      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[980px] text-left text-sm'>
            <thead className='bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500'>
              <tr>
                <th className='px-4 py-2.5 font-medium'>E-mail</th>
                <th className='px-3 py-2.5 text-right font-medium'>Empresas</th>
                <th className='px-3 py-2.5 text-right font-medium'>Lucro Real</th>
                <th className='px-3 py-2.5 text-right font-medium'>Prior. A</th>
                <th className='px-3 py-2.5 font-medium'>Onde</th>
                <th className='px-3 py-2.5 font-medium'>Exemplos de clientes</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(c => (
                <tr key={c.email} className='border-t border-slate-100 align-top hover:bg-marca-50/50'>
                  <td className='max-w-[300px] px-4 py-3'>
                    <p className='truncate font-medium text-slate-800'>{c.email}</p>
                    <span
                      className={cn(
                        'mt-1 inline-block rounded px-1.5 py-0.5 text-[11px]',
                        c.classificacao === 'Escritório contábil' ? 'bg-marca-50 text-marca-800' : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {c.classificacao}
                    </span>
                    {c.telefone_mais_frequente && <p className='mt-1 text-xs text-slate-500'>{c.telefone_mais_frequente}</p>}
                  </td>
                  <td className='px-3 py-3 text-right'>
                    <Link
                      href={hrefConsulta({ filtros: { email: c.email } })}
                      className='font-semibold tabular-nums text-marca-700 hover:underline'
                      title='Ver as empresas na consulta'
                    >
                      {fmtInt(c.empresas)}
                    </Link>
                  </td>
                  <td className='px-3 py-3 text-right tabular-nums text-slate-600'>{fmtInt(c.lucro_real)}</td>
                  <td className='px-3 py-3 text-right tabular-nums text-slate-600'>{fmtInt(c.prioridade_a)}</td>
                  <td className='px-3 py-3'>
                    <p className='text-slate-700'>{c.municipio_principal}</p>
                    <p className='text-xs text-slate-400'>
                      {c.municipios_distintos > 1 ? `+ ${c.municipios_distintos - 1} municípios · ` : ''}
                      {c.setor_principal}
                    </p>
                  </td>
                  <td className='max-w-[420px] px-3 py-3 text-xs text-slate-500'>
                    <p className='line-clamp-2'>{c.exemplos}</p>
                  </td>
                </tr>
              ))}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={6} className='px-4 py-12 text-center text-slate-400'>
                    Nada encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className='flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500'>
          <span>
            {fmtInt(total)} e-mails · página {fmtInt(pagina)} de {fmtInt(paginas)}
          </span>
          <div className='flex gap-1'>
            {pagina > 1 && (
              <Link href={href(pagina - 1)} className='grid size-8 place-items-center rounded-md hover:bg-slate-100'>
                <ChevronLeft className='size-4' />
              </Link>
            )}
            {pagina < paginas && (
              <Link href={href(pagina + 1)} className='grid size-8 place-items-center rounded-md hover:bg-slate-100'>
                <ChevronRight className='size-4' />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
