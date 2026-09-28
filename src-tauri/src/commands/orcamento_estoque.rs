use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Transaction};

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission,
    PERMISSION_STOCK_CONTROL,
};
use crate::db::get_pool;

#[derive(Debug, Deserialize)]
pub struct PecaServico {
    pub produto_id: i32,
    pub quantidade: i32,
    #[serde(default)]
    pub valor_unitario: f64,
}

#[derive(Debug, Deserialize)]
pub struct ServicoOrcamento {
    pub id: String,
    #[serde(default)]
    pub valor: f64,
    #[serde(default)]
    pub pecas: Vec<PecaServico>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ConsumoOrcamento {
    pub verificacao_id: i32,
    pub servico_id: String,
    pub produto_id: i32,
    pub nome: String,
    pub quantidade_aprovada: i32,
    pub quantidade_baixada: i32,
}

pub fn parse_servicos(json: &str) -> Result<Vec<ServicoOrcamento>, String> {
    let servicos: Vec<ServicoOrcamento> =
        serde_json::from_value(serde_json::Value::Array(normalizar_servicos(json)?))
            .map_err(|_| "Os serviços do orçamento estão inválidos.".to_string())?;
    let mut ids = HashSet::new();
    for servico in &servicos {
        if servico.id.trim().is_empty() || !ids.insert(servico.id.as_str()) {
            return Err("Cada serviço precisa de um identificador único.".to_string());
        }
        if !servico.valor.is_finite() || servico.valor < 0.0 {
            return Err("Valor de serviço inválido.".to_string());
        }
        for peca in &servico.pecas {
            if peca.produto_id <= 0
                || peca.quantidade <= 0
                || !peca.valor_unitario.is_finite()
                || peca.valor_unitario < 0.0
            {
                return Err(
                    "Peças vinculadas precisam de produto e quantidade válidos.".to_string()
                );
            }
        }
    }
    Ok(servicos)
}

pub fn normalizar_servicos(json: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut servicos: Vec<serde_json::Value> = serde_json::from_str(json)
        .map_err(|_| "Os serviços do orçamento estão inválidos.".to_string())?;
    for (indice, servico) in servicos.iter_mut().enumerate() {
        let objeto = servico
            .as_object_mut()
            .ok_or("Serviço inválido no orçamento.")?;
        if objeto.get("id").and_then(|v| v.as_str()).is_none() {
            objeto.insert(
                "id".to_string(),
                serde_json::Value::String(format!("legacy:{indice}")),
            );
        }
    }
    Ok(servicos)
}

async fn baixar_disponivel(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    verificacao_id: i32,
    servico_id: &str,
    produto_id: i32,
    quantidade: i32,
) -> Result<i32, String> {
    let row: Option<(i32,)> = sqlx::query_as(
        "SELECT COALESCE(quantidade_estoque, 0) FROM produtos
         WHERE id = $1 AND empresa_id = $2 AND ativo = true FOR UPDATE",
    )
    .bind(produto_id)
    .bind(empresa_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| format!("Erro ao consultar estoque: {e}"))?;
    let Some((saldo,)) = row else {
        return Err(format!(
            "Produto {} inexistente, inativo ou de outra empresa.",
            produto_id
        ));
    };
    let baixa = saldo.max(0).min(quantidade);
    if baixa == 0 {
        return Ok(0);
    }
    sqlx::query("UPDATE produtos SET quantidade_estoque = quantidade_estoque - $1, atualizado_em = NOW() WHERE id = $2 AND empresa_id = $3")
        .bind(baixa).bind(produto_id).bind(empresa_id).execute(&mut **tx).await
        .map_err(|e| format!("Erro ao baixar estoque: {e}"))?;
    sqlx::query(
        "INSERT INTO movimentacoes_estoque
         (produto_id, tipo, quantidade, origem, referencia, usuario, data_hora, empresa_id)
         VALUES ($1, 'SAIDA', $2, 'MANUTENCAO', $3, 'AutoOS', NOW(), $4)",
    )
    .bind(produto_id)
    .bind(baixa)
    .bind(format!("verificacao:{verificacao_id};servico:{servico_id}"))
    .bind(empresa_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Erro ao registrar movimento: {e}"))?;
    Ok(baixa)
}

/// Chamado dentro da transação que aprova ou ajusta o orçamento.
pub async fn aplicar_decisoes(
    tx: &mut Transaction<'_, Postgres>,
    empresa_id: i32,
    verificacao_id: i32,
    servicos: &[ServicoOrcamento],
    aprovados: &[String],
) -> Result<(), String> {
    let ids: HashSet<&str> = servicos.iter().map(|s| s.id.as_str()).collect();
    let escolhidos: HashSet<&str> = aprovados.iter().map(String::as_str).collect();
    if escolhidos.len() != aprovados.len() || !escolhidos.iter().all(|id| ids.contains(id)) {
        return Err("A seleção contém serviços duplicados ou ausentes do orçamento.".to_string());
    }
    // Ordem global de bloqueio: duas OS com serviços em ordens diferentes não se bloqueiam em ciclo.
    let mut produtos: Vec<i32> = servicos
        .iter()
        .filter(|s| escolhidos.contains(s.id.as_str()))
        .flat_map(|s| s.pecas.iter().map(|p| p.produto_id))
        .collect();
    produtos.sort_unstable();
    produtos.dedup();
    sqlx::query(
        "SELECT id FROM produtos WHERE id = ANY($1) AND empresa_id = $2 ORDER BY id FOR UPDATE",
    )
    .bind(&produtos)
    .bind(empresa_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;
    for servico in servicos {
        let aprovado = escolhidos.contains(servico.id.as_str());
        sqlx::query(
            "INSERT INTO orcamento_servicos_decisao (verificacao_id, servico_id, empresa_id, decisao)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (verificacao_id, servico_id) DO UPDATE
             SET decisao = EXCLUDED.decisao, decidido_em = NOW()",
        )
        .bind(verificacao_id).bind(&servico.id).bind(empresa_id)
        .bind(if aprovado { "APROVADO" } else { "REPROVADO" })
        .execute(&mut **tx).await.map_err(|e| format!("Erro ao registrar decisão: {e}"))?;
        if !aprovado {
            sqlx::query("UPDATE orcamento_consumos SET quantidade_aprovada = quantidade_baixada WHERE verificacao_id = $1 AND servico_id = $2")
                .bind(verificacao_id).bind(&servico.id).execute(&mut **tx).await.map_err(|e| e.to_string())?;
            continue;
        }

        let mut quantidades: HashMap<i32, i32> = HashMap::new();
        for peca in &servico.pecas {
            let total = quantidades.entry(peca.produto_id).or_default();
            *total = total
                .checked_add(peca.quantidade)
                .ok_or_else(|| "Quantidade de peças excede o limite.".to_string())?;
        }
        let mut itens: Vec<_> = quantidades.into_iter().collect();
        itens.sort_by_key(|(produto_id, _)| *produto_id);
        for (produto_id, quantidade) in itens {
            let anterior: Option<(i32, i32)> = sqlx::query_as(
                "SELECT quantidade_aprovada, quantidade_baixada FROM orcamento_consumos
                 WHERE verificacao_id = $1 AND servico_id = $2 AND produto_id = $3 FOR UPDATE",
            )
            .bind(verificacao_id)
            .bind(&servico.id)
            .bind(produto_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
            let (aprovada_anterior, baixada_anterior) = anterior.unwrap_or((0, 0));
            // Quantidades já baixadas nunca desaparecem por edição do orçamento.
            let nova_aprovada = quantidade.max(baixada_anterior);
            sqlx::query(
                "INSERT INTO orcamento_consumos
                 (verificacao_id, servico_id, produto_id, empresa_id, quantidade_aprovada, quantidade_baixada)
                 VALUES ($1, $2, $3, $4, $5, 0)
                 ON CONFLICT (verificacao_id, servico_id, produto_id)
                 DO UPDATE SET quantidade_aprovada = EXCLUDED.quantidade_aprovada",
            )
            .bind(verificacao_id).bind(&servico.id).bind(produto_id).bind(empresa_id)
            .bind(nova_aprovada).execute(&mut **tx).await.map_err(|e| e.to_string())?;
            // Uma pendência antiga só sai pelo comando de confirmação na OS.
            let restante = (nova_aprovada - aprovada_anterior).max(0);
            if restante > 0 {
                let baixa = baixar_disponivel(
                    tx,
                    empresa_id,
                    verificacao_id,
                    &servico.id,
                    produto_id,
                    restante,
                )
                .await?;
                if baixa > 0 {
                    sqlx::query(
                        "UPDATE orcamento_consumos SET quantidade_baixada = quantidade_baixada + $1
                         WHERE verificacao_id = $2 AND servico_id = $3 AND produto_id = $4",
                    )
                    .bind(baixa)
                    .bind(verificacao_id)
                    .bind(&servico.id)
                    .bind(produto_id)
                    .execute(&mut **tx)
                    .await
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

/// Ajustes podem retirar um serviço/produto, mas não estornam peças já usadas.
pub async fn cancelar_pendencias_ausentes(
    tx: &mut Transaction<'_, Postgres>,
    verificacao_id: i32,
    servicos: &[ServicoOrcamento],
) -> Result<(), String> {
    let presentes: HashSet<(String, i32)> = servicos
        .iter()
        .flat_map(|servico| {
            servico
                .pecas
                .iter()
                .map(move |peca| (servico.id.clone(), peca.produto_id))
        })
        .collect();
    let existentes: Vec<(String, i32)> = sqlx::query_as(
        "SELECT servico_id, produto_id FROM orcamento_consumos WHERE verificacao_id = $1 FOR UPDATE",
    ).bind(verificacao_id).fetch_all(&mut **tx).await.map_err(|e| e.to_string())?;
    for (servico_id, produto_id) in existentes {
        if !presentes.contains(&(servico_id.clone(), produto_id)) {
            sqlx::query(
                "UPDATE orcamento_consumos SET quantidade_aprovada = quantidade_baixada
                 WHERE verificacao_id = $1 AND servico_id = $2 AND produto_id = $3",
            )
            .bind(verificacao_id)
            .bind(servico_id)
            .bind(produto_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn listar_consumos_orcamento(
    equipamento_id: i32,
) -> Result<Vec<ConsumoOrcamento>, String> {
    require_permission(PERMISSION_STOCK_CONTROL)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    sqlx::query_as::<_, ConsumoOrcamento>(
        "SELECT c.verificacao_id, c.servico_id, c.produto_id, p.nome,
                c.quantidade_aprovada, c.quantidade_baixada
         FROM orcamento_consumos c
         JOIN verificacoes v ON v.id = c.verificacao_id AND v.empresa_id = c.empresa_id
         JOIN equipamentos e ON e.id = v.equipamento_id AND e.empresa_id = c.empresa_id
         JOIN produtos p ON p.id = c.produto_id AND p.empresa_id = c.empresa_id
         WHERE e.id = $1 AND e.empresa_id = $2 ORDER BY c.servico_id, p.nome",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn baixar_pecas_pendentes(equipamento_id: i32) -> Result<i32, String> {
    let actor = require_permission(PERMISSION_STOCK_CONTROL)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let equipamento: Option<(i32,)> = sqlx::query_as(
        "SELECT empresa_id FROM equipamentos WHERE id = $1 AND empresa_id = $2 AND status IN
         ('APROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'PRONTO') FOR UPDATE",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    if equipamento.is_none() {
        return Err("OS não está aprovada ou não pertence à empresa ativa.".to_string());
    }
    let pendentes: Vec<(i32, String, i32, i32)> = sqlx::query_as(
        "SELECT c.verificacao_id, c.servico_id, c.produto_id,
                c.quantidade_aprovada - c.quantidade_baixada
         FROM orcamento_consumos c JOIN verificacoes v ON v.id = c.verificacao_id
         JOIN orcamento_servicos_decisao d ON d.verificacao_id = c.verificacao_id
           AND d.servico_id = c.servico_id AND d.decisao = 'APROVADO'
         WHERE v.equipamento_id = $1 AND c.empresa_id = $2
           AND c.quantidade_aprovada > c.quantidade_baixada
         ORDER BY c.produto_id, c.servico_id FOR UPDATE OF c",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let mut total = 0;
    for (verificacao_id, servico_id, produto_id, restante) in pendentes {
        let baixa = baixar_disponivel(
            &mut tx,
            empresa_id,
            verificacao_id,
            &servico_id,
            produto_id,
            restante,
        )
        .await?;
        sqlx::query("UPDATE orcamento_consumos SET quantidade_baixada = quantidade_baixada + $1 WHERE verificacao_id = $2 AND servico_id = $3 AND produto_id = $4")
            .bind(baixa).bind(verificacao_id).bind(&servico_id).bind(produto_id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        total += baixa;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    record_security_event(
        "BUDGET_PENDING_STOCK_CONSUMED",
        Some(&actor),
        format!("empresa_id={empresa_id}; equipamento_id={equipamento_id}; quantidade={total}"),
        true,
    )
    .await;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;

    #[test]
    fn rejects_invalid_parts_and_duplicate_services() {
        for json in [
            r#"[{"id":"a","pecas":[{"produto_id":1,"quantidade":0}]}]"#,
            r#"[{"id":"a","pecas":[{"produto_id":1,"quantidade":1.5}]}]"#,
            r#"[{"id":"a"},{"id":"a"}]"#,
        ] {
            assert!(parse_servicos(json).is_err());
        }
        assert_eq!(
            parse_servicos(r#"[{"descricao":"Legado"}]"#).unwrap()[0].id,
            "legacy:0"
        );
    }

    async fn test_pool() -> PgPool {
        let url = std::env::var("AUTOOS_STOCK_TEST_DATABASE_URL")
            .expect("Use somente um banco descartável");
        let pool = PgPool::connect(&url).await.unwrap();
        let name: String = sqlx::query_scalar("SELECT current_database()")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(
            name.starts_with("autoos_stock_test"),
            "O teste exige banco descartável autoos_stock_test*"
        );
        pool
    }

    async fn fixture(tx: &mut Transaction<'_, Postgres>, suffix: &str) -> (i32, i32, i32) {
        let empresa: i32 = sqlx::query_scalar(
            "INSERT INTO empresas(nome,email) VALUES ('Teste estoque', $1) RETURNING id",
        )
        .bind(format!("stock-{suffix}@example.test"))
        .fetch_one(&mut **tx)
        .await
        .unwrap();
        let equipamento: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2) RETURNING id")
            .bind(format!("stock-{suffix}")).bind(empresa).fetch_one(&mut **tx).await.unwrap();
        let verificacao: i32 = sqlx::query_scalar("INSERT INTO verificacoes(equipamento_id,empresa_id,tecnico_nome,problema_relatado) VALUES ($1,$2,'Teste','Teste') RETURNING id")
            .bind(equipamento).bind(empresa).fetch_one(&mut **tx).await.unwrap();
        let produto: i32 = sqlx::query_scalar("INSERT INTO produtos(codigo,nome,categoria,quantidade_estoque,preco_custo,preco_venda,empresa_id) VALUES ($1,'Cabeça','PEÇA',3,0,0,$2) RETURNING id")
            .bind(format!("stock-{suffix}")).bind(empresa).fetch_one(&mut **tx).await.unwrap();
        (empresa, verificacao, produto)
    }

    fn services(produto: i32, quantidade: i32) -> Vec<ServicoOrcamento> {
        parse_servicos(
            &serde_json::json!([
                {"id":"cabeca","pecas":[{"produto_id":produto,"quantidade":quantidade}]},
                {"id":"feed","pecas":[{"produto_id":produto,"quantidade":1}]}
            ])
            .to_string(),
        )
        .unwrap()
    }

    async fn saldo(tx: &mut Transaction<'_, Postgres>, produto: i32) -> i32 {
        sqlx::query_scalar("SELECT quantidade_estoque FROM produtos WHERE id=$1")
            .bind(produto)
            .fetch_one(&mut **tx)
            .await
            .unwrap()
    }

    #[tokio::test]
    #[ignore = "requer AUTOOS_STOCK_TEST_DATABASE_URL e migrations em banco descartável"]
    async fn stock_approval_lifecycle() {
        let pool = test_pool().await;
        let mut tx = pool.begin().await.unwrap();
        let (empresa, verificacao, produto) = fixture(&mut tx, "lifecycle").await;
        let servicos = services(produto, 5);
        aplicar_decisoes(&mut tx, empresa, verificacao, &servicos, &[])
            .await
            .unwrap();
        assert_eq!(
            saldo(&mut tx, produto).await,
            3,
            "reprovação não movimenta estoque"
        );
        aplicar_decisoes(&mut tx, empresa, verificacao, &servicos, &["cabeca".into()])
            .await
            .unwrap();
        assert_eq!(saldo(&mut tx, produto).await, 0);
        let decisao: String = sqlx::query_scalar("SELECT decisao FROM orcamento_servicos_decisao WHERE verificacao_id=$1 AND servico_id='feed'")
            .bind(verificacao).fetch_one(&mut *tx).await.unwrap();
        assert_eq!(decisao, "REPROVADO");
        let consumo: (i32,i32) = sqlx::query_as("SELECT quantidade_aprovada,quantidade_baixada FROM orcamento_consumos WHERE verificacao_id=$1")
            .bind(verificacao).fetch_one(&mut *tx).await.unwrap();
        assert_eq!(consumo, (5, 3));
        sqlx::query("UPDATE produtos SET quantidade_estoque=10 WHERE id=$1")
            .bind(produto)
            .execute(&mut *tx)
            .await
            .unwrap();
        aplicar_decisoes(&mut tx, empresa, verificacao, &servicos, &["cabeca".into()])
            .await
            .unwrap();
        assert_eq!(
            saldo(&mut tx, produto).await,
            10,
            "reposição e repetição não baixam pendências automaticamente"
        );
        let aumentados = services(produto, 6);
        aplicar_decisoes(
            &mut tx,
            empresa,
            verificacao,
            &aumentados,
            &["cabeca".into()],
        )
        .await
        .unwrap();
        assert_eq!(
            saldo(&mut tx, produto).await,
            9,
            "ajuste baixa somente incremento"
        );
        let baixa = baixar_disponivel(&mut tx, empresa, verificacao, "cabeca", produto, 2)
            .await
            .unwrap();
        assert_eq!(baixa, 2);
        sqlx::query("UPDATE orcamento_consumos SET quantidade_baixada=quantidade_baixada+$1 WHERE verificacao_id=$2")
            .bind(baixa).bind(verificacao).execute(&mut *tx).await.unwrap();
        aplicar_decisoes(
            &mut tx,
            empresa,
            verificacao,
            &services(produto, 1),
            &["cabeca".into()],
        )
        .await
        .unwrap();
        cancelar_pendencias_ausentes(&mut tx, verificacao, &[])
            .await
            .unwrap();
        assert_eq!(
            saldo(&mut tx, produto).await,
            7,
            "reduzir/remover não devolve consumo realizado"
        );
        let movimentos: i64 = sqlx::query_scalar("SELECT SUM(quantidade)::BIGINT FROM movimentacoes_estoque WHERE produto_id=$1 AND tipo='SAIDA'")
            .bind(produto).fetch_one(&mut *tx).await.unwrap();
        assert_eq!(movimentos, 6);
        // A seleção desconhecida falha antes de gravar qualquer decisão.
        assert!(aplicar_decisoes(
            &mut tx,
            empresa,
            verificacao,
            &servicos,
            &["inexistente".into()]
        )
        .await
        .is_err());
        tx.rollback().await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        let (empresa, verificacao, produto) = fixture(&mut tx, "tenant").await;
        sqlx::query("UPDATE produtos SET empresa_id=NULL WHERE id=$1")
            .bind(produto)
            .execute(&mut *tx)
            .await
            .unwrap();
        assert!(aplicar_decisoes(
            &mut tx,
            empresa,
            verificacao,
            &services(produto, 1),
            &["cabeca".into()]
        )
        .await
        .is_err());
        tx.rollback().await.unwrap();
    }

    #[tokio::test]
    #[ignore = "requer AUTOOS_STOCK_TEST_DATABASE_URL e migrations em banco descartável"]
    async fn stock_concurrent_last_piece() {
        let pool = test_pool().await;
        let suffix = format!(
            "concurrent-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        );
        let mut tx = pool.begin().await.unwrap();
        let (empresa, verificacao, produto) = fixture(&mut tx, &suffix).await;
        sqlx::query("UPDATE produtos SET quantidade_estoque=1 WHERE id=$1")
            .bind(produto)
            .execute(&mut *tx)
            .await
            .unwrap();
        let outra: i32 = sqlx::query_scalar("INSERT INTO verificacoes(equipamento_id,empresa_id,tecnico_nome,problema_relatado) SELECT equipamento_id,empresa_id,'Teste','Teste' FROM verificacoes WHERE id=$1 RETURNING id")
            .bind(verificacao).fetch_one(&mut *tx).await.unwrap();
        tx.commit().await.unwrap();
        let consume = |verificacao| {
            let pool = pool.clone();
            async move {
                let mut tx = pool.begin().await.unwrap();
                aplicar_decisoes(
                    &mut tx,
                    empresa,
                    verificacao,
                    &services(produto, 1),
                    &["cabeca".into()],
                )
                .await
                .unwrap();
                tx.commit().await.unwrap();
            }
        };
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            tokio::join!(consume(verificacao), consume(outra));
        })
        .await
        .unwrap();
        let resultado: (i32,i64) = sqlx::query_as("SELECT quantidade_estoque,(SELECT SUM(quantidade_baixada)::BIGINT FROM orcamento_consumos WHERE produto_id=$1) FROM produtos WHERE id=$1")
            .bind(produto).fetch_one(&pool).await.unwrap();
        assert_eq!(
            resultado,
            (0, 1),
            "duas aprovações não podem consumir a mesma unidade"
        );
    }
}
