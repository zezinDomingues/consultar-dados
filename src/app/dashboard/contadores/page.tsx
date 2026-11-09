import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { FOCO } from '@/components/ui/foco'
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
  const href = (p: number) =>
    [ROTAS.contadores, new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { pagina: String(p) } : {}) }).toString()]
      .filter(Boolean)
      .join('?')

  const classificacao = (c: (typeof itens)[number]) => (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-[11px]',
        c.classificacao === 'Escritório contábil' ? 'bg-marca-50 text-marca-800' : 'bg-slate-100 text-slate-600'
      )}
    >
      {c.classificacao}
    </span>
  )
  const linkEmpresas = (c: (typeof itens)[number], texto: React.ReactNode) => (
    <Link
      href={hrefConsulta({ filtros: { email: c.email } })}
      className={cn('rounded-sm font-semibold tabular-nums text-marca-700 hover:underline', FOCO)}
      title='Ver as empresas na consulta'
    >
      {texto}
    </Link>
  )

  return (
    <div className='space-y-5 p-4 md:p-6'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='max-w-2xl'>
          <span className='rotulo-secao'>Relacionamento</span>
          <h1 className='mt-2 font-serif text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-marca-800 md:text-[2rem]'>
            Contadores e grupos
          </h1>
          <p className='text-sm text-slate-500'>
            E-mails que aparecem no cadastro de 5 ou mais empresas: escritórios contábeis (um contato fala por dezenas de
            clientes) e grupos econômicos com várias empresas.
          </p>
        </div>
        <form className='relative w-full sm:max-w-sm' action={ROTAS.contadores} role='search'>
          <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' aria-hidden />
          <input
            name='q'
            type='search'
            defaultValue={q}
            aria-label='Buscar e-mail ou nome de cliente'
            placeholder='Buscar e-mail ou nome de cliente'
            className='h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
          />
        </form>
      </header>

      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
        {/* celular: um cartão por e-mail */}
        <ul className='divide-y divide-slate-100 md:hidden'>
          {itens.map(c => (
            <li key={c.email} className='space-y-1.5 px-4 py-3.5 text-sm'>
              <p className='font-medium text-slate-800 wrap-anywhere'>{c.email}</p>
              <div className='flex flex-wrap items-center gap-2'>
                {classificacao(c)}
                {c.telefone_mais_frequente && <span className='text-xs text-slate-500'>{c.telefone_mais_frequente}</span>}
              </div>
              <p className='text-slate-600'>
                {linkEmpresas(c, `${fmtInt(c.empresas)} empresas`)} · {fmtInt(c.lucro_real)} Lucro Real ·{' '}
                {fmtInt(c.prioridade_a)} prior. A
              </p>
              <p className='text-xs text-slate-500'>
                {c.municipio_principal}
                {c.municipios_distintos > 1 ? ` + ${c.municipios_distintos - 1} municípios` : ''} · {c.setor_principal}
              </p>
              {c.exemplos && <p className='line-clamp-2 text-xs text-slate-500'>{c.exemplos}</p>}
            </li>
          ))}
          {itens.length === 0 && <li className='px-4 py-12 text-center text-slate-500'>Nada encontrado.</li>}
        </ul>

        <div className='hidden overflow-x-auto md:block'>
          <table className='w-full min-w-[720px] table-fixed text-left text-sm'>
            <thead className='bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500'>
              <tr>
                <th scope='col' className='w-[30%] px-4 py-2.5 font-medium'>
                  E-mail
                </th>
                <th scope='col' className='w-[92px] px-3 py-2.5 text-right font-medium'>
                  Empresas
                </th>
                <th scope='col' className='w-[96px] px-3 py-2.5 text-right font-medium'>
                  Lucro Real
                </th>
                <th scope='col' className='w-[84px] px-3 py-2.5 text-right font-medium'>
                  Prior. A
                </th>
                <th scope='col' className='w-[18%] px-3 py-2.5 font-medium'>
                  Onde
                </th>
                <th scope='col' className='px-3 py-2.5 font-medium'>
                  Exemplos de clientes
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map(c => (
                <tr key={c.email} className='border-t border-slate-100 align-top hover:bg-marca-50/50'>
                  <td className='px-4 py-3'>
                    <p className='truncate font-medium text-slate-800' title={c.email}>
                      {c.email}
                    </p>
                    <div className='mt-1'>{classificacao(c)}</div>
                    {c.telefone_mais_frequente && <p className='mt-1 text-xs text-slate-500'>{c.telefone_mais_frequente}</p>}
                  </td>
                  <td className='px-3 py-3 text-right'>{linkEmpresas(c, fmtInt(c.empresas))}</td>
                  <td className='px-3 py-3 text-right tabular-nums text-slate-600'>{fmtInt(c.lucro_real)}</td>
                  <td className='px-3 py-3 text-right tabular-nums text-slate-600'>{fmtInt(c.prioridade_a)}</td>
                  <td className='px-3 py-3'>
                    <p className='truncate text-slate-700' title={c.municipio_principal ?? undefined}>
                      {c.municipio_principal}
                    </p>
                    <p className='text-xs text-slate-500'>
                      {c.municipios_distintos > 1 ? `+ ${c.municipios_distintos - 1} municípios · ` : ''}
                      {c.setor_principal}
                    </p>
                  </td>
                  <td className='px-3 py-3 text-xs text-slate-500'>
                    <p className='line-clamp-2' title={c.exemplos ?? undefined}>
                      {c.exemplos}
                    </p>
                  </td>
                </tr>
              ))}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={6} className='px-4 py-12 text-center text-slate-500'>
                    Nada encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500'>
          <span>
            {fmtInt(total)} e-mails · página {fmtInt(pagina)} de {fmtInt(paginas)}
          </span>
          <nav className='flex gap-1' aria-label='Paginação'>
            {pagina > 1 && (
              <Link
                href={href(pagina - 1)}
                aria-label='Página anterior'
                title='Página anterior'
                className={cn('grid size-8 place-items-center rounded-md hover:bg-slate-100', FOCO)}
              >
                <ChevronLeft className='size-4' aria-hidden />
              </Link>
            )}
            {pagina < paginas && (
              <Link
                href={href(pagina + 1)}
                aria-label='Próxima página'
                title='Próxima página'
                className={cn('grid size-8 place-items-center rounded-md hover:bg-slate-100', FOCO)}
              >
                <ChevronRight className='size-4' aria-hidden />
              </Link>
            )}
          </nav>
        </div>
      </div>
    </div>
  )
}
