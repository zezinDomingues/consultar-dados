import type { Metadata } from 'next'
import { Chat } from '@/components/agente/chat'

export const metadata: Metadata = { title: 'Agente de IA' }

export default function AgentePage() {
  return <Chat />
}
