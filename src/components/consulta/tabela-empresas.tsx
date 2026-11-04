import Link from 'next/link'
import { Mail, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { PORTE_CURTO, SeloPrioridade, SeloSituacao } from './selos'
import type { EmpresaLista } from '@/lib/empresas/tipos'
import { fmtMoeda } from '@/lib/formatar'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

// Tabela de empresas da Consulta. Componente puro (sem busca de dados): a página
// de Consulta (servidor) e o chat do agente (navegador) desenham a mesma tabela.
export function TabelaEmpresas({ empresas }: { empresas: EmpresaLista[] }) {
  return (
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
              <LinhaEmpresa key={e.cnpj} e={e} />
            ))}
          </tbody>
        </table>
    </div>
  )
}

export function LinhaEmpresa({ e }: { e: EmpresaLista }) {
  const contador = e.email_tipo === 'Escritório contábil' || e.email_tipo === 'Compartilhado (grupo/terceiro)'
  return (
    <tr className='border-t border-slate-100 align-top transition-colors hover:bg-marca-50/50'>
      <td className='py-3 pl-4 pr-2'>
        <SeloPrioridade prioridade={e.prioridade} score={e.score} />
      </td>
      <td className='max-w-[260px] px-3 py-3'>
        <Link href={ROTAS.empresa(e.cnpj)} className='line-clamp-2 font-medium text-slate-900 hover:text-marca-700'>
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

