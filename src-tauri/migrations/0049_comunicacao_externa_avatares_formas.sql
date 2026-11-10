-- Somente dados. As chaves antigas deixam de ser usadas pelo código novo.
-- Quem configura um canal passa a configurar ambos e a disponibilidade do portal.
-- MANAGE_STATUS_LINKS mantém a chave e passa a se chamar "Acessos do portal";
-- não concede COMMUNICATION_SETTINGS a quem tinha apenas acessos do portal.
UPDATE security_profiles
   SET permissions = (
       SELECT jsonb_agg(p ORDER BY p)::text
         FROM (
             SELECT DISTINCT CASE
                 WHEN value IN ('CONFIG_SMTP', 'CONFIG_WHATSAPP') THEN 'COMMUNICATION_SETTINGS'
                 ELSE value
             END AS p
             FROM jsonb_array_elements_text(permissions::jsonb)
         ) mapeadas
   ), atualizado_em = NOW()
 WHERE permissions::jsonb ?| ARRAY['CONFIG_SMTP', 'CONFIG_WHATSAPP'];

-- Mesma escolha estável de profileAppearance: abs(id) % 9 (cast evita overflow).
-- Preserva formas existentes, cores, tema e perfis sem escolha de avatar.
UPDATE security_profiles
   SET avatar_icone = (ARRAY[
       'shape-orb', 'shape-square', 'shape-peak', 'shape-pill', 'shape-bean',
       'shape-hex', 'shape-arch', 'shape-cloud', 'shape-block'
   ])[1 + (abs(id::bigint) % 9)::integer],
       atualizado_em = NOW()
 WHERE avatar_icone IS NOT NULL
   AND avatar_icone NOT IN (
       'shape-orb', 'shape-square', 'shape-peak', 'shape-pill', 'shape-bean',
       'shape-hex', 'shape-arch', 'shape-cloud', 'shape-block'
   );
