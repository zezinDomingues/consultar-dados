import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FormCampanha } from '@/components/disparos/form-campanha'
import { capacidadeDiaria, urlApp } from '@/lib/disparos/config'
import { contarElegiveis, lerConfig, listarGrupos, listarNumeros } from '@/lib/disparos/dados'
import { campanhaPadrao, MODELO_DIVULGACAO, nomeEmpresa } from '@/lib/disparos/mensagens'
import { buscarEmpresas, opcoesFiltros, usuarioAtual } from '@/lib/empresas/consulta'
import { hrefConsulta, lerDeSearchParams, paraQuery } from '@/lib/empresas/filtros'
import { rotulosFiltros } from '@/lib/empresas/rotulos'
import { fmtData } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Nova campanha' }

// Os filtros chegam pela URL, iguais aos da Consulta ("Criar campanha" lá leva a consulta inteira para cá).
// ?grupo= escolhe o grupo (cliente): a campanha nasce com o modelo, a logo e o site dele.
export default async function NovaCampanhaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.disparos)
  const sp = await searchParams
  const { filtros, ordem } = lerDeSearchParams(sp)
  const grupos = (await listarGrupos()).filter(g => g.ativo)
  const grupo = grupos.find(g => String(g.id) === String(sp.grupo)) ?? grupos[0]
  if (!grupo) redirect(ROTAS.grupos)
  const [opcoes, elegiveis, [exemplo], numeros, cfg] = await Promise.all([
    opcoesFiltros(),
    contarElegiveis(filtros, grupo.id),
    // só o exemplo da prévia: se o banco falhar, a tela usa um nome fictício (sem erro 500)
    buscarEmpresas({ ...filtros, com_whatsapp: true }, ordem, 1, 1, 'razao_social,nome_fantasia,municipio').catch(
      () => []
    ),
    listarNumeros(),
    lerConfig()
  ])
  const rotulos = rotulosFiltros(filtros, opcoes).map(r => r.rotulo)
  const hoje = fmtData(new Date().toISOString())
  const nome = `${grupo.nome} · ${rotulos.slice(0, 2).join(' · ') || 'base inteira'} — ${hoje.slice(0, 5)}`.slice(0, 120)
  const padrao = campanhaPadrao(nome, urlApp())
  const inicial = {
    ...padrao,
    ...(grupo.fluxo === 'divulgacao' ? MODELO_DIVULGACAO : {}),
    ...grupo.modelo,
    ordem,
    imagem_url: grupo.logo_url ?? padrao.imagem_url,
    site_url: grupo.site_url ?? padrao.site_url
  }
  const query = paraQuery({ filtros, ordem })
  const numerosDoGrupo = numeros.filter(n => n.ativo && n.grupo_id === grupo.id)

  return (
    <div className='space-y-4'>
      {grupos.length > 1 && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-semibold text-slate-500'>Grupo:</span>
          {grupos.map(g => (
            <Link
              key={g.id}
              href={`${ROTAS.novaCampanha}?${query ? `${query}&` : ''}grupo=${g.id}`}
              className={cn('rounded-full px-3 py-1.5 text-xs font-semibold', g.id === grupo.id ? 'bg-marca-800 text-creme' : 'border border-slate-200 bg-white text-slate-600 hover:border-marca-300')}
            >
              {g.nome}
            </Link>
          ))}
        </div>
      )}
      {!numerosDoGrupo.length && (
        <p className='rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900'>
          O grupo <strong>{grupo.nome}</strong> ainda não tem número ativo: a campanha pode ser criada, mas só envia depois de cadastrar um em
          Números e regras.
        </p>
      )}
      <FormCampanha
        key={grupo.id}
        inicial={inicial}
        filtros={filtros}
        rotulos={rotulos}
        hrefAjustar={hrefConsulta({ filtros: { ...filtros, com_whatsapp: true }, ordem })}
        elegiveis={elegiveis}
        exemplo={{ empresa: nomeEmpresa(exemplo ?? { razao_social: 'Empresa Exemplo' }), municipio: exemplo?.municipio ?? 'São Paulo' }}
        numeros={numerosDoGrupo.map(n => ({ id: n.id, rotulo: n.rotulo, status: n.status }))}
        grupo={{ id: grupo.id, nome: grupo.nome, fluxo: grupo.fluxo, medir_cliques: grupo.medir_cliques }}
        ritmo={{ porDia: capacidadeDiaria(numerosDoGrupo, cfg), numeros: numerosDoGrupo.length }}
      />
    </div>
  )
}
