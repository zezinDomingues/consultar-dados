// Filtros gravados nas campanhas (JSON da Consulta). Funções puras: servidor e tela usam as mesmas.

/** Porte antigo (antes da migração 018): a Receita só tem ME, EPP e "Demais"; hoje o "Demais" é Médio + Grande. */
export const PORTE_ANTIGO = 'Demais (médio/grande)'

/**
 * Filtro de campanha salvo com o porte antigo vira Médio porte + Grande porte (o que ele queria dizer). Sem isso a
 * campanha não acha ninguém (a view só tem os 4 portes novos) e é encerrada como "todas já contatadas", e editar ou
 * testar dá "Filtros inválidos".
 */
export function normalizarFiltros<T>(f: T): T {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return f
  const portes = (f as { portes?: unknown }).portes
  if (!Array.isArray(portes) || !portes.includes(PORTE_ANTIGO)) return f
  const novos = [...new Set(portes.flatMap(p => (p === PORTE_ANTIGO ? ['Médio porte', 'Grande porte'] : [p])))]
  return { ...f, portes: novos }
}

/** Mesmo público? Compara os filtros sem depender da ordem das chaves nem da ordem dos itens das listas. */
export function mesmosFiltros(a: unknown, b: unknown) {
  return canonico(normalizarFiltros(a ?? {})) === canonico(normalizarFiltros(b ?? {}))
}

function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).sort().join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter(k => o[k] !== undefined && o[k] !== null && !(Array.isArray(o[k]) && (o[k] as unknown[]).length === 0))
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonico(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
