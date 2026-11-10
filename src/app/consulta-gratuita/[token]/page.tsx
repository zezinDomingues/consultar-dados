import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BadgeCheck } from 'lucide-react'
import { fmtFone, nomeEmpresa } from '@/lib/disparos/mensagens'
import type { Disparo } from '@/lib/disparos/tipos'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'
import { CascaConsulta } from './casca'
import { FormularioConsulta } from './formulario'

// Página que o contato abre pelo link do WhatsApp. Pública, fora do índice dos buscadores. O token do link é
// a credencial: sem ele, nada da empresa aparece.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  // a prévia do link no WhatsApp precisa da imagem com endereço absoluto
  metadataBase: new URL(process.env.APP_URL?.trim() || 'https://www.oficialcert.com'),
  title: 'Consulta gratuita',
  description: 'Descubra se a sua empresa pagou tributos a mais e tem valores a recuperar. Sem custo e sem compromisso.',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Consulta gratuita de créditos tributários · OficialCert',
    description: 'Descubra se a sua empresa pagou tributos a mais e tem valores a recuperar. Sem custo e sem compromisso.',
    images: [{ url: '/site/marca/og-consulta.jpg', width: 1200, height: 630 }],
    siteName: 'OficialCert',
    type: 'website',
    locale: 'pt_BR'
  }
}

async function carregar(token: string) {
  if (!/^[A-Za-z0-9]{10}$/.test(token) || !temChaveSecreta()) return null
  const { data } = await supabaseAdmin()
    .from('disparos')
    .select('cnpj, telefone, razao_social, nome_fantasia, municipio, status, preenchido_em, lead_nome, lead_empresa, lead_email, lead_whatsapp')
    .eq('token', token)
    .maybeSingle()
  return data as Pick<
    Disparo,
    'cnpj' | 'telefone' | 'razao_social' | 'nome_fantasia' | 'municipio' | 'status' | 'preenchido_em' | 'lead_nome' | 'lead_empresa' | 'lead_email' | 'lead_whatsapp'
  > | null
}

const fmtCnpj = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`

export default async function ConsultaGratuitaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const d = await carregar(token)
  // link inválido = 404 de verdade (a tela bonita fica no not-found.tsx desta rota)
  if (!d) notFound()
  const fone = d.lead_whatsapp ?? d.telefone

  return (
    <CascaConsulta>
      <div className='flex items-start gap-3 rounded-2xl border border-oc-700/10 bg-white px-4 py-3.5'>
        <BadgeCheck className='mt-0.5 size-5 shrink-0 text-ouro-escuro' aria-hidden />
        <div className='min-w-0'>
          <p className='break-words text-[15px] font-semibold text-oc-700'>{d.razao_social}</p>
          <p className='text-xs text-oc-700/75'>
            CNPJ {fmtCnpj(d.cnpj)}
            {d.municipio ? ` · ${d.municipio}` : ''}
          </p>
        </div>
      </div>
      <h2 className='mt-6 font-serif text-2xl font-bold tracking-[-0.01em] text-oc-700'>Preencha para iniciar</h2>
      <p className='mt-1 text-sm text-oc-700/80'>Leva menos de 1 minuto. Um especialista retorna com o resultado.</p>
      <div className='mt-6'>
        <FormularioConsulta
          token={token}
          inicial={{
            nome: d.lead_nome ?? '',
            empresa: d.lead_empresa ?? nomeEmpresa(d),
            email: d.lead_email ?? '',
            whatsapp: fone ? fmtFone(fone) : ''
          }}
          jaEnviado={!!d.preenchido_em}
        />
      </div>
    </CascaConsulta>
  )
}
