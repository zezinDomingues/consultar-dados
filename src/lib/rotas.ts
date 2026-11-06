// Endereços da aplicação num lugar só. A raiz "/" é a landing page pública;
// tudo que exige login fica debaixo de /dashboard.
export const ROTAS = {
  inicio: '/',
  login: '/login',
  dashboard: '/dashboard',
  contadores: '/dashboard/contadores',
  agente: '/dashboard/agente',
  empresa: (cnpj: string) => `/dashboard/empresa/${cnpj}`,
  disparos: '/dashboard/disparos',
  disparo: (id: number) => `/dashboard/disparos/${id}`,
  campanhas: '/dashboard/disparos/campanhas',
  novaCampanha: '/dashboard/disparos/campanhas/nova',
  campanha: (id: number) => `/dashboard/disparos/campanhas/${id}`,
  numeros: '/dashboard/disparos/numeros',
  grupos: '/dashboard/disparos/grupos',
  grupo: (id: number | 'novo') => `/dashboard/disparos/grupos/${id}`,
  calendario: '/dashboard/calendario',
  usuarios: '/dashboard/usuarios',
  usuario: (id: string) => `/dashboard/usuarios/${id}`,
  /** Produto "Consulta de dados": a única área do cliente */
  minhasEmpresas: '/dashboard/minhas-empresas',
  /** Formulário público que o contato abre pelo link do WhatsApp */
  consultaGratuita: (token: string) => `/consulta-gratuita/${token}`
} as const

/** Prefixos que exigem usuário logado (o proxy barra o resto). */
export const PREFIXOS_PROTEGIDOS = ['/dashboard', '/api'] as const

/**
 * Exceções públicas dentro dos protegidos: formulários do site (/api/publico) e chamadas de máquina
 * (/api/sistema: ciclo do pg_cron e webhook do WAHA), que se autenticam sozinhas por segredo/HMAC.
 */
export const PREFIXOS_PUBLICOS = ['/api/publico', '/api/sistema'] as const

/** Páginas do site institucional (cópias estáticas em public/site/, servidas por rewrite). */
export const PAGINAS_SITE = [
  'quem-somos', 'segmentos', 'seja-um-parceiro', 'diagnostico', 'blog', 'politica-de-privacidade', 'termos-de-uso'
] as const
