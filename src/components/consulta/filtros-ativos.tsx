import { X } from 'lucide-react'
import { LinkNav } from './contexto'
import { hrefConsulta, type ChaveFiltro, type Consulta, type Filtros } from '@/lib/empresas/filtros'
import type { Opcao, Opcoes } from '@/lib/empresas/tipos'
import { fmtCnae, fmtMoeda } from '@/lib/formatar'

type Chip = { rotulo: string; sem: Filtros }

/** Mostra cada filtro aplicado como um chip removível. */
export function FiltrosAtivos({ consulta, opcoes }: { consulta: Consulta; opcoes: Opcoes }) {
  const f = consulta.filtros
  const chips: Chip[] = []
  const nomes = (lista: Opcao[]) => new Map(lista.map(o => [o.chave, o.nome]))
  const mapas: Partial<Record<ChaveFiltro, Map<string, string>>> = {
    setores: nomes(opcoes.setores),
    ramos: nomes(opcoes.ramos),
    segmentos: nomes(opcoes.segmentos),
    cnaes: new Map(opcoes.atividades.map(o => [o.chave, `${o.cod} ${o.nome}`]))
  }
  const prefixo: Partial<Record<ChaveFiltro, string>> = { prioridades: 'Prioridade ', situacoes_regime: '' }

  const semValor = (k: ChaveFiltro, v?: string): Filtros => {
    const atual = f[k]
    if (Array.isArray(atual) && v !== undefined) {
      const resto = atual.filter(x => x !== v)
      return { ...f, [k]: resto.length ? resto : undefined } as Filtros
    }
    return { ...f, [k]: undefined } as Filtros
  }

  for (const [k, v] of Object.entries(f) as [ChaveFiltro, unknown][]) {
    if (Array.isArray(v)) {
      for (const item of v as string[]) {
        chips.push({ rotulo: `${prefixo[k] ?? ''}${mapas[k]?.get(item) ?? item}`, sem: semValor(k, item) })
      }
      continue
    }
    const r: Partial<Record<ChaveFiltro, string>> = {
      q: `“${v}”`,
      cnae_secundario: `Também faz ${fmtCnae(String(v))}`,
      capital_min: `Capital ≥ ${fmtMoeda(v as number, true)}`,
      capital_max: `Capital ≤ ${fmtMoeda(v as number, true)}`,
      idade_min: `≥ ${v} anos`,
      idade_max: `≤ ${v} anos`,
      estab_min: `≥ ${v} estabelecimentos`,
      com_whatsapp: 'Com WhatsApp',
      com_email: 'Com e-mail',
      contato_proprio: 'Contato próprio',
      email: `E-mail: ${v}`
    }
    chips.push({ rotulo: r[k] ?? `${k}: ${v}`, sem: semValor(k) })
  }

  if (!chips.length) return null

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {chips.map(c => (
        <LinkNav
          key={c.rotulo}
          href={hrefConsulta({ filtros: c.sem, ordem: consulta.ordem, por: consulta.por })}
          title='Remover filtro'
          className='group inline-flex max-w-xs items-center gap-1 rounded-full border border-marca-200 bg-marca-50 py-1 pl-2.5 pr-1.5 text-xs text-marca-900 hover:border-marca-300 hover:bg-marca-100'
        >
          <span className='truncate'>{c.rotulo}</span>
          <X className='size-3.5 shrink-0 text-marca-400 group-hover:text-marca-800' />
        </LinkNav>
      ))}
      {chips.length > 1 && (
        <LinkNav
          href={hrefConsulta({ filtros: {}, ordem: consulta.ordem, por: consulta.por })}
          className='px-2 text-xs text-slate-500 hover:text-marca-700'
        >
          Limpar tudo
        </LinkNav>
      )}
    </div>
  )
}
