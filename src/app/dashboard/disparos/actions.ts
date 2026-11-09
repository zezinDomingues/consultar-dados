'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { pendenciasServidor, segredoDisparos, urlWebhook } from '@/lib/disparos/config'
import { exigirAdmin, exigirAtendimento } from '@/lib/disparos/dados'
import { fmtFone, MODELOS, nomeEmpresa, normalizarFone } from '@/lib/disparos/mensagens'
import { canalDe, carregarNumero, enviarPrimeiraDeTeste, responder } from '@/lib/disparos/motor'
import type { Disparo, Divisao } from '@/lib/disparos/tipos'
import { configurarWebhook, lerSessao } from '@/lib/disparos/waha'
import { buscarEmpresas } from '@/lib/empresas/consulta'
import { FiltrosSchema, ORDENS } from '@/lib/empresas/filtros'
import { ROTAS } from '@/lib/rotas'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type Retorno = { ok?: boolean; erro?: string; mensagem?: string; campos?: Record<string, string> }

const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
const atualizarTelas = () => revalidatePath(ROTAS.disparos, 'layout')

// ---------------------------------------------------------------------------------------------------------------
// Campanhas
// ---------------------------------------------------------------------------------------------------------------

const texto = (max: number, nome: string) => z.string().trim().min(1, `${nome}: obrigatório.`).max(max, `${nome}: até ${max} caracteres.`)
const url = (nome: string) => z.string().trim().url(`${nome}: endereço inválido (comece com https://).`)

const CampanhaSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  grupo_id: z.coerce.number().int().positive('Escolha o grupo.'),
  nome: texto(120, 'Nome'),
  filtros: z.string().transform((s, ctx) => {
    try {
      const r = FiltrosSchema.safeParse(JSON.parse(s || '{}'))
      if (r.success) return r.data
    } catch {}
    ctx.addIssue({ code: 'custom', message: 'Filtros inválidos.' })
    return z.NEVER
  }),
  ordem: z.enum(Object.keys(ORDENS) as [keyof typeof ORDENS, ...(keyof typeof ORDENS)[]]).default('score'),
  excluir_compartilhados: z.coerce.boolean(),
  formato: z.enum(['botao', 'texto']),
  imagem_url: z
    .string()
    .trim()
    .transform(v => v || null)
    .pipe(z.string().url('Imagem: endereço inválido (precisa ser público, https://…).').nullable()),
  mensagem: texto(1024, '1ª mensagem'),
  rodape: z
    .string()
    .trim()
    .max(60, 'Rodapé: até 60 caracteres (limite do WhatsApp).')
    .transform(v => v || null),
  botao_texto: texto(20, 'Botão da 1ª mensagem (limite do WhatsApp: 20)'),
  pergunta_nome: texto(1000, 'Pergunta do nome'),
  pergunta_contato: texto(1000, 'Pergunta do número de contato'),
  botao_mesmo_numero: texto(20, 'Botão "este número" (limite do WhatsApp: 20)'),
  botao_outro_numero: texto(20, 'Botão "outro número" (limite do WhatsApp: 20)'),
  pergunta_telefone: texto(1000, 'Pergunta do outro número'),
  mensagem_obrigado: texto(1024, 'Mensagem final'),
  botao_site_texto: texto(20, 'Botão do site (limite do WhatsApp: 20)'),
  site_url: url('Site'),
  mensagem_nao: texto(1000, 'Resposta ao "não"'),
  limite_total: z
    .string()
    .trim()
    .transform(v => (v ? Number(v) : null))
    .pipe(z.number().int().positive('Quantidade de disparos: maior que zero (ou deixe em branco para sem limite).').nullable()),
  ativar: z.coerce.boolean()
})

const CAMPOS = [
  'id', 'grupo_id', 'nome', 'filtros', 'ordem', 'formato', 'imagem_url', 'mensagem', 'rodape', 'botao_texto', 'pergunta_nome',
  'pergunta_contato', 'botao_mesmo_numero', 'botao_outro_numero', 'pergunta_telefone', 'mensagem_obrigado', 'botao_site_texto', 'site_url', 'mensagem_nao', 'limite_total'
]

function lerCampanha(fd: FormData) {
  const obj: Record<string, unknown> = {}
  for (const k of CAMPOS) {
    const v = fd.get(k)
    if (v !== null && !(k === 'id' && v === '')) obj[k] = String(v)
  }
  for (const k of ['excluir_compartilhados', 'ativar']) obj[k] = fd.get(k) === 'on' || fd.get(k) === 'true' ? true : ''
  return CampanhaSchema.safeParse(obj)
}

/** Colunas antigas (enquete/link) continuam NOT NULL: preenche com os modelos. */
const colunas = (c: Omit<z.infer<typeof CampanhaSchema>, 'id' | 'ativar'>) => ({
  ...c,
  usar_enquete: false,
  enquete_pergunta: MODELOS.enquete_pergunta,
  opcao_sim: MODELOS.opcao_sim,
  opcao_nao: MODELOS.opcao_nao,
  mensagem_sim: c.pergunta_nome,
  atualizada_em: new Date().toISOString()
})

export async function salvarCampanha(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const p = lerCampanha(fd)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { id, ativar, ...c } = p.data
  const supabase = await createClient()
  let novoId = id
  let refazerFila = !id
  if (id) {
    const { data: antes } = await supabase
      .from('disparo_campanhas')
      .select('limite_total,ordem,excluir_compartilhados')
      .eq('id', id)
      .maybeSingle()
    refazerFila =
      !antes ||
      antes.limite_total !== c.limite_total ||
      antes.ordem !== c.ordem ||
      antes.excluir_compartilhados !== c.excluir_compartilhados
    const { error } = await supabase.from('disparo_campanhas').update(colunas(c)).eq('id', id)
    if (error) return { erro: error.message }
  } else {
    const { data, error } = await supabase
      .from('disparo_campanhas')
      .insert({ ...colunas(c), status: ativar ? 'ativa' : 'pausada' })
      .select('id')
      .single()
    if (error) return { erro: error.message }
    novoId = data.id
  }
  // Fila já dividida por nicho/estado/regime/porte/localização (~3 s). Se falhar, o ciclo monta sozinho quando
  // encontrar a fila vazia — a campanha salva não depende disto.
  if (refazerFila && novoId) {
    const { error } = await supabaseAdmin().rpc('disparo_replanejar', { p_campanha: novoId })
    if (error) console.error('[disparos] replanejar campanha', novoId, error.message)
  }
  atualizarTelas()
  redirect(`${ROTAS.campanhas}?salva=${novoId}`)
}

const PreviaSchema = z.object({
  filtros: FiltrosSchema,
  ordem: z.enum(Object.keys(ORDENS) as [keyof typeof ORDENS, ...(keyof typeof ORDENS)[]]).default('score'),
  excluir_compartilhados: z.boolean(),
  grupo_id: z.number().int().positive(),
  quantidade: z.number().int().min(1).max(20000)
})

/**
 * Prévia de campanha nova: como a quantidade se divide entre nichos, estados, regimes, portes e localizações
 * (o que não foi filtrado divide por igual). Não grava nada.
 */
export async function previaDivisao(entrada: z.input<typeof PreviaSchema>): Promise<{ divisao?: Divisao; erro?: string }> {
  await exigirAdmin()
  const p = PreviaSchema.safeParse(entrada)
  if (!p.success) return { erro: 'Quantidade entre 1 e 20.000.' }
  const { data, error } = await supabaseAdmin().rpc('disparo_divisao_previa', {
    f: p.data.filtros,
    p_ordem: p.data.ordem,
    p_excluir_compartilhados: p.data.excluir_compartilhados,
    p_grupo: p.data.grupo_id,
    p_quantidade: p.data.quantidade
  })
  if (error) {
    return {
      erro: /could not find the function/i.test(error.message)
        ? 'a migração 017 (divisão dos disparos) ainda não foi aplicada no banco.'
        : error.message
    }
  }
  return { divisao: data as Divisao }
}

export async function mudarStatusCampanha(id: number, status: 'ativa' | 'pausada' | 'concluida'): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('disparo_campanhas')
    .update({
      status,
      motivo_status: status === 'concluida' ? 'encerrada manualmente' : null,
      atualizada_em: new Date().toISOString()
    })
    .eq('id', id)
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: status === 'ativa' ? 'Campanha ativada.' : status === 'pausada' ? 'Campanha pausada.' : 'Campanha encerrada.' }
}

/**
 * Teste da CONVERSA INTEIRA no WhatsApp do administrador: salva os textos da tela, abre um registro de teste
 * (fora do funil) e manda a 1ª mensagem de verdade. Daí em diante é o fluxo real: tocar no botão, responder nome
 * e CNPJ, receber a mensagem final. Um teste novo para o mesmo telefone apaga o anterior.
 */
export async function enviarTeste(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const p = lerCampanha(fd)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  if (!p.data.id) return { erro: 'Crie a campanha (pode ser pausada) e teste pela tela dela — o teste usa os textos salvos.' }
  const telefone = normalizarFone(String(fd.get('teste_telefone') ?? ''))
  if (!telefone) return { erro: 'Informe o WhatsApp de teste com DDD.' }
  const numeroId = Number(fd.get('teste_numero'))
  if (!numeroId) return { erro: 'Cadastre e escolha um número de envio.' }
  if (pendenciasServidor().includes('SUPABASE_SECRET_KEY')) return { erro: 'Falta a SUPABASE_SECRET_KEY no servidor.' }

  const { id, ativar: _ativar, ...c } = p.data
  const supabase = await createClient()
  const { error: erroSalvar } = await supabase.from('disparo_campanhas').update(colunas(c)).eq('id', id)
  if (erroSalvar) return { erro: erroSalvar.message }

  const db = supabaseAdmin()
  try {
    // um número que já está no livro de verdade não pode virar teste (a regra "nunca duas vezes" vale para ele)
    const { data: existente } = await db.from('disparos').select('id, teste').eq('grupo_id', c.grupo_id).eq('telefone', telefone).maybeSingle()
    if (existente && !existente.teste) return { erro: 'Esse telefone já recebeu um disparo de verdade; use outro para testar.' }
    if (existente) {
      await db.from('disparo_bloqueios').delete().eq('telefone', telefone).eq('observacao', `disparo #${existente.id}`)
      await db.from('disparos').delete().eq('id', existente.id)
    }
    const [exemplo] = (await buscarEmpresas({ ...c.filtros, com_whatsapp: true }, c.ordem, 1, 1, 'razao_social,nome_fantasia,municipio,divisao,ramo,uf')) as unknown as {
      razao_social: string; nome_fantasia: string | null; municipio: string; divisao: string; ramo: string; uf: string
    }[]
    const { data: d, error } = await db
      .from('disparos')
      .insert({
        grupo_id: c.grupo_id,
        campanha_id: id,
        numero_id: numeroId,
        cnpj: `TESTE-${telefone}`,
        telefone,
        teste: true,
        razao_social: exemplo?.razao_social ?? 'EMPRESA EXEMPLO LTDA',
        nome_fantasia: exemplo?.nome_fantasia ?? null,
        municipio: exemplo?.municipio ?? 'São Paulo',
        ramo: exemplo?.divisao ?? null,
        ramo_nome: exemplo?.ramo ?? null,
        uf: exemplo?.uf ?? null
      })
      .select('*')
      .single()
    if (error) return { erro: error.message }
    const n = await carregarNumero(numeroId)
    if (!n) return { erro: 'Número não encontrado.' }
    if (n.grupo_id !== c.grupo_id) return { erro: 'Esse número é de outro grupo.' }
    const r = await enviarPrimeiraDeTeste(d as Disparo, n)
    atualizarTelas()
    if (r.resultado !== 'enviado') return { erro: `Teste não saiu: ${r.resultado}` }
    return {
      ok: true,
      mensagem: `Teste enviado para ${fmtFone(telefone)} (exemplo: ${nomeEmpresa(d as Disparo)}). Responda no celular como um cliente faria — a conversa aparece no Painel com o selo "teste".`
    }
  } catch (e) {
    return { erro: `Falha no teste: ${erroDe(e)}` }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Números (sessões do WAHA)
// ---------------------------------------------------------------------------------------------------------------

const NumeroSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    rotulo: texto(60, 'Nome'),
    grupo_id: z.coerce.number().int().positive('Escolha o grupo do número.'),
    provedor: z.enum(['waha', 'zapi']).default('waha'),
    waha_url: z.string().trim().url('URL do WAHA inválida (ex.: https://waha3.mindloop.com.br).').transform(u => u.replace(/\/+$/, '')),
    waha_sessao: z.string().trim().min(1, 'Informe a sessão (WAHA) ou o ID da instância (Z-API).').max(80).default('default'),
    waha_api_key: z.string().trim().max(200).optional(),
    client_token: z.string().trim().max(200).optional(),
    limite_diario: z.coerce.number().int().min(1).max(2000),
    intervalo_min_s: z.coerce.number().int().min(20, 'Intervalo mínimo: 20 s.'),
    intervalo_max_s: z.coerce.number().int().min(20),
    ativo: z.coerce.boolean()
  })
  .refine(n => n.intervalo_max_s >= n.intervalo_min_s, { message: 'O intervalo máximo precisa ser ≥ o mínimo.' })

export async function salvarNumero(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const campos = ['id', 'rotulo', 'grupo_id', 'provedor', 'waha_url', 'waha_sessao', 'waha_api_key', 'client_token', 'limite_diario', 'intervalo_min_s', 'intervalo_max_s']
  const obj: Record<string, unknown> = Object.fromEntries(campos.map(k => [k, fd.get(k) ?? undefined]).filter(([, v]) => v !== '' && v !== undefined))
  if (obj.provedor === 'zapi') obj.waha_url = 'https://api.z-api.io' // na Z-API o endereço é fixo
  const p = NumeroSchema.safeParse({ ...obj, ativo: fd.get('ativo') === 'on' ? true : '' })
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { id, waha_api_key, client_token, ...n } = p.data
  if (!id && !waha_api_key) return { erro: n.provedor === 'zapi' ? 'Informe o token da instância.' : 'Informe a API key do WAHA.' }
  if (!id && n.provedor === 'zapi' && !client_token) return { erro: 'Informe o Client-Token (Segurança → token da conta).' }
  const supabase = await createClient()
  const linha = { ...n, ...(waha_api_key ? { waha_api_key } : {}), ...(client_token ? { client_token } : {}) }
  let numeroId = id
  if (id) {
    const { error } = await supabase.from('disparo_numeros').update(linha).eq('id', id)
    if (error) return { erro: error.message }
  } else {
    const { data, error } = await supabase.from('disparo_numeros').insert(linha).select('id').single()
    if (error) return { erro: error.message }
    numeroId = data.id
  }
  const teste = await testarNumero(numeroId!)
  atualizarTelas()
  return { ok: true, mensagem: `Número salvo. ${teste.mensagem ?? teste.erro ?? ''}` }
}

export async function testarNumero(id: number): Promise<Retorno> {
  await exigirAdmin()
  if (pendenciasServidor().includes('SUPABASE_SECRET_KEY')) return { erro: 'Falta a SUPABASE_SECRET_KEY no servidor para falar com o WAHA.' }
  const n = await carregarNumero(id)
  if (!n) return { erro: 'Número não encontrado.' }
  const db = supabaseAdmin()
  const agora = new Date().toISOString()
  try {
    const s = await lerSessao(canalDe(n))
    const telefone = s?.me?.id ? normalizarFone(s.me.id) : null
    await db
      .from('disparo_numeros')
      .update({
        status: s?.status ?? 'DESCONHECIDO',
        status_detalhe: s?.status === 'WORKING' ? null : (s?.detalhe ?? (n.provedor === 'zapi' ? 'conecte o número pelo QR no painel da Z-API' : 'conecte o número no painel do WAHA (código de 8 dígitos)')),
        status_em: agora,
        ...(telefone ? { telefone } : {}),
        ...(s?.me?.pushName ? { nome_perfil: s.me.pushName } : {})
      })
      .eq('id', id)
    atualizarTelas()
    return s?.status === 'WORKING'
      ? { ok: true, mensagem: `Conectado: sessão WORKING${telefone ? ` no número ${telefone}` : ''}.` }
      : { erro: `${n.provedor === 'zapi' ? 'A Z-API' : 'O WAHA'} respondeu, mas a sessão está ${s?.status ?? 'sem status'}. Conecte o número no painel ${n.provedor === 'zapi' ? 'da Z-API (QR code)' : 'do WAHA'}.` }
  } catch (e) {
    await db.from('disparo_numeros').update({ status: 'ERRO', status_detalhe: erroDe(e).slice(0, 300), status_em: agora }).eq('id', id)
    atualizarTelas()
    return { erro: `Não consegui falar com ${n.provedor === 'zapi' ? 'a Z-API' : 'o WAHA'}: ${erroDe(e)}` }
  }
}

export async function conectarWebhook(id: number): Promise<Retorno> {
  await exigirAdmin()
  const faltam = pendenciasServidor()
  if (faltam.length) return { erro: `Configure no servidor: ${faltam.join(', ')}.` }
  const n = await carregarNumero(id)
  if (!n) return { erro: 'Número não encontrado.' }
  try {
    await configurarWebhook(canalDe(n), urlWebhook(id), segredoDisparos()!)
    await supabaseAdmin().from('disparo_numeros').update({ webhook_em: new Date().toISOString() }).eq('id', id)
    atualizarTelas()
    return { ok: true, mensagem: n.provedor === 'zapi' ? 'Webhooks da Z-API apontados para a plataforma (recebidas, status, conexão).' : 'Webhook configurado. O WAHA reinicia a sessão (volta a WORKING em ~20 s, sem parear de novo).' }
  } catch (e) {
    return { erro: `Falha ao configurar o webhook: ${erroDe(e)}` }
  }
}

export async function alternarNumero(id: number, ativo: boolean): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_numeros').update({ ativo }).eq('id', id)
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: ativo ? 'Número ativado.' : 'Número pausado.' }
}

export async function excluirNumero(id: number): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { count } = await supabase.from('disparos').select('id', { count: 'exact', head: true }).eq('numero_id', id)
  if (count) return { erro: 'Este número já enviou mensagens: pause em vez de excluir (o histórico depende dele).' }
  const { error } = await supabase.from('disparo_numeros').delete().eq('id', id)
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: 'Número excluído.' }
}

// ---------------------------------------------------------------------------------------------------------------
// Regras gerais
// ---------------------------------------------------------------------------------------------------------------

export async function salvarRegras(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const p = z
    .object({
      hora_inicio: z.coerce.number().int().min(0).max(23),
      hora_fim: z.coerce.number().int().min(1).max(24),
      dias_semana: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Escolha pelo menos um dia.')
    })
    .refine(r => r.hora_fim > r.hora_inicio, { message: 'O fim precisa ser depois do início.' })
    .safeParse({ hora_inicio: fd.get('hora_inicio'), hora_fim: fd.get('hora_fim'), dias_semana: fd.getAll('dias_semana') })
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('disparo_config')
    .update({ ...p.data, atualizado_em: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: 'Regras salvas.' }
}

export async function pausarTudo(pausado: boolean): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_config').update({ pausado, atualizado_em: new Date().toISOString() }).eq('id', 1)
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: pausado ? 'Todos os disparos pausados.' : 'Disparos liberados.' }
}

// ---------------------------------------------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------------------------------------------

export async function marcarComoVisto(id: number): Promise<Retorno> {
  await exigirAtendimento()
  const supabase = await createClient()
  const { error } = await supabase.from('disparos').update({ atencao: false }).eq('id', id)
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true }
}

export async function enviarMensagemManual(id: number, mensagem: string): Promise<Retorno> {
  // a equipe responde pelos ramos dela: o select abaixo passa pelo RLS e não acha contato de outro ramo
  const u = await exigirAtendimento()
  const corpo = mensagem.trim()
  if (!corpo) return { erro: 'Escreva a mensagem.' }
  if (corpo.length > 3000) return { erro: 'Mensagem longa demais (até 3.000 caracteres).' }
  const supabase = await createClient()
  const { data } = await supabase.from('disparos').select('*').eq('id', id).maybeSingle()
  const d = data as Disparo | null
  if (!d) return { erro: 'Contato não encontrado.' }
  if (d.status === 'descadastrado') return { erro: 'Esta pessoa pediu para não receber mais mensagens.' }
  if (!d.chat_id || !d.numero_id) return { erro: 'Ainda não há conversa com este contato.' }
  try {
    const n = await carregarNumero(d.numero_id)
    if (!n) return { erro: 'O número que fez o contato foi excluído.' }
    await responder(d, n, corpo, { autor: u.email })
    await supabase.from('disparos').update({ atencao: false }).eq('id', id)
    atualizarTelas()
    return { ok: true, mensagem: 'Mensagem enviada.' }
  } catch (e) {
    return { erro: `Não foi possível enviar: ${erroDe(e)}` }
  }
}

export async function bloquearTelefone(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const telefone = normalizarFone(String(fd.get('telefone') ?? ''))
  if (!telefone) return { erro: 'Telefone inválido (DDD + número).' }
  const observacao = String(fd.get('observacao') ?? '').trim().slice(0, 200) || null
  const grupo = Number(fd.get('grupo_id')) || null
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_bloqueios').insert({ telefone, grupo_id: grupo, motivo: 'manual', observacao })
  if (error && error.code !== '23505') return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: `${telefone} nunca será contatado.` }
}

export async function desbloquearTelefone(id: number): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_bloqueios').delete().eq('id', id).eq('motivo', 'manual')
  if (error) return { erro: error.message }
  atualizarTelas()
  return { ok: true, mensagem: 'Bloqueio removido.' }
}
