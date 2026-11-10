'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { pendenciasServidor, segredoWaha, urlWebhook, urlWebhookZapi } from '@/lib/disparos/config'
import { exigirAdmin, exigirAtendimento } from '@/lib/disparos/dados'
import { conflitoDeTrava, erroDoBanco, faltaNoBanco } from '@/lib/disparos/erro'
import { mesmosFiltros, normalizarFiltros } from '@/lib/disparos/filtros'
import { fmtFone, MODELOS, nomeEmpresa, normalizarFone } from '@/lib/disparos/mensagens'
import { canalDe, carregarNumero, enviarPrimeiraDeTeste, responder } from '@/lib/disparos/motor'
import type { Disparo, Divisao, NumeroComChave } from '@/lib/disparos/tipos'
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
/** Só http(s): o zod aceita javascript: e data: como URL, e quem barrava era a CHECK do banco (erro cru na tela). */
const ehHttp = (v: string) => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v)
const url = (nome: string, msg = `${nome}: endereço inválido (comece com https://).`) =>
  z.string().trim().max(2000, `${nome}: endereço longo demais.`).url(msg).refine(ehHttp, msg)

const CampanhaSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  grupo_id: z.coerce.number().int().positive('Escolha o grupo.'),
  nome: texto(120, 'Nome'),
  filtros: z.string().transform((s, ctx) => {
    try {
      // campanha salva antes da 018 com o porte "Demais": vira Médio + Grande (senão "Filtros inválidos")
      const r = FiltrosSchema.safeParse(normalizarFiltros(JSON.parse(s || '{}')))
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
    .pipe(url('Imagem', 'Imagem: endereço inválido (precisa ser público, https://…).').nullable()),
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

type DadosCampanha = Omit<z.infer<typeof CampanhaSchema>, 'id' | 'ativar'>

/**
 * Grava os textos/regras de uma campanha salva. O público (filtros e grupo) não muda depois que a campanha começou a
 * enviar: a tela trava, e o servidor confere (público diferente = campanha nova). Devolve se a fila precisa ser
 * refeita — só quando a campanha está ATIVA (a pausada monta a fila ao ser ativada).
 */
async function atualizarCampanha(id: number, c: DadosCampanha): Promise<{ erro?: string; refazerFila?: boolean }> {
  const supabase = await createClient()
  const { data: antes, error: eAntes } = await supabase
    .from('disparo_campanhas')
    .select('status,limite_total,ordem,excluir_compartilhados,filtros,grupo_id')
    .eq('id', id)
    .maybeSingle()
  if (eAntes) return { erro: erroDoBanco(eAntes, 'ler a campanha') }
  if (!antes) return { erro: 'Campanha não encontrada (pode ter sido apagada). Recarregue a página.' }
  const mudouPublico = antes.grupo_id !== c.grupo_id || !mesmosFiltros(antes.filtros, c.filtros)
  if (mudouPublico) {
    const { count, error } = await supabaseAdmin().from('disparos').select('id', { count: 'exact', head: true }).eq('campanha_id', id).eq('teste', false)
    if (error) return { erro: erroDoBanco(error, 'conferir a campanha') }
    if (count) return { erro: 'Os filtros e o grupo não mudam depois que a campanha começou a enviar. Para outro público, crie uma campanha nova.' }
  }
  const { error } = await supabase.from('disparo_campanhas').update(colunas(c)).eq('id', id)
  if (error) return { erro: erroDoBanco(error, 'salvar a campanha') }
  const mudouRegras =
    mudouPublico || antes.limite_total !== c.limite_total || antes.ordem !== c.ordem || antes.excluir_compartilhados !== c.excluir_compartilhados
  return { refazerFila: antes.status === 'ativa' && mudouRegras }
}

/**
 * Refaz a fila (~3 s). As travas seguem a mesma ordem do ciclo (grupo → campanha → fila, migração 020); conflito
 * de trava tenta mais uma vez. Se não der, a fila velha é apagada (ela tem as regras antigas) e o ciclo monta uma
 * nova sozinho — e quem salvou fica sabendo.
 */
async function replanejar(id: number): Promise<string | null> {
  const db = supabaseAdmin()
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { error } = await db.rpc('disparo_replanejar', { p_campanha: id })
    if (!error) return null
    if (tentativa === 0 && conflitoDeTrava(error)) continue
    const motivo = erroDoBanco(error, 'refazer a fila')
    const { error: eApagar } = await db.from('disparo_plano').delete().eq('campanha_id', id)
    if (eApagar) console.error('[disparos] apagar fila velha', id, eApagar.message)
    return motivo
  }
  return null
}

export async function salvarCampanha(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const p = lerCampanha(fd)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { id, ativar, ...c } = p.data
  let novoId = id
  let refazerFila: boolean
  if (id) {
    const r = await atualizarCampanha(id, c)
    if (r.erro) return { erro: r.erro }
    refazerFila = !!r.refazerFila
  } else {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('disparo_campanhas')
      .insert({ ...colunas(c), status: ativar ? 'ativa' : 'pausada' })
      .select('id')
      .single()
    if (error) return { erro: erroDoBanco(error, 'criar a campanha') }
    novoId = data.id
    // pausada não monta fila (ocupa banco à toa): a fila nasce quando ela for ativada
    refazerFila = ativar
  }
  // Fila já dividida por nicho/estado/regime/porte/localização. Se falhar, o ciclo monta sozinho.
  const falhaFila = refazerFila && novoId ? await replanejar(novoId) : null
  atualizarTelas()
  if (falhaFila && id) {
    return { erro: `Campanha salva, mas a fila de envio não foi refeita agora (${falhaFila}) O ciclo monta a fila nova sozinho, com as regras novas.` }
  }
  redirect(`${ROTAS.campanhas}?salva=${novoId}${falhaFila ? '&fila=pendente' : ''}`)
}

const PreviaSchema = z.object({
  filtros: z.preprocess(normalizarFiltros, FiltrosSchema),
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
  if (error) return { erro: faltaNoBanco(error) ? 'a migração 017 (divisão dos disparos) ainda não foi aplicada no banco.' : erroDoBanco(error, 'calcular a divisão') }
  return { divisao: data as Divisao }
}

export async function mudarStatusCampanha(id: number, status: 'ativa' | 'pausada' | 'concluida'): Promise<Retorno> {
  await exigirAdmin()
  if (!Number.isInteger(id) || id <= 0 || !['ativa', 'pausada', 'concluida'].includes(status)) return { erro: 'Pedido inválido.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('disparo_campanhas')
    .update({
      status,
      motivo_status: status === 'concluida' ? 'encerrada manualmente' : null,
      atualizada_em: new Date().toISOString()
    })
    .eq('id', id)
    .select('id')
  if (error) return { erro: erroDoBanco(error, 'mudar a campanha') }
  if (!data?.length) return { erro: 'Campanha não encontrada (pode ter sido apagada). Recarregue a página.' }
  // pausar/encerrar apaga a fila (gatilho da 020); ativar monta a fila nova com as regras de agora
  const falhaFila = status === 'ativa' ? await replanejar(id) : null
  atualizarTelas()
  if (status !== 'ativa') return { ok: true, mensagem: status === 'pausada' ? 'Campanha pausada.' : 'Campanha encerrada.' }
  return { ok: true, mensagem: falhaFila ? `Campanha ativada. A fila não foi montada agora (${falhaFila}) — o ciclo monta sozinho.` : 'Campanha ativada.' }
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
  const id = p.data.id
  if (!id) return { erro: 'Crie a campanha (pode ser pausada) e teste pela tela dela — o teste usa os textos salvos.' }
  const telefone = normalizarFone(String(fd.get('teste_telefone') ?? ''))
  if (!telefone) return { erro: 'Informe o WhatsApp de teste com DDD.' }
  const numeroId = Number(fd.get('teste_numero'))
  if (!numeroId) return { erro: 'Cadastre e escolha um número de envio.' }
  if (pendenciasServidor().includes('SUPABASE_SECRET_KEY')) return { erro: 'Falta a SUPABASE_SECRET_KEY no servidor.' }

  const { id: _id, ativar: _ativar, ...c } = p.data
  // o número escolhido precisa ser do grupo da campanha — conferido ANTES de gravar qualquer coisa
  let n: NumeroComChave | null
  try {
    n = await carregarNumero(numeroId)
  } catch (e) {
    return { erro: `Não consegui ler o número: ${erroDe(e)}` }
  }
  if (!n) return { erro: 'Número não encontrado.' }
  if (n.grupo_id !== c.grupo_id) return { erro: 'Esse número é de outro grupo.' }

  const salvo = await atualizarCampanha(id, c)
  if (salvo.erro) return { erro: salvo.erro }
  if (salvo.refazerFila) await replanejar(id)

  const db = supabaseAdmin()
  try {
    // um número que já está no livro de verdade não pode virar teste (a regra "nunca duas vezes" vale para ele)
    const { data: existente, error: eExistente } = await db.from('disparos').select('id, teste').eq('grupo_id', c.grupo_id).eq('telefone', telefone).maybeSingle()
    if (eExistente) return { erro: erroDoBanco(eExistente, 'preparar o teste') }
    if (existente && !existente.teste) return { erro: 'Esse telefone já recebeu um disparo de verdade; use outro para testar.' }
    if (existente) {
      await db.from('disparo_bloqueios').delete().eq('telefone', telefone).eq('observacao', `disparo #${existente.id}`)
      const { error: eApagar } = await db.from('disparos').delete().eq('id', existente.id)
      if (eApagar) return { erro: erroDoBanco(eApagar, 'apagar o teste anterior') }
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
    if (error) return { erro: erroDoBanco(error, 'criar o teste') }
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
    waha_url: url('URL do WAHA', 'URL do WAHA inválida (ex.: https://waha3.mindloop.com.br).').transform(u => u.replace(/\/+$/, '')),
    // o banco aceita até 60 (CHECK da 005)
    waha_sessao: z
      .string()
      .trim()
      .min(1, 'Informe a sessão (WAHA) ou o ID da instância (Z-API).')
      .max(60, 'Sessão / ID da instância: até 60 caracteres.')
      .default('default'),
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
    const bloqueio = await trocaDeGrupoBloqueada(id, n.grupo_id)
    if (bloqueio) return { erro: bloqueio }
    const { error } = await supabase.from('disparo_numeros').update(linha).eq('id', id)
    if (error) return { erro: erroDoBanco(error, 'salvar o número') }
  } else {
    const { data, error } = await supabase.from('disparo_numeros').insert(linha).select('id').single()
    if (error) return { erro: erroDoBanco(error, 'cadastrar o número') }
    numeroId = data.id
  }
  const teste = await testarNumero(numeroId!)
  atualizarTelas()
  return { ok: true, mensagem: `Número salvo. ${teste.mensagem ?? teste.erro ?? ''}` }
}

/**
 * Trocar o grupo de um número com conversa em andamento quebraria a conversa (o contato é do grupo antigo, e só um
 * número do grupo do contato responde por ele). Conversa em andamento = coleta aberta, precisando de atenção ou com
 * movimento nos últimos 30 dias sem ter terminado.
 */
async function trocaDeGrupoBloqueada(id: number, grupoNovo: number): Promise<string | null> {
  const db = supabaseAdmin()
  const { data: atual, error } = await db.from('disparo_numeros').select('grupo_id').eq('id', id).maybeSingle()
  if (error) return erroDoBanco(error, 'ler o número')
  if (!atual || atual.grupo_id === grupoNovo) return null
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { count, error: e2 } = await db
    .from('disparos')
    .select('id', { count: 'exact', head: true })
    .eq('numero_id', id)
    .eq('grupo_id', atual.grupo_id)
    .or(`etapa.not.is.null,atencao.eq.true,and(status.in.(enviado,interessado,respondeu,reservado),atualizado_em.gte."${desde}")`)
  if (e2) return erroDoBanco(e2, 'conferir as conversas do número')
  if (!count) return null
  return `Este número tem ${count} conversa(s) em andamento no grupo atual. Trocar o grupo agora quebraria essas conversas: espere elas terminarem (ou pause o número e cadastre outro para o grupo novo).`
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
    // Z-API: URL com o token PRÓPRIO do número; WAHA: HMAC com a chave do WAHA
    await configurarWebhook(canalDe(n), n.provedor === 'zapi' ? urlWebhookZapi(id) : urlWebhook(id), segredoWaha() ?? undefined)
    const db = supabaseAdmin()
    await db.from('disparo_numeros').update({ webhook_em: new Date().toISOString() }).eq('id', id)
    // daqui em diante o token antigo (DISPAROS_SEGREDO na URL) não vale mais para este número (coluna da 020)
    const { error: eFlag } = await db.from('disparo_numeros').update({ webhook_por_numero: true }).eq('id', id)
    if (eFlag && !faltaNoBanco(eFlag)) console.error('[disparos] marcar webhook por número', id, eFlag.message)
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
  if (error) return { erro: erroDoBanco(error, 'mudar o número') }
  atualizarTelas()
  return { ok: true, mensagem: ativo ? 'Número ativado.' : 'Número pausado.' }
}

export async function excluirNumero(id: number): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { count } = await supabase.from('disparos').select('id', { count: 'exact', head: true }).eq('numero_id', id)
  if (count) return { erro: 'Este número já enviou mensagens: pause em vez de excluir (o histórico depende dele).' }
  const { error } = await supabase.from('disparo_numeros').delete().eq('id', id)
  if (error) return { erro: erroDoBanco(error, 'excluir o número') }
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
  if (error) return { erro: erroDoBanco(error, 'salvar as regras') }
  atualizarTelas()
  return { ok: true, mensagem: 'Regras salvas.' }
}

export async function pausarTudo(pausado: boolean): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_config').update({ pausado, atualizado_em: new Date().toISOString() }).eq('id', 1)
  if (error) return { erro: erroDoBanco(error, 'pausar') }
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
  if (error) return { erro: erroDoBanco(error, 'marcar como visto') }
  atualizarTelas()
  return { ok: true }
}

/**
 * Quem pode responder este contato: admin (todos); equipe só nos grupos de que faz parte (grupo_membros) E nos
 * ramos que recebeu (equipe_ramos); cliente só no(s) grupo(s) dele. Conferido aqui, no servidor, além do RLS.
 */
async function podeAtender(u: Awaited<ReturnType<typeof exigirAtendimento>>, d: Pick<Disparo, 'grupo_id' | 'ramo'>) {
  if (u.papel === 'admin') return true
  const db = supabaseAdmin()
  const { data: membro, error } = await db.from('grupo_membros').select('grupo_id').eq('user_id', u.id).eq('grupo_id', d.grupo_id).maybeSingle()
  if (error) throw new Error(erroDoBanco(error, 'conferir o acesso'))
  if (!membro) return false
  if (u.papel === 'cliente') return !!u.produtos?.disparos
  if (u.papel !== 'equipe' || !d.ramo) return false
  const { data: ramo, error: e2 } = await db.from('equipe_ramos').select('ramo').eq('user_id', u.id).eq('ramo', d.ramo).maybeSingle()
  if (e2) throw new Error(erroDoBanco(e2, 'conferir o acesso'))
  return !!ramo
}

/** O número pode falar com este contato: é do grupo do contato, ou foi ele mesmo que conversou com a pessoa. */
async function numeroPodeFalar(d: Pick<Disparo, 'id' | 'grupo_id'>, n: NumeroComChave) {
  if (n.grupo_id === d.grupo_id) return true
  const { count, error } = await supabaseAdmin()
    .from('disparo_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('disparo_id', d.id)
    .eq('numero_id', n.id)
    .in('tipo', ['enviada', 'recebida'])
  if (error) throw new Error(erroDoBanco(error, 'conferir o número'))
  return !!count
}

export async function enviarMensagemManual(id: number, mensagem: string): Promise<Retorno> {
  const u = await exigirAtendimento()
  const corpo = typeof mensagem === 'string' ? mensagem.trim() : ''
  if (!corpo) return { erro: 'Escreva a mensagem.' }
  if (corpo.length > 3000) return { erro: 'Mensagem longa demais (até 3.000 caracteres).' }
  if (!Number.isInteger(id) || id <= 0) return { erro: 'Contato não encontrado.' }
  try {
    // 1) o contato precisa estar visível para quem pede (RLS) e ser de alguém que essa pessoa atende
    const supabase = await createClient()
    const { data: visivel, error: eVisivel } = await supabase.from('disparos').select('id, grupo_id, ramo').eq('id', id).maybeSingle()
    if (eVisivel) return { erro: erroDoBanco(eVisivel, 'abrir o contato') }
    if (!visivel || !(await podeAtender(u, visivel))) return { erro: 'Contato não encontrado.' }

    // 2) só agora o registro inteiro pela chave de serviço — e conferido de novo (nada mudou de grupo/ramo no meio)
    const db = supabaseAdmin()
    const { data, error } = await db.from('disparos').select('*').eq('id', id).maybeSingle()
    if (error) return { erro: erroDoBanco(error, 'abrir o contato') }
    const d = data as Disparo | null
    if (!d || d.grupo_id !== visivel.grupo_id || d.ramo !== visivel.ramo) return { erro: 'Contato não encontrado.' }

    // 3) LGPD: quem pediu para sair (ou está bloqueado no grupo) não recebe mais nada
    if (d.status === 'descadastrado') return { erro: 'Esta pessoa pediu para não receber mais mensagens.' }
    const { count: bloqueado, error: eBloq } = await db
      .from('disparo_bloqueios')
      .select('id', { count: 'exact', head: true })
      .eq('telefone', d.telefone)
      .or(`grupo_id.is.null,grupo_id.eq.${d.grupo_id}`)
    if (eBloq) return { erro: erroDoBanco(eBloq, 'conferir os bloqueios') }
    if (bloqueado) return { erro: 'Este telefone está bloqueado (pediu para sair ou foi bloqueado à mão): não recebe mais mensagens.' }
    // recusou ("não tenho interesse"): só volta a receber se escreveu de novo depois da recusa
    if (d.status === 'sem_interesse') {
      const { data: ultima, error: eUltima } = await db
        .from('disparo_eventos')
        .select('criado_em')
        .eq('disparo_id', d.id)
        .eq('tipo', 'recebida')
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (eUltima) return { erro: erroDoBanco(eUltima, 'abrir a conversa') }
      const voltou = !!ultima && (!d.encerrado_em || new Date(ultima.criado_em) > new Date(d.encerrado_em))
      if (!voltou) return { erro: 'Esta pessoa disse que não tem interesse. Só dá para responder se ela escrever de novo.' }
    }

    // 4) a conversa é com o telefone do contato, pelo número do grupo que falou com ele
    if (d.status === 'reservado' || !d.chat_id || !d.numero_id) return { erro: 'Ainda não há conversa com este contato.' }
    if (normalizarFone(d.chat_id) !== d.telefone) return { erro: 'A conversa deste contato está inconsistente (o chat não é o telefone dele). Avise o administrador.' }
    const n = await carregarNumero(d.numero_id)
    if (!n) return { erro: 'O número que fez o contato foi excluído.' }
    if (!(await numeroPodeFalar(d, n))) return { erro: 'O número deste contato é de outro grupo: a mensagem não foi enviada.' }

    await responder(d, n, corpo, { autor: u.email })
    const { error: eVisto } = await supabase.from('disparos').update({ atencao: false }).eq('id', id)
    if (eVisto) console.error('[disparos] marcar visto após responder', id, eVisto.message)
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
  if (error && error.code !== '23505') return { erro: erroDoBanco(error, 'bloquear') }
  atualizarTelas()
  return { ok: true, mensagem: `${telefone} nunca será contatado.` }
}

export async function desbloquearTelefone(id: number): Promise<Retorno> {
  await exigirAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('disparo_bloqueios').delete().eq('id', id).eq('motivo', 'manual')
  if (error) return { erro: erroDoBanco(error, 'remover o bloqueio') }
  atualizarTelas()
  return { ok: true, mensagem: 'Bloqueio removido.' }
}

/**
 * Assinatura barata do Painel (para a tela "ao vivo"): muda quando algum disparo visível é criado, muda de situação
 * (enviado, entregue, lido, respondeu…) ou some. O RLS limita aos ramos da equipe. A tela só se atualiza quando muda.
 */
export async function versaoPainel(): Promise<string | null> {
  await exigirAtendimento()
  const supabase = await createClient()
  const [{ data }, { count }] = await Promise.all([
    supabase.from('disparos').select('atualizado_em').order('atualizado_em', { ascending: false }).limit(1),
    supabase.from('disparos').select('id', { count: 'exact', head: true })
  ])
  return `${data?.[0]?.atualizado_em ?? ''}|${count ?? 0}`
}
