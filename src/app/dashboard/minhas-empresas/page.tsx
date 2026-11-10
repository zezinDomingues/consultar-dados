import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Lock, Mail, MessageCircle, Phone, Search } from 'lucide-react'
import { BotaoLiberar } from '@/components/clientes/liberar'
import { buscarCliente, opcoesCliente, saldoCliente, type EmpresaCliente } from '@/lib/clientes/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { lerDeSearchParams, paraQuery, PORTES, PRIORIDADES, type Filtros } from '@/lib/empresas/filtros'
import { fmtData, fmtInt, fmtMoeda } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Minhas empresas' }

const POR_PAGINA = 25
const ENTRADA = 'h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50 sm:w-auto'
/** Anel de foco só para teclado (Tab), em todo controle. */
const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2'

/** Selo da prioridade (A em dourado com tinta marinho: contraste AA; branco no dourado não passa). */
function Prioridade({ p }: { p: string | null }) {
  if (!p) return null
  return (
    <span
      title={`Prioridade ${p}`}
      className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', p === 'A' ? 'bg-ouro-escuro text-marca-950' : 'bg-slate-100 text-slate-700')}
    >
      <span className='sr-only'>Prioridade </span>
      {p}
    </span>
  )
}

/** Contatos de uma empresa liberada (ou o botão para liberar). */
function Contato({ e, semSaldo, largo }: { e: EmpresaCliente; semSaldo: boolean; largo?: boolean }) {
  if (!e.liberada) return <BotaoLiberar cnpj={e.cnpj} nome={e.nome_fantasia || e.razao_social} semSaldo={semSaldo} largo={largo} />
  return (
    <span className='block min-w-0 space-y-0.5 text-slate-700'>
      {e.whatsapp && (
        <a href={e.whatsapp_link ?? '#'} target='_blank' rel='noreferrer' className={cn('flex items-center gap-1.5 rounded font-medium text-marca-700 hover:underline', FOCO)}>
          <MessageCircle aria-hidden className='size-3.5 shrink-0' /> <span className='sr-only'>WhatsApp </span>
          {e.whatsapp}
        </a>
      )}
      {e.telefone1 && (
        <span className='flex items-center gap-1.5'>
          <Phone aria-hidden className='size-3.5 shrink-0 text-slate-500' /> <span className='sr-only'>Telefone </span>
          {e.telefone1}
        </span>
      )}
      {e.email && (
        <a href={`mailto:${e.email}`} className={cn('flex min-w-0 items-center gap-1.5 rounded hover:underline', FOCO)}>
          <Mail aria-hidden className='size-3.5 shrink-0 text-slate-500' /> <span className='break-all'>{e.email}</span>
        </a>
      )}
      {e.endereco && <span className='block text-[11px] text-slate-500'>{e.endereco}</span>}
      {!e.whatsapp && !e.telefone1 && !e.email && <span className='text-slate-500'>sem contato no cadastro</span>}
    </span>
  )
}

export default async function MinhasEmpresasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await usuarioAtual()
  if (u?.papel !== 'cliente') redirect(ROTAS.dashboard)
  const sp = await searchParams
  const aba = sp.aba === 'liberadas' ? 'liberadas' : 'todas'
  const consulta = lerDeSearchParams(sp)
  const f: Filtros = consulta.filtros
  const [saldo, opcoes] = await Promise.all([saldoCliente(), opcoesCliente()])

  if (!saldo || saldo.vencido || !opcoes) {
    return (
      <div className='grid min-h-[70vh] place-items-center p-6'>
        <div className='max-w-md space-y-3 text-center'>
          <Lock className='mx-auto size-10 text-ouro-escuro' />
          <h1 className='font-serif text-2xl font-bold text-marca-800'>{saldo?.vencido ? 'Seu plano venceu' : 'Seu plano ainda não foi ativado'}</h1>
          <p className='text-sm text-slate-500'>Fale com a OficialCert para {saldo?.vencido ? 'renovar' : 'ativar'} o seu acesso à base de empresas.</p>
        </div>
      </div>
    )
  }

  // ?pagina= já chega inteiro entre 1 e 10.000 (abc e 1e20 viram 1); além do fim, recarrega na última página
  const buscar = (p: number) => buscarCliente(f, aba === 'liberadas' ? 'liberadas' : consulta.ordem, p, POR_PAGINA, aba === 'liberadas')
  let pagina = consulta.pagina
  let { itens, total } = await buscar(pagina)
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  if (pagina > paginas) {
    pagina = paginas
    ;({ itens, total } = await buscar(pagina))
  }
  const href = (mudar: { aba?: string; pagina?: number }) => {
    const q = new URLSearchParams(paraQuery({ filtros: f, ordem: consulta.ordem, pagina: mudar.pagina ?? 1 }))
    const a = mudar.aba ?? aba
    if (a === 'liberadas') q.set('aba', 'liberadas')
    const s = q.toString()
    return s ? `${ROTAS.minhasEmpresas}?${s}` : ROTAS.minhasEmpresas
  }
  const nomeRamo = new Map(opcoes.ramos.map(r => [r.chave, r.nome]))
  const pct = saldo.limite ? Math.min(100, Math.round((saldo.usadas / saldo.limite) * 100)) : 100

  return (
    <div className='space-y-5 p-4 sm:p-6'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='min-w-0 max-w-2xl'>
          <span className='rotulo-secao'>Consulta de dados</span>
          <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Minhas empresas</h1>
          <p className='text-sm text-slate-500'>
            {saldo.ramos.map(r => nomeRamo.get(r) ?? r).join(' · ')} · {saldo.ufs?.join(', ') ?? 'todos os estados disponíveis'}
          </p>
        </div>
        <div className='w-full rounded-2xl border border-ouro/60 bg-white p-4 ring-1 ring-ouro/30 sm:w-auto sm:min-w-[260px]'>
          <p className='text-[10px] font-bold uppercase tracking-[0.14em] text-marca-700'>
            {saldo.modalidade === 'mensal' ? 'Saldo deste mês' : 'Saldo do pacote'}
          </p>
          <p className='mt-1 font-serif text-2xl font-bold text-marca-800'>
            {fmtInt(saldo.saldo)} <span className='text-sm font-normal text-slate-500'>de {fmtInt(saldo.limite)} empresas</span>
          </p>
          <div
            role='progressbar'
            aria-label='Saldo já usado'
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className='mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100'
          >
            <div className='h-full rounded-full bg-ouro-escuro' style={{ width: `${pct}%` }} />
          </div>
          <p className='mt-1.5 text-[11px] text-slate-500'>
            {saldo.modalidade === 'mensal' ? 'Renova todo dia 1º' : 'Cada nova compra soma ao saldo'}
            {saldo.validade ? ` · válido até ${fmtData(saldo.validade)}` : ''}
          </p>
        </div>
      </header>

      <form
        action={ROTAS.minhasEmpresas}
        role='search'
        aria-label='Filtrar empresas'
        className='grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex sm:flex-wrap sm:items-center'
      >
        {aba === 'liberadas' && <input type='hidden' name='aba' value='liberadas' />}
        <span className='relative block'>
          <Search aria-hidden className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500' />
          <input name='q' type='search' defaultValue={f.q} placeholder='Nome ou CNPJ' aria-label='Buscar por nome ou CNPJ' className={cn(ENTRADA, 'pl-8 sm:w-52')} />
        </span>
        {opcoes.ramos.length > 1 && (
          <select name='ramos' defaultValue={f.ramos?.[0] ?? ''} aria-label='Ramo' className={cn(ENTRADA, 'sm:max-w-[230px]')}>
            <option value=''>Todos os meus ramos</option>
            {opcoes.ramos.map(r => (
              <option key={r.chave} value={r.chave}>
                {r.nome}
              </option>
            ))}
          </select>
        )}
        {opcoes.ufs.length > 1 && (
          <select name='ufs' defaultValue={f.ufs?.[0] ?? ''} aria-label='Estado' className={ENTRADA}>
            <option value=''>Todos os estados</option>
            {opcoes.ufs.map(uf => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        )}
        <input name='municipios' list='cidades' defaultValue={f.municipios?.[0] ?? ''} placeholder='Cidade' aria-label='Cidade' className={cn(ENTRADA, 'sm:w-48')} />
        <datalist id='cidades'>
          {opcoes.municipios.slice(0, 1500).map(m => (
            <option key={m.chave} value={m.chave}>
              {m.nome} ({fmtInt(m.n)})
            </option>
          ))}
        </datalist>
        <select name='portes' defaultValue={f.portes?.[0] ?? ''} aria-label='Porte' className={ENTRADA}>
          <option value=''>Qualquer porte</option>
          {PORTES.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name='prioridades' defaultValue={f.prioridades?.[0] ?? ''} aria-label='Prioridade' className={ENTRADA}>
          <option value=''>Qualquer prioridade</option>
          {PRIORIDADES.map(p => (
            <option key={p} value={p}>
              Prioridade {p}
            </option>
          ))}
        </select>
        <div className='flex flex-wrap items-center gap-2'>
          <label className='flex h-9 items-center gap-1.5 text-xs text-slate-600'>
            <input type='checkbox' name='com_whatsapp' value='1' defaultChecked={!!f.com_whatsapp} className='size-4 accent-[#1a2d5a]' /> com WhatsApp
          </label>
          <button className={cn('h-9 rounded-lg bg-marca-800 px-4 text-xs font-semibold text-creme hover:bg-marca-950', FOCO)}>Filtrar</button>
          <Link
            href={aba === 'liberadas' ? `${ROTAS.minhasEmpresas}?aba=liberadas` : ROTAS.minhasEmpresas}
            className={cn('rounded px-1 text-xs text-slate-600 hover:text-marca-700', FOCO)}
          >
            limpar filtros
          </Link>
        </div>
      </form>

      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
        <div className='flex flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-3'>
          <Link
            href={href({ aba: 'todas' })}
            aria-current={aba === 'todas' ? 'page' : undefined}
            className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', FOCO, aba === 'todas' ? 'bg-marca-800 text-creme' : 'text-slate-600 hover:bg-slate-100')}
          >
            Empresas do meu plano
          </Link>
          <Link
            href={href({ aba: 'liberadas' })}
            aria-current={aba === 'liberadas' ? 'page' : undefined}
            className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', FOCO, aba === 'liberadas' ? 'bg-marca-800 text-creme' : 'text-slate-600 hover:bg-slate-100')}
          >
            Liberadas ({fmtInt(saldo.total_liberadas)})
          </Link>
          {saldo.total_liberadas > 0 && (
            <a
              href='/api/cliente/exportar'
              className={cn('ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-marca-300', FOCO)}
            >
              <Download aria-hidden className='size-3.5' /> CSV das liberadas
            </a>
          )}
        </div>

        {/* celular, tablet e notebook pequeno: cartões (o botão de liberar sempre à vista) */}
        <ul className='grid gap-3 p-3 md:grid-cols-2 xl:hidden'>
          {itens.map(e => (
            <li key={e.cnpj} className='flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 p-3'>
              <div className='min-w-0'>
                <p className='flex items-start gap-1.5'>
                  <Prioridade p={e.prioridade} />
                  <span className='min-w-0 break-words font-medium text-slate-800'>{e.razao_social}</span>
                </p>
                {e.nome_fantasia && <p className='break-words text-xs text-slate-600'>{e.nome_fantasia}</p>}
                <p className='font-mono text-[11px] text-slate-500'>{e.cnpj_formatado}</p>
              </div>
              <p className='line-clamp-2 text-xs text-slate-600'>{e.atividade_principal}</p>
              <p className='text-xs text-slate-600'>
                {e.municipio}/{e.uf} · {e.porte}
                <span className='block text-slate-500'>
                  {e.regime} · {fmtMoeda(e.capital_social, true)}
                  {e.idade_anos != null ? ` · ${e.idade_anos} anos` : ''}
                </span>
              </p>
              <div className='mt-auto border-t border-slate-100 pt-2 text-xs'>
                <Contato e={e} semSaldo={saldo.saldo <= 0} largo />
              </div>
            </li>
          ))}
          {itens.length === 0 && (
            <li className='px-4 py-10 text-center text-sm text-slate-500 md:col-span-2'>
              {aba === 'liberadas' ? 'Você ainda não liberou nenhuma empresa.' : 'Nenhuma empresa com esses filtros no seu plano.'}
            </li>
          )}
        </ul>

        {/* computador: tabela */}
        <div className='hidden overflow-x-auto xl:block'>
          <table className='w-full min-w-[980px] text-left text-sm'>
            <thead className='bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500'>
              <tr>
                <th className='px-4 py-2.5 font-medium'>Empresa</th>
                <th className='px-3 py-2.5 font-medium'>Atividade</th>
                <th className='px-3 py-2.5 font-medium'>Local</th>
                <th className='px-3 py-2.5 font-medium'>Porte e regime</th>
                <th className='px-3 py-2.5 font-medium'>Contato</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(e => (
                <tr key={e.cnpj} className='border-t border-slate-100 align-top'>
                  <td className='max-w-[300px] px-4 py-3'>
                    <span className='flex items-center gap-1.5'>
                      <Prioridade p={e.prioridade} />
                      <span className='truncate font-medium text-slate-800' title={e.razao_social}>
                        {e.razao_social}
                      </span>
                    </span>
                    {e.nome_fantasia && <span className='block truncate text-xs text-slate-500'>{e.nome_fantasia}</span>}
                    <span className='block font-mono text-[11px] text-slate-500'>{e.cnpj_formatado}</span>
                  </td>
                  <td className='max-w-[240px] px-3 py-3 text-xs text-slate-600'>
                    <span className='line-clamp-2'>{e.atividade_principal}</span>
                  </td>
                  <td className='px-3 py-3 text-xs text-slate-600'>
                    {e.municipio}/{e.uf}
                  </td>
                  <td className='px-3 py-3 text-xs text-slate-600'>
                    {e.porte}
                    <span className='block text-slate-500'>
                      {e.regime} · {fmtMoeda(e.capital_social, true)}
                      {e.idade_anos != null ? ` · ${e.idade_anos} anos` : ''}
                    </span>
                  </td>
                  <td className='max-w-[260px] px-3 py-3 text-xs'>
                    <Contato e={e} semSaldo={saldo.saldo <= 0} />
                  </td>
                </tr>
              ))}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={5} className='px-4 py-14 text-center text-slate-500'>
                    {aba === 'liberadas' ? 'Você ainda não liberou nenhuma empresa.' : 'Nenhuma empresa com esses filtros no seu plano.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav aria-label='Páginas' className='flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600'>
          <span>
            {fmtInt(total)} {total === 1 ? 'empresa' : 'empresas'} · página {fmtInt(pagina)} de {fmtInt(paginas)}
          </span>
          <div className='flex gap-1'>
            {pagina > 1 && (
              <Link href={href({ pagina: pagina - 1 })} aria-label='Página anterior' className={cn('grid size-9 place-items-center rounded-md hover:bg-slate-100', FOCO)}>
                <ChevronLeft aria-hidden className='size-4' />
              </Link>
            )}
            {pagina < paginas && (
              <Link href={href({ pagina: pagina + 1 })} aria-label='Próxima página' className={cn('grid size-9 place-items-center rounded-md hover:bg-slate-100', FOCO)}>
                <ChevronRight aria-hidden className='size-4' />
              </Link>
            )}
          </div>
        </nav>
      </div>
    </div>
  )
}
