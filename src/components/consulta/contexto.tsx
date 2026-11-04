'use client'

import { createContext, useCallback, useContext, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type ContextoConsulta = { pendente: boolean; navegar: (href: string) => void }

const Contexto = createContext<ContextoConsulta | null>(null)

/** Toda mudança de filtro, ordem ou página passa por aqui: a URL é o estado. */
export function ConsultaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const navegar = useCallback((href: string) => iniciar(() => router.push(href, { scroll: false })), [router])
  return <Contexto.Provider value={{ pendente, navegar }}>{children}</Contexto.Provider>
}

export function useConsulta() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useConsulta fora do ConsultaProvider')
  return ctx
}

/** Link que navega dentro da transição (mostra o "carregando" da consulta). */
export function LinkNav({
  href,
  className,
  title,
  children
}: {
  href: string
  className?: string
  title?: string
  children: React.ReactNode
}) {
  const { navegar } = useConsulta()
  return (
    <a
      href={href}
      title={title}
      className={className}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navegar(href)
      }}
    >
      {children}
    </a>
  )
}

export function AreaResultados({ children }: { children: React.ReactNode }) {
  const { pendente } = useConsulta()
  return (
    <section className='relative min-w-0 flex-1' aria-busy={pendente}>
      {pendente && (
        <div className='absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-marca-100'>
          <div className='animate-barra h-full w-1/3 bg-marca-500' />
        </div>
      )}
      <div className={cn('space-y-5 p-6 transition-opacity duration-200', pendente && 'opacity-60')}>{children}</div>
    </section>
  )
}
