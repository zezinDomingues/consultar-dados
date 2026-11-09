import Link from 'next/link'
import { Mail, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { PORTE_CURTO, SeloPrioridade, SeloSituacao } from './selos'
import { FOCO } from '@/components/ui/foco'
import type { EmpresaLista } from '@/lib/empresas/tipos'
import { fmtMoeda } from '@/lib/formatar'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

// Tabela de empresas da Consulta. Componente puro (sem busca de dados): a página de Consulta (servidor) e o chat
// do agente (navegador) desenham a mesma lista. Responde à LARGURA DO CONTÊINER (container queries), não da tela:
//   < 672 px  → um cartão por empresa (celular, coluna do agente no tablet)
//   ≥ 672 px  → tabela de layout fixo que cabe sem rolar; prioridade e local entram na coluna Empresa
//   ≥ 1024 px → colunas próprias de Prioridade e Local
// Textos longos ficam em 1 linha com reticências e o texto inteiro no title.

const ehContador = (e: EmpresaLista) =>
  e.email_tipo === 'Escritório contábil' || e.email_tipo === 'Compartilhado (grupo/terceiro)'

const telefoneExtra = (e: EmpresaLista) => (e.telefone1 && e.telefone1 !== e.whatsapp ? e.telefone1 : null)

const tituloEmail = (e: EmpresaLista) =>
  ehContador(e)
    ? `E-mail ${e.email} — ${e.email_tipo}, aparece em ${e.empresas_mesmo_email} empresas`
    : `E-mail ${e.email}${e.email_tipo ? ` (${e.email_tipo})` : ''}`

function detalhesTamanho(e: EmpresaLista) {
  return [
    fmtMoeda(e.capital_social, true),
    e.idade_anos != null ? `${e.idade_anos} anos` : null,
    (e.estabelecimentos_uf ?? 1) > 1 ? `${e.estabelecimentos_uf} unid.` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

export function TabelaEmpresas({ empresas }: { empresas: EmpresaLista[] }) {
  return (
    <div className='@container'>
      <ul className='divide-y divide-slate-100 @2xl:hidden'>
        {empresas.map(e => (
          <CartaoLinha key={e.cnpj} e={e} />
        ))}
      </ul>

      <div className='hidden overflow-x-auto @2xl:block'>
        <table className='w-full table-fixed text-left'>
          <thead className='bg-slate-50 text-[10px] uppercase tracking-[0.14em] text-marca-800/75'>
            <tr>
              <th scope='col' className='hidden w-[76px] py-2.5 pl-4 pr-2 font-bold @5xl:table-cell'>
                Prior.
              </th>
              <th scope='col' className='py-2.5 pl-4 pr-3 font-bold @5xl:pl-3'>
                Empresa
              </th>
              <th scope='col' className='w-[24%] px-3 py-2.5 font-bold @5xl:w-[22%]'>
                Atividade
              </th>
              <th scope='col' className='hidden w-[14%] px-3 py-2.5 font-bold @5xl:table-cell'>
                Local
              </th>
              <th scope='col' className='w-[25%] px-3 py-2.5 font-bold @5xl:w-[21%]'>
                Porte e regime
              </th>
              <th scope='col' className='w-[136px] py-2.5 pl-3 pr-4 font-bold'>
                Contato
              </th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <LinhaEmpresa key={e.cnpj} e={e} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function LinhaEmpresa({ e }: { e: EmpresaLista }) {
  const local = `${e.municipio ?? '—'}/${e.uf}`
  const tamanho = detalhesTamanho(e)
  return (
    <tr className='border-t border-slate-100 align-top transition-colors hover:bg-marca-50/50'>
      <td className='hidden py-2.5 pl-4 pr-2 @5xl:table-cell'>
        <SeloPrioridade prioridade={e.prioridade} score={e.score} />
      </td>
      <td className='py-2.5 pl-4 pr-3 @5xl:pl-3'>
        <div className='flex min-w-0 gap-2.5'>
          <span className='shrink-0 @5xl:hidden' title={`Prioridade ${e.prioridade} · score ${e.score}/100`}>
            <SeloPrioridade prioridade={e.prioridade} />
          </span>
          <div className='min-w-0'>
            <Link
              href={ROTAS.empresa(e.cnpj)}
              title={e.nome_fantasia ? `${e.razao_social} (${e.nome_fantasia})` : e.razao_social}
              className={cn(
                'line-clamp-2 rounded-sm text-[13.5px] font-semibold leading-snug text-marca-800 hover:text-marca-600 hover:underline hover:decoration-ouro/60 hover:underline-offset-4',
                FOCO
              )}
            >
              {e.razao_social}
            </Link>
            {e.nome_fantasia && <p className='truncate text-xs text-slate-500'>{e.nome_fantasia}</p>}
            <p className='mt-0.5 truncate text-[11px] text-slate-500'>
              <span className='font-mono'>{e.cnpj_formatado}</span>
              {e.tipo_negocio && e.tipo_negocio !== 'Operacional' && (
                <span className='ml-1.5 rounded bg-slate-100 px-1 text-[10px]'>{e.tipo_negocio}</span>
              )}
              <span className='@5xl:hidden'> · {local}</span>
            </p>
          </div>
        </div>
      </td>
      <td className='px-3 py-2.5'>
        <p className='truncate text-xs text-slate-500' title={e.ramo ?? undefined}>
          {e.ramo}
        </p>
        <p className='truncate text-[13px] text-slate-700' title={`${e.cnae_fmt} · ${e.atividade_principal}`}>
          {e.atividade_principal}
        </p>
      </td>
      <td className='hidden px-3 py-2.5 @5xl:table-cell'>
        <p className='truncate text-[13px] text-slate-700' title={local}>
          {local}
        </p>
        <p className='truncate text-xs text-slate-500' title={e.regiao_intermediaria ?? undefined}>
          {e.regiao_intermediaria}
        </p>
      </td>
      <td className='px-3 py-2.5'>
        <div className='flex flex-wrap items-center gap-1'>
          <ChipsPorteRegime e={e} />
        </div>
        <p className='mt-1 truncate text-xs text-slate-500' title={tamanho}>
          {tamanho}
        </p>
      </td>
      <td className='py-2.5 pl-3 pr-4'>
        <ContatoIcones e={e} />
      </td>
    </tr>
  )
}

function ChipsPorteRegime({ e }: { e: EmpresaLista }) {
  return (
    <>
      <span className='whitespace-nowrap rounded bg-marca-50 px-1.5 py-0.5 text-[11px] font-semibold text-marca-800 ring-1 ring-inset ring-marca-100'>
        {e.porte ? PORTE_CURTO[e.porte] ?? e.porte : '—'}
      </span>
      {e.regime && (
        <span className='whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700'>{e.regime}</span>
      )}
      <SeloSituacao situacao={e.situacao_regime} />
    </>
  )
}

const ICONE = cn('grid size-8 shrink-0 place-items-center rounded-lg transition', FOCO)

/** Contato em ícones (o número/e-mail vai no aria-label e no title). Vaga vazia mantém as colunas alinhadas. */
function ContatoIcones({ e }: { e: EmpresaLista }) {
  const contador = ehContador(e)
  const tel = telefoneExtra(e)
  const vaga = <span aria-hidden className='size-8 shrink-0' />
  if (!e.whatsapp_link && !tel && !e.email) return <span className='text-xs text-slate-500'>sem contato</span>
  return (
    <div className='flex items-center gap-1'>
      {e.whatsapp_link ? (
        <a
          href={e.whatsapp_link}
          target='_blank'
          rel='noreferrer'
          aria-label={`WhatsApp ${e.whatsapp}`}
          title={`WhatsApp ${e.whatsapp}`}
          className={cn(ICONE, 'bg-marca-800 text-creme hover:bg-marca-950')}
        >
          <MessageCircle className='size-4' aria-hidden />
        </a>
      ) : (
        vaga
      )}
      {tel ? (
        <a
          href={`tel:+55${tel.replace(/\D/g, '')}`}
          aria-label={`Telefone ${tel}`}
          title={`Telefone ${tel}`}
          className={cn(ICONE, 'border border-slate-200 bg-white text-slate-600 hover:border-marca-300 hover:text-marca-800')}
        >
          <Phone className='size-4' aria-hidden />
        </a>
      ) : (
        vaga
      )}
      {e.email ? (
        <a
          href={`mailto:${e.email}`}
          aria-label={tituloEmail(e)}
          title={tituloEmail(e)}
          className={cn(
            ICONE,
            'border bg-white',
            contador
              ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
              : 'border-slate-200 text-marca-700 hover:border-marca-300 hover:text-marca-800'
          )}
        >
          {contador ? <TriangleAlert className='size-4' aria-hidden /> : <Mail className='size-4' aria-hidden />}
        </a>
      ) : (
        vaga
      )}
    </div>
  )
}

const BOTAO_CARTAO = cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition', FOCO)

/** Celular: a mesma empresa em cartão, com botões de contato grandes para o toque. */
function CartaoLinha({ e }: { e: EmpresaLista }) {
  const contador = ehContador(e)
  const tel = telefoneExtra(e)
  const tamanho = detalhesTamanho(e)
  return (
    <li className='flex gap-3 px-4 py-4'>
      <span className='shrink-0 pt-0.5' title={`Prioridade ${e.prioridade} · score ${e.score}/100`}>
        <SeloPrioridade prioridade={e.prioridade} />
      </span>
      <div className='min-w-0 flex-1 space-y-1.5'>
        <div>
          <Link
            href={ROTAS.empresa(e.cnpj)}
            className={cn('line-clamp-2 rounded-sm font-semibold leading-snug text-marca-800 hover:underline', FOCO)}
          >
            {e.razao_social}
          </Link>
          {e.nome_fantasia && <p className='truncate text-xs text-slate-500'>{e.nome_fantasia}</p>}
          <p className='truncate text-[11px] text-slate-500'>
            <span className='font-mono'>{e.cnpj_formatado}</span> · score {e.score}
          </p>
        </div>
        <p className='line-clamp-2 text-[13px] text-slate-700' title={`${e.cnae_fmt} · ${e.atividade_principal}`}>
          {e.atividade_principal}
        </p>
        <p className='truncate text-xs text-slate-500'>
          {e.municipio}/{e.uf}
          {e.regiao_intermediaria && ` · ${e.regiao_intermediaria}`}
        </p>
        <div className='flex flex-wrap items-center gap-1'>
          <ChipsPorteRegime e={e} />
          <span className='text-xs text-slate-500'>{tamanho}</span>
        </div>
        {e.whatsapp_link || tel || e.email ? (
          <div className='flex flex-wrap gap-2 pt-1'>
            {e.whatsapp_link && (
              <a
                href={e.whatsapp_link}
                target='_blank'
                rel='noreferrer'
                aria-label={`WhatsApp ${e.whatsapp}`}
                className={cn(BOTAO_CARTAO, 'bg-marca-800 text-creme hover:bg-marca-950')}
              >
                <MessageCircle className='size-4' aria-hidden /> WhatsApp
              </a>
            )}
            {tel && (
              <a
                href={`tel:+55${tel.replace(/\D/g, '')}`}
                aria-label={`Telefone ${tel}`}
                className={cn(BOTAO_CARTAO, 'border border-slate-200 bg-white text-slate-700 hover:border-marca-300')}
              >
                <Phone className='size-4' aria-hidden /> Ligar
              </a>
            )}
            {e.email && (
              <a
                href={`mailto:${e.email}`}
                aria-label={tituloEmail(e)}
                title={tituloEmail(e)}
                className={cn(
                  BOTAO_CARTAO,
                  'border bg-white',
                  contador ? 'border-amber-200 text-amber-800' : 'border-slate-200 text-marca-700 hover:border-marca-300'
                )}
              >
                {contador ? <TriangleAlert className='size-4' aria-hidden /> : <Mail className='size-4' aria-hidden />}
                E-mail
              </a>
            )}
          </div>
        ) : (
          <p className='text-xs text-slate-500'>Sem contato válido no cadastro</p>
        )}
      </div>
    </li>
  )
}
