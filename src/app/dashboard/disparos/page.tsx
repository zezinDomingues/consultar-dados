import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BellRing,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  Hand,
  MailX,
  MessageCircleReply,
  Search,
  Send,
  TriangleAlert
} from 'lucide-react'
import { SeloStatus } from '@/components/disparos/selos'
import { dentroDaJanela } from '@/lib/disparos/config'
import {
  disparosPorRamo,
  lerConfig,
  listarDisparos,
  listarGrupos,
  listarNumeros,
  nomesCampanhas,
  resumoDisparos,
  type ConsultaDisparos
} from '@/lib/disparos/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { fmtCnpj, fmtFone } from '@/lib/disparos/mensagens'
import { GRUPOS, type Grupo, type ResumoDisparos } from '@/lib/disparos/tipos'
import { fmtDataHora, fmtInt, fmtPct, fmtRelativo } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Painel' }

const POR_PAGINA = 50

function lerConsulta(sp: Record<string, string | undefined>): ConsultaDisparos {
  const grupo = (sp.grupo && sp.grupo in GRUPOS ? sp.grupo : 'todos') as Grupo
  return {
    grupo,
    campanha: Number(sp.campanha) || undefined,
    ramo: sp.ramo && /^(\d{2}|\?\?)$/.test(sp.ramo) ? sp.ramo : undefined,
    grupoId: Number(sp.gr) || undefined,
    q: sp.q?.trim() || undefined,
    pagina: Math.max(1, parseInt(sp.pagina ?? '1', 10) || 1),
    por: POR_PAGINA
  }
}

function href(c: Partial<ConsultaDisparos>) {
  const p = new URLSearchParams()
  if (c.grupo && c.grupo !== 'todos') p.set('grupo', c.grupo)
  if (c.campanha) p.set('campanha', String(c.campanha))
  if (c.ramo) p.set('ramo', c.ramo)
  if (c.grupoId) p.set('gr', String(c.grupoId))
  if (c.q) p.set('q', c.q)
  if (c.pagina && c.pagina > 1) p.set('pagina', String(c.pagina))
  const q = p.toString()
  return q ? `${ROTAS.disparos}?${q}` : ROTAS.disparos
}

export default async function PainelDisparos({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const c = lerConsulta(await searchParams)
  const [resumo, lista, campanhasTodas, numerosTodos, cfg, ramos, u, grupos] = await Promise.all([
    resumoDisparos(c.campanha, c.ramo, c.grupoId),
    listarDisparos(c),
    nomesCampanhas(),
    listarNumeros(),
    lerConfig(),
    disparosPorRamo(c.campanha, c.grupoId),
    usuarioAtual(),
    listarGrupos()
  ])
  // com um grupo escolhido, avisos, números e campanhas são só dele
  const campanhas = c.grupoId ? campanhasTodas.filter(x => x.grupo_id === c.grupoId) : campanhasTodas
  const numeros = c.grupoId ? numerosTodos.filter(n => n.grupo_id === c.grupoId) : numerosTodos
  const admin = !!u?.admin
  const nomeCampanha = new Map(campanhasTodas.map(x => [x.id, x.nome]))
  const nomeGrupo = new Map(grupos.map(g => [g.id, g.nome]))
  const paginas = Math.max(1, Math.ceil(lista.total / POR_PAGINA))

  // ---- avisos: o que impede (ou vai impedir) os envios agora ----
  const avisos: { texto: React.ReactNode; grave?: boolean }[] = []
  if (!admin && !ramos.length)
    avisos.push({ texto: 'Você ainda não tem ramos para responder. Peça ao administrador para atribuir (Usuários).' })
  const ativos = numeros.filter(n => n.ativo)
  if (!numeros.length)
    avisos.push({
      texto: (
        <>
          Nenhum número cadastrado.{' '}
          <Link className='underline' href={ROTAS.numeros}>
            Cadastre o primeiro
          </Link>
          .
        </>
      ),
      grave: true
    })
  else if (!ativos.length) avisos.push({ texto: 'Todos os números estão pausados.', grave: true })
  for (const n of ativos.filter(n => n.status !== 'WORKING')) {
    avisos.push({
      texto: (
        <>
          O número <strong>{n.rotulo}</strong> não está conectado ({n.status ?? 'nunca testado'}).
        </>
      ),
      grave: true
    })
  }
  for (const n of ativos.filter(n => n.status === 'WORKING' && !n.webhook_em)) {
    avisos.push({
      texto: (
        <>
          O número <strong>{n.rotulo}</strong> ainda não tem o webhook configurado: as respostas não chegarão aqui.
        </>
      )
    })
  }
  if (!campanhas.some(x => x.status === 'ativa'))
    avisos.push({
      texto: (
        <>
          Nenhuma campanha ativa.{' '}
          <Link className='underline' href={ROTAS.campanhas}>
            Ative uma campanha
          </Link>
          .
        </>
      )
    })
  const janela = dentroDaJanela(cfg)
  if (cfg.pausado) avisos.push({ texto: 'Os disparos estão pausados nas regras gerais.', grave: true })
  else if (!janela.ok)
    avisos.push({
      texto: `Agora está ${janela.motivo} (${cfg.hora_inicio}h–${cfg.hora_fim}h). Os envios retomam sozinhos.`
    })
  const capacidade = ativos.reduce((s, n) => s + n.limite_diario, 0)
  // a equipe só precisa do aviso de ramos (o 1º, quando existe); números, regras e campanhas são do admin
  if (!admin) avisos.splice(ramos.length ? 0 : 1)

  return (
    <div className='space-y-5'>
      {avisos.length > 0 && (
        <ul className='space-y-2'>
          {avisos.map((a, i) => (
            <li
              key={i}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border px-4 py-2.5 text-sm',
                a.grave ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
              )}
            >
              <TriangleAlert className='mt-0.5 size-4 shrink-0' />
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {grupos.length > 1 && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-semibold text-slate-500'>Grupo:</span>
          <Link
            href={href({ ...c, grupoId: undefined, campanha: undefined, pagina: 1 })}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold',
              !c.grupoId
                ? 'bg-marca-800 text-creme'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-marca-300'
            )}
          >
            Todos
          </Link>
          {grupos.map(g => (
            <Link
              key={g.id}
              href={href({ ...c, grupoId: g.id, campanha: undefined, pagina: 1 })}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-semibold',
                c.grupoId === g.id
                  ? 'bg-marca-800 text-creme'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-marca-300'
              )}
            >
              {g.nome}
            </Link>
          ))}
        </div>
      )}

      <PorRamo ramos={ramos} atual={c.ramo} hrefDe={r => href({ ...c, ramo: r, pagina: 1 })} />

      <Funil r={resumo} capacidade={capacidade} />

      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
        <div className='flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3'>
          <div className='flex flex-1 flex-wrap gap-1'>
            {(Object.keys(GRUPOS) as Grupo[]).map(g => (
              <Link
                key={g}
                href={href({ ...c, grupo: g, pagina: 1 })}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  c.grupo === g ? 'bg-marca-800 text-creme' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {GRUPOS[g].rotulo}
                {g === 'atencao' && resumo.atencao > 0 && (
                  <span className='ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-marca-950'>
                    {resumo.atencao}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <form action={ROTAS.disparos} className='flex flex-wrap items-center gap-2'>
            {c.grupo !== 'todos' && <input type='hidden' name='grupo' value={c.grupo} />}
            {c.ramo && <input type='hidden' name='ramo' value={c.ramo} />}
            {c.grupoId && <input type='hidden' name='gr' value={c.grupoId} />}
            <select
              name='campanha'
              defaultValue={c.campanha ?? ''}
              className='h-9 max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-marca-400'
            >
              <option value=''>Todas as campanhas</option>
              {campanhas.map(x => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
            <span className='relative'>
              <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
              <input
                name='q'
                defaultValue={c.q}
                placeholder='Empresa, CNPJ, telefone, lead'
                className='h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-marca-400'
              />
            </span>
            <button className='h-9 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200'>
              Filtrar
            </button>
            <a
              href={`/api/disparos/exportar?${new URLSearchParams({ grupo: c.grupo, ...(c.campanha ? { campanha: String(c.campanha) } : {}), ...(c.ramo ? { ramo: c.ramo } : {}), ...(c.grupoId ? { gr: String(c.grupoId) } : {}), ...(c.q ? { q: c.q } : {}) })}`}
              className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-marca-300'
            >
              <Download className='size-3.5' /> CSV
            </a>
          </form>
        </div>

        <div className='overflow-x-auto'>
          <table className='w-full min-w-[1040px] text-left text-sm'>
            <thead className='bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500'>
              <tr>
                <th className='px-4 py-2.5 font-medium'>Empresa</th>
                <th className='px-3 py-2.5 font-medium'>WhatsApp</th>
                <th className='px-3 py-2.5 font-medium'>Situação</th>
                <th className='px-3 py-2.5 font-medium'>Enviado</th>
                <th className='px-3 py-2.5 font-medium'>Leitura</th>
                <th className='px-3 py-2.5 font-medium'>Resposta / lead</th>
              </tr>
            </thead>
            <tbody>
              {lista.itens.map(d => (
                <tr key={d.id} className='border-t border-slate-100 align-top hover:bg-marca-50/50'>
                  <td className='max-w-[300px] px-4 py-3'>
                    <Link href={ROTAS.disparo(d.id)} className='block'>
                      <span className='flex items-center gap-1.5'>
                        {d.atencao && (
                          <BellRing className='size-3.5 shrink-0 text-amber-500' aria-label='Precisa de atenção' />
                        )}
                        {d.teste && (
                          <span className='shrink-0 rounded-full bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-800'>
                            teste
                          </span>
                        )}
                        <span className='truncate font-medium text-slate-800 hover:text-marca-700'>
                          {d.nome_fantasia || d.razao_social}
                        </span>
                      </span>
                      <span className='block truncate text-xs text-slate-400'>
                        {d.municipio}
                        {d.uf ? `/${d.uf}` : ''} · {d.ramo_nome ?? 'ramo ?'} ·{' '}
                        {grupos.length > 1 && !c.grupoId ? `${nomeGrupo.get(d.grupo_id) ?? 'grupo ?'} · ` : ''}
                        {nomeCampanha.get(d.campanha_id) ?? `campanha ${d.campanha_id}`}
                      </span>
                    </Link>
                  </td>
                  <td className='whitespace-nowrap px-3 py-3 tabular-nums text-slate-600'>{fmtFone(d.telefone)}</td>
                  <td className='px-3 py-3'>
                    <SeloStatus status={d.status} />
                  </td>
                  <td className='whitespace-nowrap px-3 py-3 text-xs text-slate-500'>
                    {fmtDataHora(d.enviado_em ?? d.criado_em)}
                  </td>
                  <td className='px-3 py-3'>
                    {d.lido_em ? (
                      <span
                        className='inline-flex items-center gap-1 text-xs text-sky-600'
                        title={`Lido ${fmtDataHora(d.lido_em)}`}
                      >
                        <CheckCheck className='size-4' /> lido
                      </span>
                    ) : d.entregue_em ? (
                      <span
                        className='inline-flex items-center gap-1 text-xs text-slate-500'
                        title={`Entregue ${fmtDataHora(d.entregue_em)}`}
                      >
                        <CheckCheck className='size-4' /> entregue
                      </span>
                    ) : d.enviado_em ? (
                      <span className='inline-flex items-center gap-1 text-xs text-slate-400'>
                        <Check className='size-4' /> enviado
                      </span>
                    ) : (
                      <span className='text-xs text-slate-300'>—</span>
                    )}
                  </td>
                  <td className='max-w-[340px] px-3 py-3 text-xs'>
                    {d.preenchido_em ? (
                      <span className='block text-slate-700'>
                        <strong className='font-semibold text-emerald-800'>{d.lead_nome}</strong>
                        <span className='block truncate text-slate-500'>
                          {d.lead_whatsapp
                            ? `contato ${fmtFone(d.lead_whatsapp)}`
                            : d.lead_cnpj
                              ? `CNPJ ${fmtCnpj(d.lead_cnpj)}`
                              : d.lead_email}
                        </span>
                      </span>
                    ) : d.ultima_resposta ? (
                      <span className='line-clamp-2 text-slate-600'>“{d.ultima_resposta}”</span>
                    ) : d.erro ? (
                      <span className='line-clamp-2 text-red-600'>{d.erro}</span>
                    ) : (
                      <span className='text-slate-300'>—</span>
                    )}
                    {d.respondido_em && (
                      <span className='mt-0.5 block text-[11px] text-slate-400'>{fmtRelativo(d.respondido_em)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {lista.itens.length === 0 && (
                <tr>
                  <td colSpan={6} className='px-4 py-14 text-center text-slate-400'>
                    {resumo.total === 0
                      ? 'Nenhum disparo ainda. Assim que uma campanha ativa enviar, os contatos aparecem aqui.'
                      : 'Nada nesta aba.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className='flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500'>
          <span>
            {fmtInt(lista.total)} contatos · página {fmtInt(c.pagina)} de {fmtInt(paginas)}
          </span>
          <div className='flex gap-1'>
            {c.pagina > 1 && (
              <Link
                href={href({ ...c, pagina: c.pagina - 1 })}
                className='grid size-8 place-items-center rounded-md hover:bg-slate-100'
              >
                <ChevronLeft className='size-4' />
              </Link>
            )}
            {c.pagina < paginas && (
              <Link
                href={href({ ...c, pagina: c.pagina + 1 })}
                className='grid size-8 place-items-center rounded-md hover:bg-slate-100'
              >
                <ChevronRight className='size-4' />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Funil({ r, capacidade }: { r: ResumoDisparos; capacidade: number }) {
  const cards = [
    {
      rotulo: 'Enviados',
      valor: r.enviados,
      nota: `${fmtInt(r.enviados_hoje)} hoje · capacidade ${fmtInt(capacidade)}/dia`,
      icone: Send,
      destaque: true
    },
    {
      rotulo: 'Entregues',
      valor: r.entregues,
      nota: `${fmtPct(r.entregues, r.enviados)} dos enviados`,
      icone: CheckCheck
    },
    { rotulo: 'Lidos', valor: r.lidos, nota: `${fmtPct(r.lidos, r.enviados)} dos enviados`, icone: Eye },
    {
      rotulo: 'Responderam',
      valor: r.responderam,
      nota: `${fmtPct(r.responderam, r.enviados)} · ${fmtInt(r.aguardando)} sem resposta`,
      icone: MessageCircleReply
    },
    {
      rotulo: 'Querem a consulta',
      valor: r.interessados,
      nota: r.links_abertos
        ? `${fmtInt(r.links_abertos)} clicaram no link`
        : `${fmtPct(r.interessados, r.enviados)} dos enviados`,
      icone: Hand
    },
    {
      rotulo: 'Enviaram nome e contato',
      valor: r.preencheram,
      nota: `${fmtPct(r.preencheram, r.enviados)} dos enviados`,
      icone: ClipboardCheck,
      ouro: true
    },
    {
      rotulo: 'Recusaram / saíram',
      valor: r.sem_interesse + r.descadastrados,
      nota: `${fmtInt(r.descadastrados)} pediram para sair`,
      icone: MailX
    },
    {
      rotulo: 'Não entregues',
      valor: r.sem_whatsapp + r.falhas,
      nota: `${fmtInt(r.sem_whatsapp)} sem WhatsApp · ${fmtInt(r.falhas)} falhas`,
      icone: TriangleAlert
    }
  ]
  return (
    <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
      {cards.map(c => (
        <div
          key={c.rotulo}
          className={cn(
            'relative overflow-hidden rounded-2xl border p-4',
            c.destaque
              ? 'fundo-marinho border-marca-800 text-white shadow-lg shadow-marca-900/15'
              : c.ouro
                ? 'border-ouro/60 bg-white shadow-sm shadow-marca-900/[0.03] ring-1 ring-ouro/30'
                : 'border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'
          )}
        >
          <div
            className={cn(
              'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]',
              c.destaque ? 'text-ouro' : 'text-slate-500'
            )}
          >
            <c.icone className={cn('size-3.5 shrink-0', c.destaque ? 'text-ouro' : 'text-ouro-escuro')} />
            <span className='truncate'>{c.rotulo}</span>
          </div>
          <p
            className={cn(
              'mt-3 font-serif text-[1.75rem] font-bold leading-none tracking-[-0.01em] lining-nums tabular-nums',
              c.destaque ? 'text-white' : 'text-marca-800'
            )}
          >
            {fmtInt(c.valor)}
          </p>
          <p className={cn('mt-1.5 truncate text-xs', c.destaque ? 'text-areia/80' : 'text-slate-400')}>{c.nota}</p>
        </div>
      ))}
    </div>
  )
}

function PorRamo({
  ramos,
  atual,
  hrefDe
}: {
  ramos: Awaited<ReturnType<typeof disparosPorRamo>>
  atual?: string
  hrefDe: (ramo?: string) => string
}) {
  if (!ramos.length) return null
  return (
    <section className='space-y-2'>
      <div className='flex items-center justify-between'>
        <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Por ramo</p>
        {atual && (
          <Link href={hrefDe(undefined)} className='text-xs font-semibold text-marca-700 hover:underline'>
            ver todos os ramos
          </Link>
        )}
      </div>
      <div className='flex gap-2 overflow-x-auto pb-1'>
        {ramos.map(r => (
          <Link
            key={r.ramo}
            href={hrefDe(r.ramo === atual ? undefined : r.ramo)}
            className={cn(
              'min-w-[200px] max-w-[240px] shrink-0 rounded-2xl border p-3 transition',
              r.ramo === atual
                ? 'border-marca-700 bg-marca-50 ring-2 ring-marca-100'
                : 'border-slate-200 bg-white hover:border-marca-300'
            )}
          >
            <p
              className='line-clamp-2 min-h-[2.5em] text-[13px] font-semibold leading-tight text-slate-800'
              title={r.ramo_nome}
            >
              {r.ramo_nome}
            </p>
            <p className='mt-1 truncate text-[11px] text-slate-400'>
              {r.responsaveis.length ? `👤 ${r.responsaveis.join(', ')}` : 'sem responsável'}
            </p>
            <div className='mt-2 flex items-end justify-between gap-2 text-xs'>
              <span className='text-slate-500'>
                <strong className='font-serif text-lg text-marca-800'>{fmtInt(r.enviados)}</strong> env. ·{' '}
                {fmtInt(r.responderam)} resp.
              </span>
              <span className='flex gap-1'>
                {r.atencao > 0 && (
                  <span className='rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-marca-950'>
                    {r.atencao}
                  </span>
                )}
                {r.preencheram > 0 && (
                  <span className='rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800'>
                    {r.preencheram} leads
                  </span>
                )}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
