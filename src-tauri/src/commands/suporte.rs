//! Suporte pelo Slack (só a BMITAG). A pessoa abre um chamado no AutoOS e ele vira uma thread
//! no canal configurado; o atendimento (automático ou humano) responde na thread. O token do
//! bot fica no cofre do sistema deste computador (nunca no banco); o canal fica no banco.
//! O endereço da API pode ser trocado por `AUTOOS_SLACK_API_URL` (testes com servidor falso).

use crate::commands::auth::{
    record_security_event, require_active_session_company_id, require_permission, require_sensitive_access,
    PERMISSION_COMMUNICATION_SETTINGS,
};
use crate::db::get_pool;
use base64::Engine;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;
use tracing::{error, instrument};

const KEYRING_SERVICE: &str = "autoos";
const KEYRING_USER: &str = "suporte_slack_token";
const MAX_IMAGENS: usize = 3;
const MAX_BYTES_IMAGEM: usize = 5 * 1024 * 1024;
const MAX_TEXTO: usize = 4000;

fn api_base() -> String {
    std::env::var("AUTOOS_SLACK_API_URL")
        .ok()
        .map(|url| url.trim_end_matches('/').to_string())
        .filter(|url| !url.is_empty())
        .unwrap_or_else(|| "https://slack.com/api".to_string())
}

fn entrada_token() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| {
        error!("Erro ao abrir o cofre para o token do suporte: {}", e);
        e.to_string()
    })
}

pub(crate) fn token_suporte() -> Option<String> {
    entrada_token().ok()?.get_password().ok().filter(|t| !t.trim().is_empty())
}

/// Canal no formato do Slack (C… público, G… privado antigo).
pub(crate) fn canal_valido(canal: &str) -> bool {
    let canal = canal.trim();
    canal.len() >= 9
        && canal.len() <= 20
        && (canal.starts_with('C') || canal.starts_with('G'))
        && canal.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

async fn canal_configurado(pool: &sqlx::PgPool) -> Result<Option<String>, String> {
    let canal: Option<Option<String>> = sqlx::query_scalar("SELECT suporte_slack_canal FROM configuracoes_sistema WHERE id = 1")
        .fetch_optional(pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    Ok(canal.flatten().filter(|c| !c.trim().is_empty()))
}

// ─── API do Slack ──────────────────────────────────────────

/// Resposta do Slack: `ok` falso vira erro com o código que o Slack devolveu.
fn conferir(resposta: Value, acao: &str) -> Result<Value, String> {
    if resposta.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(resposta);
    }
    let codigo = resposta.get("error").and_then(Value::as_str).unwrap_or("resposta inesperada");
    let explicacao = match codigo {
        "not_in_channel" => "o app do suporte não está no canal; convide-o no Slack",
        "channel_not_found" => "canal do suporte não encontrado; confira o ID em Configurações",
        "invalid_auth" | "not_authed" | "token_revoked" | "account_inactive" => {
            "token do suporte inválido neste computador; cadastre de novo em Configurações"
        }
        _ => codigo,
    };
    Err(format!("Slack recusou ({acao}): {explicacao}."))
}

pub(crate) async fn slack_post(
    client: &Client,
    token: &str,
    metodo: &str,
    corpo: &Value,
) -> Result<Value, String> {
    let resposta = client
        .post(format!("{}/{}", api_base(), metodo))
        .bearer_auth(token)
        .json(corpo)
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Slack: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Resposta inválida do Slack: {e}"))?;
    conferir(resposta, metodo)
}

/// Envia um arquivo para a thread (fluxo novo do Slack: pede a URL, sobe e conclui).
async fn slack_enviar_arquivo(
    client: &Client,
    token: &str,
    canal: &str,
    thread_ts: &str,
    nome: &str,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let pedido = client
        .post(format!("{}/files.getUploadURLExternal", api_base()))
        .bearer_auth(token)
        .form(&[("filename", nome.to_string()), ("length", bytes.len().to_string())])
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Slack: {e}"))?
        .json::<Value>()
        .await
        .map_err(|e| format!("Resposta inválida do Slack: {e}"))?;
    let pedido = conferir(pedido, "files.getUploadURLExternal")?;
    let url = pedido.get("upload_url").and_then(Value::as_str).ok_or("Slack não devolveu o endereço do envio.")?;
    let file_id = pedido.get("file_id").and_then(Value::as_str).ok_or("Slack não devolveu o arquivo.")?;
    let envio = client.post(url).body(bytes).send().await.map_err(|e| format!("Falha ao enviar o print: {e}"))?;
    if !envio.status().is_success() {
        return Err(format!("Falha ao enviar o print (HTTP {}).", envio.status()));
    }
    slack_post(
        client,
        token,
        "files.completeUploadExternal",
        &json!({ "files": [{ "id": file_id, "title": nome }], "channel_id": canal, "thread_ts": thread_ts }),
    )
    .await?;
    Ok(())
}

// ─── Configuração ─────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ConfigSuporte {
    /// Este computador tem o token do bot no cofre.
    pub token_neste_computador: bool,
    pub canal: Option<String>,
}

#[tauri::command]
#[instrument(skip_all)]
pub async fn obter_config_suporte() -> Result<ConfigSuporte, String> {
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    Ok(ConfigSuporte { token_neste_computador: token_suporte().is_some(), canal: canal_configurado(&pool).await? })
}

#[derive(Debug, Deserialize)]
pub struct ConfigSuporteInput {
    /// Vazio mantém o token já guardado neste computador.
    pub token: Option<String>,
    pub canal: String,
}

/// Grava o canal (empresa) e, se veio, o token do bot (cofre deste computador).
#[tauri::command]
#[instrument(skip_all)]
pub async fn salvar_config_suporte(input: ConfigSuporteInput) -> Result<ConfigSuporte, String> {
    let actor = require_permission(PERMISSION_COMMUNICATION_SETTINGS)?;
    let canal = input.canal.trim().to_string();
    if !canal_valido(&canal) {
        return Err("Informe o ID do canal do Slack (começa com C, ex.: C0CE5M6GTRV).".to_string());
    }
    let token = input.token.as_deref().map(str::trim).filter(|t| !t.is_empty());
    if let Some(token) = token {
        if !token.starts_with("xoxb-") {
            return Err("Use o Bot User OAuth Token do app (começa com xoxb-).".to_string());
        }
        entrada_token()?.set_password(token).map_err(|e| {
            error!("Erro ao guardar o token do suporte: {}", e);
            e.to_string()
        })?;
    } else if token_suporte().is_none() {
        return Err("Informe o token do bot do suporte (xoxb-) neste computador.".to_string());
    }
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    sqlx::query("UPDATE configuracoes_sistema SET suporte_slack_canal = $1, updated_at = NOW() WHERE id = 1")
        .bind(&canal)
        .execute(&pool)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    record_security_event(
        "SUPORTE_SLACK_CONFIGURADO",
        Some(&actor),
        format!("canal={canal}; token_novo={}", token.is_some()),
        true,
    )
    .await;
    Ok(ConfigSuporte { token_neste_computador: true, canal: Some(canal) })
}

// ─── Chamados ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ImagemChamado {
    pub nome: String,
    /// Conteúdo em base64 (sem o prefixo data:).
    pub base64: String,
}

#[derive(Debug, Deserialize)]
pub struct AbrirChamadoInput {
    pub texto: String,
    pub tela: Option<String>,
    pub versao: Option<String>,
    /// Relatório técnico do erro (quando o chamado vem de "Enviar ao suporte").
    pub relatorio_erro: Option<String>,
    #[serde(default)]
    pub imagens: Vec<ImagemChamado>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ChamadoSuporte {
    pub id: i32,
    pub texto: String,
    pub situacao: String,
    pub criado_em: String,
    pub atualizado_em: String,
    /// Quantas respostas do suporte já chegaram.
    pub respostas: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MensagemSuporte {
    pub id: i32,
    pub autor: String,
    pub autor_nome: Option<String>,
    pub texto: String,
    pub automatica: bool,
    pub criado_em: String,
}

/// Texto da mensagem que abre a thread. O atendimento lê tudo daqui.
pub(crate) fn montar_mensagem(
    numero: i32,
    perfil: &str,
    papel: &str,
    texto: &str,
    tela: Option<&str>,
    versao: Option<&str>,
    relatorio: Option<&str>,
) -> String {
    let citado: String = texto.lines().map(|linha| format!("> {linha}")).collect::<Vec<_>>().join("\n");
    let mut partes = vec![format!(":sos: *Chamado #{numero}* — {perfil} ({papel})"), citado];
    let mut contexto = Vec::new();
    if let Some(tela) = tela.filter(|t| !t.trim().is_empty()) {
        contexto.push(format!("*Tela:* {}", tela.trim()));
    }
    if let Some(versao) = versao.filter(|v| !v.trim().is_empty()) {
        contexto.push(format!("*Versão:* {}", versao.trim()));
    }
    if !contexto.is_empty() {
        partes.push(contexto.join(" · "));
    }
    if let Some(relatorio) = relatorio.filter(|r| !r.trim().is_empty()) {
        let limpo: String = relatorio.trim().replace("```", "'''").chars().take(2500).collect();
        partes.push(format!("*Erro:*\n```{limpo}```"));
    }
    partes.join("\n\n")
}

fn decodificar_imagens(imagens: &[ImagemChamado]) -> Result<Vec<(String, Vec<u8>)>, String> {
    if imagens.len() > MAX_IMAGENS {
        return Err(format!("Envie no máximo {MAX_IMAGENS} prints por chamado."));
    }
    imagens
        .iter()
        .map(|imagem| {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(imagem.base64.trim())
                .map_err(|_| "Print inválido.".to_string())?;
            if bytes.is_empty() || bytes.len() > MAX_BYTES_IMAGEM {
                return Err("Cada print pode ter até 5 MB.".to_string());
            }
            let nome: String = imagem
                .nome
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
                .take(60)
                .collect::<String>()
                .trim_start_matches('.')
                .to_string();
            Ok((if nome.is_empty() { "print.png".to_string() } else { nome }, bytes))
        })
        .collect()
}

/// Abre o chamado: grava, posta no canal e anexa os prints na thread. Se o Slack recusar a
/// mensagem, nada fica gravado (a pessoa vê o motivo e tenta de novo).
#[tauri::command]
#[instrument(skip_all)]
pub async fn abrir_chamado_suporte(input: AbrirChamadoInput) -> Result<ChamadoSuporte, String> {
    let perfil = require_sensitive_access()?;
    let texto = input.texto.trim().to_string();
    if texto.is_empty() || texto.chars().count() > MAX_TEXTO {
        return Err("Descreva o problema (até 4000 caracteres).".to_string());
    }
    let imagens = decodificar_imagens(&input.imagens)?;
    let token = token_suporte().ok_or("Suporte não configurado neste computador. Peça a quem administra para cadastrar em Configurações › Integrações.")?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let canal = canal_configurado(&pool).await?.ok_or("Canal do suporte não configurado. Peça a quem administra para cadastrar em Configurações › Integrações.")?;
    let empresa_id = require_active_session_company_id(&pool).await?;

    let contexto = json!({
        "tela": input.tela,
        "versao": input.versao,
        "relatorio_erro": input.relatorio_erro,
        "prints": imagens.len(),
        "perfil": perfil.nome,
    });
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let id: i32 = sqlx::query_scalar(
        "INSERT INTO suporte_chamados (empresa_id, profile_id, texto, contexto, slack_canal) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    )
    .bind(empresa_id)
    .bind(perfil.id)
    .bind(&texto)
    .bind(&contexto)
    .bind(&canal)
    .fetch_one(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;

    let client = Client::new();
    let mensagem = montar_mensagem(
        id,
        &perfil.nome,
        &perfil.role,
        &texto,
        input.tela.as_deref(),
        input.versao.as_deref(),
        input.relatorio_erro.as_deref(),
    );
    let postado = slack_post(&client, &token, "chat.postMessage", &json!({ "channel": canal, "text": mensagem })).await?;
    let thread_ts = postado.get("ts").and_then(Value::as_str).ok_or("Slack não devolveu a mensagem.")?.to_string();

    sqlx::query("UPDATE suporte_chamados SET slack_thread_ts = $1 WHERE id = $2")
        .bind(&thread_ts)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    sqlx::query(
        "INSERT INTO suporte_mensagens (empresa_id, chamado_id, autor, autor_nome, texto, slack_ts) VALUES ($1, $2, 'pessoa', $3, $4, $5)",
    )
    .bind(empresa_id)
    .bind(id)
    .bind(&perfil.nome)
    .bind(&texto)
    .bind(&thread_ts)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    tx.commit().await.map_err(|e| e.to_string())?;

    // A mensagem já está no canal: um print que falhe não desfaz o chamado, só avisa na thread.
    for (nome, bytes) in imagens {
        if let Err(erro) = slack_enviar_arquivo(&client, &token, &canal, &thread_ts, &nome, bytes).await {
            error!("Print do chamado #{} não foi enviado: {}", id, erro);
            let _ = slack_post(
                &client,
                &token,
                "chat.postMessage",
                &json!({ "channel": canal, "thread_ts": thread_ts, "text": format!("(Um print do chamado #{id} não pôde ser enviado: {erro})") }),
            )
            .await;
        }
    }

    record_security_event("SUPORTE_CHAMADO_ABERTO", Some(&perfil), format!("chamado={id}"), true).await;
    buscar_chamado(&pool, empresa_id, perfil.id, id).await
}

async fn buscar_chamado(pool: &sqlx::PgPool, empresa_id: i32, profile_id: i32, id: i32) -> Result<ChamadoSuporte, String> {
    sqlx::query_as::<_, ChamadoSuporte>(
        "SELECT c.id, c.texto, c.situacao, c.criado_em::TEXT AS criado_em, c.atualizado_em::TEXT AS atualizado_em,
                (SELECT COUNT(*) FROM suporte_mensagens m WHERE m.chamado_id = c.id AND m.autor = 'suporte') AS respostas
         FROM suporte_chamados c WHERE c.id = $1 AND c.empresa_id = $2 AND c.profile_id = $3",
    )
    .bind(id)
    .bind(empresa_id)
    .bind(profile_id)
    .fetch_optional(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?
    .ok_or_else(|| "Chamado não encontrado.".to_string())
}

/// Chamados do perfil da sessão, do mais recente para o mais antigo.
#[tauri::command]
#[instrument(skip_all)]
pub async fn listar_chamados_suporte() -> Result<Vec<ChamadoSuporte>, String> {
    let perfil = require_sensitive_access()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    sqlx::query_as::<_, ChamadoSuporte>(
        "SELECT c.id, c.texto, c.situacao, c.criado_em::TEXT AS criado_em, c.atualizado_em::TEXT AS atualizado_em,
                (SELECT COUNT(*) FROM suporte_mensagens m WHERE m.chamado_id = c.id AND m.autor = 'suporte') AS respostas
         FROM suporte_chamados c WHERE c.empresa_id = $1 AND c.profile_id = $2
         ORDER BY c.criado_em DESC LIMIT 50",
    )
    .bind(empresa_id)
    .bind(perfil.id)
    .fetch_all(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

/// Conversa de um chamado do perfil da sessão.
#[tauri::command]
#[instrument(skip_all, fields(id = id))]
pub async fn listar_mensagens_chamado(id: i32) -> Result<Vec<MensagemSuporte>, String> {
    let perfil = require_sensitive_access()?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    buscar_chamado(&pool, empresa_id, perfil.id, id).await?;
    sqlx::query_as::<_, MensagemSuporte>(
        "SELECT id, autor, autor_nome, texto, automatica, criado_em::TEXT AS criado_em
         FROM suporte_mensagens WHERE chamado_id = $1 AND empresa_id = $2 ORDER BY criado_em, id",
    )
    .bind(id)
    .bind(empresa_id)
    .fetch_all(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)
}

#[cfg(test)]
mod tests {
    use super::{canal_valido, conferir, decodificar_imagens, montar_mensagem, ImagemChamado};
    use serde_json::json;

    #[test]
    fn canal_do_slack() {
        assert!(canal_valido("C0CE5M6GTRV"));
        assert!(canal_valido(" C0CE5M6GTRV "));
        assert!(!canal_valido("#suporte-autoos"));
        assert!(!canal_valido("U0CFFDEPXDW"));
        assert!(!canal_valido("C12"));
    }

    #[test]
    fn mensagem_leva_texto_citado_contexto_e_erro() {
        let texto = montar_mensagem(12, "Ivan", "TECNICO", "Não salva\nfica girando", Some("/equipamentos/10"), Some("0.6.4"), Some("ERR ```x```"));
        assert!(texto.starts_with(":sos: *Chamado #12* — Ivan (TECNICO)"));
        assert!(texto.contains("> Não salva\n> fica girando"));
        assert!(texto.contains("*Tela:* /equipamentos/10 · *Versão:* 0.6.4"));
        assert!(texto.contains("*Erro:*\n```ERR '''x'''```"));
        let simples = montar_mensagem(1, "Ana", "ATENDENTE", "Oi", None, None, None);
        assert!(!simples.contains("Tela") && !simples.contains("Erro"));
    }

    #[test]
    fn recusa_do_slack_vira_mensagem_clara() {
        assert!(conferir(json!({ "ok": true, "ts": "1" }), "x").is_ok());
        let erro = conferir(json!({ "ok": false, "error": "not_in_channel" }), "chat.postMessage").unwrap_err();
        assert!(erro.contains("não está no canal"));
    }

    #[test]
    fn prints_tem_limite_e_nome_limpo() {
        let um = ImagemChamado { nome: "../tela 1.png".to_string(), base64: "aGVsbG8=".to_string() };
        let ok = decodificar_imagens(&[um]).unwrap();
        assert_eq!(ok[0].0, "tela1.png");
        assert_eq!(ok[0].1, b"hello");
        let muitos: Vec<ImagemChamado> = (0..4).map(|_| ImagemChamado { nome: "a.png".into(), base64: "aGVsbG8=".into() }).collect();
        assert!(decodificar_imagens(&muitos).is_err());
        assert!(decodificar_imagens(&[ImagemChamado { nome: "a.png".into(), base64: "***".into() }]).is_err());
    }
}
