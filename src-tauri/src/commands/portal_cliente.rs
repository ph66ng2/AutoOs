//! Portal das Impressoras do Cliente — lado da equipe.
//!
//! O cliente responde pela Edge Function `portal-cliente` (migration 0035). Aqui ficam os
//! alertas persistentes que a equipe lê, o acesso de cada contato ao portal, a publicação da
//! proposta (versão congelada) e o cartão de contato exibido ao cliente.

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_active_session_company_id_without_touch,
    require_any_permission, require_permission,
    require_sensitive_access, SecurityProfileSummary, PERMISSION_FINANCIAL_ACTIONS, PERMISSION_MANAGE_STATUS_LINKS,
    PERMISSION_PREPARE_QUOTES,
};
use crate::commands::orcamento_decisao::obter_ou_criar_versao;
use crate::commands::types::{ClienteContato, CLIENTE_CONTATO_SELECT};
use crate::db::get_pool;
use serde::{Deserialize, Serialize};
use sqlx::{Acquire, FromRow, PgPool};
use tracing::instrument;

const TS_FMT: &str = "YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"";
const MAX_ALERTAS: i64 = 200;

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AlertaPortal {
    pub id: i64,
    pub equipamento_id: Option<i32>,
    pub tipo: String,
    pub titulo: String,
    pub detalhe: Option<String>,
    pub criado_em: String,
    pub lido_em: Option<String>,
    pub lido_por: Option<String>,
    /// Decisão da resposta ligada ao alerta (`APROVAR`, `RECUSAR`, `DESFEITA`), para cor e ícone.
    pub decisao: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrcamentoPublicado {
    pub versao_id: i64,
    pub versao: i32,
    /// `false` quando o conteúdo já estava publicado (a mesma versão foi reaproveitada).
    pub nova: bool,
}

#[derive(Debug, Serialize, Deserialize, Default, FromRow)]
#[serde(rename_all = "camelCase", default)]
pub struct ContatoPortalEmpresa {
    pub nome_exibicao: String,
    pub whatsapp: Option<String>,
    pub email: Option<String>,
    pub telefone: Option<String>,
    pub horario: Option<String>,
    /// Endereço de retirada mostrado no portal quando o equipamento está pronto (até 300).
    pub endereco: Option<String>,
    /// Link https do mapa (até 500). Opcional.
    pub maps_url: Option<String>,
}

/// Mesmas regras dos CHECK da migration 0039 (`chk_portal_contato_endereco`/`chk_portal_contato_maps_url`),
/// com mensagem clara em vez de truncar em silêncio.
fn validar_endereco_mapa(endereco: Option<&str>, maps_url: Option<&str>) -> Result<(Option<String>, Option<String>), String> {
    let endereco = endereco.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    if endereco.as_deref().is_some_and(|v| v.chars().count() > 300) {
        return Err("O endereço para retirada deve ter no máximo 300 caracteres.".to_string());
    }
    let maps_url = maps_url.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    if let Some(url) = maps_url.as_deref() {
        let esquema_https = url.get(..8).is_some_and(|inicio| inicio.eq_ignore_ascii_case("https://"));
        if !esquema_https || url.len() <= 8 || url.chars().any(char::is_whitespace) {
            return Err("O link do mapa deve começar com https:// e não pode ter espaços.".to_string());
        }
        if url.chars().count() > 500 {
            return Err("O link do mapa deve ter no máximo 500 caracteres.".to_string());
        }
    }
    Ok((endereco, maps_url))
}

fn acesso_valido(acesso: &str) -> bool {
    matches!(acesso, "NENHUM" | "ACOMPANHAR" | "DECIDIR")
}

fn texto(value: Option<&str>, max: usize) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.chars().take(max).collect())
}

/// Alertas do portal da empresa ativa, do mais recente ao mais antigo.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_alertas_portal(
    apenas_nao_lidos: bool,
    limite: Option<i64>,
) -> Result<Vec<AlertaPortal>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    // Consulta de segundo plano (sino a cada 30 s): não renova a sessão sensível.
    let empresa_id = require_active_session_company_id_without_touch(&pool).await?;
    let limite = limite.unwrap_or(50).clamp(1, MAX_ALERTAS);
    sqlx::query_as::<_, AlertaPortal>(sqlx::AssertSqlSafe(format!(
        "SELECT a.id, a.equipamento_id, a.tipo, a.titulo, a.detalhe,
                to_char(a.criado_em AT TIME ZONE 'UTC', '{TS_FMT}') AS criado_em,
                to_char(a.lido_em AT TIME ZONE 'UTC', '{TS_FMT}') AS lido_em,
                p.nome AS lido_por, r.decisao
         FROM portal_alertas a
         LEFT JOIN security_profiles p ON p.id = a.lido_por_profile_id
         LEFT JOIN orcamento_respostas r ON r.id = a.resposta_id AND r.empresa_id = a.empresa_id
         WHERE a.empresa_id = $1 AND ($2 = FALSE OR a.lido_em IS NULL)
         ORDER BY a.id DESC
         LIMIT $3"
    )))
    .bind(empresa_id)
    .bind(apenas_nao_lidos)
    .bind(limite)
    .fetch_all(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

#[tauri::command]
pub async fn contar_alertas_portal_nao_lidos() -> Result<i64, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    // Consulta de segundo plano (sino a cada 30 s): não renova a sessão sensível.
    let empresa_id = require_active_session_company_id_without_touch(&pool).await?;
    sqlx::query_scalar("SELECT COUNT(*) FROM portal_alertas WHERE empresa_id = $1 AND lido_em IS NULL")
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)
}

/// Marca como lido um alerta (`alerta_id`) ou todos os não lidos (`None`). A leitura fica no histórico.
#[tauri::command]
#[instrument(skip_all)]
pub async fn marcar_alertas_portal_lidos(alerta_id: Option<i64>) -> Result<u64, String> {
    let profile = require_sensitive_access()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let result = sqlx::query(
        "UPDATE portal_alertas SET lido_em = NOW(), lido_por_profile_id = $3
         WHERE empresa_id = $1 AND lido_em IS NULL AND ($2::BIGINT IS NULL OR id = $2)",
    )
    .bind(empresa_id)
    .bind(alerta_id)
    .bind(profile.id)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(result.rows_affected())
}

/// Define o acesso do contato ao portal. `DECIDIR` autoriza responder a orçamentos e exige
/// a permissão financeira; inativar o contato ou mudá-lo de cliente retira o acesso (trigger, 0038).
#[tauri::command]
#[instrument(skip_all, fields(contato_id = contato_id))]
pub async fn definir_acesso_portal_contato(contato_id: i32, acesso: String) -> Result<ClienteContato, String> {
    let acesso = acesso.trim().to_uppercase();
    if !acesso_valido(&acesso) {
        return Err("Acesso ao portal inválido.".to_string());
    }
    let actor = if acesso == "DECIDIR" {
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?
    } else {
        require_permission(PERMISSION_MANAGE_STATUS_LINKS)?
    };
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let contato: Option<(String,)> = sqlx::query_as(
        "SELECT portal_acesso FROM cliente_contatos
         WHERE id = $1 AND empresa_id = $2 AND ativo = true",
    )
    .bind(contato_id)
    .bind(empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let Some((anterior,)) = contato else {
        return Err("Contato não encontrado na empresa ativa.".to_string());
    };

    sqlx::query(
        "UPDATE cliente_contatos SET portal_acesso = $3, atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2",
    )
    .bind(contato_id)
    .bind(empresa_id)
    .bind(&acesso)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event(
        "PORTAL_CONTACT_ACCESS_CHANGED",
        Some(&actor),
        format!("empresa_id={empresa_id}; contato_id={contato_id}; anterior={anterior}; acesso={acesso}"),
        true,
    )
    .await;

    let query = format!("{} WHERE id = $1 AND empresa_id = $2", CLIENTE_CONTATO_SELECT);
    sqlx::query_as::<_, ClienteContato>(sqlx::AssertSqlSafe(query))
        .bind(contato_id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)
}

/// Senha do portal criada pelo operador para um contato (`None` remove). O cliente entra com
/// CPF/CNPJ + esta senha; ela identifica o contato. Só o hash bcrypt fica no banco (0036).
#[tauri::command]
#[instrument(skip_all, fields(contato_id = contato_id))]
pub async fn definir_senha_portal_contato(contato_id: i32, senha: Option<String>) -> Result<ClienteContato, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let acesso: Option<String> = sqlx::query_scalar("SELECT portal_acesso FROM cliente_contatos WHERE id = $1")
        .bind(contato_id)
        .fetch_optional(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    // Quem pode decidir orçamento só recebe senha de quem tem a permissão financeira.
    let actor = if acesso.as_deref() == Some("DECIDIR") {
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?
    } else {
        require_permission(PERMISSION_MANAGE_STATUS_LINKS)?
    };
    let empresa_id = require_active_session_company_id(&pool).await?;
    if let Some(valor) = senha.as_deref() {
        if !senha_aceitavel(valor) {
            return Err("A senha precisa ter de 8 a 72 caracteres, com letras e números.".to_string());
        }
    }

    sqlx::query("SELECT public.portal_definir_senha_contato($1, $2, $3, $4)")
        .bind(empresa_id)
        .bind(contato_id)
        .bind(senha.as_deref())
        .bind(actor.id)
        .execute(&pool)
        .await
        .map_err(|error| match error.as_database_error().map(|db| db.message().to_string()).as_deref() {
            Some("CONTATO_INDISPONIVEL") => "Contato não encontrado na empresa ativa.".to_string(),
            Some("CONTATO_SEM_ACESSO") => "Libere o acesso do contato ao portal antes de criar a senha.".to_string(),
            Some("SENHA_FRACA") => "A senha precisa ter de 8 a 72 caracteres, com letras e números.".to_string(),
            Some("SENHA_REPETIDA") => "Outro contato deste CPF/CNPJ já usa essa senha. Escolha outra: é a senha que identifica quem entrou.".to_string(),
            _ => super::operator_errors::mapear_erro_sql(error),
        })?;

    record_security_event(
        if senha.is_some() { "PORTAL_PASSWORD_SET" } else { "PORTAL_PASSWORD_REMOVED" },
        Some(&actor),
        format!("empresa_id={empresa_id}; contato_id={contato_id}"),
        true,
    )
    .await;

    let query = format!("{} WHERE id = $1 AND empresa_id = $2", CLIENTE_CONTATO_SELECT);
    sqlx::query_as::<_, ClienteContato>(sqlx::AssertSqlSafe(query))
        .bind(contato_id)
        .bind(empresa_id)
        .fetch_one(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)
}

/// Mesma regra de `autoos_portal_senha_valida` (0036), conferida antes de ir ao banco.
fn senha_aceitavel(senha: &str) -> bool {
    senha.chars().count() >= 8
        && senha.len() <= 72
        && senha.chars().any(char::is_alphabetic)
        && senha.chars().any(|c| c.is_ascii_digit())
        && !senha.chars().any(char::is_control)
}

/// Sem 0/O, 1/l/I: a senha costuma ser ditada ou digitada a partir de um papel.
/// Mesmo formato de `gerarSenhaPortal` em `SenhaPortalDialog.tsx`.
const SENHA_ALFABETO: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const SENHA_DIGITOS: &[u8] = b"23456789";

/// Valor mostrado no lugar de uma senha que já existe (o banco só guarda o hash).
pub(crate) const SENHA_MASCARADA: &str = "••••-••••-••••";

/// Senha forte e legível, ex.: `Kp7m-Tx4q-9Wbd` (3 blocos de 4; o 3º caractere de cada bloco é dígito).
pub(crate) fn gerar_senha_portal() -> String {
    use rand::{rngs::OsRng, Rng};
    let mut rng = OsRng;
    let mut senha = String::with_capacity(14);
    for bloco in 0..3 {
        if bloco > 0 {
            senha.push('-');
        }
        for posicao in 0..4 {
            let origem = if posicao == 2 { SENHA_DIGITOS } else { SENHA_ALFABETO };
            senha.push(origem[rng.gen_range(0..origem.len())] as char);
        }
    }
    senha
}

/// Senha em claro que nunca vai para log: `Debug` não a mostra; na serialização ela segue
/// para a tela uma única vez.
#[derive(Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct SenhaPortal(String);

impl SenhaPortal {
    pub(crate) fn expor(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SenhaPortal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("***")
    }
}

/// CPF `000.000.000-00` ou CNPJ `00.000.000/0000-00`; qualquer outro valor volta como veio.
pub(crate) fn formatar_documento(valor: &str) -> String {
    let digitos: Vec<char> = valor.chars().filter(char::is_ascii_digit).collect();
    let juntar = |intervalo: std::ops::Range<usize>| digitos[intervalo].iter().collect::<String>();
    match digitos.len() {
        11 => format!("{}.{}.{}-{}", juntar(0..3), juntar(3..6), juntar(6..9), juntar(9..11)),
        14 => format!("{}.{}.{}/{}-{}", juntar(0..2), juntar(2..5), juntar(5..8), juntar(8..12), juntar(12..14)),
        _ => valor.to_string(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DestinatarioOrcamento {
    pub contato_id: Option<i32>,
    pub nome: String,
    pub telefone: Option<String>,
    pub email: Option<String>,
    pub cliente_nome: String,
    /// Já formatado (CPF/CNPJ).
    pub cliente_documento: String,
    /// `RESPONSAVEL`, `CONTATO` ou `CLIENTE`.
    pub origem: String,
    /// `NENHUM`, `ACOMPANHAR` ou `DECIDIR`; `None` quando não há contato.
    pub portal_acesso: Option<String>,
    pub tem_senha: bool,
    /// O contato já entrou no portal com a senha atual.
    pub usou_senha_atual: bool,
    /// Nenhum contato com telefone válido: a mensagem vai ao cliente.
    pub precisa_contato: bool,
}

#[derive(FromRow)]
struct LinhaDestinatario {
    contato_id: Option<i32>,
    contato_nome: Option<String>,
    contato_telefone: Option<String>,
    contato_email: Option<String>,
    eh_responsavel: Option<bool>,
    portal_acesso: Option<String>,
    tem_senha: Option<bool>,
    usou_senha_atual: Option<bool>,
    cliente_nome: String,
    cliente_documento: Option<String>,
    fallback_nome: String,
    fallback_telefone: Option<String>,
    fallback_email: Option<String>,
}

/// Quem recebe o orçamento da OS: o responsável (se tem telefone válido), senão um contato que
/// decide, senão o primeiro por nome; sem contato utilizável, o próprio cliente.
pub(crate) async fn resolver_destinatario_orcamento<'e>(
    executor: impl sqlx::PgExecutor<'e>,
    empresa_id: i32,
    equipamento_id: i32,
) -> Result<DestinatarioOrcamento, String> {
    let linha = sqlx::query_as::<_, LinhaDestinatario>(
        "SELECT c.id AS contato_id, c.nome AS contato_nome, c.telefone AS contato_telefone,
                c.email AS contato_email, c.eh_responsavel, c.portal_acesso, c.tem_senha, c.usou_senha_atual,
                COALESCE(NULLIF(BTRIM(cl.nome), ''), NULLIF(BTRIM(e.cliente_nome), ''), 'Cliente') AS cliente_nome,
                COALESCE(cl.documento, cl.cpf_cnpj) AS cliente_documento,
                -- Mesma regra do envio do orçamento (envio_whatsapp.rs): nome e telefone da mesma pessoa.
                CASE WHEN NULLIF(BTRIM(e.responsavel_telefone), '') IS NOT NULL
                     THEN COALESCE(NULLIF(BTRIM(e.responsavel_nome), ''), NULLIF(BTRIM(e.cliente_nome), ''), 'Cliente')
                     ELSE COALESCE(NULLIF(BTRIM(e.cliente_nome), ''), 'Cliente')
                END AS fallback_nome,
                COALESCE(NULLIF(BTRIM(e.responsavel_telefone), ''), NULLIF(BTRIM(e.cliente_telefone), '')) AS fallback_telefone,
                COALESCE(NULLIF(BTRIM(e.cliente_email), ''), NULLIF(BTRIM(cl.email), '')) AS fallback_email
         FROM equipamentos e
         LEFT JOIN clientes cl ON cl.id = e.cliente_id AND cl.empresa_id = e.empresa_id
         LEFT JOIN LATERAL (
             SELECT k.id, k.nome, k.telefone, k.email, k.portal_acesso,
                    COALESCE(k.id = e.responsavel_contato_id, FALSE) AS eh_responsavel,
                    (k.portal_senha_hash IS NOT NULL) AS tem_senha,
                    EXISTS (
                        SELECT 1 FROM portal_sessoes s
                        WHERE s.contato_id = k.id AND s.empresa_id = k.empresa_id AND s.metodo = 'SENHA'
                          AND k.portal_senha_definida_em IS NOT NULL
                          AND s.criada_em >= k.portal_senha_definida_em
                    ) AS usou_senha_atual
             FROM cliente_contatos k
             WHERE k.cliente_id = e.cliente_id AND k.empresa_id = e.empresa_id AND k.ativo
               AND length(public.autoos_portal_telefone(k.telefone)) >= 10
             ORDER BY COALESCE(k.id = e.responsavel_contato_id, FALSE) DESC,
                      (k.portal_acesso = 'DECIDIR' AND k.portal_senha_hash IS NOT NULL) DESC,
                      k.nome, k.id
             LIMIT 1
         ) c ON TRUE
         WHERE e.id = $1 AND e.empresa_id = $2",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_optional(executor)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .ok_or_else(|| "Equipamento não encontrado na empresa ativa.".to_string())?;

    let documento = formatar_documento(linha.cliente_documento.as_deref().unwrap_or_default().trim());
    let limpo = |valor: Option<String>| valor.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    let Some(contato_id) = linha.contato_id else {
        return Ok(DestinatarioOrcamento {
            contato_id: None,
            nome: linha.fallback_nome,
            telefone: limpo(linha.fallback_telefone),
            email: limpo(linha.fallback_email),
            cliente_nome: linha.cliente_nome,
            cliente_documento: documento,
            origem: "CLIENTE".to_string(),
            portal_acesso: None,
            tem_senha: false,
            usou_senha_atual: false,
            precisa_contato: true,
        });
    };
    Ok(DestinatarioOrcamento {
        contato_id: Some(contato_id),
        nome: linha.contato_nome.unwrap_or_default(),
        telefone: limpo(linha.contato_telefone),
        email: limpo(linha.contato_email),
        cliente_nome: linha.cliente_nome,
        cliente_documento: documento,
        origem: if linha.eh_responsavel.unwrap_or(false) { "RESPONSAVEL" } else { "CONTATO" }.to_string(),
        portal_acesso: linha.portal_acesso,
        tem_senha: linha.tem_senha.unwrap_or(false),
        usou_senha_atual: linha.usou_senha_atual.unwrap_or(false),
        precisa_contato: false,
    })
}

#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn obter_destinatario_orcamento(equipamento_id: i32) -> Result<DestinatarioOrcamento, String> {
    require_sensitive_access()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    resolver_destinatario_orcamento(&pool, empresa_id, equipamento_id).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CredenciaisPortal {
    pub usuario: String,
    pub senha: SenhaPortal,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparoAcessoPortal {
    pub destinatario: DestinatarioOrcamento,
    pub portal_ativo: bool,
    /// Só quando uma senha foi criada agora; é a única vez em que ela aparece.
    pub credenciais: Option<CredenciaisPortal>,
    pub senha_existente: bool,
    /// O contato estava sem acesso e passou a acompanhar.
    pub acesso_concedido: bool,
}

const TENTATIVAS_SENHA: u8 = 5;

/// Mesmo mapeamento de erros de `definir_senha_portal_contato`.
fn mapear_erro_senha_portal(error: sqlx::Error) -> String {
    match error.as_database_error().map(|db| db.message().to_string()).as_deref() {
        Some("CONTATO_INDISPONIVEL") => "Contato não encontrado na empresa ativa.".to_string(),
        Some("CONTATO_SEM_ACESSO") => "Libere o acesso do contato ao portal antes de criar a senha.".to_string(),
        Some("SENHA_FRACA") => "A senha precisa ter de 8 a 72 caracteres, com letras e números.".to_string(),
        Some("SENHA_REPETIDA") => "Outro contato deste CPF/CNPJ já usa essa senha. Escolha outra: é a senha que identifica quem entrou.".to_string(),
        _ => super::operator_errors::mapear_erro_sql(error),
    }
}

fn senha_repetida(error: &sqlx::Error) -> bool {
    error.as_database_error().is_some_and(|db| db.message() == "SENHA_REPETIDA")
}

/// Garante, ao enviar o orçamento, que o contato destinatário consegue entrar no portal: sem
/// acesso passa a ACOMPANHAR (nunca vira DECIDIR) e, sem senha, recebe uma gerada aqui.
///
/// Exceção deliberada à regra "senha de quem decide é criada por quem tem permissão financeira":
/// quem prepara orçamento precisa entregar o acesso junto com ele, em qualquer dos três casos.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn preparar_acesso_portal(
    equipamento_id: i32,
    forcar_nova_senha: Option<bool>,
) -> Result<PreparoAcessoPortal, String> {
    let actor = require_any_permission(&[PERMISSION_FINANCIAL_ACTIONS, PERMISSION_PREPARE_QUOTES])?;
    let forcar = forcar_nova_senha.unwrap_or(false);
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let map = super::operator_errors::mapear_erro_sql;
    let mut tx = pool.begin().await.map_err(map)?;

    let portal_ativo: bool = sqlx::query_scalar("SELECT public.autoos_portal_respostas_ligadas($1)")
        .bind(empresa_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map)?;
    let destinatario = resolver_destinatario_orcamento(&mut *tx, empresa_id, equipamento_id).await?;
    let Some(contato_id) = destinatario.contato_id.filter(|_| portal_ativo) else {
        return Ok(PreparoAcessoPortal {
            destinatario,
            portal_ativo,
            credenciais: None,
            senha_existente: false,
            acesso_concedido: false,
        });
    };

    let acesso_atual: Option<String> = sqlx::query_scalar(
        "SELECT portal_acesso FROM cliente_contatos WHERE id = $1 AND empresa_id = $2 AND ativo FOR UPDATE",
    )
    .bind(contato_id)
    .bind(empresa_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map)?;
    let Some(acesso_atual) = acesso_atual else {
        return Err("Contato não encontrado na empresa ativa.".to_string());
    };
    let acesso_concedido = acesso_atual == "NENHUM";
    if acesso_concedido {
        sqlx::query(
            "UPDATE cliente_contatos SET portal_acesso = 'ACOMPANHAR', atualizado_em = NOW()
             WHERE id = $1 AND empresa_id = $2",
        )
        .bind(contato_id)
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(map)?;
    }

    // Relê com a linha travada: hash e uso da senha atual valem para o que vai ser decidido.
    let atual = resolver_destinatario_orcamento(&mut *tx, empresa_id, equipamento_id).await?;
    let criar = !atual.tem_senha || forcar;
    if atual.tem_senha && forcar && atual.usou_senha_atual {
        return Err("Este contato já entrou no portal com a senha atual; não dá para gerar outra aqui.".to_string());
    }

    let mut credenciais = None;
    if criar {
        for tentativa in 1..=TENTATIVAS_SENHA {
            let senha = gerar_senha_portal();
            let mut savepoint = tx.begin().await.map_err(map)?;
            let resultado = sqlx::query("SELECT public.portal_definir_senha_contato($1, $2, $3, $4)")
                .bind(empresa_id)
                .bind(contato_id)
                .bind(&senha)
                .bind(actor.id)
                .execute(&mut *savepoint)
                .await;
            match resultado {
                Ok(_) => {
                    savepoint.commit().await.map_err(map)?;
                    credenciais = Some(CredenciaisPortal {
                        usuario: atual.cliente_documento.clone(),
                        senha: SenhaPortal(senha),
                    });
                    break;
                }
                Err(error) if senha_repetida(&error) && tentativa < TENTATIVAS_SENHA => {
                    savepoint.rollback().await.map_err(map)?;
                }
                Err(error) => return Err(mapear_erro_senha_portal(error)),
            }
        }
    }

    let destinatario = resolver_destinatario_orcamento(&mut *tx, empresa_id, equipamento_id).await?;
    tx.commit().await.map_err(map)?;

    record_security_event(
        "PORTAL_ACCESS_PREPARED",
        Some(&actor),
        format!(
            "empresa_id={empresa_id}; equipamento_id={equipamento_id}; contato_id={contato_id}; acesso_concedido={acesso_concedido}; senha_criada={}; forcada={}",
            credenciais.is_some(),
            forcar && atual.tem_senha
        ),
        true,
    )
    .await;

    Ok(PreparoAcessoPortal {
        destinatario,
        portal_ativo,
        senha_existente: credenciais.is_none(),
        credenciais,
        acesso_concedido,
    })
}

/// Publica o orçamento atual no portal como versão congelada. Republicar o mesmo conteúdo
/// reaproveita a versão; um orçamento alterado vira nova versão e a anterior deixa de aceitar respostas.
#[tauri::command]
#[instrument(skip_all, fields(equipamento_id = equipamento_id))]
pub async fn publicar_orcamento_portal(equipamento_id: i32) -> Result<OrcamentoPublicado, String> {
    let actor = require_any_permission(&[PERMISSION_MANAGE_STATUS_LINKS, PERMISSION_PREPARE_QUOTES])?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    publicar_versao(&pool, empresa_id, &actor, equipamento_id).await
}

/// Cria ou reaproveita a versão publicada de uma OS. Cada chamada tem a sua transação e grava o
/// evento `BUDGET_PUBLISHED_TO_PORTAL`.
async fn publicar_versao(
    pool: &PgPool,
    empresa_id: i32,
    actor: &SecurityProfileSummary,
    equipamento_id: i32,
) -> Result<OrcamentoPublicado, String> {
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;

    let antes: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(id) FROM orcamento_versoes WHERE equipamento_id = $1 AND empresa_id = $2",
    )
    .bind(equipamento_id)
    .bind(empresa_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let versao = obter_ou_criar_versao(&mut tx, empresa_id, equipamento_id, actor.id).await?;
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;

    let nova = antes.is_none_or(|id| versao.id > id);
    record_security_event(
        "BUDGET_PUBLISHED_TO_PORTAL",
        Some(actor),
        format!("empresa_id={empresa_id}; equipamento_id={equipamento_id}; versao={}; nova={nova}", versao.numero),
        true,
    )
    .await;
    Ok(OrcamentoPublicado { versao_id: versao.id, versao: versao.numero, nova })
}

#[derive(Debug, Serialize, FromRow)]
pub struct OrcamentoPendentePortal {
    pub equipamento_id: i32,
    pub descricao: String,
    pub prazo_aprovacao: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FalhaPublicacaoPortal {
    pub equipamento_id: i32,
    pub descricao: String,
    pub motivo: String,
}

#[derive(Debug, Serialize)]
pub struct PublicacaoLotePortal {
    pub publicados: Vec<i32>,
    pub falhas: Vec<FalhaPublicacaoPortal>,
}

/// OS em AGUARDANDO_APROVACAO que ainda não têm versão aberta no portal.
async fn consultar_pendentes_portal(pool: &PgPool, empresa_id: i32) -> Result<Vec<OrcamentoPendentePortal>, String> {
    sqlx::query_as::<_, OrcamentoPendentePortal>(
        "SELECT e.id AS equipamento_id,
                CONCAT_WS(' ', e.marca, e.modelo, '- série', e.serial_number) AS descricao,
                e.prazo_aprovacao
         FROM equipamentos e
         WHERE e.empresa_id = $1 AND e.status = 'AGUARDANDO_APROVACAO'
           AND NOT EXISTS (
             SELECT 1 FROM orcamento_versoes v
             WHERE v.equipamento_id = e.id AND v.empresa_id = e.empresa_id AND v.encerrada_em IS NULL
           )
         ORDER BY e.id",
    )
    .bind(empresa_id)
    .fetch_all(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

#[tauri::command]
pub async fn listar_orcamentos_pendentes_portal() -> Result<Vec<OrcamentoPendentePortal>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    consultar_pendentes_portal(&pool, empresa_id).await
}

/// Publica no portal todos os orçamentos pendentes. Uma falha não interrompe as outras: cada OS
/// tem a sua transação, e as que já foram publicadas continuam publicadas.
#[tauri::command]
#[instrument(skip_all)]
pub async fn publicar_orcamentos_pendentes_portal() -> Result<PublicacaoLotePortal, String> {
    let actor = require_any_permission(&[PERMISSION_MANAGE_STATUS_LINKS, PERMISSION_PREPARE_QUOTES])?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let pendentes = consultar_pendentes_portal(&pool, empresa_id).await?;

    let mut publicados = Vec::new();
    let mut falhas = Vec::new();
    for pendente in pendentes {
        match publicar_versao(&pool, empresa_id, &actor, pendente.equipamento_id).await {
            Ok(_) => publicados.push(pendente.equipamento_id),
            Err(motivo) => falhas.push(FalhaPublicacaoPortal {
                equipamento_id: pendente.equipamento_id,
                descricao: pendente.descricao,
                motivo,
            }),
        }
    }

    let falhas_auditoria: Vec<(i32, String)> = falhas
        .iter()
        .map(|falha: &FalhaPublicacaoPortal| (falha.equipamento_id, falha.motivo.clone()))
        .collect();
    record_security_event(
        "BUDGET_PORTAL_BULK_PUBLISH",
        Some(&actor),
        format!("empresa_id={empresa_id}; {}", resumo_auditoria_lote(publicados.len(), &falhas_auditoria)),
        falhas.is_empty(),
    )
    .await;

    Ok(PublicacaoLotePortal { publicados, falhas })
}

/// Resumo do lote para a trilha de auditoria: `publicados=N; falhas=M; ids_falha=[id:motivo,…]`.
/// Ponto e vírgula e quebra de linha no motivo viram vírgula, para o registro continuar legível.
fn resumo_auditoria_lote(publicados: usize, falhas: &[(i32, String)]) -> String {
    let ids: Vec<String> = falhas
        .iter()
        .map(|(id, motivo)| format!("{id}:{}", motivo.replace([';', '\n', '\r'], ",")))
        .collect();
    format!("publicados={publicados}; falhas={}; ids_falha=[{}]", falhas.len(), ids.join(","))
}

#[tauri::command]
pub async fn obter_contato_portal_empresa() -> Result<Option<ContatoPortalEmpresa>, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    sqlx::query_as::<_, ContatoPortalEmpresa>(
        "SELECT nome_exibicao, whatsapp, email, telefone, horario, endereco, maps_url
         FROM portal_contato_empresa WHERE empresa_id = $1",
    )
    .bind(empresa_id)
    .fetch_optional(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

/// Cartão "Fale com a equipe" do portal. Sem segredos: só canais públicos da empresa.
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_contato_portal_empresa(input: ContatoPortalEmpresa) -> Result<ContatoPortalEmpresa, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let nome = texto(Some(&input.nome_exibicao), 80).unwrap_or_else(|| "BMI TAG".to_string());
    let whatsapp = texto(input.whatsapp.as_deref(), 40).map(|v| v.chars().filter(char::is_ascii_digit).collect::<String>());
    if whatsapp.as_deref().is_some_and(|v| !(10..=15).contains(&v.len())) {
        return Err("Informe o WhatsApp com DDD (10 a 15 dígitos).".to_string());
    }
    let email = texto(input.email.as_deref(), 120);
    if email.as_deref().is_some_and(|v| !v.contains('@')) {
        return Err("Email de contato inválido.".to_string());
    }
    let (endereco, maps_url) = validar_endereco_mapa(input.endereco.as_deref(), input.maps_url.as_deref())?;

    sqlx::query(
        "INSERT INTO portal_contato_empresa (empresa_id, nome_exibicao, whatsapp, email, telefone, horario, endereco, maps_url, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (empresa_id) DO UPDATE
         SET nome_exibicao = EXCLUDED.nome_exibicao, whatsapp = EXCLUDED.whatsapp, email = EXCLUDED.email,
             telefone = EXCLUDED.telefone, horario = EXCLUDED.horario,
             endereco = EXCLUDED.endereco, maps_url = EXCLUDED.maps_url, atualizado_em = NOW()",
    )
    .bind(empresa_id)
    .bind(&nome)
    .bind(whatsapp.filter(|v| !v.is_empty()))
    .bind(email)
    .bind(texto(input.telefone.as_deref(), 40))
    .bind(texto(input.horario.as_deref(), 120))
    .bind(endereco)
    .bind(maps_url)
    .execute(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    record_security_event("PORTAL_CONTACT_CARD_UPDATED", Some(&actor), format!("empresa_id={empresa_id}"), true).await;
    obter_contato_portal_empresa().await?.ok_or_else(|| "Contato não encontrado após salvar.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resumo_auditoria_lote_lista_contagens_e_falhas() {
        let falhas = vec![(7, "O prazo de aprovação do orçamento já terminou.".to_string())];
        assert_eq!(
            resumo_auditoria_lote(3, &falhas),
            "publicados=3; falhas=1; ids_falha=[7:O prazo de aprovação do orçamento já terminou.]"
        );
        assert_eq!(resumo_auditoria_lote(0, &[]), "publicados=0; falhas=0; ids_falha=[]");
    }

    #[test]
    fn resumo_auditoria_lote_nao_deixa_ponto_e_virgula_no_motivo() {
        let falhas = vec![(2, "a; b\nc".to_string()), (5, "d".to_string())];
        assert_eq!(
            resumo_auditoria_lote(1, &falhas),
            "publicados=1; falhas=2; ids_falha=[2:a, b,c,5:d]"
        );
    }

    #[test]
    fn portal_access_is_whitelisted() {
        assert!(acesso_valido("DECIDIR"));
        assert!(acesso_valido("ACOMPANHAR"));
        assert!(acesso_valido("NENHUM"));
        assert!(!acesso_valido("ADMIN"));
    }

    #[test]
    fn operator_password_rule_matches_the_database() {
        assert!(senha_aceitavel("Ana-Senha-2026"));
        assert!(!senha_aceitavel("curta1"));
        assert!(!senha_aceitavel("somenteletras"));
        assert!(!senha_aceitavel("12345678"));
        assert!(!senha_aceitavel(&format!("a1{}", "x".repeat(71))));
    }

    #[test]
    fn generated_passwords_follow_format_and_database_rule() {
        for _ in 0..500 {
            let senha = gerar_senha_portal();
            assert!(senha_aceitavel(&senha), "{senha}");
            let blocos: Vec<&str> = senha.split('-').collect();
            assert_eq!(blocos.len(), 3);
            for bloco in blocos {
                assert_eq!(bloco.len(), 4);
                assert!(bloco.as_bytes()[2].is_ascii_digit());
            }
        }
    }

    #[test]
    fn password_wrapper_never_prints_the_secret() {
        let senha = SenhaPortal(gerar_senha_portal());
        let texto = format!("{senha:?}");
        assert_eq!(texto, "***");
        assert!(!texto.contains(senha.expor()));
        assert_eq!(serde_json::to_string(&senha).unwrap(), format!("\"{}\"", senha.expor()));
    }

    #[test]
    fn document_is_formatted_as_cpf_or_cnpj() {
        assert_eq!(formatar_documento("12345678901"), "123.456.789-01");
        assert_eq!(formatar_documento("12345678000199"), "12.345.678/0001-99");
        assert_eq!(formatar_documento("123.456.789-01"), "123.456.789-01");
        assert_eq!(formatar_documento("ABC-123"), "ABC-123");
        assert_eq!(formatar_documento(""), "");
    }

    #[test]
    fn contact_text_is_trimmed_and_bounded() {
        assert_eq!(texto(Some("  "), 10), None);
        assert_eq!(texto(Some(" abcdef "), 3).as_deref(), Some("abc"));
    }

    #[test]
    fn address_and_map_follow_the_database_check() {
        assert_eq!(validar_endereco_mapa(None, None).unwrap(), (None, None));
        assert_eq!(validar_endereco_mapa(Some("  "), Some(" ")).unwrap(), (None, None));
        let (e, m) = validar_endereco_mapa(Some(" Rua A, 10 "), Some(" HTTPS://maps.app.goo.gl/x ")).unwrap();
        assert_eq!(e.as_deref(), Some("Rua A, 10"));
        assert_eq!(m.as_deref(), Some("HTTPS://maps.app.goo.gl/x"));
        assert!(validar_endereco_mapa(Some(&"a".repeat(300)), None).is_ok());
        assert!(validar_endereco_mapa(Some(&"a".repeat(301)), None).is_err());
        assert!(validar_endereco_mapa(None, Some("http://maps.google.com/x")).is_err());
        assert!(validar_endereco_mapa(None, Some("javascript:alert(1)")).is_err());
        assert!(validar_endereco_mapa(None, Some("https://")).is_err());
        assert!(validar_endereco_mapa(None, Some("https://maps.google.com/a b")).is_err());
        assert!(validar_endereco_mapa(None, Some(&format!("https://x.com/{}", "a".repeat(486)))).is_ok());
        assert!(validar_endereco_mapa(None, Some(&format!("https://x.com/{}", "a".repeat(487)))).is_err());
    }
}

/// Liga/desliga do portal e situação da efetivação automática, para Configurações.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoPortal {
    /// `portal_config_empresa.portal_enabled`: login e consulta dos atendimentos desta empresa.
    pub portal_ativo: bool,
    /// `portal_config_empresa.respostas_enabled`: aceitar e recusar pelo portal.
    pub respostas_ativas: bool,
    /// Respostas desta empresa que passaram do prazo de correção (+5 min) sem serem aplicadas nem
    /// falharem: sinal de que o agendamento da efetivação no Supabase não está rodando.
    pub respostas_atrasadas: i64,
}

#[tauri::command]
pub async fn obter_estado_portal() -> Result<EstadoPortal, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let (portal_ativo, respostas_ativas, respostas_atrasadas): (bool, bool, i64) = sqlx::query_as(
        "SELECT
            COALESCE((SELECT portal_enabled FROM portal_config_empresa WHERE empresa_id = $1), FALSE),
            COALESCE((SELECT respostas_enabled FROM portal_config_empresa WHERE empresa_id = $1), FALSE),
            (SELECT COUNT(*) FROM orcamento_respostas r
             JOIN orcamento_versoes v ON v.id = r.versao_id AND v.empresa_id = r.empresa_id
             WHERE r.empresa_id = $1 AND r.origem = 'PORTAL_CLIENTE' AND r.decisao IN ('APROVAR', 'RECUSAR')
               AND r.aplicada_em IS NULL AND r.efetivacao_falhou_em IS NULL AND v.encerrada_em IS NULL
               AND NOT EXISTS (SELECT 1 FROM orcamento_respostas n WHERE n.versao_id = r.versao_id AND n.id > r.id)
               AND r.registrada_em < NOW() - make_interval(mins => GREATEST(
                   COALESCE((SELECT janela_correcao_minutos FROM orcamento_aceite_config WHERE singleton), 15), 15) + 5))",
    )
    .bind(empresa_id)
    .fetch_one(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(EstadoPortal { portal_ativo, respostas_ativas, respostas_atrasadas })
}

/// Liga/desliga o portal (gestão de links) e as respostas pelo portal (permissão financeira) da
/// empresa do perfil ativo. Desligar não apaga nada: o login cai na hora e as sessões voltam a
/// valer ao religar.
#[tauri::command]
#[instrument(skip_all, fields(portal_ativo = portal_ativo, respostas_ativas = respostas_ativas))]
pub async fn definir_estado_portal(portal_ativo: bool, respostas_ativas: bool) -> Result<EstadoPortal, String> {
    let actor = require_permission(PERMISSION_MANAGE_STATUS_LINKS)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let map = super::operator_errors::mapear_erro_sql;
    let mut tx = pool.begin().await.map_err(map)?;
    sqlx::query("INSERT INTO portal_config_empresa (empresa_id) VALUES ($1) ON CONFLICT (empresa_id) DO NOTHING")
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(map)?;
    let respostas_antes: bool = sqlx::query_scalar(
        "SELECT respostas_enabled FROM portal_config_empresa WHERE empresa_id = $1 FOR UPDATE",
    )
    .bind(empresa_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map)?;
    if respostas_antes != respostas_ativas {
        // Clientes aprovando orçamentos mexem em status, pagamento e estoque.
        require_permission(PERMISSION_FINANCIAL_ACTIONS)?;
    }
    sqlx::query(
        "UPDATE portal_config_empresa
         SET portal_enabled = $2, respostas_enabled = $3, atualizado_em = NOW(), atualizado_por_profile_id = $4
         WHERE empresa_id = $1",
    )
    .bind(empresa_id)
    .bind(portal_ativo)
    .bind(respostas_ativas)
    .bind(actor.id)
    .execute(&mut *tx)
    .await
    .map_err(map)?;
    tx.commit().await.map_err(map)?;
    record_security_event(
        "PORTAL_CONFIG_CHANGED",
        Some(&actor),
        format!("empresa_id={empresa_id}; portal_enabled={portal_ativo}; respostas_enabled={respostas_ativas}"),
        true,
    )
    .await;
    obter_estado_portal().await
}
