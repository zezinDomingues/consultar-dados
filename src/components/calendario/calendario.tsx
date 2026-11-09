'use client'

import { startTransition, useActionState, useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, LoaderCircle, MapPin, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { excluirReuniao, salvarReuniao, type Retorno } from '@/app/dashboard/calendario/actions'
import { cn } from '@/lib/utils'
import { agoraBrasilia, horarioPadrao } from './horario'

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
  grupo_id: number
  grupo: string
  autor: string
  cor: string
  podeEditar: boolean
}

export type Rascunho = Partial<Pick<ReuniaoTela, 'id' | 'titulo' | 'dia' | 'hi' | 'hf' | 'descricao' | 'local' | 'cnpj' | 'disparo_id' | 'grupo_id'>>

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const SEMANA_LONGA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const ENTRADA =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
/** Anel de foco só para teclado (Tab), em todo controle. */
const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2'
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const doisDig = (n: number) => String(n).padStart(2, '0')
/** "sexta-feira, 20 de novembro" a partir de AAAA-MM-DD (meio-dia UTC: o dia não muda com o fuso). */
const porExtenso = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`)
  return `${SEMANA_LONGA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}
const nReunioes = (n: number) => `${n} ${n === 1 ? 'reunião' : 'reuniões'}`

export function Calendario({
  mes,
  hoje,
  reunioes,
  legenda,
  inicial,
  base,
  grupos,
  grupoAtual
}: {
  mes: string // AAAA-MM
  hoje: string // AAAA-MM-DD
  reunioes: ReuniaoTela[]
  legenda: { nome: string; cor: string }[]
  inicial: Rascunho | null
  base: string
  grupos: { id: number; nome: string }[]
  grupoAtual?: number
}) {
  const hrefMes = (mm: string) => `${base}?mes=${mm}${grupoAtual ? `&g=${grupoAtual}` : ''}`
  const hrefGrupo = (g?: number) => `${base}?mes=${mes}${g ? `&g=${g}` : ''}`
  const [editando, setEditando] = useState<Rascunho | null>(inicial)
  const [vendo, setVendo] = useState<ReuniaoTela | null>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  // hoje sugere a próxima hora cheia (não nasce no passado); o botão geral pula para amanhã depois das 22h
  const marcar = (dia: string, podeMudarDia = false) => setEditando(horarioPadrao(dia, agoraBrasilia(), podeMudarDia))

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
  const diasComReuniao = [...porDia.keys()].filter(d => d.startsWith(mes)).sort()
  const chip = (ativo: boolean) =>
    cn('rounded-full px-3 py-1.5 text-xs font-semibold', FOCO, ativo ? 'bg-marca-800 text-creme' : 'border border-slate-200 bg-white text-slate-600 hover:border-marca-300')

  return (
    <div className='min-w-0 space-y-4'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <div className='flex items-center gap-1'>
          <Link href={hrefMes(anterior)} className={cn('grid size-9 place-items-center rounded-lg border border-slate-200 bg-white hover:border-marca-300', FOCO)} aria-label='Mês anterior'>
            <ChevronLeft className='size-4' />
          </Link>
          <Link href={hrefMes(seguinte)} className={cn('grid size-9 place-items-center rounded-lg border border-slate-200 bg-white hover:border-marca-300', FOCO)} aria-label='Próximo mês'>
            <ChevronRight className='size-4' />
          </Link>
        </div>
        <h2 className='font-serif text-2xl font-bold capitalize text-marca-800'>
          {MESES[m - 1]} <span className='font-normal text-slate-500'>{ano}</span>
        </h2>
        {mes !== hoje.slice(0, 7) && (
          <Link href={hrefMes(hoje.slice(0, 7))} className={cn('rounded text-xs font-semibold text-marca-700 hover:underline', FOCO)}>
            voltar para hoje
          </Link>
        )}
        {grupos.length > 1 && (
          <nav aria-label='Grupo do calendário' className='flex flex-wrap gap-1'>
            <Link href={hrefGrupo()} aria-current={!grupoAtual ? 'page' : undefined} className={chip(!grupoAtual)}>
              Todos os meus grupos
            </Link>
            {grupos.map(g => (
              <Link key={g.id} href={hrefGrupo(g.id)} aria-current={grupoAtual === g.id ? 'page' : undefined} className={chip(grupoAtual === g.id)}>
                {g.nome}
              </Link>
            ))}
          </nav>
        )}
        <button
          type='button'
          onClick={() => marcar(mes === hoje.slice(0, 7) ? hoje : `${mes}-01`, true)}
          className={cn('ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme shadow-md shadow-marca-900/15 hover:bg-marca-950', FOCO)}
        >
          <CalendarPlus className='size-4' /> Marcar reunião
        </button>
      </div>

      {/* tablet e computador: grade do mês */}
      <div className='hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03] md:block'>
        <div aria-hidden className='grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500'>
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
              // o clique no espaço vazio é só atalho de mouse; pelo teclado, o número do dia é o botão
              <div
                key={i}
                onClick={() => dia && marcar(dia)}
                className={cn(
                  'min-h-[104px] min-w-0 border-b border-r border-slate-100 p-1.5 text-left align-top',
                  dia ? 'cursor-pointer hover:bg-marca-50/40' : 'bg-slate-50/50',
                  i % 7 === 6 && 'border-r-0'
                )}
              >
                {dia && (
                  <>
                    <button
                      type='button'
                      onClick={ev => {
                        ev.stopPropagation()
                        marcar(dia)
                      }}
                      aria-current={dia === hoje ? 'date' : undefined}
                      aria-label={`${porExtenso(dia)}${dia === hoje ? ' (hoje)' : ''}${eventos.length ? `, ${nReunioes(eventos.length)}` : ''}: marcar reunião`}
                      title='Marcar reunião neste dia'
                      className={cn(
                        'mb-1 inline-grid size-7 place-items-center rounded-full text-xs',
                        FOCO,
                        dia === hoje ? 'bg-marca-800 font-bold text-creme' : 'text-slate-600 hover:bg-marca-100'
                      )}
                    >
                      {Number(dia.slice(8))}
                    </button>
                    <div className='space-y-0.5'>
                      {eventos.slice(0, 3).map(e => (
                        <button
                          key={e.id}
                          type='button'
                          onClick={ev => {
                            ev.stopPropagation()
                            setVendo(e)
                          }}
                          className={cn('block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium', FOCO, e.cor)}
                          title={`${e.hi} ${e.titulo} — ${e.autor}`}
                        >
                          {e.hi} {e.titulo}
                        </button>
                      ))}
                      {eventos.length > 3 && (
                        <button
                          type='button'
                          onClick={ev => {
                            ev.stopPropagation()
                            setDiaAberto(dia)
                          }}
                          className={cn('rounded px-1 text-[11px] font-semibold text-marca-700 hover:underline', FOCO)}
                        >
                          +{nReunioes(eventos.length - 3)}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* celular: agenda em lista, só os dias com reunião */}
      <div className='rounded-2xl border border-slate-200 bg-white md:hidden'>
        {diasComReuniao.length === 0 ? (
          <p className='px-4 py-8 text-center text-sm text-slate-500'>Nenhuma reunião em {MESES[m - 1]}.</p>
        ) : (
          <ol className='divide-y divide-slate-100'>
            {diasComReuniao.map(dia => (
              <li key={dia} className='px-3 py-3'>
                <div className='flex items-center justify-between gap-2'>
                  <h3 className='text-xs font-bold uppercase tracking-wide text-slate-600'>
                    {porExtenso(dia)}
                    {dia === hoje && <span className='ml-2 rounded-full bg-marca-800 px-2 py-0.5 text-[10px] text-creme'>hoje</span>}
                  </h3>
                  <button
                    type='button'
                    onClick={() => marcar(dia)}
                    aria-label={`Marcar reunião em ${porExtenso(dia)}`}
                    className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-marca-700 hover:bg-marca-50', FOCO)}
                  >
                    <Plus className='size-4' />
                  </button>
                </div>
                <ul className='mt-1.5 space-y-1.5'>
                  {(porDia.get(dia) ?? []).map(e => (
                    <li key={e.id}>
                      <button
                        type='button'
                        onClick={() => setVendo(e)}
                        className={cn('flex w-full items-stretch gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-left hover:border-marca-200', FOCO)}
                      >
                        <span aria-hidden className={cn('w-1.5 shrink-0 rounded-full', e.cor)} />
                        <span className='min-w-0 flex-1'>
                          <span className='block text-xs font-semibold tabular-nums text-slate-600'>
                            {e.hi}–{e.hf}
                          </span>
                          <span className='block break-words font-medium text-slate-800'>{e.titulo}</span>
                          <span className='block truncate text-xs text-slate-500'>
                            {e.autor}
                            {grupos.length > 1 ? ` · ${e.grupo}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {legenda.length > 0 && (
        <div className='flex flex-wrap gap-3 text-xs text-slate-600'>
          {legenda.map(l => (
            <span key={l.nome} className='inline-flex items-center gap-1.5'>
              <span aria-hidden className={cn('size-2.5 rounded-full', l.cor)} /> {l.nome}
            </span>
          ))}
        </div>
      )}

      {diaAberto && (
        <Janela titulo={`Reuniões de ${porExtenso(diaAberto)}`} fechar={() => setDiaAberto(null)}>
          <ul className='space-y-1.5'>
            {(porDia.get(diaAberto) ?? []).map(e => (
              <li key={e.id}>
                <button
                  type='button'
                  onClick={() => {
                    setDiaAberto(null)
                    setVendo(e)
                  }}
                  className={cn('flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-left text-sm hover:border-marca-200', FOCO)}
                >
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', e.cor)} />
                  <span className='shrink-0 tabular-nums text-slate-600'>{e.hi}</span>
                  <span className='min-w-0 flex-1 truncate font-medium text-slate-800'>{e.titulo}</span>
                </button>
              </li>
            ))}
          </ul>
        </Janela>
      )}
      {vendo && (
        <Detalhe
          r={vendo}
          mostrarGrupo={grupos.length > 1}
          fechar={() => setVendo(null)}
          editar={() => {
            setEditando(vendo)
            setVendo(null)
          }}
        />
      )}
      {editando && <Formulario rascunho={editando} fechar={() => setEditando(null)} grupos={grupos} grupoPadrao={grupoAtual ?? grupos[0]?.id} hoje={hoje} />}
    </div>
  )
}

/**
 * Janela modal acessível: role=dialog + aria-modal, foco inicial (campo com data-autofoco ou a própria caixa),
 * Tab preso dentro, Esc fecha, o foco volta para quem abriu e o fundo não rola. O miolo rola por dentro e o
 * rodapé (botões) fica sempre visível, mesmo num celular baixo.
 */
function Janela({ titulo, fechar, children, rodape }: { titulo: string; fechar: () => void; children: React.ReactNode; rodape?: React.ReactNode }) {
  const idTitulo = useId()
  const caixa = useRef<HTMLDivElement>(null)
  const fecharRef = useRef(fechar)
  const apertouNoFundo = useRef(false)
  useEffect(() => {
    fecharRef.current = fechar
  })
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(el.querySelector<HTMLElement>('[data-autofoco]') ?? el).focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        fecharRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const itens = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(x => x.offsetParent !== null)
      if (!itens.length) return
      const primeiro = itens[0]
      const ultimo = itens[itens.length - 1]
      const atual = document.activeElement
      if (e.shiftKey && (atual === primeiro || atual === el || !el.contains(atual))) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (atual === ultimo || !el.contains(atual))) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      if (antes?.isConnected) antes.focus()
    }
  }, [])

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-marca-950/40 p-3 sm:p-4'
      // fecha só com clique que começou e terminou no fundo (arrastar uma seleção de texto para fora não fecha)
      onMouseDown={e => (apertouNoFundo.current = e.target === e.currentTarget)}
      onClick={e => apertouNoFundo.current && e.target === e.currentTarget && fechar()}
    >
      <div
        ref={caixa}
        role='dialog'
        aria-modal='true'
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className='flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-2rem)]'
      >
        <div className='flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-5'>
          <h3 id={idTitulo} className='min-w-0 break-words font-serif text-xl font-bold text-marca-800'>
            {titulo}
          </h3>
          <button type='button' onClick={fechar} className={cn('grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100', FOCO)} aria-label='Fechar'>
            <X className='size-4' />
          </button>
        </div>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1'>{children}</div>
        {rodape && <div className='shrink-0 border-t border-slate-100 px-5 py-3'>{rodape}</div>}
      </div>
    </div>
  )
}

function Detalhe({ r, mostrarGrupo, fechar, editar }: { r: ReuniaoTela; mostrarGrupo: boolean; fechar: () => void; editar: () => void }) {
  const [pendente, iniciar] = useTransition()
  const [a, mm, d] = r.dia.split('-')
  return (
    <Janela
      titulo={r.titulo}
      fechar={fechar}
      rodape={
        r.podeEditar && (
          <div className='flex flex-wrap gap-2'>
            <button type='button' onClick={editar} className={cn('inline-flex h-10 items-center rounded-full bg-marca-800 px-5 text-sm font-semibold text-creme hover:bg-marca-950', FOCO)}>
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
              className={cn('inline-flex h-10 items-center gap-1.5 rounded-full border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60', FOCO)}
            >
              {pendente ? <LoaderCircle className='size-4 animate-spin' /> : <Trash2 className='size-4' />} Excluir
            </button>
          </div>
        )
      }
    >
      <div className='space-y-2 text-sm text-slate-700'>
        <p className='flex items-center gap-2'>
          <Clock aria-hidden className='size-4 shrink-0 text-ouro-escuro' /> {d}/{mm}/{a} · {r.hi}–{r.hf}
        </p>
        {r.local && (
          <p className='flex items-center gap-2 break-all'>
            <MapPin aria-hidden className='size-4 shrink-0 text-ouro-escuro' />
            {/^https?:\/\//.test(r.local) ? (
              <a href={r.local} target='_blank' rel='noreferrer' className={cn('rounded text-marca-700 hover:underline', FOCO)}>
                {r.local}
              </a>
            ) : (
              r.local
            )}
          </p>
        )}
        {r.descricao && <p className='whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-[13px]'>{r.descricao}</p>}
        <p className='text-xs text-slate-500'>
          Marcada por {r.autor}
          {mostrarGrupo ? ` · grupo ${r.grupo}` : ''}
        </p>
        <div className='flex flex-wrap gap-3 pt-1'>
          {r.cnpj && (
            <Link href={`/dashboard/empresa/${r.cnpj}`} className={cn('inline-flex items-center gap-1 rounded text-xs font-semibold text-marca-700 hover:underline', FOCO)}>
              <ExternalLink aria-hidden className='size-3' /> ficha da empresa
            </Link>
          )}
          {r.disparo_id && (
            <Link href={`/dashboard/disparos/${r.disparo_id}`} className={cn('inline-flex items-center gap-1 rounded text-xs font-semibold text-marca-700 hover:underline', FOCO)}>
              <ExternalLink aria-hidden className='size-3' /> conversa no WhatsApp
            </Link>
          )}
        </div>
      </div>
    </Janela>
  )
}

function Formulario({
  rascunho,
  fechar,
  grupos,
  grupoPadrao,
  hoje
}: {
  rascunho: Rascunho
  fechar: () => void
  grupos: { id: number; nome: string }[]
  grupoPadrao?: number
  hoje: string
}) {
  const idForm = useId()
  const novo = !rascunho.id
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(salvarReuniao, {})
  const [data, setData] = useState(rascunho.dia ?? hoje)
  const [hi, setHi] = useState(rascunho.hi ?? '10:00')
  const [hf, setHf] = useState(rascunho.hf ?? '11:00')
  // a hora "agora" só existe no navegador (evita diferença entre o HTML do servidor e o da tela)
  const [agora, setAgora] = useState<string | null>(null)
  const refData = useRef<HTMLInputElement>(null)
  const refInicio = useRef<HTMLInputElement>(null)
  const refFim = useRef<HTMLInputElement>(null)
  const fecharRef = useRef(fechar)
  useEffect(() => {
    fecharRef.current = fechar
  })
  useEffect(() => setAgora(agoraBrasilia()), [])
  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem ?? 'Salvo.')
      fecharRef.current()
    }
  }, [estado])

  const diaPassou = !!agora && !!data && data < agora.slice(0, 10)
  const horaPassou = !!agora && !diaPassou && !!data && !!hi && `${data} ${hi}` < agora
  const fimAntes = !!hi && !!hf && hf <= hi
  const avisoData = diaPassou ? 'Esse dia já passou.' : horaPassou ? 'Esse horário de hoje já passou.' : null
  // reunião nova no passado o servidor recusa: o navegador já barra antes de enviar (editar uma antiga só avisa)
  useEffect(() => {
    refData.current?.setCustomValidity(novo && diaPassou ? 'Esse dia já passou: escolha hoje ou uma data futura.' : '')
    refInicio.current?.setCustomValidity(novo && horaPassou ? 'Esse horário já passou: escolha um horário futuro.' : '')
    refFim.current?.setCustomValidity(fimAntes ? 'O fim precisa ser depois do início.' : '')
  }, [novo, diaPassou, horaPassou, fimAntes])

  // envio sem o "reset" automático do React 19: se o servidor recusar, o que foi digitado continua nos campos
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => acao(fd))
  }

  return (
    <Janela
      titulo={novo ? 'Marcar reunião' : 'Editar reunião'}
      fechar={fechar}
      rodape={
        <>
          {estado.erro && (
            <p role='alert' className='mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'>
              {estado.erro}
            </p>
          )}
          <div className='flex gap-2'>
            <button
              type='submit'
              form={idForm}
              disabled={salvando}
              className={cn('inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60', FOCO)}
            >
              {salvando && <LoaderCircle className='size-4 animate-spin' />} Salvar
            </button>
            <button type='button' onClick={fechar} className={cn('h-10 rounded-full px-4 text-sm text-slate-600 hover:text-slate-900', FOCO)}>
              Cancelar
            </button>
          </div>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} className='space-y-3'>
        {rascunho.id && <input type='hidden' name='id' value={rascunho.id} />}
        {rascunho.disparo_id && <input type='hidden' name='disparo_id' value={rascunho.disparo_id} />}
        {grupos.length > 1 ? (
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Grupo (quem vê esta reunião)</span>
            <select name='grupo_id' defaultValue={rascunho.grupo_id ?? grupoPadrao} className={ENTRADA}>
              {grupos.map(g => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type='hidden' name='grupo_id' value={rascunho.grupo_id ?? grupoPadrao ?? ''} />
        )}
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Título</span>
          <input name='titulo' defaultValue={rascunho.titulo} required maxLength={160} data-autofoco className={ENTRADA} placeholder='Ex.: Apresentação para a Acme' />
        </label>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]'>
          <label className='col-span-2 block min-w-0 space-y-1 sm:col-span-1'>
            <span className='text-xs font-semibold text-slate-600'>Dia</span>
            <input
              ref={refData}
              name='data'
              type='date'
              defaultValue={rascunho.dia}
              min={novo ? hoje : undefined}
              onChange={e => setData(e.target.value)}
              required
              aria-invalid={novo && diaPassou ? true : undefined}
              aria-describedby={avisoData ? `${idForm}-aviso` : undefined}
              className={ENTRADA}
            />
          </label>
          <label className='block min-w-0 space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Início</span>
            <input
              ref={refInicio}
              name='hora_inicio'
              type='time'
              defaultValue={rascunho.hi ?? '10:00'}
              onChange={e => setHi(e.target.value)}
              required
              aria-invalid={novo && horaPassou ? true : undefined}
              className={ENTRADA}
            />
          </label>
          <label className='block min-w-0 space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Fim</span>
            <input
              ref={refFim}
              name='hora_fim'
              type='time'
              defaultValue={rascunho.hf ?? '11:00'}
              onChange={e => setHf(e.target.value)}
              required
              aria-invalid={fimAntes || undefined}
              aria-describedby={fimAntes ? `${idForm}-fim` : undefined}
              className={ENTRADA}
            />
          </label>
        </div>
        {avisoData && (
          <p id={`${idForm}-aviso`} role='alert' className='flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900'>
            <AlertTriangle aria-hidden className='mt-px size-3.5 shrink-0' />
            {novo ? `${avisoData} Escolha um dia e um horário a partir de agora.` : `${avisoData} Confira a data antes de salvar.`}
          </p>
        )}
        {fimAntes && (
          <p id={`${idForm}-fim`} role='alert' className='flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900'>
            <AlertTriangle aria-hidden className='mt-px size-3.5 shrink-0' /> O fim precisa ser depois do início.
          </p>
        )}
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Local ou link da chamada</span>
          <input name='local' defaultValue={rascunho.local ?? ''} maxLength={300} className={ENTRADA} placeholder='https://meet.google.com/… ou endereço' />
        </label>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>CNPJ da empresa (opcional)</span>
          <input name='cnpj' defaultValue={rascunho.cnpj ?? ''} maxLength={20} inputMode='numeric' className={ENTRADA} />
        </label>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Observações</span>
          <textarea name='descricao' defaultValue={rascunho.descricao ?? ''} rows={3} maxLength={4000} className={cn(ENTRADA, 'resize-y')} />
        </label>
      </form>
    </Janela>
  )
}
