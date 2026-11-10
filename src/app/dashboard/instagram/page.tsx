import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CalendarClock, ExternalLink } from 'lucide-react'
import { FOCO } from '@/components/ui/foco'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { fmtDataHora } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Instagram' }

type Item = {
  id: number
  quando: string
  tipo: string
  titulo: string
  midias: string[]
  status: string
  erro: string | null
  permalink: string | null
  publicado_em: string | null
}

const TIPO: Record<string, string> = { imagem: 'Post', carrossel: 'Carrossel', reel: 'Reel', story: 'Story' }
const STATUS: Record<string, [string, string]> = {
  agendado: ['Agendado', 'bg-marca-100 text-marca-900'],
  publicando: ['Publicando', 'bg-amber-100 text-amber-900'],
  publicado: ['Publicado', 'bg-marca-800 text-creme'],
  erro: ['Erro', 'bg-red-100 text-red-800'],
  cancelado: ['Cancelado', 'bg-slate-100 text-slate-600']
}

export default async function InstagramPage() {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.dashboard)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instagram_agenda')
    .select('id, quando, tipo, titulo, midias, status, erro, permalink, publicado_em')
    .order('quando', { ascending: true })
  const itens = (data ?? []) as Item[]
  const proximos = itens.filter(i => ['agendado', 'publicando', 'erro'].includes(i.status))
  const feitos = itens.filter(i => i.status === 'publicado').reverse()

  const Linha = ({ i }: { i: Item }) => {
    const [rotulo, cor] = STATUS[i.status] ?? [i.status, 'bg-slate-100 text-slate-700']
    return (
      <li className='flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5'>
        <span className='w-28 shrink-0 text-sm font-semibold text-marca-800'>{fmtDataHora(i.publicado_em ?? i.quando)}</span>
        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>{TIPO[i.tipo] ?? i.tipo}</span>
        <span className='min-w-0 flex-1 break-words text-sm text-slate-800'>{i.titulo}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', cor)}>{rotulo}</span>
        {i.permalink && (
          <a href={i.permalink} target='_blank' rel='noopener noreferrer' aria-label={`Abrir "${i.titulo}" no Instagram`} className={cn('rounded-md p-1 text-marca-700 hover:bg-slate-100', FOCO)}>
            <ExternalLink aria-hidden className='size-4' />
          </a>
        )}
        {i.erro && i.status !== 'publicado' && <p role='alert' className='basis-full text-xs text-red-700'>{i.erro}</p>}
      </li>
    )
  }

  return (
    <div className='space-y-5 p-4 sm:p-6'>
      <header className='max-w-2xl'>
        <span className='rotulo-secao'>Administrativo</span>
        <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Instagram</h1>
        <p className='text-sm text-slate-500'>
          Agenda da{' '}
          <a href='https://www.instagram.com/oficialcert/' target='_blank' rel='noopener noreferrer' className='font-semibold text-marca-700 underline-offset-2 hover:underline'>
            @oficialcert
          </a>
          . Posts, reels e stories saem sozinhos no horário, pela API oficial da Meta.
        </p>
      </header>
      {error && <p role='alert' className='rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800'>Não foi possível ler a agenda ({error.code}).</p>}
      <section aria-label='Próximos' className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
        <h2 className='flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-semibold text-marca-800 sm:px-5'>
          <CalendarClock aria-hidden className='size-4 text-ouro-escuro' /> Próximos ({proximos.length})
        </h2>
        {proximos.length ? <ul className='divide-y divide-slate-100'>{proximos.map(i => <Linha key={i.id} i={i} />)}</ul> : <p className='px-5 py-6 text-sm text-slate-500'>Nada agendado.</p>}
      </section>
      <section aria-label='Publicados' className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
        <h2 className='border-b border-slate-100 px-4 py-3 font-semibold text-marca-800 sm:px-5'>Publicados pela agenda ({feitos.length})</h2>
        {feitos.length ? <ul className='divide-y divide-slate-100'>{feitos.map(i => <Linha key={i.id} i={i} />)}</ul> : <p className='px-5 py-6 text-sm text-slate-500'>Ainda nenhum.</p>}
      </section>
    </div>
  )
}
