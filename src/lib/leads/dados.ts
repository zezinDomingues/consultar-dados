// Contatos que chegam pelos formulários do site ("Fale com um especialista", diagnóstico da home e "Seja um
// parceiro"). A tabela leads_site só é lida por admin (RLS da migração 019); quem grava é o route público
// /api/publico/lead, pela função registrar_lead_site.
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type Lead = {
  id: number
  criado_em: string
  tipo: 'contato' | 'parceiro'
  origem: string | null
  pagina: string | null
  nome: string
  empresa: string | null
  cnpj: string | null
  email: string | null
  whatsapp: string | null
  mensagem: string | null
  segmento: string | null
}

export const POR_PAGINA = 25
const COLUNAS = 'id, criado_em, tipo, origem, pagina, nome, empresa, cnpj, email, whatsapp, mensagem, segmento'

export type FiltroLeads = { q: string; tipo: '' | 'contato' | 'parceiro'; pagina: number }

/** Lê os filtros da URL sem confiar neles: página entre 1 e 100.000, tipo da lista, busca curta. */
export function lerFiltroLeads(sp: Record<string, string | string[] | undefined>): FiltroLeads {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  const tipo = um(sp.tipo)
  const n = Number.parseInt(um(sp.pagina), 10)
  return {
    q: um(sp.q).trim().slice(0, 80),
    tipo: tipo === 'contato' || tipo === 'parceiro' ? tipo : '',
    pagina: Number.isFinite(n) && n >= 1 ? Math.min(n, 100_000) : 1
  }
}

/** Busca do PostgREST: tira o que quebra o filtro `or` (vírgula, parênteses, curingas e aspas). */
const limparBusca = (q: string) => q.replace(/[,()*%\\"':]/g, ' ').replace(/\s+/g, ' ').trim()

export async function listarLeads(f: FiltroLeads) {
  const supabase = await createClient()
  const consulta = () => {
    let q = supabase.from('leads_site').select(COLUNAS, { count: 'exact' })
    if (f.tipo) q = q.eq('tipo', f.tipo)
    const termo = limparBusca(f.q)
    if (termo) {
      const digitos = termo.replace(/\D/g, '')
      const partes = [`nome.ilike.*${termo}*`, `empresa.ilike.*${termo}*`, `email.ilike.*${termo}*`, `mensagem.ilike.*${termo}*`]
      if (digitos.length >= 4) partes.push(`whatsapp.ilike.*${digitos}*`, `cnpj.ilike.*${digitos}*`)
      q = q.or(partes.join(','))
    }
    return q.order('criado_em', { ascending: false }).order('id', { ascending: false })
  }
  const ler = (pagina: number) => consulta().range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

  let pagina = f.pagina
  let { data, count, error } = await ler(pagina)
  // página além do fim (PGRST103 / 416) ou vazia: mostra a última que existe
  if (error?.code === 'PGRST103' || (!error && !data?.length && pagina > 1)) {
    const total = count ?? (await consulta().range(0, 0)).count ?? 0
    pagina = Math.max(1, Math.ceil(total / POR_PAGINA))
    ;({ data, count, error } = await ler(pagina))
  }
  if (error) throw new Error(`Não foi possível ler os leads do site (${error.code ?? 'erro'}).`)
  const total = count ?? 0
  return { itens: (data ?? []) as Lead[], total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) }
}

/** Quantos chegaram hoje e nos últimos 7 dias (horário de Brasília), para o cabeçalho. */
export async function resumoLeads() {
  const supabase = await createClient()
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const inicioHoje = new Date(`${hoje}T00:00:00-03:00`).toISOString()
  const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const contar = (desde: string) =>
    supabase.from('leads_site').select('id', { count: 'exact', head: true }).gte('criado_em', desde)
  const [h, s] = await Promise.all([contar(inicioHoje), contar(seteDias)])
  return { hoje: h.count ?? 0, semana: s.count ?? 0 }
}
