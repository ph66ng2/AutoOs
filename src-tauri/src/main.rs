// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! ╔══════════════════════════════════════════════════════════════╗
//! ║  main.rs — Entry Point do Backend Tauri                      ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Inicializa o app Tauri, cria a pool PostgreSQL e registra  ║
//! ║  todos os 25 comandos IPC (invoke) disponíveis para o       ║
//! ║  frontend React.                                             ║
//! ║                                                              ║
//! ║  DEPENDE DE:                                                 ║
//! ║  - db.rs (init_database, AppState)                           ║
//! ║  - commands/ (módulos: equipamentos, clientes, produtos,     ║
//! ║               verificacoes, comunicacoes, smtp, util)        ║
//! ║  - tauri-plugin-shell (abrir URLs no navegador — WhatsApp)  ║
//! ║  - tracing (logging estruturado)                             ║
//! ║                                                              ║
//! ║  FLUXO DE INICIALIZAÇÃO:                                     ║
//! ║  1. Inicializa tracing para logging estruturado              ║
//! ║  2. Inicializa banco PostgreSQL via block_on (síncrono)     ║
//! ║  3. Armazena AppState (pool PostgreSQL) no estado Tauri     ║
//! ║  4. Registra 25 comandos: Equipamentos(6) + Clientes(5) +   ║
//! ║     Produtos(5) + Verificações(2) + Comunicações(2) +       ║
//! ║     SMTP(3) + Util(2)                                        ║
//! ╚══════════════════════════════════════════════════════════════╝

mod db;
mod commands;

use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

fn main() {
    let max_level = if cfg!(debug_assertions) {
        Level::DEBUG
    } else {
        Level::INFO
    };

    // Inicializar tracing para logging estruturado
    let subscriber = FmtSubscriber::builder()
        .with_max_level(max_level)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .finish();

    tracing::subscriber::set_global_default(subscriber)
        .expect("Falha ao configurar tracing");

    info!("AutoOS iniciando...");

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
        .plugin(tauri_plugin_shell::init())
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
            commands::util::obter_status_schema_banco,
            commands::util::obter_status_ferramentas_backup_postgres,
            commands::util::gerar_backup_postgres,
            commands::util::restaurar_backup_postgres,
            // Equipamentos
            commands::equipamentos::listar_equipamentos,
            commands::equipamentos::buscar_equipamento,
            commands::equipamentos::criar_equipamento,
            commands::equipamentos::atualizar_equipamento,
            commands::equipamentos::deletar_equipamento,
            commands::equipamentos::atualizar_status_equipamento,
            commands::equipamento_imagens::listar_imagens_equipamento,
            commands::equipamento_imagens::substituir_imagens_equipamento,
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
