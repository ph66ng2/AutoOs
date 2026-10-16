// Textos públicos de cada etapa. Usados pelo link individual (`public-status`) e pelo
// Portal das Impressoras do Cliente (`portal-cliente`); mudar aqui muda os dois.
export const STATUS_COPY: Record<string, { title: string; orientation: string }> = {
  RECEBIDO: {
    title: "Recebemos seu equipamento",
    orientation: "Seu equipamento foi registrado e está sob os cuidados da equipe BMI TAG.",
  },
  EM_VERIFICACAO: {
    title: "Estamos analisando seu equipamento",
    orientation: "A equipe técnica está verificando o que precisa ser feito.",
  },
  VERIFICADO: {
    title: "Análise concluída",
    orientation: "Estamos preparando as informações do serviço.",
  },
  AGUARDANDO_APROVACAO: {
    title: "O orçamento aguarda sua resposta",
    orientation: "Para responder ou esclarecer dúvidas, fale com a equipe BMI TAG pelo canal em que recebeu o orçamento.",
  },
  APROVADO: {
    title: "Orçamento aprovado",
    orientation: "Nossa equipe está organizando os próximos passos do serviço.",
  },
  REPROVADO: {
    title: "Orçamento não aprovado",
    orientation: "Fale com a equipe BMI TAG para combinar os próximos passos.",
  },
  EM_MANUTENCAO: {
    title: "Serviço em andamento",
    orientation: "Nossa equipe está trabalhando no equipamento.",
  },
  AGUARDANDO_PECA: {
    title: "Aguardando peça",
    orientation: "O serviço depende da chegada de uma peça. Avisaremos quando houver atualização.",
  },
  PRONTO: {
    title: "Pronto para retirada",
    orientation: "Seu equipamento está pronto. Fale com a equipe BMI TAG para combinar a retirada.",
  },
  ENTREGUE: {
    title: "Equipamento entregue",
    orientation: "Este atendimento foi concluído.",
  },
  ORCAMENTO_VENCIDO: {
    title: "O prazo do orçamento terminou",
    orientation: "Fale com a equipe BMI TAG para verificar as opções de atendimento.",
  },
  ABANDONADO: {
    title: "Atendimento encerrado",
    orientation: "Fale com a equipe BMI TAG se precisar de esclarecimentos.",
  },
};

export const STATUS_COPY_FALLBACK = {
  title: "Acompanhe o atendimento",
  orientation: "Fale com a equipe BMI TAG para receber mais informações.",
};
