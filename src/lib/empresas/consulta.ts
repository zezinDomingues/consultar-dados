// Camada de consulta (só no servidor). A tela usa estas funções hoje; o agente
// de IA vai usar as mesmas como ferramentas. Toda leitura passa pelo usuário
// logado: o RLS do Supabase só libera quem está em app_usuarios.
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Filtros, Ordem } from './filtros'
import type { ContadorGrupo, Empresa, EmpresaLista, Opcoes, Resumo } from './tipos'

export const COLUNAS_LISTA =
  'cnpj,cnpj_formatado,prioridade,score,razao_social,nome_fantasia,tipo_negocio,setor,ramo,cnae_fmt,' +
  'atividade_principal,municipio,regiao_intermediaria,porte,capital_social,regime,situacao_regime,idade_anos,' +
  'estabelecimentos_sp,telefone1,whatsapp,whatsapp_link,email,email_tipo,empresas_mesmo_email'

export class SemAcessoError extends Error {
  constructor() {
    super('Usuário sem acesso à base de empresas.')
  }
}

// Sem sessão (ou token inválido) → null, e o layout manda para o login. Falha de REDE ao consultar o
// Auth não pode virar "deslogado": tenta de novo e, se persistir, lança (o error.tsx oferece tentar de novo).
async function lerUsuario(supabase: Awaited<ReturnType<typeof createClient>>) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { data, error } = await supabase.auth.getUser()
    if (data.user) return data.user
    const naoLogado = !error || error.name === 'AuthSessionMissingError' || (error.status !== undefined && error.status >= 400 && error.status < 500)
    if (naoLogado) return null
    await new Promise(r => setTimeout(r, 400))
  }
  throw new Error('Não foi possível verificar sua sessão agora. Tente novamente em instantes.')
}

export const usuarioAtual = cache(async () => {
  const supabase = await createClient()
  const user = await lerUsuario(supabase)
  if (!user) return null
  // is_app_admin vem da migração 005; se ela ainda não rodou, o erro vira "não é admin".
  const [{ data: autorizado }, { data: admin }] = await Promise.all([supabase.rpc('is_app_user'), supabase.rpc('is_app_admin')])
  return { id: user.id, email: user.email ?? '', autorizado: autorizado === true, admin: autorizado === true && admin === true }
})

async function exigirAcesso() {
  const u = await usuarioAtual()
  if (!u?.autorizado) throw new SemAcessoError()
}

// A base é estática (carga da Receita), então resultados agregados podem ficar
// em memória por um tempo. Só é lido depois de exigirAcesso().
const memoria = new Map<string, { expira: number; valor: unknown }>()
async function lembrar<T>(chave: string, ttlMs: number, calcular: () => Promise<T>): Promise<T> {
  const agora = Date.now()
  const hit = memoria.get(chave)
  if (hit && hit.expira > agora) return hit.valor as T
  const valor = await calcular()
  if (memoria.size > 500) memoria.delete(memoria.keys().next().value!)
  memoria.set(chave, { expira: agora + ttlMs, valor })
  return valor
}

export const opcoesFiltros = cache(async (): Promise<Opcoes> => {
  await exigirAcesso()
  return lembrar('opcoes', 60 * 60_000, async () => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('opcoes_filtros')
    if (error) throw new Error(`opcoes_filtros: ${error.message}`)
    return data as Opcoes
  })
})

/** Totais e distribuições do resultado. Recebe os filtros como JSON (chave estável para os caches). */
export const resumoEmpresas = cache(async (filtrosJson: string): Promise<Resumo> => {
  await exigirAcesso()
  return lembrar(`resumo:${filtrosJson}`, 15 * 60_000, async () => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('resumo_empresas', { f: JSON.parse(filtrosJson) })
    if (error) throw new Error(`resumo_empresas: ${error.message}`)
    return data as Resumo
  })
})

export async function buscarEmpresas(
  filtros: Filtros,
  ordem: Ordem,
  pagina: number,
  porPagina: number,
  colunas: string = COLUNAS_LISTA
): Promise<EmpresaLista[]> {
  await exigirAcesso()
  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('buscar_empresas', { f: filtros, ordem, limite: porPagina, pagina })
    .select(colunas)
  if (error) throw new Error(`buscar_empresas: ${error.message}`)
  return (data ?? []) as unknown as EmpresaLista[]
}

export async function obterEmpresa(cnpj: string) {
  await exigirAcesso()
  const supabase = await createClient()
  const { data, error } = await supabase.from('empresas_completa').select('*').eq('cnpj', cnpj).maybeSingle()
  if (error) throw new Error(`empresa: ${error.message}`)
  if (!data) return null
  const empresa = data as Empresa

  const codigos = (empresa.cnaes_secundarios ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const [secundarias, mesmoEmail] = await Promise.all([
    codigos.length
      ? supabase.rpc('nomes_cnae', { codigos }).then(r => (r.data ?? []) as { cnae: string; cnae_fmt: string; atividade: string }[])
      : Promise.resolve([]),
    empresa.email && (empresa.empresas_mesmo_email ?? 0) > 1
      ? buscarEmpresas({ email: empresa.email }, 'score', 1, 11)
      : Promise.resolve([] as EmpresaLista[])
  ])

  return { empresa, secundarias, mesmoEmail: mesmoEmail.filter(e => e.cnpj !== cnpj).slice(0, 10) }
}

export async function listarContadores(q: string | undefined, pagina: number, porPagina = 50) {
  await exigirAcesso()
  const supabase = await createClient()
  let consulta = supabase.from('contadores_grupos').select('*', { count: 'exact' })
  const termo = q?.replace(/[,()%*\\]/g, ' ').trim()
  if (termo) consulta = consulta.or(`email.ilike.*${termo}*,exemplos.ilike.*${termo}*`)
  const de = (pagina - 1) * porPagina
  const { data, error, count } = await consulta
    .order('empresas', { ascending: false })
    .order('email')
    .range(de, de + porPagina - 1)
  if (error) throw new Error(`contadores: ${error.message}`)
  return { itens: (data ?? []) as ContadorGrupo[], total: count ?? 0 }
}
