import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

// Uma instância por request (cache do React): todos os componentes do mesmo
// render compartilham o cliente e, com ele, a renovação do token.
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Chamado num Server Component, onde não dá para gravar cookie.
            // O proxy.ts já renova a sessão antes de cada render.
          }
        }
      }
    }
  )
})
