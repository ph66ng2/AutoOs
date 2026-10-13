//! Traduz erro de cadastro repetido para uma frase que o operador entende.
//! O texto técnico do banco (chave duplicada, restrição, SQLSTATE) fica no log.

pub fn mensagem_cadastro_duplicado(raw: &str) -> Option<String> {
    if !erro_de_cadastro_duplicado(raw) {
        return None;
    }

    Some(texto_para_operador(nome_da_restricao(raw).unwrap_or("")).to_string())
}

pub fn erro_sql_para_operador(error: &sqlx::Error) -> String {
    let raw = error.to_string();
    mensagem_cadastro_duplicado(&raw).unwrap_or(raw)
}

fn erro_de_cadastro_duplicado(raw: &str) -> bool {
    let lower = raw.to_lowercase();
    lower.contains("duplicate key")
        || lower.contains("unique constraint")
        || lower.contains("23505")
        || lower.contains("unicidade")
        || lower.contains("chave duplicada")
}

fn nome_da_restricao(raw: &str) -> Option<&str> {
    for marker in ["constraint \"", "unicidade \""] {
        if let Some(start) = raw.find(marker) {
            let rest = &raw[start + marker.len()..];
            if let Some(end) = rest.find('"') {
                if end > 0 {
                    return Some(&rest[..end]);
                }
            }
        }
    }
    None
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
    use super::mensagem_cadastro_duplicado;

    #[test]
    fn explica_cliente_duplicado_sem_jargao_de_banco() {
        let raw = "error returned from database: duplicate key value violates unique constraint \"ux_clientes_documento_ativo\"";
        let message = mensagem_cadastro_duplicado(raw).unwrap();
        assert!(message.contains("cliente já está cadastrado"));
        assert!(message.contains("CPF ou CNPJ"));
        assert!(!message.to_lowercase().contains("constraint"));
        assert!(!message.contains("23505"));
    }

    #[test]
    fn explica_codigo_de_insumo_e_chave_primaria() {
        let produto = "duplicate key value violates unique constraint \"ux_produtos_empresa_codigo_ativo\"";
        assert!(mensagem_cadastro_duplicado(produto)
            .unwrap()
            .contains("código de insumo"));

        let chave = "duplicar valor da chave viola a restrição de unicidade \"clientes_pkey\"";
        let message = mensagem_cadastro_duplicado(chave).unwrap();
        assert!(message.contains("cadastro já existe"));
        assert!(!message.to_lowercase().contains("unicidade"));
    }

    #[test]
    fn deixa_passar_erro_que_nao_e_duplicidade() {
        assert!(mensagem_cadastro_duplicado("Conflito de concorrência").is_none());
    }
}
