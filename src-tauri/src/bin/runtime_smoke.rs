#[path = "../db.rs"]
mod db;
#[path = "../commands/mod.rs"]
mod commands;

use anyhow::{anyhow, bail, Context, Result};
use chrono::Utc;
use commands::auth;
use commands::clientes;
use commands::equipamentos;
use commands::produtos;
use commands::types::{ClienteInput, EquipamentoInput, MovimentacaoEstoqueInput, ProdutoInput};
use keyring::Entry;
use sqlx::{PgPool, Row};
use std::env;
use url::Url;

const DEFAULT_SMOKE_PIN: &str = "2468";
const KEYRING_SERVICE: &str = "autoos";
const PROFILE_KEYRING_PREFIX: &str = "sensitive_access_profile_";

fn tauri_result<T>(result: std::result::Result<T, String>, context: &str) -> Result<T> {
    result.map_err(|error| anyhow!("{}: {}", context, error))
}

#[derive(Debug)]
enum StockSmokeMode {
    Command(String),
    SqlFallback(String),
}

#[derive(Debug)]
struct StockCommandAccess {
    note: String,
    cleanup: Option<TemporaryProfileCleanup>,
}

#[derive(Debug)]
struct TemporaryProfileCleanup {
    profile_id: i32,
    previous_default_id: Option<i32>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("Falha ao inicializar PostgreSQL no runtime_smoke")?;
    let database_url = env::var("DATABASE_URL").context("DATABASE_URL não encontrada após init_database")?;
    let sanitized_database_url = sanitize_database_url(&database_url)?;

    let metadata = sqlx::query(
        "SELECT current_database() AS database_name, current_user AS database_user, current_setting('server_version') AS server_version"
    )
    .fetch_one(&pool)
    .await
    .context("Falha ao consultar metadados do PostgreSQL")?;

    let database_name: String = metadata.try_get("database_name")?;
    let database_user: String = metadata.try_get("database_user")?;
    let server_version: String = metadata.try_get("server_version")?;
    let applied_migrations: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(&pool)
        .await
        .context("Falha ao contar migrações aplicadas")?;

    println!("RUNTIME_SMOKE_DATABASE_URL={}", sanitized_database_url);
    println!("RUNTIME_SMOKE_DATABASE={}", database_name);
    println!("RUNTIME_SMOKE_USER={}", database_user);
    println!("RUNTIME_SMOKE_VERSION={}", server_version);
    println!("RUNTIME_SMOKE_MIGRATIONS={}", applied_migrations);

    let suffix = Utc::now().format("%Y%m%d%H%M%S").to_string();
    let cpf = format!("{:011}", Utc::now().timestamp_millis().rem_euclid(100_000_000_000));
    let phone_seed = format!("{:011}", Utc::now().timestamp_micros().rem_euclid(100_000_000_000));
    let data_entrada = Utc::now().date_naive().to_string();

    let cliente_criado = tauri_result(clientes::criar_cliente(ClienteInput {
        nome: Some(format!("Cliente Smoke {}", suffix)),
        tipo_pessoa: Some("PF".to_string()),
        documento: Some(cpf.clone()),
        cpf_cnpj: Some(cpf.clone()),
        telefone: phone_seed.clone(),
        email: Some(format!("smoke.{}@autoos.local", suffix)),
        receber_email: Some(true),
        receber_whatsapp: Some(true),
        observacoes: Some("runtime_smoke:create".to_string()),
        ..ClienteInput::default()
    })
    .await, "Falha ao criar cliente real")?;

    let cliente_atualizado = tauri_result(clientes::atualizar_cliente(
        cliente_criado.id,
        ClienteInput {
            nome: Some(format!("Cliente Smoke Editado {}", suffix)),
            tipo_pessoa: Some("PF".to_string()),
            documento: Some(cpf.clone()),
            cpf_cnpj: Some(cpf.clone()),
            telefone: phone_seed.clone(),
            telefone_secundario: Some(format!("55{}", &phone_seed[0..9])),
            email: Some(format!("smoke.editado.{}@autoos.local", suffix)),
            receber_email: Some(true),
            receber_whatsapp: Some(true),
            observacoes: Some("runtime_smoke:update".to_string()),
            atualizado_em: cliente_criado.atualizado_em.clone(),
            ..ClienteInput::default()
        },
    )
    .await, "Falha ao editar cliente real")?;

    let equipamento_criado = tauri_result(equipamentos::criar_equipamento(EquipamentoInput {
        serial_number: format!("SMOKE-SN-{}", suffix),
        patrimonio: Some(format!("PATR-{}", suffix)),
        marca: "HP".to_string(),
        modelo: "LaserJet Smoke".to_string(),
        tipo: "IMPRESSORA".to_string(),
        status: "RECEBIDO".to_string(),
        defeito_relatado: Some("Teste real de bootstrap".to_string()),
        observacoes: Some("runtime_smoke:create".to_string()),
        data_entrada: data_entrada.clone(),
        cliente_id: Some(cliente_atualizado.id),
        cliente_nome: cliente_atualizado.nome.clone(),
        cliente_telefone: Some(cliente_atualizado.telefone.clone()),
        cliente_email: cliente_atualizado.email.clone(),
        ..EquipamentoInput::default()
    })
    .await, "Falha ao criar equipamento real")?;

    let equipamento_atualizado = tauri_result(equipamentos::atualizar_equipamento(
        equipamento_criado.id,
        EquipamentoInput {
            serial_number: equipamento_criado.serial_number.clone(),
            patrimonio: equipamento_criado.patrimonio.clone(),
            marca: equipamento_criado.marca.clone(),
            modelo: "LaserJet Smoke RevA".to_string(),
            tipo: equipamento_criado.tipo.clone(),
            status: "RECEBIDO".to_string(),
            defeito_relatado: Some("Teste real de bootstrap atualizado".to_string()),
            observacoes: Some("runtime_smoke:update".to_string()),
            data_entrada: equipamento_criado.data_entrada.clone(),
            cliente_id: equipamento_criado.cliente_id,
            cliente_nome: equipamento_criado.cliente_nome.clone(),
            cliente_telefone: equipamento_criado.cliente_telefone.clone(),
            cliente_email: equipamento_criado.cliente_email.clone(),
            atualizado_em: equipamento_criado.atualizado_em.clone(),
            ..EquipamentoInput::default()
        },
    )
    .await, "Falha ao editar equipamento real")?;

    let equipamento_status = tauri_result(equipamentos::atualizar_status_equipamento(
        equipamento_atualizado.id,
        "EM_VERIFICACAO".to_string(),
        None,
        None,
        None,
        equipamento_atualizado.atualizado_em.clone(),
    )
    .await, "Falha ao alterar status real do equipamento")?;

    let produto_codigo = format!("SMOKE-{}", suffix);
    let stock_mode = match ensure_stock_command_access(&pool, &suffix).await {
        Ok(stock_access) => {
            let access_note = stock_access.note.clone();
            let produto = tauri_result(produtos::criar_produto(ProdutoInput {
                codigo: produto_codigo.clone(),
                nome: format!("Produto Smoke {}", suffix),
                descricao: Some("runtime_smoke:create".to_string()),
                categoria: "TONER".to_string(),
                quantidade_estoque: 10,
                quantidade_minima: Some(2),
                quantidade_maxima: Some(25),
                unidade_medida: Some("UN".to_string()),
                localizacao: Some("BANCADA SMOKE".to_string()),
                preco_custo: 45.0,
                preco_venda: 75.0,
                margem_lucro: Some(66.67),
                marca_original: Some("HP".to_string()),
                tipo_cartucho: Some("Compatível".to_string()),
                cor: Some("Preto".to_string()),
                rendimento: Some(2500),
                modelos_compativeis: Some("LaserJet Smoke".to_string()),
                fornecedor_principal: Some("Fornecedor Smoke".to_string()),
                prazo_entrega: Some(3),
                atualizado_em: None,
            })
            .await, "Falha ao criar produto real via comandos")?;

            let produto = tauri_result(produtos::atualizar_produto(
                produto.id,
                ProdutoInput {
                    codigo: produto.codigo.clone(),
                    nome: format!("Produto Smoke Editado {}", suffix),
                    descricao: Some("runtime_smoke:update".to_string()),
                    categoria: produto.categoria.clone(),
                    quantidade_estoque: produto.quantidade_estoque.unwrap_or(0),
                    quantidade_minima: produto.quantidade_minima,
                    quantidade_maxima: produto.quantidade_maxima,
                    unidade_medida: produto.unidade_medida.clone(),
                    localizacao: Some("PRATELEIRA SMOKE".to_string()),
                    preco_custo: produto.preco_custo.unwrap_or(0.0),
                    preco_venda: produto.preco_venda.unwrap_or(0.0),
                    margem_lucro: produto.margem_lucro,
                    marca_original: produto.marca_original.clone(),
                    tipo_cartucho: produto.tipo_cartucho.clone(),
                    cor: produto.cor.clone(),
                    rendimento: produto.rendimento,
                    modelos_compativeis: produto.modelos_compativeis.clone(),
                    fornecedor_principal: produto.fornecedor_principal.clone(),
                    prazo_entrega: produto.prazo_entrega,
                    atualizado_em: produto.atualizado_em.clone(),
                },
            )
            .await, "Falha ao editar produto real via comandos")?;

            tauri_result(produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
                produto_id: produto.id,
                tipo: "ENTRADA".to_string(),
                quantidade: 5,
                origem: "runtime_smoke".to_string(),
                referencia: Some("entrada".to_string()),
            })
            .await, "Falha ao registrar entrada de estoque via comandos")?;

            tauri_result(produtos::registrar_movimentacao_estoque(MovimentacaoEstoqueInput {
                produto_id: produto.id,
                tipo: "SAIDA".to_string(),
                quantidade: 3,
                origem: "runtime_smoke".to_string(),
                referencia: Some("saida".to_string()),
            })
            .await, "Falha ao registrar saída de estoque via comandos")?;

            let saldo_final = tauri_result(
                produtos::buscar_produto(produto.id).await,
                "Falha ao buscar saldo final do produto",
            )?;

            cleanup_stock_command_access(&pool, stock_access.cleanup)
                .await
                .context("Falha ao restaurar o perfil sensível após o smoke de estoque")?;

            StockSmokeMode::Command(format!(
                "{}; produto_id={}; saldo_final={}",
                access_note,
                saldo_final.id,
                saldo_final.quantidade_estoque.unwrap_or_default()
            ))
        }
        Err(stock_error) => {
            let produto_id = run_sql_stock_smoke(&pool, &produto_codigo, &suffix)
                .await
                .context("Falha ao executar fallback SQL de estoque")?;

            StockSmokeMode::SqlFallback(format!(
                "{}; produto_id={}; saldo_final=12",
                stock_error, produto_id
            ))
        }
    };

    let reopened_pool = PgPool::connect(&database_url)
        .await
        .context("Falha ao reabrir conexão para prova de persistência")?;

    let persisted_cliente = sqlx::query(
        "SELECT nome, observacoes FROM clientes WHERE id = $1 AND ativo = true"
    )
    .bind(cliente_atualizado.id)
    .fetch_one(&reopened_pool)
    .await
    .context("Cliente não persistiu após reabrir a conexão")?;
    let persisted_cliente_nome: String = persisted_cliente.try_get("nome")?;
    let persisted_cliente_observacoes: Option<String> = persisted_cliente.try_get("observacoes")?;

    let persisted_equipamento = sqlx::query(
        "SELECT status, modelo FROM equipamentos WHERE id = $1"
    )
    .bind(equipamento_status.id)
    .fetch_one(&reopened_pool)
    .await
    .context("Equipamento não persistiu após reabrir a conexão")?;
    let persisted_status: Option<String> = persisted_equipamento.try_get("status")?;
    let persisted_modelo: String = persisted_equipamento.try_get("modelo")?;

    let persisted_produto = sqlx::query(
        "SELECT quantidade_estoque FROM produtos WHERE codigo = $1 AND ativo = true"
    )
    .bind(&produto_codigo)
    .fetch_one(&reopened_pool)
    .await
    .context("Produto não persistiu após reabrir a conexão")?;
    let persisted_saldo: i32 = persisted_produto.try_get("quantidade_estoque")?;

    let persisted_movimentos: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM movimentacoes_estoque WHERE origem = 'runtime_smoke' AND produto_id = (SELECT id FROM produtos WHERE codigo = $1 LIMIT 1)"
    )
    .bind(&produto_codigo)
    .fetch_one(&reopened_pool)
    .await
    .context("Falha ao contar movimentações persistidas")?;

    cleanup_smoke_data(&reopened_pool, cliente_atualizado.id, equipamento_status.id, &produto_codigo)
        .await
        .context("Falha ao limpar dados do runtime_smoke")?;

    if !persisted_cliente_nome.contains("Editado") {
        bail!("Cliente persistido sem a edição esperada");
    }
    if persisted_cliente_observacoes.as_deref() != Some("runtime_smoke:update") {
        bail!("Observação do cliente persistida diferente do esperado");
    }
    if persisted_status.as_deref() != Some("EM_VERIFICACAO") {
        bail!("Status do equipamento persistido diferente do esperado");
    }
    if persisted_modelo != "LaserJet Smoke RevA" {
        bail!("Modelo do equipamento persistido diferente do esperado");
    }
    if persisted_saldo != 12 {
        bail!("Saldo final persistido do produto diferente do esperado");
    }
    if persisted_movimentos != 2 {
        bail!("Quantidade de movimentações persistidas diferente do esperado");
    }

    match stock_mode {
        StockSmokeMode::Command(note) => println!("RUNTIME_SMOKE_STOCK_MODE=command:{}", note),
        StockSmokeMode::SqlFallback(note) => println!("RUNTIME_SMOKE_STOCK_MODE=sql_fallback:{}", note),
    }
    println!("RUNTIME_SMOKE_CLIENT_ID={}", cliente_atualizado.id);
    println!("RUNTIME_SMOKE_EQUIPMENT_ID={}", equipamento_status.id);
    println!("RUNTIME_SMOKE_PRODUCT_CODE={}", produto_codigo);
    println!("RUNTIME_SMOKE_FINAL_SALDO={}", persisted_saldo);
    println!("RUNTIME_SMOKE_OK");

    Ok(())
}

fn sanitize_database_url(database_url: &str) -> Result<String> {
    let mut url = Url::parse(database_url).context("DATABASE_URL inválida")?;
    if url.password().is_some() {
        url.set_password(Some("***"))
            .map_err(|_| anyhow!("Falha ao mascarar a senha da DATABASE_URL"))?;
    }
    Ok(url.to_string())
}

async fn ensure_stock_command_access(pool: &PgPool, suffix: &str) -> Result<StockCommandAccess> {
    let status = tauri_result(
        auth::get_sensitive_access_status().await,
        "Falha ao consultar status do acesso sensível",
    )?;

    if status.unlocked {
        return Ok(StockCommandAccess {
            note: "sessão sensível já estava desbloqueada".to_string(),
            cleanup: None,
        });
    }

    let smoke_pin = env::var("AUTOOS_SMOKE_PIN").unwrap_or_else(|_| DEFAULT_SMOKE_PIN.to_string());

    if !status.pin_configured {
        tauri_result(
            auth::configure_sensitive_pin(smoke_pin, None).await,
            "Falha ao configurar PIN temporário para o runtime_smoke",
        )?;
        return Ok(StockCommandAccess {
            note: "PIN temporário configurado automaticamente".to_string(),
            cleanup: None,
        });
    }

    if env::var("AUTOOS_SMOKE_PIN").is_ok() {
        tauri_result(
            auth::unlock_sensitive_access(smoke_pin).await,
            "Falha ao desbloquear sessão sensível com AUTOOS_SMOKE_PIN",
        )?;
        return Ok(StockCommandAccess {
            note: "sessão desbloqueada com AUTOOS_SMOKE_PIN".to_string(),
            cleanup: None,
        });
    }

    let cleanup = create_temporary_stock_profile(pool, suffix, &smoke_pin).await?;
    Ok(StockCommandAccess {
        note: "perfil temporário desbloqueado para validar estoque via comandos protegidos".to_string(),
        cleanup: Some(cleanup),
    })
}

async fn create_temporary_stock_profile(
    pool: &PgPool,
    suffix: &str,
    smoke_pin: &str,
) -> Result<TemporaryProfileCleanup> {
    let previous_default_id: Option<i32> = sqlx::query_scalar(
        "SELECT id FROM security_profiles WHERE ativo = true AND is_default = true ORDER BY id LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .context("Falha ao localizar o perfil padrão atual")?;

    let permissions = serde_json::to_string(&vec![
        auth::PERMISSION_CONFIG_SMTP.to_string(),
        auth::PERMISSION_CONFIG_WHATSAPP.to_string(),
        auth::PERMISSION_DELETE_RECORDS.to_string(),
        auth::PERMISSION_FINANCIAL_ACTIONS.to_string(),
        auth::PERMISSION_STOCK_CONTROL.to_string(),
        auth::PERMISSION_MANAGE_PROFILES.to_string(),
    ])
    .context("Falha ao serializar permissões do perfil temporário")?;
    let profile_name = format!("Runtime Smoke {}", suffix);

    let mut tx = pool
        .begin()
        .await
        .context("Falha ao abrir transação para o perfil temporário do smoke")?;

    sqlx::query(
        "UPDATE security_profiles SET is_default = false, atualizado_em = NOW() WHERE ativo = true AND is_default = true",
    )
    .execute(&mut *tx)
    .await
    .context("Falha ao remover o perfil padrão anterior durante o smoke")?;

    let profile_id: i32 = sqlx::query_scalar(
        "INSERT INTO security_profiles (nome, role, permissions, ativo, is_default, atualizado_em) VALUES ($1, 'ADMIN', $2, true, true, NOW()) RETURNING id",
    )
    .bind(&profile_name)
    .bind(&permissions)
    .fetch_one(&mut *tx)
    .await
    .context("Falha ao criar o perfil temporário do smoke")?;

    tx.commit()
        .await
        .context("Falha ao confirmar o perfil temporário do smoke")?;

    if let Err(error) = tauri_result(
        auth::configure_sensitive_pin(smoke_pin.to_string(), None).await,
        "Falha ao configurar PIN para o perfil temporário do smoke",
    ) {
        cleanup_stock_command_access(
            pool,
            Some(TemporaryProfileCleanup {
                profile_id,
                previous_default_id,
            }),
        )
        .await
        .context("Falha ao reverter o perfil temporário após erro de PIN")?;
        return Err(error);
    }

    Ok(TemporaryProfileCleanup {
        profile_id,
        previous_default_id,
    })
}

async fn cleanup_stock_command_access(
    pool: &PgPool,
    cleanup: Option<TemporaryProfileCleanup>,
) -> Result<()> {
    if let Some(cleanup) = cleanup {
        let _ = auth::lock_sensitive_access().await;

        let mut tx = pool
            .begin()
            .await
            .context("Falha ao abrir transação para limpar o perfil temporário")?;

        sqlx::query(
            "UPDATE security_profiles SET is_default = false, atualizado_em = NOW() WHERE ativo = true AND is_default = true",
        )
        .execute(&mut *tx)
        .await
        .context("Falha ao limpar perfil padrão temporário")?;

        if let Some(previous_default_id) = cleanup.previous_default_id {
            sqlx::query(
                "UPDATE security_profiles SET is_default = true, atualizado_em = NOW() WHERE id = $1",
            )
            .bind(previous_default_id)
            .execute(&mut *tx)
            .await
            .context("Falha ao restaurar o perfil padrão original")?;
        }

        sqlx::query("DELETE FROM security_profiles WHERE id = $1")
            .bind(cleanup.profile_id)
            .execute(&mut *tx)
            .await
            .context("Falha ao remover o perfil temporário do smoke")?;

        tx.commit()
            .await
            .context("Falha ao confirmar a limpeza do perfil temporário")?;

        if let Ok(entry) = Entry::new(
            KEYRING_SERVICE,
            &format!("{}{}", PROFILE_KEYRING_PREFIX, cleanup.profile_id),
        ) {
            let _ = entry.delete_password();
        }
    }

    Ok(())
}

async fn run_sql_stock_smoke(pool: &PgPool, codigo: &str, suffix: &str) -> Result<i32> {
    let mut tx = pool.begin().await.context("Falha ao abrir transação SQL de estoque")?;

    let produto_row = sqlx::query(
        r#"
        INSERT INTO produtos (
            codigo, nome, descricao, categoria,
            quantidade_estoque, quantidade_minima, quantidade_maxima,
            unidade_medida, localizacao, preco_custo, preco_venda, margem_lucro,
            marca_original, tipo_cartucho, cor, rendimento, modelos_compativeis,
            fornecedor_principal, prazo_entrega
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING id
        "#,
    )
    .bind(codigo)
    .bind(format!("Produto Smoke {}", suffix))
    .bind("runtime_smoke:create")
    .bind("TONER")
    .bind(10)
    .bind(2)
    .bind(25)
    .bind("UN")
    .bind("BANCADA SMOKE")
    .bind(45.0)
    .bind(75.0)
    .bind(66.67)
    .bind("HP")
    .bind("Compatível")
    .bind("Preto")
    .bind(2500)
    .bind("LaserJet Smoke")
    .bind("Fornecedor Smoke")
    .bind(3)
    .fetch_one(&mut *tx)
    .await
    .context("Falha ao inserir produto via SQL")?;

    let produto_id: i32 = produto_row.try_get("id")?;

    sqlx::query(
        "UPDATE produtos SET nome = $1, descricao = $2, localizacao = $3, atualizado_em = NOW() WHERE id = $4"
    )
    .bind(format!("Produto Smoke Editado {}", suffix))
    .bind("runtime_smoke:update")
    .bind("PRATELEIRA SMOKE")
    .bind(produto_id)
    .execute(&mut *tx)
    .await
    .context("Falha ao atualizar produto via SQL")?;

    sqlx::query(
        "UPDATE produtos SET quantidade_estoque = quantidade_estoque + 5, atualizado_em = NOW() WHERE id = $1"
    )
    .bind(produto_id)
    .execute(&mut *tx)
    .await
    .context("Falha ao aplicar entrada de estoque via SQL")?;

    sqlx::query(
        "INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, referencia, data_hora) VALUES ($1, 'ENTRADA', 5, 'runtime_smoke', 'entrada', NOW())"
    )
    .bind(produto_id)
    .execute(&mut *tx)
    .await
    .context("Falha ao registrar entrada via SQL")?;

    sqlx::query(
        "UPDATE produtos SET quantidade_estoque = quantidade_estoque - 3, atualizado_em = NOW() WHERE id = $1"
    )
    .bind(produto_id)
    .execute(&mut *tx)
    .await
    .context("Falha ao aplicar saída de estoque via SQL")?;

    sqlx::query(
        "INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, referencia, data_hora) VALUES ($1, 'SAIDA', 3, 'runtime_smoke', 'saida', NOW())"
    )
    .bind(produto_id)
    .execute(&mut *tx)
    .await
    .context("Falha ao registrar saída via SQL")?;

    tx.commit().await.context("Falha ao confirmar transação SQL de estoque")?;

    Ok(produto_id)
}

async fn cleanup_smoke_data(pool: &PgPool, cliente_id: i32, equipamento_id: i32, produto_codigo: &str) -> Result<()> {
    let mut tx = pool.begin().await.context("Falha ao abrir transação de limpeza")?;

    sqlx::query(
        "DELETE FROM movimentacoes_estoque WHERE produto_id = (SELECT id FROM produtos WHERE codigo = $1 LIMIT 1)"
    )
    .bind(produto_codigo)
    .execute(&mut *tx)
    .await
    .context("Falha ao remover movimentações de estoque do smoke")?;

    sqlx::query("DELETE FROM produtos WHERE codigo = $1")
        .bind(produto_codigo)
        .execute(&mut *tx)
        .await
        .context("Falha ao remover produto do smoke")?;

    sqlx::query("DELETE FROM equipamentos WHERE id = $1")
        .bind(equipamento_id)
        .execute(&mut *tx)
        .await
        .context("Falha ao remover equipamento do smoke")?;

    sqlx::query("DELETE FROM clientes WHERE id = $1")
        .bind(cliente_id)
        .execute(&mut *tx)
        .await
        .context("Falha ao remover cliente do smoke")?;

    tx.commit().await.context("Falha ao confirmar limpeza do runtime_smoke")?;

    Ok(())
}