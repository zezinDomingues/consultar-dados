/* eslint-disable @next/next/no-img-element -- SVGs estáticos da marca (public/site/marca) */
import Link from 'next/link'
import { Clock3, LockKeyhole, SearchCheck } from 'lucide-react'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

const DEGRADE = 'linear-gradient(175deg, #080e1b 0%, #182a53 45%, #0e1931 100%)'

const PASSOS = [
  { icone: SearchCheck, titulo: 'Análise dos últimos 5 anos', texto: 'Cruzamos os tributos pagos com o que a lei permite recuperar.' },
  { icone: Clock3, titulo: 'Retorno rápido', texto: 'Um especialista fala com você pelo WhatsApp ou e-mail.' },
  { icone: LockKeyhole, titulo: 'Sem custo e sem compromisso', texto: 'Você só decide depois de ver o resultado.' }
]

/**
 * Moldura da consulta gratuita (faixa da marca + cartão + os 3 passos), usada pela página e pelo not-found.
 * `largo`: link inválido — cartão na largura toda e os passos numa fileira embaixo (sem coluna vazia ao lado).
 */
export function CascaConsulta({ children, largo = false }: { children: React.ReactNode; largo?: boolean }) {
  return (
    <main className='min-h-dvh bg-creme'>
      {/* faixa da marca, como o cabeçalho do site */}
      <header className='tema-escuro relative isolate overflow-hidden text-white' style={{ background: DEGRADE }}>
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

      <div className={cn('relative mx-auto -mt-8 grid max-w-5xl gap-6 px-5 pb-16 sm:px-8', !largo && 'lg:grid-cols-[1.35fr_1fr] lg:items-start')}>
        <section className='min-w-0 rounded-3xl border border-oc-700/10 bg-[#faf8f3] p-6 shadow-xl shadow-oc-900/[0.07] sm:p-8'>
          {children}
        </section>

        <aside className={largo ? 'grid gap-4 sm:grid-cols-3' : 'space-y-4 lg:pt-14'}>
          {PASSOS.map(({ icone: Icone, titulo, texto }) => (
            <div key={titulo} className='flex items-start gap-4 rounded-2xl border border-oc-700/10 bg-white p-4'>
              <span className='grid size-10 shrink-0 place-items-center rounded-full border border-ouro/40 bg-oc-700 text-ouro'>
                <Icone className='size-[18px]' strokeWidth={1.75} aria-hidden />
              </span>
              <span>
                <span className='block text-[15px] font-semibold text-oc-700'>{titulo}</span>
                <span className='mt-0.5 block text-[13px] leading-relaxed text-oc-700/80'>{texto}</span>
              </span>
            </div>
          ))}
          <p className={cn('px-1 text-[11px] leading-relaxed text-oc-700/75', largo && 'sm:col-span-3')}>
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
