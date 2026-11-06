import type { Metadata } from 'next'
import { Chat } from '@/components/agente/chat'
import { paginaInterna } from '@/lib/empresas/consulta'

export const metadata: Metadata = { title: 'Agente de IA' }

export default async function AgentePage() {
  await paginaInterna()
  return <Chat />
}
