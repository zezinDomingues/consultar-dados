// Erro de envio comum aos provedores (WAHA e Z-API).
// `enviado: 'talvez'` = a requisição pode ter chegado ao WhatsApp (timeout/conexão caída no meio).
export class ErroEnvio extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly enviado: 'nao' | 'talvez' = 'nao'
  ) {
    super(message)
  }
}

type ErroDoBanco = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }

/** Restrições (CHECK/único) com o que a pessoa precisa corrigir. O nome da restrição nunca vai para a tela. */
const RESTRICOES: [RegExp, string][] = [
  [/disparo_grupos_site_url/, 'Site: o endereço precisa começar com https:// (ou http://).'],
  [/disparo_grupos_logo_url/, 'Logo: o endereço precisa começar com https:// (ou http://).'],
  [/disparo_grupos_nome/, 'Nome do grupo: de 1 a 80 caracteres.'],
  [/disparo_campanhas_botoes_contato/, 'Botões "este número" e "outro número": de 1 a 20 caracteres.'],
  [/disparo_campanhas_botoes/, 'Botões até 20 caracteres, rodapé até 60 e site começando com https://.'],
  [/disparo_campanhas_formato/, 'Formato da 1ª mensagem inválido.'],
  [/disparo_campanhas_nome/, 'Nome da campanha: de 1 a 120 caracteres.'],
  [/disparo_campanhas_limite_total/, 'Quantidade de disparos: maior que zero (ou em branco para sem limite).'],
  [/disparo_campanhas_(mensagem|enquete|opcao)/, 'Mensagens: de 1 a 3.000 caracteres cada.'],
  [/disparo_campanhas_check/, 'As duas opções da enquete precisam ser diferentes.'],
  [/disparo_numeros_waha_url/, 'Endereço do provedor: precisa começar com https://.'],
  [/disparo_numeros_waha_sessao/, 'Sessão / ID da instância: de 1 a 60 caracteres.'],
  [/disparo_numeros_rotulo/, 'Nome do número: de 1 a 60 caracteres.'],
  [/disparo_numeros_limite_diario/, 'Limite diário: de 1 a 2.000.'],
  [/disparo_numeros_(intervalo|check)/, 'Intervalos: mínimo de 20 s, e o máximo maior ou igual ao mínimo.'],
  [/disparo_numeros_provedor/, 'Provedor inválido.'],
  [/disparo_config/, 'Horário: o fim precisa ser depois do início (entre 0 e 24 h).'],
  [/disparo_bloqueios/, 'Telefone inválido (DDD + número).']
]

/**
 * Erro do Postgres/PostgREST → frase em português para a tela. Nunca devolve a mensagem crua (ela vaza nome de
 * tabela e de restrição e não diz o que corrigir); a original vai para o log do servidor.
 */
export function erroDoBanco(e: ErroDoBanco | null | undefined, contexto = 'salvar'): string {
  if (!e) return `Não foi possível ${contexto} agora. Tente de novo.`
  const texto = `${e.message ?? ''} ${e.details ?? ''}`
  console.error(`[banco] ${contexto}:`, e.code ?? '', e.message ?? '', e.details ?? '')
  switch (e.code) {
    case '23514': // check_violation
    case '23P01': {
      const r = RESTRICOES.find(([re]) => re.test(texto))
      return r ? r[1] : 'Algum campo tem um valor que não é aceito. Confira os endereços (https://) e os tamanhos dos textos.'
    }
    case '23505': // unique_violation
      return 'Já existe um registro com esses dados.'
    case '23503': // foreign_key_violation
      return 'Um item ligado a este registro não existe mais (ou ainda é usado). Recarregue a página e tente de novo.'
    case '23502': // not_null_violation
      return 'Falta preencher um campo obrigatório.'
    case '22001': // string_data_right_truncation
      return 'Um dos textos passou do tamanho máximo.'
    case '22P02': // invalid_text_representation
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
    case '22003': // numeric_value_out_of_range
      return 'Algum valor está num formato inválido (número, data ou código). Confira e tente de novo.'
    case '57014': // query_canceled (statement_timeout)
      return 'O banco demorou demais para responder. Tente de novo em instantes.'
    case '40P01': // deadlock_detected
    case '40001': // serialization_failure
    case '55P03': // lock_not_available
      return 'O banco estava ocupado com outra operação nesta campanha. Tente de novo em instantes.'
    case '42501': // insufficient_privilege
      return 'Você não tem permissão para esta ação.'
    case 'PGRST116':
      return 'Registro não encontrado (pode ter sido apagado). Recarregue a página.'
    case 'PGRST202':
    case '42883':
      return 'O banco ainda não tem a função desta tela: falta aplicar uma migração.'
    case 'PGRST204':
    case '42703':
      return 'O banco ainda não tem um campo desta tela: falta aplicar uma migração.'
  }
  if (/fetch failed|network|ECONN|timeout/i.test(texto)) return 'Sem resposta do banco agora. Tente de novo em instantes.'
  return `Não foi possível ${contexto} agora. Tente de novo.`
}

/** O erro veio de uma função/coluna que ainda não existe (migração não aplicada)? */
export const faltaNoBanco = (e: ErroDoBanco | null | undefined) =>
  !!e && (['PGRST202', '42883', 'PGRST204', '42703'].includes(e.code ?? '') || /could not find the (function|.* column)/i.test(e.message ?? ''))

/** Conflito de trava (vale tentar de novo uma vez). */
export const conflitoDeTrava = (e: ErroDoBanco | null | undefined) => !!e && ['40P01', '40001', '55P03'].includes(e.code ?? '')
