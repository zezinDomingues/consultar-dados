/* eslint-disable @next/next/no-img-element -- SVGs estáticos da marca (public/site/marca) */
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Bot, Gauge, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { ROTAS } from '@/lib/rotas'
import { FormLogin } from './form-login'

export const metadata: Metadata = { title: 'Entrar' }

// Mesma linguagem do site institucional: degradê marinho do destaque, selo 3D, Playfair nos títulos,
// dourado nos rótulos e o creme das seções claras no formulário.
const DEGRADE = 'linear-gradient(175deg, #080e1b 0%, #182a53 45%, #0e1931 100%)'

const RECURSOS = [
  { icone: SlidersHorizontal, titulo: 'Consulta inteligente', texto: 'Filtre por setor, ramo, porte, regime tributário e região.' },
  { icone: Gauge, titulo: 'Prioridade de prospecção', texto: 'Cada empresa chega com um score de oportunidade.' },
  { icone: Bot, titulo: 'Agente de IA', texto: 'Pergunte em linguagem natural e receba a lista pronta.' }
]

function Selo3D({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} style={{ perspective: '1200px' }} aria-hidden>
      <div className='selo-3d relative aspect-square w-full'>
        <img
          src='/site/marca/selo-3d-base.svg'
          alt=''
          className='absolute inset-0 size-full object-contain'
          style={{ filter: 'drop-shadow(0 40px 50px rgba(0,0,0,.5))' }}
        />
        <img src='/site/marca/selo-3d-topo.svg' alt='' className='selo-3d-topo absolute inset-0 size-full object-contain' />
      </div>
    </div>
  )
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams

  return (
    <main className='grid min-h-dvh bg-creme lg:grid-cols-[1.08fr_1fr]'>
      {/* ---------- painel da marca (no celular vira uma faixa compacta no topo) ---------- */}
      <section className='relative isolate overflow-hidden text-white' style={{ background: DEGRADE }}>
        {/* brilhos do destaque do site */}
        <div
          className='pointer-events-none absolute -top-[20%] left-[15%] -z-10 size-[700px] rounded-full opacity-[0.22] blur-3xl'
          style={{ background: 'radial-gradient(circle, #365db9 0%, #213870 50%, transparent 70%)' }}
        />
        <div
          className='pointer-events-none absolute -left-[10%] bottom-[5%] -z-10 size-[480px] rounded-full opacity-[0.09] blur-2xl'
          style={{ background: 'radial-gradient(circle, #c4b99a 0%, transparent 70%)' }}
        />
        {/* marca d'água do selo, como no site */}
        <img
          src='/site/marca/simbolo-escuro.svg'
          alt=''
          className='pointer-events-none absolute -left-[12%] top-1/2 -z-10 hidden size-[420px] -translate-y-1/2 opacity-[0.04] lg:block'
        />

        <div className='login-coluna flex h-full flex-col gap-8 px-6 py-6 sm:px-10 lg:min-h-dvh lg:justify-between lg:gap-6 lg:px-14 lg:py-10 xl:px-20'>
          <div className='flex items-start justify-between gap-6'>
            <Link href={ROTAS.inicio} className='w-fit' aria-label='OficialCert — voltar ao site'>
              <img src='/site/marca/vertical-escuro.svg' alt='OficialCert' className='h-14 w-auto lg:h-[4.5rem]' />
            </Link>
            {/* notebooks: o selo flutua no canto, longe do texto */}
            <Selo3D className='selo-canto -mt-2 w-32 xl:w-40' />
          </div>

          <div className='relative'>
            {/* telas largas: selo grande ao lado do texto, como no destaque do site */}
            <Selo3D className='selo-grande absolute right-0 top-1/2 w-[250px] -translate-y-[58%] min-[2200px]:w-[300px]' />
            <div className='flex items-center gap-3'>
              <span className='h-px w-8 bg-ouro/50' />
              <span className='text-[11px] font-bold uppercase tracking-[0.25em] text-ouro'>Área restrita</span>
            </div>
            <h1 className='mt-5 max-w-xl font-serif'>
              <span className='block text-[clamp(2.1rem,4.6vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.02em]'>
                Os clientes certos.
              </span>
              <span className='mt-2 block text-[clamp(1.2rem,2.35vw,2.1rem)] font-light italic leading-[1.15] text-areia'>
                Encontrados. Qualificados. Prontos.
              </span>
            </h1>
            <p className='mt-5 max-w-md text-[15px] font-light leading-relaxed text-areia lg:text-base'>
              A plataforma da <strong className='font-semibold text-white'>OficialCert</strong> para levar inteligência
              tributária às empresas que mais precisam dela.
            </p>

            <ul className='mt-7 hidden max-w-md space-y-4 border-t border-white/10 pt-6 sm:block'>
              {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
                <li key={titulo} className='flex items-start gap-4'>
                  <span className='grid size-10 shrink-0 place-items-center rounded-full border border-ouro/30 bg-white/[0.03] text-ouro'>
                    <Icone className='size-[18px]' strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className='block text-[15px] font-semibold text-white'>{titulo}</span>
                    <span className='mt-0.5 block text-[13px] font-light leading-relaxed text-areia/80'>{texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className='hidden text-[11px] text-areia/55 lg:block'>© 2026 OficialCert · Afiliada GWT Solution</p>
        </div>
      </section>

      {/* ---------- formulário ---------- */}
      <section className='relative flex flex-col px-6 py-8 sm:px-10 lg:py-10'>
        <Link
          href={ROTAS.inicio}
          className='inline-flex w-fit items-center gap-2 text-[13px] font-semibold text-oc-700/70 transition-colors hover:text-oc-700'
        >
          <ArrowLeft className='size-4' /> Voltar ao site
        </Link>

        <div className='flex flex-1 items-center justify-center py-10'>
          <div className='w-full max-w-[400px]'>
            <div className='flex items-center gap-3'>
              <span className='h-px w-8 bg-oc-700/25' />
              <span className='text-[11px] font-bold uppercase tracking-[0.2em] text-oc-700/70'>Plataforma OficialCert</span>
            </div>
            <h2 className='mt-4 font-serif text-[2.6rem] font-bold leading-[1.05] tracking-[-0.02em] text-oc-700'>
              Entrar
              <span className='block text-[1.65rem] font-normal italic text-oc-600/60'>Bem-vindo de volta.</span>
            </h2>
            <p className='mt-4 text-sm font-medium text-oc-700/75'>Use o acesso fornecido pelo administrador.</p>

            <div className='mt-8'>
              <FormLogin next={next} />
            </div>

            <p className='mt-6 flex items-center gap-2 text-[11px] font-medium text-oc-700/55'>
              <ShieldCheck className='size-3.5 shrink-0' /> Acesso protegido e sigiloso, conforme a LGPD.
            </p>
          </div>
        </div>

        <p className='text-center text-[11px] text-oc-700/45 lg:hidden'>© 2026 OficialCert · Afiliada GWT Solution</p>
      </section>
    </main>
  )
}
