//! ╔══════════════════════════════════════════════════════════════╗
//! ║  db.rs — Inicialização do Banco PostgreSQL e Migrações     ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Conecta ao PostgreSQL e valida o schema sem alterá-lo.     ║
//! ║  Migrações são responsabilidade exclusiva do pipeline.      ║
//! ║                                                              ║
//! ║  TABELAS:                                                    ║
//! ║  1. clientes — PF/PJ com endereço completo                  ║
//! ║  2. equipamentos — impressoras em manutenção (FK → clientes)║
//! ║  3. produtos — estoque de insumos (toners, peças)           ║
//! ║  4. movimentacoes_estoque — log de entrada/saída (FK → prod)║
//! ║  5. verificacoes — diagnóstico técnico (FK → equipamentos)  ║
//! ║  6. comunicacoes — log de WhatsApp/Email (FK → equipamentos)║
//! ║                                                              ║
//! ║  DEPENDE DE: sqlx com PostgreSQL                             ║
//! ║  USADO POR: main.rs (init_database no setup)                ║
//! ╚══════════════════════════════════════════════════════════════╝

use crate::commands::util::{local_app_data_dir, DatabaseConnectionConfig, DATABASE_CONFIG_FILE};
use sqlx::{
    migrate::Migrator,
    postgres::{PgConnection, PgPool, PgPoolOptions},
    Connection,
};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::warn;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, Clone)]
pub struct KnownMigration {
    pub version: i64,
    pub description: String,
}

static POOL: Mutex<Option<PgPool>> = Mutex::new(None);
static INIT_ERROR: Mutex<Option<DatabaseInitError>> = Mutex::new(None);

/// Causa da falha de inicialização, para a tela de fallback decidir entre o
/// formulário de configuração e a tela de reconexão.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseErrorKind {
    /// Nenhuma URL encontrada na cadeia de resolução.
    NaoConfigurado,
    /// URL presente, mas inválida ou apontando para banco inexistente.
    ConfiguracaoInvalida,
    /// Usuário ou senha recusados.
    Credencial,
    /// Banco alcançado, mas incompatível com este AutoOS.
    Incompativel,
    /// Rede, DNS, TLS ou timeout: costuma passar sozinho.
    Rede,
    /// Limite de conexões do servidor atingido.
    Capacidade,
    Desconhecido,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DatabaseInitError {
    pub tipo: DatabaseErrorKind,
    pub mensagem: String,
}

const DATABASE_ACQUIRE_TIMEOUT: Duration = Duration::from_secs(6);
const DATABASE_SCHEMA_TIMEOUT: Duration = Duration::from_secs(6);
// 7 PCs × 4 + 2 = 30, abaixo do Pool Size 35 do Supavisor Session.
const DATABASE_MAX_CONNECTIONS: u32 = 4;
const DATABASE_CAPACITY_DIAGNOSTIC_TIMEOUT: Duration = Duration::from_secs(2);
const DATABASE_CAPACITY_BACKOFF: Duration = Duration::from_secs(30);
const STARTUP_CONNECT_ATTEMPTS: usize = 2;
const STARTUP_RETRY_DELAY: Duration = Duration::from_millis(750);
const DATABASE_ACCESS_LIMIT_ERROR: &str = "SQLSTATE 53300: too many clients";

static LAST_DATABASE_CAPACITY_ERROR: Mutex<Option<Instant>> = Mutex::new(None);

/// Single-flight: no máximo uma inicialização/troca de pool por vez. Chamadas
/// concorrentes esperam e reaproveitam o pool já criado em vez de abrir outro.
static INIT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
/// Serializa o diagnóstico de capacidade (uma conexão extra por vez).
static DIAGNOSTIC_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LAST_DIAGNOSTIC: Mutex<Option<Instant>> = Mutex::new(None);
const DIAGNOSTIC_MIN_INTERVAL: Duration = Duration::from_secs(5);
const STARTUP_RETRY_MAX_DELAY: Duration = Duration::from_secs(10);

/// Espera exponencial (base × 2^(tentativa-1)) com teto. `attempt` começa em 1.
pub(crate) fn retry_backoff_delay(attempt: u32, base: Duration, cap: Duration) -> Duration {
    let shift = attempt.saturating_sub(1).min(16);
    base.saturating_mul(1u32 << shift).min(cap)
}

fn diagnostic_allowed(last: Option<Instant>, now: Instant, min_interval: Duration) -> bool {
    last.map_or(true, |at| now.saturating_duration_since(at) >= min_interval)
}

/// Devolve o valor guardado em `slot` se ainda utilizável; senão cria um único
/// valor com `create`, mesmo com chamadas concorrentes.
async fn get_or_create_single_flight<T, E, F, Fut>(
    lock: &tokio::sync::Mutex<()>,
    slot: &Mutex<Option<T>>,
    is_usable: impl Fn(&T) -> bool,
    create: F,
) -> Result<T, E>
where
    T: Clone,
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
{
    let _guard = lock.lock().await;
    if let Some(existing) = slot.lock().ok().and_then(|g| g.clone()) {
        if is_usable(&existing) {
            return Ok(existing);
        }
    }
    create().await
}

pub async fn get_pool() -> Result<PgPool, String> {
    let guard = POOL
        .lock()
        .map_err(|e| format!("Lock do pool corrompido: {}", e))?;
    guard.clone().ok_or_else(|| {
        let err_guard = INIT_ERROR
            .lock()
            .unwrap_or_else(|e| panic!("Lock de erro corrompido: {}", e));
        err_guard
            .as_ref()
            .map(|init_error| init_error.mensagem.clone())
            .unwrap_or_else(|| "Pool de conexões não inicializado".to_string())
    })
}

pub fn is_database_initialized() -> bool {
    POOL.lock().map(|g| g.is_some()).unwrap_or(false)
}

pub fn database_init_error() -> Option<DatabaseInitError> {
    INIT_ERROR.lock().ok().and_then(|g| g.clone())
}

/// Maior que o `DATABASE_ACQUIRE_TIMEOUT`: o pool precisa desistir primeiro, com
/// `PoolTimedOut`, para a lotação do servidor (53300) poder ser confirmada.
const DATABASE_HEALTH_TIMEOUT: Duration = Duration::from_secs(10);

fn init_error_from(error: &sqlx::Error) -> DatabaseInitError {
    DatabaseInitError {
        tipo: database_error_kind(error),
        mensagem: database_error_message(error),
    }
}

fn health_timeout_error() -> sqlx::Error {
    sqlx::Error::Io(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        format!("a checagem de conexão excedeu {} segundos.", DATABASE_HEALTH_TIMEOUT.as_secs()),
    ))
}

/// Checagem rápida com o app já aberto: um `SELECT 1` no pool atual. `None`
/// quando o banco respondeu. Não recria o pool; o sqlx reabre conexões
/// sozinho quando a rede volta.
pub async fn check_database_health() -> Option<DatabaseInitError> {
    let Some(pool) = POOL.lock().ok().and_then(|guard| guard.clone()) else {
        return Some(database_init_error().unwrap_or(DatabaseInitError {
            tipo: DatabaseErrorKind::Desconhecido,
            mensagem: "Pool de conexões não inicializado.".to_string(),
        }));
    };
    let result = tokio::time::timeout(DATABASE_HEALTH_TIMEOUT, sqlx::query("SELECT 1").execute(&pool)).await;
    match result {
        Ok(Ok(_)) => None,
        Ok(Err(sqlx::Error::PoolTimedOut)) => Some(pool_timeout_health_error().await),
        Ok(Err(error)) => Some(init_error_from(&error)),
        Err(_) => Some(init_error_from(&health_timeout_error())),
    }
}

/// O sqlx repete o 53300 até o acquire estourar e devolve `PoolTimedOut`.
/// `database_operation_error` confirma a lotação com uma conexão de
/// diagnóstico; sem confirmação, segue como rede.
async fn pool_timeout_health_error() -> DatabaseInitError {
    let mensagem = database_operation_error(sqlx::Error::PoolTimedOut).await;
    health_error_after_pool_timeout(mensagem)
}

fn health_error_after_pool_timeout(mensagem: String) -> DatabaseInitError {
    let tipo = if mensagem == DATABASE_ACCESS_LIMIT_ERROR {
        DatabaseErrorKind::Capacidade
    } else {
        DatabaseErrorKind::Rede
    };
    DatabaseInitError { tipo, mensagem }
}

fn is_database_capacity_error(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(database_error) => {
            let code = database_error.code();
            if code.as_deref() == Some("53300") {
                return true;
            }

            let message = database_error.message().to_ascii_lowercase();
            message.contains("emaxconnsession")
                || message.contains("maxclientsinsessionmode")
                || message.contains("max clients reached")
                || message.contains("too many clients")
        }
        _ => false,
    }
}

fn note_database_capacity_error() {
    if let Ok(mut last_error) = LAST_DATABASE_CAPACITY_ERROR.lock() {
        *last_error = Some(Instant::now());
    }
}

fn clear_database_capacity_error() {
    if let Ok(mut last_error) = LAST_DATABASE_CAPACITY_ERROR.lock() {
        *last_error = None;
    }
}

fn database_capacity_backoff_active() -> bool {
    LAST_DATABASE_CAPACITY_ERROR
        .lock()
        .ok()
        .and_then(|last_error| *last_error)
        .is_some_and(|last_error| last_error.elapsed() < DATABASE_CAPACITY_BACKOFF)
}

fn database_capacity_error_message() -> String {
    note_database_capacity_error();
    DATABASE_ACCESS_LIMIT_ERROR.to_string()
}

pub fn clear_database_init_error() {
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = None;
    }
}

/// Grava o erro da abertura (ou do "Tentar novamente"). `PoolTimedOut` passa
/// pela mesma confirmação de lotação da checagem de saúde, para a tela
/// respeitar a espera de 30 s quando o servidor está cheio.
async fn record_database_init_error(error: &sqlx::Error) {
    let init_error = if matches!(error, sqlx::Error::PoolTimedOut) {
        pool_timeout_health_error().await
    } else {
        init_error_from(error)
    };
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = Some(init_error);
    }
}

#[cfg(test)]
fn set_database_init_error(error: &sqlx::Error) {
    let init_error = init_error_from(error);
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = Some(init_error);
    }
}

/// Classifica o erro na mesma ordem de `database_error_message`, sem efeitos
/// colaterais (não registra o backoff de capacidade).
pub fn database_error_kind(error: &sqlx::Error) -> DatabaseErrorKind {
    match error {
        sqlx::Error::PoolTimedOut | sqlx::Error::Io(_) | sqlx::Error::Tls(_) => DatabaseErrorKind::Rede,
        sqlx::Error::Configuration(source) => {
            let missing = source
                .downcast_ref::<std::io::Error>()
                .is_some_and(|io_error| io_error.kind() == std::io::ErrorKind::NotFound);
            if missing {
                DatabaseErrorKind::NaoConfigurado
            } else {
                DatabaseErrorKind::ConfiguracaoInvalida
            }
        }
        sqlx::Error::ConfigFile(_) => DatabaseErrorKind::ConfiguracaoInvalida,
        sqlx::Error::Database(database_error) if database_error.code().as_deref() == Some("28P01") => {
            DatabaseErrorKind::Credencial
        }
        sqlx::Error::Database(database_error) if database_error.code().as_deref() == Some("3D000") => {
            DatabaseErrorKind::ConfiguracaoInvalida
        }
        error if is_database_capacity_error(error) => DatabaseErrorKind::Capacidade,
        sqlx::Error::Database(_) => DatabaseErrorKind::Desconhecido,
        sqlx::Error::Migrate(_) => DatabaseErrorKind::Incompativel,
        _ => DatabaseErrorKind::Desconhecido,
    }
}

pub fn database_error_message(error: &sqlx::Error) -> String {
    match error {
        sqlx::Error::PoolTimedOut => {
            "A conexão com o banco excedeu 6 segundos. Verifique a internet e tente novamente."
                .to_string()
        }
        sqlx::Error::Io(io_error) if io_error.kind() == std::io::ErrorKind::TimedOut => {
            format!("O banco demorou para responder: {}", io_error)
        }
        sqlx::Error::Io(_) => {
            "Não foi possível alcançar o banco. Verifique a internet, DNS ou compatibilidade IPv4/IPv6."
                .to_string()
        }
        sqlx::Error::Tls(_) => {
            "Falha ao estabelecer a conexão segura TLS com o banco.".to_string()
        }
        sqlx::Error::Configuration(_) | sqlx::Error::ConfigFile(_) => {
            "A URL de conexão PostgreSQL está ausente ou possui formato inválido.".to_string()
        }
        sqlx::Error::Database(database_error) if database_error.code().as_deref() == Some("28P01") => {
            "Usuário ou senha do banco inválidos.".to_string()
        }
        sqlx::Error::Database(database_error) if database_error.code().as_deref() == Some("3D000") => {
            "O banco de dados informado não existe. No Supabase, use a URL do Session pooler completa e confirme que ela termina em /postgres?sslmode=require.".to_string()
        }
        error if is_database_capacity_error(error) => database_capacity_error_message(),
        sqlx::Error::Database(_) => {
            "O servidor PostgreSQL recusou a conexão ou a operação de inicialização.".to_string()
        }
        sqlx::Error::Migrate(migrate_error) => {
            if let sqlx::migrate::MigrateError::Source(source) = migrate_error.as_ref() {
                if let Some(io_error) = source.downcast_ref::<std::io::Error>() {
                    if io_error.kind() == std::io::ErrorKind::InvalidData {
                        let causa = io_error.to_string();
                        warn!("Validação estrutural do banco recusou a conexão: {}", causa);
                        return format!(
                            "A conexão foi aberta, mas o banco não é compatível com este AutoOS: {}",
                            causa
                        );
                    }
                }
            }
            "A conexão foi aberta, mas a URL não aponta para o banco de produção compatível com o AutoOS."
                .to_string()
        }
        _ => "Não foi possível inicializar o banco de dados.".to_string(),
    }
}

/// O SQLx 0.9 repete o SQLSTATE 53300 durante a abertura de conexões e pode
/// convertê-lo em PoolTimedOut. Após esse timeout, fazemos uma única conexão
/// curta para recuperar o código original e só o reportamos se o Postgres o
/// confirmar. Se o pool local já estiver totalmente ocupado, mantemos a
/// mensagem de espera do pool sem abrir uma conexão extra.
pub async fn database_operation_error(error: sqlx::Error) -> String {
    if is_database_capacity_error(&error) {
        return database_capacity_error_message();
    }

    if !matches!(&error, sqlx::Error::PoolTimedOut) {
        return database_error_message(&error);
    }

    if database_capacity_backoff_active() {
        return DATABASE_ACCESS_LIMIT_ERROR.to_string();
    }

    if let Ok(pool) = get_pool().await {
        if pool.size() >= DATABASE_MAX_CONNECTIONS && pool.num_idle() == 0 {
            return database_error_message(&error);
        }
    }

    let Ok(database_url) = resolve_database_url() else {
        return database_error_message(&error);
    };

    // Uma conexão de diagnóstico por vez e no máximo a cada 5s: erros em rajada
    // não podem virar rajada de conexões extras fora do pool.
    let _diagnostic_guard = DIAGNOSTIC_LOCK.lock().await;
    if database_capacity_backoff_active() {
        return DATABASE_ACCESS_LIMIT_ERROR.to_string();
    }
    {
        let Ok(mut last) = LAST_DIAGNOSTIC.lock() else {
            return database_error_message(&error);
        };
        if !diagnostic_allowed(*last, Instant::now(), DIAGNOSTIC_MIN_INTERVAL) {
            return database_error_message(&error);
        }
        *last = Some(Instant::now());
    }

    match tokio::time::timeout(
        DATABASE_CAPACITY_DIAGNOSTIC_TIMEOUT,
        PgConnection::connect(&database_url),
    )
    .await
    {
        Ok(Err(diagnostic_error)) if is_database_capacity_error(&diagnostic_error) => {
            database_capacity_error_message()
        }
        Ok(Ok(connection)) => {
            let _ = connection.close().await;
            clear_database_capacity_error();
            database_error_message(&error)
        }
        _ => database_error_message(&error),
    }
}

fn is_transient_connect_error(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::PoolTimedOut | sqlx::Error::Io(_))
}

pub fn known_migrations() -> Vec<KnownMigration> {
    MIGRATOR
        .iter()
        .map(|migration| KnownMigration {
            version: migration.version,
            description: migration.description.to_string(),
        })
        .collect()
}

pub async fn validate_connected_migration_history() -> Result<(), String> {
    let pool = get_pool().await?;
    tokio::time::timeout(
        DATABASE_SCHEMA_TIMEOUT,
        validate_runtime_schema_on_pool(&pool),
    )
    .await
    .map_err(|_| {
        format!(
            "A validação do schema excedeu {} segundos.",
            DATABASE_SCHEMA_TIMEOUT.as_secs()
        )
    })??;
    Ok(())
}

/// Valida a compatibilidade real do schema sem confiar no histórico de migrations.
/// Versões antigas do AutoOS podiam reconstruir `_sqlx_migrations`, embora as
/// tabelas permanecessem utilizáveis. O release deve verificar capacidades, não
/// checksums administrativos que não alteram o contrato do aplicativo.
pub async fn validate_migration_history(database_url: &str) -> Result<usize, String> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .min_connections(0)
        .acquire_timeout(DATABASE_ACQUIRE_TIMEOUT)
        .after_connect(|connection, _metadata| Box::pin(async move {
            sqlx::query("SET TIME ZONE 'UTC'").execute(connection).await?;
            clear_database_capacity_error();
            Ok(())
        }))
        .connect(database_url)
        .await
        .map_err(|error| database_error_message(&error))?;

    let result = validate_runtime_schema_on_pool(&pool).await;
    pool.close().await;
    result
}

const REQUIRED_RUNTIME_TABLES: &[&str] = &[
    "clientes",
    "cliente_contatos",
    "equipamentos",
    "verificacoes",
    "comunicacoes",
    "equipamento_imagens",
    "servicos_catalogo",
    "orcamento_consumos",
    "orcamento_servicos_decisao",
    "security_profiles",
    "security_audit_log",
    // Orçamento pelo Portal do Cliente e fila de WhatsApp (0031–0040): aprovar, finalizar
    // verificação e o sino de alertas dependem delas. Sem as migrations o app não abre pela metade.
    "orcamento_versoes",
    "orcamento_respostas",
    "orcamento_solicitacoes",
    "orcamento_aceite_config",
    "envios_whatsapp_pedidos",
    "envios_whatsapp_tentativas",
    "portal_cliente_config",
    "portal_alertas",
    "portal_config_empresa",
    // Orçamento de insumos (0040): a aba de OI e a baixa de estoque dependem delas.
    "orcamentos_insumos",
    "orcamento_insumos_itens",
    "orcamentos_insumos_contadores",
    // Perfil e primeiro acesso por código (0041): a tela de perfis lê estas colunas.
    "codigos_primeiro_acesso",
    // Notificações lidas por perfil (0052): o sino lê e grava aqui.
    "notificacao_leituras",
];

const REQUIRED_RUNTIME_COLUMNS: &[(&str, &str)] = &[
    ("servicos_catalogo", "pecas_sugeridas"),
    ("verificacoes", "servicos_orcamento_original"),
    ("verificacoes", "pecas_orcamento_original"),
    ("verificacoes", "valor_orcamento_original"),
    ("clientes", "id"),
    ("cliente_contatos", "empresa_id"),
    ("cliente_contatos", "cliente_id"),
    ("cliente_contatos", "nome"),
    ("cliente_contatos", "ativo"),
    ("equipamentos", "id"),
    ("equipamentos", "serial_number"),
    ("equipamentos", "patrimonio"),
    ("equipamentos", "status"),
    ("equipamentos", "data_entrada"),
    ("equipamentos", "atualizado_em"),
    ("verificacoes", "equipamento_id"),
    ("verificacoes", "forma_pagamento_codigo"),
    ("verificacoes", "forma_pagamento_detalhe"),
    ("equipamentos", "responsavel_contato_id"),
    ("equipamentos", "responsavel_nome"),
    ("equipamentos", "responsavel_email"),
    ("equipamentos", "responsavel_telefone"),
    ("verificacoes", "adjusted_at"),
    ("equipamento_imagens", "storage_path"),
    ("security_profiles", "permissions"),
    ("security_profiles", "pin_required"),
    // Dados ampliados do portal (0039).
    ("clientes", "exige_ordem_compra"),
    ("portal_contato_empresa", "endereco"),
    ("portal_contato_empresa", "maps_url"),
    ("orcamento_respostas", "ordem_compra"),
    ("orcamento_solicitacoes", "contato_telefone"),
    ("orcamento_solicitacoes", "contato_email"),
    // Personalização e tour do perfil (0041).
    ("security_profiles", "avatar_icone"),
    ("security_profiles", "avatar_cor"),
    ("security_profiles", "tema"),
    ("security_profiles", "onboarding_concluido_em"),
    ("security_profiles", "tour_permissoes_vistas"),
    // Técnicos e e-mail profissional por perfil (0051).
    ("security_profiles", "email_profissional"),
    ("security_profiles", "atende_tecnico"),
    ("security_profiles", "avisos_desligados"),
];

const REQUIRED_RUNTIME_COLUMN_TYPES: &[(&str, &str, &str)] = &[
    ("equipamentos", "id", "int4"),
    ("cliente_contatos", "empresa_id", "int4"),
    ("cliente_contatos", "cliente_id", "int4"),
    ("cliente_contatos", "ativo", "bool"),
    ("equipamentos", "responsavel_contato_id", "int4"),
    ("security_profiles", "id", "int4"),
    ("security_profiles", "permissions", "text"),
    ("security_profiles", "pin_required", "bool"),
    ("security_audit_log", "profile_id", "int4"),
    ("verificacoes", "adjusted_by_profile_id", "int4"),
];

/// Falha da validação estrutural: a consulta em si falhou (rede, servidor
/// lotado) ou o banco respondeu e falta estrutura. Só o segundo caso prova
/// incompatibilidade.
#[derive(Debug)]
enum SchemaCheckFailure {
    Query(sqlx::Error),
    Mismatch(String),
}

/// Consulta que falhou mantém o tipo original (rede, capacidade...); só
/// estrutura ausente vira erro de banco incompatível.
fn schema_failure_into_error(failure: SchemaCheckFailure) -> sqlx::Error {
    match failure {
        SchemaCheckFailure::Query(error) => error,
        SchemaCheckFailure::Mismatch(message) => schema_validation_error(message),
    }
}

async fn validate_runtime_schema_on_pool(pool: &PgPool) -> Result<usize, String> {
    check_runtime_schema(pool).await.map_err(|failure| match failure {
        SchemaCheckFailure::Query(error) => crate::commands::operator_errors::mapear_erro_sql(error),
        SchemaCheckFailure::Mismatch(message) => message,
    })
}

async fn check_runtime_schema(pool: &PgPool) -> Result<usize, SchemaCheckFailure> {
    let table_names = REQUIRED_RUNTIME_TABLES
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    let missing_tables = sqlx::query_scalar::<_, String>(
        "SELECT required_name
         FROM unnest($1::text[]) AS required(required_name)
         WHERE to_regclass(format('public.%I', required_name)) IS NULL
         ORDER BY required_name",
    )
    .bind(table_names)
    .fetch_all(pool)
    .await
    .map_err(SchemaCheckFailure::Query)?;

    let column_tables = REQUIRED_RUNTIME_COLUMNS
        .iter()
        .map(|(table, _)| table.to_string())
        .collect::<Vec<_>>();
    let column_names = REQUIRED_RUNTIME_COLUMNS
        .iter()
        .map(|(_, column)| column.to_string())
        .collect::<Vec<_>>();
    let missing_columns = sqlx::query_scalar::<_, String>(
        "SELECT required_table || '.' || required_column
         FROM unnest($1::text[], $2::text[]) AS required(required_table, required_column)
         WHERE NOT EXISTS (
           SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name = required.required_table
             AND c.column_name = required.required_column
         )
         ORDER BY 1",
    )
    .bind(column_tables)
    .bind(column_names)
    .fetch_all(pool)
    .await
    .map_err(SchemaCheckFailure::Query)?;

    let typed_tables = REQUIRED_RUNTIME_COLUMN_TYPES
        .iter()
        .map(|(table, _, _)| table.to_string())
        .collect::<Vec<_>>();
    let typed_columns = REQUIRED_RUNTIME_COLUMN_TYPES
        .iter()
        .map(|(_, column, _)| column.to_string())
        .collect::<Vec<_>>();
    let expected_types = REQUIRED_RUNTIME_COLUMN_TYPES
        .iter()
        .map(|(_, _, expected_type)| expected_type.to_string())
        .collect::<Vec<_>>();
    let incompatible_columns = sqlx::query_scalar::<_, String>(
        "SELECT required_table || '.' || required_column || ' esperado=' || expected_type ||
                ' encontrado=' || COALESCE(c.udt_name, 'ausente')
         FROM unnest($1::text[], $2::text[], $3::text[])
              AS required(required_table, required_column, expected_type)
         LEFT JOIN information_schema.columns c
           ON c.table_schema = 'public'
          AND c.table_name = required.required_table
          AND c.column_name = required.required_column
         WHERE c.udt_name IS DISTINCT FROM expected_type
         ORDER BY 1",
    )
    .bind(typed_tables)
    .bind(typed_columns)
    .bind(expected_types)
    .fetch_all(pool)
    .await
    .map_err(SchemaCheckFailure::Query)?;

    if !missing_tables.is_empty()
        || !missing_columns.is_empty()
        || !incompatible_columns.is_empty()
    {
        let mut missing = missing_tables;
        missing.extend(missing_columns);
        missing.extend(incompatible_columns);
        return Err(SchemaCheckFailure::Mismatch(format!(
            "Estruturas obrigatórias ausentes: {}.",
            missing.join(", ")
        )));
    }

    Ok(REQUIRED_RUNTIME_TABLES.len()
        + REQUIRED_RUNTIME_COLUMNS.len()
        + REQUIRED_RUNTIME_COLUMN_TYPES.len())
}

async fn validate_migration_history_on_pool(pool: &PgPool) -> Result<usize, String> {
    let applied = sqlx::query_as::<_, (i64, bool, Vec<u8>)>(
        "SELECT version, success, checksum FROM _sqlx_migrations ORDER BY version",
    )
    .fetch_all(pool)
    .await
    .map_err(crate::commands::operator_errors::mapear_erro_sql)?;

    let known = MIGRATOR.iter().collect::<Vec<_>>();
    if applied.len() != known.len() {
        return Err(format!(
            "Histórico incompatível: o build espera {} migrations, mas o banco registra {}.",
            known.len(),
            applied.len()
        ));
    }

    for migration in &known {
        let Some((_, success, checksum)) = applied
            .iter()
            .find(|(version, _, _)| *version == migration.version)
        else {
            return Err(format!("Migration {} ausente no banco.", migration.version));
        };
        if !success {
            return Err(format!(
                "Migration {} está registrada como falha.",
                migration.version
            ));
        }
        if checksum.as_slice() != migration.checksum.as_ref() {
            return Err(format!(
                "Checksum divergente na migration {}.",
                migration.version
            ));
        }
    }

    Ok(known.len())
}

fn schema_validation_error(message: String) -> sqlx::Error {
    sqlx::Error::Migrate(Box::new(sqlx::migrate::MigrateError::Source(Box::new(
        std::io::Error::new(std::io::ErrorKind::InvalidData, message),
    ))))
}

fn schema_validation_timeout_error() -> sqlx::Error {
    sqlx::Error::Io(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        format!(
            "a validação estrutural excedeu {} segundos.",
            DATABASE_SCHEMA_TIMEOUT.as_secs()
        ),
    ))
}

fn database_url_missing_error() -> sqlx::Error {
    sqlx::Error::Configuration(Box::new(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "DATABASE_URL não configurada. Defina a conexão em src-tauri/.env ou nas variáveis de ambiente.",
    )))
}

fn push_env_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.contains(&path) {
        candidates.push(path);
    }
}

fn collect_env_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    push_env_candidate(
        &mut candidates,
        Path::new(env!("CARGO_MANIFEST_DIR")).join(".env"),
    );

    if let Ok(executable_path) = env::current_exe() {
        let mut current_dir = executable_path.parent();
        for _ in 0..4 {
            if let Some(dir) = current_dir {
                push_env_candidate(&mut candidates, dir.join(".env"));
                current_dir = dir.parent();
            } else {
                break;
            }
        }
    }

    candidates
}

fn resolve_database_url_from_config_file() -> Option<String> {
    let config_path = local_app_data_dir().ok()?.join(DATABASE_CONFIG_FILE);
    if !config_path.is_file() {
        return None;
    }
    let contents = fs::read_to_string(&config_path).ok()?;
    let config: DatabaseConnectionConfig = serde_json::from_str(&contents).ok()?;
    config.to_database_url().ok()
}

fn select_primary_database_url(
    process_url: Option<String>,
    bundled_url: Option<&str>,
    saved_url: Option<String>,
) -> Option<String> {
    process_url.or_else(|| {
        bundled_url
            .filter(|database_url| !database_url.is_empty())
            .map(str::to_owned)
            .or(saved_url)
    })
}

fn resolve_database_url() -> Result<String, sqlx::Error> {
    // Ordem: variável explícita do processo, endereço embutido no release e, por
    // último, configuração salva pelo fallback.
    if let Some(database_url) = select_primary_database_url(
        env::var("DATABASE_URL").ok(),
        option_env!("COMPILE_TIME_DATABASE_URL"),
        resolve_database_url_from_config_file(),
    ) {
        return Ok(database_url);
    }

    for env_path in collect_env_candidates() {
        if !env_path.is_file() {
            continue;
        }

        if dotenv::from_path(&env_path).is_ok() {
            if let Ok(database_url) = env::var("DATABASE_URL") {
                return Ok(database_url);
            }
        }
    }

    Err(database_url_missing_error())
}

pub async fn init_database() -> Result<PgPool, sqlx::Error> {
    clear_database_init_error();
    let result = async {
        let database_url = resolve_database_url()?;
        get_or_create_single_flight(
            &INIT_LOCK,
            &POOL,
            |pool: &PgPool| !pool.is_closed(),
            || connect_and_setup_pool_with_retry(&database_url),
        )
        .await
    }
    .await;

    if let Err(error) = &result {
        record_database_init_error(error).await;
    }
    result
}

pub async fn init_database_with_url(database_url: &str) -> Result<PgPool, sqlx::Error> {
    clear_database_init_error();
    let _init_guard = INIT_LOCK.lock().await;
    let result = connect_and_setup_pool(database_url).await;
    if let Err(error) = &result {
        record_database_init_error(error).await;
    }
    result
}

async fn connect_and_setup_pool_with_retry(database_url: &str) -> Result<PgPool, sqlx::Error> {
    for attempt in 1..=STARTUP_CONNECT_ATTEMPTS {
        match connect_and_setup_pool(database_url).await {
            Ok(pool) => return Ok(pool),
            Err(error)
                if attempt < STARTUP_CONNECT_ATTEMPTS
                    && is_transient_connect_error(&error)
                    && !database_capacity_backoff_active() =>
            {
                let delay = retry_backoff_delay(attempt as u32, STARTUP_RETRY_DELAY, STARTUP_RETRY_MAX_DELAY);
                warn!(
                    "Tentativa transitória de conexão {}/{} falhou; nova tentativa em {} ms",
                    attempt,
                    STARTUP_CONNECT_ATTEMPTS,
                    delay.as_millis()
                );
                tokio::time::sleep(delay).await;
            }
            Err(error) => return Err(error),
        }
    }

    unreachable!("o loop de conexão sempre retorna sucesso ou erro")
}

async fn connect_and_setup_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(DATABASE_MAX_CONNECTIONS)
        .min_connections(0)
        .acquire_timeout(DATABASE_ACQUIRE_TIMEOUT)
        .idle_timeout(Duration::from_secs(5 * 60))
        .max_lifetime(Duration::from_secs(30 * 60))
        .after_connect(|connection, _metadata| Box::pin(async move {
            // O schema legado usa TIMESTAMP sem fuso. UTC fixo evita que pools
            // diferentes gravem relógios locais incompatíveis.
            sqlx::query("SET TIME ZONE 'UTC'").execute(connection).await?;
            clear_database_capacity_error();
            Ok(())
        }))
        .connect(database_url)
        .await?;

    // A validação é somente leitura e verifica o contrato real usado pelo app.
    // Ela não consulta `_sqlx_migrations` e não executa migrations, portanto não
    // disputa DDL/locks com outras máquinas e aceita históricos legados válidos.
    let schema_result = match tokio::time::timeout(
        DATABASE_SCHEMA_TIMEOUT,
        check_runtime_schema(&pool),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            pool.close().await;
            // Lentidão não prova incompatibilidade: vira erro de rede, que a
            // tela de reconexão trata como passageiro e tenta de novo.
            return Err(schema_validation_timeout_error());
        }
    };
    if let Err(failure) = schema_result {
        pool.close().await;
        return Err(schema_failure_into_error(failure));
    }

    // Troca de pool (ex.: nova configuração): fecha o antigo para não deixar
    // conexões ociosas ocupando vagas no Supavisor.
    let previous = POOL.lock().ok().and_then(|mut guard| guard.replace(pool.clone()));
    if let Some(previous) = previous {
        previous.close().await;
    }
    if let Ok(mut guard) = INIT_ERROR.lock() {
        *guard = None;
    }
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    struct TestDatabaseError {
        code: &'static str,
        message: &'static str,
    }

    impl std::fmt::Debug for TestDatabaseError {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter
                .debug_struct("TestDatabaseError")
                .field("code", &self.code)
                .field("message", &self.message)
                .finish()
        }
    }

    impl std::fmt::Display for TestDatabaseError {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str(self.message)
        }
    }

    impl std::error::Error for TestDatabaseError {}

    impl sqlx::error::DatabaseError for TestDatabaseError {
        fn message(&self) -> &str {
            self.message
        }

        fn code(&self) -> Option<std::borrow::Cow<'_, str>> {
            Some(self.code.into())
        }

        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }

        fn kind(&self) -> sqlx::error::ErrorKind {
            sqlx::error::ErrorKind::Other
        }
    }

    fn database_error(code: &'static str, message: &'static str) -> sqlx::Error {
        sqlx::Error::Database(Box::new(TestDatabaseError { code, message }))
    }

    #[test]
    fn classifies_error_kind_for_the_fallback_screen() {
        assert_eq!(database_error_kind(&database_url_missing_error()), DatabaseErrorKind::NaoConfigurado);
        let malformed = sqlx::Error::Configuration(Box::new(io::Error::new(io::ErrorKind::InvalidInput, "url")));
        assert_eq!(database_error_kind(&malformed), DatabaseErrorKind::ConfiguracaoInvalida);
        assert_eq!(database_error_kind(&sqlx::Error::PoolTimedOut), DatabaseErrorKind::Rede);
        let io_error = sqlx::Error::Io(io::Error::new(io::ErrorKind::ConnectionRefused, "x"));
        assert_eq!(database_error_kind(&io_error), DatabaseErrorKind::Rede);
        assert_eq!(database_error_kind(&database_error("28P01", "auth")), DatabaseErrorKind::Credencial);
        assert_eq!(database_error_kind(&database_error("3D000", "db")), DatabaseErrorKind::ConfiguracaoInvalida);
        assert_eq!(database_error_kind(&database_error("53300", "too many clients")), DatabaseErrorKind::Capacidade);
        assert_eq!(database_error_kind(&database_error("XX000", "boom")), DatabaseErrorKind::Desconhecido);
    }

    #[test]
    fn schema_query_failure_keeps_its_own_kind() {
        // Uma consulta da validação que cai por rede não pode virar "outra versão".
        let reset = sqlx::Error::Io(io::Error::new(io::ErrorKind::ConnectionReset, "reset"));
        let error = schema_failure_into_error(SchemaCheckFailure::Query(reset));
        assert_eq!(database_error_kind(&error), DatabaseErrorKind::Rede);

        let lotado = schema_failure_into_error(SchemaCheckFailure::Query(database_error("53300", "too many clients")));
        assert_eq!(database_error_kind(&lotado), DatabaseErrorKind::Capacidade);

        let faltando = schema_failure_into_error(SchemaCheckFailure::Mismatch("tabela x ausente".to_string()));
        assert_eq!(database_error_kind(&faltando), DatabaseErrorKind::Incompativel);
    }

    #[test]
    fn health_timeout_outlasts_pool_acquire() {
        // Se a checagem desistisse antes do pool, a lotação nunca seria confirmada.
        assert!(DATABASE_HEALTH_TIMEOUT > DATABASE_ACQUIRE_TIMEOUT);
    }

    #[test]
    fn pool_timeout_keeps_confirmed_capacity_in_health_check() {
        let lotado = health_error_after_pool_timeout(DATABASE_ACCESS_LIMIT_ERROR.to_string());
        assert_eq!(lotado.tipo, DatabaseErrorKind::Capacidade);
        let lento = health_error_after_pool_timeout(database_error_message(&sqlx::Error::PoolTimedOut));
        assert_eq!(lento.tipo, DatabaseErrorKind::Rede);
    }

    #[test]
    fn slow_health_check_is_transient() {
        let lento = init_error_from(&health_timeout_error());
        assert_eq!(lento.tipo, DatabaseErrorKind::Rede);
        assert!(lento.mensagem.contains("demorou para responder"));
    }

    #[test]
    fn slow_schema_validation_is_transient_not_incompatible() {
        let slow = schema_validation_timeout_error();
        assert_eq!(database_error_kind(&slow), DatabaseErrorKind::Rede);
        assert!(database_error_message(&slow).contains("demorou para responder"));
        let mismatch = schema_validation_error("tabela ausente".to_string());
        assert_eq!(database_error_kind(&mismatch), DatabaseErrorKind::Incompativel);
    }

    #[test]
    fn init_error_keeps_kind_and_sanitized_message() {
        set_database_init_error(&sqlx::Error::PoolTimedOut);
        let init_error = database_init_error().expect("erro registrado");
        assert_eq!(init_error.tipo, DatabaseErrorKind::Rede);
        assert!(init_error.mensagem.contains("6 segundos"));
        clear_database_init_error();
        assert!(database_init_error().is_none());
    }

    #[test]
    fn classifies_timeout_without_exposing_connection_details() {
        let message = database_error_message(&sqlx::Error::PoolTimedOut);
        assert!(message.contains("6 segundos"));
        assert!(!message.contains("postgres"));
    }

    #[test]
    fn runtime_schema_requires_structures_from_migrations_0039_and_0040() {
        for tabela in ["orcamentos_insumos", "orcamento_insumos_itens", "orcamentos_insumos_contadores"] {
            assert!(REQUIRED_RUNTIME_TABLES.contains(&tabela), "{tabela}");
        }
        for coluna in [
            ("clientes", "exige_ordem_compra"),
            ("portal_contato_empresa", "endereco"),
            ("portal_contato_empresa", "maps_url"),
            ("orcamento_respostas", "ordem_compra"),
            ("orcamento_solicitacoes", "contato_telefone"),
            ("orcamento_solicitacoes", "contato_email"),
        ] {
            assert!(REQUIRED_RUNTIME_COLUMNS.contains(&coluna), "{coluna:?}");
        }
    }

    #[test]
    fn runtime_schema_requires_structures_from_migration_0041() {
        assert!(REQUIRED_RUNTIME_TABLES.contains(&"codigos_primeiro_acesso"));
        for coluna in [
            ("security_profiles", "avatar_icone"),
            ("security_profiles", "avatar_cor"),
            ("security_profiles", "tema"),
            ("security_profiles", "onboarding_concluido_em"),
            ("security_profiles", "tour_permissoes_vistas"),
        ] {
            assert!(REQUIRED_RUNTIME_COLUMNS.contains(&coluna), "{coluna:?}");
        }
    }

    #[test]
    fn reports_schema_validation_without_claiming_to_update_it() {
        let message = database_error_message(&schema_validation_error("incompatível".to_string()));
        assert!(message.contains("incompatível"));
        assert!(message.contains("não é compatível com este AutoOS"));
        assert!(!message.contains("atualização"));
    }

    #[test]
    fn keeps_generic_message_for_other_migrate_errors() {
        let message = database_error_message(&sqlx::Error::Migrate(Box::new(
            sqlx::migrate::MigrateError::VersionMissing(1),
        )));
        assert!(message.contains("não aponta para o banco de produção"));
    }

    #[test]
    fn explains_the_supabase_database_name_for_3d000() {
        let message = database_error_message(&sqlx::Error::Database(Box::new(
            TestDatabaseError {
                code: "3D000",
                message: "database missing",
            },
        )));
        assert!(message.contains("/postgres?sslmode=require"));
    }

    #[test]
    fn recognizes_supavisor_session_limits_and_postgres_connection_limits() {
        for (code, message) in [
            ("XX000", "EMAXCONNSESSION: max clients reached in session mode"),
            ("XX000", "MaxClientsInSessionMode: max clients reached"),
            ("53300", "too many clients already"),
        ] {
            let error = sqlx::Error::Database(Box::new(TestDatabaseError { code, message }));
            assert!(is_database_capacity_error(&error), "{code}: {message}");
            assert_eq!(database_error_message(&error), DATABASE_ACCESS_LIMIT_ERROR);
        }
    }

    #[tokio::test]
    async fn reuses_a_recent_confirmed_capacity_error_for_pool_timeouts() {
        note_database_capacity_error();

        let message = database_operation_error(sqlx::Error::PoolTimedOut).await;

        assert_eq!(message, DATABASE_ACCESS_LIMIT_ERROR);
        clear_database_capacity_error();
        assert!(!database_capacity_backoff_active());
    }

    #[test]
    fn backoff_grows_exponentially_and_respects_the_cap() {
        let base = Duration::from_millis(750);
        let cap = Duration::from_secs(10);
        assert_eq!(retry_backoff_delay(1, base, cap), Duration::from_millis(750));
        assert_eq!(retry_backoff_delay(2, base, cap), Duration::from_millis(1500));
        assert_eq!(retry_backoff_delay(3, base, cap), Duration::from_millis(3000));
        assert_eq!(retry_backoff_delay(5, base, cap), cap);
        assert_eq!(retry_backoff_delay(u32::MAX, base, cap), cap);
        assert_eq!(retry_backoff_delay(0, base, cap), base);
    }

    #[test]
    fn diagnostic_connections_are_rate_limited() {
        let now = Instant::now();
        let gap = Duration::from_secs(5);
        assert!(diagnostic_allowed(None, now, gap));
        assert!(!diagnostic_allowed(Some(now), now, gap));
        assert!(diagnostic_allowed(Some(now), now + gap, gap));
    }

    #[tokio::test]
    async fn concurrent_initializations_create_a_single_pool() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let lock = Arc::new(tokio::sync::Mutex::new(()));
        let slot: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
        let created = Arc::new(AtomicUsize::new(0));

        let mut tasks = Vec::new();
        for _ in 0..50 {
            let (lock, slot, created) = (lock.clone(), slot.clone(), created.clone());
            tasks.push(tokio::spawn(async move {
                get_or_create_single_flight(&lock, &slot, |_| true, || async {
                    created.fetch_add(1, Ordering::SeqCst);
                    tokio::task::yield_now().await;
                    *slot.lock().unwrap() = Some(7);
                    Ok::<u32, String>(7)
                })
                .await
            }));
        }
        for task in tasks {
            assert_eq!(task.await.unwrap().unwrap(), 7);
        }
        assert_eq!(created.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn unusable_pool_is_recreated_and_failures_are_not_cached() {
        let lock = tokio::sync::Mutex::new(());
        let slot: Mutex<Option<u32>> = Mutex::new(Some(1));

        let reused = get_or_create_single_flight(&lock, &slot, |v| *v == 1, || async {
            Err::<u32, String>("não deveria criar".into())
        })
        .await;
        assert_eq!(reused.unwrap(), 1);

        let failed = get_or_create_single_flight(&lock, &slot, |_| false, || async {
            Err::<u32, String>("falhou".into())
        })
        .await;
        assert!(failed.is_err());
        let recreated = get_or_create_single_flight(&lock, &slot, |_| false, || async {
            Ok::<u32, String>(2)
        })
        .await;
        assert_eq!(recreated.unwrap(), 2);
    }

    #[test]
    fn retries_only_transient_network_errors() {
        assert!(is_transient_connect_error(&sqlx::Error::PoolTimedOut));
        assert!(is_transient_connect_error(&sqlx::Error::Io(
            io::Error::new(io::ErrorKind::TimedOut, "offline",)
        )));
        assert!(!is_transient_connect_error(&sqlx::Error::InvalidArgument(
            "invalid".to_string(),
        )));
    }

    #[test]
    fn bundled_release_url_wins_over_saved_fallback() {
        let selected = select_primary_database_url(
            None,
            Some("postgresql://release"),
            Some("postgresql://saved".to_string()),
        );

        assert_eq!(selected.as_deref(), Some("postgresql://release"));
    }

    #[test]
    fn saved_url_is_used_when_build_has_no_embedded_database() {
        let selected =
            select_primary_database_url(None, None, Some("postgresql://saved".to_string()));

        assert_eq!(selected.as_deref(), Some("postgresql://saved"));
    }

    #[test]
    fn explicit_process_url_keeps_highest_priority() {
        let selected = select_primary_database_url(
            Some("postgresql://process".to_string()),
            Some("postgresql://release"),
            Some("postgresql://saved".to_string()),
        );

        assert_eq!(selected.as_deref(), Some("postgresql://process"));
    }
}
