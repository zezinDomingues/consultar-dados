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
  TriangleAlert,
  UserRound
} from 'lucide-react'
import { AoVivo } from '@/components/disparos/ao-vivo'
import { rotuloSessao, SeloStatus, SeloTeste } from '@/components/disparos/selos'
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
import { GRUPOS, type Disparo, type Grupo, type ResumoDisparos } from '@/lib/disparos/tipos'
import { fmtDataHora, fmtInt, fmtPct, fmtRelativo } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Painel' }

const POR_PAGINA = 50

/** "1 contato", "2 contatos" */
const plural = (n: number, um: string, varios: string) => `${fmtInt(n)} ${n === 1 ? um : varios}`

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

const CHIP = 'inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-xs font-semibold transition'
const CHIP_ATIVO = 'bg-marca-800 text-creme'
const CHIP_INATIVO = 'border border-slate-200 bg-white text-slate-600 hover:border-marca-300 hover:text-marca-800'

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
  // o cliente (dono do grupo) não tem ramos nem equipe: os textos para ele são outros
  const cliente = u?.papel === 'cliente'
  const nomeCampanha = new Map(campanhasTodas.map(x => [x.id, x.nome]))
  const nomeGrupo = new Map(grupos.map(g => [g.id, g.nome]))
  const paginas = Math.max(1, Math.ceil(lista.total / POR_PAGINA))
  const origem = (d: Disparo) =>
    [
      `${d.municipio ?? ''}${d.uf ? `/${d.uf}` : ''}`,
      d.ramo_nome ?? 'ramo ?',
      grupos.length > 1 && !c.grupoId ? (nomeGrupo.get(d.grupo_id) ?? 'grupo ?') : null,
      nomeCampanha.get(d.campanha_id) ?? `campanha ${d.campanha_id}`
    ]
      .filter(Boolean)
      .join(' · ')

  // ---- avisos: o que impede (ou vai impedir) os envios agora ----
  const avisos: { texto: React.ReactNode; grave?: boolean }[] = []
  if (!admin && !cliente && !ramos.length)
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
          O número <strong>{n.rotulo}</strong> não está conectado (
          {n.status ? rotuloSessao(n.status).toLowerCase() : 'nunca testado'}).
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
  if (!admin) avisos.splice(!cliente && !ramos.length ? 1 : 0)

  const vazio =
    resumo.total === 0
      ? cliente
        ? 'Nenhum disparo ainda. Assim que a sua campanha começar a enviar, os contatos aparecem aqui.'
        : 'Nenhum disparo ainda. Assim que uma campanha ativa enviar, os contatos aparecem aqui.'
      : 'Nada nesta aba.'

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
              <TriangleAlert className='mt-0.5 size-4 shrink-0' aria-hidden />
              <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}

      {grupos.length > 1 && (
        <nav aria-label='Grupo' className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-semibold text-slate-500'>Grupo:</span>
          <Link
            href={href({ ...c, grupoId: undefined, campanha: undefined, pagina: 1 })}
            aria-current={!c.grupoId ? 'true' : undefined}
            className={cn(CHIP, !c.grupoId ? CHIP_ATIVO : CHIP_INATIVO)}
          >
            Todos
          </Link>
          {grupos.map(g => (
            <Link
              key={g.id}
              href={href({ ...c, grupoId: g.id, campanha: undefined, pagina: 1 })}
              aria-current={c.grupoId === g.id ? 'true' : undefined}
              className={cn(CHIP, c.grupoId === g.id ? CHIP_ATIVO : CHIP_INATIVO)}
            >
              {g.nome}
            </Link>
          ))}
        </nav>
      )}

      <PorRamo ramos={ramos} atual={c.ramo} hrefDe={r => href({ ...c, ramo: r, pagina: 1 })} cliente={cliente} />

      <section aria-labelledby='titulo-resumo' className='space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h2 id='titulo-resumo' className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            Resumo{c.campanha ? ` · ${nomeCampanha.get(c.campanha) ?? 'campanha'}` : ''}
          </h2>
          <AoVivo />
        </div>
        <Funil r={resumo} capacidade={capacidade} />
      </section>

      <section
        aria-label='Contatos'
        className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'
      >
        <div className='space-y-3 border-b border-slate-100 px-4 py-3'>
          {/* situação: uma linha que rola no celular; no tablet/desktop quebra na largura toda da barra */}
          <nav
            aria-label='Filtrar por situação'
            className='-mx-4 flex gap-1 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0'
          >
            {(Object.keys(GRUPOS) as Grupo[]).map(g => (
              <Link
                key={g}
                href={href({ ...c, grupo: g, pagina: 1 })}
                aria-current={c.grupo === g ? 'true' : undefined}
                className={cn(CHIP, c.grupo === g ? CHIP_ATIVO : 'text-slate-600 hover:bg-slate-100')}
              >
                {GRUPOS[g].rotulo}
                {g === 'atencao' && resumo.atencao > 0 && (
                  <span className='ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-marca-950'>
                    {resumo.atencao}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <form
            action={ROTAS.disparos}
            role='search'
            className='grid gap-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto_auto] sm:items-center'
          >
            {c.grupo !== 'todos' && <input type='hidden' name='grupo' value={c.grupo} />}
            {c.ramo && <input type='hidden' name='ramo' value={c.ramo} />}
            {c.grupoId && <input type='hidden' name='gr' value={c.grupoId} />}
            <select
              name='campanha'
              defaultValue={c.campanha ?? ''}
              aria-label='Campanha'
              className='h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-marca-400'
            >
              <option value=''>Todas as campanhas</option>
              {campanhas.map(x => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </select>
            <span className='relative min-w-0'>
              <Search
                className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400'
                aria-hidden
              />
              <input
                name='q'
                type='search'
                defaultValue={c.q}
                aria-label='Buscar por empresa, CNPJ, telefone ou lead'
                placeholder='Empresa, CNPJ, telefone, lead'
                className='h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-marca-400'
              />
            </span>
            <span className='flex gap-2 sm:contents'>
              <button className='h-9 flex-1 rounded-lg bg-slate-100 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-200 sm:flex-none'>
                Filtrar
              </button>
              <a
                href={`/api/disparos/exportar?${new URLSearchParams({ grupo: c.grupo, ...(c.campanha ? { campanha: String(c.campanha) } : {}), ...(c.ramo ? { ramo: c.ramo } : {}), ...(c.grupoId ? { gr: String(c.grupoId) } : {}), ...(c.q ? { q: c.q } : {}) })}`}
                className='inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-marca-300 sm:flex-none'
              >
                <Download className='size-3.5' aria-hidden /> Exportar CSV
              </a>
            </span>
          </form>
        </div>

        {/* celular: cartões (a tabela de 6 colunas não cabe) */}
        <ul className='divide-y divide-slate-100 md:hidden'>
          {lista.itens.map(d => (
            <li key={d.id} data-disparo-id={d.id}>
              <Link href={ROTAS.disparo(d.id)} className='block px-4 py-3 hover:bg-marca-50/50'>
                <Nome d={d} />
                <span className='block truncate text-xs text-slate-400'>{origem(d)}</span>
                <span className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500'>
                  <SeloStatus status={d.status} />
                  <span className='tabular-nums'>{fmtFone(d.telefone)}</span>
                  <span>{fmtDataHora(d.enviado_em ?? d.criado_em)}</span>
                  <Leitura d={d} />
                </span>
                {(d.preenchido_em || d.ultima_resposta || d.erro) && (
                  <span className='mt-1.5 block text-xs'>
                    <Resposta d={d} />
                  </span>
                )}
              </Link>
            </li>
          ))}
          {lista.itens.length === 0 && <li className='px-4 py-14 text-center text-sm text-slate-400'>{vazio}</li>}
        </ul>

        <div className='hidden overflow-x-auto md:block'>
          <table className='w-full min-w-[960px] text-left text-sm'>
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
                <tr key={d.id} data-disparo-id={d.id} className='border-t border-slate-100 align-top hover:bg-marca-50/50'>
                  <td className='max-w-[300px] px-4 py-3'>
                    <Link href={ROTAS.disparo(d.id)} className='block'>
                      <Nome d={d} />
                      <span className='block truncate text-xs text-slate-400'>{origem(d)}</span>
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
                    <Leitura d={d} />
                  </td>
                  <td className='max-w-[340px] px-3 py-3 text-xs'>
                    <Resposta d={d} />
                    {d.respondido_em && (
                      <span className='mt-0.5 block text-[11px] text-slate-400'>{fmtRelativo(d.respondido_em)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {lista.itens.length === 0 && (
                <tr>
                  <td colSpan={6} className='px-4 py-14 text-center text-slate-400'>
                    {vazio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <nav
          aria-label='Paginação'
          className='flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500'
        >
          <span>
            {plural(lista.total, 'contato', 'contatos')} · página {fmtInt(c.pagina)} de {fmtInt(paginas)}
          </span>
          <span className='flex gap-1'>
            {c.pagina > 1 && (
              <Link
                href={href({ ...c, pagina: c.pagina - 1 })}
                aria-label='Página anterior'
                className='grid size-8 place-items-center rounded-md hover:bg-slate-100'
              >
                <ChevronLeft className='size-4' aria-hidden />
              </Link>
            )}
            {c.pagina < paginas && (
              <Link
                href={href({ ...c, pagina: c.pagina + 1 })}
                aria-label='Próxima página'
                className='grid size-8 place-items-center rounded-md hover:bg-slate-100'
              >
                <ChevronRight className='size-4' aria-hidden />
              </Link>
            )}
          </span>
        </nav>
      </section>
    </div>
  )
}

function Nome({ d }: { d: Disparo }) {
  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      {d.atencao && <BellRing className='size-3.5 shrink-0 text-amber-600' aria-label='Precisa de atenção' />}
      {d.teste && <SeloTeste />}
      <span className='truncate font-medium text-slate-800 hover:text-marca-700'>{d.nome_fantasia || d.razao_social}</span>
    </span>
  )
}

function Leitura({ d }: { d: Disparo }) {
  if (d.lido_em)
    return (
      <span className='inline-flex items-center gap-1 text-xs font-medium text-marca-700' title={`Lido ${fmtDataHora(d.lido_em)}`}>
        <CheckCheck className='size-4' aria-hidden /> lido
      </span>
    )
  if (d.entregue_em)
    return (
      <span className='inline-flex items-center gap-1 text-xs text-slate-500' title={`Entregue ${fmtDataHora(d.entregue_em)}`}>
        <CheckCheck className='size-4' aria-hidden /> entregue
      </span>
    )
  if (d.enviado_em)
    return (
      <span className='inline-flex items-center gap-1 text-xs text-slate-500'>
        <Check className='size-4' aria-hidden /> enviado
      </span>
    )
  return (
    <span className='text-xs text-slate-400' aria-label='sem envio'>
      —
    </span>
  )
}

function Resposta({ d }: { d: Disparo }) {
  if (d.preenchido_em)
    return (
      <span className='block text-slate-700'>
        <strong className='inline-flex items-center gap-1 font-semibold text-marca-800'>
          <ClipboardCheck className='size-3.5 shrink-0 text-ouro-escuro' aria-hidden /> {d.lead_nome}
        </strong>
        <span className='block truncate text-slate-500'>
          {d.lead_whatsapp
            ? `contato ${fmtFone(d.lead_whatsapp)}`
            : d.lead_cnpj
              ? `CNPJ ${fmtCnpj(d.lead_cnpj)}`
              : d.lead_email}
        </span>
      </span>
    )
  if (d.ultima_resposta) return <span className='line-clamp-2 text-slate-600'>“{d.ultima_resposta}”</span>
  if (d.erro) return <span className='line-clamp-2 text-red-700'>{d.erro}</span>
  return (
    <span className='text-slate-400' aria-label='sem resposta'>
      —
    </span>
  )
}

function Funil({ r, capacidade }: { r: ResumoDisparos; capacidade: number }) {
  // mesmos nomes das abas do painel e da lista de campanhas
  const cards = [
    {
      rotulo: 'Enviados',
      valor: r.enviados,
      nota: `${fmtInt(r.enviados_hoje)} hoje · até ${fmtInt(capacidade)}/dia`,
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
        ? `${plural(r.links_abertos, 'clicou', 'clicaram')} no link`
        : `${fmtPct(r.interessados, r.enviados)} dos enviados`,
      icone: Hand
    },
    {
      rotulo: 'Enviaram os dados',
      valor: r.preencheram,
      nota: `${fmtPct(r.preencheram, r.enviados)} dos enviados`,
      icone: ClipboardCheck,
      ouro: true
    },
    {
      rotulo: 'Recusaram / saíram',
      valor: r.sem_interesse + r.descadastrados,
      nota: `${plural(r.descadastrados, 'pediu', 'pediram')} para sair`,
      icone: MailX
    },
    {
      rotulo: 'Não entregues',
      valor: r.sem_whatsapp + r.falhas,
      nota: `${fmtInt(r.sem_whatsapp)} sem WhatsApp · ${plural(r.falhas, 'falha', 'falhas')}`,
      icone: TriangleAlert
    }
  ]
  return (
    <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
      {cards.map(c => (
        <div
          key={c.rotulo}
          className={cn(
            'relative overflow-hidden rounded-2xl border p-3.5 sm:p-4',
            c.destaque
              ? 'fundo-marinho border-marca-800 text-white shadow-lg shadow-marca-900/15'
              : c.ouro
                ? 'border-ouro/60 bg-white shadow-sm shadow-marca-900/[0.03] ring-1 ring-ouro/30'
                : 'border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'
          )}
        >
          <div
            className={cn(
              'flex items-start gap-1.5 text-[10px] font-bold uppercase leading-tight tracking-[0.12em]',
              c.destaque ? 'text-ouro' : 'text-slate-500'
            )}
          >
            <c.icone className={cn('size-3.5 shrink-0', c.destaque ? 'text-ouro' : 'text-ouro-escuro')} aria-hidden />
            <span>{c.rotulo}</span>
          </div>
          <p
            className={cn(
              'mt-3 font-serif text-[1.75rem] font-bold leading-none tracking-[-0.01em] lining-nums tabular-nums',
              c.destaque ? 'text-white' : 'text-marca-800'
            )}
          >
            {fmtInt(c.valor)}
          </p>
          <p className={cn('mt-1.5 text-xs leading-snug', c.destaque ? 'text-areia' : 'text-slate-500')}>{c.nota}</p>
        </div>
      ))}
    </div>
  )
}

function PorRamo({
  ramos,
  atual,
  hrefDe,
  cliente
}: {
  ramos: Awaited<ReturnType<typeof disparosPorRamo>>
  atual?: string
  hrefDe: (ramo?: string) => string
  /** o cliente não vê quem da equipe interna responde cada ramo */
  cliente: boolean
}) {
  if (!ramos.length) return null
  return (
    <section aria-labelledby='titulo-ramos' className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <h2 id='titulo-ramos' className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
          Por ramo
        </h2>
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
            aria-current={r.ramo === atual ? 'true' : undefined}
            className={cn(
              'w-[200px] shrink-0 rounded-2xl border p-3 transition sm:w-[220px]',
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
            {!cliente && (
              <p className='mt-1 flex items-center gap-1 text-[11px] text-slate-400'>
                <UserRound className='size-3 shrink-0' aria-label='Responsáveis' />
                <span className='truncate'>{r.responsaveis.length ? r.responsaveis.join(', ') : 'sem responsável'}</span>
              </p>
            )}
            <div className='mt-2 flex items-end justify-between gap-2 text-xs'>
              <span className='text-slate-500'>
                <strong className='font-serif text-lg text-marca-800'>{fmtInt(r.enviados)}</strong> env. ·{' '}
                {fmtInt(r.responderam)} resp.
              </span>
              <span className='flex gap-1'>
                {r.atencao > 0 && (
                  <span
                    className='rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-marca-950'
                    title='Precisam de atenção'
                  >
                    {r.atencao}
                  </span>
                )}
                {r.preencheram > 0 && (
                  <span className='rounded-full border border-ouro/60 bg-ouro/15 px-1.5 text-[10px] font-bold text-ouro-texto'>
                    {plural(r.preencheram, 'lead', 'leads')}
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
