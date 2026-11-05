/* eslint-disable @next/next/no-img-element -- SVGs estáticos da marca (public/site/marca) */
import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Clock3, LockKeyhole, SearchCheck } from 'lucide-react'
import { fmtFone, nomeEmpresa } from '@/lib/disparos/mensagens'
import type { Disparo } from '@/lib/disparos/tipos'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'
import { ROTAS } from '@/lib/rotas'
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

const DEGRADE = 'linear-gradient(175deg, #080e1b 0%, #182a53 45%, #0e1931 100%)'

const PASSOS = [
  { icone: SearchCheck, titulo: 'Análise dos últimos 5 anos', texto: 'Cruzamos os tributos pagos com o que a lei permite recuperar.' },
  { icone: Clock3, titulo: 'Retorno rápido', texto: 'Um especialista fala com você pelo WhatsApp ou e-mail.' },
  { icone: LockKeyhole, titulo: 'Sem custo e sem compromisso', texto: 'Você só decide depois de ver o resultado.' }
]

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

  return (
    <main className='min-h-dvh bg-creme'>
      {/* faixa da marca, como o cabeçalho do site */}
      <header className='relative isolate overflow-hidden text-white' style={{ background: DEGRADE }}>
        <div
          className='pointer-events-none absolute -top-40 left-1/4 -z-10 size-[560px] rounded-full opacity-[0.22] blur-3xl'
          style={{ background: 'radial-gradient(circle, #365db9 0%, #213870 50%, transparent 70%)' }}
        />
        <img
          src='/site/marca/simbolo-escuro.svg'
          alt=''
          className='pointer-events-none absolute -right-16 top-1/2 -z-10 size-72 -translate-y-1/2 opacity-[0.05]'
        />
        <div className='mx-auto max-w-5xl px-5 pb-14 pt-6 sm:px-8 sm:pb-16'>
          <Link href={ROTAS.inicio} aria-label='OficialCert — ir para o site'>
            <img src='/site/marca/horizontal-escuro.svg' alt='OficialCert' className='h-9 w-auto sm:h-10' />
          </Link>
          <div className='mt-10 flex items-center gap-3'>
            <span className='h-px w-8 bg-ouro/50' />
            <span className='text-[11px] font-bold uppercase tracking-[0.25em] text-ouro'>Consulta gratuita</span>
          </div>
          <h1 className='mt-4 max-w-2xl font-serif'>
            <span className='block text-[clamp(1.9rem,5vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em]'>
              Sua empresa pode ter dinheiro a receber.
            </span>
            <span className='mt-2 block text-[clamp(1.05rem,2.4vw,1.5rem)] font-light italic leading-snug text-areia'>
              Tributos pagos a mais, de volta com correção.
            </span>
          </h1>
        </div>
      </header>

      <div className='mx-auto -mt-8 grid max-w-5xl gap-6 px-5 pb-16 sm:px-8 lg:grid-cols-[1.35fr_1fr]'>
        <section className='rounded-3xl border border-oc-700/10 bg-[#faf8f3] p-6 shadow-xl shadow-oc-900/[0.07] sm:p-8'>
          {d ? (
            <>
              <div className='flex items-start gap-3 rounded-2xl border border-oc-700/10 bg-white px-4 py-3.5'>
                <BadgeCheck className='mt-0.5 size-5 shrink-0 text-ouro-escuro' />
                <div className='min-w-0'>
                  <p className='truncate text-[15px] font-semibold text-oc-700'>{d.razao_social}</p>
                  <p className='text-xs text-oc-700/60'>
                    CNPJ {fmtCnpj(d.cnpj)}
                    {d.municipio ? ` · ${d.municipio}` : ''}
                  </p>
                </div>
              </div>
              <h2 className='mt-6 font-serif text-2xl font-bold tracking-[-0.01em] text-oc-700'>Preencha para iniciar</h2>
              <p className='mt-1 text-sm text-oc-700/65'>Leva menos de 1 minuto. Um especialista retorna com o resultado.</p>
              <div className='mt-6'>
                <FormularioConsulta
                  token={token}
                  inicial={{
                    nome: d.lead_nome ?? '',
                    empresa: d.lead_empresa ?? nomeEmpresa(d),
                    email: d.lead_email ?? '',
                    whatsapp: fmtFone(d.lead_whatsapp ?? d.telefone)
                  }}
                  jaEnviado={!!d.preenchido_em}
                />
              </div>
            </>
          ) : (
            <div className='py-10 text-center'>
              <h2 className='font-serif text-2xl font-bold text-oc-700'>Link inválido</h2>
              <p className='mx-auto mt-2 max-w-sm text-sm text-oc-700/65'>
                Confira se o endereço chegou completo na mensagem. Se preferir, fale com a gente pelo site.
              </p>
              <Link
                href={ROTAS.inicio}
                className='mt-6 inline-flex h-11 items-center rounded-full bg-oc-700 px-6 text-sm font-bold text-creme transition hover:bg-oc-900'
              >
                Ir para o site da OficialCert
              </Link>
            </div>
          )}
        </section>

        <aside className='space-y-4 lg:pt-14'>
          {PASSOS.map(({ icone: Icone, titulo, texto }) => (
            <div key={titulo} className='flex items-start gap-4 rounded-2xl border border-oc-700/10 bg-white/70 p-4'>
              <span className='grid size-10 shrink-0 place-items-center rounded-full border border-ouro/40 bg-oc-700 text-ouro'>
                <Icone className='size-[18px]' strokeWidth={1.75} />
              </span>
              <span>
                <span className='block text-[15px] font-semibold text-oc-700'>{titulo}</span>
                <span className='mt-0.5 block text-[13px] leading-relaxed text-oc-700/65'>{texto}</span>
              </span>
            </div>
          ))}
          <p className='px-1 text-[11px] leading-relaxed text-oc-700/50'>
            OficialCert · Afiliada GWT Solution. Seus dados são usados apenas para a consulta, conforme a nossa{' '}
            <Link href='/politica-de-privacidade' className='underline underline-offset-2 hover:text-oc-700'>
              política de privacidade
            </Link>
            .
          </p>
        </aside>
      </div>
    </main>
  )
}
