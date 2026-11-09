import type { Metadata } from 'next'
import { Calendario, type Rascunho, type ReuniaoTela } from '@/components/calendario/calendario'
import { CORES_PESSOA } from '@/components/calendario/cores'
import { horarioPadrao } from '@/components/calendario/horario'
import { meusGruposCalendario, pessoasEquipe, proximasReunioes, reunioesEntre } from '@/lib/calendario/dados'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { fmtDataHora } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Calendário' }

const fuso = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map(x => [x.type, x.value])
  )
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await usuarioAtual()
  // equipe interna ou cliente que faz parte de um grupo
  if (!u?.autorizado && !(u?.papel === 'cliente' && u.produtos?.disparos)) redirect(ROTAS.dashboard)
  const sp = await searchParams
  const grupos = await meusGruposCalendario(!!u.admin, u.id)
  const grupoAtual = grupos.find(g => String(g.id) === sp.g)?.id
  const agora = fuso(new Date().toISOString())
  const hoje = agora.dia
  // ?mes= só com mês de verdade (2026-13 virava data inválida e derrubava a página)
  const mes = sp.mes && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const inicio = new Date(`${mes}-01T00:00:00-03:00`).toISOString()
  const fim = new Date(`${m === 12 ? ano + 1 : ano}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00-03:00`).toISOString()

  const [reunioes, pessoas, proximas] = await Promise.all([reunioesEntre(inicio, fim, grupoAtual), pessoasEquipe(), proximasReunioes(12, grupoAtual)])
  const nomeGrupo = new Map(grupos.map(g => [g.id, g.nome]))
  const indice = new Map(pessoas.map((p, i) => [p.user_id, i]))
  const cliente = u.papel === 'cliente'
  const cor = (uid: string) => CORES_PESSOA[(indice.get(uid) ?? pessoas.length) % CORES_PESSOA.length]
  // autor fora da lista: para o cliente, quase sempre alguém da OficialCert; para a equipe, quem saiu do grupo
  const nome = (uid: string) => pessoas.find(p => p.user_id === uid)?.nome ?? (cliente ? 'OficialCert' : 'alguém fora dos seus grupos')
  const tela = (r: (typeof reunioes)[number]): ReuniaoTela => {
    const a = fuso(r.inicio)
    const b = fuso(r.fim)
    return {
      id: r.id,
      titulo: r.titulo,
      dia: a.dia,
      hi: a.hora,
      hf: b.hora,
      descricao: r.descricao,
      local: r.local,
      cnpj: r.cnpj,
      disparo_id: r.disparo_id,
      grupo_id: r.grupo_id,
      grupo: nomeGrupo.get(r.grupo_id) ?? '—',
      autor: nome(r.criado_por),
      cor: cor(r.criado_por),
      podeEditar: !!u?.admin || r.criado_por === u?.id
    }
  }

  // "Agendar reunião" a partir de um contato dos disparos (?nova=1&disparo=ID)
  let inicial: Rascunho | null = null
  if (sp.nova) {
    // hoje sugere a próxima hora cheia, para o formulário não nascer com "esse horário já passou"
    inicial = horarioPadrao(sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hoje, `${agora.dia} ${agora.hora}`, !sp.data)
    const disparoId = Number(sp.disparo)
    if (disparoId) {
      const supabase = await createClient()
      const { data: d } = await supabase
        .from('disparos')
        .select('id, cnpj, razao_social, nome_fantasia, lead_nome, lead_whatsapp, telefone, grupo_id')
        .eq('id', disparoId)
        .maybeSingle()
      if (d) {
        inicial = {
          ...inicial,
          titulo: `Reunião — ${d.nome_fantasia || d.razao_social}`.slice(0, 160),
          cnpj: /^\d{14}$/.test(d.cnpj) ? d.cnpj : null,
          disparo_id: d.id,
          grupo_id: d.grupo_id,
          descricao: [d.lead_nome && `Contato: ${d.lead_nome}`, `WhatsApp: ${d.lead_whatsapp ?? d.telefone}`].filter(Boolean).join('\n')
        }
      }
    }
  }

  const legenda = pessoas.filter(p => reunioes.some(r => r.criado_por === p.user_id)).map(p => ({ nome: p.nome, cor: cor(p.user_id) }))

  return (
    <div className='space-y-5 p-4 sm:p-6'>
      <header className='max-w-2xl'>
        <span className='rotulo-secao'>{cliente ? 'Agenda' : 'Administrativo'}</span>
        <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Calendário</h1>
        <p className='text-sm text-slate-500'>
          {cliente
            ? 'As reuniões marcadas com os contatos dos seus disparos. Você vê todas as reuniões da sua conta e pode alterar as que você marcou. Para marcar, use “Marcar reunião”.'
            : 'As reuniões de cada grupo: você vê as de todos do(s) seu(s) grupo(s) e edita as suas. Para marcar, use “Marcar reunião”.'}
        </p>
      </header>
      <div className='grid min-w-0 gap-5 2xl:grid-cols-[1fr_320px]'>
        {grupos.length ? (
          <Calendario mes={mes} hoje={hoje} reunioes={reunioes.map(tela)} legenda={legenda} inicial={inicial} base={ROTAS.calendario} grupos={grupos} grupoAtual={grupoAtual} />
        ) : (
          <p className='rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900'>
            {cliente
              ? 'Sua conta ainda não está ligada a nenhuma agenda. Fale com a OficialCert para liberar o calendário.'
              : 'Você ainda não faz parte de nenhum grupo, então não há calendário para mostrar. Peça ao administrador para incluir você em um grupo (Usuários).'}
          </p>
        )}
        <aside className='rounded-2xl border border-slate-200 bg-white p-4 2xl:self-start'>
          <h2 className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Próximas reuniões</h2>
          {proximas.length === 0 && <p className='mt-3 text-sm text-slate-500'>Nada marcado.</p>}
          <ul className='mt-3 space-y-2.5'>
            {proximas.map(r => (
              <li key={r.id} className='flex gap-2.5 text-sm'>
                <span aria-hidden className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', cor(r.criado_por))} />
                <span className='min-w-0'>
                  <span className='block truncate font-medium text-slate-800'>{r.titulo}</span>
                  <span className='block text-xs text-slate-500'>
                    {fmtDataHora(r.inicio)} · {nome(r.criado_por)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
