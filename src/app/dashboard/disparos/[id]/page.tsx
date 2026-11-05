import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BellRing, Building2, ClipboardCheck, ExternalLink, MessageCircle } from 'lucide-react'
import { BotaoAcao } from '@/components/disparos/botao-acao'
import { Responder } from '@/components/disparos/responder'
import { SeloStatus } from '@/components/disparos/selos'
import { marcarComoVisto } from '@/app/dashboard/disparos/actions'
import { linkFormulario } from '@/lib/disparos/config'
import { obterDisparo } from '@/lib/disparos/dados'
import { fmtCnpj, fmtFone } from '@/lib/disparos/mensagens'
import type { EventoDisparo } from '@/lib/disparos/tipos'
import { fmtDataHora } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Contato' }

export default async function DisparoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const r = await obterDisparo(id)
  if (!r) notFound()
  const { disparo: d, eventos, campanha, numero } = r

  const marcos = [
    { rotulo: 'Na fila', em: d.criado_em },
    { rotulo: 'Enviado', em: d.enviado_em },
    { rotulo: 'Entregue', em: d.entregue_em },
    { rotulo: 'Lido', em: d.lido_em },
    { rotulo: 'Respondeu', em: d.respondido_em },
    { rotulo: 'Quis a consulta', em: d.interessado_em },
    { rotulo: 'Enviou nome e contato', em: d.preenchido_em }
  ]

  const ETAPAS: Record<string, string> = { nome: 'Esperando o nome completo', contato: 'Esperando a escolha do número de contato', telefone: 'Esperando o outro número', cnpj: 'Esperando o CNPJ' }
  const etapaAberta = d.etapa ? ETAPAS[d.etapa] : null

  const bloqueioResposta =
    d.status === 'descadastrado'
      ? 'Esta pessoa pediu para sair: nenhuma mensagem pode ser enviada.'
      : !d.chat_id || !d.numero_id
        ? 'Ainda não há conversa aberta com este contato.'
        : undefined

  return (
    <div className='space-y-5'>
      <Link href={ROTAS.disparos} className='inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-marca-700'>
        <ArrowLeft className='size-3.5' /> Voltar ao painel
      </Link>

      <div className='grid gap-5 xl:grid-cols-[1fr_1.15fr]'>
        {/* ---------- ficha ---------- */}
        <section className='space-y-4'>
          <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-marca-900/[0.03]'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='min-w-0'>
                <h2 className='font-serif text-2xl font-bold leading-tight text-marca-800'>{d.nome_fantasia || d.razao_social}</h2>
                {d.nome_fantasia && <p className='text-sm text-slate-500'>{d.razao_social}</p>}
                <p className='mt-1 text-xs text-slate-400'>
                  CNPJ {fmtCnpj(d.cnpj)} · {d.municipio}
                </p>
              </div>
              <div className='flex items-center gap-1.5'>
                {d.teste && <span className='rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800'>teste</span>}
                <SeloStatus status={d.status} className='text-xs' />
              </div>
            </div>
            <dl className='mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
              <div>
                <dt className='text-[11px] uppercase tracking-wide text-slate-400'>WhatsApp</dt>
                <dd className='font-medium tabular-nums text-slate-700'>{fmtFone(d.telefone)}</dd>
              </div>
              <div>
                <dt className='text-[11px] uppercase tracking-wide text-slate-400'>Campanha</dt>
                <dd className='truncate font-medium text-slate-700'>
                  {campanha ? <Link href={ROTAS.campanha(campanha.id)} className='hover:text-marca-700 hover:underline'>{campanha.nome}</Link> : '—'}
                </dd>
              </div>
              <div>
                <dt className='text-[11px] uppercase tracking-wide text-slate-400'>Enviado por</dt>
                <dd className='font-medium text-slate-700'>{numero ? `${numero.rotulo}${numero.telefone ? ` · ${fmtFone(numero.telefone)}` : ''}` : '—'}</dd>
              </div>
              <div>
                <dt className='text-[11px] uppercase tracking-wide text-slate-400'>Formulário</dt>
                <dd>
                  <a href={linkFormulario(d.token)} target='_blank' rel='noreferrer' className='inline-flex items-center gap-1 font-medium text-marca-700 hover:underline'>
                    abrir <ExternalLink className='size-3' />
                  </a>
                </dd>
              </div>
            </dl>
            <div className='mt-4 flex flex-wrap gap-2'>
              <Link
                href={ROTAS.empresa(d.cnpj)}
                className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-marca-300 hover:text-marca-800'
              >
                <Building2 className='size-3.5' /> Ficha da empresa
              </Link>
              {d.atencao && (
                <BotaoAcao acao={marcarComoVisto.bind(null, d.id)} variante='primario'>
                  <BellRing className='size-3.5' /> Marcar como visto
                </BotaoAcao>
              )}
            </div>
            {etapaAberta && <p className='mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800'>Robô: {etapaAberta.toLowerCase()}…</p>}
            {d.erro && <p className='mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700'>{d.erro}</p>}
          </div>

          {d.preenchido_em && (
            <div className='rounded-2xl border border-ouro/60 bg-white p-5 ring-1 ring-ouro/30'>
              <p className='flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ouro-escuro'>
                <ClipboardCheck className='size-4' /> Dados enviados
              </p>
              <dl className='mt-3 grid gap-3 text-sm sm:grid-cols-2'>
                <Campo rotulo='Nome completo' valor={d.lead_nome} />
                {d.lead_cnpj && <Campo rotulo='CNPJ informado' valor={fmtCnpj(d.lead_cnpj)} link={ROTAS.empresa(d.lead_cnpj)} interno />}
                <Campo
                  rotulo={d.lead_whatsapp && d.lead_whatsapp !== d.telefone ? 'Número de contato (informado)' : 'Número de contato (o mesmo)'}
                  valor={fmtFone(d.lead_whatsapp ?? d.telefone)}
                  link={`https://wa.me/55${d.lead_whatsapp ?? d.telefone}`}
                />
                {d.lead_email && <Campo rotulo='E-mail' valor={d.lead_email} link={`mailto:${d.lead_email}`} />}
                {d.lead_empresa && <Campo rotulo='Empresa (formulário)' valor={d.lead_empresa} />}
              </dl>
              <p className='mt-3 text-xs text-slate-400'>Enviado em {fmtDataHora(d.preenchido_em)}</p>
            </div>
          )}

          <div className='rounded-2xl border border-slate-200 bg-white p-5'>
            <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Linha do tempo</p>
            <ol className='mt-3 space-y-2'>
              {marcos.map(m => (
                <li key={m.rotulo} className='flex items-center gap-3 text-sm'>
                  <span className={cn('size-2.5 shrink-0 rounded-full', m.em ? 'bg-marca-700' : 'border border-slate-300 bg-white')} />
                  <span className={cn('flex-1', m.em ? 'text-slate-700' : 'text-slate-400')}>{m.rotulo}</span>
                  <span className='text-xs tabular-nums text-slate-400'>{m.em ? fmtDataHora(m.em) : '—'}</span>
                </li>
              ))}
              {d.encerrado_em && (
                <li className='flex items-center gap-3 text-sm'>
                  <span className='size-2.5 shrink-0 rounded-full bg-rose-500' />
                  <span className='flex-1 text-slate-700'>{d.status === 'descadastrado' ? 'Pediu para sair' : 'Sem interesse'}</span>
                  <span className='text-xs tabular-nums text-slate-400'>{fmtDataHora(d.encerrado_em)}</span>
                </li>
              )}
            </ol>
          </div>
        </section>

        {/* ---------- conversa ---------- */}
        <section className='flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
          <header className='flex items-center gap-2 border-b border-slate-100 px-5 py-3'>
            <MessageCircle className='size-4 text-ouro-escuro' />
            <h3 className='text-sm font-semibold text-slate-700'>Conversa</h3>
            <span className='ml-auto text-xs text-slate-400'>{eventos.length} registros</span>
          </header>
          <div className='flex-1 space-y-2.5 overflow-y-auto bg-[#f7f4ec] px-4 py-5'>
            {eventos.length === 0 && <p className='py-10 text-center text-sm text-slate-400'>Nada registrado ainda.</p>}
            {eventos.map(e => (
              <Balao key={e.id} e={e} />
            ))}
          </div>
          <div className='border-t border-slate-100 p-3'>
            <Responder id={d.id} desabilitado={bloqueioResposta} />
          </div>
        </section>
      </div>
    </div>
  )
}

function Campo({ rotulo, valor, link, interno }: { rotulo: string; valor: string | null; link?: string; interno?: boolean }) {
  return (
    <div className='min-w-0'>
      <dt className='text-[11px] uppercase tracking-wide text-slate-400'>{rotulo}</dt>
      <dd className='truncate font-medium text-slate-800'>
        {link && interno ? (
          <Link href={link} className='text-marca-700 hover:underline' title='Ver a empresa na base'>
            {valor}
          </Link>
        ) : link ? (
          <a href={link} target='_blank' rel='noreferrer' className='hover:text-marca-700 hover:underline'>
            {valor}
          </a>
        ) : (
          (valor ?? '—')
        )}
      </dd>
    </div>
  )
}

function Balao({ e }: { e: EventoDisparo }) {
  const hora = fmtDataHora(e.criado_em)
  if (e.tipo === 'enviada' || e.tipo === 'recebida') {
    const nossa = e.direcao === 'saida'
    return (
      <div className={cn('flex', nossa ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm',
            nossa ? 'rounded-br-md bg-marca-800 text-creme' : 'rounded-bl-md bg-white text-slate-800'
          )}
        >
          <p className='whitespace-pre-wrap break-words'>{e.texto}</p>
          <p className={cn('mt-1 text-right text-[10.5px]', nossa ? 'text-areia/70' : 'text-slate-400')}>
            {e.autor ? `${e.autor} · ` : ''}
            {hora}
          </p>
        </div>
      </div>
    )
  }
  const cor =
    e.tipo === 'voto' ? 'bg-amber-50 text-amber-900' : e.tipo === 'formulario' ? 'bg-emerald-50 text-emerald-900' : e.tipo === 'erro' ? 'bg-red-50 text-red-800' : 'bg-white/70 text-slate-500'
  const titulo = { voto: '📊 Votou na enquete', formulario: '📝 Preencheu o formulário', link: '🔗', status: '•', erro: '⚠️', nota: '•' }[e.tipo] ?? '•'
  return (
    <div className='flex justify-center'>
      <p className={cn('max-w-[90%] rounded-full px-3 py-1 text-center text-[11.5px]', cor)}>
        {titulo} {e.texto} · <span className='opacity-70'>{hora}</span>
      </p>
    </div>
  )
}
