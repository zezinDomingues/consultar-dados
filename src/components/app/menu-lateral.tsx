'use client'
/* eslint-disable @next/next/no-img-element -- SVGs estáticos da marca (public/site/marca) */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { Building2, CalendarDays, LogOut, Menu, MessagesSquare, Search, Send, UsersRound, X } from 'lucide-react'
import { sair } from '@/app/login/actions'
import { FOCO_ESCURO } from '@/components/ui/foco'
import { useGaveta, useMidia } from '@/components/ui/gaveta'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

type Item = { href: string; rotulo: string; icone: LucideIcon; ativo: (p: string) => boolean }

const ITENS: Item[] = [
  { href: ROTAS.dashboard, rotulo: 'Consultar empresas', icone: Search, ativo: (p: string) => p === ROTAS.dashboard || p.startsWith(`${ROTAS.dashboard}/empresa`) },
  { href: ROTAS.contadores, rotulo: 'Contadores e grupos', icone: Building2, ativo: (p: string) => p.startsWith(ROTAS.contadores) },
  { href: ROTAS.agente, rotulo: 'Agente de IA', icone: MessagesSquare, ativo: (p: string) => p.startsWith(ROTAS.agente) }
]

type Papel = 'admin' | 'equipe' | 'consulta' | 'cliente' | null

// Seção "Administrativo" (só equipe interna; o cliente nunca vê este rótulo): cada item diz quem o vê
const ITENS_ADMIN: (Item & { papeis: Papel[] })[] = [
  { href: ROTAS.disparos, rotulo: 'Disparos', icone: Send, ativo: (p: string) => p.startsWith(ROTAS.disparos), papeis: ['admin', 'equipe'] },
  { href: ROTAS.calendario, rotulo: 'Calendário', icone: CalendarDays, ativo: (p: string) => p.startsWith(ROTAS.calendario), papeis: ['admin', 'equipe', 'consulta'] },
  { href: ROTAS.usuarios, rotulo: 'Usuários', icone: UsersRound, ativo: (p: string) => p.startsWith(ROTAS.usuarios), papeis: ['admin'] }
]

// O cliente só tem as áreas dos produtos que contratou
const CLIENTE_CONSULTA: Item = { href: ROTAS.minhasEmpresas, rotulo: 'Minhas empresas', icone: Search, ativo: (p: string) => p.startsWith(ROTAS.minhasEmpresas) }
const CLIENTE_CALENDARIO: Item = { href: ROTAS.calendario, rotulo: 'Calendário', icone: CalendarDays, ativo: (p: string) => p.startsWith(ROTAS.calendario) }
const CLIENTE_DISPAROS: Item = { href: ROTAS.disparos, rotulo: 'Meus disparos', icone: Send, ativo: (p: string) => p.startsWith(ROTAS.disparos) }

function ItemMenu({ item, pathname, aoClicar }: { item: Item; pathname: string; aoClicar: () => void }) {
  const ativo = item.ativo(pathname)
  const Icone = item.icone
  return (
    <Link
      href={item.href}
      onClick={aoClicar}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition',
        ativo ? 'bg-white/[0.08] font-semibold text-white' : 'text-areia/80 hover:bg-white/[0.04] hover:text-white',
        FOCO_ESCURO
      )}
    >
      {ativo && <span className='absolute inset-y-2 left-0 w-[3px] rounded-full bg-ouro' />}
      <Icone className={cn('size-4', ativo ? 'text-ouro' : 'text-areia/70')} aria-hidden />
      <span className='flex-1 whitespace-nowrap'>{item.rotulo}</span>
    </Link>
  )
}

/**
 * Menu do painel. A partir de lg (1024 px) é a coluna fixa de sempre; abaixo disso vira gaveta:
 * barra superior com a marca e o botão de menu, véu escuro, fecha com Esc, toque fora ou ao navegar.
 */
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
    ...(produtos?.disparos ? [CLIENTE_DISPAROS, CLIENTE_CALENDARIO] : [])
  ]
  const administrativos = cliente ? [] : ITENS_ADMIN.filter(i => i.papeis.includes(papel))
  const pathname = usePathname()

  const [aberto, setAberto] = useState(false)
  const desktop = useMidia('(min-width: 1024px)')
  const fechar = useCallback(() => setAberto(false), [])
  const botao = useRef<HTMLButtonElement>(null)
  const gaveta = aberto && !desktop
  const painel = useGaveta<HTMLElement>(gaveta, fechar, botao)
  // navegou (inclusive pelo voltar do navegador) ou a tela passou a caber o menu fixo: fecha
  useEffect(() => setAberto(false), [pathname, desktop])

  return (
    <>
      <a
        href='#conteudo'
        className='sr-only z-[70] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-marca-800 shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3'
      >
        Pular para o conteúdo
      </a>

      {/* celular e tablet: barra superior com a marca e o botão do menu */}
      <header className='fundo-marinho sticky top-0 z-30 flex h-14 items-center gap-2 px-2 text-areia shadow-md shadow-oc-950/20 lg:hidden'>
        <button
          ref={botao}
          type='button'
          onClick={() => setAberto(true)}
          aria-label='Abrir menu'
          aria-expanded={gaveta}
          aria-controls='menu-principal'
          className={cn('grid size-10 place-items-center rounded-lg transition hover:bg-white/[0.06]', FOCO_ESCURO)}
        >
          <Menu className='size-5' aria-hidden />
        </button>
        <Link href={ROTAS.dashboard} className={cn('rounded-md p-1', FOCO_ESCURO)}>
          <img src='/site/marca/horizontal-escuro.svg' alt='OficialCert' className='h-7 w-auto' />
        </Link>
      </header>

      {gaveta && <div aria-hidden className='fixed inset-0 z-40 bg-oc-950/60 lg:hidden' onClick={fechar} />}

      <aside
        id='menu-principal'
        ref={painel}
        aria-label='Menu principal'
        {...(gaveta ? { role: 'dialog', 'aria-modal': true } : {})}
        className={cn(
          'fundo-marinho fixed inset-y-0 left-0 z-50 flex h-dvh w-[17rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden text-areia shadow-2xl shadow-oc-950/40',
          'duration-200 ease-out motion-reduce:transition-none',
          aberto ? 'visible translate-x-0 transition-[translate,transform]' : 'invisible -translate-x-full transition-[translate,transform,visibility]',
          'lg:visible lg:sticky lg:top-0 lg:z-auto lg:w-60 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none lg:transition-none'
        )}
      >
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

        <div className='relative flex items-start justify-between'>
          <Link href={ROTAS.dashboard} onClick={fechar} className={cn('block rounded-lg px-6 pb-6 pt-7', FOCO_ESCURO)}>
            <img src='/site/marca/horizontal-escuro.svg' alt='OficialCert' className='h-9 w-auto' />
            <span className='mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-ouro'>
              <span className='h-px w-5 bg-ouro/50' /> Plataforma
            </span>
          </Link>
          <button
            type='button'
            onClick={fechar}
            aria-label='Fechar menu'
            data-foco-inicial
            className={cn(
              'mr-2 mt-3 grid size-10 place-items-center rounded-lg text-areia/80 transition hover:bg-white/[0.06] hover:text-white lg:hidden',
              FOCO_ESCURO
            )}
          >
            <X className='size-5' aria-hidden />
          </button>
        </div>

        <nav className='relative min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2' aria-label='Áreas da plataforma'>
          {(cliente ? ITENS_CLIENTE : ITENS).map(item => (
            <ItemMenu key={item.href} item={item} pathname={pathname} aoClicar={fechar} />
          ))}
          {administrativos.length > 0 && (
            <>
              <span className='flex items-center gap-2 px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-ouro'>
                <span className='h-px w-5 bg-ouro/50' /> Administrativo
              </span>
              {administrativos.map(item => (
                <ItemMenu key={item.href} item={item} pathname={pathname} aoClicar={fechar} />
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
              className={cn(
                'mt-3 flex items-center gap-2 rounded-md text-xs font-semibold text-areia/80 transition hover:text-white',
                FOCO_ESCURO
              )}
            >
              <LogOut className='size-3.5' aria-hidden /> Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
