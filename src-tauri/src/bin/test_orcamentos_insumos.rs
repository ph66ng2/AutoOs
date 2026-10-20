//! Integração real do orçamento de venda avulsa de insumos (OI-<n>).
//! Executar somente em banco descartável cujo nome comece com `autoos_oi_test`
//! (AUTOOS_OI_TEST_DATABASE_URL). As migrations são aplicadas por `init_database`.
//!
//! Cobre: criar → aprovar com baixa de estoque, saldo insuficiente recusado sem aprovação
//! parcial, cancelar aprovado devolvendo estoque (com confirmação), entregue, isolamento por
//! empresa, numeração por empresa, permissões e concorrência otimista (inclusive aprovação
//! simultânea).
#[path = "../commands/mod.rs"] mod commands;
#[path = "../db.rs"] mod db;
#[path = "../test_support/memory_keyring.rs"] mod memory_keyring;
use anyhow::{anyhow, ensure, Result};
use commands::orcamentos_insumos::*;
use commands::types::*;
use commands::{auth, produtos};

const PIN: &str = "2468";

fn erro<T: std::fmt::Debug>(resultado: Result<T, String>) -> String {
    match resultado {
        Ok(valor) => panic!("era esperado um erro, mas deu certo: {valor:?}"),
        Err(mensagem) => mensagem,
    }
}

async fn entrar(profile: i32) -> Result<()> {
    auth::set_active_security_profile(profile, PIN.into(), Some(PIN.into()))
        .await
        .map_err(|e| anyhow!(e))?;
    auth::unlock_sensitive_access(PIN.into()).await.map_err(|e| anyhow!(e))?;
    Ok(())
}

async fn saldo(produto: i32) -> Result<i32> {
    Ok(produtos::buscar_produto(produto)
        .await
        .map_err(|e| anyhow!(e))?
        .quantidade_estoque
        .unwrap_or(0))
}

fn item(produto_id: i32, quantidade: i32, valor_unitario: f64) -> OrcamentoInsumosItemInput {
    OrcamentoInsumosItemInput { produto_id, quantidade, valor_unitario }
}

fn entrada(cliente_id: i32, itens: Vec<OrcamentoInsumosItemInput>) -> OrcamentoInsumosInput {
    OrcamentoInsumosInput { cliente_id, itens, ..OrcamentoInsumosInput::default() }
}

fn acao(o: &OrcamentoInsumosDetalhe) -> OrcamentoInsumosAcaoInput {
    OrcamentoInsumosAcaoInput { id: o.orcamento.id, atualizado_em: o.orcamento.atualizado_em.clone(), canal: None }
}

fn aprovar_input(o: &OrcamentoInsumosDetalhe, pagamento: Option<FormaPagamento>) -> AprovarOrcamentoInsumosInput {
    AprovarOrcamentoInsumosInput { id: o.orcamento.id, atualizado_em: o.orcamento.atualizado_em.clone(), pagamento }
}

fn cancelar_input(o: &OrcamentoInsumosDetalhe, confirmar: bool) -> CancelarOrcamentoInsumosInput {
    CancelarOrcamentoInsumosInput {
        id: o.orcamento.id,
        atualizado_em: o.orcamento.atualizado_em.clone(),
        confirmar_devolucao_estoque: confirmar,
    }
}

async fn novo_produto(sufixo: &str, nome: &str, categoria: &str, estoque: i32, preco: f64) -> Result<i32> {
    Ok(produtos::criar_produto(ProdutoInput {
        codigo: format!("{nome}-{sufixo}"),
        nome: format!("{nome} {sufixo}"),
        categoria: categoria.into(),
        quantidade_estoque: estoque,
        preco_custo: 1.0,
        preco_venda: preco,
        ..ProdutoInput::default()
    })
    .await
    .map_err(|e| anyhow!(e))?
    .id)
}

async fn contar_movimentos(pool: &sqlx::PgPool, referencia: &str, tipo: &str, empresa: i32) -> Result<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) FROM movimentacoes_estoque
         WHERE referencia = $1 AND tipo = $2 AND origem = 'VENDA_INSUMOS' AND empresa_id = $3",
    )
    .bind(referencia)
    .bind(tipo)
    .bind(empresa)
    .fetch_one(pool)
    .await?)
}

#[tokio::main]
async fn main() -> Result<()> {
    let url = std::env::var("AUTOOS_OI_TEST_DATABASE_URL")?;
    let guarda = sqlx::PgPool::connect(&url).await?;
    let nome_banco: String = sqlx::query_scalar("SELECT current_database()").fetch_one(&guarda).await?;
    ensure!(nome_banco.starts_with("autoos_oi_test"), "banco {nome_banco} não é descartável");
    std::env::set_var("DATABASE_URL", url);
    memory_keyring::install();
    let pool = db::init_database().await?;
    let sufixo = chrono::Utc::now().timestamp_nanos_opt().unwrap().to_string();

    // ── Duas empresas, três perfis, clientes e produtos ───────────────────────
    let empresa_a: i32 = sqlx::query_scalar("INSERT INTO empresas(nome,email,status) VALUES ('Empresa A',$1,'ativo') RETURNING id")
        .bind(format!("a-{sufixo}@example.test")).fetch_one(&pool).await?;
    let empresa_b: i32 = sqlx::query_scalar("INSERT INTO empresas(nome,email,status) VALUES ('Empresa B',$1,'ativo') RETURNING id")
        .bind(format!("b-{sufixo}@example.test")).fetch_one(&pool).await?;
    let todas = serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL, auth::PERMISSION_FINANCIAL_ACTIONS])?;
    let so_estoque = serde_json::to_string(&[auth::PERMISSION_STOCK_CONTROL])?;
    let mut perfis = Vec::new();
    for (nome, role, permissoes, empresa) in [
        ("admin-a", "ADMIN", &todas, empresa_a),
        ("admin-b", "ADMIN", &todas, empresa_b),
        ("operador-a", "OPERADOR", &so_estoque, empresa_a),
    ] {
        let id: i32 = sqlx::query_scalar("INSERT INTO security_profiles(nome,role,permissions,empresa_id,ativo,is_default) VALUES ($1,$2,$3,$4,true,false) RETURNING id")
            .bind(format!("{nome}-{sufixo}")).bind(role).bind(permissoes).bind(empresa).fetch_one(&pool).await?;
        auth::store_profile_pin(id, PIN).map_err(|e| anyhow!(e))?;
        perfis.push(id);
    }
    let (perfil_a, perfil_b, perfil_operador) = (perfis[0], perfis[1], perfis[2]);

    let cliente_a: i32 = sqlx::query_scalar("INSERT INTO clientes(nome,tipo_pessoa,telefone,empresa_id) VALUES ('Cliente A','PF','71999990001',$1) RETURNING id")
        .bind(empresa_a).fetch_one(&pool).await?;
    let outro_cliente_a: i32 = sqlx::query_scalar("INSERT INTO clientes(nome,tipo_pessoa,telefone,empresa_id) VALUES ('Outro A','PF','71999990003',$1) RETURNING id")
        .bind(empresa_a).fetch_one(&pool).await?;
    let cliente_b: i32 = sqlx::query_scalar("INSERT INTO clientes(nome,tipo_pessoa,telefone,empresa_id) VALUES ('Cliente B','PF','71999990002',$1) RETURNING id")
        .bind(empresa_b).fetch_one(&pool).await?;
    let contato_a: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos(empresa_id,cliente_id,nome,email) VALUES ($1,$2,'Maria','maria@example.test') RETURNING id")
        .bind(empresa_a).bind(cliente_a).fetch_one(&pool).await?;
    let contato_outro: i32 = sqlx::query_scalar("INSERT INTO cliente_contatos(empresa_id,cliente_id,nome) VALUES ($1,$2,'Joao') RETURNING id")
        .bind(empresa_a).bind(outro_cliente_a).fetch_one(&pool).await?;

    entrar(perfil_b).await?;
    let produto_b = novo_produto(&sufixo, "ETQ-B", "ETIQUETA", 50, 3.0).await?;
    entrar(perfil_a).await?;
    let etiqueta = novo_produto(&sufixo, "ETQ", "ETIQUETA", 10, 5.5).await?;
    let ribbon = novo_produto(&sufixo, "RIB", "RIBBON", 3, 20.0).await?;
    let impressora = novo_produto(&sufixo, "IMP", "IMPRESSORA", 5, 900.0).await?;

    // ── Validações de entrada ─────────────────────────────────────────────────
    assert!(erro(criar_orcamento_insumos(entrada(cliente_a, vec![])).await).contains("pelo menos um item"));
    assert!(erro(criar_orcamento_insumos(entrada(cliente_a, vec![item(etiqueta, 0, 1.0)])).await).contains("maior que zero"));
    assert!(erro(criar_orcamento_insumos(entrada(cliente_a, vec![item(impressora, 1, 1.0)])).await).contains("impressora"));
    assert!(erro(criar_orcamento_insumos(entrada(cliente_a, vec![item(produto_b, 1, 1.0)])).await).contains("não foi encontrado"));
    assert!(erro(criar_orcamento_insumos(entrada(cliente_b, vec![item(etiqueta, 1, 1.0)])).await).contains("Cliente não encontrado"));
    let mut com_contato_errado = entrada(cliente_a, vec![item(etiqueta, 1, 1.0)]);
    com_contato_errado.contato_id = Some(contato_outro);
    assert!(erro(criar_orcamento_insumos(com_contato_errado).await).contains("contato"));
    let mut desconto_alto = entrada(cliente_a, vec![item(etiqueta, 1, 1.0)]);
    desconto_alto.desconto = Some(2.0);
    assert!(erro(criar_orcamento_insumos(desconto_alto).await).contains("desconto"));

    // ── Criar: total calculado no backend e numeração ─────────────────────────
    let mut base = entrada(cliente_a, vec![item(etiqueta, 4, 5.5), item(ribbon, 2, 20.0)]);
    base.contato_id = Some(contato_a);
    base.desconto = Some(2.5);
    base.observacoes = Some("  entrega no balcão ".into());
    let oi1 = criar_orcamento_insumos(base.clone()).await.map_err(|e| anyhow!(e))?;
    assert_eq!(oi1.orcamento.numero, 1);
    assert_eq!(oi1.orcamento.numero_exibicao, "OI-1");
    assert_eq!(oi1.orcamento.status, "RASCUNHO");
    assert_eq!(oi1.orcamento.valor_subtotal, 62.0);
    assert_eq!(oi1.orcamento.desconto, 2.5);
    assert_eq!(oi1.orcamento.valor_total, 59.5);
    assert_eq!(oi1.orcamento.contato_nome.as_deref(), Some("Maria"));
    assert_eq!(oi1.orcamento.observacoes.as_deref(), Some("entrega no balcão"));
    assert!(oi1.orcamento.validade.is_some());
    assert_eq!(oi1.itens.len(), 2);
    assert!(oi1.itens[0].descricao.starts_with("ETQ"), "nome copiado do produto");
    assert_eq!(oi1.itens[0].valor_total, 22.0);
    assert_eq!(oi1.itens[0].saldo_estoque, Some(10));
    assert_eq!(saldo(etiqueta).await?, 10, "criar não mexe no estoque");

    // ── Editar e concorrência otimista ────────────────────────────────────────
    let token_antigo = oi1.orcamento.atualizado_em.clone();
    let mut edicao = base.clone();
    edicao.atualizado_em = Some(token_antigo.clone());
    edicao.desconto = Some(0.0);
    let oi1 = atualizar_orcamento_insumos(oi1.orcamento.id, edicao.clone()).await.map_err(|e| anyhow!(e))?;
    assert_eq!(oi1.orcamento.valor_total, 62.0);
    assert!(erro(atualizar_orcamento_insumos(oi1.orcamento.id, edicao).await).contains("Conflito de concorrência"));
    let mut sem_token = base.clone();
    sem_token.atualizado_em = None;
    assert!(erro(atualizar_orcamento_insumos(oi1.orcamento.id, sem_token).await).contains("obrigatório"));
    let stale = OrcamentoInsumosAcaoInput { id: oi1.orcamento.id, atualizado_em: token_antigo, canal: None };
    assert!(erro(marcar_orcamento_insumos_enviado(stale).await).contains("Conflito de concorrência"));

    // ── Enviar; editar um enviado volta para rascunho ─────────────────────────
    let oi1 = marcar_orcamento_insumos_enviado(OrcamentoInsumosAcaoInput { canal: Some("EMAIL".into()), ..acao(&oi1) })
        .await.map_err(|e| anyhow!(e))?;
    assert_eq!(oi1.orcamento.status, "ENVIADO");
    assert!(oi1.orcamento.enviado_em.is_some());
    let mut edicao = base.clone();
    edicao.atualizado_em = Some(oi1.orcamento.atualizado_em.clone());
    edicao.desconto = Some(2.5);
    let oi1 = atualizar_orcamento_insumos(oi1.orcamento.id, edicao).await.map_err(|e| anyhow!(e))?;
    assert_eq!(oi1.orcamento.status, "RASCUNHO");
    assert_eq!(oi1.orcamento.valor_total, 59.5);
    let oi1 = marcar_orcamento_insumos_enviado(acao(&oi1)).await.map_err(|e| anyhow!(e))?;

    // ── Saldo insuficiente: recusa, lista o que falta e não aprova parcialmente ─
    let curto = criar_orcamento_insumos(entrada(cliente_a, vec![item(etiqueta, 20, 5.0), item(ribbon, 5, 20.0)])).await.map_err(|e| anyhow!(e))?;
    assert_eq!(curto.orcamento.numero_exibicao, "OI-2");
    let mensagem = erro(aprovar_orcamento_insumos(aprovar_input(&curto, None)).await);
    assert!(mensagem.contains("Estoque insuficiente") && mensagem.contains("OI-2"), "{mensagem}");
    assert!(mensagem.contains("ETQ ") && mensagem.contains("precisa de 20, há 10"), "{mensagem}");
    assert!(mensagem.contains("RIB ") && mensagem.contains("precisa de 5, há 3"), "{mensagem}");
    assert_eq!((saldo(etiqueta).await?, saldo(ribbon).await?), (10, 3), "nada baixado");
    let depois = obter_orcamento_insumos(curto.orcamento.id).await.map_err(|e| anyhow!(e))?;
    assert_eq!(depois.orcamento.status, "RASCUNHO");
    assert_eq!(contar_movimentos(&pool, "OI-2", "SAIDA", empresa_a).await?, 0);

    // ── Operador sem permissão financeira não cria nem aprova ─────────────────
    entrar(perfil_operador).await?;
    assert!(erro(criar_orcamento_insumos(base.clone()).await).contains("permissão"));
    assert!(erro(aprovar_orcamento_insumos(aprovar_input(&oi1, None)).await).contains("permissão"));
    assert_eq!(listar_orcamentos_insumos(None).await.map_err(|e| anyhow!(e))?.total, 2, "consultar é liberado");
    entrar(perfil_a).await?;

    // ── Aprovar: baixa o estoque, grava pagamento e movimentos ────────────────
    let pix = FormaPagamento { codigo: FormaPagamentoCodigo::Pix, detalhe: None };
    let outro_sem_detalhe = FormaPagamento { codigo: FormaPagamentoCodigo::Outro, detalhe: Some(" ".into()) };
    assert!(erro(aprovar_orcamento_insumos(aprovar_input(&oi1, Some(outro_sem_detalhe))).await).contains("OUTRO"));
    let aprovado = aprovar_orcamento_insumos(aprovar_input(&oi1, Some(pix))).await.map_err(|e| anyhow!(e))?;
    assert_eq!(aprovado.orcamento.status, "APROVADO");
    assert_eq!(aprovado.orcamento.forma_pagamento_codigo.as_deref(), Some("PIX"));
    assert!(aprovado.orcamento.decidido_em.is_some());
    assert_eq!((saldo(etiqueta).await?, saldo(ribbon).await?), (6, 1));
    assert_eq!(contar_movimentos(&pool, "OI-1", "SAIDA", empresa_a).await?, 2);
    let valor_mov: f64 = sqlx::query_scalar("SELECT valor_total::FLOAT8 FROM movimentacoes_estoque WHERE referencia='OI-1' AND produto_id=$1")
        .bind(etiqueta).fetch_one(&pool).await?;
    assert_eq!(valor_mov, 22.0);
    assert!(erro(aprovar_orcamento_insumos(aprovar_input(&aprovado, None)).await).contains("não pode ir para"));
    let mut editar_aprovado = base.clone();
    editar_aprovado.atualizado_em = Some(aprovado.orcamento.atualizado_em.clone());
    assert!(erro(atualizar_orcamento_insumos(aprovado.orcamento.id, editar_aprovado).await).contains("não pode mais ser editado"));
    assert!(erro(reprovar_orcamento_insumos(acao(&aprovado)).await).contains("não pode ir para"));

    // ── Cancelar aprovado: exige confirmação e devolve o estoque ──────────────
    let mensagem = erro(cancelar_orcamento_insumos(cancelar_input(&aprovado, false)).await);
    assert!(mensagem.contains("Confirme a devolução"), "{mensagem}");
    assert_eq!((saldo(etiqueta).await?, saldo(ribbon).await?), (6, 1));
    // Produto inativado depois da aprovação: a devolução ainda tem de funcionar.
    sqlx::query("UPDATE produtos SET ativo = false WHERE id = $1").bind(etiqueta).execute(&pool).await?;
    let cancelado = cancelar_orcamento_insumos(cancelar_input(&aprovado, true)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(cancelado.orcamento.status, "CANCELADO");
    assert_eq!((saldo(etiqueta).await?, saldo(ribbon).await?), (10, 3), "saldo devolvido mesmo com produto inativo");
    sqlx::query("UPDATE produtos SET ativo = true WHERE id = $1").bind(etiqueta).execute(&pool).await?;
    assert_eq!(contar_movimentos(&pool, "OI-1", "ENTRADA", empresa_a).await?, 2);
    assert!(erro(cancelar_orcamento_insumos(cancelar_input(&cancelado, true)).await).contains("não pode ir para"));

    // ── Cancelar rascunho não mexe no estoque; reprovar ───────────────────────
    let cancelado_curto = cancelar_orcamento_insumos(cancelar_input(&curto, false)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(cancelado_curto.orcamento.status, "CANCELADO");
    let para_reprovar = criar_orcamento_insumos(entrada(cliente_a, vec![item(etiqueta, 1, 5.0)])).await.map_err(|e| anyhow!(e))?;
    let reprovado = reprovar_orcamento_insumos(acao(&para_reprovar)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(reprovado.orcamento.status, "REPROVADO");
    assert!(reprovado.orcamento.decidido_em.is_some());
    assert_eq!(saldo(etiqueta).await?, 10);

    // ── Pagamento padrão "A combinar", entrega e cancelamento barrado ─────────
    let oi_entrega = criar_orcamento_insumos(entrada(cliente_a, vec![item(etiqueta, 2, 5.0)])).await.map_err(|e| anyhow!(e))?;
    assert_eq!(oi_entrega.orcamento.numero, 4);
    let aprovado = aprovar_orcamento_insumos(aprovar_input(&oi_entrega, None)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(aprovado.orcamento.forma_pagamento_codigo.as_deref(), Some("A_COMBINAR"));
    assert_eq!(saldo(etiqueta).await?, 8);
    assert!(erro(marcar_orcamento_insumos_entregue(acao(&oi_entrega)).await).contains("Conflito de concorrência"), "token antigo");
    let entregue = marcar_orcamento_insumos_entregue(acao(&aprovado)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(entregue.orcamento.status, "ENTREGUE");
    assert!(entregue.orcamento.entregue_em.is_some());
    assert!(erro(cancelar_orcamento_insumos(cancelar_input(&entregue, true)).await).contains("não pode ir para"));
    assert_eq!(saldo(etiqueta).await?, 8, "entregue não devolve estoque");

    // ── Aprovações simultâneas do mesmo orçamento: só uma vale ────────────────
    let corrida = criar_orcamento_insumos(entrada(cliente_a, vec![item(etiqueta, 1, 5.0)])).await.map_err(|e| anyhow!(e))?;
    let (r1, r2) = tokio::join!(
        aprovar_orcamento_insumos(aprovar_input(&corrida, None)),
        aprovar_orcamento_insumos(aprovar_input(&corrida, None)),
    );
    assert_eq!([r1.is_ok(), r2.is_ok()].iter().filter(|ok| **ok).count(), 1, "{r1:?} / {r2:?}");
    assert_eq!(saldo(etiqueta).await?, 7, "baixa uma única vez");
    assert_eq!(contar_movimentos(&pool, &corrida.orcamento.numero_exibicao, "SAIDA", empresa_a).await?, 1);

    // ── Listar e filtrar ──────────────────────────────────────────────────────
    let todos = listar_orcamentos_insumos(None).await.map_err(|e| anyhow!(e))?;
    assert_eq!(todos.total, 5);
    assert_eq!(todos.items[0].numero, 5, "mais novo primeiro");
    let filtro = |status: Option<&str>, cliente: Option<i32>, busca: Option<&str>| FiltrosOrcamentosInsumos {
        status: status.map(str::to_string), cliente_id: cliente, busca: busca.map(str::to_string), page: None,
    };
    assert_eq!(listar_orcamentos_insumos(Some(filtro(Some("CANCELADO"), None, None))).await.map_err(|e| anyhow!(e))?.total, 2);
    assert_eq!(listar_orcamentos_insumos(Some(filtro(None, Some(outro_cliente_a), None))).await.map_err(|e| anyhow!(e))?.total, 0);
    assert_eq!(listar_orcamentos_insumos(Some(filtro(None, None, Some("oi-5")))).await.map_err(|e| anyhow!(e))?.total, 1);
    assert_eq!(listar_orcamentos_insumos(Some(filtro(None, None, Some("Cliente A")))).await.map_err(|e| anyhow!(e))?.total, 5);
    assert_eq!(listar_orcamentos_insumos(Some(filtro(Some("INVALIDO"), None, None))).await.map_err(|e| anyhow!(e))?.total, 5, "status desconhecido é ignorado");
    let pagina2 = listar_orcamentos_insumos(Some(FiltrosOrcamentosInsumos { page: Some(1), ..Default::default() })).await.map_err(|e| anyhow!(e))?;
    assert_eq!(pagina2.items.len(), 0, "5 itens cabem na primeira página de 10");

    // ── Isolamento por empresa ────────────────────────────────────────────────
    entrar(perfil_b).await?;
    assert_eq!(listar_orcamentos_insumos(None).await.map_err(|e| anyhow!(e))?.total, 0);
    assert!(erro(obter_orcamento_insumos(oi1.orcamento.id).await).contains("não encontrado"));
    assert!(erro(aprovar_orcamento_insumos(aprovar_input(&para_reprovar, None)).await).contains("não encontrado"));
    assert!(erro(cancelar_orcamento_insumos(cancelar_input(&aprovado, true)).await).contains("não encontrado"));
    assert!(erro(criar_orcamento_insumos(entrada(cliente_a, vec![item(produto_b, 1, 1.0)])).await).contains("Cliente não encontrado"));
    assert!(erro(criar_orcamento_insumos(entrada(cliente_b, vec![item(etiqueta, 1, 1.0)])).await).contains("não foi encontrado"));
    let oi_b = criar_orcamento_insumos(entrada(cliente_b, vec![item(produto_b, 10, 3.0)])).await.map_err(|e| anyhow!(e))?;
    assert_eq!(oi_b.orcamento.numero_exibicao, "OI-1", "cada empresa tem a própria sequência");
    let aprovado_b = aprovar_orcamento_insumos(aprovar_input(&oi_b, None)).await.map_err(|e| anyhow!(e))?;
    assert_eq!(aprovado_b.orcamento.status, "APROVADO");
    assert_eq!(saldo(produto_b).await?, 40);
    entrar(perfil_a).await?;
    assert_eq!(listar_orcamentos_insumos(None).await.map_err(|e| anyhow!(e))?.total, 5);
    assert!(erro(obter_orcamento_insumos(oi_b.orcamento.id).await).contains("não encontrado"));
    assert_eq!(saldo(etiqueta).await?, 7, "empresa A não foi afetada pela B");

    // ── Auditoria ─────────────────────────────────────────────────────────────
    let eventos: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT event_type FROM security_audit_log WHERE event_type LIKE 'INSUMOS_QUOTE_%' ORDER BY 1",
    ).fetch_all(&pool).await?;
    for esperado in ["INSUMOS_QUOTE_APPROVED", "INSUMOS_QUOTE_CANCELLED", "INSUMOS_QUOTE_CREATED", "INSUMOS_QUOTE_DELIVERED",
                     "INSUMOS_QUOTE_REJECTED", "INSUMOS_QUOTE_SENT", "INSUMOS_QUOTE_UPDATED"] {
        ensure!(eventos.iter().any(|e| e == esperado), "evento de auditoria ausente: {esperado} (há {eventos:?})");
    }

    // ── Constraints do banco como segunda barreira ────────────────────────────
    let direto = sqlx::query("UPDATE orcamentos_insumos SET status = 'APROVADO', forma_pagamento_codigo = NULL WHERE id = $1")
        .bind(oi1.orcamento.id).execute(&pool).await;
    assert!(direto.is_err(), "aprovado sem forma de pagamento deve ser barrado pelo banco");
    let direto = sqlx::query("UPDATE orcamentos_insumos SET status = 'INVENTADO' WHERE id = $1")
        .bind(oi1.orcamento.id).execute(&pool).await;
    assert!(direto.is_err(), "status fora da lista deve ser barrado pelo banco");

    println!("test_orcamentos_insumos: OK");
    Ok(())
}
