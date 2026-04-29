//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/types.rs — Structs de Entrada e Saída              ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Define todas as structs usadas pelos comandos Tauri:        ║
//! ║  - Input structs (Deserialize) — recebidas do frontend       ║
//! ║  - Output structs (FromRow + Serialize) — enviadas ao frontend║
//! ║  - SQL SELECT constants para cada entidade                   ║
//! ╚══════════════════════════════════════════════════════════════╝

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

// ═══════════════════════════════════════════════════════════
// Structs de Entrada (Deserialize — recebidas do frontend)
// ═══════════════════════════════════════════════════════════

/// Input para criar/atualizar equipamento.
/// Espelha `Omit<Equipamento, "id">` do frontend (types/index.ts).
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct EquipamentoInput {
    pub serial_number: String,
    pub patrimonio: Option<String>,
    pub marca: String,
    pub modelo: String,
    pub tipo: String,
    pub status: String,
    pub defeito_relatado: Option<String>,
    pub acessorios: Option<String>,
    pub acessorios_outros: Option<String>,
    pub paginas_impressas: Option<i32>,
    pub tecnologia: Option<String>,
    pub conectividade: Option<String>,
    pub data_entrada: String,
    pub proprietario: Option<String>,
    pub preco_compra: Option<f64>,
    pub preco_venda: Option<f64>,
    pub observacoes: Option<String>,
    pub cliente_id: Option<i32>,
    pub cliente_nome: Option<String>,
    pub cliente_telefone: Option<String>,
    pub cliente_email: Option<String>,
    pub prazo_aprovacao: Option<String>,
    pub valor_orcamento: Option<f64>,
    pub atualizado_em: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(default)]
pub struct EquipamentoImagemInput {
    pub categoria: String,
    pub filename: String,
    pub mime_type: String,
    pub tamanho_bytes: Option<i32>,
    pub largura: Option<i32>,
    pub altura: Option<i32>,
    pub ordem: Option<i32>,
    pub observacao: Option<String>,
    pub bytes: Vec<u8>,
}

/// Input para criar/atualizar cliente (PF ou PJ).
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct ClienteInput {
    pub nome: Option<String>,
    pub tipo_pessoa: Option<String>,
    pub documento: Option<String>,
    pub razao_social: Option<String>,
    pub nome_fantasia: Option<String>,
    pub inscricao_estadual: Option<String>,
    pub cpf_cnpj: Option<String>,
    pub telefone: String,
    pub telefone_secundario: Option<String>,
    pub email: Option<String>,
    pub cep: Option<String>,
    pub endereco: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: Option<String>,
    pub uf: Option<String>,
    pub receber_email: Option<bool>,
    pub receber_whatsapp: Option<bool>,
    pub observacoes: Option<String>,
    pub atualizado_em: Option<String>,
}

/// Input para criar/atualizar produto de estoque.
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct ProdutoInput {
    pub codigo: String,
    pub nome: String,
    pub descricao: Option<String>,
    pub categoria: String,
    pub quantidade_estoque: i32,
    pub quantidade_minima: Option<i32>,
    pub quantidade_maxima: Option<i32>,
    pub unidade_medida: Option<String>,
    pub localizacao: Option<String>,
    pub preco_custo: f64,
    pub preco_venda: f64,
    pub margem_lucro: Option<f64>,
    pub marca_original: Option<String>,
    pub tipo_cartucho: Option<String>,
    pub cor: Option<String>,
    pub rendimento: Option<i32>,
    pub modelos_compativeis: Option<String>,
    pub fornecedor_principal: Option<String>,
    pub prazo_entrega: Option<i32>,
    pub atualizado_em: Option<String>,
}

/// Input para registrar movimentação de estoque.
#[derive(Debug, Deserialize)]
pub struct MovimentacaoEstoqueInput {
    pub produto_id: i32,
    pub tipo: String,
    pub quantidade: i32,
    pub origem: String,
    pub referencia: Option<String>,
}

/// Input para salvar verificação técnica.
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct VerificacaoInput {
    pub equipamento_id: i32,
    pub tecnico_nome: String,
    pub problema_relatado: String,
    pub diagnostico: Option<String>,
    pub itens_verificados: Option<String>,
    pub servicos_necessarios: Option<String>,
    pub pecas_necessarias: Option<String>,
    pub custo_estimado_mao_obra: Option<f64>,
    pub custo_estimado_pecas: Option<f64>,
    pub custo_total: Option<f64>,
    pub tempo_estimado: Option<i32>,
    pub concluida: Option<bool>,
    pub observacoes: Option<String>,
}

/// Input para registrar comunicação (email/WhatsApp).
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct ComunicacaoInput {
    pub equipamento_id: i32,
    pub tipo: String,
    pub canal: String,
    pub destinatario: String,
    pub contato: String,
    pub assunto: Option<String>,
    pub mensagem: String,
    pub anexos: Option<String>,
    pub enviado: Option<bool>,
    pub erro: Option<String>,
}

/// Input para configurar SMTP.
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct SmtpConfigInput {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub from_name: String,
    pub from_email: String,
    pub use_tls: bool,
    pub password: Option<String>,
}

/// Config SMTP retornada ao frontend (sem senha).
#[derive(Debug, Serialize)]
pub struct SmtpConfigResponse {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub from_name: String,
    pub from_email: String,
    pub use_tls: bool,
    pub has_password: bool,
}

/// Config SMTP armazenada no keyring (com senha).
#[derive(Debug, Serialize, Deserialize)]
pub struct SmtpConfigStored {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub from_name: String,
    pub from_email: String,
    pub use_tls: bool,
    pub password: String,
}

/// Anexo enviado por email.
#[derive(Debug, Deserialize)]
pub struct EmailAttachmentInput {
    pub filename: String,
    pub content_type: Option<String>,
    pub bytes: Option<Vec<u8>>,
    pub path: Option<String>,
}

/// Input para envio real de email.
#[derive(Debug, Deserialize)]
pub struct EmailSendInput {
    pub destinatario: String,
    pub email: String,
    pub assunto: String,
    pub corpo: String,
    pub corpo_texto: Option<String>,
    pub corpo_html: Option<String>,
    pub anexos: Option<Vec<EmailAttachmentInput>>,
}

/// Input para configurar o provider de WhatsApp.
#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct WhatsappConfigInput {
    pub provider: String,
    pub api_url: String,
    pub token: Option<String>,
}

/// Configuração de WhatsApp retornada ao frontend (sem token).
#[derive(Debug, Serialize)]
pub struct WhatsappConfigResponse {
    pub provider: String,
    pub api_url: String,
    pub has_token: bool,
}

/// Configuração de WhatsApp armazenada no keyring.
#[derive(Debug, Serialize, Deserialize)]
pub struct WhatsappConfigStored {
    pub provider: String,
    pub api_url: String,
    pub token: String,
}

/// Input para envio de mensagem de WhatsApp via provider HTTP.
#[derive(Debug, Deserialize)]
pub struct WhatsappSendInput {
    pub contato: String,
    pub mensagem: String,
}

// ═══════════════════════════════════════════════════════════
// Structs de Saída (FromRow + Serialize — enviadas ao frontend)
// ═══════════════════════════════════════════════════════════

/// Equipamento completo retornado ao frontend.
#[derive(Debug, Serialize, FromRow)]
pub struct EquipamentoRow {
    pub id: i32,
    pub serial_number: String,
    pub patrimonio: Option<String>,
    pub marca: String,
    pub modelo: String,
    pub tipo: String,
    pub status: Option<String>,
    pub defeito_relatado: Option<String>,
    pub acessorios: Option<String>,
    pub acessorios_outros: Option<String>,
    pub paginas_impressas: Option<i32>,
    pub tecnologia: Option<String>,
    pub conectividade: Option<String>,
    pub data_entrada: String,
    pub proprietario: Option<String>,
    pub preco_compra: Option<f64>,
    pub preco_venda: Option<f64>,
    pub observacoes: Option<String>,
    pub cliente_id: Option<i32>,
    pub cliente_nome: Option<String>,
    pub cliente_telefone: Option<String>,
    pub cliente_email: Option<String>,
    pub prazo_aprovacao: Option<String>,
    pub data_aprovacao: Option<String>,
    pub data_reprovacao: Option<String>,
    pub data_verificacao: Option<String>,
    pub data_pronto: Option<String>,
    pub data_saida: Option<String>,
    pub valor_orcamento: Option<f64>,
    pub valor_final: Option<f64>,
    pub criado_em: Option<String>,
    pub atualizado_em: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct EquipamentoImagemRow {
    pub id: i32,
    pub equipamento_id: i32,
    pub categoria: String,
    pub filename: String,
    pub mime_type: String,
    pub tamanho_bytes: i32,
    pub largura: Option<i32>,
    pub altura: Option<i32>,
    pub ordem: i32,
    pub observacao: Option<String>,
    pub bytes: Vec<u8>,
    pub criado_em: Option<String>,
    pub atualizado_em: Option<String>,
}

/// Cliente completo retornado ao frontend (PF/PJ).
#[derive(Debug, Serialize, FromRow)]
pub struct ClienteRow {
    pub id: i32,
    pub nome: Option<String>,
    pub tipo_pessoa: Option<String>,
    pub documento: Option<String>,
    pub razao_social: Option<String>,
    pub nome_fantasia: Option<String>,
    pub inscricao_estadual: Option<String>,
    pub cpf_cnpj: Option<String>,
    pub telefone: String,
    pub telefone_secundario: Option<String>,
    pub email: Option<String>,
    pub cep: Option<String>,
    pub endereco: Option<String>,
    pub numero: Option<String>,
    pub complemento: Option<String>,
    pub bairro: Option<String>,
    pub cidade: Option<String>,
    pub uf: Option<String>,
    pub receber_email: Option<bool>,
    pub receber_whatsapp: Option<bool>,
    pub observacoes: Option<String>,
    pub ativo: Option<bool>,
    pub criado_em: Option<String>,
    pub atualizado_em: Option<String>,
}

/// Produto completo retornado ao frontend.
#[derive(Debug, Serialize, FromRow)]
pub struct ProdutoRow {
    pub id: i32,
    pub codigo: String,
    pub nome: String,
    pub descricao: Option<String>,
    pub categoria: String,
    pub quantidade_estoque: Option<i32>,
    pub quantidade_minima: Option<i32>,
    pub quantidade_maxima: Option<i32>,
    pub unidade_medida: Option<String>,
    pub localizacao: Option<String>,
    pub preco_custo: Option<f64>,
    pub preco_venda: Option<f64>,
    pub margem_lucro: Option<f64>,
    pub marca_original: Option<String>,
    pub tipo_cartucho: Option<String>,
    pub cor: Option<String>,
    pub rendimento: Option<i32>,
    pub modelos_compativeis: Option<String>,
    pub fornecedor_principal: Option<String>,
    pub prazo_entrega: Option<i32>,
    pub ativo: Option<bool>,
    pub criado_em: Option<String>,
    pub atualizado_em: Option<String>,
}

/// Verificação técnica completa retornada ao frontend.
#[derive(Debug, Serialize, FromRow)]
pub struct VerificacaoRow {
    pub id: i32,
    pub equipamento_id: i32,
    pub tecnico_nome: String,
    pub data_inicio: Option<String>,
    pub data_fim: Option<String>,
    pub problema_relatado: String,
    pub diagnostico: Option<String>,
    pub itens_verificados: Option<String>,
    pub servicos_necessarios: Option<String>,
    pub pecas_necessarias: Option<String>,
    pub custo_estimado_mao_obra: Option<f64>,
    pub custo_estimado_pecas: Option<f64>,
    pub custo_total: Option<f64>,
    pub tempo_estimado: Option<i32>,
    pub concluida: Option<bool>,
    pub observacoes: Option<String>,
}

/// Comunicação completa retornada ao frontend.
#[derive(Debug, Serialize, FromRow)]
pub struct ComunicacaoRow {
    pub id: i32,
    pub equipamento_id: i32,
    pub tipo: String,
    pub canal: String,
    pub destinatario: String,
    pub contato: String,
    pub assunto: Option<String>,
    pub mensagem: String,
    pub anexos: Option<String>,
    pub enviado: Option<bool>,
    pub data_envio: Option<String>,
    pub erro: Option<String>,
    pub criado_em: Option<String>,
}

// ═══════════════════════════════════════════════════════════
// SQL SELECT base para cada entidade (com casts de tipo)
// ═══════════════════════════════════════════════════════════

pub const EQUIPAMENTO_SELECT: &str = "
    SELECT id, serial_number, patrimonio, marca, modelo, tipo, status,
           defeito_relatado, acessorios, acessorios_outros,
           paginas_impressas, tecnologia, conectividade, data_entrada, proprietario,
           preco_compra::FLOAT8 as preco_compra, preco_venda::FLOAT8 as preco_venda,
           observacoes, cliente_id, cliente_nome, cliente_telefone, cliente_email,
           prazo_aprovacao, data_aprovacao, data_reprovacao, data_verificacao,
           data_pronto, data_saida,
           valor_orcamento::FLOAT8 as valor_orcamento, valor_final::FLOAT8 as valor_final,
           criado_em::TEXT as criado_em, atualizado_em::TEXT as atualizado_em
    FROM equipamentos";

    pub const EQUIPAMENTO_IMAGEM_SELECT: &str = "
        SELECT id, equipamento_id, categoria, filename, mime_type,
            tamanho_bytes, largura, altura, ordem, observacao, bytes,
            criado_em::TEXT as criado_em, atualizado_em::TEXT as atualizado_em
        FROM equipamento_imagens";

pub const CLIENTE_SELECT: &str = "
    SELECT id, nome, tipo_pessoa, documento, razao_social, nome_fantasia,
           inscricao_estadual, cpf_cnpj, telefone, telefone_secundario, email,
           cep, endereco, numero, complemento, bairro, cidade, uf,
           receber_email, receber_whatsapp, observacoes, ativo,
           criado_em::TEXT as criado_em, atualizado_em::TEXT as atualizado_em
    FROM clientes";

pub const PRODUTO_SELECT: &str = "
    SELECT id, codigo, nome, descricao, categoria,
           quantidade_estoque, quantidade_minima, quantidade_maxima,
           unidade_medida, localizacao,
           preco_custo::FLOAT8 as preco_custo, preco_venda::FLOAT8 as preco_venda,
           margem_lucro::FLOAT8 as margem_lucro,
           marca_original, tipo_cartucho, cor, rendimento, modelos_compativeis,
           fornecedor_principal, prazo_entrega, ativo,
           criado_em::TEXT as criado_em, atualizado_em::TEXT as atualizado_em
    FROM produtos";

pub const VERIFICACAO_SELECT: &str = "
    SELECT id, equipamento_id, tecnico_nome,
           data_inicio::TEXT as data_inicio, data_fim::TEXT as data_fim,
           problema_relatado, diagnostico,
           itens_verificados, servicos_necessarios, pecas_necessarias,
           custo_estimado_mao_obra::FLOAT8 as custo_estimado_mao_obra,
           custo_estimado_pecas::FLOAT8 as custo_estimado_pecas,
           custo_total::FLOAT8 as custo_total,
           tempo_estimado, concluida, observacoes
    FROM verificacoes";

pub const COMUNICACAO_SELECT: &str = "
    SELECT id, equipamento_id, tipo, canal, destinatario, contato,
           assunto, mensagem, anexos, enviado,
           data_envio::TEXT as data_envio, erro,
           criado_em::TEXT as criado_em
    FROM comunicacoes";
