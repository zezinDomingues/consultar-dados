import { LoaderCircle } from 'lucide-react'

// Só da Consulta (route group): as outras telas do painel não têm loading.tsx, para que notFound() responda 404
// (um Suspense acima da página começa a resposta com 200). Nelas, o aviso de carregamento é a barra do topo.
export default function Carregando() {
  return (
    <div className='flex' aria-busy='true'>
      <div className='hidden h-dvh w-[264px] shrink-0 border-r border-slate-200 bg-white xl:block 2xl:w-[296px]' />
      <div className='min-w-0 flex-1 space-y-5 p-4 md:p-6'>
        <p role='status' className='flex items-center gap-2 text-sm text-slate-500'>
          <LoaderCircle className='size-4 animate-spin text-marca-500' aria-hidden /> Carregando a consulta…
        </p>
        <div className='@container'>
          <div className='grid grid-cols-2 gap-3 @xl:grid-cols-3 @5xl:grid-cols-6'>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className='h-[106px] animate-pulse rounded-2xl border border-slate-200 bg-white' />
            ))}
          </div>
        </div>
        <div className='h-96 animate-pulse rounded-2xl border border-slate-200 bg-white' />
      </div>
    </div>
  )
}
