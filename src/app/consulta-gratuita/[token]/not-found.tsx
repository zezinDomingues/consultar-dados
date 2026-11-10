import Link from 'next/link'
import { LinkIcon } from 'lucide-react'
import { ROTAS } from '@/lib/rotas'
import { CascaConsulta } from './casca'

// Token inexistente/malformado: a página chama notFound() → HTTP 404 com esta tela (não um 200 disfarçado).
export default function LinkInvalido() {
  return (
    <CascaConsulta largo>
      <div className='flex flex-col items-start gap-4 sm:flex-row sm:gap-5'>
        <span className='grid size-12 shrink-0 place-items-center rounded-full border border-ouro/40 bg-oc-700 text-ouro'>
          <LinkIcon className='size-5' strokeWidth={1.75} aria-hidden />
        </span>
        <div className='min-w-0'>
          <h2 className='font-serif text-2xl font-bold tracking-[-0.01em] text-oc-700'>Link inválido</h2>
          <p className='mt-1.5 max-w-md text-sm leading-relaxed text-oc-700/80'>
            Este endereço não abre nenhuma consulta. Confira se ele chegou completo na mensagem do WhatsApp — às vezes o
            fim do link fica de fora ao copiar. Se preferir, fale com a gente pelo site.
          </p>
          <Link
            href={ROTAS.inicio}
            className='mt-5 inline-flex h-11 items-center rounded-full bg-oc-700 px-6 text-sm font-bold text-creme transition hover:bg-oc-900'
          >
            Ir para o site da OficialCert
          </Link>
        </div>
      </div>
    </CascaConsulta>
  )
}
