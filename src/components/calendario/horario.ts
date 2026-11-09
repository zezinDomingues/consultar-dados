// Horário sugerido ao abrir "Marcar reunião" (servidor e navegador; sem 'use client').
// Dia futuro: 10:00–11:00. Hoje: a próxima hora cheia (às 20:15 sugere 21:00–22:00), para o formulário
// não nascer já com "esse horário já passou". Hoje depois das 22h, só pelo botão geral: amanhã às 10:00.

const doisDig = (n: number) => String(n).padStart(2, '0')

/** Agora em Brasília como "AAAA-MM-DD HH:MM" (dá para comparar como texto com a data e a hora do formulário). */
export const agoraBrasilia = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map(x => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

const amanha = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Dia e horas sugeridos. `podeMudarDia`: o botão geral pode pular para amanhã quando hoje já está no fim;
 * o clique num dia específico respeita o dia escolhido.
 */
export function horarioPadrao(dia: string, agora: string, podeMudarDia = false): { dia: string; hi: string; hf: string } {
  const [hoje, hora] = agora.split(' ')
  if (dia !== hoje) return { dia, hi: '10:00', hf: '11:00' }
  const proxima = Number(hora.slice(0, 2)) + 1
  if (proxima <= 10) return { dia, hi: '10:00', hf: '11:00' }
  if (proxima <= 22) return { dia, hi: `${doisDig(proxima)}:00`, hf: `${doisDig(proxima + 1)}:00` }
  if (podeMudarDia) return { dia: amanha(dia), hi: '10:00', hf: '11:00' }
  return { dia, hi: '23:00', hf: '23:59' }
}
