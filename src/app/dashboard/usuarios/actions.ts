'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/disparos/dados'
import { UFS } from '@/lib/empresas/filtros'
import { ROTAS } from '@/lib/rotas'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

export type Retorno = { ok?: boolean; erro?: string; mensagem?: string; senha?: string }

const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** Senha provisória legível (sem 0/O/1/l): o admin repassa e a pessoa troca depois. */
const senhaProvisoria = () => {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(12), b => alfabeto[b % alfabeto.length]).join('')
}

const Ramos = z.array(z.string().regex(/^\d{2}$/)).max(99)
const Plano = z
  .object({
    ramos: Ramos.min(1, 'Escolha pelo menos um ramo para o cliente.'),
    ufs: z.array(z.enum(UFS)).max(27),
    modalidade: z.enum(['mensal', 'pacote']),
    cota_mensal: z.coerce.number().int().positive().optional(),
    pacote_inicial: z.coerce.number().int().positive().optional(),
    validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    observacao: z.string().trim().max(500).optional()
  })
  .refine(p => p.modalidade !== 'mensal' || !!p.cota_mensal, { message: 'Informe quantas empresas por mês.' })

const ler = (fd: FormData) => {
  const v = (k: string) => {
    const x = fd.get(k)
    return x === null || x === '' ? undefined : String(x)
  }
  return {
    email: v('email'),
    nome: v('nome'),
    senha: v('senha'),
    papel: v('papel'),
    ativo: fd.get('ativo') === 'on',
    ramos: fd.getAll('ramos').map(String),
    plano: {
      ramos: fd.getAll('ramos').map(String),
      ufs: fd.getAll('ufs').map(String),
      modalidade: v('modalidade'),
      cota_mensal: v('cota_mensal'),
      pacote_inicial: v('pacote_inicial'),
      validade: v('validade'),
      observacao: v('observacao')
    }
  }
}

const PAPEIS = ['admin', 'equipe', 'consulta', 'cliente'] as const

/** Grava ramos (equipe) e plano (cliente) do papel escolhido e limpa o que não vale mais. */
async function gravarExtras(userId: string, papel: (typeof PAPEIS)[number], dados: ReturnType<typeof ler>, novo: boolean): Promise<string | null> {
  const db = supabaseAdmin()
  await db.from('equipe_ramos').delete().eq('user_id', userId)
  if (papel === 'equipe') {
    const r = Ramos.safeParse(dados.ramos)
    if (!r.success) return 'Ramos inválidos.'
    if (r.data.length) {
      const { error } = await db.from('equipe_ramos').insert(r.data.map(ramo => ({ user_id: userId, ramo })))
      if (error) return error.message
    }
  }
  if (papel === 'cliente') {
    const p = Plano.safeParse(dados.plano)
    if (!p.success) return p.error.issues[0]?.message ?? 'Plano inválido.'
    const { error } = await db.from('clientes_acesso').upsert({
      user_id: userId,
      ramos: p.data.ramos,
      ufs: p.data.ufs.length ? p.data.ufs : null,
      modalidade: p.data.modalidade,
      cota_mensal: p.data.modalidade === 'mensal' ? p.data.cota_mensal : null,
      validade: p.data.validade ?? null,
      observacao: p.data.observacao ?? null,
      atualizado_em: new Date().toISOString()
    })
    if (error) return error.message
    if (novo && p.data.modalidade === 'pacote' && p.data.pacote_inicial) {
      const { error: e2 } = await db.from('clientes_pacotes').insert({ user_id: userId, quantidade: p.data.pacote_inicial, observacao: 'pacote inicial' })
      if (e2) return e2.message
    }
  } else {
    await db.from('clientes_acesso').delete().eq('user_id', userId) // deixou de ser cliente: plano sai (liberações ficam no histórico)
  }
  return null
}

export async function criarUsuario(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  if (!temChaveSecreta()) return { erro: 'Falta a SUPABASE_SECRET_KEY no servidor.' }
  const d = ler(fd)
  const base = z
    .object({
      email: z.string().trim().toLowerCase().email('E-mail inválido.'),
      nome: z.string().trim().min(2, 'Informe o nome.').max(120),
      senha: z.string().min(8, 'Senha com pelo menos 8 caracteres.').max(72).optional(),
      papel: z.enum(PAPEIS)
    })
    .safeParse(d)
  if (!base.success) return { erro: base.error.issues[0]?.message ?? 'Dados inválidos.' }
  if (base.data.papel === 'cliente') {
    const p = Plano.safeParse(d.plano)
    if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Plano inválido.' }
  }
  const senha = base.data.senha ?? senhaProvisoria()
  const db = supabaseAdmin()
  const { data: criado, error } = await db.auth.admin.createUser({ email: base.data.email, password: senha, email_confirm: true })
  if (error) return { erro: /already|registered|exists/i.test(error.message) ? 'Já existe um login com esse e-mail.' : error.message }
  const userId = criado.user.id
  const { error: e2 } = await db.from('app_usuarios').insert({ user_id: userId, email: base.data.email, nome: base.data.nome, papel: base.data.papel })
  if (e2) {
    await db.auth.admin.deleteUser(userId) // não deixa login órfão
    return { erro: e2.message }
  }
  const extra = await gravarExtras(userId, base.data.papel, d, true)
  if (extra) return { erro: `Usuário criado, mas: ${extra}` }
  revalidatePath(ROTAS.usuarios)
  return {
    ok: true,
    mensagem: `${base.data.email} criado como ${base.data.papel}.`,
    senha: base.data.senha ? undefined : senha
  }
}

export async function atualizarUsuario(_: Retorno, fd: FormData): Promise<Retorno> {
  const eu = await exigirAdmin()
  const id = String(fd.get('user_id') ?? '')
  const d = ler(fd)
  const p = z.object({ nome: z.string().trim().min(2).max(120), papel: z.enum(PAPEIS) }).safeParse(d)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  if (id === eu.id && (p.data.papel !== 'admin' || !d.ativo)) return { erro: 'Você não pode tirar o seu próprio acesso de admin.' }
  const db = supabaseAdmin()
  const { error } = await db.from('app_usuarios').update({ nome: p.data.nome, papel: p.data.papel, ativo: d.ativo }).eq('user_id', id)
  if (error) return { erro: error.message }
  const extra = await gravarExtras(id, p.data.papel, d, false)
  if (extra) return { erro: extra }
  revalidatePath(ROTAS.usuarios, 'layout')
  return { ok: true, mensagem: 'Usuário atualizado.' }
}

export async function adicionarPacote(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirAdmin()
  const p = z
    .object({ user_id: z.string().uuid(), quantidade: z.coerce.number().int().positive('Quantidade inválida.').max(1_000_000), observacao: z.string().trim().max(200).optional() })
    .safeParse({ user_id: fd.get('user_id'), quantidade: fd.get('quantidade'), observacao: fd.get('observacao') || undefined })
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const { error } = await supabaseAdmin().from('clientes_pacotes').insert(p.data)
  if (error) return { erro: error.message }
  revalidatePath(ROTAS.usuarios, 'layout')
  return { ok: true, mensagem: `+${p.data.quantidade} empresas no saldo.` }
}

export async function redefinirSenha(id: string): Promise<Retorno> {
  await exigirAdmin()
  try {
    const senha = senhaProvisoria()
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password: senha })
    if (error) return { erro: error.message }
    return { ok: true, mensagem: 'Senha redefinida. Copie e repasse — ela não aparece de novo.', senha }
  } catch (e) {
    return { erro: erroDe(e) }
  }
}

