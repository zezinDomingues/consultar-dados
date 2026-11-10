'use client'

import { useTransition } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { Retorno } from '@/app/dashboard/disparos/actions'
import { cn } from '@/lib/utils'

/**
 * Botão que chama uma server action já com os argumentos (bind) e mostra o resultado num toast.
 * `titulo` também é o nome acessível (botões só com ícone: Excluir, Remover bloqueio).
 */
export function BotaoAcao({
  acao,
  children,
  confirmar,
  className,
  variante = 'secundario',
  titulo
}: {
  acao: () => Promise<Retorno>
  children: React.ReactNode
  confirmar?: string
  className?: string
  variante?: 'primario' | 'secundario' | 'perigo' | 'texto'
  titulo?: string
}) {
  const [pendente, iniciar] = useTransition()
  const estilos = {
    primario: 'bg-marca-800 text-creme hover:bg-marca-950 shadow-sm shadow-marca-900/15',
    secundario: 'border border-slate-200 bg-white text-slate-700 hover:border-marca-300 hover:text-marca-800',
    perigo: 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
    texto: 'text-slate-500 hover:text-marca-800'
  }
  return (
    <button
      type='button'
      title={titulo}
      aria-label={titulo}
      aria-busy={pendente}
      disabled={pendente}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return
        iniciar(async () => {
          try {
            const r = await acao()
            if (r.erro) toast.error(r.erro)
            else if (r.mensagem) toast.success(r.mensagem)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Falhou.')
          }
        })
      }}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition disabled:opacity-60',
        estilos[variante],
        className
      )}
    >
      {pendente && <LoaderCircle className='size-3.5 animate-spin' aria-hidden />}
      {children}
    </button>
  )
}
