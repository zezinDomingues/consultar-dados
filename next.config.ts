import type { NextConfig } from 'next'
import { PAGINAS_SITE } from './src/lib/rotas'

// O site institucional é uma cópia estática em public/site/. Os rewrites fazem
// /, /quem-somos, /blog/<artigo>… servirem esses arquivos sem mudar a URL.
const nextConfig: NextConfig = {
  // a página Eventos saiu em 04/11/2026; quem tiver o link cai nas notícias do blog
  async redirects() {
    return [{ source: '/eventos', destination: '/blog#noticias', permanent: true }]
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/site/index.html' },
        ...PAGINAS_SITE.map(p => ({ source: `/${p}`, destination: `/site/${p}.html` })),
        { source: '/blog/:artigo', destination: '/site/blog/:artigo.html' }
      ],
      afterFiles: [],
      fallback: []
    }
  }
}

export default nextConfig
