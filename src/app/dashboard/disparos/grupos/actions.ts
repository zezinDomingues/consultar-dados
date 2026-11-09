'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/disparos/dados'
import { erroDoBanco } from '@/lib/disparos/erro'
import { ROTAS } from '@/lib/rotas'
import { createClient } from '@/lib/supabase/server'

export type Retorno = { ok?: boolean; erro?: string; mensagem?: string }

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform(v => v || undefined)

/** Só http(s): o zod aceita javascript: e data: como URL (quem barrava era a CHECK do banco, com erro cru). */
const enderecoHttp = (msg: string) =>
  z
    .string()
    .trim()
    .max(2000, msg)
    .transform(v => v || null)
    .pipe(z.string().url(msg).refine(v => /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(v), msg).nullable())

/**
 * Texto do modelo que a tela mostra: se veio no formulário, não pode estar vazio — vazio fazia o grupo cair no
 * texto padrão em silêncio. Campo que a tela não manda (ex.: perguntas da coleta num grupo de divulgação) fica de
 * fora e a campanha usa o padrão.
 */
const textoDoModelo = (max: number, nome: string) =>
  z.string().trim().min(1, `${nome}: não pode ficar vazio.`).max(max, `${nome}: até ${max} caracteres.`).optional()

const GrupoSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  nome: z.string().trim().min(1, 'Dê um nome ao grupo.').max(80, 'Nome do grupo: até 80 caracteres.'),
  logo_url: enderecoHttp('Logo: endereço inválido (precisa começar com https://).'),
  site_url: enderecoHttp('Site: endereço inválido (comece com https://).'),
  fluxo: z.enum(['coleta', 'divulgacao'], { error: 'Escolha o tipo de conversa do grupo.' }),
  medir_cliques: z.coerce.boolean(),
  ativo: z.coerce.boolean(),
  observacao: opcional(500),
  // modelo das mensagens (campanhas novas do grupo começam com estes textos)
  mensagem: textoDoModelo(1024, '1ª mensagem'),
  // rodapé vazio = a campanha usa o rodapé padrão ("Responda SAIR…"): sem aviso de saída é pior do que com
  rodape: opcional(60),
  botao_texto: textoDoModelo(20, 'Botão (limite do WhatsApp: 20)'),
  pergunta_nome: textoDoModelo(1000, 'Pergunta do nome'),
  pergunta_contato: textoDoModelo(1000, 'Pergunta do número de contato'),
  pergunta_telefone: textoDoModelo(1000, 'Pergunta do outro número'),
  mensagem_obrigado: textoDoModelo(1024, 'Mensagem final'),
  botao_site_texto: textoDoModelo(20, 'Botão do site (limite do WhatsApp: 20)'),
  mensagem_nao: textoDoModelo(1000, 'Resposta ao "não"')
})

const MODELO = ['mensagem', 'rodape', 'botao_texto', 'pergunta_nome', 'pergunta_contato', 'pergunta_telefone', 'mensagem_obrigado', 'botao_site_texto', 'mensagem_nao'] as const

export async function salvarGrupo(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const obj: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))
  for (const k of ['medir_cliques', 'ativo']) obj[k] = fd.get(k) === 'on' ? true : ''
  if (!obj.id) delete obj.id
  const p = GrupoSchema.safeParse(obj)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const g = p.data
  // a 1ª mensagem abre toda conversa: sem ela o grupo não é salvo
  if (g.mensagem === undefined) return { erro: '1ª mensagem: obrigatória (é o texto que abre a conversa).' }
  const modelo = Object.fromEntries(MODELO.filter(k => g[k] !== undefined).map(k => [k, g[k]]))
  const linha = {
    nome: g.nome,
    logo_url: g.logo_url,
    site_url: g.site_url,
    fluxo: g.fluxo,
    medir_cliques: g.medir_cliques,
    ativo: g.ativo,
    observacao: g.observacao ?? null,
    modelo
  }
  const supabase = await createClient()
  let id = g.id
  if (id) {
    const { data, error } = await supabase.from('disparo_grupos').update(linha).eq('id', id).select('id')
    if (error) return { erro: erroDoBanco(error, 'salvar o grupo') }
    if (!data?.length) return { erro: 'Grupo não encontrado (pode ter sido apagado). Recarregue a página.' }
  } else {
    const { data, error } = await supabase.from('disparo_grupos').insert(linha).select('id').single()
    if (error) return { erro: erroDoBanco(error, 'criar o grupo') }
    id = data.id
  }
  revalidatePath(ROTAS.disparos, 'layout')
  redirect(`${ROTAS.grupos}?salvo=${id}`)
}
