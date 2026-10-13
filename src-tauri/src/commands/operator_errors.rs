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

pub fn mensagem_duplicidade_sql(error: &sqlx::Error) -> Option<String> {
    let database = error.as_database_error()?;
    mensagem_para_sqlstate(database.code().as_deref(), database.constraint())
}

pub fn erro_sql_para_operador(error: &sqlx::Error) -> String {
    mensagem_duplicidade_sql(error).unwrap_or_else(|| error.to_string())
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
            super::erro_sql_para_operador(&protocolo),
            protocolo.to_string()
        );
    }
}
