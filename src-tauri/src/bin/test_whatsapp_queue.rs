//! Integração real da fila de WhatsApp. Executar somente em autoos_stock_test* com migrations
//! aplicadas. Usa um servidor HTTP local no lugar da Evolution API.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use anyhow::{anyhow, Result};
use commands::envio_whatsapp::{solicitar_envio_whatsapp, ResultadoEnvioWhatsapp, SolicitarEnvioInput};
use commands::types::*;
use commands::{auth, verificacoes, whatsapp};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU8, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
struct Fake {
    modo: AtomicU8, // 0 ok · 1 HTTP 500 · 2 HTTP 400 · 3 ok lento
    requisicoes: AtomicUsize,
    corpos: Mutex<Vec<String>>,
}

fn atender(mut stream: TcpStream, fake: Arc<Fake>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 2048];
    let corpo = loop {
        let Ok(lidos) = stream.read(&mut chunk) else { return };
        if lidos == 0 { return }
        buffer.extend_from_slice(&chunk[..lidos]);
        let Some(fim) = buffer.windows(4).position(|w| w == b"\r\n\r\n") else { continue };
        let cabecalho = String::from_utf8_lossy(&buffer[..fim]).to_lowercase();
        let tamanho = cabecalho.lines().find_map(|l| l.strip_prefix("content-length:")).and_then(|v| v.trim().parse::<usize>().ok()).unwrap_or(0);
        if buffer.len() >= fim + 4 + tamanho {
            break String::from_utf8_lossy(&buffer[fim + 4..fim + 4 + tamanho]).to_string();
        }
    };
    fake.requisicoes.fetch_add(1, Ordering::SeqCst);
    fake.corpos.lock().unwrap().push(corpo);
    let modo = fake.modo.load(Ordering::SeqCst);
    if modo == 3 { std::thread::sleep(Duration::from_millis(600)); }
    let resposta = match modo {
        1 => "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 4\r\nConnection: close\r\n\r\nfail".to_string(),
        2 => "HTTP/1.1 400 Bad Request\r\nContent-Length: 6\r\nConnection: close\r\n\r\ninvalid".to_string(),
        _ => {
            let json = r#"{"key":{"id":"MSG-123"}}"#;
            format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", json.len(), json)
        }
    };
    let _ = stream.write_all(resposta.as_bytes());
}

fn iniciar_servidor(fake: Arc<Fake>) -> Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let porta = listener.local_addr()?.port();
    std::thread::spawn(move || {
        for conexao in listener.incoming().flatten() {
            let fake = Arc::clone(&fake);
            std::thread::spawn(move || atender(conexao, fake));
        }
    });
    Ok(format!("http://127.0.0.1:{porta}/send"))
}

async fn pedir(eq: i32, tipo: &str, manual: bool, confirmar: bool) -> Result<ResultadoEnvioWhatsapp> {
    solicitar_envio_whatsapp(SolicitarEnvioInput {
        equipamento_id: eq, tipo: tipo.into(), reenvio_manual: manual, confirmar_incerto: confirmar,
    }).await.map_err(|e| anyhow!(e))
}

#[tokio::main]
async fn main() -> Result<()> {
    let url = std::env::var("AUTOOS_STOCK_TEST_DATABASE_URL")?;
    let guard = sqlx::PgPool::connect(&url).await?;
    let nome: String = sqlx::query_scalar("SELECT current_database()").fetch_one(&guard).await?;
    assert!(nome.starts_with("autoos_stock_test"));
    std::env::set_var("DATABASE_URL", url);
    memory_keyring::install();
    let pool = db::init_database().await?;

    let sufixo = chrono::Utc::now().timestamp_nanos_opt().unwrap().to_string();
    let empresa: i32 = sqlx::query_scalar("INSERT INTO empresas(nome,email,status) VALUES ('Fila',$1,'ativo') RETURNING id")
        .bind(format!("fila-{sufixo}@example.test")).fetch_one(&pool).await?;
    let permissoes = [auth::PERMISSION_CONFIG_WHATSAPP, auth::PERMISSION_MANAGE_STATUS_LINKS, auth::PERMISSION_FINANCIAL_ACTIONS];
    let perfil: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'ADMIN',$2,$3,true,false) RETURNING id")
        .bind(format!("Fila {sufixo}")).bind(serde_json::to_string(&permissoes)?).bind(empresa).fetch_one(&pool).await?;
    auth::set_active_security_profile(perfil, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;

    let fake = Arc::new(Fake::default());
    let api_url = iniciar_servidor(Arc::clone(&fake))?;
    whatsapp::salvar_config_whatsapp(WhatsappConfigInput { provider: "EVOLUTION".into(), api_url, token: Some("token-fila".into()) })
        .await.map_err(|e| anyhow!(e))?;
    sqlx::query("INSERT INTO public.orcamento_aceite_config (singleton, online_enabled) VALUES (TRUE, TRUE) ON CONFLICT (singleton) DO UPDATE SET online_enabled = TRUE").execute(&pool).await?;

    let novo = |status: &'static str, telefone: Option<&'static str>, tag: &'static str| {
        let pool = pool.clone();
        let sufixo = sufixo.clone();
        async move {
            let id: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,status,cliente_nome,cliente_telefone,valor_orcamento) VALUES ($1,'Zebra','ZT230','Impressora','2026-10-01','Teste',$2,$3,'Maria',$4,90) RETURNING id")
                .bind(format!("{tag}-{sufixo}")).bind(empresa).bind(status).bind(telefone).fetch_one(&pool).await?;
            anyhow::Ok(id)
        }
    };
    let tentativas = |eq: i32| {
        let pool = pool.clone();
        async move {
            let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_tentativas t JOIN envios_whatsapp_pedidos p ON p.id = t.pedido_id WHERE p.equipamento_id = $1").bind(eq).fetch_one(&pool).await?;
            anyhow::Ok(n)
        }
    };

    // 1. Pronto: o primeiro envio sai, o repetido automático não.
    let pronto = novo("PRONTO", Some("(71) 99999-8888"), "P").await?;
    let r = pedir(pronto, "equipamento_pronto", false, false).await?;
    assert_eq!(r.estado, "ENVIADA", "{r:?}");
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), 1);
    assert!(fake.corpos.lock().unwrap()[0].contains("\"number\":\"5571999998888\""));
    assert!(fake.corpos.lock().unwrap()[0].contains("PRONTO"));
    let externo: Option<String> = sqlx::query_scalar("SELECT mensagem_externa_id FROM envios_whatsapp_tentativas WHERE id = $1").bind(r.tentativa_id).fetch_one(&pool).await?;
    assert_eq!(externo.as_deref(), Some("MSG-123"));
    let r = pedir(pronto, "equipamento_pronto", false, false).await?;
    assert_eq!(r.estado, "JA_SOLICITADO");
    assert_eq!(r.ultimo_estado.as_deref(), Some("ENVIADA"));
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), 1, "evento repetido não pode reenviar");

    // 2. Reenvio manual explícito é outra tentativa do mesmo pedido.
    let r = pedir(pronto, "equipamento_pronto", true, false).await?;
    assert_eq!(r.estado, "ENVIADA");
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), 2);
    let pedidos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_pedidos WHERE equipamento_id = $1").bind(pronto).fetch_one(&pool).await?;
    assert_eq!((pedidos, tentativas(pronto).await?), (1, 2));
    let historico: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM comunicacoes WHERE equipamento_id = $1 AND tipo = 'PRONTO' AND enviado").bind(pronto).fetch_one(&pool).await?;
    assert_eq!(historico, 2);

    // 3. Duas instâncias ao mesmo tempo: só uma chama o provedor.
    fake.modo.store(3, Ordering::SeqCst);
    let corrida = novo("PRONTO", Some("71988887777"), "C").await?;
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    let (a, b) = tokio::join!(pedir(corrida, "equipamento_pronto", false, false), pedir(corrida, "equipamento_pronto", false, false));
    let (a, b) = (a?, b?);
    let mut estados = [a.estado.clone(), b.estado.clone()];
    estados.sort();
    assert_eq!(estados, ["EM_ANDAMENTO".to_string(), "ENVIADA".to_string()], "{a:?} {b:?}");
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst) - antes, 1);
    fake.modo.store(0, Ordering::SeqCst);

    // 4. Resultado incerto (HTTP 5xx) só é repetido com confirmação.
    fake.modo.store(1, Ordering::SeqCst);
    let incerto = novo("PRONTO", Some("71977776666"), "I").await?;
    assert_eq!(pedir(incerto, "equipamento_pronto", false, false).await?.estado, "INCERTA");
    assert_eq!(pedir(incerto, "equipamento_pronto", false, false).await?.estado, "JA_SOLICITADO");
    fake.modo.store(0, Ordering::SeqCst);
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    let r = pedir(incerto, "equipamento_pronto", true, false).await?;
    assert_eq!(r.estado, "REQUER_CONFIRMACAO");
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), antes);
    assert_eq!(pedir(incerto, "equipamento_pronto", true, true).await?.estado, "ENVIADA");

    // 5. Recusa definitiva (HTTP 400): nova tentativa manual é segura, sem confirmação.
    fake.modo.store(2, Ordering::SeqCst);
    let recusado = novo("PRONTO", Some("71966665555"), "R").await?;
    let r = pedir(recusado, "equipamento_pronto", false, false).await?;
    assert_eq!(r.estado, "FALHOU");
    fake.modo.store(0, Ordering::SeqCst);
    assert_eq!(pedir(recusado, "equipamento_pronto", true, false).await?.estado, "ENVIADA");

    // 6. Sem telefone: falha visível, nada é enviado.
    let sem_telefone = novo("PRONTO", None, "S").await?;
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    let r = pedir(sem_telefone, "equipamento_pronto", false, false).await?;
    assert_eq!(r.estado, "FALHOU");
    assert!(r.mensagem.unwrap().contains("sem telefone"));
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), antes);

    // 7. Tentativa abandonada por uma instância que parou vira INCERTA.
    let abandonado = novo("PRONTO", Some("71955554444"), "A").await?;
    let micros: i64 = sqlx::query_scalar("SELECT (EXTRACT(EPOCH FROM status_alterado_em) * 1000000)::BIGINT FROM equipamentos WHERE id = $1").bind(abandonado).fetch_one(&pool).await?;
    let pedido: i64 = sqlx::query_scalar("INSERT INTO envios_whatsapp_pedidos(empresa_id,equipamento_id,tipo,chave_evento) VALUES ($1,$2,'equipamento_pronto',$3) RETURNING id")
        .bind(empresa).bind(abandonado).bind(format!("s:{micros}")).fetch_one(&pool).await?;
    sqlx::query("INSERT INTO envios_whatsapp_tentativas(pedido_id,empresa_id,numero,origem,provedor,criado_em) VALUES ($1,$2,1,'AUTOMATICO','EVOLUTION', NOW() - INTERVAL '10 minutes')").bind(pedido).bind(empresa).execute(&pool).await?;
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    let r = pedir(abandonado, "equipamento_pronto", false, false).await?;
    assert_eq!((r.estado.as_str(), r.ultimo_estado.as_deref()), ("JA_SOLICITADO", Some("INCERTA")));
    assert_eq!(pedir(abandonado, "equipamento_pronto", true, false).await?.estado, "REQUER_CONFIRMACAO");
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), antes);

    // 8. Histórico de envios é imutável depois de concluído.
    assert!(sqlx::query("UPDATE envios_whatsapp_tentativas SET estado = 'FALHOU' WHERE pedido_id = (SELECT id FROM envios_whatsapp_pedidos WHERE equipamento_id = $1)").bind(pronto).execute(&pool).await.is_err());
    assert!(sqlx::query("DELETE FROM envios_whatsapp_pedidos WHERE equipamento_id = $1").bind(pronto).execute(&pool).await.is_err());

    // 9. Orçamento: texto da versão congelada, link por tentativa, sem revogar o anterior.
    let orcamento = novo("AGUARDANDO_APROVACAO", Some("71944443333"), "O").await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id: orcamento, empresa_id: Some(empresa), tecnico_nome: "Teste".into(), problema_relatado: "Teste".into(),
        servicos_necessarios: Some(serde_json::json!([{"id":"a","descricao":"Troca cabeça","valor":90,"pecas":[]}]).to_string()),
        pecas_necessarias: Some("[]".into()), custo_total: Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    let r = pedir(orcamento, "orcamento_informativo", false, false).await?;
    assert_eq!(r.estado, "ENVIADA", "{r:?}");
    assert!(fake.corpos.lock().unwrap().last().unwrap().contains("Troca cabeça"));
    let r = pedir(orcamento, "orcamento_decisao", false, false).await?;
    assert_eq!(r.estado, "ENVIADA", "{r:?}");
    let enviado = fake.corpos.lock().unwrap().last().unwrap().clone();
    let token = enviado.split("/#/o/").nth(1).map(|resto| resto.chars().take(64).collect::<String>()).expect("link na mensagem");
    assert!(token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit()));
    let guardado: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_links_decisao WHERE equipamento_id = $1 AND token_hash = encode(sha256($2::bytea), 'hex')").bind(orcamento).bind(&token).fetch_one(&pool).await?;
    assert_eq!(guardado, 1, "só o hash do token fica no banco");
    let vazou: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM comunicacoes WHERE equipamento_id = $1 AND (mensagem LIKE '%' || $2 || '%' OR COALESCE(erro,'') LIKE '%' || $2 || '%')").bind(orcamento).bind(&token).fetch_one(&pool).await?;
    assert_eq!(vazou, 0, "o token não pode aparecer no histórico");
    let tokens_na_fila: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_tentativas t JOIN envios_whatsapp_pedidos p ON p.id=t.pedido_id WHERE p.equipamento_id=$1 AND COALESCE(t.erro_resumo,'') LIKE '%' || $2 || '%'").bind(orcamento).bind(&token).fetch_one(&pool).await?;
    assert_eq!(tokens_na_fila, 0);

    let r = pedir(orcamento, "orcamento_decisao", true, false).await?;
    assert_eq!(r.estado, "ENVIADA");
    let (versoes, links_ativos): (i64, i64) = (
        sqlx::query_scalar("SELECT COUNT(DISTINCT versao_id) FROM orcamento_links_decisao WHERE equipamento_id = $1").bind(orcamento).fetch_one(&pool).await?,
        sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_links_decisao WHERE equipamento_id = $1 AND revogado_em IS NULL").bind(orcamento).fetch_one(&pool).await?,
    );
    assert_eq!((versoes, links_ativos), (1, 2), "reenvio reaproveita a versão e não invalida o link anterior");

    // 10. Orçamento alterado: a versão e os links antigos caem; um novo envio é permitido.
    sqlx::query("UPDATE equipamentos SET valor_orcamento = 120 WHERE id = $1").bind(orcamento).execute(&pool).await?;
    let ativos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orcamento_links_decisao WHERE equipamento_id = $1 AND revogado_em IS NULL").bind(orcamento).fetch_one(&pool).await?;
    assert_eq!(ativos, 0);
    let r = pedir(orcamento, "orcamento_decisao", false, false).await?;
    assert_eq!(r.estado, "ENVIADA", "{r:?}");
    let pedidos_decisao: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_pedidos WHERE equipamento_id = $1 AND tipo = 'orcamento_decisao'").bind(orcamento).fetch_one(&pool).await?;
    assert_eq!(pedidos_decisao, 2);

    // 11. Estado errado e aceite desligado são recusados sem rastro de envio.
    assert!(pedir(pronto, "orcamento_informativo", false, false).await.is_err());
    assert!(pedir(orcamento, "equipamento_pronto", false, false).await.is_err());
    assert!(pedir(orcamento, "codigo_verificacao", false, false).await.is_err());
    sqlx::query("UPDATE public.orcamento_aceite_config SET online_enabled = FALSE").execute(&pool).await?;
    sqlx::query("UPDATE equipamentos SET valor_orcamento = 130 WHERE id = $1").bind(orcamento).execute(&pool).await?;
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    assert!(pedir(orcamento, "orcamento_decisao", false, false).await.unwrap_err().to_string().contains("ainda não foi ativado"));
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), antes);

    println!("OK: fila de WhatsApp — idempotência, concorrência, resultado incerto, reenvio, sem telefone, imutabilidade e link de decisão por versão.");
    Ok(())
}
