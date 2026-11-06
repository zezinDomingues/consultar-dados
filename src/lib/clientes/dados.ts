// Produto "Consulta de dados" (cliente). Tudo passa pelas funções cliente_* do banco, que aplicam o plano
// (ramos/estados), escondem os contatos das empresas não liberadas e cobram a cota ao liberar.
import 'server-only'
import type { Filtros, Ordem } from '@/lib/empresas/filtros'
import type { Opcao } from '@/lib/empresas/tipos'
import { createClient } from '@/lib/supabase/server'
import type { SaldoCliente } from '@/lib/usuarios/dados'

export type EmpresaCliente = {
  cnpj: string
  cnpj_formatado: string
  razao_social: string
  nome_fantasia: string | null
  setor: string | null
  ramo: string | null
  atividade_principal: string | null
  municipio: string | null
  uf: string | null
  porte: string | null
  capital_social: number | null
  regime: string | null
  situacao_regime: string | null
  prioridade: string | null
  score: number | null
  idade_anos: number | null
  liberada: boolean
  liberada_em: string | null
  telefone1: string | null
  whatsapp: string | null
  whatsapp_link: string | null
  email: string | null
  endereco: string | null
}

export async function saldoCliente() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('cliente_saldo')
  return (data ?? null) as SaldoCliente | null
}

export async function opcoesCliente() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('cliente_opcoes')
  return (data ?? null) as { ramos: Opcao[]; ufs: string[]; municipios: Opcao[] } | null
}

export async function buscarCliente(filtros: Filtros, ordem: Ordem | 'liberadas', pagina: number, por: number, soLiberadas: boolean) {
  const supabase = await createClient()
  const [lista, total] = await Promise.all([
    supabase.rpc('cliente_buscar', { f: filtros, ordem, limite: por, pagina, so_liberadas: soLiberadas }),
    supabase.rpc('cliente_contar', { f: filtros, so_liberadas: soLiberadas })
  ])
  if (lista.error) throw new Error(lista.error.message)
  return { itens: (lista.data ?? []) as EmpresaCliente[], total: Number(total.data ?? 0) }
}
