import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Lock, Mail, MessageCircle, Phone, Search } from 'lucide-react'
import { BotaoLiberar } from '@/components/clientes/liberar'
import { buscarCliente, opcoesCliente, saldoCliente } from '@/lib/clientes/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { lerDeSearchParams, paraQuery, PORTES, PRIORIDADES, type Filtros } from '@/lib/empresas/filtros'
import { fmtData, fmtInt, fmtMoeda } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Minhas empresas' }

const POR_PAGINA = 25
const ENTRADA = 'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-marca-400'

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

  const { itens, total } = await buscarCliente(f, aba === 'liberadas' ? 'liberadas' : consulta.ordem, consulta.pagina, POR_PAGINA, aba === 'liberadas')
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
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
    <div className='space-y-5 p-6'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='max-w-2xl'>
          <span className='rotulo-secao'>Consulta de dados</span>
          <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Minhas empresas</h1>
          <p className='text-sm text-slate-500'>
            {saldo.ramos.map(r => nomeRamo.get(r) ?? r).join(' · ')} · {saldo.ufs?.join(', ') ?? 'todos os estados disponíveis'}
          </p>
        </div>
        <div className='min-w-[260px] rounded-2xl border border-ouro/60 bg-white p-4 ring-1 ring-ouro/30'>
          <p className='text-[10px] font-bold uppercase tracking-[0.14em] text-ouro-escuro'>
            {saldo.modalidade === 'mensal' ? 'Saldo deste mês' : 'Saldo do pacote'}
          </p>
          <p className='mt-1 font-serif text-2xl font-bold text-marca-800'>
            {fmtInt(saldo.saldo)} <span className='text-sm font-normal text-slate-400'>de {fmtInt(saldo.limite)} empresas</span>
          </p>
          <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100'>
            <div className='h-full rounded-full bg-ouro-escuro' style={{ width: `${pct}%` }} />
          </div>
          <p className='mt-1.5 text-[11px] text-slate-400'>
            {saldo.modalidade === 'mensal' ? 'Renova todo dia 1º' : 'Cada nova compra soma ao saldo'}
            {saldo.validade ? ` · válido até ${fmtData(saldo.validade)}` : ''}
          </p>
        </div>
      </header>

      <form action={ROTAS.minhasEmpresas} className='flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3'>
        {aba === 'liberadas' && <input type='hidden' name='aba' value='liberadas' />}
        <span className='relative'>
          <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
          <input name='q' defaultValue={f.q} placeholder='Nome ou CNPJ' className={cn(ENTRADA, 'w-52 pl-8')} />
        </span>
        {opcoes.ramos.length > 1 && (
          <select name='ramos' defaultValue={f.ramos?.[0] ?? ''} className={cn(ENTRADA, 'max-w-[230px]')}>
            <option value=''>Todos os meus ramos</option>
            {opcoes.ramos.map(r => (
              <option key={r.chave} value={r.chave}>
                {r.nome}
              </option>
            ))}
          </select>
        )}
        {opcoes.ufs.length > 1 && (
          <select name='ufs' defaultValue={f.ufs?.[0] ?? ''} className={ENTRADA}>
            <option value=''>Todos os estados</option>
            {opcoes.ufs.map(uf => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        )}
        <input name='municipios' list='cidades' defaultValue={f.municipios?.[0] ?? ''} placeholder='Cidade' className={cn(ENTRADA, 'w-48')} />
        <datalist id='cidades'>
          {opcoes.municipios.slice(0, 1500).map(m => (
            <option key={m.chave} value={m.chave}>
              {m.nome} ({fmtInt(m.n)})
            </option>
          ))}
        </datalist>
        <select name='portes' defaultValue={f.portes?.[0] ?? ''} className={ENTRADA}>
          <option value=''>Qualquer porte</option>
          {PORTES.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name='prioridades' defaultValue={f.prioridades?.[0] ?? ''} className={ENTRADA}>
          <option value=''>Qualquer prioridade</option>
          {PRIORIDADES.map(p => (
            <option key={p} value={p}>
              Prioridade {p}
            </option>
          ))}
        </select>
        <label className='flex items-center gap-1.5 text-xs text-slate-600'>
          <input type='checkbox' name='com_whatsapp' value='1' defaultChecked={!!f.com_whatsapp} className='size-4 accent-[#1a2d5a]' /> com WhatsApp
        </label>
        <button className='h-9 rounded-lg bg-marca-800 px-4 text-xs font-semibold text-creme hover:bg-marca-950'>Filtrar</button>
        <Link href={aba === 'liberadas' ? `${ROTAS.minhasEmpresas}?aba=liberadas` : ROTAS.minhasEmpresas} className='px-1 text-xs text-slate-500 hover:text-marca-700'>
          limpar
        </Link>
      </form>

      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
        <div className='flex flex-wrap items-center gap-1 border-b border-slate-100 px-4 py-3'>
          <Link href={href({ aba: 'todas' })} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', aba === 'todas' ? 'bg-marca-800 text-creme' : 'text-slate-600 hover:bg-slate-100')}>
            Empresas do meu plano
          </Link>
          <Link href={href({ aba: 'liberadas' })} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', aba === 'liberadas' ? 'bg-marca-800 text-creme' : 'text-slate-600 hover:bg-slate-100')}>
            Liberadas ({fmtInt(saldo.total_liberadas)})
          </Link>
          {saldo.total_liberadas > 0 && (
            <a href='/api/cliente/exportar' className='ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-marca-300'>
              <Download className='size-3.5' /> CSV das liberadas
            </a>
          )}
        </div>
        <div className='overflow-x-auto'>
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
                      {e.prioridade && (
                        <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold', e.prioridade === 'A' ? 'bg-ouro-escuro text-white' : 'bg-slate-100 text-slate-600')}>
                          {e.prioridade}
                        </span>
                      )}
                      <span className='truncate font-medium text-slate-800'>{e.razao_social}</span>
                    </span>
                    {e.nome_fantasia && <span className='block truncate text-xs text-slate-500'>{e.nome_fantasia}</span>}
                    <span className='block font-mono text-[11px] text-slate-400'>{e.cnpj_formatado}</span>
                  </td>
                  <td className='max-w-[240px] px-3 py-3 text-xs text-slate-600'>
                    <span className='line-clamp-2'>{e.atividade_principal}</span>
                  </td>
                  <td className='px-3 py-3 text-xs text-slate-600'>
                    {e.municipio}/{e.uf}
                  </td>
                  <td className='px-3 py-3 text-xs text-slate-600'>
                    {e.porte}
                    <span className='block text-slate-400'>
                      {e.regime} · {fmtMoeda(e.capital_social, true)}
                      {e.idade_anos != null ? ` · ${e.idade_anos} anos` : ''}
                    </span>
                  </td>
                  <td className='px-3 py-3 text-xs'>
                    {e.liberada ? (
                      <span className='space-y-0.5 text-slate-700'>
                        {e.whatsapp && (
                          <a href={e.whatsapp_link ?? '#'} target='_blank' rel='noreferrer' className='flex items-center gap-1.5 text-emerald-700 hover:underline'>
                            <MessageCircle className='size-3.5' /> {e.whatsapp}
                          </a>
                        )}
                        {e.telefone1 && (
                          <span className='flex items-center gap-1.5'>
                            <Phone className='size-3.5 text-slate-400' /> {e.telefone1}
                          </span>
                        )}
                        {e.email && (
                          <a href={`mailto:${e.email}`} className='flex items-center gap-1.5 hover:underline'>
                            <Mail className='size-3.5 text-slate-400' /> {e.email}
                          </a>
                        )}
                        {e.endereco && <span className='block text-[11px] text-slate-400'>{e.endereco}</span>}
                        {!e.whatsapp && !e.telefone1 && !e.email && <span className='text-slate-400'>sem contato no cadastro</span>}
                      </span>
                    ) : (
                      <BotaoLiberar cnpj={e.cnpj} semSaldo={saldo.saldo <= 0} />
                    )}
                  </td>
                </tr>
              ))}
              {itens.length === 0 && (
                <tr>
                  <td colSpan={5} className='px-4 py-14 text-center text-slate-400'>
                    {aba === 'liberadas' ? 'Você ainda não liberou nenhuma empresa.' : 'Nenhuma empresa com esses filtros no seu plano.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className='flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500'>
          <span>
            {fmtInt(total)} empresas · página {fmtInt(consulta.pagina)} de {fmtInt(paginas)}
          </span>
          <div className='flex gap-1'>
            {consulta.pagina > 1 && (
              <Link href={href({ pagina: consulta.pagina - 1 })} className='grid size-8 place-items-center rounded-md hover:bg-slate-100'>
                <ChevronLeft className='size-4' />
              </Link>
            )}
            {consulta.pagina < paginas && (
              <Link href={href({ pagina: consulta.pagina + 1 })} className='grid size-8 place-items-center rounded-md hover:bg-slate-100'>
                <ChevronRight className='size-4' />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
