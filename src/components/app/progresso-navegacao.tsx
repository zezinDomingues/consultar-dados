'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const LIMITE_MS = 15_000 // se a navegação não terminar (ou cair no mesmo endereço), a barra some sozinha

/**
 * Barra fina no topo enquanto uma página do painel carrega. Substitui o antigo loading.tsx do /dashboard,
 * que mostrava o esqueleto da Consulta em qualquer tela e fazia as páginas inexistentes responderem 200.
 * Liga no clique em qualquer link interno (fase de captura) e desliga quando o endereço muda.
 * Links com data-navegacao='local' (a Consulta) têm o próprio indicador e ficam de fora.
 */
export function ProgressoNavegacao() {
  const pathname = usePathname()
  const busca = useSearchParams()
  const [ativo, setAtivo] = useState(false)

  useEffect(() => setAtivo(false), [pathname, busca])

  useEffect(() => {
    if (!ativo) return
    const t = setTimeout(() => setAtivo(false), LIMITE_MS)
    return () => clearTimeout(t)
  }, [ativo])

  useEffect(() => {
    function clique(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (!(a instanceof HTMLAnchorElement)) return
      if (a.target && a.target !== '_self') return
      if (a.hasAttribute('download') || a.dataset.navegacao === 'local') return
      const destino = new URL(a.href, location.href)
      // /api/… são downloads (CSV): a página não muda e a barra ficaria presa
      if (destino.origin !== location.origin || destino.pathname.startsWith('/api/')) return
      if (destino.pathname === location.pathname && destino.search === location.search) return
      setAtivo(true)
    }
    document.addEventListener('click', clique, true)
    return () => document.removeEventListener('click', clique, true)
  }, [])

  if (!ativo) return null
  return (
    <div className='pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-ouro/25' role='status'>
      <span className='sr-only'>Carregando a página…</span>
      <div className='animate-barra h-full w-1/3 bg-ouro-escuro' />
    </div>
  )
}
