import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { ROTAS } from '@/lib/rotas'
import { FormCampanha } from '@/components/disparos/form-campanha'
import { urlApp } from '@/lib/disparos/config'
import { contarElegiveis, listarNumeros } from '@/lib/disparos/dados'
import { campanhaPadrao, nomeEmpresa } from '@/lib/disparos/mensagens'
import { buscarEmpresas, opcoesFiltros } from '@/lib/empresas/consulta'
import { hrefConsulta, lerDeSearchParams } from '@/lib/empresas/filtros'
import { rotulosFiltros } from '@/lib/empresas/rotulos'
import { fmtData } from '@/lib/formatar'

export const metadata: Metadata = { title: 'Nova campanha' }

// Os filtros chegam pela URL, iguais aos da Consulta ("Criar campanha" lá leva a consulta inteira para cá).
export default async function NovaCampanhaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.disparos)
  const { filtros, ordem } = lerDeSearchParams(await searchParams)
  const [opcoes, com, sem, [exemplo], numeros] = await Promise.all([
    opcoesFiltros(),
    contarElegiveis(filtros, true),
    contarElegiveis(filtros, false),
    buscarEmpresas({ ...filtros, com_whatsapp: true }, ordem, 1, 1, 'razao_social,nome_fantasia,municipio'),
    listarNumeros()
  ])
  const rotulos = rotulosFiltros(filtros, opcoes).map(r => r.rotulo)
  const hoje = fmtData(new Date().toISOString())
  const nome = `${rotulos.slice(0, 3).join(' · ') || 'Base inteira'} — ${hoje.slice(0, 5)}`.slice(0, 120)

  return (
    <FormCampanha
      inicial={{ ...campanhaPadrao(nome, urlApp()), ordem }}
      filtros={filtros}
      rotulos={rotulos}
      hrefAjustar={hrefConsulta({ filtros: { ...filtros, com_whatsapp: true }, ordem })}
      elegiveis={{ com_whatsapp: com.com_whatsapp, elegiveis: com.elegiveis, elegiveis_sem_excluir: sem.elegiveis }}
      exemplo={{ empresa: nomeEmpresa(exemplo ?? { razao_social: 'Empresa Exemplo' }), municipio: exemplo?.municipio ?? 'São Paulo' }}
      numeros={numeros.filter(n => n.ativo).map(n => ({ id: n.id, rotulo: n.rotulo, status: n.status }))}
    />
  )
}
