// Endereços da aplicação num lugar só. A raiz "/" é a landing page pública;
// tudo que exige login fica debaixo de /dashboard.
export const ROTAS = {
  inicio: '/',
  login: '/login',
  dashboard: '/dashboard',
  contadores: '/dashboard/contadores',
  agente: '/dashboard/agente',
  empresa: (cnpj: string) => `/dashboard/empresa/${cnpj}`
} as const

/** Prefixos que exigem usuário logado (o proxy barra o resto). */
export const PREFIXOS_PROTEGIDOS = ['/dashboard', '/api'] as const
