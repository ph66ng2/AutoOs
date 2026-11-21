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
/// Cliente HTTP do Slack com prazo: um Slack que aceita a conexão e para de responder não pode
/// deixar o chamado (e a transação aberta durante o envio da mensagem) pendurado para sempre.
fn cliente_slack() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Não foi possível preparar a conexão com o Slack: {e}"))
}

/// Perfil da sessão para uma leitura. Em segundo plano (atualização ao vivo) não renova a sessão:
/// senão mudanças de outro computador manteriam aberta uma estação abandonada.
fn perfil_da_leitura(segundo_plano: Option<bool>) -> Result<crate::commands::auth::SecurityProfileSummary, String> {
    if segundo_plano == Some(true) {
        super::auth::require_sensitive_access_without_touch()
    } else {
        require_sensitive_access()
    }
}

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

    let client = cliente_slack()?;
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
pub async fn listar_chamados_suporte(segundo_plano: Option<bool>) -> Result<Vec<ChamadoSuporte>, String> {
    let perfil = perfil_da_leitura(segundo_plano)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = super::auth::empresa_da_sessao(&pool, segundo_plano).await?;
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
pub async fn listar_mensagens_chamado(id: i32, segundo_plano: Option<bool>) -> Result<Vec<MensagemSuporte>, String> {
    let perfil = perfil_da_leitura(segundo_plano)?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = super::auth::empresa_da_sessao(&pool, segundo_plano).await?;
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

// ─── Respostas da thread, resposta pelo app e encerramento ─────────────

/// Texto do Slack para mostrar no AutoOS: tira o rodapé "Sent using <@app>", menções e marcações
/// de canal, troca links pelo texto deles, desfaz os escapes e troca os emojis mais comuns.
/// Negrito (`*x*`) e itálico (`_x_`) ficam: a tela sabe mostrar.
pub(crate) fn limpar_texto_slack(texto: &str) -> String {
    let mut base = texto.trim_end();
    if let Some(pos) = base.rfind("*Sent using*") {
        let resto = base[pos + "*Sent using*".len()..].trim();
        if resto.starts_with("<@") && resto.ends_with('>') && resto.matches('>').count() == 1 {
            base = base[..pos].trim_end();
        }
    }
    let mut saida = String::with_capacity(base.len());
    let mut resto = base;
    while let Some(inicio) = resto.find('<') {
        saida.push_str(&resto[..inicio]);
        let depois = &resto[inicio + 1..];
        match depois.find('>') {
            Some(fim) => {
                let dentro = &depois[..fim];
                let (alvo, rotulo) = dentro.split_once('|').map_or((dentro, None), |(a, r)| (a, Some(r)));
                if alvo.starts_with('#') {
                    saida.push('#');
                    saida.push_str(rotulo.unwrap_or("canal"));
                } else if !(alvo.starts_with('@') || alvo.starts_with('!')) {
                    saida.push_str(rotulo.unwrap_or(alvo));
                }
                resto = &depois[fim + 1..];
            }
            None => {
                saida.push('<');
                resto = depois;
            }
        }
    }
    saida.push_str(resto);
    let mut saida = saida.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    for (codigo, emoji) in [
        (":slightly_smiling_face:", "🙂"), (":smile:", "😄"), (":blush:", "😊"), (":wink:", "😉"),
        (":+1:", "👍"), (":thumbsup:", "👍"), (":pray:", "🙏"), (":white_check_mark:", "✅"),
        (":heavy_check_mark:", "✔️"), (":warning:", "⚠️"), (":x:", "❌"), (":sos:", "🆘"),
        (":wave:", "👋"), (":eyes:", "👀"), (":tada:", "🎉"), (":point_right:", "👉"),
    ] {
        saida = saida.replace(codigo, emoji);
    }
    saida.lines().map(str::trim_end).collect::<Vec<_>>().join("\n").trim().to_string()
}

/// Resposta que veio da thread, já pronta para gravar.
#[derive(Debug, PartialEq)]
pub(crate) struct RespostaDaThread {
    pub ts: String,
    pub usuario: Option<String>,
    pub texto: String,
    pub automatica: bool,
}

/// Mensagem da thread que entra na conversa: não é a abertura, não é do nosso bot (a pessoa já
/// tem as próprias mensagens e os prints), e tem texto ou anexo.
pub(crate) fn resposta_da_thread(mensagem: &Value, thread_ts: &str, bot_proprio: Option<&str>) -> Option<RespostaDaThread> {
    let ts = mensagem.get("ts")?.as_str()?;
    if ts == thread_ts {
        return None;
    }
    let bot_id = mensagem.get("bot_id").and_then(Value::as_str);
    if bot_id.is_some() && bot_id == bot_proprio {
        return None;
    }
    if matches!(
        mensagem.get("subtype").and_then(Value::as_str),
        Some("channel_join" | "channel_leave" | "message_deleted" | "message_changed" | "tombstone")
    ) {
        return None;
    }
    let mut texto = limpar_texto_slack(mensagem.get("text").and_then(Value::as_str).unwrap_or(""));
    let tem_anexo = mensagem.get("files").and_then(Value::as_array).is_some_and(|f| !f.is_empty());
    if texto.is_empty() {
        if !tem_anexo {
            return None;
        }
        texto = "(Enviou um anexo. Veja no Slack.)".to_string();
    }
    Some(RespostaDaThread {
        ts: ts.to_string(),
        usuario: mensagem.get("user").and_then(Value::as_str).map(str::to_string),
        texto: texto.chars().take(MAX_TEXTO).collect(),
        // Bot ou app (ex.: o atendente automático responde "em nome" de um usuário, via app).
        automatica: bot_id.is_some() || mensagem.get("app_id").and_then(Value::as_str).is_some(),
    })
}

static BOT_PROPRIO: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
static NOMES_SLACK: std::sync::Mutex<Option<std::collections::HashMap<String, Option<String>>>> = std::sync::Mutex::new(None);

async fn bot_proprio(client: &Client, token: &str) -> Option<String> {
    if let Some(id) = BOT_PROPRIO.lock().ok().and_then(|g| g.clone()) {
        return Some(id);
    }
    let resposta = slack_post(client, token, "auth.test", &json!({})).await.ok()?;
    let id = resposta.get("bot_id").and_then(Value::as_str)?.to_string();
    if let Ok(mut guarda) = BOT_PROPRIO.lock() {
        *guarda = Some(id.clone());
    }
    Some(id)
}

/// Nome de quem respondeu. Precisa do escopo `users:read` no app do Slack; sem ele, `None`
/// (a tela mostra "Suporte"). Fica guardado enquanto o app estiver aberto.
async fn nome_no_slack(client: &Client, token: &str, usuario: &str) -> Option<String> {
    if let Some(nome) = NOMES_SLACK.lock().ok().and_then(|g| g.as_ref().and_then(|m| m.get(usuario).cloned())) {
        return nome;
    }
    let nome = client
        .get(format!("{}/users.info", api_base()))
        .bearer_auth(token)
        .query(&[("user", usuario)])
        .send()
        .await
        .ok()?
        .json::<Value>()
        .await
        .ok()
        .filter(|r| r.get("ok").and_then(Value::as_bool) == Some(true))
        .and_then(|r| {
            let perfil = r.get("user")?.get("profile")?;
            ["display_name", "real_name"]
                .iter()
                .filter_map(|campo| perfil.get(*campo).and_then(Value::as_str))
                .map(str::trim)
                .find(|nome| !nome.is_empty())
                .map(|nome| nome.chars().take(80).collect::<String>())
        });
    if let Ok(mut guarda) = NOMES_SLACK.lock() {
        guarda.get_or_insert_with(Default::default).insert(usuario.to_string(), nome.clone());
    }
    nome
}

#[derive(Debug, Serialize)]
pub struct RespostaNova {
    pub chamado_id: i32,
    pub autor_nome: Option<String>,
    pub texto: String,
    pub automatica: bool,
}

/// Busca na thread de cada chamado aberto do perfil as respostas que ainda não estão no banco.
/// Chamado em segundo plano (a cada poucos segundos): não renova a sessão. Devolve só o que
/// entrou agora, para o aviso; os outros computadores veem pela atualização ao vivo.
#[tauri::command]
#[instrument(skip_all)]
pub async fn sincronizar_suporte(segundo_plano: Option<bool>) -> Result<Vec<RespostaNova>, String> {
    let perfil = perfil_da_leitura(segundo_plano)?;
    let Some(token) = token_suporte() else { return Ok(Vec::new()) };
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = super::auth::empresa_da_sessao(&pool, segundo_plano).await?;
    let abertos: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT id, slack_canal, slack_thread_ts FROM suporte_chamados
         WHERE empresa_id = $1 AND profile_id = $2 AND situacao = 'aberto'
           AND slack_canal IS NOT NULL AND slack_thread_ts IS NOT NULL
           AND criado_em > NOW() - INTERVAL '30 days'
         ORDER BY id DESC LIMIT 10",
    )
    .bind(empresa_id)
    .bind(perfil.id)
    .fetch_all(&pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    if abertos.is_empty() {
        return Ok(Vec::new());
    }
    let client = cliente_slack()?;
    let bot = bot_proprio(&client, &token).await;
    let mut novas = Vec::new();
    for (chamado_id, canal, thread_ts) in abertos {
        let resposta = client
            .get(format!("{}/conversations.replies", api_base()))
            .bearer_auth(&token)
            .query(&[("channel", canal.as_str()), ("ts", thread_ts.as_str()), ("limit", "200")])
            .send()
            .await
            .map_err(|e| format!("Sem conexão com o Slack: {e}"))?
            .json::<Value>()
            .await
            .map_err(|e| format!("Resposta inválida do Slack: {e}"))?;
        let resposta = conferir(resposta, "conversations.replies")?;
        let mensagens = resposta.get("messages").and_then(Value::as_array).cloned().unwrap_or_default();
        let mut entrou = false;
        for mensagem in &mensagens {
            let Some(item) = resposta_da_thread(mensagem, &thread_ts, bot.as_deref()) else { continue };
            let ja_existe: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM suporte_mensagens WHERE chamado_id = $1 AND slack_ts = $2)")
                .bind(chamado_id)
                .bind(&item.ts)
                .fetch_one(&pool)
                .await
                .map_err(super::operator_errors::mapear_erro_sql)?;
            if ja_existe {
                continue;
            }
            let nome = match item.usuario.as_deref() {
                Some(usuario) => nome_no_slack(&client, &token, usuario).await,
                None => None,
            };
            let inserida: Option<i32> = sqlx::query_scalar(
                "INSERT INTO suporte_mensagens (empresa_id, chamado_id, autor, autor_nome, texto, automatica, slack_ts, criado_em)
                 VALUES ($1, $2, 'suporte', $3, $4, $5, $6, COALESCE(to_timestamp(NULLIF($6, '')::DOUBLE PRECISION), NOW()))
                 ON CONFLICT (chamado_id, slack_ts) DO NOTHING
                 RETURNING id",
            )
            .bind(empresa_id)
            .bind(chamado_id)
            .bind(&nome)
            .bind(&item.texto)
            .bind(item.automatica)
            .bind(&item.ts)
            .fetch_optional(&pool)
            .await
            .map_err(super::operator_errors::mapear_erro_sql)?;
            if inserida.is_some() {
                entrou = true;
                novas.push(RespostaNova { chamado_id, autor_nome: nome, texto: item.texto, automatica: item.automatica });
            }
        }
        if entrou {
            sqlx::query("UPDATE suporte_chamados SET atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2")
                .bind(chamado_id)
                .bind(empresa_id)
                .execute(&pool)
                .await
                .map_err(super::operator_errors::mapear_erro_sql)?;
        }
    }
    Ok(novas)
}

/// Chamado aberto do perfil da sessão, com o que é preciso para escrever na thread.
async fn thread_do_chamado(pool: &sqlx::PgPool, empresa_id: i32, profile_id: i32, id: i32) -> Result<(String, String, String), String> {
    let linha: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT situacao, slack_canal, slack_thread_ts FROM suporte_chamados WHERE id = $1 AND empresa_id = $2 AND profile_id = $3",
    )
    .bind(id)
    .bind(empresa_id)
    .bind(profile_id)
    .fetch_optional(pool)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    let (situacao, canal, thread_ts) = linha.ok_or("Chamado não encontrado.")?;
    let (Some(canal), Some(thread_ts)) = (canal, thread_ts) else {
        return Err("Este chamado não chegou ao Slack. Abra um novo.".to_string());
    };
    Ok((situacao, canal, thread_ts))
}

#[derive(Debug, Deserialize)]
pub struct ResponderChamadoInput {
    pub id: i32,
    pub texto: String,
    #[serde(default)]
    pub imagens: Vec<ImagemChamado>,
}

/// Responde na thread do chamado, pelo AutoOS. Só o dono do chamado e só com ele aberto.
#[tauri::command]
#[instrument(skip_all)]
pub async fn responder_chamado_suporte(input: ResponderChamadoInput) -> Result<ChamadoSuporte, String> {
    let perfil = require_sensitive_access()?;
    let texto = input.texto.trim().to_string();
    if texto.is_empty() || texto.chars().count() > MAX_TEXTO {
        return Err("Escreva a mensagem (até 4000 caracteres).".to_string());
    }
    let imagens = decodificar_imagens(&input.imagens)?;
    let token = token_suporte().ok_or("Suporte não configurado neste computador. Peça a quem administra para cadastrar em Configurações › Integrações.")?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let (situacao, canal, thread_ts) = thread_do_chamado(&pool, empresa_id, perfil.id, input.id).await?;
    if situacao != "aberto" {
        return Err("Este chamado já foi resolvido. Abra um novo para outro assunto.".to_string());
    }
    let client = cliente_slack()?;
    let postado = slack_post(&client, &token, "chat.postMessage", &json!({ "channel": canal, "thread_ts": thread_ts, "text": texto })).await?;
    let ts = postado.get("ts").and_then(Value::as_str).ok_or("Slack não devolveu a mensagem.")?.to_string();
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    sqlx::query(
        "INSERT INTO suporte_mensagens (empresa_id, chamado_id, autor, autor_nome, texto, slack_ts) VALUES ($1, $2, 'pessoa', $3, $4, $5)
         ON CONFLICT (chamado_id, slack_ts) DO NOTHING",
    )
    .bind(empresa_id)
    .bind(input.id)
    .bind(&perfil.nome)
    .bind(&texto)
    .bind(&ts)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    sqlx::query("UPDATE suporte_chamados SET atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2")
        .bind(input.id)
        .bind(empresa_id)
        .execute(&mut *tx)
        .await
        .map_err(super::operator_errors::mapear_erro_sql)?;
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;
    for (nome, bytes) in imagens {
        if let Err(erro) = slack_enviar_arquivo(&client, &token, &canal, &thread_ts, &nome, bytes).await {
            error!("Print da resposta do chamado #{} não foi enviado: {}", input.id, erro);
            let _ = slack_post(
                &client,
                &token,
                "chat.postMessage",
                &json!({ "channel": canal, "thread_ts": thread_ts, "text": format!("(Um print não pôde ser enviado: {erro})") }),
            )
            .await;
        }
    }
    buscar_chamado(&pool, empresa_id, perfil.id, input.id).await
}

/// Texto que vai para a thread quando a pessoa responde "Resolveu" ou "Não resolveu" no AutoOS.
/// Sem menção a ninguém: quem acompanha o canal decide.
pub(crate) fn texto_do_retorno(resolvido: bool, perfil: &str) -> String {
    if resolvido {
        format!("✅ {perfil} marcou no AutoOS que o problema foi resolvido. Chamado encerrado.")
    } else {
        format!("↩️ {perfil} disse no AutoOS que o problema continua.")
    }
}

/// "Resolveu": encerra o chamado e avisa na thread. "Não resolveu": mantém aberto e avisa na
/// thread (a resposta fica na conversa, como as outras mensagens da pessoa).
#[tauri::command]
#[instrument(skip_all)]
pub async fn retorno_chamado_suporte(id: i32, resolvido: bool) -> Result<ChamadoSuporte, String> {
    let perfil = require_sensitive_access()?;
    let token = token_suporte().ok_or("Suporte não configurado neste computador. Peça a quem administra para cadastrar em Configurações › Integrações.")?;
    let pool = get_pool().await.map_err(|e| e.to_string())?;
    let empresa_id = require_active_session_company_id(&pool).await?;
    let (situacao, canal, thread_ts) = thread_do_chamado(&pool, empresa_id, perfil.id, id).await?;
    if situacao != "aberto" {
        return Err("Este chamado já foi resolvido.".to_string());
    }
    let texto = texto_do_retorno(resolvido, &perfil.nome);
    let client = cliente_slack()?;
    let postado = slack_post(&client, &token, "chat.postMessage", &json!({ "channel": canal, "thread_ts": thread_ts, "text": texto })).await?;
    let ts = postado.get("ts").and_then(Value::as_str).map(str::to_string);
    let mut tx = pool.begin().await.map_err(super::operator_errors::mapear_erro_sql)?;
    sqlx::query(
        "INSERT INTO suporte_mensagens (empresa_id, chamado_id, autor, autor_nome, texto, slack_ts) VALUES ($1, $2, 'pessoa', $3, $4, $5)
         ON CONFLICT (chamado_id, slack_ts) DO NOTHING",
    )
    .bind(empresa_id)
    .bind(id)
    .bind(&perfil.nome)
    .bind(if resolvido { "Resolveu." } else { "Não resolveu." })
    .bind(&ts)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    sqlx::query(
        "UPDATE suporte_chamados SET situacao = CASE WHEN $3 THEN 'resolvido' ELSE situacao END, atualizado_em = NOW()
         WHERE id = $1 AND empresa_id = $2",
    )
    .bind(id)
    .bind(empresa_id)
    .bind(resolvido)
    .execute(&mut *tx)
    .await
    .map_err(super::operator_errors::mapear_erro_sql)?;
    tx.commit().await.map_err(super::operator_errors::mapear_erro_sql)?;
    buscar_chamado(&pool, empresa_id, perfil.id, id).await
}

#[cfg(test)]
mod tests {
    use super::{canal_valido, conferir, decodificar_imagens, montar_mensagem, ImagemChamado};
    use serde_json::json;

    #[test]
    fn texto_do_slack_fica_legivel() {
        use super::limpar_texto_slack;
        assert_eq!(
            limpar_texto_slack("Olá! Recebi o chamado #101. :slightly_smiling_face: *Sent using* <@U0CE678ML79>"),
            "Olá! Recebi o chamado #101. 🙂"
        );
        assert_eq!(limpar_texto_slack("Veja <https://x.com/a|o guia> e <https://y.com>"), "Veja o guia e https://y.com");
        assert_eq!(limpar_texto_slack("<@U123> confere &lt;isto&gt; &amp; aquilo em <#C1|suporte>"), "confere <isto> & aquilo em #suporte");
        assert_eq!(limpar_texto_slack("_não envie_ ainda\n*1.* reabra"), "_não envie_ ainda\n*1.* reabra");
        // "Sent using" no meio do texto não é rodapé.
        assert_eq!(limpar_texto_slack("*Sent using* o app, segue"), "*Sent using* o app, segue");
    }

    #[test]
    fn so_entram_respostas_dos_outros() {
        use super::resposta_da_thread;
        let thread = "1795260633.779869";
        let abertura = json!({"ts": thread, "bot_id": "B0CKWBZTPJM", "text": ":sos: *Chamado #101*"});
        let nosso_print = json!({"ts": "1795260635.1", "bot_id": "B0CKWBZTPJM", "text": "", "files": [{"id": "F1"}]});
        let erykah = json!({"ts": "1795260665.590929", "user": "U0CE63D6T2B", "app_id": "A08SKDT6QUW",
            "text": "Recebi o chamado. *Sent using* <@U0CE678ML79>"});
        let humano = json!({"ts": "1795260700.1", "user": "U0CFFDEPXDW", "text": "Vou olhar, Paulo aqui."});
        let so_anexo = json!({"ts": "1795260701.1", "user": "U0CFFDEPXDW", "text": "", "files": [{"id": "F2"}]});
        let entrou = json!({"ts": "1795260702.1", "user": "U9", "subtype": "channel_join", "text": "entrou"});
        assert!(resposta_da_thread(&abertura, thread, Some("B0CKWBZTPJM")).is_none());
        assert!(resposta_da_thread(&nosso_print, thread, Some("B0CKWBZTPJM")).is_none());
        assert!(resposta_da_thread(&entrou, thread, Some("B0CKWBZTPJM")).is_none());
        let r = resposta_da_thread(&erykah, thread, Some("B0CKWBZTPJM")).unwrap();
        assert_eq!((r.texto.as_str(), r.automatica, r.usuario.as_deref()), ("Recebi o chamado.", true, Some("U0CE63D6T2B")));
        let r = resposta_da_thread(&humano, thread, Some("B0CKWBZTPJM")).unwrap();
        assert!(!r.automatica);
        assert_eq!(resposta_da_thread(&so_anexo, thread, Some("B0CKWBZTPJM")).unwrap().texto, "(Enviou um anexo. Veja no Slack.)");
    }

    #[test]
    fn retorno_sem_mencao() {
        use super::texto_do_retorno;
        assert!(!texto_do_retorno(true, "Ana").contains("<@"));
        assert!(texto_do_retorno(false, "Ana").contains("continua"));
    }

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
