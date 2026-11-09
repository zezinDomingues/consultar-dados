'use client'

import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

// Gaveta = painel que desliza por cima da tela no celular/tablet (menu, filtros, histórico do agente).
// Convenção do painel: barra superior h-14 (z-30) abaixo de lg; véu z-40; gaveta z-50.

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/** true/false conforme a media query (no servidor: false). */
export function useMidia(consulta: string) {
  return useSyncExternalStore(
    avisar => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', avisar)
      return () => m.removeEventListener('change', avisar)
    },
    () => window.matchMedia(consulta).matches,
    () => false
  )
}

/**
 * Enquanto `aberta`: Esc fecha, o Tab fica preso dentro do painel, a página de trás não rola e,
 * ao fechar, o foco volta para quem abriu (`gatilho`; sem ele, o que tinha foco). Devolve a ref do painel.
 * O foco inicial vai para o elemento com `data-foco-inicial` (ou o primeiro controle).
 */
export function useGaveta<T extends HTMLElement = HTMLElement>(
  aberta: boolean,
  fechar: () => void,
  gatilho?: RefObject<HTMLElement | null>
) {
  const painel = useRef<T>(null)
  const fecharRef = useRef(fechar)
  useEffect(() => {
    fecharRef.current = fechar
  }, [fechar])

  useEffect(() => {
    const el = painel.current
    if (!aberta || !el) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controles = () => [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter(x => x.getClientRects().length > 0)
    const quadro = requestAnimationFrame(() =>
      (el.querySelector<HTMLElement>('[data-foco-inicial]') ?? controles()[0] ?? el).focus()
    )

    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target instanceof Node ? e.target : null
      // Esc ou Tab dentro de um popover (desenhado fora do painel, ex.: seletor de filtros) é dele.
      const foraDoPainel = alvo && alvo !== document.body && !el.contains(alvo)
      if (e.key === 'Escape') {
        if (foraDoPainel) return
        e.preventDefault()
        fecharRef.current()
        return
      }
      if (e.key !== 'Tab' || foraDoPainel) return
      const lista = controles()
      if (!lista.length) return
      const primeiro = lista[0]
      const ultimo = lista[lista.length - 1]
      const ativo = document.activeElement
      if (!ativo || ativo === document.body || !el.contains(ativo)) {
        e.preventDefault()
        primeiro.focus()
      } else if (e.shiftKey && ativo === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', tecla)
    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelAnimationFrame(quadro)
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = rolagem
      const volta = gatilho?.current ?? anterior
      if (volta?.isConnected) volta.focus({ preventScroll: true })
    }
  }, [aberta, gatilho])

  return painel
}
