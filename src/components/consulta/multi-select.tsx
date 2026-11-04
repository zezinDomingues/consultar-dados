'use client'

import { useMemo, useState } from 'react'
import { Popover } from 'radix-ui'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { fmtInt } from '@/lib/formatar'
import type { Opcao } from '@/lib/empresas/tipos'
import { cn } from '@/lib/utils'

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const LIMITE = 200

export function MultiSelect({
  rotulo,
  opcoes,
  selecionados,
  aoMudar,
  mostrarCodigo = false,
  placeholder = 'Todos'
}: {
  rotulo: string
  opcoes: Opcao[]
  selecionados?: string[]
  aoMudar: (valores: string[] | undefined) => void
  mostrarCodigo?: boolean
  placeholder?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const sel = useMemo(() => new Set(selecionados ?? []), [selecionados])
  const porChave = useMemo(() => new Map(opcoes.map(o => [o.chave, o])), [opcoes])

  const filtradas = useMemo(() => {
    const b = normalizar(busca.trim())
    const base = b
      ? opcoes.filter(o => normalizar(o.nome).includes(b) || o.chave.startsWith(b) || o.cod?.startsWith(busca.trim()))
      : opcoes
    return base.filter(o => !sel.has(o.chave)).slice(0, LIMITE)
  }, [busca, opcoes, sel])

  const nomeDe = (chave: string) => porChave.get(chave)?.nome ?? chave
  const lista = [...sel]
  const resumo = lista.length === 0 ? placeholder : lista.length === 1 ? nomeDe(lista[0]) : `${nomeDe(lista[0])} +${lista.length - 1}`

  const alternar = (chave: string) => {
    const s = new Set(sel)
    if (s.has(chave)) s.delete(chave)
    else s.add(chave)
    aoMudar(s.size ? [...s] : undefined)
  }

  const Item = ({ o, marcado }: { o: Opcao; marcado: boolean }) => (
    <button
      type='button'
      role='checkbox'
      aria-checked={marcado}
      onClick={() => alternar(o.chave)}
      className='flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100'
    >
      <span
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
          marcado ? 'border-marca-700 bg-marca-700 text-white' : 'border-slate-300 bg-white'
        )}
      >
        {marcado && <Check className='size-3' strokeWidth={3} />}
      </span>
      <span className='min-w-0 flex-1 leading-snug'>
        {mostrarCodigo && o.cod && <span className='mr-1.5 font-mono text-[11px] text-slate-400'>{o.cod}</span>}
        {o.nome}
      </span>
      <span className='shrink-0 pt-0.5 text-xs tabular-nums text-slate-400'>{fmtInt(o.n)}</span>
    </button>
  )

  return (
    <div className='space-y-1.5'>
      <span className='text-xs font-medium text-slate-600'>{rotulo}</span>
      <Popover.Root open={aberto} onOpenChange={a => (setAberto(a), a || setBusca(''))}>
        <Popover.Trigger asChild>
          <button
            type='button'
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm transition',
              lista.length ? 'border-marca-300 text-marca-900 ring-2 ring-marca-50' : 'border-slate-200 text-slate-500',
              'hover:border-marca-300'
            )}
          >
            <span className='min-w-0 flex-1 truncate'>{resumo}</span>
            {lista.length > 0 ? (
              <span
                role='button'
                aria-label={`Limpar ${rotulo}`}
                onClick={e => (e.stopPropagation(), aoMudar(undefined))}
                className='rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
              >
                <X className='size-3.5' />
              </span>
            ) : (
              <ChevronsUpDown className='size-3.5 text-slate-400' />
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align='start'
            sideOffset={6}
            collisionPadding={12}
            style={{ width: 'max(var(--radix-popover-trigger-width), 340px)' }}
            className='z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10'
          >
            <div className='relative mb-2'>
              <Search className='absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400' />
              <input
                autoFocus
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder={`Buscar ${rotulo.toLowerCase()}…`}
                className='h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-sm outline-none focus:border-marca-400'
              />
            </div>
            <div className='max-h-80 overflow-y-auto overscroll-contain'>
              {lista.length > 0 && (
                <div className='mb-1 border-b border-slate-100 pb-1'>
                  {lista.map(chave => (
                    <Item key={chave} o={porChave.get(chave) ?? { chave, nome: chave, n: 0 }} marcado />
                  ))}
                </div>
              )}
              {filtradas.map(o => (
                <Item key={o.chave} o={o} marcado={false} />
              ))}
              {filtradas.length === 0 && <p className='px-2 py-6 text-center text-sm text-slate-400'>Nada encontrado</p>}
              {filtradas.length === LIMITE && (
                <p className='px-2 py-2 text-center text-xs text-slate-400'>Mostrando {LIMITE}. Digite para refinar.</p>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
