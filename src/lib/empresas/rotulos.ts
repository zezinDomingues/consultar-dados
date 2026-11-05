// Texto legível de cada filtro aplicado ("Saúde e serviços sociais", "Capital ≥ R$ 1 mi"…).
// Usado pelos chips da Consulta e pelo "Entendi:" do agente.
import type { ChaveFiltro, Filtros } from './filtros'
import type { Opcao, Opcoes } from './tipos'
import { fmtCnae, fmtMoeda } from '@/lib/formatar'

export type RotuloFiltro = { chave: ChaveFiltro; valor?: string; rotulo: string }

export function rotulosFiltros(f: Filtros, opcoes: Opcoes): RotuloFiltro[] {
  const nomes = (lista: Opcao[]) => new Map(lista.map(o => [o.chave, o.nome]))
  const mapas: Partial<Record<ChaveFiltro, Map<string, string>>> = {
    setores: nomes(opcoes.setores),
    ramos: nomes(opcoes.ramos),
    segmentos: nomes(opcoes.segmentos),
    cnaes: new Map(opcoes.atividades.map(o => [o.chave, `${o.cod} ${o.nome}`])),
    municipios: nomes(opcoes.municipios),
    regioes: nomes(opcoes.regioes)
  }
  const prefixo: Partial<Record<ChaveFiltro, string>> = { prioridades: 'Prioridade ', ufs: 'Estado: ' }
  const r: RotuloFiltro[] = []

  for (const [k, v] of Object.entries(f) as [ChaveFiltro, unknown][]) {
    if (v === undefined || v === false || v === '') continue
    if (Array.isArray(v)) {
      for (const item of v as string[]) r.push({ chave: k, valor: item, rotulo: `${prefixo[k] ?? ''}${mapas[k]?.get(item) ?? item}` })
      continue
    }
    const textos: Partial<Record<ChaveFiltro, string>> = {
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
    r.push({ chave: k, rotulo: textos[k] ?? `${k}: ${v}` })
  }
  return r
}
