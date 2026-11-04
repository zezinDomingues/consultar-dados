import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { BarraAcoes } from '@/components/consulta/barra-acoes'
import { AreaResultados, ConsultaProvider, LinkNav } from '@/components/consulta/contexto'
import { FiltrosAtivos } from '@/components/consulta/filtros-ativos'
import { PainelFiltros } from '@/components/consulta/painel-filtros'
import { Resultados, ResultadosCarregando } from '@/components/consulta/resultados'
import { Resumo, ResumoCarregando } from '@/components/consulta/resumo'
import { opcoesFiltros } from '@/lib/empresas/consulta'
import { contarFiltros, hrefConsulta, lerDeSearchParams, type Filtros } from '@/lib/empresas/filtros'
import { fmtInt } from '@/lib/formatar'

const ATALHOS: { rotulo: string; filtros: Filtros }[] = [
  {
    rotulo: 'Lucro Real com WhatsApp',
    filtros: { regimes: ['Lucro Real'], situacoes_regime: ['Recente (ECF 2024)'], com_whatsapp: true }
  },
  { rotulo: 'Prioridade A na Capital', filtros: { prioridades: ['A'], localizacoes: ['Capital'] } },
  {
    rotulo: 'Indústrias médias/grandes no interior',
    filtros: { setores: ['C'], portes: ['Demais (médio/grande)'], localizacoes: ['Interior'] }
  },
  { rotulo: 'Saúde com contato próprio', filtros: { setores: ['Q'], contato_proprio: true, tipos_negocio: ['Operacional'] } },
  { rotulo: 'Farmácias de manipulação', filtros: { cnaes: ['4771702'] } },
  { rotulo: 'Construtoras com 20+ anos', filtros: { ramos: ['41'], idade_min: 20, tipos_negocio: ['Operacional'] } }
]

export default async function ConsultarPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const consulta = lerDeSearchParams(await searchParams)
  const opcoes = await opcoesFiltros()
  const chave = JSON.stringify(consulta.filtros)
  const semFiltro = contarFiltros(consulta.filtros) === 0

  return (
    <ConsultaProvider>
      <div className='flex'>
        <PainelFiltros consulta={consulta} opcoes={opcoes} />
        <AreaResultados>
          <header className='flex flex-wrap items-end justify-between gap-4'>
            <div>
              <h1 className='text-xl font-semibold'>Consultar empresas</h1>
              <p className='text-sm text-slate-500'>
                {fmtInt(opcoes.total_base)} empresas de SP com Lucro Real ou Presumido · uma por CNPJ raiz
              </p>
            </div>
            <BarraAcoes consulta={consulta} />
          </header>

          {semFiltro ? (
            <div className='flex flex-wrap items-center gap-2'>
              <span className='flex items-center gap-1.5 text-xs font-medium text-slate-500'>
                <Sparkles className='size-3.5 text-marca-500' /> Atalhos
              </span>
              {ATALHOS.map(a => (
                <LinkNav
                  key={a.rotulo}
                  href={hrefConsulta({ filtros: a.filtros })}
                  className='rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-marca-300 hover:text-marca-800'
                >
                  {a.rotulo}
                </LinkNav>
              ))}
            </div>
          ) : (
            <FiltrosAtivos consulta={consulta} opcoes={opcoes} />
          )}

          <Suspense key={`r:${chave}`} fallback={<ResumoCarregando />}>
            <Resumo consulta={consulta} opcoes={opcoes} />
          </Suspense>

          <Suspense key={`t:${chave}:${consulta.ordem}:${consulta.pagina}:${consulta.por}`} fallback={<ResultadosCarregando />}>
            <Resultados consulta={consulta} />
          </Suspense>
        </AreaResultados>
      </div>
    </ConsultaProvider>
  )
}
