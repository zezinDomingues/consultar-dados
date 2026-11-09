import type { NextConfig } from 'next'
import { PAGINAS_SITE } from './src/lib/rotas'

// Cabeçalhos de segurança (QA rodada 1, SEC-06). A CSP não tem nonce: o Next injeta scripts inline (payload do
// RSC) e o site estático usa onerror inline, então script-src fica 'self' 'unsafe-inline'. O que dá para ter já:
// ninguém emoldura as páginas (frame-ancestors/X-Frame-Options), nada de <object>/<embed>, <base> e formulários
// só para a própria origem, e conexões só para a própria origem e o Supabase.
const dev = process.env.NODE_ENV !== 'production'
const preview = process.env.VERCEL_ENV === 'preview' // barra de comentários da Vercel nos previews
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? ''

function csp(img: string) {
  const vercel = (s: string) => (preview ? ` ${s}` : '')
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}${vercel('https://vercel.live')}`,
    `style-src 'self' 'unsafe-inline'${vercel('https://vercel.live')}`,
    `img-src ${img}${vercel('https://vercel.live https://vercel.com')}`,
    `font-src 'self' data:${vercel('https://vercel.live https://assets.vercel.com')}`,
    `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^http/, 'ws')}` : ''}${dev ? ' ws: wss:' : ''}${vercel('https://vercel.live wss://ws-us3.pusher.com')}`,
    `frame-src 'self'${vercel('https://vercel.live')}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests'])
  ].join('; ')
}

const comuns = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }])
]

// O site institucional é uma cópia estática em public/site/. Os rewrites fazem
// /, /quem-somos, /blog/<artigo>… servirem esses arquivos sem mudar a URL.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // imagens de qualquer https: notícias dos portais (site), logos do Storage e a imagem da campanha (painel)
      { source: '/:path*', headers: [...comuns, { key: 'Content-Security-Policy', value: csp("'self' data: blob: https:") }] },
      // o agente mostra texto do modelo de IA: sem imagem externa, um markdown malicioso não vaza nada por URL
      { source: '/dashboard/agente', headers: [{ key: 'Content-Security-Policy', value: csp("'self' data: blob:") }] }
    ]
  },
  // a página Eventos saiu em 04/11/2026; quem tiver o link cai nas notícias do blog
  async redirects() {
    return [
      { source: '/eventos', destination: '/blog#noticias', permanent: true },
      // artigos antigos saíram em 04/11/2026: o blog agora é o Radar tributário
      { source: '/blog/:artigo', destination: '/blog#noticias', permanent: true }
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/site/index.html' },
        ...PAGINAS_SITE.map(p => ({ source: `/${p}`, destination: `/site/${p}.html` }))
      ],
      afterFiles: [],
      fallback: []
    }
  }
}

export default nextConfig
