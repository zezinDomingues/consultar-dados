import Link from 'next/link'
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone, SearchX, TriangleAlert } from 'lucide-react'
import { LinkNav } from './contexto'
import { PORTE_CURTO, SeloPrioridade, SeloSituacao } from './selos'
import { buscarEmpresas, resumoEmpresas } from '@/lib/empresas/consulta'
import { hrefConsulta, type Consulta } from '@/lib/empresas/filtros'
import type { EmpresaLista } from '@/lib/empresas/tipos'
import { fmtInt, fmtMoeda } from '@/lib/formatar'
import { cn } from '@/lib/utils'

export async function Resultados({ consulta }: { consulta: Consulta }) {
  const [empresas, resumo] = await Promise.all([
    buscarEmpresas(consulta.filtros, consulta.ordem, consulta.pagina, consulta.por),
    resumoEmpresas(JSON.stringify(consulta.filtros))
  ])
  const total = resumo.total.n

  if (total === 0) {
    return (
      <div className='rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center'>
        <SearchX className='mx-auto size-10 text-slate-300' />
        <p className='mt-3 font-medium'>Nenhuma empresa com esses filtros</p>
        <p className='mt-1 text-sm text-slate-500'>Tire algum filtro ou amplie a faixa de capital/idade.</p>
        <LinkNav href='/' className='mt-4 inline-block text-sm font-medium text-marca-700 hover:underline'>
          Limpar todos os filtros
        </LinkNav>
      </div>
    )
  }

  const de = (consulta.pagina - 1) * consulta.por + 1
  const ate = de + empresas.length - 1
  const paginas = Math.ceil(total / consulta.por)

  return (
    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[900px] text-left'>
          <thead className='bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500'>
            <tr>
              <th className='py-2.5 pl-4 pr-2 font-medium'>Prior.</th>
              <th className='px-3 py-2.5 font-medium'>Empresa</th>
              <th className='px-3 py-2.5 font-medium'>Atividade</th>
              <th className='px-3 py-2.5 font-medium'>Local</th>
              <th className='px-3 py-2.5 font-medium'>Porte e regime</th>
              <th className='px-3 py-2.5 pr-4 font-medium'>Contato</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <Linha key={e.cnpj} e={e} />
            ))}
          </tbody>
        </table>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm'>
        <p className='text-slate-500'>
          Mostrando <strong className='text-slate-700'>{fmtInt(de)}–{fmtInt(ate)}</strong> de{' '}
          <strong className='text-slate-700'>{fmtInt(total)}</strong>
        </p>
        <Paginacao consulta={consulta} paginas={paginas} />
      </div>
    </div>
  )
}

function Linha({ e }: { e: EmpresaLista }) {
  const contador = e.email_tipo === 'Escritório contábil' || e.email_tipo === 'Compartilhado (grupo/terceiro)'
  return (
    <tr className='border-t border-slate-100 align-top transition-colors hover:bg-marca-50/50'>
      <td className='py-3 pl-4 pr-2'>
        <SeloPrioridade prioridade={e.prioridade} score={e.score} />
      </td>
      <td className='max-w-[260px] px-3 py-3'>
        <Link href={`/empresa/${e.cnpj}`} className='line-clamp-2 font-medium text-slate-900 hover:text-marca-700'>
          {e.razao_social}
        </Link>
        {e.nome_fantasia && <p className='truncate text-xs text-slate-500'>{e.nome_fantasia}</p>}
        <p className='mt-0.5 flex items-center gap-2 font-mono text-[11px] text-slate-400'>
          {e.cnpj_formatado}
          {e.tipo_negocio && e.tipo_negocio !== 'Operacional' && (
            <span className='rounded bg-slate-100 px-1 font-sans text-[10px] text-slate-500'>{e.tipo_negocio}</span>
          )}
        </p>
      </td>
      <td className='max-w-[220px] px-3 py-3'>
        <p className='truncate text-xs text-slate-500'>{e.ramo}</p>
        <p className='line-clamp-2 text-sm text-slate-700' title={`${e.cnae_fmt} · ${e.atividade_principal}`}>
          {e.atividade_principal}
        </p>
      </td>
      <td className='px-3 py-3'>
        <p className='text-sm text-slate-700'>{e.municipio}</p>
        <p className='text-xs text-slate-400'>{e.regiao_intermediaria}</p>
      </td>
      <td className='w-[170px] px-3 py-3'>
        <p className='text-sm text-slate-700'>{e.porte ? PORTE_CURTO[e.porte] ?? e.porte : '—'}</p>
        <p className='text-xs text-slate-400'>
          {fmtMoeda(e.capital_social, true)}
          {e.idade_anos != null && ` · ${e.idade_anos} anos`}
          {(e.estabelecimentos_sp ?? 1) > 1 && ` · ${e.estabelecimentos_sp} unid.`}
        </p>
        <p className='mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600'>
          {e.regime}
          <SeloSituacao situacao={e.situacao_regime} />
        </p>
      </td>
      <td className='px-3 py-3 pr-4'>
        <div className='flex flex-col gap-1 text-xs'>
          {e.whatsapp_link && (
            <a
              href={e.whatsapp_link}
              target='_blank'
              rel='noreferrer'
              className='inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100'
            >
              <MessageCircle className='size-3.5' /> {e.whatsapp}
            </a>
          )}
          {e.telefone1 && e.telefone1 !== e.whatsapp && (
            <span className='inline-flex items-center gap-1.5 text-slate-600'>
              <Phone className='size-3.5 text-slate-400' /> {e.telefone1}
            </span>
          )}
          {e.email && (
            <a
              href={`mailto:${e.email}`}
              className={cn('inline-flex max-w-[190px] items-center gap-1.5 hover:underline', contador ? 'text-amber-700' : 'text-marca-700')}
              title={contador ? `${e.email_tipo} — aparece em ${e.empresas_mesmo_email} empresas` : e.email_tipo ?? undefined}
            >
              {contador ? <TriangleAlert className='size-3.5 shrink-0' /> : <Mail className='size-3.5 shrink-0' />}
              <span className='truncate'>{e.email}</span>
            </a>
          )}
          {!e.whatsapp_link && !e.telefone1 && !e.email && <span className='text-slate-400'>sem contato</span>}
        </div>
      </td>
    </tr>
  )
}

function Paginacao({ consulta, paginas }: { consulta: Consulta; paginas: number }) {
  const atual = consulta.pagina
  const href = (p: number) => hrefConsulta({ ...consulta, pagina: p })
  const janela = new Set([1, paginas, atual - 1, atual, atual + 1].filter(p => p >= 1 && p <= paginas))
  const lista = [...janela].sort((a, b) => a - b)
  const botao = 'grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm transition'

  return (
    <nav className='flex items-center gap-1' aria-label='Paginação'>
      {atual > 1 ? (
        <LinkNav href={href(atual - 1)} className={cn(botao, 'text-slate-600 hover:bg-slate-100')} title='Página anterior'>
          <ChevronLeft className='size-4' />
        </LinkNav>
      ) : (
        <span className={cn(botao, 'text-slate-300')}>
          <ChevronLeft className='size-4' />
        </span>
      )}
      {lista.map((p, i) => (
        <span key={p} className='flex items-center gap-1'>
          {i > 0 && p - lista[i - 1] > 1 && <span className='px-1 text-slate-400'>…</span>}
          {p === atual ? (
            <span className={cn(botao, 'bg-marca-800 font-medium text-white')}>{fmtInt(p)}</span>
          ) : (
            <LinkNav href={href(p)} className={cn(botao, 'text-slate-600 hover:bg-slate-100')}>
              {fmtInt(p)}
            </LinkNav>
          )}
        </span>
      ))}
      {atual < paginas ? (
        <LinkNav href={href(atual + 1)} className={cn(botao, 'text-slate-600 hover:bg-slate-100')} title='Próxima página'>
          <ChevronRight className='size-4' />
        </LinkNav>
      ) : (
        <span className={cn(botao, 'text-slate-300')}>
          <ChevronRight className='size-4' />
        </span>
      )}
    </nav>
  )
}

export function ResultadosCarregando() {
  return (
    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
      <div className='h-9 bg-slate-50' />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className='flex gap-4 border-t border-slate-100 px-4 py-4'>
          <div className='size-6 animate-pulse rounded-md bg-slate-100' />
          <div className='flex-1 space-y-2'>
            <div className='h-3.5 w-1/3 animate-pulse rounded bg-slate-100' />
            <div className='h-3 w-1/5 animate-pulse rounded bg-slate-100' />
          </div>
          <div className='h-3.5 w-1/4 animate-pulse rounded bg-slate-100' />
        </div>
      ))}
    </div>
  )
}
