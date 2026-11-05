'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Megaphone, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

const ABAS = [
  { href: ROTAS.disparos, rotulo: 'Painel', icone: LayoutDashboard, ativa: (p: string) => p === ROTAS.disparos || /^\/dashboard\/disparos\/\d+/.test(p) },
  { href: ROTAS.campanhas, rotulo: 'Campanhas', icone: Megaphone, ativa: (p: string) => p.startsWith(ROTAS.campanhas) },
  { href: ROTAS.numeros, rotulo: 'Números e regras', icone: Smartphone, ativa: (p: string) => p.startsWith(ROTAS.numeros) }
]

export function AbasDisparos() {
  const pathname = usePathname()
  return (
    <nav className='flex gap-1 overflow-x-auto border-b border-slate-200'>
      {ABAS.map(a => {
        const ativa = a.ativa(pathname)
        return (
          <Link
            key={a.href}
            href={a.href}
            className={cn(
              'relative flex items-center gap-2 whitespace-nowrap px-4 pb-3 pt-1 text-sm transition',
              ativa ? 'font-semibold text-marca-800' : 'text-slate-500 hover:text-marca-700'
            )}
          >
            <a.icone className={cn('size-4', ativa ? 'text-ouro-escuro' : 'text-slate-400')} />
            {a.rotulo}
            {ativa && <span className='absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-ouro-escuro' />}
          </Link>
        )
      })}
    </nav>
  )
}
