import { NextResponse } from 'next/server'
import { montarRadar, type Radar } from '@/lib/noticias/noticias'

// Radar tributário do blog (público). A CDN da Vercel guarda a resposta por 1 h e serve a
// anterior enquanto renova; dentro da função há um cache em memória do mesmo prazo.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALIDADE = 60 * 60 * 1000
let cache: { quando: number; dados: Radar } | null = null
let emAndamento: Promise<Radar> | null = null

export async function GET() {
  try {
    if (!cache || Date.now() - cache.quando > VALIDADE) {
      emAndamento ??= montarRadar().finally(() => (emAndamento = null))
      const dados = await emAndamento
      cache = { quando: Date.now(), dados }
    }
    return NextResponse.json(cache.dados, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' }
    })
  } catch (e) {
    console.error('[noticias]', e) // o detalhe fica no log do servidor, não vai para o público
    if (cache) return NextResponse.json(cache.dados, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
    return NextResponse.json({ erro: 'Não foi possível carregar as notícias agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
