//! Ativação por código de primeiro acesso com PostgreSQL e keyring reais.
//!
//! Requer um Secret Service (ex.: gnome-keyring desbloqueado). Com `AUTOOS_TEST_KEYRING_LOCKED=1`
//! roda só o cenário de cofre indisponível (aponte `DBUS_SESSION_BUS_ADDRESS` para um socket
//! inexistente): a ativação falha com mensagem em português, sem transação aberta nem linha do
//! código travada, e o mesmo código continua valendo.
#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use commands::auth;
use sqlx::PgPool;

const NOME: &str = "Test Codigo Primeiro Acesso";

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

async fn limpar(pool: &PgPool) {
    let _ = sqlx::query("DELETE FROM security_profiles WHERE nome LIKE $1 || '%'")
        .bind(NOME)
        .execute(pool)
        .await;
}

async fn criar_perfil(pool: &PgPool) -> Result<i32> {
    let permissions = serde_json::to_string(&Vec::<String>::new())?;
    sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, pin_required, atualizado_em)
         VALUES ($1, 'ATENDENTE', $2, true, false, true, NOW())
         RETURNING id",
    )
    .bind(NOME)
    .bind(&permissions)
    .fetch_one(pool)
    .await
    .context("Falha ao criar perfil de teste")
}

async fn emitir(pool: &PgPool, profile_id: i32) -> Result<String> {
    let admin_id: i32 = sqlx::query_scalar("SELECT id FROM security_profiles WHERE is_default AND ativo LIMIT 1")
        .fetch_one(pool)
        .await
        .context("Perfil padrão ausente")?;
    let mut tx = pool.begin().await?;
    let (codigo, _) = tauri_result(
        auth::emitir_codigo_primeiro_acesso(&mut tx, profile_id, admin_id).await,
        "Falha ao emitir código",
    )?;
    tx.commit().await?;
    Ok(codigo)
}

async fn estado_codigo(pool: &PgPool, profile_id: i32) -> Result<(i32, bool, bool)> {
    let (tentativas, usado, revogado): (i32, bool, bool) = sqlx::query_as(
        "SELECT tentativas, usado_em IS NOT NULL, revogado_em IS NOT NULL
         FROM codigos_primeiro_acesso WHERE profile_id = $1 ORDER BY id DESC LIMIT 1",
    )
    .bind(profile_id)
    .fetch_one(pool)
    .await?;
    Ok((tentativas, usado, revogado))
}

fn pin_gravado(profile_id: i32) -> bool {
    matches!(auth::load_profile_pin(profile_id), Ok(Some(_)))
}

fn limpar_keyring(profile_id: i32) {
    if let Ok(entry) = keyring::Entry::new("autoos", &format!("sensitive_access_profile_{profile_id}")) {
        let _ = entry.delete_password();
    }
}

async fn ociosas_em_transacao(pool: &PgPool) -> Result<i64> {
    sqlx::query_scalar(
        "SELECT COUNT(*) FROM pg_stat_activity
         WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> pg_backend_pid()",
    )
    .fetch_one(pool)
    .await
    .context("pg_stat_activity")
}

async fn linha_do_codigo_livre(pool: &PgPool, profile_id: i32) -> Result<bool> {
    let mut conn = pool.acquire().await?;
    sqlx::query("BEGIN").execute(&mut *conn).await?;
    let travada = sqlx::query(
        "SELECT id FROM codigos_primeiro_acesso WHERE profile_id = $1 AND usado_em IS NULL AND revogado_em IS NULL
         FOR UPDATE NOWAIT",
    )
    .bind(profile_id)
    .fetch_all(&mut *conn)
    .await
    .is_err();
    sqlx::query("ROLLBACK").execute(&mut *conn).await?;
    Ok(!travada)
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("Falha ao inicializar PostgreSQL")?;
    limpar(&pool).await;
    let cofre_travado = std::env::var("AUTOOS_TEST_KEYRING_LOCKED").is_ok_and(|value| value == "1");

    if !cofre_travado {
        // Pré-condição: sem Secret Service desbloqueado os cenários abaixo não dizem nada.
        let sonda = keyring::Entry::new("autoos", "test_codigo_primeiro_acesso_sonda")
            .map_err(|e| anyhow!("keyring indisponível: {e}"))?;
        sonda.set_password("ok").map_err(|e| anyhow!("keyring bloqueado ou ausente: {e}"))?;
        let _ = sonda.delete_password();
    }

    if cofre_travado {
        cenario_cofre_travado(&pool).await?;
    } else {
        cenario_fluxo_completo(&pool).await?;
    }
    limpar(&pool).await;
    println!("TEST_CODIGO_PRIMEIRO_ACESSO_OK modo={}", if cofre_travado { "cofre_travado" } else { "completo" });
    Ok(())
}

async fn cenario_fluxo_completo(pool: &PgPool) -> Result<()> {
    let profile_id = criar_perfil(pool).await?;
    limpar_keyring(profile_id);
    let codigo = emitir(pool, profile_id).await?;

    // Código errado: conta tentativa, não mexe no keyring.
    let erro = auth::ativar_perfil_com_codigo(profile_id, "ZZZ-ZZZ".into(), "2468".into(), "2468".into())
        .await
        .expect_err("código errado deve falhar");
    assert!(erro.contains("Código inválido"), "mensagem inesperada: {erro}");
    assert_eq!(estado_codigo(pool, profile_id).await?, (1, false, false));
    assert!(!pin_gravado(profile_id), "PIN não pode ser gravado com código errado");

    // Código certo: grava o PIN, consome o código e abre a sessão.
    let status = tauri_result(
        auth::ativar_perfil_com_codigo(profile_id, codigo.clone(), "2468".into(), "2468".into()).await,
        "Ativação com o código certo",
    )?;
    assert!(status.unlocked, "a sessão deve abrir após a ativação");
    assert!(pin_gravado(profile_id), "o PIN deve estar no keyring");
    let (_, usado, _) = estado_codigo(pool, profile_id).await?;
    assert!(usado, "o código deve constar como usado");

    // Segundo uso do mesmo código falha e não troca o PIN.
    let erro = auth::ativar_perfil_com_codigo(profile_id, codigo, "1357".into(), "1357".into())
        .await
        .expect_err("código usado não pode valer de novo");
    assert!(erro.contains("Código inválido"), "mensagem inesperada: {erro}");
    let guardado = auth::load_profile_pin(profile_id).ok().flatten().ok_or_else(|| anyhow!("PIN sumiu"))?;
    assert!(
        auth::verify_pin("2468", &guardado),
        "o PIN original deve continuar valendo"
    );

    // Código que deixa de valer entre a conferência e o consumo: o PIN anterior volta ao keyring.
    let outro = emitir(pool, profile_id).await?;
    let anterior = auth::load_profile_pin(profile_id).ok().flatten();
    let codigo_id = tauri_result(
        auth::conferir_codigo_primeiro_acesso(
            pool,
            &auth::SecurityProfileSummary { id: profile_id, nome: NOME.to_string(), role: "ATENDENTE".to_string(), ..Default::default() },
            &auth::normalizar_codigo_acesso(&outro),
        )
        .await,
        "Conferência do código",
    )?;
    assert_eq!(ociosas_em_transacao(pool).await?, 0, "a conferência não pode deixar transação aberta");
    assert!(linha_do_codigo_livre(pool, profile_id).await?, "a linha do código deve estar livre após conferir");
    tauri_result(auth::store_profile_pin(profile_id, "9999"), "Gravação do PIN novo")?;
    let escrito = auth::load_profile_pin(profile_id).ok().flatten();
    sqlx::query("UPDATE codigos_primeiro_acesso SET revogado_em = NOW() WHERE id = $1")
        .bind(codigo_id)
        .execute(pool)
        .await?;
    let consumido = tauri_result(auth::consumir_codigo_primeiro_acesso(pool, codigo_id).await, "Consumo")?;
    assert!(!consumido, "código revogado não pode ser consumido");
    auth::restaurar_pin_anterior(profile_id, anterior, escrito).await;
    let restaurado = auth::load_profile_pin(profile_id).ok().flatten().ok_or_else(|| anyhow!("PIN anterior sumiu"))?;
    assert!(
        auth::verify_pin("2468", &restaurado),
        "o PIN anterior deve voltar quando o código não pode ser consumido"
    );

    // Sem PIN anterior, restaurar significa remover o que foi gravado.
    limpar_keyring(profile_id);
    tauri_result(auth::store_profile_pin(profile_id, "9999"), "Gravação do PIN novo (sem anterior)")?;
    let escrito = auth::load_profile_pin(profile_id).ok().flatten();
    auth::restaurar_pin_anterior(profile_id, None, escrito.clone()).await;
    assert!(!pin_gravado(profile_id), "sem PIN anterior, a restauração remove o PIN gravado");

    // Duas ativações simultâneas com o mesmo código: uma vence, a outra falha, e o PIN da vencedora fica.
    limpar_keyring(profile_id);
    let dupla = emitir(pool, profile_id).await?;
    // Duas tarefas em threads diferentes, como dois envios do wizard no mesmo processo.
    let primeira = tokio::spawn(auth::ativar_perfil_com_codigo(profile_id, dupla.clone(), "1111".into(), "1111".into()));
    let segunda = tokio::spawn(auth::ativar_perfil_com_codigo(profile_id, dupla, "1111".into(), "1111".into()));
    let (a, b) = (primeira.await?, segunda.await?);
    assert_eq!([a.is_ok(), b.is_ok()].iter().filter(|ok| **ok).count(), 1, "exatamente uma ativação deve vencer");
    let (_, usado, _) = estado_codigo(pool, profile_id).await?;
    assert!(usado, "o código deve constar como usado");
    assert!(pin_gravado(profile_id), "duas ativações simultâneas não podem deixar o computador sem PIN");

    // Se o PIN do cofre já não é o que esta chamada gravou, a compensação não apaga nada.
    tauri_result(auth::store_profile_pin(profile_id, "5555"), "Gravação de outro PIN")?;
    auth::restaurar_pin_anterior(profile_id, None, escrito).await;
    let alheio = auth::load_profile_pin(profile_id).ok().flatten().ok_or_else(|| anyhow!("PIN alheio foi apagado"))?;
    assert!(auth::verify_pin("5555", &alheio), "um PIN que não é o desta chamada não pode ser apagado");

    limpar_keyring(profile_id);
    cenario_leitura_do_cofre_fail_closed(pool).await?;
    Ok(())
}

/// Cofre indisponível não pode virar "sem PIN": perfil que não exige PIN mas tem PIN local não
/// abre a sessão sem ele, e o status avisa em vez de falhar ou repetir leituras.
async fn cenario_leitura_do_cofre_fail_closed(pool: &PgPool) -> Result<()> {
    let permissions = serde_json::to_string(&Vec::<String>::new())?;
    let opcional: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, pin_required, atualizado_em)
         VALUES ($1, 'ATENDENTE', $2, true, false, false, NOW())
         RETURNING id",
    )
    .bind(format!("{NOME} (PIN opcional)"))
    .bind(&permissions)
    .fetch_one(pool)
    .await?;
    limpar_keyring(opcional);
    tauri_result(auth::store_profile_pin(opcional, "4321"), "PIN local do perfil opcional")?;
    let resumo = auth::SecurityProfileSummary {
        id: opcional,
        nome: format!("{NOME} (PIN opcional)"),
        role: "ATENDENTE".to_string(),
        pin_required: false,
        ..Default::default()
    };
    // Seleciona o perfil e fecha a sessão: o que importa é o que `unlock_session_without_pin` decide.
    tauri_result(auth::unlock_session(resumo), "Seleção do perfil opcional")?;
    {
        let mut sessao = auth::session_state().lock().map_err(|e| anyhow!("{e}"))?;
        sessao.unlocked_until = None;
        sessao.profile_obfuscated = None;
        sessao.profile_key = None;
    }

    // Cofre normal: o PIN local existe, então abrir sem PIN é recusado e o status não avisa nada.
    let erro = auth::unlock_session_without_pin().await.expect_err("há PIN local");
    assert!(erro.contains("possui um PIN local"), "mensagem inesperada: {erro}");
    let status = tauri_result(auth::get_sensitive_access_status().await, "Status com o cofre normal")?;
    assert!(!status.keyring_bloqueado, "o cofre responde");
    assert!(status.profiles.iter().any(|p| p.id == opcional && p.pin_configured), "o PIN local deve aparecer");

    // Cofre indisponível: nada de sessão sem PIN, e o status avisa sem falhar.
    let anterior = std::env::var("DBUS_SESSION_BUS_ADDRESS").ok();
    std::env::set_var("DBUS_SESSION_BUS_ADDRESS", "unix:path=/nonexistent");
    let sem_cofre = auth::unlock_session_without_pin().await;
    let status_sem_cofre = auth::get_sensitive_access_status().await;
    match &anterior {
        Some(valor) => std::env::set_var("DBUS_SESSION_BUS_ADDRESS", valor),
        None => std::env::remove_var("DBUS_SESSION_BUS_ADDRESS"),
    }
    let erro = sem_cofre.expect_err("sem o cofre não pode abrir sessão sem PIN");
    assert!(erro.contains("cofre de senhas"), "a recusa deve explicar o cofre: {erro}");
    assert!(auth::current_session_profile().map_err(|e| anyhow!("{e}"))?.is_none(), "nenhuma sessão pode ter sido aberta");
    let status_sem_cofre = tauri_result(status_sem_cofre, "O status não pode falhar com o cofre indisponível")?;
    assert!(status_sem_cofre.keyring_bloqueado, "o status deve marcar o cofre como bloqueado");
    assert!(status_sem_cofre.profiles.iter().all(|p| !p.pin_configured), "pin_configured é desconhecido sem o cofre");

    let _ = sqlx::query("DELETE FROM security_profiles WHERE id = $1").bind(opcional).execute(pool).await;
    limpar_keyring(opcional);
    Ok(())
}

async fn cenario_cofre_travado(pool: &PgPool) -> Result<()> {
    // Sem Secret Service (DBUS_SESSION_BUS_ADDRESS apontando para um socket inexistente) a gravação do
    // PIN falha. A pessoa recebe a mensagem em português e o mesmo código continua valendo.
    let profile_id = criar_perfil(pool).await?;
    let codigo = emitir(pool, profile_id).await?;

    let erro = auth::ativar_perfil_com_codigo(profile_id, codigo.clone(), "2468".into(), "2468".into())
        .await
        .expect_err("sem cofre a ativação não pode ter sucesso");
    println!("erro={erro}");
    assert!(erro.contains("cofre de senhas"), "a mensagem deve falar do cofre: {erro}");
    assert!(erro.contains("O código continua válido."), "deve avisar que o código vale: {erro}");
    assert!(!erro.contains("zbus") && !erro.contains("Platform"), "sem texto cru da plataforma: {erro}");
    assert_eq!(ociosas_em_transacao(pool).await?, 0, "nenhuma transação pode ficar aberta");
    assert!(linha_do_codigo_livre(pool, profile_id).await?, "a linha do código não pode ficar travada");
    assert_eq!(estado_codigo(pool, profile_id).await?, (0, false, false), "o código deve continuar válido");
    Ok(())
}
