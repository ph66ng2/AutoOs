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
        equipamento_id: eq, tipo: tipo.into(), reenvio_manual: manual, confirmar_incerto: confirmar, senha_portal: None,
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
    // Perfis exigem PIN por padrão (0030): o perfil sintético usa um PIN real de fixture.
    auth::store_profile_pin(perfil, "1357").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(perfil, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;

    let fake = Arc::new(Fake::default());
    let api_url = iniciar_servidor(Arc::clone(&fake))?;
    whatsapp::salvar_config_whatsapp(WhatsappConfigInput { provider: "EVOLUTION".into(), api_url, token: Some("token-fila".into()) })
        .await.map_err(|e| anyhow!(e))?;
    sqlx::query("INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled) VALUES ($1, FALSE, TRUE) ON CONFLICT (empresa_id) DO UPDATE SET portal_enabled = FALSE, respostas_enabled = TRUE").bind(empresa).execute(&pool).await?;

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

    // 9. Orçamento: texto da versão congelada; reenvio manual reaproveita a mesma versão.
    let orcamento = novo("AGUARDANDO_APROVACAO", Some("71944443333"), "O").await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id: orcamento, empresa_id: Some(empresa), tecnico_nome: "Teste".into(), problema_relatado: "Teste".into(),
        servicos_necessarios: Some(serde_json::json!([{"id":"a","descricao":"Troca cabeça","valor":90,"pecas":[]}]).to_string()),
        pecas_necessarias: Some("[]".into()), custo_total: Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    let r = pedir(orcamento, "orcamento_informativo", false, false).await?;
    assert_eq!(r.estado, "ENVIADA", "{r:?}");
    assert!(fake.corpos.lock().unwrap().last().unwrap().contains("Troca cabeça"));
    assert_eq!(pedir(orcamento, "orcamento_informativo", false, false).await?.estado, "JA_SOLICITADO");
    let r = pedir(orcamento, "orcamento_informativo", true, false).await?;
    assert_eq!(r.estado, "ENVIADA");
    let versoes: i64 = sqlx::query_scalar("SELECT COUNT(DISTINCT versao_id) FROM envios_whatsapp_pedidos WHERE equipamento_id = $1").bind(orcamento).fetch_one(&pool).await?;
    assert_eq!(versoes, 1, "reenvio reaproveita a versão");

    // 10. Orçamento alterado: a versão antiga cai e um novo envio automático é permitido.
    sqlx::query("UPDATE equipamentos SET valor_orcamento = 120 WHERE id = $1").bind(orcamento).execute(&pool).await?;
    let r = pedir(orcamento, "orcamento_informativo", false, false).await?;
    assert_eq!(r.estado, "ENVIADA", "{r:?}");
    let pedidos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_pedidos WHERE equipamento_id = $1 AND tipo = 'orcamento_informativo'").bind(orcamento).fetch_one(&pool).await?;
    assert_eq!(pedidos, 2);

    // 10b. Destinatário que responde pelo portal recebe o endereço do portal; os outros, "APROVADO".
    sqlx::query("UPDATE portal_config_empresa SET portal_enabled = TRUE WHERE empresa_id = $1").bind(empresa).execute(&pool).await?;
    let documento = format!("{:014}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos() % 100_000_000_000_000);
    let cliente: i32 = sqlx::query_scalar("INSERT INTO clientes(nome,tipo_pessoa,documento,empresa_id,ativo) VALUES ('Gráfica Portal','PJ',$1,$2,true) RETURNING id")
        .bind(&documento).bind(empresa).fetch_one(&pool).await?;
    let contato: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos(empresa_id,cliente_id,nome,telefone,ativo) VALUES ($1,$2,'Ana','(71) 97777-6666',true) RETURNING id")
        .bind(empresa).bind(cliente).fetch_one(&pool).await?;
    sqlx::query("UPDATE cliente_contatos SET portal_acesso = 'DECIDIR' WHERE id = $1").bind(contato).execute(&pool).await?;
    sqlx::query("SELECT portal_definir_senha_contato($1, $2, 'Senha-Fila-1', NULL)").bind(empresa).bind(contato).execute(&pool).await?;
    let orcamento_para = |tag: &'static str| {
        let pool = pool.clone();
        let novo = &novo;
        async move {
            let eq = novo("AGUARDANDO_APROVACAO", Some("5571977776666"), tag).await?;
            sqlx::query("UPDATE equipamentos SET cliente_id = $1 WHERE id = $2").bind(cliente).bind(eq).execute(&pool).await?;
            verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
                equipamento_id: eq, empresa_id: Some(empresa), tecnico_nome: "Teste".into(), problema_relatado: "Teste".into(),
                servicos_necessarios: Some(serde_json::json!([{"id":"a","descricao":"Troca","valor":90,"pecas":[]}]).to_string()),
                pecas_necessarias: Some("[]".into()), custo_total: Some(90.0), ..VerificacaoInput::default()
            }).await.map_err(|e| anyhow!(e))?;
            anyhow::Ok(eq)
        }
    };
    let eq_portal = orcamento_para("P").await?;
    assert_eq!(pedir(eq_portal, "orcamento_informativo", false, false).await?.estado, "ENVIADA");
    let corpo = fake.corpos.lock().unwrap().last().unwrap().clone();
    assert!(corpo.contains("status.bmitag.com.br") && !corpo.contains("APROVADO"), "contato do portal: {corpo}");
    // Só acompanha (não decide): vê o portal, mas continua aprovando por "APROVADO".
    sqlx::query("UPDATE cliente_contatos SET portal_acesso = 'ACOMPANHAR' WHERE id = $1").bind(contato).execute(&pool).await?;
    let eq_sem = orcamento_para("Q").await?;
    assert_eq!(pedir(eq_sem, "orcamento_informativo", false, false).await?.estado, "ENVIADA");
    let corpo = fake.corpos.lock().unwrap().last().unwrap().clone();
    assert!(corpo.contains("APROVADO") && corpo.contains("acompanhar o orçamento") && !corpo.contains("aceitar ou recusar"), "só acompanha: {corpo}");
    // Senha nova: vai em claro ao provedor (envio direto), mas nunca ao histórico.
    let eq_senha = orcamento_para("S").await?;
    let resp = solicitar_envio_whatsapp(SolicitarEnvioInput {
        equipamento_id: eq_senha, tipo: "orcamento_informativo".into(), reenvio_manual: false, confirmar_incerto: false,
        senha_portal: Some(serde_json::from_str("\"Kp7m-Tx4q-9Wbd\"")?),
    }).await.map_err(|e| anyhow!(e))?;
    assert_eq!(resp.estado, "ENVIADA");
    assert!(!resp.senha_retida);
    let corpo = fake.corpos.lock().unwrap().last().unwrap().clone();
    assert!(corpo.contains("Senha: Kp7m-Tx4q-9Wbd"), "senha nova ao provedor: {corpo}");
    let hist: String = sqlx::query_scalar("SELECT mensagem FROM comunicacoes WHERE equipamento_id = $1 ORDER BY id DESC LIMIT 1")
        .bind(eq_senha).fetch_one(&pool).await?;
    assert!(!hist.contains("Kp7m-Tx4q-9Wbd") && hist.contains("Senha: ••••"), "histórico: {hist}");
    sqlx::query("UPDATE portal_config_empresa SET portal_enabled = FALSE WHERE empresa_id = $1").bind(empresa).execute(&pool).await?;

    // 11. Estado errado e tipos que não existem mais são recusados sem rastro de envio.
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    assert!(pedir(pronto, "orcamento_informativo", false, false).await.is_err());
    assert!(pedir(orcamento, "equipamento_pronto", false, false).await.is_err());
    assert!(pedir(orcamento, "codigo_verificacao", false, false).await.is_err());
    // O link de decisão individual foi substituído pelo Portal do Cliente.
    assert!(pedir(orcamento, "orcamento_decisao", false, false).await.is_err());
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), antes);
    let pedidos_decisao: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_pedidos WHERE tipo = 'orcamento_decisao'").fetch_one(&pool).await?;
    assert_eq!(pedidos_decisao, 0);
    assert!(sqlx::query("INSERT INTO envios_whatsapp_pedidos (empresa_id, equipamento_id, tipo, chave_evento, versao_id) SELECT empresa_id, equipamento_id, 'orcamento_decisao', 'v:teste', versao_id FROM envios_whatsapp_pedidos WHERE equipamento_id = $1 LIMIT 1")
        .bind(orcamento).execute(&pool).await.is_err(), "o banco recusa pedido de link de decisão");

    // 12. Modo central: o desktop só enfileira; o processador reserva e conclui.
    sqlx::query("INSERT INTO envio_whatsapp_config_empresa(empresa_id, modo, provedor, evolution_api_url) VALUES ($1, 'CENTRAL', 'EVOLUTION', 'https://evolution.test/send')").bind(empresa).execute(&pool).await?;
    let antes = fake.requisicoes.load(Ordering::SeqCst);
    let central = novo("PRONTO", Some("71933332222"), "Z").await?;
    let r = pedir(central, "equipamento_pronto", false, false).await?;
    assert_eq!(r.estado, "ENFILEIRADA", "{r:?}");
    assert_eq!(fake.requisicoes.load(Ordering::SeqCst), antes, "o desktop não chama o provedor no modo central");
    let (estado, provedor, payload): (String, String, String) = sqlx::query_as("SELECT estado, provedor, mensagem_payload::TEXT FROM envios_whatsapp_tentativas WHERE id = $1").bind(r.tentativa_id).fetch_one(&pool).await?;
    assert_eq!((estado.as_str(), provedor.as_str()), ("PENDENTE", "CENTRAL"));
    assert!(payload.contains("5571933332222") && payload.contains("equipamento_pronto"));
    // Fila: repetir o gatilho ou reenviar enquanto está pendente não cria outra tentativa.
    assert_eq!(pedir(central, "equipamento_pronto", false, false).await?.estado, "EM_ANDAMENTO");
    assert_eq!(pedir(central, "equipamento_pronto", true, false).await?.estado, "EM_ANDAMENTO");
    assert_eq!(tentativas(central).await?, 1);

    // Orçamento no modo central: o texto da versão congelada vai na fila, sem link.
    let orc_central = novo("AGUARDANDO_APROVACAO", Some("71922221111"), "Y").await?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id: orc_central, empresa_id: Some(empresa), tecnico_nome: "Teste".into(), problema_relatado: "Teste".into(),
        servicos_necessarios: Some(serde_json::json!([{"id":"a","descricao":"Troca","valor":90,"pecas":[]}]).to_string()),
        pecas_necessarias: Some("[]".into()), custo_total: Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!(e))?;
    let r = pedir(orc_central, "orcamento_informativo", false, false).await?;
    assert_eq!(r.estado, "ENFILEIRADA", "{r:?}");
    let payload: String = sqlx::query_scalar("SELECT mensagem_payload::TEXT FROM envios_whatsapp_tentativas WHERE id = $1").bind(r.tentativa_id).fetch_one(&pool).await?;
    assert!(payload.contains("orcamento_informativo") && payload.contains("\"usaLink\": false") && !payload.contains("{{TOKEN}}"), "{payload}");

    // Processadores simultâneos nunca recebem a mesma tentativa.
    for indice in 0..7 {
        let eq = novo("PRONTO", Some("71911110000"), Box::leak(format!("F{indice}").into_boxed_str())).await?;
        assert_eq!(pedir(eq, "equipamento_pronto", false, false).await?.estado, "ENFILEIRADA");
    }
    let pendentes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM envios_whatsapp_tentativas WHERE estado = 'PENDENTE'").fetch_one(&pool).await?;
    let mut tarefas = Vec::new();
    for indice in 0..(pendentes as usize + 3) {
        let pool = pool.clone();
        tarefas.push(tokio::spawn(async move {
            sqlx::query_as::<_, (i64, bool)>("SELECT tentativa_id, valido FROM reservar_envios_whatsapp($1, 1)").bind(format!("proc-{indice}")).fetch_all(&pool).await
        }));
    }
    let mut reservadas = Vec::new();
    for tarefa in tarefas { reservadas.extend(tarefa.await??); }
    let mut ids: Vec<i64> = reservadas.iter().map(|(id, _)| *id).collect();
    ids.sort_unstable();
    let total = ids.len();
    ids.dedup();
    assert_eq!(total, pendentes as usize, "todas as pendentes reservadas");
    assert_eq!(ids.len(), total, "nenhuma tentativa reservada por dois processadores");
    assert!(reservadas.iter().all(|(_, valido)| *valido));

    // Processador conclui; só quem reservou pode concluir; o histórico registra o envio.
    let tentativa_orc = r.tentativa_id.unwrap();
    let dono: String = sqlx::query_scalar("SELECT reservado_por FROM envios_whatsapp_tentativas WHERE id = $1").bind(tentativa_orc).fetch_one(&pool).await?;
    assert!(!sqlx::query_scalar::<_, bool>("SELECT concluir_envio_whatsapp($1, 'outra-instancia', 'ENVIADA', 'EVOLUTION', 'MSG-X', NULL)").bind(tentativa_orc).fetch_one(&pool).await.unwrap_or(false), "só quem reservou conclui");
    let concluiu: bool = sqlx::query_scalar("SELECT concluir_envio_whatsapp($1, $2, 'ENVIADA', 'EVOLUTION', 'MSG-9', NULL)").bind(tentativa_orc).bind(&dono).fetch_one(&pool).await?;
    assert!(concluiu);
    let historico: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM comunicacoes WHERE equipamento_id = $1 AND tipo = 'ORCAMENTO' AND enviado").bind(orc_central).fetch_one(&pool).await?;
    assert_eq!(historico, 1);
    // Depois de enviada, o automático não repete e o reenvio manual enfileira outra tentativa.
    assert_eq!(pedir(orc_central, "orcamento_informativo", false, false).await?.estado, "JA_SOLICITADO");
    assert_eq!(pedir(orc_central, "orcamento_informativo", true, false).await?.estado, "ENFILEIRADA");

    // Orçamento editado entre o pedido e a reserva: o processador recebe valido = false.
    sqlx::query("UPDATE equipamentos SET valor_orcamento = 777 WHERE id = $1").bind(orc_central).execute(&pool).await?;
    let invalido: (i64, bool) = sqlx::query_as("SELECT tentativa_id, valido FROM reservar_envios_whatsapp('proc-editado', 1)").fetch_one(&pool).await?;
    assert!(!invalido.1, "a versão foi encerrada pela edição");

    // Técnico sem permissões sensíveis pode solicitar o envio, sem acesso à configuração.
    sqlx::query("UPDATE security_profiles SET role = 'TECNICO', permissions = '[]' WHERE id = $1")
        .bind(perfil).execute(&pool).await?;
    auth::lock_sensitive_access().await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;
    assert!(whatsapp::carregar_config_whatsapp().await.is_err());
    let envio_tecnico = novo("PRONTO", Some("71933334444"), "T").await?;
    assert_eq!(pedir(envio_tecnico, "equipamento_pronto", false, false).await?.estado, "ENFILEIRADA");

    println!("OK: fila de WhatsApp — idempotência, concorrência, resultado incerto, reenvio, sem telefone, imutabilidade, versão do orçamento e modo central (fila, reserva concorrente).");
    Ok(())
}
