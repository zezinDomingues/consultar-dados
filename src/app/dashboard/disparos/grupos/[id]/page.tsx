import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Megaphone, Smartphone, Users } from 'lucide-react'
import { FormGrupo } from '@/components/disparos/form-grupo'
import { obterGrupo } from '@/lib/disparos/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { ROTAS } from '@/lib/rotas'

export const metadata: Metadata = { title: 'Grupo' }

export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.disparos)
  const { id } = await params
  const novo = id === 'novo'
  const grupo = novo ? undefined : await obterGrupo(Number(id))
  if (!novo && !grupo) notFound()
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        <Link href={ROTAS.grupos} className='inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-marca-700'>
          <ArrowLeft className='size-3.5' aria-hidden /> Grupos
        </Link>
        <h2 className='min-w-0 break-words font-serif text-xl font-bold text-marca-800'>{novo ? 'Novo grupo' : grupo!.nome}</h2>
        {!novo && (
          <span className='flex flex-wrap gap-2 text-xs sm:ml-auto'>
            <Link href={`${ROTAS.novaCampanha}?grupo=${grupo!.id}`} className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:border-marca-300'>
              <Megaphone className='size-3.5' /> Nova campanha deste grupo
            </Link>
            <Link href={ROTAS.numeros} className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:border-marca-300'>
              <Smartphone className='size-3.5' /> Números
            </Link>
            <Link href={ROTAS.usuarios} className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:border-marca-300'>
              <Users className='size-3.5' /> Dar login ao cliente
            </Link>
          </span>
        )}
      </div>
      <FormGrupo grupo={grupo ?? undefined} />
    </div>
  )
}
