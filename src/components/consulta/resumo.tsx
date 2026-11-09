import { LinkNav } from './contexto'
import { BarrasDistribuicao, CartoesIndicadores, ordenarPorte } from './indicadores'
import { resumoEmpresas } from '@/lib/empresas/consulta'
import { alternar, hrefConsulta, type ChaveFiltro, type Consulta, type Filtros } from '@/lib/empresas/filtros'
import type { ItemResumo, Opcoes } from '@/lib/empresas/tipos'

export async function Resumo({ consulta, opcoes }: { consulta: Consulta; opcoes: Opcoes }) {
  const { total, dims } = await resumoEmpresas(JSON.stringify(consulta.filtros))

  const barras = (titulo: string, itens: ItemResumo[] | undefined, chave: ChaveFiltro, limite = 6) => {
    const selecionados = (consulta.filtros[chave] as string[] | undefined) ?? []
    return (
      <BarrasDistribuicao
        titulo={titulo}
        itens={itens}
        limite={limite}
        selecionados={selecionados}
        Componente={LinkNav}
        hrefDe={item =>
          hrefConsulta({
            filtros: { ...consulta.filtros, [chave]: alternar(selecionados, item.chave) } as Filtros,
            ordem: consulta.ordem,
            por: consulta.por
          })
        }
      />
    )
  }

  return (
    <div className='space-y-4'>
      <CartoesIndicadores total={total} base={opcoes.total_base} />
      {total.n > 0 && (
        <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-4'>
          {barras('Setores', dims.setor, 'setores')}
          {barras('Ramos', dims.ramo, 'ramos')}
          {barras('Municípios', dims.municipio, 'municipios')}
          {barras('Porte', ordenarPorte(dims.porte), 'portes', 4)}
        </div>
      )}
    </div>
  )
}

export function ResumoCarregando() {
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='h-[106px] animate-pulse rounded-2xl border border-slate-200 bg-white' />
        ))}
      </div>
      <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='h-56 animate-pulse rounded-2xl border border-slate-200 bg-white' />
        ))}
      </div>
    </div>
  )
}
