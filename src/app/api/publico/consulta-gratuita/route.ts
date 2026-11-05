import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { linkFormulario } from '@/lib/disparos/config'
import { montar, nomeEmpresa, normalizarFone, primeiroNome, saudacao } from '@/lib/disparos/mensagens'
import { carregarCampanha, carregarNumero, registrarEvento, responder } from '@/lib/disparos/motor'
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
  const { data } = await db.from('disparos').select('*').eq('token', p.data.token).maybeSingle()
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
  const primeira = !d.preenchido_em
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const { error } = await db
    .from('disparos')
    .update({
      status: 'preencheu',
      lead_nome: nome,
      lead_empresa: empresa,
      lead_email: email,
      lead_whatsapp: normalizarFone(whatsapp),
      lead_ip: ip,
      preenchido_em: d.preenchido_em ?? agora,
      link_aberto_em: d.link_aberto_em ?? agora,
      interessado_em: d.interessado_em ?? agora,
      respondido_em: d.respondido_em ?? agora,
      encerrado_em: null,
      atualizado_em: agora
    })
    .eq('id', d.id)
  if (error) {
    console.error('[consulta-gratuita]', error.message)
    return NextResponse.json({ erro: 'Não foi possível registrar agora. Tente de novo.' }, { status: 500 })
  }
  await registrarEvento({
    disparo_id: d.id,
    tipo: 'formulario',
    direcao: 'entrada',
    texto: `${nome} · ${empresa} · ${email} · ${whatsapp}`,
    dados: { nome, empresa, email, whatsapp, ip, primeira }
  })

  // Confirmação pelo WhatsApp, só no primeiro envio (correções não geram mensagem nova).
  if (primeira && d.numero_id && d.chat_id) {
    after(async () => {
      try {
        const [n, c] = await Promise.all([carregarNumero(d.numero_id!), carregarCampanha(d.campanha_id)])
        if (!n) return
        const texto = montar(c.mensagem_obrigado, {
          primeiro_nome: primeiroNome(nome),
          nome,
          empresa: nomeEmpresa(d),
          saudacao: saudacao(),
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
