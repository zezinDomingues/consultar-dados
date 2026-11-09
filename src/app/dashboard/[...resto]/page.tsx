import { notFound } from 'next/navigation'

// Qualquer endereço do painel que não existe cai aqui e mostra o 404 do painel (com o menu), com HTTP 404.
export default function RotaInexistente() {
  notFound()
}
