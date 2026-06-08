/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/db.ts — Camada de Acesso a Dados (Bridge Tauri)        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Ponte entre o frontend React e o backend Rust via Tauri.   ║
 * ║  Cada método chama invoke() que executa o comando Rust      ║
 * ║  correspondente registrado em src-tauri/src/commands.rs.    ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - @tauri-apps/api/core (invoke)                             ║
 * ║  - types/index.ts (interfaces Equipamento, Cliente, etc.)   ║
 * ║                                                              ║
 * ║  USADO POR (camada de dados central):                        ║
 * ║  - hooks/useEquipamentos.ts → CRUD de equipamentos          ║
 * ║  - hooks/useClientes.ts → CRUD de clientes                  ║
 * ║  - hooks/useInsumos.ts → CRUD de produtos/estoque           ║
 * ║  - hooks/useStatusEquipamento.ts → transições de status     ║
 * ║  - lib/whatsapp-service.ts → registra comunicações          ║
 * ║  - lib/email-service.ts → registra comunicações             ║
 * ║  - pages/Equipamentos.tsx → busca direta de verificações    ║
 * ║  - components/ClienteSelector.tsx → busca/cria clientes     ║
 * ║  - components/HistoricoComunicacoes.tsx → lista comunicações║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  Equipamento,
  EquipamentoImagem,
  EquipamentoImagemInput,
  Cliente,
  Produto,
  ServicoCatalogo,
  GastoFixo,
  GastoVariavel,
  GastoVariavelInput,
  GastoResumoMensal,
  Verificacao,
  Comunicacao,
  DatabaseSchemaStatus,
  LocalSupportBundleResult,
  LocalSupportStatus,
  PostgresBackupResult,
  PostgresRestoreResult,
  PostgresBackupToolsStatus,
} from "@/types";

/** Payload esperado pelo Rust em `criar_cliente` / `atualizar_cliente` (parâmetro `input`). */
function clientePersistenciaParaInput(cliente: Omit<Cliente, "id">) {
  return {
    nome: cliente.nome ?? undefined,
    tipo_pessoa: cliente.tipo_pessoa ?? undefined,
    documento: cliente.documento ?? undefined,
    razao_social: cliente.razao_social ?? undefined,
    nome_fantasia: cliente.nome_fantasia ?? undefined,
    inscricao_estadual: cliente.inscricao_estadual ?? undefined,
    cpf_cnpj: cliente.cpf_cnpj ?? undefined,
    telefone: (cliente.telefone ?? "").trim(),
    telefone_secundario: cliente.telefone_secundario ?? undefined,
    email: cliente.email ?? undefined,
    cep: cliente.cep ?? undefined,
    endereco: cliente.endereco ?? undefined,
    numero: cliente.numero ?? undefined,
    complemento: cliente.complemento ?? undefined,
    bairro: cliente.bairro ?? undefined,
    cidade: cliente.cidade ?? undefined,
    uf: cliente.uf ?? undefined,
    receber_email: cliente.receber_email ?? true,
    receber_whatsapp: cliente.receber_whatsapp ?? true,
    observacoes: cliente.observacoes ?? undefined,
    atualizado_em: cliente.atualizado_em ?? undefined,
  };
}

export const db = {
  // ─── Equipamentos ─────────────────────────────────────

  /** Lista equipamentos com filtro opcional de busca e status → Rust: listar_equipamentos */
  async listarEquipamentos(busca?: string, status?: string): Promise<Equipamento[]> {
    return invoke<Equipamento[]>("listar_equipamentos", { busca, status });
  },

  /** Busca equipamento por ID → Rust: buscar_equipamento */
  async buscarEquipamento(id: number): Promise<Equipamento> {
    return invoke<Equipamento>("buscar_equipamento", { id });
  },

  /** Cria novo equipamento → Rust: criar_equipamento. Retorna o registro persistido */
  async criarEquipamento(equipamento: Omit<Equipamento, "id">): Promise<Equipamento> {
    return invoke<Equipamento>("criar_equipamento", { input: equipamento });
  },

  /** Atualiza equipamento existente → Rust: atualizar_equipamento */
  async atualizarEquipamento(id: number, equipamento: Omit<Equipamento, "id">): Promise<Equipamento> {
    return invoke<Equipamento>("atualizar_equipamento", { id, input: equipamento });
  },

  /** Deleta equipamento → Rust: deletar_equipamento */
  async deletarEquipamento(id: number): Promise<void> {
    return invoke<void>("deletar_equipamento", { id });
  },

  /**
   * Atualiza status + campos extras do equipamento → Rust: atualizar_status_equipamento.
   * O Rust grava automaticamente a data correspondente ao status (data_verificacao, data_aprovacao, etc).
   */
  async atualizarStatusEquipamento(
    id: number,
    novoStatus: string,
    valorOrcamento?: number,
    prazoAprovacao?: string,
    valorFinal?: number,
    expectedUpdatedEm?: string
  ): Promise<void> {
    return invoke<void>("atualizar_status_equipamento", {
      id,
      novoStatus,
      valorOrcamento: valorOrcamento ?? null,
      prazoAprovacao: prazoAprovacao ?? null,
      valorFinal: valorFinal ?? null,
      expectedUpdatedEm: expectedUpdatedEm ?? null,
    });
  },

  // ─── Clientes ─────────────────────────────────────────

  /** Lista clientes com busca por nome/CPF/CNPJ/telefone/email → Rust: listar_clientes */
  async listarClientes(busca?: string): Promise<Cliente[]> {
    return invoke<Cliente[]>("listar_clientes", { busca: busca ?? null });
  },

  /** Busca cliente por ID → Rust: buscar_cliente */
  async buscarCliente(id: number): Promise<Cliente> {
    return invoke<Cliente>("buscar_cliente", { id });
  },

  /** Cria novo cliente (PF ou PJ) → Rust: criar_cliente. Retorna o registro persistido */
  async criarCliente(cliente: Omit<Cliente, "id">): Promise<Cliente> {
    return invoke<Cliente>("criar_cliente", { input: clientePersistenciaParaInput(cliente) });
  },

  /** Atualiza cliente existente → Rust: atualizar_cliente */
  async atualizarCliente(id: number, cliente: Omit<Cliente, "id">): Promise<void> {
    return invoke<void>("atualizar_cliente", { id, input: clientePersistenciaParaInput(cliente) });
  },

  /** Deleta cliente → Rust: deletar_cliente */
  async deletarCliente(id: number): Promise<void> {
    return invoke<void>("deletar_cliente", { id });
  },

  // ─── Verificações ─────────────────────────────────────

  /** Salva resultado da verificação técnica → Rust: salvar_verificacao_tecnica */
  async salvarVerificacao(verificacao: Omit<Verificacao, "id">): Promise<number> {
    return invoke<number>("salvar_verificacao_tecnica", { input: verificacao });
  },

  /** Busca última verificação de um equipamento → Rust: buscar_verificacao_tecnica */
  async buscarVerificacao(equipamentoId: number): Promise<Verificacao | null> {
    return invoke<Verificacao | null>("buscar_verificacao_tecnica", { equipamentoId });
  },

  /** Lista imagens vinculadas a um equipamento → Rust: listar_imagens_equipamento */
  async listarImagensEquipamento(equipamentoId: number): Promise<EquipamentoImagem[]> {
    return invoke<EquipamentoImagem[]>("listar_imagens_equipamento", { equipamentoId });
  },

  /** Substitui integralmente o conjunto de imagens de um equipamento */
  async substituirImagensEquipamento(
    equipamentoId: number,
    imagens: EquipamentoImagemInput[]
  ): Promise<EquipamentoImagem[]> {
    return invoke<EquipamentoImagem[]>("substituir_imagens_equipamento", {
      equipamentoId,
      imagens,
    });
  },

  /** Adiciona uma única imagem ao equipamento → Rust: adicionar_imagem_equipamento */
  async adicionarImagemEquipamento(
    equipamentoId: number,
    imagem: EquipamentoImagemInput
  ): Promise<EquipamentoImagem> {
    return invoke<EquipamentoImagem>("adicionar_imagem_equipamento", {
      equipamentoId,
      imagem,
    });
  },

  // ─── Comunicações ─────────────────────────────────────

  /** Registra envio de comunicação (WhatsApp/Email) → Rust: registrar_comunicacao */
  async registrarComunicacao(comunicacao: Omit<Comunicacao, "id">): Promise<Comunicacao> {
    return invoke<Comunicacao>("registrar_comunicacao", { input: comunicacao });
  },

  /** Lista comunicações de um equipamento (ordenadas por data DESC) → Rust: listar_comunicacoes */
  async listarComunicacoes(equipamentoId: number): Promise<Comunicacao[]> {
    return invoke<Comunicacao[]>("listar_comunicacoes", { equipamentoId });
  },

  // ─── Produtos ─────────────────────────────────────────

  /** Lista produtos com filtro de busca, categoria e estoque baixo → Rust: listar_produtos */
  async listarProdutos(
    busca?: string,
    categoria?: string,
    apenasEstoqueBaixo?: boolean
  ): Promise<Produto[]> {
    return invoke<Produto[]>("listar_produtos", {
      busca: busca ?? null,
      categoria: categoria ?? null,
      apenasEstoqueBaixo: apenasEstoqueBaixo || false,
    });
  },

  /** Cria novo produto → Rust: criar_produto */
  async criarProduto(produto: Omit<Produto, "id">): Promise<number> {
    return invoke<number>("criar_produto", { produto });
  },

  /** Atualiza produto → Rust: atualizar_produto */
  async atualizarProduto(id: number, produto: Omit<Produto, "id">): Promise<void> {
    return invoke<void>("atualizar_produto", { id, produto });
  },

  /** Soft delete de produto (ativo = 0) → Rust: deletar_produto */
  async deletarProduto(id: number): Promise<void> {
    return invoke<void>("deletar_produto", { id });
  },

  /**
   * Registra movimentação de estoque (ENTRADA/SAIDA) → Rust: registrar_movimentacao_estoque.
   * O Rust automaticamente atualiza quantidade_estoque do produto.
   */
  async registrarMovimentacao(
    produtoId: number,
    tipo: string,
    quantidade: number,
    origem: string,
    referencia?: string
  ): Promise<void> {
    return invoke<void>("registrar_movimentacao_estoque", {
      input: {
        produto_id: produtoId,
        tipo,
        quantidade,
        origem,
        referencia: referencia ?? null,
      },
    });
  },

  // ─── Serviços de Catálogo ─────────────────────────────

  /** Lista serviços padrão com busca opcional. */
  async listarServicos(busca?: string, apenasAtivos = true): Promise<ServicoCatalogo[]> {
    return invoke<ServicoCatalogo[]>("listar_servicos", {
      busca: busca ?? null,
      apenasAtivos,
    });
  },

  /** Busca serviço por ID. */
  async buscarServico(id: number): Promise<ServicoCatalogo> {
    return invoke<ServicoCatalogo>("buscar_servico", { id });
  },

  /** Cria novo serviço de catálogo. */
  async criarServico(servico: Omit<ServicoCatalogo, "id">): Promise<ServicoCatalogo> {
    return invoke<ServicoCatalogo>("criar_servico", { input: servico });
  },

  /** Atualiza serviço de catálogo existente. */
  async atualizarServico(id: number, servico: Omit<ServicoCatalogo, "id">): Promise<ServicoCatalogo> {
    return invoke<ServicoCatalogo>("atualizar_servico", { id, input: servico });
  },

  /** Desativa serviço de catálogo. */
  async deletarServico(id: number): Promise<void> {
    return invoke<void>("deletar_servico", { id });
  },

  // ─── Gastos Fixos e Variáveis ───────────────────────────

  /** Lista todos os gastos fixos ativos → Rust: listar_gastos_fixos */
  async listarGastosFixos(): Promise<GastoFixo[]> {
    return invoke<GastoFixo[]>("listar_gastos_fixos");
  },

  /** Cria novo gasto fixo → Rust: criar_gasto_fixo. Retorna o registro persistido */
  async criarGastoFixo(input: Omit<GastoFixo, "id">): Promise<GastoFixo> {
    return invoke<GastoFixo>("criar_gasto_fixo", { input });
  },

  /** Atualiza gasto fixo existente → Rust: atualizar_gasto_fixo */
  async atualizarGastoFixo(id: number, input: Omit<GastoFixo, "id">): Promise<GastoFixo> {
    return invoke<GastoFixo>("atualizar_gasto_fixo", { id, input });
  },

  /** Lista gastos variáveis de um mês/ano → Rust: listar_gastos_variaveis */
  async listarGastosVariaveis(mes: number, ano: number): Promise<GastoVariavel[]> {
    return invoke<GastoVariavel[]>("listar_gastos_variaveis", { mes, ano });
  },

  /** Cria novo gasto variável → Rust: criar_gasto_variavel. Retorna o registro persistido */
  async criarGastoVariavel(input: GastoVariavelInput): Promise<GastoVariavel> {
    return invoke<GastoVariavel>("criar_gasto_variavel", { input });
  },

  /** Resumo mensal de gastos (fixos + variáveis + por categoria) → Rust: resumo_mensal */
  async resumoMensal(mes: number, ano: number): Promise<GastoResumoMensal> {
    return invoke<GastoResumoMensal>("resumo_mensal", { mes, ano });
  },

  /** Consulta a versão do schema e as migrações conhecidas/aplicadas → Rust: obter_status_schema_banco */
  async obterStatusSchemaBanco(): Promise<DatabaseSchemaStatus> {
    return invoke<DatabaseSchemaStatus>("obter_status_schema_banco");
  },

  /** Consulta se pg_dump/pg_restore/psql estão disponíveis e onde o app gravará os backups */
  async obterStatusFerramentasBackupPostgres(): Promise<PostgresBackupToolsStatus> {
    return invoke<PostgresBackupToolsStatus>("obter_status_ferramentas_backup_postgres");
  },

  /** Gera um backup .dump do PostgreSQL usando pg_dump */
  async gerarBackupPostgres(): Promise<PostgresBackupResult> {
    return invoke<PostgresBackupResult>("gerar_backup_postgres");
  },

  /** Restaura um backup PostgreSQL .dump ou .sql */
  async restaurarBackupPostgres(filePath: string): Promise<PostgresRestoreResult> {
    return invoke<PostgresRestoreResult>("restaurar_backup_postgres", { filePath });
  },

  /** Consulta o snapshot local mínimo de suporte/observabilidade */
  async obterDiagnosticoSuporteLocal(): Promise<LocalSupportStatus> {
    return invoke<LocalSupportStatus>("obter_diagnostico_suporte_local");
  },

  /** Exporta um pacote JSON com diagnóstico local para suporte */
  async exportarPacoteSuporteLocal(): Promise<LocalSupportBundleResult> {
    return invoke<LocalSupportBundleResult>("exportar_pacote_suporte_local");
  },

  /** Gera QR code com token de upload para foto via dispositivo móvel → Rust: gerar_qr_upload */
  async gerarQrUpload(
    equipamentoId: number,
    categoria: string,
    port: number,
  ): Promise<{ qr_svg: string; url: string; token: string }> {
    return invoke<{ qr_svg: string; url: string; token: string }>("gerar_qr_upload", {
      equipamentoId,
      categoria,
      port,
    });
  },

  /** Inicia o servidor HTTP local para recebimento de fotos via celular → Rust: start_photo_server */
  async startPhotoServer(port: number): Promise<string> {
    return invoke<string>("start_photo_server", { port });
  },

  /** Para o servidor HTTP local de fotos → Rust: stop_photo_server */
  async stopPhotoServer(): Promise<void> {
    return invoke<void>("stop_photo_server");
  },

  // ─── Arquivo Temporário ────────────────────────────────

  /**
   * Salva bytes em arquivo temporário e abre com app padrão → Rust: salvar_arquivo_temp.
   * Usado pelo DocxService para gerar e abrir orçamentos DOCX.
   * @returns Caminho absoluto do arquivo salvo
   */
  async salvarArquivoTemp(bytes: number[], filename: string): Promise<string> {
    return invoke<string>("salvar_arquivo_temp", { bytes, filename });
  },

  /**
   * Copia um arquivo já gerado pelo app para o diretório temporário do AutoOS,
   * de forma que ele possa ser anexado em emails (apenas anexos vindos do
   * diretório temporário são aceitos pelo backend SMTP).
   * @returns Caminho absoluto do arquivo no diretório temporário.
   */
  async copiarAnexoEmailParaTemp(origem: string, filename: string): Promise<string> {
    return invoke<string>("copiar_anexo_email_para_temp", { origem, filename });
  },

  /**
   * Remove um anexo previamente salvo no diretório temporário do AutoOS,
   * tipicamente após o envio do email.
   */
  async removerAnexoEmailTemp(path: string): Promise<void> {
    await invoke<void>("remover_anexo_email_temp", { path });
  },
};
