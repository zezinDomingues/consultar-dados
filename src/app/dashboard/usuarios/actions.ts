'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { exigirAdmin } from '@/lib/disparos/dados'
import { UFS } from '@/lib/empresas/filtros'
import { ROTAS } from '@/lib/rotas'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'
import { acharLogin, contarAdminsAtivos, dataValida, hojeBrasilia, UUID } from '@/lib/usuarios/regras'

/** Campo do formulário onde o erro aparece (a tela de Usuários mostra a mensagem junto dele). */
export type CampoUsuario =
  | 'nome' | 'email' | 'senha' | 'papel' | 'ramos' | 'grupos' | 'produto' | 'plano_ramos' | 'cota' | 'pacote'
  | 'validade' | 'observacao' | 'ativo'
export type Retorno = { ok?: boolean; erro?: string; mensagem?: string; senha?: string; campo?: CampoUsuario }

/** 1º erro do zod → mensagem + campo (o caminho do zod tem o nome do campo do formulário). */
const CAMPOS: Record<string, CampoUsuario> = {
  nome: 'nome', email: 'email', senha: 'senha', papel: 'papel', ramos: 'plano_ramos', cota_mensal: 'cota',
  pacote_inicial: 'pacote', quantidade: 'pacote', validade: 'validade', observacao: 'observacao'
}
const falhaZod = (e: z.ZodError, padrao: string): { erro: string; campo?: CampoUsuario } => {
  const i = e.issues[0]
  return { erro: i?.message ?? padrao, campo: CAMPOS[String(i?.path[0] ?? '')] }
}

const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** Senha provisória legível (sem 0/O/1/l): o admin repassa e a pessoa troca depois. */
const senhaProvisoria = () => {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(12), b => alfabeto[b % alfabeto.length]).join('')
}

const PAPEIS = ['admin', 'equipe', 'consulta', 'cliente'] as const
type PapelUsuario = (typeof PAPEIS)[number]

const quantidade = (rotulo: string) =>
  z.coerce
    .number({ error: `${rotulo} inválida.` })
    .int(`${rotulo} precisa ser um número inteiro.`)
    .positive(`${rotulo} precisa ser maior que zero.`)
    .max(1_000_000, `${rotulo} grande demais.`)

const Ramos = z.array(z.string().regex(/^\d{2}$/, 'Ramo inválido.')).max(99, 'Ramos demais.')
const Plano = z
  .object({
    ramos: Ramos.min(1, 'Escolha pelo menos um ramo para o cliente.'),
    ufs: z.array(z.enum(UFS, { error: 'Estado inválido.' })).max(27),
    modalidade: z.enum(['mensal', 'pacote'], { error: 'Escolha a modalidade do plano: mensal ou pacote.' }),
    cota_mensal: quantidade('Cota mensal').optional(),
    pacote_inicial: quantidade('Quantidade do pacote').optional(),
    validade: z.string().refine(dataValida, 'Validade inválida: escolha uma data que existe.').optional(),
    observacao: z.string().trim().max(500, 'Observação com no máximo 500 caracteres.').optional()
  })
  .refine(p => p.modalidade !== 'mensal' || !!p.cota_mensal, { message: 'Informe quantas empresas por mês.', path: ['cota_mensal'] })
type PlanoValido = z.infer<typeof Plano>

const Nome = z.string({ error: 'Informe o nome.' }).trim().min(2, 'Informe o nome.').max(120, 'Nome com no máximo 120 caracteres.')
const Papel = z.enum(PAPEIS, { error: 'Escolha o papel da pessoa.' })

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
    temConsulta: fd.get('tem_consulta') === 'on',
    grupos: fd.getAll('grupos').map(Number).filter(n => Number.isInteger(n) && n > 0),
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
type Dados = ReturnType<typeof ler>
type Extras = { ramos: string[]; grupos: number[]; plano: PlanoValido | null }

/**
 * Confere TUDO o que vai ser gravado antes de gravar qualquer coisa (BE-15): antes, um plano inválido só era
 * percebido depois de apagar os ramos e os grupos da pessoa.
 */
type Falha = { erro: string; campo?: CampoUsuario }

async function validarExtras(papel: PapelUsuario, d: Dados, validadeAtual: string | null): Promise<Falha | Extras> {
  let ramos: string[] = []
  if (papel === 'equipe') {
    const r = Ramos.safeParse(d.ramos)
    if (!r.success) return { erro: r.error.issues[0]?.message ?? 'Ramos inválidos.', campo: 'ramos' }
    // QA-11: sem ramo a pessoa da equipe não vê nenhum disparo
    if (!r.data.length) {
      return { erro: 'Escolha pelo menos um ramo para a pessoa da equipe: é por ele que ela recebe os disparos.', campo: 'ramos' }
    }
    ramos = [...new Set(r.data)]
  }
  const grupos = papel === 'admin' ? [] : [...new Set(d.grupos)]
  if (grupos.length) {
    const { data, error } = await supabaseAdmin().from('disparo_grupos').select('id').in('id', grupos)
    if (error) return { erro: 'Não foi possível conferir os grupos agora. Tente de novo.', campo: 'grupos' }
    if ((data ?? []).length !== grupos.length) {
      return { erro: 'Um dos grupos escolhidos não existe mais. Recarregue a página.', campo: 'grupos' }
    }
  }
  let plano: PlanoValido | null = null
  if (papel === 'cliente') {
    if (!d.temConsulta && !grupos.length) {
      return { erro: 'Escolha pelo menos um produto para o cliente: Consulta de dados ou um grupo de Disparos.', campo: 'produto' }
    }
    if (d.temConsulta) {
      const p = Plano.safeParse(d.plano)
      if (!p.success) return falhaZod(p.error, 'Plano inválido.')
      // validade no passado: recusada — a não ser que seja a que já estava gravada (editar outro campo de um plano vencido)
      if (p.data.validade && p.data.validade < hojeBrasilia() && p.data.validade !== validadeAtual) {
        return { erro: 'A validade do plano não pode estar no passado.', campo: 'validade' }
      }
      plano = { ...p.data, ufs: [...new Set(p.data.ufs)], ramos: [...new Set(p.data.ramos)] }
    }
  }
  return { ramos, grupos, plano }
}

const ULTIMO_ADMIN = 'É preciso ter pelo menos um administrador ativo: promova outra pessoa a admin antes.'

/** Erro do banco → mensagem para a tela (nada de nome de tabela/constraint). */
function mensagemDoBanco(e: { message: string; code?: string; hint?: string | null }) {
  if (e.hint === 'ultimo_admin' || /administrador ativo/i.test(e.message)) return ULTIMO_ADMIN
  if (e.code === '22023' || e.code === 'P0002') return e.message // já em português (admin_salvar_usuario)
  console.error('usuários:', e.message)
  return 'Não foi possível salvar agora. Tente de novo em instantes.'
}

type Gravar = { userId: string; email: string; nome: string; papel: PapelUsuario; ativo: boolean; novo: boolean; por: string }

/**
 * Grava papel, ramos, grupos e plano. Com a migração 021, numa transação só (admin_salvar_usuario) e o banco garante
 * que sempre sobra um admin. Sem ela, grava em passos — já validado — pondo o novo antes de tirar o velho, para uma
 * falha no meio não deixar a pessoa sem nada.
 */
async function gravar(g: Gravar, x: Extras): Promise<string | null> {
  const db = supabaseAdmin()
  const plano = x.plano
    ? { ramos: x.plano.ramos, ufs: x.plano.ufs, modalidade: x.plano.modalidade, cota_mensal: x.plano.cota_mensal ?? null,
        validade: x.plano.validade ?? null, observacao: x.plano.observacao ?? null }
    : null
  const { error } = await db.rpc('admin_salvar_usuario', {
    p_user: g.userId, p_email: g.email, p_nome: g.nome, p_papel: g.papel, p_ativo: g.ativo, p_novo: g.novo,
    p_ramos: x.ramos, p_grupos: x.grupos, p_plano: plano, p_pacote_inicial: x.plano?.pacote_inicial ?? null, p_por: g.por
  })
  if (!error) return null
  if (error.code !== 'PGRST202' && !/Could not find the function/i.test(error.message)) return mensagemDoBanco(error)
  return gravarEmPassos(g, x)
}

async function gravarEmPassos(g: Gravar, x: Extras): Promise<string | null> {
  const db = supabaseAdmin()
  if (g.novo) {
    const { error } = await db
      .from('app_usuarios')
      .insert({ user_id: g.userId, email: g.email, nome: g.nome, papel: g.papel, ativo: g.ativo })
    if (error) return mensagemDoBanco(error)
  } else {
    const { data: antes } = await db.from('app_usuarios').select('papel, ativo').eq('user_id', g.userId).maybeSingle()
    if (!antes) return 'Usuário não encontrado.'
    const { error } = await db.from('app_usuarios').update({ nome: g.nome, papel: g.papel, ativo: g.ativo }).eq('user_id', g.userId)
    if (error) return mensagemDoBanco(error)
    // sem o gatilho da 021: confere depois de gravar e desfaz se o sistema ficou sem admin (dois se rebaixando juntos)
    if (antes.papel === 'admin' && antes.ativo && (g.papel !== 'admin' || !g.ativo) && (await contarAdminsAtivos()) === 0) {
      await db.from('app_usuarios').update({ papel: antes.papel, ativo: antes.ativo }).eq('user_id', g.userId)
      return ULTIMO_ADMIN
    }
  }
  const lista = (v: (string | number)[]) => `(${v.join(',')})`
  if (x.ramos.length) {
    const linhas = x.ramos.map(ramo => ({ user_id: g.userId, ramo }))
    const { error } = await db.from('equipe_ramos').upsert(linhas, { ignoreDuplicates: true })
    if (error) return mensagemDoBanco(error)
  }
  let apagar = db.from('equipe_ramos').delete().eq('user_id', g.userId)
  if (x.ramos.length) apagar = apagar.not('ramo', 'in', lista(x.ramos))
  const { error: e1 } = await apagar
  if (e1) return mensagemDoBanco(e1)
  if (x.grupos.length) {
    const linhas = x.grupos.map(grupo_id => ({ user_id: g.userId, grupo_id }))
    const { error } = await db.from('grupo_membros').upsert(linhas, { ignoreDuplicates: true })
    if (error) return mensagemDoBanco(error)
  }
  let sair = db.from('grupo_membros').delete().eq('user_id', g.userId)
  if (x.grupos.length) sair = sair.not('grupo_id', 'in', lista(x.grupos))
  const { error: e2 } = await sair
  if (e2) return mensagemDoBanco(e2)
  if (x.plano) {
    const { error } = await db.from('clientes_acesso').upsert({
      user_id: g.userId,
      ramos: x.plano.ramos,
      ufs: x.plano.ufs.length ? x.plano.ufs : null,
      modalidade: x.plano.modalidade,
      cota_mensal: x.plano.modalidade === 'mensal' ? x.plano.cota_mensal : null,
      validade: x.plano.validade ?? null,
      observacao: x.plano.observacao ?? null,
      atualizado_em: new Date().toISOString()
    })
    if (error) return mensagemDoBanco(error)
    if (g.novo && x.plano.modalidade === 'pacote' && x.plano.pacote_inicial) {
      const { error: e3 } = await db
        .from('clientes_pacotes')
        .insert({ user_id: g.userId, quantidade: x.plano.pacote_inicial, observacao: 'pacote inicial', criado_por: g.por })
      if (e3) return mensagemDoBanco(e3)
    }
  } else {
    // sem o produto Consulta (ou deixou de ser cliente): o plano sai; as liberações ficam no histórico
    const { error } = await db.from('clientes_acesso').delete().eq('user_id', g.userId)
    if (error) return mensagemDoBanco(error)
  }
  return null
}

export async function criarUsuario(_: Retorno, fd: FormData): Promise<Retorno> {
  const eu = await exigirAdmin()
  if (!temChaveSecreta()) return { erro: 'Falta a SUPABASE_SECRET_KEY no servidor.' }
  const d = ler(fd)
  const base = z
    .object({
      email: z.string({ error: 'Informe o e-mail.' }).trim().toLowerCase().email('E-mail inválido.').max(200, 'E-mail longo demais.'),
      nome: Nome,
      senha: z.string().min(8, 'Senha com pelo menos 8 caracteres.').max(72, 'Senha com no máximo 72 caracteres.').optional(),
      papel: Papel
    })
    .safeParse(d)
  if (!base.success) return falhaZod(base.error, 'Dados inválidos.')
  const extras = await validarExtras(base.data.papel, d, null)
  if ('erro' in extras) return extras

  const senha = base.data.senha ?? senhaProvisoria()
  const db = supabaseAdmin()
  // Login criado e cadastro não (falha no meio): o login "órfão" travava o e-mail para sempre ("Já existe um
  // login…"). Agora ele é retomado — ganha a senha nova e o cadastro — e, se o cadastro falhar, o login é desfeito.
  // Órfão de menos de 1 minuto é outra aba/clique gravando agora: não mexe.
  const retomar = async (): Promise<{ id: string } | Falha | null> => {
    const achado = await acharLogin(base.data.email)
    if (!achado) return null
    const { data: cadastro } = await db.from('app_usuarios').select('user_id').eq('user_id', achado.id).maybeSingle()
    if (cadastro) return { erro: 'Já existe um usuário com esse e-mail.', campo: 'email' }
    if (Date.now() - new Date(achado.criadoEm).getTime() < 60_000) {
      return { erro: 'Esse e-mail está sendo cadastrado agora (outra aba ou clique duplo). Aguarde e recarregue a lista.', campo: 'email' }
    }
    const { error } = await db.auth.admin.updateUserById(achado.id, { password: senha, email_confirm: true })
    return error ? null : { id: achado.id }
  }
  let userId: string
  let criadoAgora = false
  const { data: criado, error } = await db.auth.admin.createUser({ email: base.data.email, password: senha, email_confirm: true })
  if (criado?.user) {
    userId = criado.user.id
    criadoAgora = true
  } else {
    const r = await retomar().catch(() => null)
    if (r && 'erro' in r) return r
    if (!r) {
      console.error('criar login:', error?.message)
      return { erro: 'Não foi possível criar o login agora. Tente de novo em instantes.' }
    }
    userId = r.id
  }

  const { email, nome, papel } = base.data
  const falha = await gravar({ userId, email, nome, papel, ativo: true, novo: true, por: eu.id }, extras)
  if (falha) {
    // não deixa login sem cadastro: apaga (as linhas parciais saem junto, em cascata). Se nem isso der, a próxima
    // tentativa com o mesmo e-mail retoma o login.
    const { error: e2 } = await db.auth.admin.deleteUser(userId).catch(e => ({ error: e as Error }))
    if (e2) console.error('desfazer login:', erroDe(e2))
    return { erro: `${falha} Nada foi gravado${criadoAgora ? '' : ' (o login anterior com esse e-mail foi descartado)'}.` }
  }
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
  if (!UUID.test(id)) return { erro: 'Usuário inválido.' }
  const d = ler(fd)
  const p = z.object({ nome: Nome, papel: Papel }).safeParse(d)
  if (!p.success) return falhaZod(p.error, 'Dados inválidos.')
  if (id === eu.id && (p.data.papel !== 'admin' || !d.ativo)) {
    return { erro: 'Você não pode tirar o seu próprio acesso de admin.', campo: p.data.papel !== 'admin' ? 'papel' : 'ativo' }
  }

  const db = supabaseAdmin()
  const [{ data: atual }, { data: acesso }] = await Promise.all([
    db.from('app_usuarios').select('email, papel, ativo').eq('user_id', id).maybeSingle(),
    db.from('clientes_acesso').select('validade').eq('user_id', id).maybeSingle()
  ])
  if (!atual) return { erro: 'Usuário não encontrado.' }
  const extras = await validarExtras(p.data.papel, d, (acesso?.validade as string | null) ?? null)
  if ('erro' in extras) return extras
  // Tirar um admin: precisa sobrar outro ativo. Aqui é a checagem rápida; a garantia (dois admins se rebaixando ao
  // mesmo tempo) é o gatilho da 021 ou, sem ela, a conferência depois de gravar.
  if (atual.papel === 'admin' && atual.ativo && (p.data.papel !== 'admin' || !d.ativo) && (await contarAdminsAtivos(id)) === 0) {
    return { erro: ULTIMO_ADMIN, campo: p.data.papel !== 'admin' ? 'papel' : 'ativo' }
  }

  const { nome, papel } = p.data
  const falha = await gravar({ userId: id, email: atual.email as string, nome, papel, ativo: d.ativo, novo: false, por: eu.id }, extras)
  if (falha) return { erro: falha, campo: falha === ULTIMO_ADMIN ? 'papel' : undefined }
  revalidatePath(ROTAS.usuarios, 'layout')
  return { ok: true, mensagem: 'Usuário atualizado.' }
}

export async function adicionarPacote(_: Retorno, fd: FormData): Promise<Retorno> {
  const eu = await exigirAdmin()
  const p = z
    .object({
      user_id: z.string().regex(UUID, 'Usuário inválido.'),
      quantidade: quantidade('Quantidade'),
      observacao: z.string().trim().max(200, 'Observação com no máximo 200 caracteres.').optional()
    })
    .safeParse({ user_id: fd.get('user_id'), quantidade: fd.get('quantidade'), observacao: fd.get('observacao') || undefined })
  if (!p.success) return falhaZod(p.error, 'Dados inválidos.')
  const { error } = await supabaseAdmin().from('clientes_pacotes').insert({ ...p.data, criado_por: eu.id })
  if (error) return { erro: mensagemDoBanco(error) }
  revalidatePath(ROTAS.usuarios, 'layout')
  return { ok: true, mensagem: `+${p.data.quantidade} empresas no saldo.` }
}

export async function redefinirSenha(id: string): Promise<Retorno> {
  await exigirAdmin()
  if (!UUID.test(id)) return { erro: 'Usuário inválido.' }
  try {
    const senha = senhaProvisoria()
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password: senha })
    if (error) {
      console.error('redefinir senha:', error.message)
      return { erro: 'Não foi possível redefinir a senha agora. Tente de novo em instantes.' }
    }
    return { ok: true, mensagem: 'Senha redefinida. Copie e repasse — ela não aparece de novo.', senha }
  } catch (e) {
    console.error('redefinir senha:', erroDe(e))
    return { erro: 'Não foi possível redefinir a senha agora. Tente de novo em instantes.' }
  }
}
