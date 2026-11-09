import { X } from 'lucide-react'
import { LinkNav } from './contexto'
import { FOCO } from '@/components/ui/foco'
import { hrefConsulta, type Consulta, type Filtros } from '@/lib/empresas/filtros'
import { rotulosFiltros } from '@/lib/empresas/rotulos'
import type { Opcoes } from '@/lib/empresas/tipos'
import { cn } from '@/lib/utils'

/** Mostra cada filtro aplicado como um chip removível. */
export function FiltrosAtivos({ consulta, opcoes }: { consulta: Consulta; opcoes: Opcoes }) {
  const f = consulta.filtros
  const chips = rotulosFiltros(f, opcoes).map(r => {
    const atual = f[r.chave]
    let sem: Filtros
    if (Array.isArray(atual) && r.valor !== undefined) {
      const resto = (atual as string[]).filter(x => x !== r.valor)
      sem = { ...f, [r.chave]: resto.length ? resto : undefined } as Filtros
    } else sem = { ...f, [r.chave]: undefined } as Filtros
    return { rotulo: r.rotulo, sem }
  })

  if (!chips.length) return null

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {chips.map(c => (
        <LinkNav
          key={c.rotulo}
          href={hrefConsulta({ filtros: c.sem, ordem: consulta.ordem, por: consulta.por })}
          title='Remover filtro'
          aria-label={`Remover filtro: ${c.rotulo}`}
          className={cn(
            'group inline-flex max-w-full items-center gap-1 rounded-full border border-marca-200 bg-marca-50 py-1 pl-2.5 pr-1.5 text-xs text-marca-900 hover:border-marca-300 hover:bg-marca-100 sm:max-w-xs',
            FOCO
          )}
        >
          <span className='truncate'>{c.rotulo}</span>
          <X className='size-3.5 shrink-0 text-marca-500 group-hover:text-marca-800' aria-hidden />
        </LinkNav>
      ))}
      {chips.length > 1 && (
        <LinkNav
          href={hrefConsulta({ filtros: {}, ordem: consulta.ordem, por: consulta.por })}
          className={cn('rounded-sm px-2 text-xs text-slate-500 hover:text-marca-700', FOCO)}
        >
          Limpar tudo
        </LinkNav>
      )}
    </div>
  )
}
