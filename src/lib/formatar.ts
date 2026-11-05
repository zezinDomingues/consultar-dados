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

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})
const dataHoraAno = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

/** 05/11 14:32 (horário de Brasília; com o ano quando não é o ano corrente). */
export function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  const mesmoAno = d.getUTCFullYear() === new Date().getUTCFullYear()
  return (mesmoAno ? dataHora : dataHoraAno).format(d).replace(',', '')
}

/** "há 5 min", "há 3 h", "em 2 min" */
export function fmtRelativo(iso: string | null | undefined, agora = Date.now()) {
  if (!iso) return '—'
  const s = Math.round((new Date(iso).getTime() - agora) / 1000)
  const abs = Math.abs(s)
  const v = abs < 60 ? `${abs} s` : abs < 3600 ? `${Math.round(abs / 60)} min` : abs < 86400 ? `${Math.round(abs / 3600)} h` : `${Math.round(abs / 86400)} d`
  return s < 0 ? `há ${v}` : `em ${v}`
}
