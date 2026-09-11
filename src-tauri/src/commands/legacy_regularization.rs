//! Regularização explícita de registros criados antes do isolamento multi-tenant.

use crate::commands::auth::{
    confirm_authenticated_profile_pin, require_permission, SecurityProfileSummary,
    PERMISSION_MANAGE_PROFILES,
};
use crate::db::get_pool;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgConnection};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use uuid::Uuid;

const RULES_VERSION: u32 = 1;
const PREVIEW_TTL_MINUTES: i64 = 5;

#[derive(Debug, Clone, Serialize, FromRow)]
struct TenantRow {
    id: i32,
    empresa_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct EquipmentRow {
    id: i32,
    cliente_id: Option<i32>,
    empresa_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct DependencyRow {
    id: i32,
    equipamento_id: i32,
    empresa_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct ContactRow {
    id: i32,
    cliente_id: i32,
    empresa_id: i32,
}

#[derive(Debug, Clone, Serialize)]
struct Snapshot {
    rules_version: u32,
    empresa_id: i32,
    clientes_atualizar: Vec<i32>,
    equipamentos_atualizar: Vec<i32>,
    verificacoes_atualizar: Vec<i32>,
    imagens_atualizar: Vec<i32>,
    comunicacoes_atualizar: Vec<i32>,
    equipamentos_sem_cliente: Vec<i32>,
    contatos_irregulares: Vec<i32>,
    conflitos: Vec<RegularizacaoConflito>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct RegularizacaoConflito {
    pub cliente_id: Option<i32>,
    pub equipamento_id: Option<i32>,
    pub tipo: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegularizacaoLegadoPrevia {
    pub empresa_id: i32,
    pub empresa_nome: String,
    pub token: String,
    pub expira_em: String,
    pub rules_version: u32,
    pub clientes: usize,
    pub equipamentos: usize,
    pub verificacoes: usize,
    pub imagens: usize,
    pub comunicacoes: usize,
    pub equipamentos_sem_cliente: Vec<i32>,
    pub contatos_irregulares: usize,
    pub conflitos: Vec<RegularizacaoConflito>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegularizacaoLegadoResultado {
    pub empresa_id: i32,
    pub clientes: u64,
    pub equipamentos: u64,
    pub verificacoes: u64,
    pub imagens: u64,
    pub comunicacoes: u64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct EmpresaVinculoCandidata {
    pub id: i32,
    pub nome: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VinculoEmpresaPerfilPrevia {
    pub perfil_id: i32,
    pub perfil_nome: String,
    pub empresas_ativas: Vec<EmpresaVinculoCandidata>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
pub struct VinculoEmpresaPerfilInput {
    pub empresa_id: Option<i32>,
    pub nova_empresa_nome: Option<String>,
    pub nova_empresa_email: Option<String>,
    pub nova_empresa_cnpj: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VinculoEmpresaPerfilResultado {
    pub empresa_id: i32,
    pub empresa_nome: String,
    pub empresa_criada: bool,
}

#[derive(Clone)]
struct StoredPreview {
    profile_id: i32,
    empresa_id: i32,
    digest: String,
    expires_at: DateTime<Utc>,
}

static PREVIEWS: OnceLock<Mutex<HashMap<String, StoredPreview>>> = OnceLock::new();

fn previews() -> &'static Mutex<HashMap<String, StoredPreview>> {
    PREVIEWS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn store_preview(token: String, preview: StoredPreview) -> Result<(), String> {
    let now = Utc::now();
    let mut stored = previews()
        .lock()
        .map_err(|_| "Prévia temporariamente indisponível".to_string())?;
    stored.retain(|_, item| item.expires_at > now);
    stored.insert(token, preview);
    Ok(())
}

async fn actor_company(actor: &SecurityProfileSummary) -> Result<(i32, String), String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query_as::<_, (i32, String)>(
        "SELECT e.id, e.nome FROM security_profiles p JOIN empresas e ON e.id = p.empresa_id WHERE p.id = $1 AND p.ativo = true AND e.status = 'ativo'",
    )
    .bind(actor.id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "O perfil administrador ativo não está vinculado a uma empresa ativa.".to_string())
}

fn validate_new_company(
    input: &VinculoEmpresaPerfilInput,
) -> Result<(String, String, Option<String>), String> {
    let nome = input
        .nova_empresa_nome
        .as_deref()
        .unwrap_or_default()
        .trim();
    if nome.len() < 2 {
        return Err("Informe o nome da empresa interna.".to_string());
    }
    let email = input
        .nova_empresa_email
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    if email.len() < 5 || !email.contains('@') || email.chars().any(char::is_whitespace) {
        return Err("Informe um email válido para a empresa interna.".to_string());
    }
    let cnpj = input
        .nova_empresa_cnpj
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Ok((nome.to_string(), email, cnpj))
}

#[tauri::command]
pub async fn previsualizar_vinculo_empresa_perfil() -> Result<VinculoEmpresaPerfilPrevia, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id: Option<i32> = sqlx::query_scalar(
        "SELECT empresa_id FROM security_profiles WHERE id = $1 AND ativo = true AND is_default = true",
    )
    .bind(actor.id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "O perfil administrador autenticado não é mais o perfil ativo.".to_string())?;
    if empresa_id.is_some() {
        return Err("O perfil administrador já possui empresa vinculada. A associação existente não pode ser sobrescrita.".to_string());
    }
    let empresas_ativas = sqlx::query_as::<_, EmpresaVinculoCandidata>(
        "SELECT id, nome, email FROM empresas WHERE status = 'ativo' ORDER BY nome, id",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(VinculoEmpresaPerfilPrevia {
        perfil_id: actor.id,
        perfil_nome: actor.nome,
        empresas_ativas,
    })
}

#[tauri::command]
pub async fn vincular_perfil_ativo_empresa(
    input: VinculoEmpresaPerfilInput,
    pin_administrativo: String,
) -> Result<VinculoEmpresaPerfilResultado, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    confirm_authenticated_profile_pin(&actor, &pin_administrativo).await?;
    if input.empresa_id.is_some()
        && (input.nova_empresa_nome.is_some()
            || input.nova_empresa_email.is_some()
            || input.nova_empresa_cnpj.is_some())
    {
        return Err(
            "Escolha uma empresa existente ou cadastre uma nova, nunca as duas opções.".to_string(),
        );
    }

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("SET LOCAL statement_timeout = '15s'")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let empresa_atual: Option<i32> = sqlx::query_scalar(
        "SELECT empresa_id FROM security_profiles WHERE id = $1 AND ativo = true AND is_default = true FOR UPDATE",
    )
    .bind(actor.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "O perfil administrador autenticado não é mais o perfil ativo.".to_string())?;
    if empresa_atual.is_some() {
        return Err(
            "O perfil administrador já possui empresa vinculada. Nenhuma alteração foi realizada."
                .to_string(),
        );
    }

    let (empresa_id, empresa_nome, empresa_criada) = if let Some(empresa_id) = input.empresa_id {
        let nome: String = sqlx::query_scalar(
            "SELECT nome FROM empresas WHERE id = $1 AND status = 'ativo' FOR UPDATE",
        )
        .bind(empresa_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "A empresa selecionada não existe ou deixou de estar ativa.".to_string())?;
        (empresa_id, nome, false)
    } else {
        let (nome, email, cnpj) = validate_new_company(&input)?;
        if sqlx::query_scalar::<_, i32>(
            "SELECT id FROM empresas WHERE LOWER(email) = LOWER($1) FOR UPDATE",
        )
        .bind(&email)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .is_some()
        {
            return Err("Já existe uma empresa com esse email. Gere novamente a prévia e selecione o cadastro existente se ele estiver ativo.".to_string());
        }
        let id: i32 = sqlx::query_scalar(
            "INSERT INTO empresas (nome, email, cnpj, status) VALUES ($1, $2, $3, 'ativo') RETURNING id",
        )
        .bind(&nome)
        .bind(&email)
        .bind(cnpj)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        (id, nome, true)
    };

    let updated = sqlx::query(
        "UPDATE security_profiles SET empresa_id = $1, atualizado_em = NOW() WHERE id = $2 AND ativo = true AND is_default = true AND empresa_id IS NULL",
    )
    .bind(empresa_id)
    .bind(actor.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();
    if updated != 1 {
        return Err(
            "O perfil mudou durante a confirmação. Nenhuma alteração foi realizada.".to_string(),
        );
    }
    sqlx::query(
        "INSERT INTO security_audit_log (event_type, profile_id, profile_name, details, success, empresa_id) VALUES ('LEGACY_PROFILE_COMPANY_LINKED', $1, $2, $3, true, $4)",
    )
    .bind(actor.id)
    .bind(&actor.nome)
    .bind(format!("empresa_id={}; empresa_criada={}", empresa_id, empresa_criada))
    .bind(empresa_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(VinculoEmpresaPerfilResultado {
        empresa_id,
        empresa_nome,
        empresa_criada,
    })
}

async fn load_snapshot(conn: &mut PgConnection, empresa_id: i32) -> Result<Snapshot, String> {
    let clients = sqlx::query_as::<_, TenantRow>(
        "SELECT id, empresa_id FROM clientes WHERE empresa_id IS NULL OR empresa_id = $1 ORDER BY id",
    ).bind(empresa_id).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let client_ids: Vec<i32> = clients.iter().map(|row| row.id).collect();
    let equipment = sqlx::query_as::<_, EquipmentRow>(
        "SELECT id, cliente_id, empresa_id FROM equipamentos WHERE cliente_id = ANY($1) OR (cliente_id IS NULL AND empresa_id IS NULL) ORDER BY id",
    ).bind(&client_ids).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let equipment_ids: Vec<i32> = equipment.iter().map(|row| row.id).collect();
    let verifications = sqlx::query_as::<_, DependencyRow>(
        "SELECT id, equipamento_id, empresa_id FROM verificacoes WHERE equipamento_id = ANY($1) ORDER BY id",
    ).bind(&equipment_ids).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let images = sqlx::query_as::<_, DependencyRow>(
        "SELECT id, equipamento_id, empresa_id FROM equipamento_imagens WHERE equipamento_id = ANY($1) ORDER BY id",
    ).bind(&equipment_ids).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let communications = sqlx::query_as::<_, DependencyRow>(
        "SELECT id, equipamento_id, empresa_id FROM comunicacoes WHERE equipamento_id = ANY($1) ORDER BY id",
    ).bind(&equipment_ids).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let contacts = sqlx::query_as::<_, ContactRow>(
        "SELECT id, cliente_id, empresa_id FROM cliente_contatos WHERE cliente_id = ANY($1) ORDER BY id",
    ).bind(&client_ids).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;

    let mut conflicts = Vec::new();
    let legacy_clients: HashSet<i32> = clients
        .iter()
        .filter(|c| c.empresa_id.is_none())
        .map(|c| c.id)
        .collect();
    let mut conflicted_clients = HashSet::new();
    let equipment_client: HashMap<i32, i32> = equipment
        .iter()
        .filter_map(|e| e.cliente_id.map(|c| (e.id, c)))
        .collect();

    for row in &equipment {
        if let (Some(cliente_id), Some(owner)) = (row.cliente_id, row.empresa_id) {
            if owner != empresa_id {
                conflicted_clients.insert(cliente_id);
                conflicts.push(RegularizacaoConflito {
                    cliente_id: Some(cliente_id),
                    equipamento_id: Some(row.id),
                    tipo: "EQUIPAMENTO_OUTRA_EMPRESA".into(),
                });
            }
        }
    }
    for (kind, rows) in [
        ("VERIFICACAO_EMPRESA_DIVERGENTE", &verifications),
        ("IMAGEM_EMPRESA_DIVERGENTE", &images),
        ("COMUNICACAO_EMPRESA_DIVERGENTE", &communications),
    ] {
        for row in rows {
            if let Some(owner) = row.empresa_id {
                if owner != empresa_id {
                    let cliente_id = equipment_client.get(&row.equipamento_id).copied();
                    if let Some(id) = cliente_id {
                        conflicted_clients.insert(id);
                    }
                    conflicts.push(RegularizacaoConflito {
                        cliente_id,
                        equipamento_id: Some(row.equipamento_id),
                        tipo: kind.into(),
                    });
                }
            }
        }
    }
    for row in &contacts {
        if row.empresa_id != empresa_id {
            conflicted_clients.insert(row.cliente_id);
            conflicts.push(RegularizacaoConflito {
                cliente_id: Some(row.cliente_id),
                equipamento_id: None,
                tipo: "CONTATO_EMPRESA_DIVERGENTE".into(),
            });
        }
    }
    conflicts.sort_by_key(|c| (c.cliente_id, c.equipamento_id, c.tipo.clone()));
    conflicts.dedup();

    let eligible_clients: HashSet<i32> = clients
        .iter()
        .map(|c| c.id)
        .filter(|id| !conflicted_clients.contains(id))
        .collect();
    let eligible_equipment: HashSet<i32> = equipment
        .iter()
        .filter(|e| {
            e.cliente_id
                .is_some_and(|id| eligible_clients.contains(&id))
        })
        .map(|e| e.id)
        .collect();
    Ok(Snapshot {
        rules_version: RULES_VERSION,
        empresa_id,
        clientes_atualizar: clients
            .iter()
            .filter(|c| c.empresa_id.is_none() && eligible_clients.contains(&c.id))
            .map(|c| c.id)
            .collect(),
        equipamentos_atualizar: equipment
            .iter()
            .filter(|e| e.empresa_id.is_none() && eligible_equipment.contains(&e.id))
            .map(|e| e.id)
            .collect(),
        verificacoes_atualizar: verifications
            .iter()
            .filter(|r| r.empresa_id.is_none() && eligible_equipment.contains(&r.equipamento_id))
            .map(|r| r.id)
            .collect(),
        imagens_atualizar: images
            .iter()
            .filter(|r| r.empresa_id.is_none() && eligible_equipment.contains(&r.equipamento_id))
            .map(|r| r.id)
            .collect(),
        comunicacoes_atualizar: communications
            .iter()
            .filter(|r| r.empresa_id.is_none() && eligible_equipment.contains(&r.equipamento_id))
            .map(|r| r.id)
            .collect(),
        equipamentos_sem_cliente: equipment
            .iter()
            .filter(|e| e.cliente_id.is_none() && e.empresa_id.is_none())
            .map(|e| e.id)
            .collect(),
        contatos_irregulares: contacts
            .iter()
            .filter(|c| legacy_clients.contains(&c.cliente_id))
            .map(|c| c.id)
            .collect(),
        conflitos: conflicts,
    })
}

fn snapshot_digest(
    snapshot: &Snapshot,
    profile_id: i32,
    expires_at: DateTime<Utc>,
) -> Result<String, String> {
    let payload = serde_json::to_vec(&(profile_id, expires_at.timestamp(), snapshot))
        .map_err(|e| e.to_string())?;
    Ok(hex::encode(Sha256::digest(payload)))
}

async fn lock_in_order(conn: &mut PgConnection, empresa_id: i32) -> Result<(), String> {
    let clients: Vec<i32> = sqlx::query_scalar("SELECT id FROM clientes WHERE empresa_id IS NULL OR empresa_id = $1 ORDER BY id FOR UPDATE")
        .bind(empresa_id).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    let equipment: Vec<i32> = sqlx::query_scalar("SELECT id FROM equipamentos WHERE cliente_id = ANY($1) OR (cliente_id IS NULL AND empresa_id IS NULL) ORDER BY id FOR UPDATE")
        .bind(&clients).fetch_all(&mut *conn).await.map_err(|e| e.to_string())?;
    for sql in [
        "SELECT id FROM verificacoes WHERE equipamento_id = ANY($1) ORDER BY id FOR UPDATE",
        "SELECT id FROM equipamento_imagens WHERE equipamento_id = ANY($1) ORDER BY id FOR UPDATE",
        "SELECT id FROM comunicacoes WHERE equipamento_id = ANY($1) ORDER BY id FOR UPDATE",
    ] {
        sqlx::query(sql)
            .bind(&equipment)
            .fetch_all(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    sqlx::query(
        "SELECT id FROM cliente_contatos WHERE cliente_id = ANY($1) ORDER BY id FOR UPDATE",
    )
    .bind(&clients)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn ensure_owner(
    conn: &mut PgConnection,
    table: &str,
    ids: &[i32],
    empresa_id: i32,
) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }
    let sql = format!(
        "SELECT COUNT(*) FROM {} WHERE id = ANY($1) AND empresa_id = $2",
        table
    );
    let count: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(ids)
        .bind(empresa_id)
        .fetch_one(conn)
        .await
        .map_err(|e| e.to_string())?;
    if count != ids.len() as i64 {
        return Err(format!(
            "A validação final encontrou vínculo inconsistente em {}. A transação foi cancelada.",
            table
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn previsualizar_regularizacao_legados() -> Result<RegularizacaoLegadoPrevia, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    let (empresa_id, empresa_nome) = actor_company(&actor).await?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    let snapshot = load_snapshot(&mut conn, empresa_id).await?;
    let expires_at = Utc::now() + Duration::minutes(PREVIEW_TTL_MINUTES);
    let digest = snapshot_digest(&snapshot, actor.id, expires_at)?;
    let token = Uuid::new_v4().simple().to_string();
    let stored = StoredPreview {
        profile_id: actor.id,
        empresa_id,
        digest,
        expires_at,
    };
    store_preview(token.clone(), stored)?;
    Ok(RegularizacaoLegadoPrevia {
        empresa_id,
        empresa_nome,
        token,
        expira_em: expires_at.to_rfc3339(),
        rules_version: RULES_VERSION,
        clientes: snapshot.clientes_atualizar.len(),
        equipamentos: snapshot.equipamentos_atualizar.len(),
        verificacoes: snapshot.verificacoes_atualizar.len(),
        imagens: snapshot.imagens_atualizar.len(),
        comunicacoes: snapshot.comunicacoes_atualizar.len(),
        equipamentos_sem_cliente: snapshot.equipamentos_sem_cliente,
        contatos_irregulares: snapshot.contatos_irregulares.len(),
        conflitos: snapshot.conflitos,
    })
}

#[tauri::command]
pub async fn executar_regularizacao_legados(
    token_da_previa: String,
    pin_administrativo: String,
) -> Result<RegularizacaoLegadoResultado, String> {
    let actor = require_permission(PERMISSION_MANAGE_PROFILES)?;
    confirm_authenticated_profile_pin(&actor, &pin_administrativo).await?;
    let (empresa_id, _) = actor_company(&actor).await?;
    let stored = previews()
        .lock()
        .map_err(|_| "Prévia temporariamente indisponível".to_string())?
        .remove(token_da_previa.trim())
        .ok_or_else(|| "Prévia inválida ou já utilizada. Gere uma nova prévia.".to_string())?;
    if stored.profile_id != actor.id
        || stored.empresa_id != empresa_id
        || stored.expires_at <= Utc::now()
    {
        return Err(
            "A prévia expirou ou pertence a outro administrador/empresa. Gere uma nova prévia."
                .to_string(),
        );
    }

    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("SET LOCAL statement_timeout = '15s'")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    lock_in_order(&mut tx, empresa_id).await?;
    let snapshot = load_snapshot(&mut tx, empresa_id).await?;
    if snapshot_digest(&snapshot, actor.id, stored.expires_at)? != stored.digest {
        return Err("Os dados mudaram desde a prévia. Nenhuma alteração foi realizada; gere uma nova prévia.".to_string());
    }

    async fn update_ids(
        conn: &mut PgConnection,
        table: &str,
        ids: &[i32],
        empresa_id: i32,
    ) -> Result<u64, String> {
        if ids.is_empty() {
            return Ok(0);
        }
        let sql = format!(
            "UPDATE {} SET empresa_id = $1 WHERE id = ANY($2) AND empresa_id IS NULL",
            table
        );
        sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(empresa_id)
            .bind(ids)
            .execute(conn)
            .await
            .map(|r| r.rows_affected())
            .map_err(|e| e.to_string())
    }
    let clientes = if snapshot.clientes_atualizar.is_empty() {
        0
    } else {
        sqlx::query("UPDATE clientes SET empresa_id = $1, atualizado_em = NOW() WHERE id = ANY($2) AND empresa_id IS NULL")
            .bind(empresa_id).bind(&snapshot.clientes_atualizar).execute(&mut *tx).await.map_err(|e| e.to_string())?.rows_affected()
    };
    let equipamentos = if snapshot.equipamentos_atualizar.is_empty() {
        0
    } else {
        sqlx::query("UPDATE equipamentos SET empresa_id = $1, atualizado_em = NOW() WHERE id = ANY($2) AND empresa_id IS NULL")
            .bind(empresa_id).bind(&snapshot.equipamentos_atualizar).execute(&mut *tx).await.map_err(|e| e.to_string())?.rows_affected()
    };
    let verificacoes = update_ids(
        &mut tx,
        "verificacoes",
        &snapshot.verificacoes_atualizar,
        empresa_id,
    )
    .await?;
    let imagens = update_ids(
        &mut tx,
        "equipamento_imagens",
        &snapshot.imagens_atualizar,
        empresa_id,
    )
    .await?;
    let comunicacoes = update_ids(
        &mut tx,
        "comunicacoes",
        &snapshot.comunicacoes_atualizar,
        empresa_id,
    )
    .await?;
    if clientes != snapshot.clientes_atualizar.len() as u64
        || equipamentos != snapshot.equipamentos_atualizar.len() as u64
        || verificacoes != snapshot.verificacoes_atualizar.len() as u64
        || imagens != snapshot.imagens_atualizar.len() as u64
        || comunicacoes != snapshot.comunicacoes_atualizar.len() as u64
    {
        return Err(
            "A validação final detectou atualização parcial; a transação foi cancelada."
                .to_string(),
        );
    }
    ensure_owner(
        &mut tx,
        "clientes",
        &snapshot.clientes_atualizar,
        empresa_id,
    )
    .await?;
    ensure_owner(
        &mut tx,
        "equipamentos",
        &snapshot.equipamentos_atualizar,
        empresa_id,
    )
    .await?;
    ensure_owner(
        &mut tx,
        "verificacoes",
        &snapshot.verificacoes_atualizar,
        empresa_id,
    )
    .await?;
    ensure_owner(
        &mut tx,
        "equipamento_imagens",
        &snapshot.imagens_atualizar,
        empresa_id,
    )
    .await?;
    ensure_owner(
        &mut tx,
        "comunicacoes",
        &snapshot.comunicacoes_atualizar,
        empresa_id,
    )
    .await?;
    sqlx::query("INSERT INTO security_audit_log (event_type, profile_id, profile_name, details, success, empresa_id) VALUES ('LEGACY_DATA_REGULARIZED', $1, $2, $3, true, $4)")
        .bind(actor.id).bind(&actor.nome).bind(format!("rules_version={}; clientes={}; equipamentos={}; verificacoes={}; imagens={}; comunicacoes={}", RULES_VERSION, clientes, equipamentos, verificacoes, imagens, comunicacoes)).bind(empresa_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(RegularizacaoLegadoResultado {
        empresa_id,
        clientes,
        equipamentos,
        verificacoes,
        imagens,
        comunicacoes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_changes_with_profile_expiry_or_snapshot() {
        let expiry = Utc::now() + Duration::minutes(5);
        let mut snapshot = Snapshot {
            rules_version: 1,
            empresa_id: 1,
            clientes_atualizar: vec![1],
            equipamentos_atualizar: vec![],
            verificacoes_atualizar: vec![],
            imagens_atualizar: vec![],
            comunicacoes_atualizar: vec![],
            equipamentos_sem_cliente: vec![],
            contatos_irregulares: vec![],
            conflitos: vec![],
        };
        let first = snapshot_digest(&snapshot, 7, expiry).unwrap();
        assert_ne!(first, snapshot_digest(&snapshot, 8, expiry).unwrap());
        snapshot.clientes_atualizar.push(2);
        assert_ne!(first, snapshot_digest(&snapshot, 7, expiry).unwrap());
    }

    #[test]
    fn new_company_requires_explicit_valid_identity() {
        let valid = VinculoEmpresaPerfilInput {
            nova_empresa_nome: Some(" AutoOS ".into()),
            nova_empresa_email: Some(" ADMIN@AUTOOS.TEST ".into()),
            nova_empresa_cnpj: Some("".into()),
            ..Default::default()
        };
        assert_eq!(
            validate_new_company(&valid).unwrap(),
            ("AutoOS".into(), "admin@autoos.test".into(), None)
        );

        let missing_email = VinculoEmpresaPerfilInput {
            nova_empresa_nome: Some("AutoOS".into()),
            ..Default::default()
        };
        assert!(validate_new_company(&missing_email).is_err());
    }
}
