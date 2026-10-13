-- Confere os 42 SKUs do inventário na empresa alvo, ativos ou inativos.
-- Não soma códigos de empresas diferentes. Uma contagem sem filtrar a
-- empresa alvo passaria se cada empresa tivesse só uma parte do conjunto.
--
-- Empresa alvo, a mesma regra do seed:
--   * seed.empresa_id, quando definido e existente;
--   * senão, a única linha de empresas;
--   * senão, falha. Não escolhe uma empresa quando há várias.
-- Não altera saldo, preço, nome nem movimentacoes_estoque.

DO $confirm$
DECLARE
    configured text;
    target_empresa integer;
    empresa_count integer;
    found integer;
BEGIN
    configured := NULLIF(BTRIM(current_setting('seed.empresa_id', true)), '');
    IF configured IS NOT NULL THEN
        IF configured !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'seed.empresa_id deve ser o id numérico de uma empresa.';
        END IF;
        SELECT id INTO target_empresa FROM empresas WHERE id = configured::integer;
        IF target_empresa IS NULL THEN
            RAISE EXCEPTION 'seed.empresa_id=% não existe em empresas.', configured;
        END IF;
    ELSE
        SELECT COUNT(*)::integer INTO empresa_count FROM empresas;
        IF empresa_count = 1 THEN
            SELECT id INTO target_empresa FROM empresas;
        ELSIF empresa_count = 0 THEN
            RAISE EXCEPTION 'Nenhuma empresa cadastrada. Cadastre a empresa ou defina seed.empresa_id antes de aplicar o seed.';
        ELSE
            RAISE EXCEPTION 'Há % empresas. Defina seed.empresa_id com o id da empresa alvo. O seed não escolhe uma empresa sozinho.', empresa_count;
        END IF;
    END IF;

    SELECT COUNT(*)::integer INTO found
    FROM (
        SELECT DISTINCT produto.codigo
        FROM produtos AS produto
        WHERE produto.empresa_id = target_empresa
          AND produto.codigo IN (
              'ETQ-100X50-COUCHE','ETQ-32X18X3-TRANS-BOPP','ETQ-102X51-TRANS-BOPP',
              'ETQ-100X70-BOPP','ETQ-50X40X2-TRANS-BOPP','ETQ-100X150-BOPP',
              'ETQ-45X20X2-LACRE-ELMECO','ETQ-32X18X5-BOPP','ETQ-100X65-BOPP',
              'ETQ-100X40-BOPP','ETQ-100X70-COUCHE','ETQ-40X33-PRATA',
              'ETQ-20X25X3-BOPP','ETQ-30X30-BOPP','ETQ-50X20-BOPP',
              'ETQ-50X50X20-BOPP','ETQ-100X50-BOPP','ETQ-45X20-BOPP',
              'ETQ-35X70X3-CARTAO-ROUPA','ETQ-70X125X01-BOPP-3POL','ETQ-100X50-BOPP-3POL',
              'ETQ-28X80-COUCHE-DYMO','ETQ-70X30-COUCHE-3POL','ETQ-50X70X2-BOPP-3POL',
              'ETQ-90X60-GONDOLA-AM-3POL','RIB-CERA-110X450','RIB-RESINA',
              'RIB-ZXP1-COLOR','RIB-ZXP1-MONO','RIB-ZC300-MONO','PEC-CANETA-LIMPEZA',
              'ETQ-17X152X5-COUCHE','ETQ-80X50-COUCHE-AZUL','ETQ-50X120X2-COUCHE',
              'ETQ-50X160X2-COUCHE','ETQ-50X28-COUCHE-AMARELA','ETQ-100X30-GONDOLA',
              'ETQ-100X40-GONDOLA-LARANJA','ETQ-33X22X3-COUCHE','ETQ-33X22X3-AMARELA',
              'ETQ-75X30-GONDOLA-LARANJA','ETQ-80X70-BOPP'
          )
    ) AS presente;

    IF found <> 42 THEN
        RAISE EXCEPTION 'Esperados 42 SKUs na empresa %; encontrados %.', target_empresa, found;
    END IF;
END
$confirm$;
