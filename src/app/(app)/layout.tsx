import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { MenuLateral } from '@/components/app/menu-lateral'
import { usuarioAtual } from '@/lib/empresas/consulta'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual()
  if (!usuario) redirect('/login')

  return (
    <div className='flex min-h-screen'>
      <MenuLateral email={usuario.email} />
      <main className='min-w-0 flex-1'>
        {usuario.autorizado ? (
          children
        ) : (
          <div className='grid min-h-screen place-items-center p-6'>
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
