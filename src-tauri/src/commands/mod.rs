//! ╔══════════════════════════════════════════════════════════════╗
//! ║  commands/mod.rs — Módulo Raiz dos Comandos Tauri            ║
//! ╠══════════════════════════════════════════════════════════════╣
//! ║  Organiza os comandos em submódulos por domínio:             ║
//! ║  - types: Structs de entrada/saída compartilhadas            ║
//! ║  - equipamentos: CRUD de equipamentos (6 comandos)           ║
//! ║  - clientes: CRUD de clientes PF/PJ (5 comandos)             ║
//! ║  - produtos: CRUD de produtos/estoque (5 comandos)           ║
//! ║  - verificacoes: Verificações técnicas (2 comandos)          ║
//! ║  - comunicacoes: Histórico de comunicações (2 comandos)      ║
//! ║  - smtp: Configuração e envio de email (3 comandos)          ║
//! ║  - util: Comandos utilitários (2 comandos)                   ║
//! ╚══════════════════════════════════════════════════════════════╝

pub mod types;
pub mod auth;
pub mod equipamentos;
pub mod equipamento_imagens;
pub mod clientes;
pub mod produtos;
pub mod servicos;
pub mod verificacoes;
pub mod comunicacoes;
pub mod smtp;
pub mod whatsapp;
pub mod util;
