#[path = "../commands/mod.rs"]
mod commands;
#[path = "../db.rs"]
mod db;
#[path = "../test_support/memory_keyring.rs"]
mod memory_keyring;

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use commands::auth;
use commands::clientes;
use commands::contatos;
use commands::equipamentos;
use commands::produtos;
use commands::types::{
    AprovarOrcamentoInput, ClienteContatoInput, ClienteInput, EquipamentoInput, FormaPagamento,
    FormaPagamentoCodigo, MovimentacaoEstoqueInput, ProdutoInput, VerificacaoInput,
};
use commands::verificacoes;

#[tokio::main]
async fn main() -> Result<()> {
    memory_keyring::install();
    let pool = db::init_database().await.context("init db failed")?;
    let suffix = Utc::now().format("%Y%m%d%H%M%S%3f").to_string();
    let prefix = format!("TESTE-CONTATO-{}", suffix);

    let _ = auth::lock_sensitive_access().await;

    let previous_default_id: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .context("fetch previous default profile failed")?;

    let empresa_id: i32 = sqlx::query_scalar(
        "INSERT INTO empresas (nome, email, status) VALUES ($1, $2, 'ativo') RETURNING id",
    )
    .bind(format!("{} Empresa", prefix))
    .bind(format!("{}@example.test", prefix.to_lowercase()))
    .fetch_one(&pool)
    .await
    .context("create synthetic company failed")?;

    let cliente = clientes::criar_cliente(ClienteInput {
        empresa_id: Some(empresa_id),
        nome: Some(format!("{} Cliente", prefix)),
        tipo_pessoa: Some("PF".to_string()),
        documento: Some(format!(
            "{:011}",
            Utc::now().timestamp_millis().rem_euclid(100_000_000_000)
        )),
        telefone: "11999999999".to_string(),
        email: Some(format!("{}-cliente@example.test", prefix.to_lowercase())),
        ..ClienteInput::default()
    })
    .await
    .map_err(|error| anyhow!(error))?;
    let contato = contatos::criar_cliente_contato(ClienteContatoInput {
        empresa_id,
        cliente_id: cliente.id,
        nome: format!("{} Responsável Original", prefix),
        email: Some(format!("{}-contato@example.test", prefix.to_lowercase())),
        telefone: Some("11988887777".to_string()),
        atualizado_em: None,
    })
    .await
    .map_err(|error| anyhow!(error))?;

    let equipamento = equipamentos::criar_equipamento(EquipamentoInput {
        serial_number: format!("{}-SN", prefix),
        marca: "HP".to_string(),
        modelo: "M404".to_string(),
        tipo: "IMPRESSORA".to_string(),
        status: "RECEBIDO".to_string(),
        defeito_relatado: Some(format!("{} Defeito relatado", prefix)),
        data_entrada: Utc::now().date_naive().to_string(),
        cliente_id: Some(cliente.id),
        cliente_nome: cliente.nome.clone(),
        cliente_telefone: Some(cliente.telefone.clone()),
        cliente_email: cliente.email.clone(),
        empresa_id: Some(empresa_id),
        responsavel_contato_id: Some(contato.id),
        ..EquipamentoInput::default()
    })
    .await
    .map_err(|error| anyhow!(error))?;
    let approval_token = equipamento
        .atualizado_em
        .clone()
        .context("created equipment has no concurrency token")?;

    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id: equipamento.id,
        empresa_id: Some(empresa_id),
        tecnico_nome: format!("{} Técnico", prefix),
        problema_relatado: format!("{} Problema", prefix),
        diagnostico: Some(format!("{} Diagnóstico", prefix)),
        observacoes: Some(format!("{} Observação inicial", prefix)),
        concluida: Some(true),
        ..VerificacaoInput::default()
    })
    .await
    .map_err(|error| anyhow!(error))?;
    sqlx::query("UPDATE equipamentos SET status = 'AGUARDANDO_APROVACAO' WHERE id = $1")
        .bind(equipamento.id)
        .execute(&pool)
        .await
        .context("prepare equipment approval status failed")?;

    let restricted_profile_permissions = serde_json::to_string(&vec![
        auth::PERMISSION_STOCK_CONTROL.to_string(),
        auth::PERMISSION_CONFIG_SMTP.to_string(),
        auth::PERMISSION_MANAGE_PROFILES.to_string(),
    ])
    .context("serialize restricted permissions failed")?;
    let restricted_profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'OPERADOR', $2, true, false, NOW()) RETURNING id",
    )
    .bind(format!("{} Restricted", prefix))
    .bind(restricted_profile_permissions)
    .fetch_one(&pool)
    .await
    .context("create restricted profile failed")?;

    sqlx::query(
        "UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true",
    )
    .bind(restricted_profile_id)
    .execute(&pool)
    .await
    .context("set restricted profile default failed")?;

    auth::configure_sensitive_pin("2468".to_string(), None)
        .await
        .map_err(|error| anyhow!(error))?;

    let denied = equipamentos::aprovar_orcamento(AprovarOrcamentoInput {
        empresa_id,
        equipamento_id: equipamento.id,
        expected_updated_em: approval_token.clone(),
        pagamento: FormaPagamento {
            codigo: FormaPagamentoCodigo::Pix,
            detalhe: None,
        },
    })
    .await;
    if denied.is_ok() {
        return Err(anyhow!(
            "expected denied financial approval but it was allowed"
        ));
    }
    assert_approval_state(&pool, equipamento.id, "AGUARDANDO_APROVACAO", None).await?;

    let privileged_permissions = serde_json::to_string(&vec![
        auth::PERMISSION_FINANCIAL_ACTIONS.to_string(),
        auth::PERMISSION_STOCK_CONTROL.to_string(),
        auth::PERMISSION_CONFIG_SMTP.to_string(),
    ])
    .context("serialize privileged permissions failed")?;
    let privileged_profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'OPERADOR', $2, true, false, NOW()) RETURNING id",
    )
    .bind(format!("{} Privileged", prefix))
    .bind(privileged_permissions)
    .fetch_one(&pool)
    .await
    .context("create privileged profile failed")?;

    sqlx::query(
        "UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true",
    )
    .bind(privileged_profile_id)
    .execute(&pool)
    .await
    .context("set privileged profile default failed")?;

    auth::configure_sensitive_pin("2468".to_string(), None)
        .await
        .map_err(|error| anyhow!(error))?;

    let stale_approval = equipamentos::aprovar_orcamento(AprovarOrcamentoInput {
        empresa_id,
        equipamento_id: equipamento.id,
        expected_updated_em: "2000-01-01T00:00:00Z".to_string(),
        pagamento: FormaPagamento {
            codigo: FormaPagamentoCodigo::Boleto,
            detalhe: None,
        },
    })
    .await;
    if stale_approval.is_ok() {
        return Err(anyhow!("expected approval concurrency conflict"));
    }
    assert_approval_state(&pool, equipamento.id, "AGUARDANDO_APROVACAO", None).await?;

    let equipamento_aprovado = equipamentos::aprovar_orcamento(AprovarOrcamentoInput {
        empresa_id,
        equipamento_id: equipamento.id,
        expected_updated_em: approval_token,
        pagamento: FormaPagamento {
            codigo: FormaPagamentoCodigo::Pix,
            detalhe: None,
        },
    })
    .await
    .map_err(|error| anyhow!(error))?;
    assert_approval_state(&pool, equipamento.id, "APROVADO", Some("PIX")).await?;

    let verificacao_ajustada = verificacoes::atualizar_servicos_verificacao(
        equipamento.id,
        Some(r#"[{"descricao":"Limpeza técnica completa","valor":120.0}]"#.to_string()),
        Some(r#"[{"descricao":"Kit de manutenção","valor":79.0}]"#.to_string()),
        Some(199.0),
        privileged_profile_id,
        false,
        Some(format!("{} Descrição editada para o PDF", prefix)),
        Some(FormaPagamentoCodigo::Outro),
        Some("Faturamento corporativo em 15 dias".to_string()),
        Some(empresa_id),
    )
    .await
    .map_err(|error| anyhow!(error))?;
    if verificacao_ajustada.forma_pagamento_codigo.as_deref() != Some("OUTRO")
        || verificacao_ajustada.forma_pagamento_detalhe.as_deref()
            != Some("Faturamento corporativo em 15 dias")
        || verificacao_ajustada.observacoes.as_deref()
            != Some(format!("{} Descrição editada para o PDF", prefix).as_str())
    {
        return Err(anyhow!(
            "budget adjustment did not persist description and payment"
        ));
    }

    contatos::atualizar_cliente_contato(
        contato.id,
        ClienteContatoInput {
            empresa_id,
            cliente_id: cliente.id,
            nome: format!("{} Responsável Editado", prefix),
            email: Some(format!("{}-editado@example.test", prefix.to_lowercase())),
            telefone: Some("11911112222".to_string()),
            atualizado_em: Some(contato.atualizado_em.clone()),
        },
    )
    .await
    .map_err(|error| anyhow!(error))?;
    contatos::inativar_cliente_contato(contato.id, empresa_id)
        .await
        .map_err(|error| anyhow!(error))?;

    let equipamento_com_snapshot = equipamentos::buscar_equipamento(equipamento.id)
        .await
        .map_err(|error| anyhow!(error))?;
    if equipamento_com_snapshot.responsavel_nome.as_deref()
        != Some(format!("{} Responsável Original", prefix).as_str())
        || equipamento_com_snapshot.responsavel_email.as_deref()
            != Some(format!("{}-contato@example.test", prefix.to_lowercase()).as_str())
        || equipamento_com_snapshot.responsavel_telefone.as_deref() != Some("11988887777")
    {
        return Err(anyhow!("equipment responsible snapshot was rewritten"));
    }

    let legacy_equipment_id: i32 = sqlx::query_scalar(
        "INSERT INTO equipamentos
         (empresa_id, serial_number, marca, modelo, tipo, status, defeito_relatado,
          data_entrada, cliente_id, cliente_nome)
         VALUES ($1, $2, 'LEGACY', 'LEGACY', 'IMPRESSORA', 'APROVADO', $3,
                 CURRENT_DATE, $4, $5)
         RETURNING id",
    )
    .bind(empresa_id)
    .bind(format!("{}-LEGACY", prefix))
    .bind(format!("{} Defeito legado", prefix))
    .bind(cliente.id)
    .bind(format!("{} Cliente legado", prefix))
    .fetch_one(&pool)
    .await
    .context("create legacy equipment failed")?;
    sqlx::query(
        "INSERT INTO verificacoes (empresa_id, equipamento_id, tecnico_nome, problema_relatado)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(empresa_id)
    .bind(legacy_equipment_id)
    .bind(format!("{} Técnico legado", prefix))
    .bind(format!("{} Registro sem pagamento", prefix))
    .execute(&pool)
    .await
    .context("create legacy verification failed")?;
    let legacy = equipamentos::buscar_equipamento(legacy_equipment_id)
        .await
        .map_err(|error| anyhow!(error))?;
    let legacy_verification =
        verificacoes::buscar_verificacao_tecnica(legacy_equipment_id, Some(empresa_id))
            .await
            .map_err(|error| anyhow!(error))?;
    if legacy.responsavel_contato_id.is_some()
        || legacy.responsavel_nome.is_some()
        || legacy_verification.forma_pagamento_codigo.is_some()
    {
        return Err(anyhow!("legacy nullable contracts were not preserved"));
    }

    let produto = produtos::criar_produto(ProdutoInput {
        codigo: format!("{}-PROD", prefix),
        nome: format!("{} Produto", prefix),
        categoria: "TONER".to_string(),
        quantidade_estoque: 10,
        quantidade_minima: Some(2),
        quantidade_maxima: Some(30),
        unidade_medida: Some("UN".to_string()),
        preco_custo: 10.0,
        preco_venda: 20.0,
        ..ProdutoInput::default()
    })
    .await
    .map_err(|error| anyhow!(error))?;

    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
        produto_id: produto.id,
        tipo: "ENTRADA".to_string(),
        quantidade: 5,
        origem: "p1_critical_integration".to_string(),
        referencia: Some("entrada".to_string()),
    })
    .await
    .map_err(|error| anyhow!(error))?;
    produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
        produto_id: produto.id,
        tipo: "SAIDA".to_string(),
        quantidade: 3,
        origem: "p1_critical_integration".to_string(),
        referencia: Some("saida".to_string()),
    })
    .await
    .map_err(|error| anyhow!(error))?;

    let produto_final = produtos::buscar_produto(produto.id)
        .await
        .map_err(|error| anyhow!(error))?;
    let saldo = produto_final.quantidade_estoque.unwrap_or_default();
    if saldo != 12 {
        return Err(anyhow!("unexpected final stock: {}", saldo));
    }

    println!("P1_INTEGRATION_PERMISSION_DENIED=ok");
    println!("P1_INTEGRATION_CONCURRENCY_ROLLBACK=ok");
    println!("P1_INTEGRATION_PAYMENT_APPROVAL=ok");
    println!("P1_INTEGRATION_CONTACT_SNAPSHOT=ok");
    println!("P1_INTEGRATION_LEGACY_NULLS=ok");
    println!("P1_INTEGRATION_BUDGET_DESCRIPTION=ok");
    println!("P1_INTEGRATION_STOCK_OK=ok:saldo_final={}", saldo);
    println!(
        "P1_INTEGRATION_STATUS_OK=ok:{}",
        equipamento_aprovado.status.unwrap_or_default()
    );
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
    sqlx::query("DELETE FROM verificacoes WHERE equipamento_id = ANY($1)")
        .bind(vec![equipamento.id, legacy_equipment_id])
        .execute(&pool)
        .await
        .context("cleanup verifications failed")?;
    sqlx::query("DELETE FROM equipamentos WHERE id = ANY($1)")
        .bind(vec![equipamento.id, legacy_equipment_id])
        .execute(&pool)
        .await
        .context("cleanup equipment failed")?;
    sqlx::query("DELETE FROM cliente_contatos WHERE id = $1")
        .bind(contato.id)
        .execute(&pool)
        .await
        .context("cleanup contact failed")?;
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
        sqlx::query(
            "UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true",
        )
        .bind(previous_default_id)
        .execute(&pool)
        .await
        .context("restore previous default profile failed")?;
    }
    sqlx::query("DELETE FROM empresas WHERE id = $1")
        .bind(empresa_id)
        .execute(&pool)
        .await
        .context("cleanup company failed")?;

    Ok(())
}

async fn assert_approval_state(
    pool: &sqlx::PgPool,
    equipamento_id: i32,
    expected_status: &str,
    expected_payment: Option<&str>,
) -> Result<()> {
    let (status, payment): (String, Option<String>) = sqlx::query_as(
        "SELECT e.status, v.forma_pagamento_codigo
         FROM equipamentos e
         JOIN verificacoes v ON v.equipamento_id = e.id
         WHERE e.id = $1",
    )
    .bind(equipamento_id)
    .fetch_one(pool)
    .await
    .context("fetch approval state failed")?;
    if status != expected_status || payment.as_deref() != expected_payment {
        return Err(anyhow!(
            "unexpected approval state: status={}, payment={:?}",
            status,
            payment
        ));
    }
    Ok(())
}
