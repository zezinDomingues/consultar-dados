'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Download, LoaderCircle, Plus, SearchX, TriangleAlert } from 'lucide-react'
import { BarrasDistribuicao, CartoesIndicadores, ordenarPorte } from '@/components/consulta/indicadores'
import { TabelaEmpresas } from '@/components/consulta/tabela-empresas'
import { FOCO } from '@/components/ui/foco'
import type { AnexoConsulta } from '@/lib/agente/tipos'
import { alternar, hrefConsulta, LIMITE_EXPORTACAO, paraQuery, type ChaveFiltro, type Filtros } from '@/lib/empresas/filtros'
import type { EmpresaLista, ItemResumo } from '@/lib/empresas/tipos'
import { fmtInt } from '@/lib/formatar'
import { cn } from '@/lib/utils'

const POR = 10

/** Resultado de uma busca do agente, no mesmo formato da tela de Consulta. */
export function PainelConsulta({ anexo }: { anexo: AnexoConsulta }) {
  const [empresas, setEmpresas] = useState<EmpresaLista[]>(anexo.empresas)
  const [carregando, setCarregando] = useState(false)
  useEffect(() => setEmpresas(anexo.empresas), [anexo])

  const { total, dims } = anexo.resumo
  const qs = paraQuery({ filtros: anexo.filtros, ordem: anexo.ordem })
  const f = anexo.filtros

  // Exportar: o CSV sai com no máximo LIMITE_EXPORTACAO linhas. Antes de baixar, pergunta o total ao servidor
  // (GET /api/exportar?…&contar=1, o mesmo aviso da barra da Consulta); se a pergunta falhar, usa o total que
  // a busca do agente já trouxe. Acima do limite, avisa e pede confirmação.
  const hrefExportar = `/api/exportar?${qs}`
  const [conferindo, setConferindo] = useState(false)
  const [corte, setCorte] = useState<number | null>(null)
  const baixarRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (corte !== null) baixarRef.current?.focus()
  }, [corte])

  function baixar() {
    setCorte(null)
    window.location.href = hrefExportar
  }

  async function exportar(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (conferindo) return
    let n: number = total.n
    setConferindo(true)
    const ctrl = new AbortController()
    const prazo = setTimeout(() => ctrl.abort(), 8000)
    try {
      const r = await fetch(`${hrefExportar}${qs ? '&' : ''}contar=1`, { cache: 'no-store', signal: ctrl.signal })
      if (r.ok && r.headers.get('content-type')?.includes('json')) {
        const j = (await r.json()) as { total?: number }
        if (typeof j.total === 'number') n = j.total
      } else ctrl.abort()
    } catch {
      // sem resposta: fica o total da busca
    } finally {
      clearTimeout(prazo)
      setConferindo(false)
    }
    if (n > LIMITE_EXPORTACAO) setCorte(n)
    else baixar()
  }

  async function carregarMais() {
    setCarregando(true)
    try {
      const pagina = Math.floor(empresas.length / POR) + 1
      const r = await fetch(`/api/empresas?${qs ? `${qs}&` : ''}pagina=${pagina}&por=${POR}`)
      if (r.ok) {
        const novas: EmpresaLista[] = await r.json()
        setEmpresas(atual => [...atual, ...novas.filter(n => !atual.some(x => x.cnpj === n.cnpj))])
      }
    } finally {
      setCarregando(false)
    }
  }

  const barras = (titulo: string, itens: ItemResumo[] | undefined, chave: ChaveFiltro, limite = 5) => {
    const selecionados = (f[chave] as string[] | undefined) ?? []
    return (
      <BarrasDistribuicao
        titulo={titulo}
        itens={itens}
        limite={limite}
        selecionados={selecionados}
        nota='abrir na Consulta'
        hrefDe={item =>
          hrefConsulta({ filtros: { ...f, [chave]: alternar(selecionados, item.chave) } as Filtros, ordem: anexo.ordem })
        }
      />
    )
  }
  // Com um setor só, a distribuição por setor não diz nada: mostra a região no lugar.
  const primeiraBarra =
    f.setores?.length === 1 ? barras('Regiões', dims.regiao, 'regioes') : barras('Setores', dims.setor, 'setores')

  return (
    <section className='overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70'>
      <header className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3'>
        <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <span className='text-xs font-medium text-slate-500'>Entendi:</span>
          {(anexo.rotulos.length ? anexo.rotulos : ['Todas as empresas da base']).map(r => (
            <span
              key={r}
              title={r}
              className='max-w-full truncate rounded-full border border-marca-200 bg-marca-50 px-2.5 py-0.5 text-xs text-marca-900 sm:max-w-xs'
            >
              {r}
            </span>
          ))}
        </div>
        <div className='flex shrink-0 flex-wrap gap-2'>
          <Link
            href={anexo.href}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-marca-300 hover:text-marca-800',
              FOCO
            )}
          >
            Abrir na Consulta <ArrowRight className='size-3.5' aria-hidden />
          </Link>
          {total.n > 0 && (
            <a
              href={hrefExportar}
              onClick={exportar}
              aria-busy={conferindo}
              title={`Baixa até ${fmtInt(LIMITE_EXPORTACAO)} empresas, na ordem atual`}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg bg-marca-800 px-3 text-xs font-medium text-white hover:bg-marca-900',
                FOCO
              )}
            >
              {conferindo ? (
                <LoaderCircle className='size-3.5 animate-spin' aria-hidden />
              ) : (
                <Download className='size-3.5' aria-hidden />
              )}
              Exportar CSV
            </a>
          )}
        </div>
        {corte !== null && (
          <div
            role='alertdialog'
            aria-labelledby={`corte-${anexo.chave}-titulo`}
            aria-describedby={`corte-${anexo.chave}-texto`}
            onKeyDown={e => e.key === 'Escape' && setCorte(null)}
            className='flex w-full flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
          >
            <TriangleAlert className='mt-0.5 size-4 shrink-0' aria-hidden />
            <div className='min-w-0 flex-1 basis-60'>
              <p id={`corte-${anexo.chave}-titulo`} className='font-semibold'>
                O CSV traz no máximo {fmtInt(LIMITE_EXPORTACAO)} empresas
              </p>
              <p id={`corte-${anexo.chave}-texto`} className='mt-0.5'>
                Esta busca tem {fmtInt(corte)}. Saem as primeiras {fmtInt(LIMITE_EXPORTACAO)} na ordem atual; refine o
                pedido para baixar o restante.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <button
                ref={baixarRef}
                type='button'
                onClick={baixar}
                className={cn('h-9 rounded-full bg-marca-800 px-4 text-xs font-bold text-creme hover:bg-marca-950', FOCO)}
              >
                Baixar as primeiras {fmtInt(LIMITE_EXPORTACAO)}
              </button>
              <button
                type='button'
                onClick={() => setCorte(null)}
                className={cn(
                  'h-9 rounded-full border border-amber-300 bg-white px-4 text-xs font-semibold text-amber-900 hover:bg-amber-100',
                  FOCO
                )}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </header>

      <div className='@container space-y-3 p-3 sm:p-4'>
        <CartoesIndicadores total={total} base={anexo.totalBase} compacto />

        {total.n === 0 ? (
          <div className='rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center'>
            <SearchX className='mx-auto size-8 text-slate-300' aria-hidden />
            <p className='mt-2 text-sm font-medium'>Nenhuma empresa com esses filtros</p>
          </div>
        ) : (
          <>
            <div className='grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4'>
              {primeiraBarra}
              {barras('Ramos', dims.ramo, 'ramos')}
              {barras('Municípios', dims.municipio, 'municipios')}
              {barras('Porte', ordenarPorte(dims.porte), 'portes', 4)}
            </div>

            <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
              <TabelaEmpresas empresas={empresas} />
              <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm'>
                <p className='text-slate-500'>
                  Mostrando <strong className='text-slate-700'>1–{fmtInt(empresas.length)}</strong> de{' '}
                  <strong className='text-slate-700'>{fmtInt(total.n)}</strong>
                </p>
                <div className='flex flex-wrap items-center gap-2'>
                  {empresas.length < total.n && empresas.length < 100 && (
                    <button
                      type='button'
                      onClick={carregarMais}
                      disabled={carregando}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60',
                        FOCO
                      )}
                    >
                      {carregando ? <LoaderCircle className='size-3.5 animate-spin' aria-hidden /> : <Plus className='size-3.5' aria-hidden />}
                      Carregar mais {POR}
                    </button>
                  )}
                  {empresas.length < total.n && (
                    <Link href={anexo.href} className={cn('rounded-sm text-xs font-medium text-marca-700 hover:underline', FOCO)}>
                      Ver todas na Consulta →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
