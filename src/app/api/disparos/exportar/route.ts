import { NextResponse, type NextRequest } from 'next/server'
import { listarDisparos, SemAdminError } from '@/lib/disparos/dados'
import { ROTULO_STATUS, GRUPOS, type Grupo } from '@/lib/disparos/tipos'
import { fmtFone } from '@/lib/disparos/mensagens'

// CSV dos contatos da aba atual do painel (só administradores; o RLS garante o mesmo).
export const dynamic = 'force-dynamic'

const campo = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const grupo = (sp.get('grupo') && sp.get('grupo')! in GRUPOS ? sp.get('grupo') : 'todos') as Grupo
  try {
    const linhas: string[] = [
      [
        'CNPJ', 'Razão social', 'Nome fantasia', 'Município', 'WhatsApp', 'Situação', 'Enviado em', 'Entregue em', 'Lido em',
        'Respondeu em', 'Última resposta', 'Quis a consulta em', 'Preencheu em', 'Lead - nome', 'Lead - empresa', 'Lead - e-mail',
        'Lead - WhatsApp', 'Erro'
      ].join(';')
    ]
    for (let pagina = 1; pagina <= 40; pagina++) {
      const { itens } = await listarDisparos({ grupo, campanha: Number(sp.get('campanha')) || undefined, q: sp.get('q') ?? undefined, pagina, por: 500 })
      for (const d of itens) {
        linhas.push(
          [
            d.cnpj, d.razao_social, d.nome_fantasia, d.municipio, fmtFone(d.telefone), ROTULO_STATUS[d.status], data(d.enviado_em),
            data(d.entregue_em), data(d.lido_em), data(d.respondido_em), d.ultima_resposta, data(d.interessado_em), data(d.preenchido_em),
            d.lead_nome, d.lead_empresa, d.lead_email, d.lead_whatsapp ? fmtFone(d.lead_whatsapp) : '', d.erro
          ].map(campo).join(';')
        )
      }
      if (itens.length < 500) break
    }
    const nome = `disparos-${grupo}-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse('﻿' + linhas.join('\r\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"` }
    })
  } catch (e) {
    if (e instanceof SemAdminError) return NextResponse.json({ erro: e.message }, { status: 403 })
    throw e
  }
}
