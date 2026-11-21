-- Mensagens prontas de WhatsApp, editáveis por empresa. O app abre o WhatsApp com o texto
-- preenchido e a pessoa só aperta enviar; nada aqui é enviado sozinho. Campos entre chaves
-- ({cliente}, {contato}, {equipamento}, {os}, {status}) são preenchidos na hora de abrir.
CREATE TABLE IF NOT EXISTS public.modelos_mensagem (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    texto TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    -- Modelo semeado por esta migration (evita semear de novo); NULL nos criados pela empresa.
    chave_padrao TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, empresa_id),
    UNIQUE (empresa_id, chave_padrao),
    CONSTRAINT chk_modelos_mensagem_titulo CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 60),
    CONSTRAINT chk_modelos_mensagem_texto CHECK (char_length(btrim(texto)) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_modelos_mensagem_empresa ON public.modelos_mensagem (empresa_id, ordem, id);

ALTER TABLE public.modelos_mensagem ENABLE ROW LEVEL SECURITY;

-- Três modelos de partida, sem nome de empresa: cada uma edita os seus.
INSERT INTO public.modelos_mensagem (empresa_id, titulo, texto, ordem, chave_padrao)
SELECT e.id, m.titulo, m.texto, m.ordem, m.chave
FROM public.empresas e
CROSS JOIN (VALUES
    ('pronto', 'Equipamento pronto', 'Olá, {contato}! O equipamento {equipamento} (OS {os}) está pronto para retirada.', 1),
    ('retirada', 'Lembrete de retirada', 'Olá, {contato}! Lembrando que o equipamento {equipamento} (OS {os}) continua aguardando retirada.', 2),
    ('orcamento', 'Orçamento enviado', 'Olá, {contato}! Enviamos o orçamento do equipamento {equipamento} (OS {os}). Fico à disposição para qualquer dúvida.', 3)
) AS m(chave, titulo, texto, ordem)
ON CONFLICT (empresa_id, chave_padrao) DO NOTHING;
