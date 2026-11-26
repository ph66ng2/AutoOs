//! Atualização ao vivo entre computadores (2/3). Uma conexão fica escutando o canal
//! `autoos_mudancas` (gatilhos iniciados na migration 0055). Os avisos da empresa da sessão
//! e dos gastos legados compartilhados viram o evento `autoos:mudancas`.
//!
//! - Avisos em sequência são juntados (JANELA_MS) para a tela não recarregar 10 vezes.
//! - Sem sessão (antes do PIN) os avisos são descartados: a tela recarrega ao abrir.
//! - Se a conexão cai, ela volta sozinha e o app recebe `autoos:reconectado` para
//!   recarregar tudo uma vez (avisos do intervalo se perderam).
//! - Sem banco configurado, tenta de novo a cada ESPERA_SEM_BANCO.

use crate::commands::auth::require_active_session_company_id_without_touch;
use crate::db::get_pool;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgListener;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tracing::{debug, info, warn};

pub const CANAL: &str = "autoos_mudancas";
pub const EVENTO_MUDANCAS: &str = "autoos:mudancas";
pub const EVENTO_RECONECTADO: &str = "autoos:reconectado";
const JANELA_MS: u64 = 250;
const ESPERA_SEM_BANCO: Duration = Duration::from_secs(5);
const ESPERA_MAXIMA: Duration = Duration::from_secs(30);

/// Aviso como sai do gatilho (`{"e","t","id","ref","op"}`).
#[derive(Debug, Deserialize)]
struct AvisoBruto {
    e: Option<i32>,
    t: String,
    id: Option<i64>,
    #[serde(rename = "ref")]
    referencia: Option<i64>,
    op: String,
}

/// O que a tela recebe: sem a empresa (já filtrada).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Mudanca {
    pub tabela: String,
    pub id: Option<i64>,
    pub referencia: Option<i64>,
    pub operacao: String,
}

/// Filtra pela empresa, inclui os avisos sem ID dos gastos legados e tira repetidos.
/// Aviso mal formado é ignorado: quem manda no canal é só o gatilho.
pub fn mudancas_da_empresa(payloads: &[String], empresa_id: i32) -> Vec<Mudanca> {
    let mut saida: Vec<Mudanca> = Vec::new();
    for payload in payloads {
        let Ok(aviso) = serde_json::from_str::<AvisoBruto>(payload) else { continue };
        let gasto_compartilhado = aviso.e.is_none()
            && matches!(aviso.t.as_str(), "gastos_fixos" | "gastos_variaveis")
            && aviso.id.is_none()
            && aviso.referencia.is_none();
        if aviso.e != Some(empresa_id) && !gasto_compartilhado {
            continue;
        }
        let mudanca = Mudanca { tabela: aviso.t, id: aviso.id, referencia: aviso.referencia, operacao: aviso.op };
        if !saida.contains(&mudanca) {
            saida.push(mudanca);
        }
    }
    saida
}

/// Liga a escuta em segundo plano. Chamada uma vez, no `setup` do app.
pub fn iniciar(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut espera = Duration::from_secs(1);
        let mut ja_conectou = false;
        loop {
            let Ok(pool) = get_pool().await else {
                tokio::time::sleep(ESPERA_SEM_BANCO).await;
                continue;
            };
            let mut listener = match PgListener::connect_with(&pool).await {
                Ok(listener) => listener,
                Err(erro) => {
                    warn!("Ao vivo: não deu para conectar a escuta ({erro}); nova tentativa em {}s", espera.as_secs());
                    tokio::time::sleep(espera).await;
                    espera = (espera * 2).min(ESPERA_MAXIMA);
                    continue;
                }
            };
            if let Err(erro) = listener.listen(CANAL).await {
                warn!("Ao vivo: LISTEN recusado ({erro}). Conexão de transação (porta 6543)? Fica a atualização ao focar.");
                tokio::time::sleep(ESPERA_MAXIMA).await;
                continue;
            }
            info!("Ao vivo: escutando {CANAL}");
            espera = Duration::from_secs(1);
            if ja_conectou {
                // Voltou depois de cair: o que mudou no intervalo não chegou como aviso.
                let _ = app.emit(EVENTO_RECONECTADO, ());
            }
            ja_conectou = true;
            escutar(&app, &mut listener).await;
            warn!("Ao vivo: conexão da escuta caiu; reconectando");
            tokio::time::sleep(espera).await;
        }
    });
}

/// Repassa avisos até a conexão cair.
async fn escutar(app: &AppHandle, listener: &mut PgListener) {
    loop {
        let primeiro = match listener.try_recv().await {
            Ok(Some(aviso)) => aviso.payload().to_string(),
            Ok(None) | Err(_) => return,
        };
        // Junta o que chegar logo em seguida (uma entrada que mexe em várias linhas).
        let mut lote = vec![primeiro];
        let prazo = tokio::time::Instant::now() + Duration::from_millis(JANELA_MS);
        while let Ok(resultado) = tokio::time::timeout_at(prazo, listener.try_recv()).await {
            match resultado {
                Ok(Some(aviso)) => lote.push(aviso.payload().to_string()),
                Ok(None) | Err(_) => {
                    repassar(app, &lote).await;
                    return;
                }
            }
        }
        repassar(app, &lote).await;
    }
}

async fn repassar(app: &AppHandle, lote: &[String]) {
    let Ok(pool) = get_pool().await else { return };
    // Sem sessão desbloqueada não há empresa ativa: a tela recarrega ao abrir.
    let Ok(empresa_id) = require_active_session_company_id_without_touch(&pool).await else { return };
    let mudancas = mudancas_da_empresa(lote, empresa_id);
    if mudancas.is_empty() {
        return;
    }
    debug!("Ao vivo: {} mudança(s)", mudancas.len());
    let _ = app.emit(EVENTO_MUDANCAS, &mudancas);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filtra_pela_empresa_e_tira_repetidos() {
        let lote = vec![
            r#"{"e": 1, "t": "equipamentos", "id": 7, "ref": null, "op": "I"}"#.to_string(),
            r#"{"e": 2, "t": "equipamentos", "id": 8, "ref": null, "op": "I"}"#.to_string(),
            r#"{"e": 1, "t": "equipamentos", "id": 7, "ref": null, "op": "I"}"#.to_string(),
            r#"{"e": 1, "t": "verificacoes", "id": 3, "ref": 7, "op": "U"}"#.to_string(),
            "não é json".to_string(),
        ];
        let mudancas = mudancas_da_empresa(&lote, 1);
        assert_eq!(mudancas.len(), 2);
        assert_eq!(mudancas[0], Mudanca { tabela: "equipamentos".into(), id: Some(7), referencia: None, operacao: "I".into() });
        assert_eq!(mudancas[1].referencia, Some(7));
        assert!(mudancas_da_empresa(&lote, 3).is_empty());
    }

    #[test]
    fn recebe_gastos_legados_sem_identificador_e_filtra_os_demais_pela_empresa() {
        let lote = [
            r#"{"e":null,"t":"gastos_fixos","id":null,"ref":null,"op":"I"}"#.to_string(),
            r#"{"e":null,"t":"gastos_variaveis","id":null,"ref":null,"op":"D"}"#.to_string(),
            r#"{"e":null,"t":"clientes","id":null,"ref":null,"op":"I"}"#.to_string(),
            r#"{"e":null,"t":"gastos_fixos","id":8,"ref":null,"op":"U"}"#.to_string(),
            r#"{"e":2,"t":"gastos_variaveis","id":9,"ref":null,"op":"U"}"#.to_string(),
        ];

        let tabelas = |empresa| mudancas_da_empresa(&lote, empresa)
            .into_iter().map(|mudanca| mudanca.tabela).collect::<Vec<_>>();
        assert_eq!(tabelas(1), ["gastos_fixos", "gastos_variaveis"]);
        assert_eq!(tabelas(2), ["gastos_fixos", "gastos_variaveis", "gastos_variaveis"]);
    }

    /// Escuta real contra o PostgreSQL de teste (precisa de DATABASE_URL e da migration 0055).
    #[tokio::test]
    #[ignore = "precisa de PostgreSQL com a migration 0055 (DATABASE_URL)"]
    async fn escuta_recebe_aviso_do_gatilho() {
        let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
        let pool = sqlx::PgPool::connect(&url).await.expect("pool");
        let mut listener = PgListener::connect_with(&pool).await.expect("listener");
        listener.listen(CANAL).await.expect("listen");
        let empresa: i32 = sqlx::query_scalar("INSERT INTO empresas (nome, email) VALUES ('Ao vivo teste', 'aovivo@t.test') RETURNING id")
            .fetch_one(&pool).await.expect("empresa");
        sqlx::query("INSERT INTO clientes (nome, tipo_pessoa, empresa_id) VALUES ('Cliente ao vivo', 'PF', $1)")
            .bind(empresa).execute(&pool).await.expect("cliente");
        let aviso = tokio::time::timeout(Duration::from_secs(5), listener.recv()).await.expect("chegou a tempo").expect("aviso");
        let mudancas = mudancas_da_empresa(&[aviso.payload().to_string()], empresa);
        sqlx::query("DELETE FROM clientes WHERE empresa_id = $1").bind(empresa).execute(&pool).await.ok();
        sqlx::query("DELETE FROM empresas WHERE id = $1").bind(empresa).execute(&pool).await.ok();
        assert_eq!(mudancas.len(), 1);
        assert_eq!(mudancas[0].tabela, "clientes");
        assert_eq!(mudancas[0].operacao, "I");
    }
}
