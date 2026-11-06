'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, LoaderCircle, MapPin, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { excluirReuniao, salvarReuniao, type Retorno } from '@/app/dashboard/calendario/actions'
import { cn } from '@/lib/utils'

export type ReuniaoTela = {
  id: number
  titulo: string
  dia: string // AAAA-MM-DD em Brasília
  hi: string // HH:MM
  hf: string
  descricao: string | null
  local: string | null
  cnpj: string | null
  disparo_id: number | null
  autor: string
  cor: string
  podeEditar: boolean
}

export type Rascunho = Partial<Pick<ReuniaoTela, 'id' | 'titulo' | 'dia' | 'hi' | 'hf' | 'descricao' | 'local' | 'cnpj' | 'disparo_id'>>

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const ENTRADA = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'

const doisDig = (n: number) => String(n).padStart(2, '0')

export function Calendario({
  mes,
  hoje,
  reunioes,
  legenda,
  inicial,
  base
}: {
  mes: string // AAAA-MM
  hoje: string // AAAA-MM-DD
  reunioes: ReuniaoTela[]
  legenda: { nome: string; cor: string }[]
  inicial: Rascunho | null
  base: string
}) {
  const hrefMes = (mm: string) => `${base}?mes=${mm}`
  const [editando, setEditando] = useState<Rascunho | null>(inicial)
  const [vendo, setVendo] = useState<ReuniaoTela | null>(null)

  const [ano, m] = mes.split('-').map(Number)
  const primeiro = new Date(Date.UTC(ano, m - 1, 1, 12))
  const diasNoMes = new Date(Date.UTC(ano, m, 0, 12)).getUTCDate()
  const vazio = primeiro.getUTCDay()
  const celulas: (string | null)[] = [
    ...Array.from({ length: vazio }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${mes}-${doisDig(i + 1)}`)
  ]
  while (celulas.length % 7) celulas.push(null)
  const anterior = m === 1 ? `${ano - 1}-12` : `${ano}-${doisDig(m - 1)}`
  const seguinte = m === 12 ? `${ano + 1}-01` : `${ano}-${doisDig(m + 1)}`
  const porDia = new Map<string, ReuniaoTela[]>()
  for (const r of reunioes) porDia.set(r.dia, [...(porDia.get(r.dia) ?? []), r])

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <div className='flex items-center gap-1'>
          <Link href={hrefMes(anterior)} className='grid size-9 place-items-center rounded-lg border border-slate-200 bg-white hover:border-marca-300' aria-label='Mês anterior'>
            <ChevronLeft className='size-4' />
          </Link>
          <Link href={hrefMes(seguinte)} className='grid size-9 place-items-center rounded-lg border border-slate-200 bg-white hover:border-marca-300' aria-label='Próximo mês'>
            <ChevronRight className='size-4' />
          </Link>
        </div>
        <h2 className='font-serif text-2xl font-bold capitalize text-marca-800'>
          {MESES[m - 1]} <span className='font-normal text-slate-400'>{ano}</span>
        </h2>
        {mes !== hoje.slice(0, 7) && (
          <Link href={hrefMes(hoje.slice(0, 7))} className='text-xs font-semibold text-marca-700 hover:underline'>
            hoje
          </Link>
        )}
        <button
          type='button'
          onClick={() => setEditando({ dia: mes === hoje.slice(0, 7) ? hoje : `${mes}-01`, hi: '10:00', hf: '11:00' })}
          className='ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme shadow-md shadow-marca-900/15 hover:bg-marca-950'
        >
          <CalendarPlus className='size-4' /> Marcar reunião
        </button>
      </div>

      <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
        <div className='grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500'>
          {SEMANA.map(d => (
            <div key={d} className='py-2'>
              {d}
            </div>
          ))}
        </div>
        <div className='grid grid-cols-7'>
          {celulas.map((dia, i) => {
            const eventos = dia ? (porDia.get(dia) ?? []) : []
            return (
              <div
                key={i}
                onClick={() => dia && setEditando({ dia, hi: '10:00', hf: '11:00' })}
                className={cn(
                  'group min-h-[104px] border-b border-r border-slate-100 p-1.5 text-left align-top',
                  dia ? 'cursor-pointer hover:bg-marca-50/40' : 'bg-slate-50/50',
                  i % 7 === 6 && 'border-r-0'
                )}
              >
                {dia && (
                  <>
                    <span
                      className={cn(
                        'mb-1 inline-grid size-6 place-items-center rounded-full text-xs',
                        dia === hoje ? 'bg-marca-800 font-bold text-creme' : 'text-slate-500'
                      )}
                    >
                      {Number(dia.slice(8))}
                    </span>
                    <div className='space-y-0.5'>
                      {eventos.slice(0, 3).map(e => (
                        <button
                          key={e.id}
                          type='button'
                          onClick={ev => {
                            ev.stopPropagation()
                            setVendo(e)
                          }}
                          className={cn('block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium', e.cor)}
                          title={`${e.hi} ${e.titulo} — ${e.autor}`}
                        >
                          {e.hi} {e.titulo}
                        </button>
                      ))}
                      {eventos.length > 3 && <p className='px-1 text-[11px] text-slate-400'>+{eventos.length - 3} reuniões</p>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {legenda.length > 0 && (
        <div className='flex flex-wrap gap-3 text-xs text-slate-500'>
          {legenda.map(l => (
            <span key={l.nome} className='inline-flex items-center gap-1.5'>
              <span className={cn('size-2.5 rounded-full', l.cor)} /> {l.nome}
            </span>
          ))}
        </div>
      )}

      {vendo && (
        <Detalhe
          r={vendo}
          fechar={() => setVendo(null)}
          editar={() => {
            setEditando(vendo)
            setVendo(null)
          }}
        />
      )}
      {editando && <Formulario rascunho={editando} fechar={() => setEditando(null)} />}
    </div>
  )
}

function Janela({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div className='fixed inset-0 z-50 grid place-items-center bg-marca-950/40 p-4' onClick={fechar}>
      <div className='w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl' onClick={e => e.stopPropagation()}>
        <div className='mb-4 flex items-start justify-between gap-3'>
          <h3 className='font-serif text-xl font-bold text-marca-800'>{titulo}</h3>
          <button type='button' onClick={fechar} className='grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100' aria-label='Fechar'>
            <X className='size-4' />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Detalhe({ r, fechar, editar }: { r: ReuniaoTela; fechar: () => void; editar: () => void }) {
  const [pendente, iniciar] = useTransition()
  const [a, mm, d] = r.dia.split('-')
  return (
    <Janela titulo={r.titulo} fechar={fechar}>
      <div className='space-y-2 text-sm text-slate-700'>
        <p className='flex items-center gap-2'>
          <Clock className='size-4 text-ouro-escuro' /> {d}/{mm}/{a} · {r.hi}–{r.hf}
        </p>
        {r.local && (
          <p className='flex items-center gap-2 break-all'>
            <MapPin className='size-4 shrink-0 text-ouro-escuro' />
            {/^https?:\/\//.test(r.local) ? (
              <a href={r.local} target='_blank' rel='noreferrer' className='text-marca-700 hover:underline'>
                {r.local}
              </a>
            ) : (
              r.local
            )}
          </p>
        )}
        {r.descricao && <p className='whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-[13px]'>{r.descricao}</p>}
        <p className='text-xs text-slate-400'>Marcada por {r.autor}</p>
        <div className='flex flex-wrap gap-2 pt-1'>
          {r.cnpj && (
            <Link href={`/dashboard/empresa/${r.cnpj}`} className='inline-flex items-center gap-1 text-xs font-semibold text-marca-700 hover:underline'>
              <ExternalLink className='size-3' /> ficha da empresa
            </Link>
          )}
          {r.disparo_id && (
            <Link href={`/dashboard/disparos/${r.disparo_id}`} className='inline-flex items-center gap-1 text-xs font-semibold text-marca-700 hover:underline'>
              <ExternalLink className='size-3' /> conversa no WhatsApp
            </Link>
          )}
        </div>
      </div>
      {r.podeEditar && (
        <div className='mt-5 flex gap-2'>
          <button type='button' onClick={editar} className='inline-flex h-9 items-center rounded-lg bg-marca-800 px-4 text-sm font-semibold text-creme hover:bg-marca-950'>
            Editar
          </button>
          <button
            type='button'
            disabled={pendente}
            onClick={() => {
              if (!window.confirm('Excluir esta reunião?')) return
              iniciar(async () => {
                const res = await excluirReuniao(r.id)
                if (res.erro) toast.error(res.erro)
                else {
                  toast.success(res.mensagem ?? 'Excluída.')
                  fechar()
                }
              })
            }}
            className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60'
          >
            {pendente ? <LoaderCircle className='size-4 animate-spin' /> : <Trash2 className='size-4' />} Excluir
          </button>
        </div>
      )}
    </Janela>
  )
}

function Formulario({ rascunho, fechar }: { rascunho: Rascunho; fechar: () => void }) {
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(salvarReuniao, {})
  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem ?? 'Salvo.')
      fechar()
    }
  }, [estado, fechar])
  return (
    <Janela titulo={rascunho.id ? 'Editar reunião' : 'Marcar reunião'} fechar={fechar}>
      <form action={acao} className='space-y-3'>
        {rascunho.id && <input type='hidden' name='id' value={rascunho.id} />}
        {rascunho.disparo_id && <input type='hidden' name='disparo_id' value={rascunho.disparo_id} />}
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Título</span>
          <input name='titulo' defaultValue={rascunho.titulo} required maxLength={160} autoFocus className={ENTRADA} placeholder='Ex.: Apresentação para a Acme' />
        </label>
        <div className='grid grid-cols-[1fr_auto_auto] gap-2'>
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Dia</span>
            <input name='data' type='date' defaultValue={rascunho.dia} required className={ENTRADA} />
          </label>
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Início</span>
            <input name='hora_inicio' type='time' defaultValue={rascunho.hi ?? '10:00'} required className={ENTRADA} />
          </label>
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Fim</span>
            <input name='hora_fim' type='time' defaultValue={rascunho.hf ?? '11:00'} required className={ENTRADA} />
          </label>
        </div>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Local ou link da chamada</span>
          <input name='local' defaultValue={rascunho.local ?? ''} maxLength={300} className={ENTRADA} placeholder='https://meet.google.com/… ou endereço' />
        </label>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>CNPJ da empresa (opcional)</span>
          <input name='cnpj' defaultValue={rascunho.cnpj ?? ''} maxLength={20} className={ENTRADA} />
        </label>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Observações</span>
          <textarea name='descricao' defaultValue={rascunho.descricao ?? ''} rows={3} maxLength={4000} className={cn(ENTRADA, 'resize-y')} />
        </label>
        {estado.erro && <p className='rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'>{estado.erro}</p>}
        <div className='flex gap-2 pt-1'>
          <button type='submit' disabled={salvando} className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'>
            {salvando && <LoaderCircle className='size-4 animate-spin' />} Salvar
          </button>
          <button type='button' onClick={fechar} className='h-10 rounded-full px-4 text-sm text-slate-500 hover:text-slate-800'>
            Cancelar
          </button>
        </div>
      </form>
    </Janela>
  )
}
