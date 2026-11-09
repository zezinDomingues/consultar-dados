import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { linkFormulario } from '@/lib/disparos/config'
import { fmtCnpj, fmtFone, montar, nomeEmpresa, normalizarFone, primeiroNome, saudacao } from '@/lib/disparos/mensagens'
import { carregarCampanha, carregarNumeroDoGrupo, registrarEvento, responder } from '@/lib/disparos/motor'
import type { Disparo } from '@/lib/disparos/tipos'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

// Formulário da consulta gratuita (link enviado pelo WhatsApp). Público: o token de 10 caracteres do link é a
// credencial — ele só existe para quem recebeu a mensagem.
export const dynamic = 'force-dynamic'

const Token = z.string().regex(/^[A-Za-z0-9]{10}$/)

const Pedido = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('abrir'), token: Token }),
  z.object({
    acao: z.literal('enviar'),
    token: Token,
    nome: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
    empresa: z.string().trim().min(2, 'Informe a empresa.').max(160),
    email: z.string().trim().toLowerCase().email('E-mail inválido.').max(160),
    whatsapp: z
      .string()
      .trim()
      .max(30)
      .refine(v => !!normalizarFone(v), 'WhatsApp inválido (DDD + número).'),
    consentimento: z.literal(true, { error: 'É preciso autorizar o contato.' })
  })
])

export async function POST(request: NextRequest) {
  if (!temChaveSecreta()) return NextResponse.json({ erro: 'Formulário indisponível no momento.' }, { status: 503 })
  const p = Pedido.safeParse(await request.json().catch(() => null))
  if (!p.success) {
    return NextResponse.json({ erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
  }
  const db = supabaseAdmin()
  const { data, error: eLer } = await db.from('disparos').select('*').eq('token', p.data.token).maybeSingle()
  if (eLer) {
    console.error('[consulta-gratuita] ler', eLer.message)
    return NextResponse.json({ erro: 'Formulário indisponível no momento. Tente de novo.' }, { status: 503 })
  }
  const d = data as Disparo | null
  if (!d) return NextResponse.json({ erro: 'Link inválido.' }, { status: 404 })
  const agora = new Date().toISOString()

  if (p.data.acao === 'abrir') {
    // Marcado pelo navegador (JavaScript), não pela renderização: robôs de pré-visualização não contam.
    if (!d.link_aberto_em) {
      await db.from('disparos').update({ link_aberto_em: agora, atualizado_em: agora }).eq('id', d.id).is('link_aberto_em', null)
      await registrarEvento({ disparo_id: d.id, tipo: 'link', texto: 'abriu o formulário' })
    }
    return NextResponse.json({ ok: true })
  }

  const { count } = await db
    .from('disparo_eventos')
    .select('id', { count: 'exact', head: true })
    .eq('disparo_id', d.id)
    .eq('tipo', 'formulario')
  if ((count ?? 0) >= 10) return NextResponse.json({ erro: 'Recebemos seus dados. Aguarde nosso contato.' }, { status: 429 })

  const { nome, empresa, email, whatsapp } = p.data
  const contato = normalizarFone(whatsapp)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

  // Quem pediu SAIR (ou está bloqueado no grupo) continua fora do robô: os dados ficam guardados para alguém da
  // equipe decidir, mas nada sai pelo WhatsApp e o status não muda.
  const { count: bloqueado, error: eBloq } = await db
    .from('disparo_bloqueios')
    .select('id', { count: 'exact', head: true })
    .eq('telefone', d.telefone)
    .or(`grupo_id.is.null,grupo_id.eq.${d.grupo_id}`)
  if (eBloq) {
    console.error('[consulta-gratuita] bloqueios', eBloq.message)
    return NextResponse.json({ erro: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 })
  }
  const saiu = d.status === 'descadastrado' || !!bloqueado

  const campos = {
    lead_nome: nome,
    lead_empresa: empresa,
    lead_email: email,
    lead_whatsapp: contato,
    lead_ip: ip,
    atualizado_em: agora,
    ...(saiu
      ? { atencao: true }
      : {
          status: 'preencheu' as const,
          link_aberto_em: d.link_aberto_em ?? agora,
          interessado_em: d.interessado_em ?? agora,
          respondido_em: d.respondido_em ?? agora,
          encerrado_em: null
        })
  }
  // 1º envio = quem conseguiu gravar o preenchido_em (UPDATE condicional): dois envios ao mesmo tempo não geram
  // duas confirmações. Correções depois só atualizam os dados.
  const { data: marcou, error } = await db.from('disparos').update({ ...campos, preenchido_em: agora }).eq('id', d.id).is('preenchido_em', null).select('id')
  if (error) {
    console.error('[consulta-gratuita]', error.message)
    return NextResponse.json({ erro: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 })
  }
  const primeira = !!marcou?.length
  if (!primeira) {
    const { error: e2 } = await db.from('disparos').update(campos).eq('id', d.id)
    if (e2) {
      console.error('[consulta-gratuita]', e2.message)
      return NextResponse.json({ erro: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 })
    }
  }
  await registrarEvento({
    disparo_id: d.id,
    tipo: 'formulario',
    direcao: 'entrada',
    texto: `${nome} · ${empresa} · ${email} · ${whatsapp}${saiu ? ' (pediu para sair: sem confirmação pelo WhatsApp)' : ''}`,
    dados: { nome, empresa, email, whatsapp, ip, primeira, saiu }
  })

  // Confirmação pelo WhatsApp, só no primeiro envio (correções não geram mensagem nova) e nunca para quem saiu.
  if (primeira && !saiu && d.numero_id && d.chat_id) {
    after(async () => {
      try {
        const [n, c] = await Promise.all([carregarNumeroDoGrupo(d.numero_id!, d.grupo_id), carregarCampanha(d.campanha_id)])
        if (!n) return
        const texto = montar(c.mensagem_obrigado, {
          primeiro_nome: primeiroNome(nome),
          nome,
          empresa: nomeEmpresa(d),
          saudacao: saudacao(),
          telefone: fmtFone(contato ?? d.telefone),
          cnpj: fmtCnpj(d.lead_cnpj ?? d.cnpj),
          link: linkFormulario(d.token)
        })
        await responder(d, n, texto)
      } catch (e) {
        console.error('[consulta-gratuita] confirmação no WhatsApp', e)
      }
    })
  }
  return NextResponse.json({ ok: true, primeira })
}
