import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { PREFIXOS_PROTEGIDOS, ROTAS } from '@/lib/rotas'

// Redirect que leva junto os cookies que o Supabase acabou de gravar (token
// renovado). Um redirect "cru" descartaria o token novo e derrubaria a sessão.
function redirecionar(url: URL, origem: NextResponse) {
  const resposta = NextResponse.redirect(url)
  origem.cookies.getAll().forEach(cookie => resposta.cookies.set(cookie))
  return resposta
}

const protegida = (pathname: string) =>
  PREFIXOS_PROTEGIDOS.some(p => pathname === p || pathname.startsWith(`${p}/`))

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const ehLogin = pathname === ROTAS.login || pathname.startsWith(`${ROTAS.login}/`)

  // Landing page e demais páginas públicas: nem consulta o Supabase.
  if (!protegida(pathname) && !ehLogin) return NextResponse.next()

  let resposta = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          resposta = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options))
        }
      }
    }
  )

  const { data } = await supabase.auth.getClaims()
  const logado = !!data?.claims

  if (!logado && protegida(pathname)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ erro: 'Faça login.' }, { status: 401 })
    const url = request.nextUrl.clone()
    url.pathname = ROTAS.login
    url.search = ''
    if (pathname !== ROTAS.dashboard || search) url.searchParams.set('next', pathname + search)
    return redirecionar(url, resposta)
  }

  if (logado && ehLogin) {
    const url = request.nextUrl.clone()
    url.pathname = ROTAS.dashboard
    url.search = ''
    return redirecionar(url, resposta)
  }

  return resposta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
}
