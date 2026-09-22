#[path = "../commands/mod.rs"]
mod commands;
#[path = "../db.rs"]
mod db;

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::{PgPool, Row};

async fn insert_equipment(pool: &PgPool, serial: &str, patrimonio: Option<&str>) -> Result<i32> {
    let row = sqlx::query(
        "INSERT INTO equipamentos
            (serial_number, patrimonio, marca, modelo, tipo, status, defeito_relatado, data_entrada)
         VALUES ($1, $2, 'HP', 'M404', 'IMPRESSORA', 'RECEBIDO', 'Teste de ciclo', '2026-09-22')
         RETURNING id",
    )
    .bind(serial)
    .bind(patrimonio)
    .fetch_one(pool)
    .await
    .context("inserção de equipamento de teste falhou")?;

    Ok(row.get("id"))
}

#[tokio::main]
async fn main() -> Result<()> {
    let pool = db::init_database().await.context("init db failed")?;
    let suffix = Utc::now().timestamp_nanos_opt().unwrap_or_default().abs();
    let serial = format!("PATR-CYCLE-SAME-{suffix}");
    let patrimonio = format!("PATR-CYCLE-{suffix}");
    let serial_other = format!("PATR-CYCLE-OTHER-{suffix}");
    let serial_update = format!("PATR-CYCLE-UPDATE-{suffix}");

    let first_id = insert_equipment(&pool, &serial, Some(&patrimonio)).await?;
    let second_id = insert_equipment(&pool, &serial, Some(&format!("  {patrimonio}  "))).await?;

    let conflict = insert_equipment(&pool, &serial_other, Some(&patrimonio))
        .await
        .expect_err("patrimônio não pode mudar de número de série");
    if !format!("{conflict:#}").contains("AUTOOS_PATRIMONIO_SERIAL_CONFLICT") {
        anyhow::bail!("erro de conflito inesperado: {conflict:#}");
    }

    let null_id = insert_equipment(&pool, &serial_update, None).await?;
    sqlx::query("UPDATE equipamentos SET patrimonio = $1 WHERE id = $2")
        .bind(&patrimonio)
        .bind(second_id)
        .execute(&pool)
        .await
        .context("atualização do mesmo serial deveria ser aceita")?;

    let update_conflict = sqlx::query("UPDATE equipamentos SET patrimonio = $1 WHERE id = $2")
        .bind(&patrimonio)
        .bind(null_id)
        .execute(&pool)
        .await
        .expect_err("atualização para outra série deveria falhar");
    if !format!("{update_conflict:#}").contains("AUTOOS_PATRIMONIO_SERIAL_CONFLICT")
    {
        anyhow::bail!("erro de conflito em atualização inesperado: {update_conflict:#}");
    }

    sqlx::query("DELETE FROM equipamentos WHERE id = ANY($1)")
        .bind(&vec![first_id, second_id, null_id])
        .execute(&pool)
        .await
        .context("limpeza do teste falhou")?;

    println!("PATRIMONIO_CYCLES_OK");
    Ok(())
}
