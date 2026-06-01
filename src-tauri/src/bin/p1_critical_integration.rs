#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use commands::auth;
use commands::clientes;
use commands::equipamentos;
use commands::produtos;
use commands::types::{ClienteInput, EquipamentoInput, MovimentacaoEstoqueInput, ProdutoInput};

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("init db failed")?;
    let suffix = Utc::now().format("%Y%m%d%H%M%S").to_string();

    let _ = auth::lock_sensitive_access().await;

    let previous_default_id: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .context("fetch previous default profile failed")?;

    let cliente = clientes::criar_cliente(ClienteInput {
        nome: Some(format!("P1 Cliente {}", suffix)),
        tipo_pessoa: Some("PF".to_string()),
        documento: Some(format!("{:011}", Utc::now().timestamp_millis().rem_euclid(100_000_000_000))),
        telefone: "11999999999".to_string(),
        email: Some(format!("p1.{}@autoos.local", suffix)),
        ..ClienteInput::default()
    }).await.map_err(|e| anyhow!(e))?;

    let equipamento = equipamentos::criar_equipamento(EquipamentoInput {
        serial_number: format!("P1-SN-{}", suffix),
        marca: "HP".to_string(),
        modelo: "M404".to_string(),
        tipo: "IMPRESSORA".to_string(),
        status: "RECEBIDO".to_string(),
        defeito_relatado: Some("Teste integracao".to_string()),
        data_entrada: Utc::now().date_naive().to_string(),
        cliente_id: Some(cliente.id),
        cliente_nome: cliente.nome.clone(),
        cliente_telefone: Some(cliente.telefone.clone()),
        cliente_email: cliente.email.clone(),
        ..EquipamentoInput::default()
    }).await.map_err(|e| anyhow!(e))?;

    let restricted_profile_permissions = serde_json::to_string(&vec![
        auth::PERMISSION_STOCK_CONTROL.to_string(),
        auth::PERMISSION_CONFIG_SMTP.to_string(),
        auth::PERMISSION_MANAGE_PROFILES.to_string(),
    ])
    .context("serialize restricted permissions failed")?;
    let restricted_profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'OPERADOR', $2, true, false, NOW()) RETURNING id",
    )
    .bind(format!("P1 Restricted {}", suffix))
    .bind(restricted_profile_permissions)
    .fetch_one(&pool)
    .await
    .context("create restricted profile failed")?;

    sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
        .bind(restricted_profile_id)
        .execute(&pool)
        .await
        .context("set restricted profile default failed")?;

    auth::configure_sensitive_pin("2468".to_string(), None)
        .await
        .map_err(|e| anyhow!(e))?;

    // denied path for sensitive financial status with unlocked profile lacking permission
    let denied = equipamentos::atualizar_status_equipamento(
        equipamento.id,
        "APROVADO".to_string(),
        Some(199.0),
        None,
        None,
        equipamento.atualizado_em.clone(),
    )
    .await;
    if denied.is_ok() {
        return Err(anyhow!("expected denied financial transition but it was allowed"));
    }

    let privileged_permissions = serde_json::to_string(&vec![
        auth::PERMISSION_FINANCIAL_ACTIONS.to_string(),
        auth::PERMISSION_STOCK_CONTROL.to_string(),
        auth::PERMISSION_CONFIG_SMTP.to_string(),
    ])
    .context("serialize privileged permissions failed")?;
    let privileged_profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'OPERADOR', $2, true, false, NOW()) RETURNING id",
    )
    .bind(format!("P1 Privileged {}", suffix))
    .bind(privileged_permissions)
    .fetch_one(&pool)
    .await
    .context("create privileged profile failed")?;

    sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
        .bind(privileged_profile_id)
        .execute(&pool)
        .await
        .context("set privileged profile default failed")?;

    auth::configure_sensitive_pin("2468".to_string(), None)
        .await
        .map_err(|e| anyhow!(e))?;

    equipamentos::atualizar_status_equipamento(
        equipamento.id,
        "APROVADO".to_string(),
        Some(199.0),
        None,
        None,
        equipamento.atualizado_em.clone(),
    )
        .await
        .map_err(|e| anyhow!(e))?;

    let produto = produtos::criar_produto(ProdutoInput {
        codigo: format!("P1-{}", suffix),
        nome: format!("Produto {}", suffix),
        categoria: "TONER".to_string(),
        quantidade_estoque: 10,
        quantidade_minima: Some(2),
        quantidade_maxima: Some(30),
        unidade_medida: Some("UN".to_string()),
        preco_custo: 10.0,
        preco_venda: 20.0,
        ..ProdutoInput::default()
    }).await.map_err(|e| anyhow!(e))?;

    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
        produto_id: produto.id,
        tipo: "ENTRADA".to_string(),
        quantidade: 5,
        origem: "p1_critical_integration".to_string(),
        referencia: Some("entrada".to_string()),
    }).await.map_err(|e| anyhow!(e))?;

    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
        produto_id: produto.id,
        tipo: "SAIDA".to_string(),
        quantidade: 3,
        origem: "p1_critical_integration".to_string(),
        referencia: Some("saida".to_string()),
    }).await.map_err(|e| anyhow!(e))?;

    let produto_final = produtos::buscar_produto(produto.id).await.map_err(|e| anyhow!(e))?;
    let saldo = produto_final.quantidade_estoque.unwrap_or_default();
    if saldo != 12 {
        return Err(anyhow!("unexpected final stock: {}", saldo));
    }

    let status_final: String = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id = $1")
        .bind(equipamento.id)
        .fetch_one(&pool)
        .await
        .context("fetch status failed")?;

    println!("P1_INTEGRATION_PERMISSION_DENIED=ok");
    println!("P1_INTEGRATION_PERMISSION_ALLOWED=ok");
    println!("P1_INTEGRATION_STOCK_OK=ok:saldo_final={}", saldo);
    println!("P1_INTEGRATION_STATUS_OK=ok:{}", status_final);
    println!("P1_INTEGRATION_OK");

    sqlx::query("DELETE FROM movimentacoes_estoque WHERE produto_id = $1")
        .bind(produto.id)
        .execute(&pool)
        .await
        .context("cleanup stock movements failed")?;
    sqlx::query("DELETE FROM produtos WHERE id = $1")
        .bind(produto.id)
        .execute(&pool)
        .await
        .context("cleanup product failed")?;
    sqlx::query("DELETE FROM equipamentos WHERE id = $1")
        .bind(equipamento.id)
        .execute(&pool)
        .await
        .context("cleanup equipment failed")?;
    sqlx::query("DELETE FROM clientes WHERE id = $1")
        .bind(cliente.id)
        .execute(&pool)
        .await
        .context("cleanup client failed")?;
    sqlx::query("DELETE FROM security_profiles WHERE id = $1 OR id = $2")
        .bind(restricted_profile_id)
        .bind(privileged_profile_id)
        .execute(&pool)
        .await
        .context("cleanup temporary profiles failed")?;
    if let Some(previous_default_id) = previous_default_id {
        sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
            .bind(previous_default_id)
            .execute(&pool)
            .await
            .context("restore previous default profile failed")?;
    }

    Ok(())
}
