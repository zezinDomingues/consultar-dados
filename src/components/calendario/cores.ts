// Cor de cada pessoa no calendário (mesma pessoa = mesma cor no mês inteiro). Só a paleta da marca:
// marinho, dourado, areia e creme, cheios ou contornados — nada de verde, azul-céu ou violeta. Texto com contraste AA.
// Arquivo sem 'use client': a página (servidor) escolhe a cor e o componente só recebe a classe.
export const CORES_PESSOA = [
  'bg-marca-800 text-creme',
  'bg-ouro-escuro text-marca-950',
  'bg-marca-100 text-marca-900 ring-1 ring-inset ring-marca-300',
  'bg-areia text-marca-950',
  'bg-marca-500 text-white',
  'bg-white text-marca-800 ring-1 ring-inset ring-marca-700',
  'bg-oc-950 text-ouro',
  'bg-creme text-marca-900 ring-1 ring-inset ring-ouro-escuro'
]
