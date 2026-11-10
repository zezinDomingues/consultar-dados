'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building, ChevronDown, LayoutDashboard, Megaphone, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

const ABAS = [
  { href: ROTAS.disparos, rotulo: 'Painel', icone: LayoutDashboard, ativa: (p: string) => p === ROTAS.disparos || /^\/dashboard\/disparos\/\d+/.test(p) },
  { href: ROTAS.grupos, rotulo: 'Grupos', icone: Building, ativa: (p: string) => p.startsWith(ROTAS.grupos) },
  { href: ROTAS.campanhas, rotulo: 'Campanhas', icone: Megaphone, ativa: (p: string) => p.startsWith(ROTAS.campanhas) },
  { href: ROTAS.numeros, rotulo: 'Números e regras', icone: Smartphone, ativa: (p: string) => p.startsWith(ROTAS.numeros) }
]

/** Abas da área (só o admin tem mais de uma; com uma aba só, a barra não aparece). */
export function AbasDisparos({ admin }: { admin: boolean }) {
  const pathname = usePathname()
  if (!admin) return null
  return (
    <nav aria-label='Seções dos disparos' className='-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0'>
      {ABAS.map(a => {
        const ativa = a.ativa(pathname)
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-2 whitespace-nowrap px-3 pb-3 pt-1 text-sm transition sm:px-4',
              ativa ? 'font-semibold text-marca-800' : 'text-slate-500 hover:text-marca-700'
            )}
          >
            <a.icone className={cn('size-4', ativa ? 'text-ouro-escuro' : 'text-slate-400')} aria-hidden />
            {a.rotulo}
            {ativa && <span className='absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-ouro-escuro' />}
          </Link>
        )
      })}
    </nav>
  )
}

type Papel = 'admin' | 'equipe' | 'cliente'

/** Título e ajuda de cada aba: curtos, para o conteúdo da aba começar acima da dobra. */
function textos(p: string, papel: Papel): { titulo: string; ajuda: string; mais?: string } {
  if (p.startsWith(ROTAS.grupos))
    return {
      titulo: 'Grupos',
      ajuda: 'Cada grupo é um cliente do disparo: marca, logo, números e campanhas próprios.',
      mais:
        'Ninguém recebe duas vezes do mesmo grupo, e quem pede para sair sai daquele grupo. O cliente entra com o ' +
        'login dele e vê só o grupo dele.'
    }
  if (p.startsWith(ROTAS.campanhas))
    return {
      titulo: 'Campanhas',
      ajuda: 'Para quem vai a 1ª mensagem, quantos disparos e em que ritmo.',
      mais:
        'Filtre as empresas na Consulta e clique em “Criar campanha”. Quem já foi contatado nunca entra de novo; ' +
        'a campanha encerra sozinha ao chegar na quantidade escolhida.'
    }
  if (p.startsWith(ROTAS.numeros))
    return {
      titulo: 'Números e regras',
      ajuda: 'Os números de WhatsApp que enviam, o horário de envio e quem nunca deve ser contatado.'
    }
  if (papel === 'cliente')
    return {
      titulo: 'Meus disparos',
      ajuda: 'Quem recebeu a sua mensagem, quem respondeu e quem enviou os dados para contato.',
      mais:
        'Cada telefone recebe a primeira mensagem uma única vez. Quem responde “SAIR” não recebe mais nada. As ' +
        'novidades aparecem sozinhas, sem recarregar a página.'
    }
  return {
    titulo: 'Painel',
    ajuda: 'Quem recebeu, quem respondeu e quem pediu a consulta gratuita, por ramo.',
    mais:
      (papel === 'equipe'
        ? 'Você vê e responde os contatos dos ramos que recebeu. '
        : 'Cada pessoa da equipe vê e responde os ramos que recebeu (Usuários). ') +
      'Cada telefone recebe a primeira mensagem uma única vez; quem responde “SAIR” não recebe mais nada.'
  }
}

/** Cabeçalho da área: rótulo curto + título da aba + ajuda curta (o resto fica em "Como funciona", recolhido). */
export function TituloDisparos({ papel }: { papel: Papel }) {
  const t = textos(usePathname(), papel)
  return (
    <div className='min-w-0 max-w-2xl'>
      <span className='rotulo-secao'>{papel === 'cliente' ? 'WhatsApp' : 'Disparos de WhatsApp'}</span>
      <h1 className='mt-1.5 font-serif text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-marca-800 sm:text-[2rem]'>
        {t.titulo}
      </h1>
      <p className='mt-0.5 text-sm text-slate-500'>{t.ajuda}</p>
      {t.mais && (
        <details className='group mt-1 text-sm text-slate-500'>
          <summary className='inline-flex cursor-pointer items-center gap-1 rounded text-xs font-semibold text-marca-700 hover:underline'>
            Como funciona <ChevronDown className='size-3.5 transition group-open:rotate-180' aria-hidden />
          </summary>
          <p className='mt-1 max-w-xl'>{t.mais}</p>
        </details>
      )}
    </div>
  )
}
