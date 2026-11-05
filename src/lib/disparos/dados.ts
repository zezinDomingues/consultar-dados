// Leituras da área de Disparos (só servidor). Tudo passa pelo usuário logado: o RLS só libera administradores.
import 'server-only'
import { cache } from 'react'
import { usuarioAtual } from '@/lib/empresas/consulta'
import type { Filtros } from '@/lib/empresas/filtros'
import { createClient } from '@/lib/supabase/server'
import { inicioDoDiaBrasilia } from './config'
import {
  GRUPOS,
  type Campanha,
  type ConfigDisparo,
  type Disparo,
  type EventoDisparo,
  type Grupo,
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

/** A migração 005 já rodou neste banco? (a tela explica o que fazer se não) */
export const migracaoAplicada = cache(async () => {
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_config').select('id').limit(1)
  return !error || !/does not exist|schema cache|Could not find/i.test(error.message)
})

const COLUNAS_NUMERO =
  'id,rotulo,waha_url,waha_sessao,telefone,nome_perfil,ativo,limite_diario,intervalo_min_s,intervalo_max_s,status,' +
  'status_detalhe,status_em,webhook_em,ultimo_evento_em,proximo_envio_em,ultimo_envio_em,criado_em'

export async function resumoDisparos(campanha?: number) {
  await exigirAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('disparo_resumo', { p_campanha: campanha ?? null })
  if (error) throw new Error(`resumo: ${error.message}`)
  return data as ResumoDisparos
}

export type ConsultaDisparos = { grupo: Grupo; campanha?: number; q?: string; pagina: number; por: number }

export async function listarDisparos(c: ConsultaDisparos) {
  await exigirAdmin()
  const supabase = await createClient()
  let consulta = supabase.from('disparos').select('*', { count: 'exact' })
  const g = GRUPOS[c.grupo]
  if (c.grupo === 'atencao') consulta = consulta.eq('atencao', true)
  else if (c.grupo === 'leads') consulta = consulta.not('preenchido_em', 'is', null)
  else if (g.status) consulta = consulta.in('status', [...g.status])
  if (c.campanha) consulta = consulta.eq('campanha_id', c.campanha)
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
  await exigirAdmin()
  const supabase = await createClient()
  const [{ data: d, error }, { data: eventos }] = await Promise.all([
    supabase.from('disparos').select('*').eq('id', id).maybeSingle(),
    supabase.from('disparo_eventos').select('*').eq('disparo_id', id).order('criado_em').order('id').limit(500)
  ])
  if (error) throw new Error(`disparo: ${error.message}`)
  if (!d) return null
  const disparo = d as Disparo
  const [{ data: campanha }, { data: numero }] = await Promise.all([
    supabase.from('disparo_campanhas').select('id,nome,status').eq('id', disparo.campanha_id).maybeSingle(),
    disparo.numero_id
      ? supabase.from('disparo_numeros').select('id,rotulo,telefone,status').eq('id', disparo.numero_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])
  return {
    disparo,
    eventos: (eventos ?? []) as EventoDisparo[],
    campanha: campanha as Pick<Campanha, 'id' | 'nome' | 'status'> | null,
    numero: numero as Pick<Numero, 'id' | 'rotulo' | 'telefone' | 'status'> | null
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
  return ((data ?? []) as Campanha[]).map(c => ({ ...c, numeros: porId.get(c.id) ?? null }))
}

export async function obterCampanha(id: number) {
  await exigirAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.from('disparo_campanhas').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`campanha: ${error.message}`)
  return data as Campanha | null
}

/** Nomes das campanhas (para filtros e rótulos). */
export async function nomesCampanhas() {
  await exigirAdmin()
  const supabase = await createClient()
  const { data } = await supabase.from('disparo_campanhas').select('id,nome,status').order('criada_em', { ascending: false })
  return (data ?? []) as Pick<Campanha, 'id' | 'nome' | 'status'>[]
}

export async function listarNumeros() {
  await exigirAdmin()
  const supabase = await createClient()
  const [{ data, error }, { data: hoje }] = await Promise.all([
    supabase.from('disparo_numeros').select(COLUNAS_NUMERO).order('id'),
    supabase.from('disparos').select('numero_id').gte('enviado_em', inicioDoDiaBrasilia()).limit(20000)
  ])
  if (error) throw new Error(`números: ${error.message}`)
  const contagem = new Map<number, number>()
  for (const h of (hoje ?? []) as { numero_id: number | null }[]) {
    if (h.numero_id) contagem.set(h.numero_id, (contagem.get(h.numero_id) ?? 0) + 1)
  }
  return ((data ?? []) as unknown as Numero[]).map(n => ({ ...n, enviados_hoje: contagem.get(n.id) ?? 0 }))
}

export async function lerConfig() {
  await exigirAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.from('disparo_config').select('*').eq('id', 1).single()
  if (error) throw new Error(`regras: ${error.message}`)
  return data as ConfigDisparo
}

export async function contarElegiveis(filtros: Filtros, excluirCompartilhados: boolean) {
  await exigirAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('disparo_contar_elegiveis', { f: filtros, excluir_compartilhados: excluirCompartilhados })
  if (error) throw new Error(`elegíveis: ${error.message}`)
  return data as { com_whatsapp: number; elegiveis: number }
}

export async function listarBloqueios() {
  await exigirAdmin()
  const supabase = await createClient()
  const { data } = await supabase.from('disparo_bloqueios').select('*').order('criado_em', { ascending: false }).limit(200)
  return (data ?? []) as { telefone: string; motivo: string; observacao: string | null; criado_em: string }[]
}
