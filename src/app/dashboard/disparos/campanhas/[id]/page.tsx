import type { Metadata } from 'next'
import { usuarioAtual } from '@/lib/empresas/consulta'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FormCampanha } from '@/components/disparos/form-campanha'
import { SeloCampanha } from '@/components/disparos/selos'
import { capacidadeDiaria } from '@/lib/disparos/config'
import { contarElegiveis, divisaoCampanha, lerConfig, listarNumeros, obterCampanha, obterGrupo } from '@/lib/disparos/dados'
import { nomeEmpresa } from '@/lib/disparos/mensagens'
import { buscarEmpresas, opcoesFiltros } from '@/lib/empresas/consulta'
import { hrefConsulta } from '@/lib/empresas/filtros'
import { rotulosFiltros } from '@/lib/empresas/rotulos'
import { ROTAS } from '@/lib/rotas'

export const metadata: Metadata = { title: 'Campanha' }

// Edição: textos, nome, ordem e limites. Os filtros ficam fixos (público diferente = campanha nova).
export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.disparos)
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const c = await obterCampanha(id)
  if (!c) notFound()
  const [opcoes, com, sem, [exemplo], numeros, cfg, divisao] = await Promise.all([
    opcoesFiltros(),
    contarElegiveis(c.filtros, true, c.grupo_id),
    contarElegiveis(c.filtros, false, c.grupo_id),
    buscarEmpresas({ ...c.filtros, com_whatsapp: true }, c.ordem, 1, 1, 'razao_social,nome_fantasia,municipio'),
    listarNumeros(),
    lerConfig(),
    divisaoCampanha(id).catch(() => null)
  ])
  const grupo = await obterGrupo(c.grupo_id)
  const numerosDoGrupo = numeros.filter(n => n.ativo && n.grupo_id === c.grupo_id)

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <Link href={ROTAS.campanhas} className='inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-marca-700'>
          <ArrowLeft className='size-3.5' /> Campanhas
        </Link>
        <SeloCampanha status={c.status} />
        {c.motivo_status && <span className='text-xs text-slate-400'>{c.motivo_status}</span>}
      </div>
      <FormCampanha
        inicial={c}
        filtros={c.filtros}
        rotulos={rotulosFiltros(c.filtros, opcoes).map(r => r.rotulo)}
        hrefAjustar={hrefConsulta({ filtros: c.filtros, ordem: c.ordem })}
        elegiveis={{ com_whatsapp: com.com_whatsapp, elegiveis: com.elegiveis, elegiveis_sem_excluir: sem.elegiveis }}
        exemplo={{ empresa: nomeEmpresa(exemplo ?? { razao_social: 'Empresa Exemplo' }), municipio: exemplo?.municipio ?? 'São Paulo' }}
        numeros={numerosDoGrupo.map(n => ({ id: n.id, rotulo: n.rotulo, status: n.status }))}
        grupo={{ id: c.grupo_id, nome: grupo?.nome ?? 'OficialCert', fluxo: grupo?.fluxo ?? 'coleta', medir_cliques: grupo?.medir_cliques ?? true }}
        divisao={divisao}
        ritmo={{ porDia: capacidadeDiaria(numerosDoGrupo, cfg), numeros: numerosDoGrupo.length }}
      />
    </div>
  )
}
