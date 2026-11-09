'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { versaoPainel } from '@/app/dashboard/disparos/actions'
import { cn } from '@/lib/utils'

const A_CADA_MS = 10_000

/**
 * Painel "ao vivo" sem recarregar a página: a cada 10 s pergunta ao servidor uma assinatura barata dos disparos
 * (último atualizado_em + total). Só quando ela muda faz router.refresh() — o Next troca os dados no lugar, sem
 * reload, mantendo rolagem e o que foi digitado. Linhas novas ([data-disparo-id] que não existiam) piscam.
 * Com a aba escondida não consulta; ao voltar, confere na hora.
 */
export function AoVivo() {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [quando, setQuando] = useState<Date | null>(null)
  const versao = useRef<string | null>(null)
  const antes = useRef<Set<string> | null>(null)

  useEffect(() => {
    let parado = false
    const conferir = async () => {
      if (document.hidden) return
      const v = await versaoPainel().catch(() => null)
      if (parado || v === null) return
      if (versao.current !== null && v !== versao.current) {
        antes.current = idsNaTela()
        iniciar(() => router.refresh())
        setQuando(new Date())
      }
      versao.current = v
    }
    conferir()
    const t = setInterval(conferir, A_CADA_MS)
    const aoVoltar = () => !document.hidden && conferir()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      parado = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [router])

  // terminou de trocar os dados: destaca o que é novo
  useEffect(() => {
    if (pendente || !antes.current) return
    const vistos = antes.current
    antes.current = null
    document.querySelectorAll<HTMLElement>('[data-disparo-id]').forEach(el => {
      if (vistos.has(el.dataset.disparoId!)) return
      el.classList.remove('linha-nova')
      void el.offsetWidth // reinicia a animação
      el.classList.add('linha-nova')
    })
  }, [pendente])

  return (
    <span
      className='inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal text-emerald-800'
      title='Novidades aparecem sozinhas, sem recarregar a página'
    >
      <span className={cn('size-2 rounded-full bg-emerald-500', pendente ? 'animate-ping' : 'animate-pulse')} />
      Ao vivo
      {quando && (
        <span className='font-normal text-emerald-700/80'>
          · atualizado {quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}
    </span>
  )
}

function idsNaTela() {
  return new Set([...document.querySelectorAll<HTMLElement>('[data-disparo-id]')].map(el => el.dataset.disparoId!))
}
