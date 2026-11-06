'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/disparos/dados'
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

const GrupoSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  nome: z.string().trim().min(1, 'Dê um nome ao grupo.').max(80),
  logo_url: z
    .string()
    .trim()
    .transform(v => v || null)
    .pipe(z.string().url('Logo: endereço inválido.').nullable()),
  site_url: z
    .string()
    .trim()
    .transform(v => v || null)
    .pipe(z.string().url('Site: endereço inválido (comece com https://).').nullable()),
  fluxo: z.enum(['coleta', 'divulgacao']),
  medir_cliques: z.coerce.boolean(),
  ativo: z.coerce.boolean(),
  observacao: opcional(500),
  // modelo das mensagens (campanhas novas do grupo começam com estes textos)
  mensagem: opcional(1024),
  rodape: opcional(60),
  botao_texto: opcional(20),
  pergunta_nome: opcional(1000),
  pergunta_contato: opcional(1000),
  pergunta_telefone: opcional(1000),
  mensagem_obrigado: opcional(1024),
  botao_site_texto: opcional(20),
  mensagem_nao: opcional(1000)
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
  const modelo = Object.fromEntries(MODELO.filter(k => g[k]).map(k => [k, g[k]]))
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
    const { error } = await supabase.from('disparo_grupos').update(linha).eq('id', id)
    if (error) return { erro: error.message }
  } else {
    const { data, error } = await supabase.from('disparo_grupos').insert(linha).select('id').single()
    if (error) return { erro: error.message }
    id = data.id
  }
  revalidatePath(ROTAS.disparos, 'layout')
  redirect(`${ROTAS.grupos}?salvo=${id}`)
}
