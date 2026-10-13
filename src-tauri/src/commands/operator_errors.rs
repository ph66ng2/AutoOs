//! Traduz erro de cadastro repetido para uma frase que o operador entende.
//! O texto técnico do banco (chave duplicada, restrição, SQLSTATE) fica no log.

/// Reconhece duplicidade só pelo SQLSTATE 23505 e pelo nome estruturado da constraint.
/// Um texto que apenas mencione "23505" ou "duplicate key" não é duplicidade.
pub fn mensagem_para_sqlstate(code: Option<&str>, constraint: Option<&str>) -> Option<String> {
    if code != Some("23505") {
        return None;
    }

    Some(texto_para_operador(constraint.unwrap_or("")).to_string())
}

pub const MENSAGEM_ERRO_GENERICO: &str = "Não foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.";

/// Código genérico de banco. O SQLSTATE que não é 23505 fica só no log.
pub const CODIGO_BANCO: &str = "AUTOOS:DB";

fn resposta_estruturada(codigo: &str, mensagem: &str) -> String {
    format!("{codigo}\n{mensagem}")
}

/// Código que o frontend reconhece. Não é uma frase, então um texto solto com
/// "23505" ou "unicidade" não entra nesta forma.
pub fn codigo_duplicado_estruturado(code: Option<&str>, constraint: Option<&str>) -> Option<String> {
    if code != Some("23505") {
        return None;
    }
    let nome = constraint.unwrap_or("");
    if nome.is_empty() || !nome.chars().all(|caractere| caractere.is_ascii_alphanumeric() || caractere == '_') {
        return Some("AUTOOS:23505".to_string());
    }
    Some(format!("AUTOOS:23505:{nome}"))
}

pub fn mensagem_duplicidade_sql(error: &sqlx::Error) -> Option<String> {
    let database = error.as_database_error()?;
    codigo_duplicado_estruturado(database.code().as_deref(), database.constraint())
}

/// Mapeador único dos erros sqlx que um comando Tauri devolve ao operador.
/// Duplicidade (SQLSTATE 23505) sai como `AUTOOS:23505` mais a frase.
/// Bind, conexão, tabela inexistente e qualquer outro erro de banco saem como
/// `AUTOOS:DB` mais a frase genérica. O texto técnico fica no log.
pub fn mapear_erro_sql(error: sqlx::Error) -> String {
    erro_sql_para_operador(&error)
}

pub fn erro_sql_para_operador(error: &sqlx::Error) -> String {
    if let Some(codigo) = mensagem_duplicidade_sql(error) {
        let restricao = error
            .as_database_error()
            .and_then(|banco| banco.constraint())
            .unwrap_or("");
        tracing::error!(erro = %error, "cadastro duplicado; o operador recebe o código estruturado e a frase");
        return resposta_estruturada(&codigo, texto_para_operador(restricao));
    }
    tracing::error!(erro = %error, "erro de banco ocultado do operador");
    resposta_estruturada(CODIGO_BANCO, MENSAGEM_ERRO_GENERICO)
}

fn texto_para_operador(constraint: &str) -> &'static str {
    match constraint {
        "ux_clientes_documento_ativo"
        | "ux_clientes_cpf_cnpj_ativo"
        | "clientes_documento_key"
        | "clientes_cpf_cnpj_key" => {
            "Esse cliente já está cadastrado. Procure o CPF ou CNPJ na lista de clientes em vez de criar outro."
        }
        "ux_produtos_empresa_codigo_ativo"
        | "ux_produtos_codigo_ativo"
        | "ux_produtos_codigo_ativo_sem_empresa"
        | "produtos_codigo_key" => {
            "Esse código de insumo já está cadastrado. Procure o código na lista ou escolha outro."
        }
        "ux_servicos_catalogo_nome_ativo" => {
            "Já existe um serviço com esse nome. Procure na lista ou escolha outro nome."
        }
        "ux_gastos_fixos_nome_ativo" | "gastos_fixos_nome_key" => {
            "Já existe um gasto com esse nome. Procure na lista ou escolha outro nome."
        }
        "security_profiles_nome_key" | "ux_security_profiles_nome_normalizado" => {
            "Já existe um perfil com este nome. Escolha outro nome."
        }
        "ux_equipamentos_patrimonio_when_present" => {
            "Esse patrimônio já está em outro equipamento. Confira o número ou deixe o campo em branco."
        }
        "empresas_email_key" => {
            "Esse e-mail já está cadastrado. Use outro e-mail ou entre com a conta que já existe."
        }
        _ if constraint.ends_with("_pkey") => {
            "Esse cadastro já existe. Não dá para gravar o mesmo registro duas vezes."
        }
        _ => {
            "Não foi possível salvar porque esse cadastro já existe. Confira se o documento, o código ou o nome já está na lista e altere o que estiver repetido."
        }
    }
}

#[cfg(test)]
mod tests {
    use super::mensagem_para_sqlstate;

    #[test]
    fn explica_cliente_duplicado_pelo_sqlstate_23505() {
        let message = mensagem_para_sqlstate(Some("23505"), Some("ux_clientes_documento_ativo")).unwrap();
        assert!(message.contains("cliente já está cadastrado"));
        assert!(message.contains("CPF ou CNPJ"));
        assert!(!message.to_lowercase().contains("constraint"));
        assert!(!message.contains("23505"));
        assert!(!message.contains("ux_clientes_documento_ativo"));
    }

    #[test]
    fn explica_codigo_de_insumo_e_chave_primaria() {
        assert!(mensagem_para_sqlstate(Some("23505"), Some("ux_produtos_empresa_codigo_ativo"))
            .unwrap()
            .contains("código de insumo"));

        let message = mensagem_para_sqlstate(Some("23505"), Some("clientes_pkey")).unwrap();
        assert!(message.contains("cadastro já existe"));
        assert!(!message.to_lowercase().contains("unicidade"));
        assert!(!message.contains("clientes_pkey"));
    }

    #[test]
    fn ignora_texto_solto_e_outro_sqlstate() {
        assert!(mensagem_para_sqlstate(None, Some("ux_clientes_documento_ativo")).is_none());
        assert!(mensagem_para_sqlstate(Some("23502"), Some("ux_clientes_documento_ativo")).is_none());
        assert!(mensagem_para_sqlstate(
            Some("P0001"),
            Some("ux_equipamentos_patrimonio_when_present")
        )
        .is_none());
        let protocolo = sqlx::Error::Protocol(
            "duplicate key value violates unique constraint \"ux_clientes_documento_ativo\" 23505"
                .to_string(),
        );
        assert!(super::mensagem_duplicidade_sql(&protocolo).is_none());
        assert_eq!(
            super::codigo_duplicado_estruturado(Some("23505"), Some("ux_clientes_documento_ativo")).as_deref(),
            Some("AUTOOS:23505:ux_clientes_documento_ativo")
        );
        assert!(super::codigo_duplicado_estruturado(Some("23502"), Some("ux_clientes_documento_ativo")).is_none());
        let visivel = super::erro_sql_para_operador(&protocolo);
        let (codigo, mensagem) = visivel.split_once('\n').expect("código e frase");
        assert_eq!(codigo, super::CODIGO_BANCO);
        assert_eq!(mensagem, super::MENSAGEM_ERRO_GENERICO);
        assert!(!visivel.contains("23505"));
        assert!(!visivel.to_lowercase().contains("constraint"));
        assert!(!visivel.contains("duplicate key"));
    }

    #[derive(Debug)]
    struct BancoFalso {
        code: &'static str,
        constraint: Option<&'static str>,
        message: &'static str,
    }

    impl std::fmt::Display for BancoFalso {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(formatter, "{} (SQLSTATE {})", self.message, self.code)
        }
    }

    impl std::error::Error for BancoFalso {}

    impl sqlx::error::DatabaseError for BancoFalso {
        fn message(&self) -> &str {
            self.message
        }

        fn code(&self) -> Option<std::borrow::Cow<'_, str>> {
            Some(std::borrow::Cow::Borrowed(self.code))
        }

        fn constraint(&self) -> Option<&str> {
            self.constraint
        }

        fn kind(&self) -> sqlx::error::ErrorKind {
            if self.code == "23505" {
                sqlx::error::ErrorKind::UniqueViolation
            } else {
                sqlx::error::ErrorKind::Other
            }
        }

        fn as_error(&self) -> &(dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn std::error::Error + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn std::error::Error + Send + Sync + 'static> {
            self
        }
    }

    fn assert_banco_generico(error: sqlx::Error) {
        let tecnico = error.to_string();
        let visivel = super::mapear_erro_sql(error);
        let (codigo, mensagem) = visivel.split_once('\n').expect("código e frase");
        assert_eq!(codigo, super::CODIGO_BANCO);
        assert_eq!(mensagem, super::MENSAGEM_ERRO_GENERICO);
        assert!(!visivel.contains(&tecnico));
        assert!(!mensagem.contains("SQLSTATE"));
        assert!(!mensagem.contains("23505"));
        assert!(!mensagem.contains("42"));
    }

    #[test]
    fn duplicidade_reais_traz_codigo_e_frase_sem_o_texto_tecnico() {
        let error = sqlx::Error::database(BancoFalso {
            code: "23505",
            constraint: Some("ux_clientes_documento_ativo"),
            message: "duplicate key value violates unique constraint \"ux_clientes_documento_ativo\"",
        });
        let visivel = super::mapear_erro_sql(error);
        let (codigo, mensagem) = visivel.split_once('\n').expect("código e frase");
        assert_eq!(codigo, "AUTOOS:23505:ux_clientes_documento_ativo");
        assert!(mensagem.contains("cliente já está cadastrado"));
        assert!(!mensagem.contains("23505"));
        assert!(!mensagem.contains("ux_clientes_documento_ativo"));
        assert!(!mensagem.to_lowercase().contains("constraint"));
        assert!(!mensagem.contains("duplicate key"));
    }

    #[test]
    fn bind_conexao_e_tabela_inexistente_viram_codigo_generico() {
        assert_banco_generico(sqlx::Error::Encode(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "bind do parâmetro $3 incompatível",
        ))));
        assert_banco_generico(sqlx::Error::PoolTimedOut);
        assert_banco_generico(sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::ConnectionRefused,
            "connection refused 127.0.0.1:5432",
        )));
        assert_banco_generico(sqlx::Error::database(BancoFalso {
            code: "42P01",
            constraint: None,
            message: "relation \"clientes\" does not exist",
        }));
        assert_banco_generico(sqlx::Error::Protocol(
            "duplicate key value violates unique constraint \"clientes_pkey\" SQLSTATE 23505".to_string(),
        ));
    }
}
