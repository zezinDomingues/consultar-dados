const inteiro = new Intl.NumberFormat('pt-BR')
const porcento = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const decimal1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : inteiro.format(n))

export const fmtPct = (parte: number, total: number) => (total > 0 ? porcento.format(parte / total) : '—')

export function fmtMoeda(v: number | null | undefined, compacto = false) {
  if (v == null) return '—'
  if (compacto) {
    if (v >= 1e9) return `R$ ${decimal1.format(v / 1e9)} bi`
    if (v >= 1e6) return `R$ ${decimal1.format(v / 1e6)} mi`
    if (v >= 1e3) return `R$ ${decimal1.format(v / 1e3)} mil`
  }
  return moeda.format(v)
}

export function fmtData(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const fmtCnae = (c: string) => (c.length === 7 ? `${c.slice(0, 4)}-${c[4]}/${c.slice(5)}` : c)
