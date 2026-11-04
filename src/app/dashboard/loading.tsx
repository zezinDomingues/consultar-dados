import { LoaderCircle } from 'lucide-react'

// Mostrado enquanto o servidor monta a página do dashboard (evita a tela em branco).
export default function Carregando() {
  return (
    <div className='space-y-5 p-6' aria-busy='true'>
      <div className='flex items-center gap-2 text-sm text-slate-500'>
        <LoaderCircle className='size-4 animate-spin text-marca-500' /> Carregando…
      </div>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='h-[106px] animate-pulse rounded-xl border border-slate-200 bg-white' />
        ))}
      </div>
      <div className='h-96 animate-pulse rounded-xl border border-slate-200 bg-white' />
    </div>
  )
}
