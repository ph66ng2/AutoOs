#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use commands::auth;
use commands::clientes;
use commands::equipamentos;
use commands::servicos;
use commands::verificacoes;
use commands::types::{ClienteInput, EquipamentoInput, VerificacaoInput};

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("init db failed")?;
    let suffix = Utc::now().format("%Y%m%d%H%M%S").to_string();

    let _ = auth::lock_sensitive_access().await;

    let cliente = clientes::criar_cliente(ClienteInput {
        nome: Some(format!("Budget Cliente {}", suffix)),
        tipo_pessoa: Some("PF".to_string()),
        documento: Some(format!("{:011}", Utc::now().timestamp_millis().rem_euclid(100_000_000_000))),
        telefone: "11999999999".to_string(),
        email: Some(format!("budget.{}@autoos.local", suffix)),
        ..ClienteInput::default()
    }).await.map_err(|e| anyhow!(e))?;

    let equipamento = equipamentos::criar_equipamento(EquipamentoInput {
        serial_number: format!("BUDGET-SN-{}", suffix),
        marca: "HP".to_string(),
        modelo: "M404".to_string(),
        tipo: "IMPRESSORA".to_string(),
        status: "RECEBIDO".to_string(),
        defeito_relatado: Some("Teste budget service".to_string()),
        data_entrada: Utc::now().date_naive().to_string(),
        cliente_id: Some(cliente.id),
        cliente_nome: cliente.nome.clone(),
        cliente_telefone: Some(cliente.telefone.clone()),
        cliente_email: cliente.email.clone(),
        ..EquipamentoInput::default()
    }).await.map_err(|e| anyhow!(e))?;

    let _verificacao = verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id: equipamento.id,
        tecnico_nome: "Técnico Teste".to_string(),
        problema_relatado: "Problema teste".to_string(),
        servicos_necessarios: Some("[]".to_string()),
        pecas_necessarias: Some("[]".to_string()),
        ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;

    sqlx::query("INSERT INTO servicos_catalogo (nome, descricao, preco_padrao) VALUES ($1, $2, $3)")
        .bind(format!("Serviço Budget A {}", suffix))
        .bind("Descrição A")
        .bind(50.0)
        .execute(&pool)
        .await
        .context("insert servico A failed")?;
    sqlx::query("INSERT INTO servicos_catalogo (nome, descricao, preco_padrao) VALUES ($1, $2, $3)")
        .bind(format!("Serviço Budget B {}", suffix))
        .bind("Descrição B")
        .bind(75.0)
        .execute(&pool)
        .await
        .context("insert servico B failed")?;
    sqlx::query("INSERT INTO servicos_catalogo (nome, descricao, preco_padrao, ativo) VALUES ($1, $2, $3, false)")
        .bind(format!("Serviço Inativo {}", suffix))
        .bind("Inativo")
        .bind(100.0)
        .execute(&pool)
        .await
        .context("insert servico inativo failed")?;

    let ativos = servicos::listar_servicos_catalogo_ativos().await.map_err(|e| anyhow!(e))?;
    let has_active_a = ativos.iter().any(|s| s.nome == format!("Serviço Budget A {}", suffix));
    let has_active_b = ativos.iter().any(|s| s.nome == format!("Serviço Budget B {}", suffix));
    let has_inactive = ativos.iter().any(|s| s.nome == format!("Serviço Inativo {}", suffix));
    if !has_active_a || !has_active_b {
        return Err(anyhow!("active services should be in catalog list"));
    }
    if has_inactive {
        return Err(anyhow!("inactive service should NOT be in catalog list"));
    }

    let previous_default_id: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .context("fetch previous default profile failed")?;

    let restricted_permissions = serde_json::to_string(&vec![
        auth::PERMISSION_STOCK_CONTROL.to_string(),
    ])
    .context("serialize restricted permissions failed")?;
    let restricted_profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'OPERADOR', $2, true, false, NOW()) RETURNING id",
    )
    .bind(format!("Budget Restricted {}", suffix))
    .bind(restricted_permissions)
    .fetch_one(&pool)
    .await
    .context("create restricted profile failed")?;

    sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
        .bind(restricted_profile_id)
        .execute(&pool)
        .await
        .context("set restricted profile default failed")?;

    auth::unlock_session_without_pin().await.map_err(|e| anyhow!(e))?;

    let denied = verificacoes::atualizar_servicos_verificacao(
        equipamento.id,
        Some("[{\"nome\":\"Serviço A\"}]".to_string()),
        Some("[]".to_string()),
        Some(150.0),
        restricted_profile_id,
        false,
    ).await;
    if denied.is_ok() {
        return Err(anyhow!("expected denied financial transition but it was allowed"));
    }

    let _ = auth::lock_sensitive_access().await;

    let privileged_permissions = serde_json::to_string(&vec![
        auth::PERMISSION_FINANCIAL_ACTIONS.to_string(),
        auth::PERMISSION_STOCK_CONTROL.to_string(),
    ])
    .context("serialize privileged permissions failed")?;
    let privileged_profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'OPERADOR', $2, true, false, NOW()) RETURNING id",
    )
    .bind(format!("Budget Privileged {}", suffix))
    .bind(privileged_permissions)
    .fetch_one(&pool)
    .await
    .context("create privileged profile failed")?;

    sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
        .bind(privileged_profile_id)
        .execute(&pool)
        .await
        .context("set privileged profile default failed")?;

    auth::unlock_session_without_pin().await.map_err(|e| anyhow!(e))?;

    let updated = verificacoes::atualizar_servicos_verificacao(
        equipamento.id,
        Some("[{\"nome\":\"Serviço A\"},{\"nome\":\"Serviço B\"}]".to_string()),
        Some("[{\"nome\":\"Peça 1\"}]".to_string()),
        Some(225.0),
        privileged_profile_id,
        false,
    ).await.map_err(|e| anyhow!(e))?;

    if updated.custo_total != Some(225.0) {
        return Err(anyhow!("expected custo_total=225.0, got {:?}", updated.custo_total));
    }
    let expected_servicos = Some("[{\"nome\":\"Serviço A\"},{\"nome\":\"Serviço B\"}]".to_string());
    if updated.servicos_necessarios != expected_servicos {
        return Err(anyhow!("servicos_necessarios not updated correctly: got {:?}", updated.servicos_necessarios));
    }
    let expected_pecas = Some("[{\"nome\":\"Peça 1\"}]".to_string());
    if updated.pecas_necessarias != expected_pecas {
        return Err(anyhow!("pecas_necessarias not updated correctly: got {:?}", updated.pecas_necessarias));
    }

    let equipamento_final = equipamentos::buscar_equipamento(equipamento.id).await.map_err(|e| anyhow!(e))?;
    if equipamento_final.valor_orcamento != Some(225.0) {
        return Err(anyhow!("expected valor_orcamento=225.0, got {:?}", equipamento_final.valor_orcamento));
    }

    let adjusted: (Option<String>, Option<i32>) = sqlx::query_as(
        "SELECT adjusted_at::TEXT, adjusted_by_profile_id FROM verificacoes WHERE equipamento_id = $1"
    )
    .bind(equipamento.id)
    .fetch_one(&pool)
    .await
    .context("fetch adjusted info failed")?;
    if adjusted.0.is_none() {
        return Err(anyhow!("adjusted_at should be set"));
    }
    if adjusted.1 != Some(privileged_profile_id) {
        return Err(anyhow!("adjusted_by_profile_id mismatch: expected {}, got {:?}", privileged_profile_id, adjusted.1));
    }

    let audit_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM security_audit_log WHERE event_type = 'BUDGET_ADJUSTED' AND details LIKE $1"
    )
    .bind(format!("%equipamento_id={}%", equipamento.id))
    .fetch_one(&pool)
    .await
    .context("audit count failed")?;
    if audit_count < 1 {
        return Err(anyhow!("should have BUDGET_ADJUSTED audit event"));
    }

    sqlx::query("DELETE FROM servicos_catalogo WHERE nome LIKE $1 OR nome LIKE $2 OR nome LIKE $3")
        .bind(format!("%Serviço Budget A {}%", suffix))
        .bind(format!("%Serviço Budget B {}%", suffix))
        .bind(format!("%Serviço Inativo {}%", suffix))
        .execute(&pool)
        .await
        .context("cleanup servicos failed")?;
    sqlx::query("DELETE FROM equipamentos WHERE id = $1")
        .bind(equipamento.id)
        .execute(&pool)
        .await
        .context("cleanup equipamento failed")?;
    sqlx::query("DELETE FROM clientes WHERE id = $1")
        .bind(cliente.id)
        .execute(&pool)
        .await
        .context("cleanup cliente failed")?;
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

    println!("TEST_BUDGET_SERVICE_MGMT_OK");
    println!("TEST_BUDGET_CATALOG_ATIVOS_OK");
    println!("TEST_BUDGET_PERMISSION_DENIED_OK");
    println!("TEST_BUDGET_PERMISSION_ALLOWED_OK");
    println!("TEST_BUDGET_SYNC_OK");
    println!("TEST_BUDGET_AUDIT_OK");
    Ok(())
}
