'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, LoaderCircle, RotateCcw, Search } from 'lucide-react'
import { MultiSelect } from './multi-select'
import { useConsulta } from './contexto'
import {
  alternar,
  contarFiltros,
  hrefConsulta,
  LOCALIZACOES,
  PORTES,
  PRIORIDADES,
  REGIMES,
  SITUACOES,
  TIPOS_NEGOCIO,
  type Consulta,
  type Filtros
} from '@/lib/empresas/filtros'
import type { Opcoes } from '@/lib/empresas/tipos'
import { cn } from '@/lib/utils'

/** Remove chaves vazias: lista vazia, false, '' e undefined = "sem filtro". */
function limpar(f: Filtros): Filtros {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === false || v === '' || (Array.isArray(v) && v.length === 0)) continue
    r[k] = v
  }
  return r as Filtros
}

export function PainelFiltros({ consulta, opcoes }: { consulta: Consulta; opcoes: Opcoes }) {
  const { navegar, pendente } = useConsulta()
  const [f, setF] = useState<Filtros>(consulta.filtros)
  const fRef = useRef(f)
  fRef.current = f

  // A URL manda: quando ela muda (chip removido, atalho, voltar do navegador), o painel acompanha.
  const chaveUrl = JSON.stringify(consulta.filtros)
  useEffect(() => {
    setF(consulta.filtros)
  }, [chaveUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = (mudanca: Partial<Filtros>) => {
    const novo = limpar({ ...fRef.current, ...mudanca })
    setF(novo)
    navegar(hrefConsulta({ filtros: novo, ordem: consulta.ordem, por: consulta.por }))
  }

  // Busca por texto: aplica depois que a pessoa para de digitar.
  const [texto, setTexto] = useState(consulta.filtros.q ?? '')
  const focado = useRef(false)
  useEffect(() => {
    if (!focado.current) setTexto(consulta.filtros.q ?? '')
  }, [consulta.filtros.q])
  useEffect(() => {
    const alvo = texto.trim()
    if (alvo === (fRef.current.q ?? '')) return
    if (alvo.length === 1) return
    const t = setTimeout(() => aplicar({ q: alvo || undefined }), 450)
    return () => clearTimeout(t)
  }, [texto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Opções dependentes: setor → ramo → segmento → atividade; região → município.
  const ramoDoSegmento = useMemo(() => new Map(opcoes.segmentos.map(s => [s.chave, s.pai!])), [opcoes])
  const setorDoRamo = useMemo(() => new Map(opcoes.ramos.map(r => [r.chave, r.pai!])), [opcoes])

  const ramos = useMemo(
    () => (f.setores ? opcoes.ramos.filter(r => f.setores!.includes(r.pai!)) : opcoes.ramos),
    [f.setores, opcoes]
  )
  const segmentos = useMemo(() => {
    if (f.ramos) return opcoes.segmentos.filter(s => f.ramos!.includes(s.pai!))
    if (f.setores) return opcoes.segmentos.filter(s => f.setores!.includes(setorDoRamo.get(s.pai!)!))
    return opcoes.segmentos
  }, [f.ramos, f.setores, opcoes, setorDoRamo])
  const atividades = useMemo(() => {
    if (f.segmentos) return opcoes.atividades.filter(a => f.segmentos!.includes(a.pai!))
    if (f.ramos) return opcoes.atividades.filter(a => f.ramos!.includes(ramoDoSegmento.get(a.pai!)!))
    if (f.setores)
      return opcoes.atividades.filter(a => f.setores!.includes(setorDoRamo.get(ramoDoSegmento.get(a.pai!)!)!))
    return opcoes.atividades
  }, [f.segmentos, f.ramos, f.setores, opcoes, ramoDoSegmento, setorDoRamo])
  const municipios = useMemo(
    () => (f.regioes ? opcoes.municipios.filter(m => f.regioes!.includes(m.pai!)) : opcoes.municipios),
    [f.regioes, opcoes]
  )

  const total = contarFiltros(f)

  return (
    <aside className='sticky top-0 flex h-screen w-[296px] shrink-0 flex-col border-r border-slate-200 bg-white'>
      <div className='flex items-center justify-between border-b border-slate-100 px-5 py-4'>
        <div className='flex items-center gap-2'>
          <h2 className='font-serif text-lg font-bold text-marca-800'>Filtros</h2>
          {total > 0 && (
            <span className='rounded-full bg-marca-100 px-2 py-0.5 text-xs font-medium text-marca-800'>{total}</span>
          )}
          {pendente && <LoaderCircle className='size-3.5 animate-spin text-marca-500' aria-label='Atualizando' />}
        </div>
        {total > 0 && (
          <button
            type='button'
            onClick={() => {
              setTexto('')
              setF({})
              navegar(hrefConsulta({ filtros: {}, ordem: consulta.ordem, por: consulta.por }))
            }}
            className='flex items-center gap-1 text-xs text-slate-500 hover:text-marca-700'
          >
            <RotateCcw className='size-3' /> Limpar
          </button>
        )}
      </div>

      <div className='flex-1 space-y-1 overflow-y-auto px-5 py-4'>
        <div className='relative mb-3'>
          <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400' />
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onFocus={() => (focado.current = true)}
            onBlur={() => (focado.current = false)}
            placeholder='Razão social, fantasia ou CNPJ'
            className='h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-marca-400 focus:bg-white focus:ring-4 focus:ring-marca-50'
          />
        </div>

        <Secao titulo='O que a empresa faz' ativos={[f.setores, f.ramos, f.segmentos, f.cnaes, f.cnae_secundario]}>
          <MultiSelect rotulo='Setor' opcoes={opcoes.setores} selecionados={f.setores} aoMudar={v => aplicar({ setores: v })} />
          <MultiSelect rotulo='Ramo' opcoes={ramos} selecionados={f.ramos} aoMudar={v => aplicar({ ramos: v })} />
          <MultiSelect
            rotulo='Segmento'
            opcoes={segmentos}
            selecionados={f.segmentos}
            aoMudar={v => aplicar({ segmentos: v })}
          />
          <MultiSelect
            rotulo='Atividade (CNAE)'
            opcoes={atividades}
            selecionados={f.cnaes}
            aoMudar={v => aplicar({ cnaes: v })}
            mostrarCodigo
          />
          <CampoTexto
            rotulo='Também faz (CNAE secundário)'
            placeholder='ex.: 4771-7/02'
            valor={f.cnae_secundario}
            aoAplicar={v => {
              const dig = v?.replace(/\D/g, '')
              aplicar({ cnae_secundario: dig && dig.length >= 4 ? dig.slice(0, 7) : undefined })
            }}
          />
        </Secao>

        <Secao titulo='Tamanho' ativos={[f.portes, f.capital_min, f.capital_max, f.idade_min, f.idade_max, f.estab_min]}>
          <Chips
            rotulo='Porte'
            valores={PORTES}
            rotulos={{ 'Empresa de pequeno porte': 'EPP', 'Demais (médio/grande)': 'Médio/grande', Microempresa: 'ME' }}
            selecionados={f.portes}
            aoAlternar={v => aplicar({ portes: alternar(f.portes, v) })}
          />
          <Faixa
            rotulo='Capital social (R$)'
            min={f.capital_min}
            max={f.capital_max}
            aoAplicar={(min, max) => aplicar({ capital_min: min, capital_max: max })}
          />
          <Faixa
            rotulo='Idade da empresa (anos)'
            min={f.idade_min}
            max={f.idade_max}
            inteiro
            aoAplicar={(min, max) => aplicar({ idade_min: min, idade_max: max })}
          />
          <Faixa
            rotulo='Estabelecimentos em SP (mínimo)'
            min={f.estab_min}
            inteiro
            soMinimo
            aoAplicar={min => aplicar({ estab_min: min })}
          />
        </Secao>

        <Secao titulo='Tributação' ativos={[f.regimes, f.situacoes_regime]}>
          <Chips
            rotulo='Regime (ECF)'
            valores={REGIMES}
            rotulos={{ 'Tributação mista': 'Mista' }}
            selecionados={f.regimes}
            aoAlternar={v => aplicar({ regimes: alternar(f.regimes, v) })}
          />
          <Chips
            rotulo='Situação do regime'
            valores={SITUACOES}
            selecionados={f.situacoes_regime}
            aoAlternar={v => aplicar({ situacoes_regime: alternar(f.situacoes_regime, v) })}
          />
        </Secao>

        <Secao titulo='Onde fica' ativos={[f.localizacoes, f.regioes, f.municipios]}>
          <Chips
            rotulo='Localização'
            valores={LOCALIZACOES}
            selecionados={f.localizacoes}
            aoAlternar={v => aplicar({ localizacoes: alternar(f.localizacoes, v) })}
          />
          <MultiSelect
            rotulo='Região (IBGE)'
            opcoes={opcoes.regioes}
            selecionados={f.regioes}
            aoMudar={v => aplicar({ regioes: v })}
          />
          <MultiSelect
            rotulo='Município'
            opcoes={municipios}
            selecionados={f.municipios}
            aoMudar={v => aplicar({ municipios: v })}
          />
        </Secao>

        <Secao titulo='Contato' ativos={[f.com_whatsapp, f.com_email, f.contato_proprio, f.email]}>
          <Interruptor
            rotulo='Com WhatsApp'
            descricao='Celular válido no cadastro'
            ligado={!!f.com_whatsapp}
            aoMudar={v => aplicar({ com_whatsapp: v || undefined })}
          />
          <Interruptor
            rotulo='Com e-mail'
            descricao='E-mail válido no cadastro'
            ligado={!!f.com_email}
            aoMudar={v => aplicar({ com_email: v || undefined })}
          />
          <Interruptor
            rotulo='Contato da própria empresa'
            descricao='Exclui e-mail de contador ou compartilhado'
            ligado={!!f.contato_proprio}
            aoMudar={v => aplicar({ contato_proprio: v || undefined })}
          />
        </Secao>

        <Secao titulo='Prioridade e tipo' ativos={[f.prioridades, f.tipos_negocio]}>
          <Chips
            rotulo='Prioridade (score)'
            valores={PRIORIDADES}
            selecionados={f.prioridades}
            aoAlternar={v => aplicar({ prioridades: alternar(f.prioridades, v) })}
          />
          <Chips
            rotulo='Tipo de negócio'
            valores={TIPOS_NEGOCIO}
            rotulos={{ 'SPE (propósito específico)': 'SPE', 'Holding / patrimonial': 'Holding' }}
            selecionados={f.tipos_negocio}
            aoAlternar={v => aplicar({ tipos_negocio: alternar(f.tipos_negocio, v) })}
          />
        </Secao>
      </div>
    </aside>
  )
}

function Secao({ titulo, ativos, children }: { titulo: string; ativos: unknown[]; children: React.ReactNode }) {
  const n = ativos.filter(v => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== false)).length
  return (
    <details open className='group border-b border-slate-100 py-3 last:border-0'>
      <summary className='flex cursor-pointer select-none items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-marca-800/70'>
        <span className='flex items-center gap-2'>
          {titulo}
          {n > 0 && <span className='size-1.5 rounded-full bg-marca-500' />}
        </span>
        <ChevronDown className='size-4 transition group-open:rotate-180' />
      </summary>
      <div className='mt-3 space-y-3'>{children}</div>
    </details>
  )
}

function Chips<T extends string>({
  rotulo,
  valores,
  rotulos,
  selecionados,
  aoAlternar
}: {
  rotulo: string
  valores: readonly T[]
  rotulos?: Partial<Record<T, string>>
  selecionados?: readonly T[]
  aoAlternar: (v: T) => void
}) {
  return (
    <div className='space-y-1.5'>
      <span className='text-xs font-medium text-slate-600'>{rotulo}</span>
      <div className='flex flex-wrap gap-1.5'>
        {valores.map(v => {
          const ativo = selecionados?.includes(v)
          return (
            <button
              key={v}
              type='button'
              aria-pressed={ativo}
              title={v}
              onClick={() => aoAlternar(v)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition',
                ativo
                  ? 'border-marca-700 bg-marca-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-marca-300 hover:text-marca-800'
              )}
            >
              {rotulos?.[v] ?? v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Interruptor({
  rotulo,
  descricao,
  ligado,
  aoMudar
}: {
  rotulo: string
  descricao: string
  ligado: boolean
  aoMudar: (v: boolean) => void
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={ligado}
      onClick={() => aoMudar(!ligado)}
      className='flex w-full items-center justify-between gap-3 text-left'
    >
      <span>
        <span className='block text-sm text-slate-700'>{rotulo}</span>
        <span className='block text-xs text-slate-400'>{descricao}</span>
      </span>
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition',
          ligado ? 'bg-marca-600' : 'bg-slate-200'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
            ligado ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  )
}

const lerNumero = (s: string) => {
  const limpo = s.replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.')
  if (!limpo) return undefined
  const n = Number(limpo)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function Faixa({
  rotulo,
  min,
  max,
  inteiro = false,
  soMinimo = false,
  aoAplicar
}: {
  rotulo: string
  min?: number
  max?: number
  inteiro?: boolean
  soMinimo?: boolean
  aoAplicar: (min: number | undefined, max: number | undefined) => void
}) {
  const [a, setA] = useState(min?.toString() ?? '')
  const [b, setB] = useState(max?.toString() ?? '')
  useEffect(() => setA(min?.toString() ?? ''), [min])
  useEffect(() => setB(max?.toString() ?? ''), [max])

  const confirmar = () => {
    let na = lerNumero(a)
    let nb = soMinimo ? undefined : lerNumero(b)
    if (inteiro) {
      na = na === undefined ? undefined : Math.round(na)
      nb = nb === undefined ? undefined : Math.round(nb)
    }
    if (na !== min || nb !== max) aoAplicar(na, nb)
  }
  const props = {
    inputMode: 'numeric' as const,
    onBlur: confirmar,
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && confirmar(),
    className:
      'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
  }
  return (
    <div className='space-y-1.5'>
      <span className='text-xs font-medium text-slate-600'>{rotulo}</span>
      <div className='flex items-center gap-2'>
        <input {...props} value={a} onChange={e => setA(e.target.value)} placeholder='mín.' aria-label={`${rotulo} mínimo`} />
        {!soMinimo && (
          <>
            <span className='text-slate-300'>–</span>
            <input {...props} value={b} onChange={e => setB(e.target.value)} placeholder='máx.' aria-label={`${rotulo} máximo`} />
          </>
        )}
      </div>
    </div>
  )
}

function CampoTexto({
  rotulo,
  placeholder,
  valor,
  aoAplicar
}: {
  rotulo: string
  placeholder: string
  valor?: string
  aoAplicar: (v: string | undefined) => void
}) {
  const [v, setV] = useState(valor ?? '')
  useEffect(() => setV(valor ?? ''), [valor])
  const confirmar = () => {
    if ((v.trim() || undefined) !== valor) aoAplicar(v.trim() || undefined)
  }
  return (
    <label className='block space-y-1.5'>
      <span className='text-xs font-medium text-slate-600'>{rotulo}</span>
      <input
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => e.key === 'Enter' && confirmar()}
        placeholder={placeholder}
        className='h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'
      />
    </label>
  )
}
