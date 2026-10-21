/**
 * Monta o comentário único do PR com a lista de telas e o nome do artefato.
 * Lê só arquivos locais gerados pelo job. Não chama API nenhuma.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const screens = [
  ["01-home.png", "Home (Dashboard)"],
  ["02-clientes.png", "Clientes"],
  ["03-equipamentos.png", "Equipamentos"],
  ["04-atendimento-os.png", "Atendimento / OS (detalhe do equipamento)"],
  ["05-insumos-estoque.png", "Insumos / estoque"],
  ["06-equipe-acessos.png", "Perfil › Equipe"],
  ["07-portal-config.png", "Portal do Cliente (Configurações → Integrações)"],
  ["08-selecao-perfil.png", "Seleção de perfil (entrada)"],
  ["09-perfil-visao-geral.png", "Perfil › Visão geral"],
];

const dir = resolve("e2e/ui-screenshots");
const present = new Set(
  existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".png")) : [],
);
const sha = process.env.SCREENSHOT_SHA || "desconhecido";
const runUrl = process.env.SCREENSHOT_RUN_URL || "";
const artifact = `ui-screenshots-${sha}`;
const lines = screens.map(([file, label]) => {
  const mark = present.has(file) ? "capturada" : "ausente neste run";
  return `- ${label}: \`${file}\` (${mark})`;
});

const body = [
  "<!-- autoos-ui-screenshots -->",
  "### Screenshots de UI",
  "",
  "Job não obrigatório (`continue-on-error`). Os PNGs estão no artefato",
  `\`${artifact}\`${runUrl ? `, neste [run](${runUrl})` : ""}.`,
  "",
  ...lines,
  "",
  "Dados sintéticos do Postgres local `test_autoos`. Nenhuma URL ou segredo de produção entra neste job.",
  "",
].join("\n");

process.stdout.write(body);
