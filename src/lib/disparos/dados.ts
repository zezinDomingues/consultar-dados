// Leituras da área de Disparos (só servidor). Tudo passa pelo usuário logado e o RLS decide o que cada papel vê:
// admin tudo; equipe só os grupos de que é membro e os seus ramos; cliente só o(s) grupo(s) dele. Números
// (disparo_numeros): só o admin lê a tabela — equipe e cliente leem pela função disparo_numeros_visiveis() (019),
// sem as colunas secretas e só dos seus grupos.
import 'server-only'
import { cache } from 'react'
import { usuarioAtual } from '@/lib/empresas/consulta'
import type { Filtros } from '@/lib/empresas/filtros'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { inicioDoDiaBrasilia } from './config'
import { faltaNoBanco } from './erro'
import { normalizarFiltros } from './filtros'
import {
  GRUPOS,
  type Campanha,
  type ConfigDisparo,
  type Disparo,
  type Divisao,
  type EventoDisparo,
  type Grupo,
  type GrupoDisparo,
  type Numero,
  type NumerosCampanha,
  type ResumoDisparos
} from './tipos'

export class SemAdminError extends Error {
  constructor() {
    super('Área restrita a administradores.')
  }
}

export async function exigirAdmin() {
  const u = await usuarioAtual()
  if (!u?.admin) throw new SemAdminError()
  return u
}

/**
 * Painel e conversas: admin vê tudo; a equipe só os grupos e ramos dela; o cliente só o grupo dele (o RLS do banco
 * garante a leitura, aqui é a porta da tela; responder ainda confere grupo/ramo no servidor).
 */
export async function exigirAtendimento() {
  const u = await usuarioAtual()
  const clienteDeDisparo = u?.papel === 'cliente' && !!u.produtos?.disparos
  if (!u || (u.papel !== 'admin' && u.papel !== 'equipe' && !clienteDeDisparo)) throw new SemAdminError()
  return u
}

/** A migração 005 já rodou neste banco? (a tela explica o que fazer se não) */
export const migracaoAplicada = cache(async () => {
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_config').select('id').limit(1)
  return !error || !/does not exist|schema cache|Could not find/i.test(error.message)
})

type Sessao = Awaited<ReturnType<typeof createClient>>
type NumeroVisivel = Pick<Numero, 'id' | 'grupo_id' | 'rotulo' | 'telefone' | 'status' | 'ativo' | 'limite_diario' | 'webhook_em'>

/** O que a função da 019 devolve, no formato de `Numero` (o resto não é da conta de quem não é admin). */
const deVisivel = (n: NumeroVisivel): Numero => ({
  provedor: 'zapi',
  waha_url: '',
  waha_sessao: '',
  nome_perfil: null,
  intervalo_min_s: 120,
  intervalo_max_s: 300,
  status_detalhe: null,
  status_em: null,
  ultimo_evento_em: null,
  proximo_envio_em: '',
  ultimo_envio_em: null,
  criado_em: '',
  ...n
})

/**
 * Números visíveis para quem chama. Admin: a tabela. Equipe/cliente: disparo_numeros_visiveis() — depois da 019 a
 * tabela devolve 0 linhas para eles; sem a 019 (função não existe) cai na consulta de antes, sem erro.
 */
async function numerosVisiveis(supabase: Sessao, admin: boolean, id?: number) {
  if (!admin) {
    let q = supabase.rpc('disparo_numeros_visiveis')
    if (id) q = q.eq('id', id)
    const { data, error } = await q
    if (!error) return { data: ((data ?? []) as NumeroVisivel[]).map(deVisivel), error: null }
    if (!faltaNoBanco(error)) return { data: null, error }
  }
  let q = supabase.from('disparo_numeros').select(COLUNAS_NUMERO).order('id')
  if (id) q = q.eq('id', id)
  const { data, error } = await q
  return { data: (data ?? []) as unknown as Numero[], error }
}

const COLUNAS_NUMERO =
  'id,rotulo,provedor,grupo_id,waha_url,waha_sessao,telefone,nome_perfil,ativo,limite_diario,intervalo_min_s,intervalo_max_s,status,' +
  'status_detalhe,status_em,webhook_em,ultimo_evento_em,proximo_envio_em,ultimo_envio_em,criado_em'

export async function resumoDisparos(campanha?: number, ramo?: string, grupo?: number) {
  await exigirAtendimento()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('disparo_resumo', { p_campanha: campanha ?? null, p_ramo: ramo ?? null, p_grupo: grupo ?? null })
  if (error) throw new Error(`resumo: ${error.message}`)
  return data as ResumoDisparos
}

export type ConsultaDisparos = { grupo: Grupo; campanha?: number; ramo?: string; grupoId?: number; q?: string; pagina: number; por: number }

export async function listarDisparos(c: ConsultaDisparos) {
  await exigirAtendimento()
  const supabase = await createClient()
  let consulta = supabase.from('disparos').select('*', { count: 'exact' })
  const g = GRUPOS[c.grupo]
  if (c.grupo === 'atencao') consulta = consulta.eq('atencao', true)
  else if (c.grupo === 'leads') consulta = consulta.not('preenchido_em', 'is', null)
  else if (g.status) consulta = consulta.in('status', [...g.status])
  if (c.campanha) consulta = consulta.eq('campanha_id', c.campanha)
  if (c.ramo) consulta = consulta.eq('ramo', c.ramo)
  if (c.grupoId) consulta = consulta.eq('grupo_id', c.grupoId)
  const termo = c.q?.replace(/[,()%*\\]/g, ' ').trim()
  if (termo) {
    const dig = termo.replace(/\D/g, '')
    consulta =
      dig.length >= 6
        ? consulta.or(`cnpj.like.${dig}*,telefone.like.*${dig.slice(-9)}*`)
        : consulta.or(`razao_social.ilike.*${termo}*,nome_fantasia.ilike.*${termo}*,lead_nome.ilike.*${termo}*,lead_email.ilike.*${termo}*`)
  }
  const de = (c.pagina - 1) * c.por
  const ordem = c.grupo === 'leads' ? 'preenchido_em' : c.grupo === 'atencao' || c.grupo === 'responderam' ? 'atualizado_em' : 'criado_em'
  const { data, error, count } = await consulta.order(ordem, { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(de, de + c.por - 1)
  if (error) throw new Error(`disparos: ${error.message}`)
  return { itens: (data ?? []) as Disparo[], total: count ?? 0 }
}

export async function obterDisparo(id: number) {
  const u = await exigirAtendimento()
  const supabase = await createClient()
  const [{ data: d, error }, { data: eventos }] = await Promise.all([
    supabase.from('disparos').select('*').eq('id', id).maybeSingle(),
    supabase.from('disparo_eventos').select('*').eq('disparo_id', id).order('criado_em').order('id').limit(500)
  ])
  if (error) throw new Error(`disparo: ${error.message}`)
  if (!d) return null
  const disparo = d as Disparo
  const [{ data: campanha }, numeros] = await Promise.all([
    supabase.from('disparo_campanhas').select('id,nome,status').eq('id', disparo.campanha_id).maybeSingle(),
    disparo.numero_id ? numerosVisiveis(supabase, u.admin, disparo.numero_id) : Promise.resolve({ data: [] as Numero[], error: null })
  ])
  const n = numeros.data?.[0]
  return {
    disparo,
    eventos: (eventos ?? []) as EventoDisparo[],
    campanha: campanha as Pick<Campanha, 'id' | 'nome' | 'status'> | null,
    numero: n ? { id: n.id, rotulo: n.rotulo, telefone: n.telefone, status: n.status } : null
  }
}

export async function listarCampanhas() {
  await exigirAdmin()
  const supabase = await createClient()
  const [{ data, error }, { data: numeros }] = await Promise.all([
    supabase.from('disparo_campanhas').select('*').order('criada_em', { ascending: false }),
    supabase.from('disparo_campanhas_numeros').select('*')
  ])
  if (error) throw new Error(`campanhas: ${error.message}`)
  const porId = new Map(((numeros ?? []) as NumerosCampanha[]).map(n => [n.campanha_id, n]))
  return ((data ?? []) as Campanha[]).map(c => ({ ...c, filtros: normalizarFiltros(c.filtros), numeros: porId.get(c.id) ?? null }))
}

export async function obterCampanha(id: number) {
  await exigirAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.from('disparo_campanhas').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`campanha: ${error.message}`)
  // filtro com o porte antigo ("Demais") vira Médio + Grande: a tela mostra e o salvar aceita
  return data ? ({ ...data, filtros: normalizarFiltros((data as Campanha).filtros) } as Campanha) : null
}

/** Como a quantidade da campanha se divide: o que já saiu + os próximos da fila (nicho, estado, regime…). */
export async function divisaoCampanha(id: number) {
  await exigirAdmin()
  const { data, error } = await supabaseAdmin().rpc('disparo_divisao', { p_campanha: id })
  if (error) throw new Error(`divisão: ${error.message}`)
  return data as Divisao
}

/** Nomes das campanhas (para filtros e rótulos). */
export async function nomesCampanhas() {
  await exigirAtendimento()
  const supabase = await createClient()
  const { data } = await supabase.from('disparo_campanhas').select('id,nome,status,grupo_id').order('criada_em', { ascending: false })
  return (data ?? []) as Pick<Campanha, 'id' | 'nome' | 'status' | 'grupo_id'>[]
}

export async function listarNumeros() {
  const u = await exigirAtendimento()
  const supabase = await createClient()
  const [{ data, error }, { data: hoje }] = await Promise.all([
    numerosVisiveis(supabase, u.admin),
    // como o motor conta o limite diário: sem as conversas de teste
    supabase.from('disparos').select('numero_id').eq('teste', false).gte('enviado_em', inicioDoDiaBrasilia()).limit(20000)
  ])
  if (error) throw new Error(`números: ${error.message}`)
  const contagem = new Map<number, number>()
  for (const h of (hoje ?? []) as { numero_id: number | null }[]) {
    if (h.numero_id) contagem.set(h.numero_id, (contagem.get(h.numero_id) ?? 0) + 1)
  }
  return (data ?? []).map(n => ({ ...n, enviados_hoje: contagem.get(n.id) ?? 0 }))
}

export async function lerConfig() {
  await exigirAtendimento()
  const supabase = await createClient()
  const { data, error } = await supabase.from('disparo_config').select('*').eq('id', 1).single()
  if (error) throw new Error(`regras: ${error.message}`)
  return data as ConfigDisparo
}

export async function contarElegiveis(filtros: Filtros, excluirCompartilhados: boolean, grupo?: number) {
  await exigirAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('disparo_contar_elegiveis', { f: filtros, excluir_compartilhados: excluirCompartilhados, p_grupo: grupo ?? null })
  if (error) throw new Error(`elegíveis: ${error.message}`)
  return data as { com_whatsapp: number; elegiveis: number }
}

export async function listarBloqueios() {
  await exigirAdmin()
  const supabase = await createClient()
  const { data } = await supabase.from('disparo_bloqueios').select('*').order('criado_em', { ascending: false }).limit(200)
  return (data ?? []) as { id: number; telefone: string; grupo_id: number | null; motivo: string; observacao: string | null; criado_em: string }[]
}

export type LinhaRamo = {
  ramo: string
  ramo_nome: string
  total: number
  enviados: number
  aguardando: number
  responderam: number
  interessados: number
  preencheram: number
  atencao: number
}

/** Uma linha por ramo (a equipe só recebe os ramos dela) + quem responde cada ramo. */
export async function disparosPorRamo(campanha?: number, grupo?: number) {
  await exigirAtendimento()
  const supabase = await createClient()
  const [{ data, error }, { data: atribuicoes }, { data: pessoas }] = await Promise.all([
    supabase.rpc('disparo_por_ramo', { p_campanha: campanha ?? null, p_grupo: grupo ?? null }),
    supabase.from('equipe_ramos').select('user_id, ramo'),
    supabase.rpc('pessoas_equipe')
  ])
  if (error) throw new Error(`por ramo: ${error.message}`)
  const nome = new Map(((pessoas ?? []) as { user_id: string; nome: string }[]).map(p => [p.user_id, p.nome]))
  const responsaveis = new Map<string, string[]>()
  for (const a of (atribuicoes ?? []) as { user_id: string; ramo: string }[]) {
    const lista = responsaveis.get(a.ramo) ?? []
    lista.push(nome.get(a.user_id) ?? '—')
    responsaveis.set(a.ramo, lista)
  }
  return ((data ?? []) as LinhaRamo[]).map(r => ({
    ...r,
    total: Number(r.total),
    enviados: Number(r.enviados),
    aguardando: Number(r.aguardando),
    responderam: Number(r.responderam),
    interessados: Number(r.interessados),
    preencheram: Number(r.preencheram),
    atencao: Number(r.atencao),
    responsaveis: responsaveis.get(r.ramo) ?? []
  }))
}

export type GrupoResumo = GrupoDisparo & { numeros: number; campanhas_ativas: number; enviados: number; membros: number }

/** Grupos (o RLS decide: admin e equipe veem todos; o cliente, só os dele). */
export async function listarGrupos(): Promise<GrupoResumo[]> {
  await exigirAtendimento()
  const supabase = await createClient()
  const [{ data: grupos }, { data: numeros }, { data: campanhas }, { data: membros }] = await Promise.all([
    supabase.from('disparo_grupos').select('*').order('id'),
    supabase.from('disparo_numeros').select('id, grupo_id'),
    supabase.from('disparo_campanhas').select('grupo_id, status'),
    supabase.from('grupo_membros').select('grupo_id')
  ])
  const enviados = await enviadosPorGrupo(supabase, (grupos ?? []) as GrupoDisparo[])
  return ((grupos ?? []) as GrupoDisparo[]).map(g => ({
    ...g,
    numeros: ((numeros ?? []) as { grupo_id: number }[]).filter(n => n.grupo_id === g.id).length,
    campanhas_ativas: ((campanhas ?? []) as { grupo_id: number; status: string }[]).filter(c => c.grupo_id === g.id && c.status === 'ativa').length,
    enviados: enviados.get(g.id) ?? 0,
    membros: ((membros ?? []) as { grupo_id: number }[]).filter(m => m.grupo_id === g.id).length
  }))
}

/** Enviados (sem teste) por grupo numa consulta só (migração 020); sem ela, uma contagem por grupo como antes. */
async function enviadosPorGrupo(supabase: Awaited<ReturnType<typeof createClient>>, grupos: GrupoDisparo[]) {
  const enviados = new Map<number, number>()
  const { data, error } = await supabase.rpc('disparo_enviados_por_grupo')
  if (!error) {
    for (const l of (data ?? []) as { grupo_id: number; enviados: number }[]) enviados.set(Number(l.grupo_id), Number(l.enviados))
    return enviados
  }
  if (!faltaNoBanco(error)) console.error('[disparos] enviados por grupo', error.message)
  await Promise.all(
    grupos.map(async g => {
      const { count } = await supabase.from('disparos').select('id', { count: 'exact', head: true }).eq('grupo_id', g.id).eq('teste', false).not('enviado_em', 'is', null)
      enviados.set(g.id, count ?? 0)
    })
  )
  return enviados
}

export async function obterGrupo(id: number) {
  await exigirAtendimento()
  const supabase = await createClient()
  const { data } = await supabase.from('disparo_grupos').select('*').eq('id', id).maybeSingle()
  return (data as GrupoDisparo | null) ?? null
}
