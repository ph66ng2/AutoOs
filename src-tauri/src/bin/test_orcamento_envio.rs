//! Integração real. Executar somente em autoos_stock_test* com migrations aplicadas.
//! Perfil TECNICO (STOCK_CONTROL + PREPARE_QUOTES): prepara e envia o orçamento, mas não decide nem altera depois.
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use commands::{auth, clientes, envio_whatsapp, equipamentos, orcamento_decisao, portal_cliente, verificacoes, whatsapp};
use commands::types::*;
use anyhow::{Result, anyhow};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

const SEM_PERMISSAO: &str = "não possui permissão necessária";

#[tokio::main]
async fn main() -> Result<()> {
    let url = std::env::var("AUTOOS_STOCK_TEST_DATABASE_URL")?;
    let guard = sqlx::PgPool::connect(&url).await?;
    let name: String = sqlx::query_scalar("SELECT current_database()").fetch_one(&guard).await?;
    assert!(name.starts_with("autoos_stock_test"));
    std::env::set_var("DATABASE_URL", url);
    memory_keyring::install();
    let pool = db::init_database().await?;
    let suffix = chrono::Utc::now().timestamp_nanos_opt().unwrap().to_string();
    let empresa: i32 = sqlx::query_scalar("INSERT INTO empresas(nome,email,status) VALUES ('Teste',$1,'ativo') RETURNING id")
        .bind(format!("envio-{suffix}@example.test")).fetch_one(&pool).await?;
    let profile: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'TECNICO',$2,$3,true,false) RETURNING id")
        .bind(format!("Tecnico {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL, auth::PERMISSION_PREPARE_QUOTES])?).bind(empresa).fetch_one(&pool).await?;
    auth::store_profile_pin(profile, "1357").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(profile, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;

    sqlx::query("INSERT INTO portal_config_empresa (empresa_id, portal_enabled, respostas_enabled) VALUES ($1, TRUE, TRUE) ON CONFLICT (empresa_id) DO UPDATE SET portal_enabled = TRUE, respostas_enabled = TRUE").bind(empresa).execute(&pool).await?;
    let documento = format!("{:0>14}", &suffix[suffix.len().saturating_sub(14)..]);
    let cliente: i32 = sqlx::query_scalar("INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES ($1,'Cliente Envio','PJ',$2) RETURNING id")
        .bind(empresa).bind(&documento).fetch_one(&pool).await?;
    let contato: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso) VALUES ($1,$2,'Ana Envio','71988887777','DECIDIR') RETURNING id")
        .bind(empresa).bind(cliente).fetch_one(&pool).await?;
    let eq: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,cliente_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Teste',$2,$3,'VERIFICADO') RETURNING id")
        .bind(format!("V-{suffix}")).bind(empresa).bind(cliente).fetch_one(&pool).await?;
    let token = |eq: i32| { let pool = pool.clone(); async move {
        sqlx::query_scalar::<_, String>("SELECT atualizado_em::TEXT FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await
    } };

    // CONSEGUE: verificação com custo (financeiro via PREPARE_QUOTES).
    let services = serde_json::json!([{"id":"a","descricao":"Troca cabeça","valor":90,"pecas":[]}]);
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(services.to_string()), pecas_necessarias:Some("[]".into()), custo_total:Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!("salvar_verificacao_tecnica: {e}"))?;

    // CONSEGUE: VERIFICADO -> AGUARDANDO_APROVACAO com valor e prazo.
    let enviado = equipamentos::atualizar_status_equipamento(eq, "AGUARDANDO_APROVACAO".into(), Some(90.0), Some("2026-12-31".into()), None, Some(token(eq).await?), None)
        .await.map_err(|e| anyhow!("atualizar_status_equipamento: {e}"))?;
    assert_eq!(enviado.status.as_deref(), Some("AGUARDANDO_APROVACAO"));
    assert_eq!(enviado.valor_orcamento, Some(90.0));

    // CONSEGUE: publicar no portal.
    let publicado = portal_cliente::publicar_orcamento_portal(eq).await.map_err(|e| anyhow!("publicar_orcamento_portal: {e}"))?;
    assert!(publicado.versao_id > 0);

    // NÃO CONSEGUE: aprovar (FINANCIAL_ACTIONS).
    let erro = equipamentos::aprovar_orcamento(AprovarOrcamentoInput { empresa_id:empresa,equipamento_id:eq,expected_updated_em:token(eq).await?,
        pagamento:FormaPagamento { codigo:FormaPagamentoCodigo::Pix,detalhe:None },servicos_aprovados:vec!["a".into()],aprovado:None,resposta_esperada_id:None,motivo_divergencia:None })
        .await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");

    // NÃO CONSEGUE: reprovar.
    let erro = equipamentos::atualizar_status_equipamento(eq, "REPROVADO".into(), None, None, None, Some(token(eq).await?), None).await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");
    let st: String = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(st, "AGUARDANDO_APROVACAO");

    // NÃO CONSEGUE: finalizar OS só de garantia, que sai aprovada (PREPARE_QUOTES nunca aprova).
    let eq_garantia: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,cliente_id,status) VALUES ($1,'Zebra','GC420t','Impressora','2026-09-27','Garantia',$2,$3,'EM_VERIFICACAO') RETURNING id")
        .bind(format!("G-{suffix}")).bind(empresa).bind(cliente).fetch_one(&pool).await?;
    let erro = verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id:eq_garantia, empresa_id:Some(empresa), tecnico_nome:"Teste".into(), problema_relatado:"Teste".into(),
        servicos_necessarios:Some(serde_json::json!([{"id":"g","descricao":"Garantia","valor":0,"pecas":[]}]).to_string()),
        pecas_necessarias:Some("[]".into()), custo_total:Some(0.0), concluida:Some(true), ..VerificacaoInput::default()
    }).await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");
    let st: String = sqlx::query_scalar("SELECT status FROM equipamentos WHERE id=$1").bind(eq_garantia).fetch_one(&pool).await?;
    assert_eq!(st, "EM_VERIFICACAO");

    // NÃO CONSEGUE: definir senha de contato que decide orçamento.
    let erro = portal_cliente::definir_senha_portal_contato(contato, Some("Senha1234".into())).await.unwrap_err();
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");

    // PRORROGAR PRAZO (I2): equipamento AGUARDANDO_APROVACAO já publicado.
    let prorrogar = |novo: String, tok: String, confirmar: bool| async move {
        orcamento_decisao::prorrogar_prazo_orcamento(orcamento_decisao::ProrrogarPrazoInput {
            equipamento_id: eq, novo_prazo: novo, expected_updated_em: tok, confirmar_resposta_pendente: confirmar,
        }).await
    };
    // 1. Data passada: recusada.
    let passado = (chrono::Utc::now() - chrono::Duration::days(2)).format("%Y-%m-%d").to_string();
    let erro = prorrogar(passado, token(eq).await?, false).await.err().expect("data passada deveria falhar");
    assert!(erro.contains("não pode ser anterior a hoje"), "{erro}");
    // 2. Token de concorrência velho.
    let erro = prorrogar("2027-01-10".into(), "2000-01-01 00:00:00+00".into(), false).await.err().expect("token velho deveria falhar");
    assert!(erro.contains("Conflito de concorrência"), "{erro}");
    let prazo_atual: Option<String> = sqlx::query_scalar("SELECT prazo_aprovacao FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(prazo_atual.as_deref(), Some("2026-12-31"));
    // 5. Perfil sem PREPARE_QUOTES nem FINANCIAL_ACTIONS.
    let sem_perm: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'TECNICO',$2,$3,true,false) RETURNING id")
        .bind(format!("SemOrc {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL])?).bind(empresa).fetch_one(&pool).await?;
    auth::store_profile_pin(sem_perm, "2468").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(sem_perm, "2468".into(), Some("2468".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("2468".into()).await.map_err(|e| anyhow!(e))?;
    let erro = prorrogar("2027-01-10".into(), token(eq).await?, false).await.err().expect("sem permissão deveria falhar");
    assert!(erro.contains(SEM_PERMISSAO), "{erro}");
    auth::set_active_security_profile(profile, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;
    // 3. Resposta pendente do cliente.
    sqlx::query("INSERT INTO orcamento_respostas (empresa_id, equipamento_id, versao_id, origem, decisao, contato_nome) VALUES ($1,$2,$3,'PORTAL_CLIENTE','APROVAR','Ana Envio')")
        .bind(empresa).bind(eq).bind(publicado.versao_id).execute(&pool).await?;
    let sem_confirmar = prorrogar("2027-01-10".into(), token(eq).await?, false).await.map_err(|e| anyhow!("prorrogar sem confirmar: {e}"))?;
    assert!(!sem_confirmar.prorrogado);
    assert!(sem_confirmar.resposta_pendente.is_some());
    let prazo_atual: Option<String> = sqlx::query_scalar("SELECT prazo_aprovacao FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(prazo_atual.as_deref(), Some("2026-12-31"));
    // Com confirmação: prorroga e a resposta fica DESFEITA (4: prazo novo gravado e nova versão no portal).
    let confirmado = prorrogar("2027-01-10".into(), token(eq).await?, true).await.map_err(|e| anyhow!("prorrogar confirmado: {e}"))?;
    assert!(confirmado.prorrogado);
    assert!(confirmado.resposta_pendente.is_none());
    assert_eq!(confirmado.equipamento.as_ref().and_then(|e| e.prazo_aprovacao.clone()).as_deref(), Some("2027-01-10"));
    let ultima: (String, ) = sqlx::query_as("SELECT decisao FROM orcamento_respostas WHERE versao_id=$1 ORDER BY id DESC LIMIT 1")
        .bind(publicado.versao_id).fetch_one(&pool).await?;
    assert_eq!(ultima.0, "DESFEITA");
    let prazo_atual: Option<String> = sqlx::query_scalar("SELECT prazo_aprovacao FROM equipamentos WHERE id=$1").bind(eq).fetch_one(&pool).await?;
    assert_eq!(prazo_atual.as_deref(), Some("2027-01-10"));
    let (nova_id, nova_aberta, nova_valida): (i64, bool, bool) = sqlx::query_as(
        "SELECT id, encerrada_em IS NULL, valido_ate = (('2027-01-11'::DATE)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
         FROM orcamento_versoes WHERE equipamento_id=$1 ORDER BY versao DESC LIMIT 1").bind(eq).fetch_one(&pool).await?;
    assert!(nova_id > publicado.versao_id, "deveria existir nova versão após a prorrogação");
    assert!(nova_aberta && nova_valida, "nova versão aberta com validade do novo prazo");
    let antiga_encerrada: bool = sqlx::query_scalar("SELECT encerrada_em IS NOT NULL FROM orcamento_versoes WHERE id=$1").bind(publicado.versao_id).fetch_one(&pool).await?;
    assert!(antiga_encerrada);
    // 4. Prorrogação válida sem resposta pendente.
    let simples = prorrogar("2027-02-20".into(), token(eq).await?, false).await.map_err(|e| anyhow!("prorrogar simples: {e}"))?;
    assert!(simples.prorrogado && simples.resposta_pendente.is_none());
    let valida: bool = sqlx::query_scalar(
        "SELECT encerrada_em IS NULL AND valido_ate = (('2027-02-21'::DATE)::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
         FROM orcamento_versoes WHERE equipamento_id=$1 ORDER BY versao DESC LIMIT 1").bind(eq).fetch_one(&pool).await?;
    assert!(valida);

    // NÃO CONSEGUE: alterar serviços de OS já decidida (APROVADO).
    sqlx::query("UPDATE equipamentos SET status='APROVADO' WHERE id=$1").bind(eq).execute(&pool).await?;
    let erro = verificacoes::atualizar_servicos_verificacao(eq, Some(services.to_string()), Some("[]".into()), Some(90.0), profile, false, None, None, None, Some(empresa), None, None, None)
        .await.err().unwrap();
    assert!(erro.contains("Este perfil só altera orçamentos ainda não decididos."), "{erro}");

    // ---- I3: acesso ao portal no envio do orçamento, WhatsApp local e responsável da OS ----
    let doc_n = |n: u32| format!("9{}{:02}", &suffix[suffix.len() - 11..], n);
    let novo_cliente = |n: u32, acesso: &'static str, telefone: &'static str| {
        let pool = pool.clone();
        let documento = doc_n(n);
        async move {
            let cliente: i32 = sqlx::query_scalar("INSERT INTO clientes (empresa_id, nome, tipo_pessoa, documento) VALUES ($1,$2,'PJ',$3) RETURNING id")
                .bind(empresa).bind(format!("Cliente I3 {n}")).bind(&documento).fetch_one(&pool).await?;
            let contato: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone, portal_acesso) VALUES ($1,$2,$3,$4,$5) RETURNING id")
                .bind(empresa).bind(cliente).bind(format!("Contato I3 {n}")).bind(telefone).bind(acesso).fetch_one(&pool).await?;
            anyhow::Ok((cliente, contato, documento))
        }
    };
    let novo_eq = |cliente: i32, tag: String, telefone: &'static str| {
        let pool = pool.clone();
        let suffix = suffix.clone();
        async move {
            let id: i32 = sqlx::query_scalar("INSERT INTO equipamentos(serial_number,marca,modelo,tipo,data_entrada,defeito_relatado,empresa_id,cliente_id,status,cliente_nome,cliente_telefone,valor_orcamento) VALUES ($1,'Zebra','ZT230','Impressora','2026-10-01','Teste',$2,$3,'AGUARDANDO_APROVACAO','Maria',$4,90) RETURNING id")
                .bind(format!("{tag}-{suffix}")).bind(empresa).bind(cliente).bind(telefone).fetch_one(&pool).await?;
            anyhow::Ok(id)
        }
    };
    let login = |documento: String, senha: String, rotulo: String| {
        let pool = pool.clone();
        async move {
            let r: String = sqlx::query_scalar("SELECT public.portal_entrar_senha($1, $2, encode(sha256(convert_to($3,'UTF8')),'hex'))->>'resultado'")
                .bind(documento).bind(senha).bind(format!("{rotulo}-{}", chrono::Utc::now().timestamp_nanos_opt().unwrap())).fetch_one(&pool).await?;
            anyhow::Ok(r)
        }
    };
    let estado_contato = |contato: i32| {
        let pool = pool.clone();
        async move {
            let r: (String, Option<String>) = sqlx::query_as("SELECT portal_acesso, portal_senha_hash FROM cliente_contatos WHERE id=$1").bind(contato).fetch_one(&pool).await?;
            anyhow::Ok(r)
        }
    };

    // 1. Contato sem acesso: vira ACOMPANHAR (nunca DECIDIR), ganha senha que entra no portal.
    let (cli_a, ct_a, doc_a) = novo_cliente(1, "NENHUM", "71911112222").await?;
    let eq_a = novo_eq(cli_a, "IA".into(), "71911112222").await?;
    let p1 = portal_cliente::preparar_acesso_portal(eq_a, None).await.map_err(|e| anyhow!("preparar A: {e}"))?;
    assert!(p1.acesso_concedido && !p1.senha_existente, "{p1:?}");
    let cred_a = p1.credenciais.as_ref().expect("credenciais de A");
    let senha_a = cred_a.senha.expor().to_string();
    assert_eq!(cred_a.usuario, p1.destinatario.cliente_documento);
    assert_ne!(cred_a.usuario, doc_a, "usuário vem formatado");
    assert_eq!(cred_a.usuario.chars().filter(char::is_ascii_digit).collect::<String>(), doc_a);
    let (acesso, hash_a) = estado_contato(ct_a).await?;
    assert_eq!(acesso, "ACOMPANHAR");
    assert!(hash_a.is_some());
    assert_eq!(login(doc_a.clone(), senha_a.clone(), "a1".into()).await?, "OK");
    assert_eq!(login(cred_a.usuario.clone(), "Errada-123x".into(), "a2".into()).await?, "INVALIDO");

    // 2. Segunda chamada: mesmo hash, sem credenciais; quem só acompanha continua acompanhando.
    let p2 = portal_cliente::preparar_acesso_portal(eq_a, None).await.map_err(|e| anyhow!("preparar A 2: {e}"))?;
    assert!(p2.senha_existente && p2.credenciais.is_none() && !p2.acesso_concedido, "{p2:?}");
    let (acesso, hash_2) = estado_contato(ct_a).await?;
    assert_eq!((acesso.as_str(), hash_2), ("ACOMPANHAR", hash_a));

    // 4a. Já entrou com a senha atual: nova senha é recusada e nada muda.
    let erro = portal_cliente::preparar_acesso_portal(eq_a, Some(true)).await.err().expect("forçar após sessão deveria falhar");
    assert!(erro.contains("já entrou no portal"), "{erro}");
    assert_eq!(login(doc_a.clone(), senha_a.clone(), "a3".into()).await?, "OK");

    // 3a. Contato DECIDIR sem senha: continua DECIDIR e ganha senha.
    let (cli_b, ct_b, doc_b) = novo_cliente(2, "DECIDIR", "71922223333").await?;
    let eq_b = novo_eq(cli_b, "IB".into(), "71922223333").await?;
    let p3 = portal_cliente::preparar_acesso_portal(eq_b, None).await.map_err(|e| anyhow!("preparar B: {e}"))?;
    assert!(!p3.acesso_concedido && !p3.senha_existente, "{p3:?}");
    let senha_b = p3.credenciais.as_ref().expect("credenciais de B").senha.expor().to_string();
    let (acesso, hash_b) = estado_contato(ct_b).await?;
    assert_eq!(acesso, "DECIDIR");
    assert!(hash_b.is_some());

    // 4b. Sem sessão: nova senha, e a antiga deixa de funcionar.
    let p4 = portal_cliente::preparar_acesso_portal(eq_b, Some(true)).await.map_err(|e| anyhow!("forçar B: {e}"))?;
    let senha_b2 = p4.credenciais.as_ref().expect("nova senha de B").senha.expor().to_string();
    assert_ne!(senha_b, senha_b2);
    assert_eq!(login(doc_b.clone(), senha_b.clone(), "b1".into()).await?, "INVALIDO");
    assert_eq!(login(doc_b.clone(), senha_b2.clone(), "b2".into()).await?, "OK");

    // 3b. ACOMPANHAR que já tem senha: nada muda.
    let (cli_c, ct_c, _doc_c) = novo_cliente(3, "ACOMPANHAR", "71933334444").await?;
    let eq_c = novo_eq(cli_c, "IC".into(), "71933334444").await?;
    sqlx::query("SELECT public.portal_definir_senha_contato($1, $2, 'Senha-I3-Cc1', NULL)").bind(empresa).bind(ct_c).execute(&pool).await?;
    let antes_c = estado_contato(ct_c).await?;
    let p5 = portal_cliente::preparar_acesso_portal(eq_c, None).await.map_err(|e| anyhow!("preparar C: {e}"))?;
    assert!(p5.senha_existente && p5.credenciais.is_none() && !p5.acesso_concedido, "{p5:?}");
    assert_eq!(estado_contato(ct_c).await?, antes_c);

    // 5. Nem a auditoria nem as comunicações guardam senha em claro.
    for _ in 0..30 {
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM security_audit_log WHERE empresa_id=$1 AND event_type='PORTAL_ACCESS_PREPARED'").bind(empresa).fetch_one(&pool).await?;
        if n >= 5 { break; }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let eventos: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM security_audit_log WHERE empresa_id=$1 AND event_type='PORTAL_ACCESS_PREPARED'").bind(empresa).fetch_one(&pool).await?;
    assert!(eventos >= 5, "auditoria do preparo gravada: {eventos}");
    for senha in [&senha_a, &senha_b, &senha_b2] {
        let vazou: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM security_audit_log WHERE details LIKE '%' || $1 || '%'").bind(senha).fetch_one(&pool).await?;
        assert_eq!(vazou, 0, "senha em claro na auditoria");
    }

    // 6. WhatsApp local com servidor falso: a senha vai ao provedor, o histórico guarda a máscara.
    let corpos: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let porta = listener.local_addr()?.port();
    let corpos_srv = Arc::clone(&corpos);
    std::thread::spawn(move || {
        for mut stream in listener.incoming().flatten() {
            let corpos = Arc::clone(&corpos_srv);
            std::thread::spawn(move || {
                let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                let mut buffer = Vec::new();
                let mut chunk = [0_u8; 2048];
                let corpo = loop {
                    let Ok(lidos) = stream.read(&mut chunk) else { return };
                    if lidos == 0 { return }
                    buffer.extend_from_slice(&chunk[..lidos]);
                    let Some(fim) = buffer.windows(4).position(|w| w == b"\r\n\r\n") else { continue };
                    let cab = String::from_utf8_lossy(&buffer[..fim]).to_lowercase();
                    let tam = cab.lines().find_map(|l| l.strip_prefix("content-length:")).and_then(|v| v.trim().parse::<usize>().ok()).unwrap_or(0);
                    if buffer.len() >= fim + 4 + tam { break String::from_utf8_lossy(&buffer[fim + 4..fim + 4 + tam]).to_string(); }
                };
                corpos.lock().unwrap().push(corpo);
                let json = r#"{"key":{"id":"MSG-I3"}}"#;
                let _ = stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", json.len(), json).as_bytes());
            });
        }
    });
    // Configurar o provedor exige CONFIG_WHATSAPP: perfil administrativo à parte, e volta ao técnico.
    let admin: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,'ADMIN',$2,$3,true,false) RETURNING id")
        .bind(format!("AdminWa {suffix}")).bind(serde_json::to_string(&[auth::PERMISSION_CONFIG_WHATSAPP])?).bind(empresa).fetch_one(&pool).await?;
    auth::store_profile_pin(admin, "8642").map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(admin, "8642".into(), Some("8642".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("8642".into()).await.map_err(|e| anyhow!(e))?;
    whatsapp::salvar_config_whatsapp(WhatsappConfigInput { provider: "EVOLUTION".into(), api_url: format!("http://127.0.0.1:{porta}/send"), token: Some("token-i3".into()) })
        .await.map_err(|e| anyhow!(e))?;
    auth::set_active_security_profile(profile, "1357".into(), Some("1357".into())).await.map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access("1357".into()).await.map_err(|e| anyhow!(e))?;
    verificacoes::salvar_verificacao_tecnica(VerificacaoInput {
        equipamento_id: eq_b, empresa_id: Some(empresa), tecnico_nome: "Teste".into(), problema_relatado: "Teste".into(),
        servicos_necessarios: Some(serde_json::json!([{"id":"a","descricao":"Troca","valor":90,"pecas":[]}]).to_string()),
        pecas_necessarias: Some("[]".into()), custo_total: Some(90.0), ..VerificacaoInput::default()
    }).await.map_err(|e| anyhow!("verificacao B: {e}"))?;
    let usuario_b = p4.credenciais.as_ref().unwrap().usuario.clone();
    let resp = envio_whatsapp::solicitar_envio_whatsapp(envio_whatsapp::SolicitarEnvioInput {
        equipamento_id: eq_b, tipo: "orcamento_informativo".into(), reenvio_manual: false, confirmar_incerto: false,
        senha_portal: Some(serde_json::from_str(&serde_json::to_string(&senha_b2)?)?),
    }).await.map_err(|e| anyhow!("solicitar_envio_whatsapp: {e}"))?;
    assert_eq!(resp.estado, "ENVIADA", "{resp:?}");
    assert!(!resp.senha_retida);
    let corpo = corpos.lock().unwrap().last().cloned().expect("provedor recebeu o envio");
    assert!(corpo.contains("status.bmitag.com.br") && corpo.contains(&format!("Usuário: {usuario_b}")), "link e usuário: {corpo}");
    assert!(corpo.contains(&format!("Senha: {senha_b2}")), "senha ao provedor: {corpo}");
    let hist: String = sqlx::query_scalar("SELECT mensagem FROM comunicacoes WHERE equipamento_id = $1 ORDER BY id DESC LIMIT 1").bind(eq_b).fetch_one(&pool).await?;
    assert!(!hist.contains(&senha_b2) && hist.contains("Senha: ••••"), "histórico: {hist}");
    let vazou: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM comunicacoes WHERE mensagem LIKE '%' || $1 || '%'").bind(&senha_b2).fetch_one(&pool).await?;
    assert_eq!(vazou, 0);

    // 7. Cliente novo: PJ exige contato inicial; PF com celular válido ganha contato.
    let pj = |contato: Option<ContatoInicialInput>| ClienteInput {
        tipo_pessoa: Some("PJ".into()), razao_social: Some("Gráfica Nova Ltda".into()), documento: Some("11.222.333/0001-81".into()),
        telefone: "7133334444".into(), contato_inicial: contato, ..ClienteInput::default()
    };
    let erro = clientes::criar_cliente(pj(None)).await.err().expect("PJ sem contato deveria falhar");
    assert!(erro.contains("celular com DDD e o 9 (11 dígitos)"), "{erro}");
    let sem_cliente: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clientes WHERE empresa_id=$1 AND documento='11222333000181'").bind(empresa).fetch_one(&pool).await?;
    assert_eq!(sem_cliente, 0);
    let criado = clientes::criar_cliente(pj(Some(ContatoInicialInput { nome: "Rita".into(), telefone: "(71) 98888-7777".into(), email: None })))
        .await.map_err(|e| anyhow!("criar PJ: {e}"))?;
    let contatos_pj: Vec<(String, String)> = sqlx::query_as("SELECT nome, telefone FROM cliente_contatos WHERE cliente_id=$1").bind(criado.id).fetch_all(&pool).await?;
    assert_eq!(contatos_pj, vec![("Rita".to_string(), "71988887777".to_string())]);
    let pf = clientes::criar_cliente(ClienteInput {
        tipo_pessoa: Some("PF".into()), nome: Some("Paulo Pessoa".into()), documento: Some("529.982.247-25".into()),
        telefone: "(71) 97777-6666".into(), ..ClienteInput::default()
    }).await.map_err(|e| anyhow!("criar PF: {e}"))?;
    let contatos_pf: Vec<(String, String)> = sqlx::query_as("SELECT nome, telefone FROM cliente_contatos WHERE cliente_id=$1").bind(pf.id).fetch_all(&pool).await?;
    assert_eq!(contatos_pf, vec![("Paulo Pessoa".to_string(), "71977776666".to_string())]);

    // 8. Responsável da OS: só contato do cliente da OS, com token de concorrência.
    let (_cli_d, ct_d, _) = novo_cliente(4, "NENHUM", "71944445555").await?;
    let ct_d_do_cliente_c: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos (empresa_id, cliente_id, nome, telefone) VALUES ($1,$2,'Outro do C','71955556666') RETURNING id")
        .bind(empresa).bind(cli_c).fetch_one(&pool).await?;
    let tok0 = token(eq_c).await?;
    let erro = equipamentos::definir_responsavel_equipamento(eq_c, ct_d, tok0.clone()).await.err().expect("contato de outro cliente deveria falhar");
    assert!(erro.contains("incompatível"), "{erro}");
    assert_eq!(token(eq_c).await?, tok0);
    let atualizado = equipamentos::definir_responsavel_equipamento(eq_c, ct_d_do_cliente_c, tok0.clone()).await.map_err(|e| anyhow!("definir responsável: {e}"))?;
    assert_eq!(atualizado.responsavel_contato_id, Some(ct_d_do_cliente_c));
    assert_ne!(token(eq_c).await?, tok0, "atualizado_em muda");
    let dest = portal_cliente::obter_destinatario_orcamento(eq_c).await.map_err(|e| anyhow!(e))?;
    assert_eq!((dest.contato_id, dest.origem.as_str()), (Some(ct_d_do_cliente_c), "RESPONSAVEL"));
    let erro = equipamentos::definir_responsavel_equipamento(eq_c, ct_d_do_cliente_c, tok0).await.err().expect("token velho deveria falhar");
    assert!(erro.contains("Conflito de concorrência"), "{erro}");

    eprintln!("OK: perfil TECNICO prepara, envia e publica o orçamento (acesso ao portal, senha só ao provedor, responsável da OS), mas não aprova, reprova, altera OS decidida nem define senha do portal.");
    Ok(())
}
