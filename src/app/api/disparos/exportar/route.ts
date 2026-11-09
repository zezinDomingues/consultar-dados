import { NextResponse, type NextRequest } from 'next/server'
import { avisoCorte, celula, linha, respostaCsv } from '@/lib/csv'
import { exigirAtendimento, SemAdminError } from '@/lib/disparos/dados'
import { fmtCnpj, fmtFone } from '@/lib/disparos/mensagens'
import { GRUPOS, ROTULO_STATUS, type Disparo, type Grupo } from '@/lib/disparos/tipos'
import { createClient } from '@/lib/supabase/server'

// CSV dos contatos da aba atual do painel. Quem vê o painel exporta o mesmo que vê, e o RLS do banco garante:
// admin (tudo), equipe (só os grupos de que é membro e, neles, só os seus ramos) e cliente de disparos (só o
// grupo dele). Paginação por id (chave estável): o atualizado_em muda durante a exportação e o OFFSET
// duplicava/pulava linhas. Ordem do arquivo: mais novos primeiro (id decrescente).
export const dynamic = 'force-dynamic'

const LIMITE = 20_000
const LOTE = 1000
const COLUNAS =
  'id,cnpj,razao_social,nome_fantasia,municipio,telefone,status,enviado_em,entregue_em,lido_em,respondido_em,ultima_resposta,' +
  'interessado_em,preenchido_em,lead_nome,lead_cnpj,lead_empresa,lead_email,lead_whatsapp,teste,ramo_nome,uf,erro'

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

export async function GET(request: NextRequest) {
  try {
    await exigirAtendimento()
  } catch (e) {
    if (e instanceof SemAdminError) return NextResponse.json({ erro: e.message }, { status: 403 })
    return NextResponse.json({ erro: 'Não foi possível verificar sua sessão agora. Tente de novo em instantes.' }, { status: 503 })
  }

  // mesmos filtros do painel (lerConsulta de disparos/page.tsx e listarDisparos de lib/disparos/dados.ts)
  const sp = request.nextUrl.searchParams
  const grupo = (sp.get('grupo') && sp.get('grupo')! in GRUPOS ? sp.get('grupo') : 'todos') as Grupo
  const campanha = Number(sp.get('campanha')) || undefined
  const ramo = /^(\d{2}|\?\?)$/.test(sp.get('ramo') ?? '') ? sp.get('ramo')! : undefined
  const grupoId = Number(sp.get('gr')) || undefined
  const termo = sp.get('q')?.replace(/[,()%*\\]/g, ' ').trim()

  const supabase = await createClient()
  const montar = (contar: boolean) => {
    let q = supabase.from('disparos').select(COLUNAS, contar ? { count: 'exact' } : undefined)
    const g = GRUPOS[grupo]
    if (grupo === 'atencao') q = q.eq('atencao', true)
    else if (grupo === 'leads') q = q.not('preenchido_em', 'is', null)
    else if (g.status) q = q.in('status', [...g.status])
    if (campanha) q = q.eq('campanha_id', campanha)
    if (ramo) q = q.eq('ramo', ramo)
    if (grupoId) q = q.eq('grupo_id', grupoId)
    if (termo) {
      const dig = termo.replace(/\D/g, '')
      q =
        dig.length >= 6
          ? q.or(`cnpj.like.${dig}*,telefone.like.*${dig.slice(-9)}*`)
          : q.or(`razao_social.ilike.*${termo}*,nome_fantasia.ilike.*${termo}*,lead_nome.ilike.*${termo}*,lead_email.ilike.*${termo}*`)
    }
    return q
  }

  const linhas: string[] = [
    linha([
      'CNPJ', 'Razão social', 'Nome fantasia', 'Município', 'WhatsApp', 'Situação', 'Enviado em', 'Entregue em', 'Lido em',
      'Respondeu em', 'Última resposta', 'Quis a consulta em', 'Enviou os dados em', 'Nome completo', 'CNPJ informado', 'Lead - empresa',
      'Lead - e-mail', 'Lead - WhatsApp', 'Teste', 'Ramo', 'UF', 'Erro'
    ])
  ]
  let total: number | null = null
  let ultimo: number | null = null
  let n = 0
  while (n < LIMITE) {
    let q = montar(ultimo === null)
    if (ultimo !== null) q = q.lt('id', ultimo)
    const { data: lote, error, count } = await q.order('id', { ascending: false }).limit(Math.min(LOTE, LIMITE - n))
    if (error) {
      console.error('[disparos/exportar]', error.code, error.message)
      if (n === 0) return NextResponse.json({ erro: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.' }, { status: 503 })
      linhas.push(celula(`Arquivo incompleto: o banco parou de responder depois de ${n.toLocaleString('pt-BR')} linhas — baixe de novo.`))
      total = null
      break
    }
    if (ultimo === null) total = count ?? null
    const itens = (lote ?? []) as unknown as Disparo[]
    for (const d of itens) {
      linhas.push(
        linha([
          d.cnpj, d.razao_social, d.nome_fantasia, d.municipio, fmtFone(d.telefone), ROTULO_STATUS[d.status], data(d.enviado_em),
          data(d.entregue_em), data(d.lido_em), data(d.respondido_em), d.ultima_resposta, data(d.interessado_em), data(d.preenchido_em),
          d.lead_nome, d.lead_cnpj ? fmtCnpj(d.lead_cnpj) : '', d.lead_empresa, d.lead_email, d.lead_whatsapp ? fmtFone(d.lead_whatsapp) : '',
          d.teste ? 'sim' : '', d.ramo_nome, d.uf, d.erro
        ])
      )
    }
    n += itens.length
    if (itens.length < LOTE) break
    ultimo = itens[itens.length - 1].id
  }
  if (total !== null && total > n) linhas.push(avisoCorte(LIMITE, total))

  return respostaCsv(linhas, `disparos-${grupo}-${new Date().toISOString().slice(0, 10)}.csv`)
}
