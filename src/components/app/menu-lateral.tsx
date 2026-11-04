'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Database, LogOut, Search, Sparkles } from 'lucide-react'
import { sair } from '@/app/login/actions'
import { cn } from '@/lib/utils'

const ITENS = [
  { href: '/', rotulo: 'Consultar empresas', icone: Search, ativo: (p: string) => p === '/' || p.startsWith('/empresa') },
  { href: '/contadores', rotulo: 'Contadores e grupos', icone: Building2, ativo: (p: string) => p.startsWith('/contadores') },
  { href: '/agente', rotulo: 'Agente de IA', icone: Sparkles, ativo: (p: string) => p.startsWith('/agente'), selo: 'novo' }
]

export function MenuLateral({ email }: { email: string }) {
  const pathname = usePathname()

  return (
    <aside className='sticky top-0 flex h-screen w-56 shrink-0 flex-col bg-marca-950 text-marca-100'>
      <div className='flex items-center gap-2.5 px-5 py-5'>
        <div className='grid size-9 place-items-center rounded-lg bg-white/10 text-white'>
          <Database className='size-4.5' />
        </div>
        <div className='leading-tight'>
          <p className='text-sm font-semibold text-white'>Consultar Dados</p>
          <p className='text-[11px] text-marca-300'>Empresas de SP</p>
        </div>
      </div>

      <nav className='flex-1 space-y-1 px-3 py-2'>
        {ITENS.map(item => {
          const ativo = item.ativo(pathname)
          const Icone = item.icone
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                ativo ? 'bg-white/12 font-medium text-white' : 'text-marca-200 hover:bg-white/6 hover:text-white'
              )}
            >
              <Icone className='size-4' />
              <span className='flex-1 whitespace-nowrap'>{item.rotulo}</span>
              {item.selo && (
                <span className='whitespace-nowrap rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-marca-200'>
                  {item.selo}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className='border-t border-white/10 p-4'>
        <p className='truncate text-xs text-marca-300' title={email}>
          {email}
        </p>
        <form action={sair}>
          <button
            type='submit'
            className='mt-2 flex items-center gap-2 text-xs text-marca-200 transition hover:text-white'
          >
            <LogOut className='size-3.5' /> Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
