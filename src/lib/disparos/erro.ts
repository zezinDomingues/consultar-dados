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
