// Cria (ou atualiza a senha de) um usuário e o autoriza a consultar a base.
// Uso:
//   SUPABASE_SECRET_KEY=sb_secret_... npm run criar-usuario -- email@exemplo.com 'senha' 'Nome' [admin|consulta]
// A chave secreta NÃO fica no .env.local: passe só na hora de rodar.
import { createClient } from '@supabase/supabase-js'

const [email, senha, nome = null, papel = 'consulta'] = process.argv.slice(2)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY

if (!email || !senha) {
  console.error("Uso: SUPABASE_SECRET_KEY=... npm run criar-usuario -- email 'senha' 'Nome' [admin|consulta]")
  process.exit(1)
}
if (!url || !secret) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL (.env.local) ou SUPABASE_SECRET_KEY (variável de ambiente).')
  process.exit(1)
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })

let userId
const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
if (error) {
  if (!/already|registered|exists/i.test(error.message)) throw error
  // já existe: acha o id e troca a senha
  for (let page = 1; !userId; page++) {
    const { data, error: e2 } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (e2) throw e2
    userId = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())?.id
    if (data.users.length < 200) break
  }
  if (!userId) throw new Error('Usuário existe mas não foi encontrado na listagem.')
  const { error: e3 } = await admin.auth.admin.updateUserById(userId, { password: senha })
  if (e3) throw e3
  console.log('Usuário já existia: senha atualizada.')
} else {
  userId = criado.user.id
  console.log('Usuário criado.')
}

const { error: e4 } = await admin.from('app_usuarios').upsert({ user_id: userId, email, nome, papel })
if (e4) throw e4
console.log(`Autorizado a consultar: ${email} (${papel})`)
