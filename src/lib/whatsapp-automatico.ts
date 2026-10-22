/**
 * O envio automático por WhatsApp ainda não tem canal definido (a Evolution foi descartada pelo risco de
 * banimento do número e a Cloud API da Meta ainda não está pronta). Enquanto for `false`, o botão
 * "Enviar por WhatsApp" do link de acompanhamento fica desativado; o orçamento segue por e-mail e pelo
 * "Enviar manualmente" (copia e cola). Para religar: ver "Pendências do WhatsApp" em docs/FILA_ENVIOS_WHATSAPP.md.
 */
export const WHATSAPP_AUTOMATICO_DISPONIVEL = false;
