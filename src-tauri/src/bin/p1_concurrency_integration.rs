#![allow(dead_code)]

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
use keyring::Entry;
use sqlx::PgPool;
use tokio::sync::Barrier;

const KEYRING_SERVICE: &str = "autoos";
const PROFILE_KEYRING_PREFIX: &str = "sensitive_access_profile_";

struct CleanupState {
    previous_default_id: Option<i32>,
    profile_id: Option<i32>,
    cliente_id: Option<i32>,
    equipamento_id: Option<i32>,
    produto_id: Option<i32>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database()
        .await
        .context("failed to init database for concurrency integration")?;
    let suffix = Utc::now().format("%Y%m%d%H%M%S").to_string();
    let mut cleanup = CleanupState {
        previous_default_id: current_default_profile_id(&pool).await?,
        profile_id: None,
        cliente_id: None,
        equipamento_id: None,
        produto_id: None,
    };

    let run_result: Result<()> = async {
        let cpf = format!("1234567{}", &suffix[suffix.len().saturating_sub(4)..]);
        let profile_id = create_temporary_profile(&pool, &suffix).await?;
        cleanup.profile_id = Some(profile_id);
        set_default_profile(&pool, profile_id).await?;

        auth::configure_sensitive_pin("2468".to_string(), None)
            .await
            .map_err(|error| anyhow!("failed to configure temporary concurrency pin: {}", error))?;

        let cliente = clientes::criar_cliente(ClienteInput {
            nome: Some(format!("Cliente Concorrencia {}", suffix)),
            tipo_pessoa: Some("PF".to_string()),
            documento: Some(cpf.clone()),
            cpf_cnpj: Some(cpf),
            telefone: "11911111111".to_string(),
            email: Some(format!("concorrencia.{}@autoos.local", suffix)),
            receber_email: Some(true),
            receber_whatsapp: Some(true),
            observacoes: Some("p1_concurrency_integration:create".to_string()),
            ..ClienteInput::default()
        })
        .await
        .map_err(|error| anyhow!(error))?;
        cleanup.cliente_id = Some(cliente.id);

        let equipamento = equipamentos::criar_equipamento(EquipamentoInput {
            serial_number: format!("P1-CONC-{}", suffix),
            patrimonio: Some(format!("PAT-CONC-{}", suffix)),
            marca: "BMITAG".to_string(),
            modelo: "ZT410".to_string(),
            tipo: "IMPRESSORA".to_string(),
            status: "RECEBIDO".to_string(),
            defeito_relatado: Some("Teste de concorrencia".to_string()),
            data_entrada: "2026-04-28".to_string(),
            cliente_id: Some(cliente.id),
            cliente_nome: cliente.nome.clone(),
            cliente_telefone: Some(cliente.telefone.clone()),
            cliente_email: cliente.email.clone(),
            observacoes: Some("p1_concurrency_integration:create".to_string()),
            ..EquipamentoInput::default()
        })
        .await
        .map_err(|error| anyhow!(error))?;
        cleanup.equipamento_id = Some(equipamento.id);

        let produto = produtos::criar_produto(ProdutoInput {
            codigo: format!("P1-CONC-{}", suffix),
            nome: format!("Produto Concorrencia {}", suffix),
            descricao: Some("p1_concurrency_integration:create".to_string()),
            categoria: "TONER".to_string(),
            quantidade_estoque: 5,
            quantidade_minima: Some(1),
            quantidade_maxima: Some(20),
            unidade_medida: Some("UN".to_string()),
            localizacao: Some("BANCADA-CONC".to_string()),
            preco_custo: 10.0,
            preco_venda: 20.0,
            ..ProdutoInput::default()
        })
        .await
        .map_err(|error| anyhow!(error))?;
        cleanup.produto_id = Some(produto.id);

        let (stock_successes, stock_conflicts, saldo_final) = run_stock_concurrency(produto.id).await?;
        if stock_successes != 1 || stock_conflicts != 1 || saldo_final != 1 {
            return Err(anyhow!(
                "unexpected stock concurrency result: successes={}, conflicts={}, saldo_final={}",
                stock_successes,
                stock_conflicts,
                saldo_final
            ));
        }

        let client_conflict = run_client_concurrency(cliente.id, &cliente, &suffix).await?;
        if !client_conflict {
            return Err(anyhow!("client concurrency scenario did not produce an explicit conflict"));
        }

        let equipamento_pos_edicao = run_equipment_edit_concurrency(equipamento.id, &equipamento, &suffix).await?;
        let final_status = run_equipment_status_concurrency(equipamento_pos_edicao.id, &equipamento_pos_edicao).await?;

        println!(
            "P1_CONCURRENCY_STOCK_OK=ok:successes={};conflicts={};saldo_final={}",
            stock_successes, stock_conflicts, saldo_final
        );
        println!("P1_CONCURRENCY_CLIENT_OK=ok");
        println!("P1_CONCURRENCY_EQUIPMENT_EDIT_OK=ok");
        println!("P1_CONCURRENCY_EQUIPMENT_STATUS_OK=ok:{}", final_status);
        println!("P1_CONCURRENCY_OK");

        Ok(())
    }
    .await;

    cleanup_state(&pool, cleanup).await?;
    run_result
}

async fn current_default_profile_id(pool: &PgPool) -> Result<Option<i32>> {
    sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .context("failed to fetch current default profile")
}

async fn create_temporary_profile(pool: &PgPool, suffix: &str) -> Result<i32> {
    let permissions = serde_json::to_string(&vec![
        auth::PERMISSION_FINANCIAL_ACTIONS.to_string(),
        auth::PERMISSION_STOCK_CONTROL.to_string(),
    ])
    .context("failed to serialize concurrency profile permissions")?;

    sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em)
         VALUES ($1, 'OPERADOR', $2, true, false, NOW())
         RETURNING id",
    )
    .bind(format!("P1 Concurrency {}", suffix))
    .bind(permissions)
    .fetch_one(pool)
    .await
    .context("failed to create concurrency profile")
}

async fn set_default_profile(pool: &PgPool, profile_id: i32) -> Result<()> {
    sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
        .bind(profile_id)
        .execute(pool)
        .await
        .context("failed to switch default profile for concurrency run")?;
    let _ = auth::lock_sensitive_access().await;
    Ok(())
}

async fn run_stock_concurrency(produto_id: i32) -> Result<(usize, usize, i32)> {
    let barrier = std::sync::Arc::new(Barrier::new(2));
    let mut handles = Vec::new();

    for referencia in ["saida-a", "saida-b"] {
        let barrier = barrier.clone();
        let referencia = referencia.to_string();
        handles.push(tokio::spawn(async move {
            barrier.wait().await;
            produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
                produto_id,
                tipo: "SAIDA".to_string(),
                quantidade: 4,
                origem: "p1_concurrency_integration".to_string(),
                referencia: Some(referencia),
            })
            .await
        }));
    }

    let mut success_count = 0_usize;
    let mut conflict_count = 0_usize;
    for handle in handles {
        match handle.await.context("stock concurrency task panicked")? {
            Ok(true) => success_count += 1,
            Ok(false) => return Err(anyhow!("stock movement returned false unexpectedly")),
            Err(error) if error.contains("Estoque insuficiente") => conflict_count += 1,
            Err(error) => return Err(anyhow!("unexpected stock concurrency error: {}", error)),
        }
    }

    let produto_final = produtos::buscar_produto(produto_id).await.map_err(|error| anyhow!(error))?;
    let saldo_final = produto_final.quantidade_estoque.unwrap_or_default();
    let pool_ref = db::get_pool().await.map_err(|error| anyhow!(error))?;
    let saidas: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM movimentacoes_estoque WHERE produto_id = $1 AND tipo = 'SAIDA'",
    )
    .bind(produto_id)
    .fetch_one(&pool_ref)
    .await
    .context("failed to count stock movements after concurrency test")?;

    if saidas != 1 {
        return Err(anyhow!("expected exactly one successful stock withdrawal, got {}", saidas));
    }

    Ok((success_count, conflict_count, saldo_final))
}

async fn run_client_concurrency(cliente_id: i32, cliente: &commands::types::ClienteRow, suffix: &str) -> Result<bool> {
    let barrier = std::sync::Arc::new(Barrier::new(2));
    let base_token = cliente.atualizado_em.clone();

    let update_a = ClienteInput {
        nome: Some(format!("Cliente A {}", suffix)),
        tipo_pessoa: cliente.tipo_pessoa.clone(),
        documento: cliente.documento.clone(),
        razao_social: cliente.razao_social.clone(),
        nome_fantasia: cliente.nome_fantasia.clone(),
        inscricao_estadual: cliente.inscricao_estadual.clone(),
        cpf_cnpj: cliente.cpf_cnpj.clone(),
        telefone: cliente.telefone.clone(),
        telefone_secundario: cliente.telefone_secundario.clone(),
        email: Some(format!("cliente-a.{}@autoos.local", suffix)),
        cep: cliente.cep.clone(),
        endereco: cliente.endereco.clone(),
        numero: cliente.numero.clone(),
        complemento: cliente.complemento.clone(),
        bairro: cliente.bairro.clone(),
        cidade: cliente.cidade.clone(),
        uf: cliente.uf.clone(),
        receber_email: cliente.receber_email,
        receber_whatsapp: cliente.receber_whatsapp,
        observacoes: Some("p1_concurrency_integration:client-a".to_string()),
        atualizado_em: base_token.clone(),
    };

    let update_b = ClienteInput {
        nome: Some(format!("Cliente B {}", suffix)),
        tipo_pessoa: cliente.tipo_pessoa.clone(),
        documento: cliente.documento.clone(),
        razao_social: cliente.razao_social.clone(),
        nome_fantasia: cliente.nome_fantasia.clone(),
        inscricao_estadual: cliente.inscricao_estadual.clone(),
        cpf_cnpj: cliente.cpf_cnpj.clone(),
        telefone: cliente.telefone.clone(),
        telefone_secundario: cliente.telefone_secundario.clone(),
        email: Some(format!("cliente-b.{}@autoos.local", suffix)),
        cep: cliente.cep.clone(),
        endereco: cliente.endereco.clone(),
        numero: cliente.numero.clone(),
        complemento: cliente.complemento.clone(),
        bairro: cliente.bairro.clone(),
        cidade: cliente.cidade.clone(),
        uf: cliente.uf.clone(),
        receber_email: cliente.receber_email,
        receber_whatsapp: cliente.receber_whatsapp,
        observacoes: Some("p1_concurrency_integration:client-b".to_string()),
        atualizado_em: base_token,
    };

    let left = {
        let barrier = barrier.clone();
        tokio::spawn(async move {
            barrier.wait().await;
            clientes::atualizar_cliente(cliente_id, update_a).await
        })
    };
    let right = {
        let barrier = barrier.clone();
        tokio::spawn(async move {
            barrier.wait().await;
            clientes::atualizar_cliente(cliente_id, update_b).await
        })
    };

    let results = vec![
        left.await.context("client concurrency task A panicked")?,
        right.await.context("client concurrency task B panicked")?,
    ];

    let success_count = results.iter().filter(|result| result.is_ok()).count();
    let conflict_count = results
        .iter()
        .filter(|result| matches!(result, Err(error) if error.contains("Conflito de concorrência")))
        .count();

    if success_count != 1 || conflict_count != 1 {
        return Err(anyhow!(
            "unexpected client concurrency result: successes={}, conflicts={}",
            success_count,
            conflict_count
        ));
    }

    Ok(true)
}

async fn run_equipment_edit_concurrency(
    equipamento_id: i32,
    equipamento: &commands::types::EquipamentoRow,
    suffix: &str,
) -> Result<commands::types::EquipamentoRow> {
    let barrier = std::sync::Arc::new(Barrier::new(2));
    let base_token = equipamento.atualizado_em.clone();

    let update_a = EquipamentoInput {
        serial_number: equipamento.serial_number.clone(),
        patrimonio: equipamento.patrimonio.clone(),
        marca: equipamento.marca.clone(),
        modelo: format!("ZT410-A {}", suffix),
        tipo: equipamento.tipo.clone(),
        status: equipamento.status.clone().unwrap_or_else(|| "RECEBIDO".to_string()),
        defeito_relatado: equipamento.defeito_relatado.clone(),
        acessorios: equipamento.acessorios.clone(),
        acessorios_outros: equipamento.acessorios_outros.clone(),
        paginas_impressas: equipamento.paginas_impressas,
        tecnologia: equipamento.tecnologia.clone(),
        conectividade: equipamento.conectividade.clone(),
        data_entrada: equipamento.data_entrada.clone(),
        proprietario: equipamento.proprietario.clone(),
        preco_compra: equipamento.preco_compra,
        preco_venda: equipamento.preco_venda,
        observacoes: Some("p1_concurrency_integration:equipment-a".to_string()),
        cliente_id: equipamento.cliente_id,
        cliente_nome: equipamento.cliente_nome.clone(),
        cliente_telefone: equipamento.cliente_telefone.clone(),
        cliente_email: equipamento.cliente_email.clone(),
        prazo_aprovacao: equipamento.prazo_aprovacao.clone(),
        valor_orcamento: equipamento.valor_orcamento,
        atualizado_em: base_token.clone(),
    };

    let update_b = EquipamentoInput {
        serial_number: equipamento.serial_number.clone(),
        patrimonio: equipamento.patrimonio.clone(),
        marca: "BMITAG-ALT".to_string(),
        modelo: equipamento.modelo.clone(),
        tipo: equipamento.tipo.clone(),
        status: equipamento.status.clone().unwrap_or_else(|| "RECEBIDO".to_string()),
        defeito_relatado: equipamento.defeito_relatado.clone(),
        acessorios: equipamento.acessorios.clone(),
        acessorios_outros: equipamento.acessorios_outros.clone(),
        paginas_impressas: equipamento.paginas_impressas,
        tecnologia: equipamento.tecnologia.clone(),
        conectividade: equipamento.conectividade.clone(),
        data_entrada: equipamento.data_entrada.clone(),
        proprietario: equipamento.proprietario.clone(),
        preco_compra: equipamento.preco_compra,
        preco_venda: equipamento.preco_venda,
        observacoes: Some("p1_concurrency_integration:equipment-b".to_string()),
        cliente_id: equipamento.cliente_id,
        cliente_nome: equipamento.cliente_nome.clone(),
        cliente_telefone: equipamento.cliente_telefone.clone(),
        cliente_email: Some(format!("equipamento-b.{}@autoos.local", suffix)),
        prazo_aprovacao: equipamento.prazo_aprovacao.clone(),
        valor_orcamento: equipamento.valor_orcamento,
        atualizado_em: base_token,
    };

    let left = {
        let barrier = barrier.clone();
        tokio::spawn(async move {
            barrier.wait().await;
            equipamentos::atualizar_equipamento(equipamento_id, update_a).await
        })
    };
    let right = {
        let barrier = barrier.clone();
        tokio::spawn(async move {
            barrier.wait().await;
            equipamentos::atualizar_equipamento(equipamento_id, update_b).await
        })
    };

    let results = vec![
        left.await.context("equipment edit task A panicked")?,
        right.await.context("equipment edit task B panicked")?,
    ];

    let success_count = results.iter().filter(|result| result.is_ok()).count();
    let conflict_count = results
        .iter()
        .filter(|result| matches!(result, Err(error) if error.contains("Conflito de concorrência")))
        .count();

    if success_count != 1 || conflict_count != 1 {
        return Err(anyhow!(
            "unexpected equipment edit concurrency result: successes={}, conflicts={}",
            success_count,
            conflict_count
        ));
    }

    equipamentos::buscar_equipamento(equipamento_id)
        .await
        .map_err(|error| anyhow!(error))
}

async fn run_equipment_status_concurrency(
    equipamento_id: i32,
    equipamento: &commands::types::EquipamentoRow,
) -> Result<String> {
    let barrier = std::sync::Arc::new(Barrier::new(2));
    let token = equipamento.atualizado_em.clone();

    let approve = {
        let barrier = barrier.clone();
        let token = token.clone();
        tokio::spawn(async move {
            barrier.wait().await;
            equipamentos::atualizar_status_equipamento(
                equipamento_id,
                "APROVADO".to_string(),
                Some(150.0),
                None,
                None,
                token,
            )
            .await
        })
    };

    let reject = {
        let barrier = barrier.clone();
        tokio::spawn(async move {
            barrier.wait().await;
            equipamentos::atualizar_status_equipamento(
                equipamento_id,
                "REPROVADO".to_string(),
                None,
                None,
                None,
                token,
            )
            .await
        })
    };

    let results = vec![
        approve.await.context("equipment status task A panicked")?,
        reject.await.context("equipment status task B panicked")?,
    ];

    let success_count = results.iter().filter(|result| result.is_ok()).count();
    let conflict_count = results
        .iter()
        .filter(|result| matches!(result, Err(error) if error.contains("Conflito de concorrência")))
        .count();

    if success_count != 1 || conflict_count != 1 {
        return Err(anyhow!(
            "unexpected equipment status concurrency result: successes={}, conflicts={}",
            success_count,
            conflict_count
        ));
    }

    let equipamento_final = equipamentos::buscar_equipamento(equipamento_id)
        .await
        .map_err(|error| anyhow!(error))?;
    let status_final = equipamento_final.status.unwrap_or_default();

    if status_final != "APROVADO" && status_final != "REPROVADO" {
        return Err(anyhow!("unexpected final equipment status after concurrency test: {}", status_final));
    }

    Ok(status_final)
}

async fn cleanup_state(pool: &PgPool, cleanup: CleanupState) -> Result<()> {
    let _ = auth::lock_sensitive_access().await;

    if let Some(produto_id) = cleanup.produto_id {
        sqlx::query("DELETE FROM movimentacoes_estoque WHERE produto_id = $1")
            .bind(produto_id)
            .execute(pool)
            .await
            .context("failed to cleanup stock movements")?;
        sqlx::query("DELETE FROM produtos WHERE id = $1")
            .bind(produto_id)
            .execute(pool)
            .await
            .context("failed to cleanup temporary product")?;
    }

    if let Some(equipamento_id) = cleanup.equipamento_id {
        sqlx::query("DELETE FROM equipamentos WHERE id = $1")
            .bind(equipamento_id)
            .execute(pool)
            .await
            .context("failed to cleanup temporary equipment")?;
    }

    if let Some(cliente_id) = cleanup.cliente_id {
        sqlx::query("DELETE FROM clientes WHERE id = $1")
            .bind(cliente_id)
            .execute(pool)
            .await
            .context("failed to cleanup temporary client")?;
    }

    if let Some(profile_id) = cleanup.profile_id {
        sqlx::query("DELETE FROM security_profiles WHERE id = $1")
            .bind(profile_id)
            .execute(pool)
            .await
            .context("failed to cleanup temporary concurrency profile")?;

        if let Ok(entry) = Entry::new(KEYRING_SERVICE, &format!("{}{}", PROFILE_KEYRING_PREFIX, profile_id)) {
            let _ = entry.delete_password();
        }
    }

    if let Some(previous_default_id) = cleanup.previous_default_id {
        sqlx::query("UPDATE security_profiles SET is_default = (id = $1), atualizado_em = NOW() WHERE ativo = true")
            .bind(previous_default_id)
            .execute(pool)
            .await
            .context("failed to restore previous default profile")?;
    }

    Ok(())
}
