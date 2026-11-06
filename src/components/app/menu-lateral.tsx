'use client'
/* eslint-disable @next/next/no-img-element -- SVGs estáticos da marca (public/site/marca) */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { Building2, CalendarDays, LogOut, MessagesSquare, Search, Send, UsersRound } from 'lucide-react'
import { sair } from '@/app/login/actions'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

type Item = { href: string; rotulo: string; icone: LucideIcon; ativo: (p: string) => boolean }

const ITENS: Item[] = [
  { href: ROTAS.dashboard, rotulo: 'Consultar empresas', icone: Search, ativo: (p: string) => p === ROTAS.dashboard || p.startsWith(`${ROTAS.dashboard}/empresa`) },
  { href: ROTAS.contadores, rotulo: 'Contadores e grupos', icone: Building2, ativo: (p: string) => p.startsWith(ROTAS.contadores) },
  { href: ROTAS.agente, rotulo: 'Agente de IA', icone: MessagesSquare, ativo: (p: string) => p.startsWith(ROTAS.agente) }
]

type Papel = 'admin' | 'equipe' | 'consulta' | 'cliente' | null

// Seção "Administrativo": cada item diz quem o vê
const ITENS_ADMIN: (Item & { papeis: Papel[] })[] = [
  { href: ROTAS.disparos, rotulo: 'Disparos', icone: Send, ativo: (p: string) => p.startsWith(ROTAS.disparos), papeis: ['admin', 'equipe'] },
  { href: ROTAS.calendario, rotulo: 'Calendário', icone: CalendarDays, ativo: (p: string) => p.startsWith(ROTAS.calendario), papeis: ['admin', 'equipe', 'consulta'] },
  { href: ROTAS.usuarios, rotulo: 'Usuários', icone: UsersRound, ativo: (p: string) => p.startsWith(ROTAS.usuarios), papeis: ['admin'] }
]

// O cliente só tem as áreas dos produtos que contratou
const CLIENTE_CONSULTA: Item = { href: ROTAS.minhasEmpresas, rotulo: 'Minhas empresas', icone: Search, ativo: (p: string) => p.startsWith(ROTAS.minhasEmpresas) }
const CLIENTE_DISPAROS: Item = { href: ROTAS.disparos, rotulo: 'Meus disparos', icone: Send, ativo: (p: string) => p.startsWith(ROTAS.disparos) }

function ItemMenu({ item, pathname }: { item: Item; pathname: string }) {
  const ativo = item.ativo(pathname)
  const Icone = item.icone
  return (
    <Link
      href={item.href}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition',
        ativo ? 'bg-white/[0.08] font-semibold text-white' : 'text-areia/75 hover:bg-white/[0.04] hover:text-white'
      )}
    >
      {ativo && <span className='absolute inset-y-2 left-0 w-[3px] rounded-full bg-ouro' />}
      <Icone className={cn('size-4', ativo ? 'text-ouro' : 'text-areia/60')} />
      <span className='flex-1 whitespace-nowrap'>{item.rotulo}</span>
    </Link>
  )
}

export function MenuLateral({
  email,
  papel,
  produtos
}: {
  email: string
  papel: Papel
  produtos?: { consulta: boolean; disparos: boolean } | null
}) {
  const cliente = papel === 'cliente'
  const ITENS_CLIENTE = [
    ...(produtos?.consulta || !produtos?.disparos ? [CLIENTE_CONSULTA] : []),
    ...(produtos?.disparos ? [CLIENTE_DISPAROS] : [])
  ]
  const administrativos = ITENS_ADMIN.filter(i => i.papeis.includes(papel))
  const pathname = usePathname()

  return (
    <aside className='fundo-marinho sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-hidden text-areia'>
      {/* brilho e marca d'água do selo, como no destaque do site */}
      <div
        className='pointer-events-none absolute -left-24 -top-24 size-80 rounded-full opacity-25 blur-3xl'
        style={{ background: 'radial-gradient(circle, #365db9 0%, #213870 50%, transparent 70%)' }}
      />
      <img
        src='/site/marca/simbolo-escuro.svg'
        alt=''
        className='pointer-events-none absolute -bottom-16 -right-20 size-64 opacity-[0.05]'
      />

      <Link href={ROTAS.dashboard} className='relative block px-6 pb-6 pt-7'>
        <img src='/site/marca/horizontal-escuro.svg' alt='OficialCert' className='h-9 w-auto' />
        <span className='mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-ouro'>
          <span className='h-px w-5 bg-ouro/50' /> Plataforma
        </span>
      </Link>

      <nav className='relative flex-1 space-y-1 px-3 py-2'>
        {(cliente ? ITENS_CLIENTE : ITENS).map(item => (
          <ItemMenu key={item.href} item={item} pathname={pathname} />
        ))}
        {!cliente && administrativos.length > 0 && (
          <>
            <span className='flex items-center gap-2 px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-ouro'>
              <span className='h-px w-5 bg-ouro/50' /> Administrativo
            </span>
            {administrativos.map(item => (
              <ItemMenu key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}
      </nav>

      <div className='relative border-t border-white/10 px-6 py-5'>
        <p className='text-[10px] font-bold uppercase tracking-[0.18em] text-ouro/80'>Conectado</p>
        <p className='mt-1 truncate text-xs text-areia/80' title={email}>
          {email}
        </p>
        <form action={sair}>
          <button
            type='submit'
            className='mt-3 flex items-center gap-2 text-xs font-semibold text-areia/70 transition hover:text-white'
          >
            <LogOut className='size-3.5' /> Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
