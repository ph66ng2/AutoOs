// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! ╔══════════════════════════════════════════════════════════════╗
//! ║  main.rs — Entry Point do Backend Tauri                      ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Inicializa o app Tauri, cria a pool PostgreSQL e registra  ║
//! ║  todos os comandos IPC (invoke) disponíveis para o          ║
//! ║  frontend React.                                             ║
//! ║                                                              ║
//! ║  DEPENDE DE:                                                 ║
//! ║  - db.rs (init_database)                                     ║
//! ║  - commands/ (módulos: auth, equipamentos, clientes,         ║
//! ║               produtos, verificacoes, comunicacoes, smtp,    ║
//! ║               whatsapp, util, equipamento_imagens)           ║
//! ║  - tracing (logging estruturado + arquivo local)             ║
//! ║                                                              ║
//! ║  FLUXO DE INICIALIZAÇÃO:                                     ║
//! ║  1. Inicializa tracing para logging estruturado              ║
//! ║  2. Inicializa banco PostgreSQL via block_on (síncrono)     ║
//! ║  3. Inicializa a pool global de banco em db.rs              ║
//! ║  4. Registra todos os comandos IPC usados pelo frontend     ║
//! ╚══════════════════════════════════════════════════════════════╝

mod db;
mod commands;

use std::sync::OnceLock;
use tracing::{info, Level};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

static LOG_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

fn init_tracing() -> Result<(), String> {
    let max_level = if cfg!(debug_assertions) {
        Level::DEBUG
    } else {
        Level::INFO
    };

    let log_directory = commands::util::autoos_logs_dir()?;
    let file_appender = tracing_appender::rolling::daily(&log_directory, "autoos.log");
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
    let _ = LOG_GUARD.set(guard);

    let env_filter = EnvFilter::builder()
        .with_default_directive(max_level.into())
        .from_env_lossy();

    let stdout_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true);

    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .with_writer(file_writer);

    let subscriber = tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer)
        .with(file_layer);

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|e| format!("Falha ao configurar tracing: {}", e))
}

fn main() {
    init_tracing().expect("Falha ao configurar tracing");

    info!("AutoOS iniciando...");
    match commands::util::run_local_housekeeping() {
        Ok(status) => info!(
            "Housekeeping local concluído: temp_removidos={}, logs_removidos={}, suporte_removidos={}",
            status.temp_files_removed,
            status.log_files_removed,
            status.support_files_removed
        ),
        Err(error) => info!("Housekeeping local não pôde ser concluído: {}", error),
    }

    tauri::Builder::default()
        .setup(|_app| {
            info!("Inicializando banco de dados...");
            // block_on garante que o pool está pronto antes do app iniciar.
            // O pool é armazenado no OnceLock global em db::get_pool()
            let _pool = tauri::async_runtime::block_on(db::init_database())
                .expect("Falha ao inicializar banco PostgreSQL");
            info!("Banco de dados inicializado com sucesso");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth sensível
            commands::auth::get_sensitive_access_status,
            commands::auth::configure_sensitive_pin,
            commands::auth::unlock_sensitive_access,
            commands::auth::lock_sensitive_access,
            commands::auth::set_active_security_profile,
            commands::auth::create_security_profile,
            commands::auth::update_security_profile,
            commands::auth::reset_security_profile_pin,
            commands::auth::list_security_profiles,
            commands::auth::deactivate_security_profile,
            commands::auth::reactivate_security_profile,
            commands::auth::register_security_audit_export,
            commands::auth::list_security_audit_events,
            // Util
            commands::util::salvar_arquivo_temp,
            commands::util::copiar_anexo_email_para_temp,
            commands::util::remover_anexo_email_temp,
            commands::util::salvar_ordem_servico_pdf,
            commands::util::salvar_orcamento_pdf,
            commands::util::verificar_documento_existe,
            commands::util::abrir_documento,
            commands::util::salvar_imagem_equipamento,
            commands::util::salvar_relatorio_status_pdf,
            commands::util::obter_status_schema_banco,
            commands::util::obter_status_ferramentas_backup_postgres,
            commands::util::gerar_backup_postgres,
            commands::util::restaurar_backup_postgres,
            commands::util::obter_diagnostico_suporte_local,
            commands::util::exportar_pacote_suporte_local,
            // Equipamentos
            commands::equipamentos::listar_equipamentos,
            commands::equipamentos::buscar_equipamento,
            commands::equipamentos::criar_equipamento,
            commands::equipamentos::atualizar_equipamento,
            commands::equipamentos::deletar_equipamento,
            commands::equipamentos::atualizar_status_equipamento,
            commands::equipamento_imagens::listar_imagens_equipamento,
            commands::equipamento_imagens::substituir_imagens_equipamento,
            commands::equipamento_imagens::adicionar_imagem_equipamento,
            commands::photo_server::start_photo_server,
            commands::photo_server::stop_photo_server,
            commands::photo_server::generate_upload_token,
            commands::qr_code::gerar_qr_upload,
            // Clientes
            commands::clientes::listar_clientes,
            commands::clientes::buscar_cliente,
            commands::clientes::criar_cliente,
            commands::clientes::atualizar_cliente,
            commands::clientes::deletar_cliente,
            // Produtos
            commands::produtos::listar_produtos,
            commands::produtos::buscar_produto,
            commands::produtos::criar_produto,
            commands::produtos::atualizar_produto,
            commands::produtos::deletar_produto,
            commands::produtos::registrar_movimentacao_estoque,
            // Gastos
            commands::gastos::listar_gastos_fixos,
            commands::gastos::criar_gasto_fixo,
            commands::gastos::atualizar_gasto_fixo,
            commands::gastos::listar_gastos_variaveis,
            commands::gastos::criar_gasto_variavel,
            commands::gastos::resumo_mensal,
            // Serviços (catálogo)
            commands::servicos::listar_servicos,
            commands::servicos::buscar_servico,
            commands::servicos::criar_servico,
            commands::servicos::atualizar_servico,
            commands::servicos::deletar_servico,
            // Verificações
            commands::verificacoes::salvar_verificacao_tecnica,
            commands::verificacoes::buscar_verificacao_tecnica,
            // Comunicações
            commands::comunicacoes::registrar_comunicacao,
            commands::comunicacoes::listar_comunicacoes,
            // SMTP
            commands::smtp::salvar_config_smtp,
            commands::smtp::carregar_config_smtp,
            commands::smtp::enviar_email,
            // WhatsApp
            commands::whatsapp::salvar_config_whatsapp,
            commands::whatsapp::carregar_config_whatsapp,
            commands::whatsapp::enviar_whatsapp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
