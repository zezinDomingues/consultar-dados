import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, ChevronLeft, ChevronRight, ExternalLink, Inbox, Mail, MessageCircle, Phone, Search } from 'lucide-react'
import { FOCO } from '@/components/ui/foco'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { fmtDataHora, fmtInt, fmtRelativo } from '@/lib/formatar'
import { lerFiltroLeads, listarLeads, resumoLeads, type Lead } from '@/lib/leads/dados'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'
import { mascaraFone } from '@/lib/validar-contato'

export const metadata: Metadata = { title: 'Leads do site' }

const SEGMENTO: Record<string, string> = {
  varejo: 'Varejo',
  industria: 'Indústria',
  agro: 'Agronegócio',
  servicos: 'Serviços',
  ecommerce: 'E-commerce',
  'terceiro-setor': 'Terceiro Setor',
  contabilidade: 'Contabilidade',
  advocacia: 'Advocacia',
  consultoria: 'Consultoria',
  financeiro: 'Financeiro',
  outro: 'Outro'
}
// de onde veio o envio (data-origem dos formulários do site)
const ORIGEM: Record<string, string> = {
  site_contato: 'Fale com um especialista',
  site_contato_home: 'Formulário da página inicial',
  site_parceiro: 'Seja um parceiro'
}

const CANAL: Record<string, string> = { instagram: 'Instagram', linkedin: 'LinkedIn', whatsapp: 'WhatsApp' }
/** "site_contato_instagram" → "Fale com um especialista · via Instagram" */
function rotuloOrigem(l: Lead) {
  const o = l.origem ?? ''
  const canal = Object.keys(CANAL).find(c => o.endsWith(`_${c}`))
  const base = canal ? o.slice(0, -(canal.length + 1)) : o
  const nome = ORIGEM[base] ?? (l.tipo === 'parceiro' ? 'Seja um parceiro' : 'Formulário do site')
  return canal ? `${nome} · via ${CANAL[canal]}` : nome
}

const mascaraCnpj = (c: string) =>
  c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c

/** Link do WhatsApp para responder a pessoa, já com uma saudação. */
function linkWhats(l: Lead) {
  const d = (l.whatsapp ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  const primeiro = l.nome.trim().split(/\s+/)[0] ?? ''
  const texto = `Olá, ${primeiro}! Aqui é da OficialCert. Recebemos seu contato pelo site e gostaríamos de conversar.`
  return `https://wa.me/55${d}?text=${encodeURIComponent(texto)}`
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.dashboard)
  const f = lerFiltroLeads(await searchParams)
  const [lista, resumo] = await Promise.all([listarLeads(f), resumoLeads()])
  const { itens, total, pagina, paginas } = lista
  const href = (mudar: Partial<typeof f>) => {
    const p = new URLSearchParams()
    const v = { ...f, pagina, ...mudar }
    if (v.q) p.set('q', v.q)
    if (v.tipo) p.set('tipo', v.tipo)
    if (v.pagina > 1) p.set('pagina', String(v.pagina))
    const s = p.toString()
    return s ? `${ROTAS.leads}?${s}` : ROTAS.leads
  }
  const filtrando = !!(f.q || f.tipo)

  return (
    <div className='space-y-5 p-4 sm:p-6'>
      <header className='max-w-2xl'>
        <span className='rotulo-secao'>Administrativo</span>
        <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Leads do site</h1>
        <p className='text-sm text-slate-500'>
          Quem preencheu &ldquo;Fale com um especialista&rdquo;, o formulário da página inicial ou &ldquo;Seja um parceiro&rdquo; no
          site. O mais recente fica no topo.
        </p>
      </header>

      <section aria-label='Resumo' className='grid grid-cols-3 gap-3 sm:max-w-xl'>
        {[
          ['Hoje', resumo.hoje],
          ['Últimos 7 dias', resumo.semana],
          [filtrando ? 'Neste filtro' : 'No total', total]
        ].map(([rotulo, n]) => (
          <div key={rotulo} className='rounded-2xl border border-slate-200 bg-white px-4 py-3'>
            <div className='text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500'>{rotulo}</div>
            <div className='font-serif text-2xl font-bold text-marca-800'>{fmtInt(n as number)}</div>
          </div>
        ))}
      </section>

      <form method='get' action={ROTAS.leads} className='flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4'>
        <label className='min-w-0 flex-1 basis-60'>
          <span className='mb-1 block text-xs font-semibold text-slate-600'>Buscar</span>
          <span className='relative block'>
            <Search aria-hidden className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500' />
            <input
              name='q'
              defaultValue={f.q}
              maxLength={80}
              placeholder='Nome, empresa, e-mail, WhatsApp ou CNPJ'
              className={cn('h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm', FOCO)}
            />
          </span>
        </label>
        <label className='w-full sm:w-auto'>
          <span className='mb-1 block text-xs font-semibold text-slate-600'>Formulário</span>
          <select name='tipo' defaultValue={f.tipo} className={cn('h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:w-48', FOCO)}>
            <option value=''>Todos</option>
            <option value='contato'>Fale com um especialista</option>
            <option value='parceiro'>Seja um parceiro</option>
          </select>
        </label>
        <button type='submit' className={cn('h-10 rounded-lg bg-marca-800 px-4 text-sm font-semibold text-white hover:bg-marca-900', FOCO)}>
          Filtrar
        </button>
        {filtrando && (
          <Link href={ROTAS.leads} className={cn('h-10 rounded-lg px-3 text-sm leading-10 text-slate-600 hover:bg-slate-100', FOCO)}>
            Limpar
          </Link>
        )}
      </form>

      {itens.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center'>
          <Inbox aria-hidden className='mx-auto size-9 text-slate-400' />
          <p className='mt-3 font-semibold text-marca-800'>{filtrando ? 'Nenhum lead com esse filtro.' : 'Nenhum lead ainda.'}</p>
          <p className='mt-1 text-sm text-slate-500'>
            {filtrando ? 'Mude a busca ou limpe os filtros.' : 'Quando alguém enviar um formulário do site, ele aparece aqui.'}
          </p>
        </div>
      ) : (
        <section aria-label='Leads' className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
          <ul className='divide-y divide-slate-100'>
            {itens.map(l => {
              const whats = linkWhats(l)
              return (
                <li key={l.id} className='grid gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:gap-6'>
                  <div className='min-w-0 space-y-1.5'>
                    <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                      <h2 className='break-words text-base font-semibold text-marca-900'>{l.nome}</h2>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          l.tipo === 'parceiro' ? 'bg-ouro/35 text-marca-950' : 'bg-marca-100 text-marca-900'
                        )}
                      >
                        {l.tipo === 'parceiro' ? 'Quer ser parceiro' : 'Quer falar com especialista'}
                      </span>
                      {l.segmento && (
                        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>
                          {SEGMENTO[l.segmento] ?? l.segmento}
                        </span>
                      )}
                    </div>
                    {(l.empresa || l.cnpj) && (
                      <p className='flex flex-wrap items-center gap-x-2 text-sm text-slate-700'>
                        <Building2 aria-hidden className='size-4 shrink-0 text-slate-500' />
                        {l.empresa && <span className='break-words'>{l.empresa}</span>}
                        {l.cnpj &&
                          (/^\d{14}$/.test(l.cnpj) ? (
                            <Link href={ROTAS.empresa(l.cnpj)} className={cn('font-mono text-xs text-marca-700 underline-offset-2 hover:underline', FOCO)}>
                              CNPJ {mascaraCnpj(l.cnpj)}
                            </Link>
                          ) : (
                            <span className='font-mono text-xs text-slate-600'>CNPJ {l.cnpj}</span>
                          ))}
                      </p>
                    )}
                    {l.mensagem && (
                      <p className='whitespace-pre-line break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700'>{l.mensagem}</p>
                    )}
                    <p className='text-xs text-slate-500'>
                      <time dateTime={l.criado_em} title={fmtDataHora(l.criado_em)}>
                        {fmtDataHora(l.criado_em)} · {fmtRelativo(l.criado_em)}
                      </time>
                      {' · '}
                      {rotuloOrigem(l)}
                      {l.pagina && l.pagina !== '/' && <> · página {l.pagina}</>}
                    </p>
                  </div>

                  <div className='flex min-w-0 flex-col gap-2 lg:items-stretch'>
                    {whats && (
                      <a
                        href={whats}
                        target='_blank'
                        rel='noopener noreferrer'
                        className={cn('flex items-center gap-2 rounded-lg bg-marca-800 px-3 py-2 text-sm font-semibold text-white hover:bg-marca-900', FOCO)}
                      >
                        <MessageCircle aria-hidden className='size-4 shrink-0 text-ouro' />
                        <span className='min-w-0 flex-1'>WhatsApp {mascaraFone(l.whatsapp!.replace(/\D/g, ''))}</span>
                        <ExternalLink aria-hidden className='size-3.5 shrink-0 opacity-70' />
                      </a>
                    )}
                    {!whats && l.whatsapp && (
                      <span className='flex items-center gap-2 text-sm text-slate-700'>
                        <Phone aria-hidden className='size-4 text-slate-500' /> {l.whatsapp}
                      </span>
                    )}
                    {l.email && (
                      <a
                        href={`mailto:${l.email}`}
                        className={cn('flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-marca-800 hover:bg-slate-50', FOCO)}
                      >
                        <Mail aria-hidden className='size-4 shrink-0 text-slate-500' />
                        <span className='min-w-0 break-all'>{l.email}</span>
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <nav aria-label='Páginas' className='flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-600'>
            <span>
              {fmtInt(total)} {total === 1 ? 'lead' : 'leads'} · página {fmtInt(pagina)} de {fmtInt(paginas)}
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
        </section>
      )}
    </div>
  )
}
