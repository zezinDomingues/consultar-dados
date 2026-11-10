// Datas e horas do calendário (servidor e navegador). O formulário manda "AAAA-MM-DD" e "HH:MM" em Brasília.

/** Quanto antes de agora ainda vale como "agora" (quem marca a reunião que está começando). */
export const PASSADO_TOLERANCIA_MS = 5 * 60_000
export const DURACAO_MAXIMA_MS = 24 * 60 * 60_000

/** Data que existe no calendário: mês 1–12, dia até o último do mês (31/02 e 2026-13-01 não passam). */
export function dataValida(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return false
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** 00:00 a 23:59 (o campo de hora do navegador pode mandar os segundos). */
export function horaValida(s: string) {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)
}

/** Data + hora digitadas em Brasília → instante (o Brasil não tem horário de verão desde 2019). */
export function instante(data: string, hora: string) {
  return new Date(`${data}T${hora.slice(0, 5)}:00-03:00`)
}
