import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { MenuLateral } from '@/components/app/menu-lateral'
import { ProgressoNavegacao } from '@/components/app/progresso-navegacao'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { ROTAS } from '@/lib/rotas'

// Casca do painel. Abaixo de lg (1024 px) o menu vira gaveta e aparece a barra superior (h-14);
// a coluna principal ocupa a largura toda e tem min-w-0 (tabelas largas rolam dentro do próprio contêiner).
// Sem loading.tsx aqui: um Suspense acima das páginas faria notFound() responder 200 (ver (consulta)/loading.tsx).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual()
  if (!usuario) redirect(ROTAS.login)

  return (
    <div className='min-h-dvh lg:flex'>
      <Suspense fallback={null}>
        <ProgressoNavegacao />
      </Suspense>
      <MenuLateral email={usuario.email} papel={usuario.papel} produtos={usuario.produtos} />
      <main id='conteudo' tabIndex={-1} className='min-w-0 flex-1 outline-none'>
        {usuario.autorizado || usuario.papel === 'cliente' ? (
          children
        ) : (
          <div className='grid min-h-[calc(100dvh-3.5rem)] place-items-center p-6 lg:min-h-dvh'>
            <div className='max-w-md space-y-3 text-center'>
              <ShieldAlert className='mx-auto size-10 text-amber-500' />
              <h1 className='text-lg font-semibold'>Seu usuário ainda não tem acesso à base</h1>
              <p className='text-sm text-slate-500'>
                Peça ao administrador para liberar o e-mail <strong>{usuario.email}</strong>.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
