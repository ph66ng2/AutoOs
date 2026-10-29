#!/usr/bin/env node
/**
 * Grava o vídeo tutorial do Portal do Cliente (página pública src/public-status/).
 *
 * Uso: node scripts/tutoriais/gravar-portal-cliente.mjs
 * Saída: docs/tutoriais/video-portal-cliente.webm e .mp4 (ffmpeg).
 *
 * A função de borda é simulada com page.route: dados 100% fictícios, nenhuma chamada externa.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { criarLinhaDoTempo, destacar, zoomar, secao } from "./efeitos.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SAIDA = path.join(RAIZ, "docs/tutoriais");
const TMP = path.join(SAIDA, ".tmp-video");
const SCRATCH = "/tmp/claude-0/-home-user-AutoOs/334953b4-4c62-5faa-b0da-3112605ddf7e/scratchpad";
const PORTA = 4181;
const BASE = `http://127.0.0.1:${PORTA}/`;
const API = "https://sgaqvxubopgwysnyocjs.supabase.co/functions/v1/portal-cliente";

const log = (...a) => process.stdout.write(`${a.join(" ")}\n`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- dados fictícios
const TOKEN = "a1b2c3d4".repeat(8);
const DOC_DIGITOS = "11222333000181"; // CNPJ de teste fictício
const agora = () => Date.now();
const iso = (deslocMs) => new Date(agora() + deslocMs).toISOString();
const DIA = 86_400_000;

const foto = (id, cor, rotulo) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${cor}"/><rect x="170" y="160" width="300" height="170" rx="14" fill="#f3f4f6" stroke="#374151" stroke-width="6"/><rect x="215" y="115" width="210" height="55" fill="#d1d5db" stroke="#374151" stroke-width="5"/><rect x="225" y="290" width="190" height="75" fill="#fff" stroke="#374151" stroke-width="5"/><text x="320" y="425" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#111827">${rotulo}</text></svg>`;
  return { id, categoria: rotulo.startsWith("Entrada") ? "ENTRADA" : "VERIFICACAO", url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, largura: 640, altura: 480 };
};

const CONTATO_EMPRESA = {
  nome: "BMI TAG", whatsapp: "71999990000", email: "contato@exemplo.invalid", telefone: "(71) 3333-0000",
  horario: "Segunda a sexta, das 8h às 18h", endereco: null, mapsUrl: null,
};

const estado = {
  resposta: null, // resposta vigente do atendimento 101
  historico: [],
  solicitacoes: [],
  proxR: 1001,
  proxS: 2001,
  proxRespostaId: 1,
};

const equipamentos = {
  101: {
    id: 101, equipamento: "HP LaserJet Pro M404dn", serie: "SN-HP-40417", patrimonio: "PAT-0231",
    status: "AGUARDANDO_APROVACAO", titulo: "O orçamento aguarda sua resposta", historico: false,
    entradaEm: iso(-6 * DIA), atividadeEm: iso(-2 * 3_600_000), statusAlteradoEm: iso(-2 * 3_600_000),
  },
  102: {
    id: 102, equipamento: "Epson EcoTank L3250", serie: "SN-EP-88120", patrimonio: null,
    status: "EM_MANUTENCAO", titulo: "Serviço em andamento", historico: false,
    entradaEm: iso(-9 * DIA), atividadeEm: iso(-1 * DIA), statusAlteradoEm: iso(-1 * DIA),
  },
  103: {
    id: 103, equipamento: "Brother HL-L2360DW", serie: "SN-BR-20993", patrimonio: "PAT-0112",
    status: "ENTREGUE", titulo: "Equipamento entregue", historico: true,
    entradaEm: iso(-40 * DIA), atividadeEm: iso(-30 * DIA), statusAlteradoEm: iso(-30 * DIA),
  },
};

const ORCAMENTO_BASE = {
  versaoId: 9, versao: 1, publicadaEm: iso(-2 * 3_600_000), valorTotal: 480, validoAte: iso(7 * DIA),
  estado: "ABERTA",
  servicos: [
    { descricao: "Manutenção preventiva e limpeza geral", valor: 120, pecas: [] },
    { descricao: "Troca do conjunto fusor", valor: 160, pecas: [{ nome: "Fusor HP M404", quantidade: 1, valorUnitario: 150 }] },
  ],
  pecas: [{ nome: "Kit de rolos de tração", quantidade: 1, valorTotal: 50 }],
  janelaMinutos: 15, aceiteOnline: true,
};

function resumo(e) {
  const r = e.id === 101 ? estado.resposta : null;
  return {
    id: e.id, equipamento: e.equipamento, serie: e.serie, patrimonio: e.patrimonio, status: e.status, titulo: e.titulo,
    historico: e.historico, entradaEm: e.entradaEm, atividadeEm: e.atividadeEm, statusAlteradoEm: e.statusAlteradoEm,
    valorAtual: e.id === 101 ? 480 : e.id === 102 ? 320 : 210,
    aguardaResposta: e.id === 101 && !r, resposta: r ? r.estado : null,
  };
}

function detalhe(id) {
  const e = equipamentos[id];
  if (!e) return null;
  const base = {
    id: e.id, equipamento: e.equipamento, serie: e.serie, patrimonio: e.patrimonio, status: e.status, titulo: e.titulo,
    orientacao: "", statusAlteradoEm: e.statusAlteradoEm, entradaEm: e.entradaEm,
    cliente: { nome: "Gráfica Exemplo Ltda", documento: DOC_DIGITOS, exigeOrdemCompra: false },
    defeitoRelatado: null, valores: { orcamento: null, final: null, atual: null },
    etapas: [], fotos: [], historico: [], orcamento: null, solicitacoes: [],
    contatoEmpresa: CONTATO_EMPRESA, podeDecidir: true, verificacaoRecente: true, contato: "Marina",
    temTelefone: true, temEmail: true,
  };
  if (id === 101) {
    return {
      ...base,
      orientacao: "Concluímos a análise. Confira o orçamento abaixo e responda para liberarmos o serviço.",
      valores: { orcamento: 480, final: null, atual: 480 },
      etapas: [
        { status: "RECEBIDO", em: e.entradaEm },
        { status: "EM_VERIFICACAO", em: iso(-5 * DIA) },
        { status: "VERIFICADO", em: iso(-3 * DIA) },
        { status: "AGUARDANDO_APROVACAO", em: e.statusAlteradoEm },
      ],
      fotos: [
        foto(1, "#e0e7ff", "Entrada 1"), foto(2, "#fce7f3", "Entrada 2"), foto(3, "#dcfce7", "Verificação 1"),
      ].map((f, i) => (i === 2 ? { ...f, categoria: "VERIFICACAO" } : f)),
      historico: estado.historico,
      orcamento: { ...ORCAMENTO_BASE, resposta: estado.resposta },
      solicitacoes: estado.solicitacoes,
    };
  }
  if (id === 102) {
    return {
      ...base,
      orientacao: "Seu equipamento está em manutenção. Avisaremos quando estiver pronto.",
      valores: { orcamento: 320, final: null, atual: 320 },
      etapas: [
        { status: "RECEBIDO", em: e.entradaEm }, { status: "EM_VERIFICACAO", em: iso(-8 * DIA) },
        { status: "AGUARDANDO_APROVACAO", em: iso(-6 * DIA) }, { status: "APROVADO", em: iso(-2 * DIA) },
        { status: "EM_MANUTENCAO", em: e.statusAlteradoEm },
      ],
    };
  }
  return {
    ...base,
    orientacao: "Equipamento entregue. Obrigado pela confiança!",
    valores: { orcamento: 210, final: 210, atual: 210 },
    etapas: [
      { status: "RECEBIDO", em: e.entradaEm }, { status: "EM_VERIFICACAO", em: iso(-39 * DIA) },
      { status: "AGUARDANDO_APROVACAO", em: iso(-37 * DIA) }, { status: "APROVADO", em: iso(-36 * DIA) },
      { status: "PRONTO", em: iso(-31 * DIA) }, { status: "ENTREGUE", em: e.statusAlteradoEm },
    ],
  };
}

function erro(status, mensagem, codigo = null) {
  return { status, corpo: { erro: mensagem, codigo } };
}

function tratar(corpo) {
  const ok = (c) => ({ status: 200, corpo: c });
  switch (corpo.acao) {
    case "entrarSenha": {
      if (corpo.documento !== DOC_DIGITOS || !corpo.senha) return erro(401, "CPF/CNPJ ou senha incorretos.", "CREDENCIAIS");
      return ok({ sessao: TOKEN, contato: "Marina", acesso: "DECIDIR", expiraEm: iso(3_600_000) });
    }
    case "confirmarSenha": return ok({ ok: true });
    case "sair": return ok({ ok: true });
    case "listar":
      return ok({
        cliente: "Gráfica Exemplo Ltda", contato: "Marina", podeDecidir: true,
        atendimentos: Object.values(equipamentos).map(resumo),
      });
    case "detalhe": {
      const d = detalhe(corpo.equipamentoId);
      return d ? ok(d) : erro(404, "Atendimento não encontrado.", "NAO_ENCONTRADO");
    }
    case "responder": {
      const orc = ORCAMENTO_BASE;
      const agoraIso = iso(0);
      if (corpo.decisao === "DESFEITA") {
        if (!estado.resposta) return erro(409, "Não há resposta para desfazer.", "NADA_A_DESFAZER");
        const antiga = estado.resposta;
        estado.historico = [
          { tipo: "RESPOSTA", subtipo: "DESFEITA", versao: 1, valor: orc.valorTotal, em: agoraIso, contato: "Marina",
            protocolo: `R-${antiga.id + 1000}-D`, mensagem: null, situacao: "DESFEITA", ordemCompra: null },
          ...estado.historico.map((h) => (h.protocolo === antiga.protocolo ? { ...h, situacao: "DESFEITA" } : h)),
        ];
        estado.resposta = null;
        return ok({ comprovante: {
          id: antiga.id, protocolo: antiga.protocolo, decisao: "DESFEITA", registradaEm: agoraIso, janelaAte: agoraIso,
          versao: 1, valorTotal: orc.valorTotal, equipamento: equipamentos[101].equipamento, serie: equipamentos[101].serie,
          contato: "Marina", ordemCompra: null, repetida: false,
        } });
      }
      const protocolo = `R-${estado.proxR++}`;
      const id = estado.proxRespostaId++;
      const janelaAte = iso(15 * 60_000);
      estado.resposta = {
        id, decisao: corpo.decisao, origem: "PORTAL_CLIENTE", registradaEm: agoraIso, janelaAte, contato: "Marina",
        propria: true, estado: "EM_CORRECAO", efetivadaEm: null, protocolo, ordemCompra: null,
      };
      estado.historico = [
        { tipo: "RESPOSTA", subtipo: corpo.decisao, versao: 1, valor: orc.valorTotal, em: agoraIso, contato: "Marina",
          protocolo, mensagem: null, situacao: "EM_CORRECAO", ordemCompra: null },
        ...estado.historico,
      ];
      return ok({ comprovante: {
        id, protocolo, decisao: corpo.decisao, registradaEm: agoraIso, janelaAte, versao: 1, valorTotal: orc.valorTotal,
        equipamento: equipamentos[101].equipamento, serie: equipamentos[101].serie, contato: "Marina",
        ordemCompra: null, repetida: false,
      } });
    }
    case "solicitar": {
      const protocolo = `S-${estado.proxS++}`;
      const criadoEm = iso(0);
      estado.solicitacoes = [{ id: estado.proxS, tipo: corpo.tipo, criadoEm, tratada: false, contato: "Marina", protocolo }, ...estado.solicitacoes];
      estado.historico = [
        { tipo: "SOLICITACAO", subtipo: corpo.tipo, versao: 1, valor: ORCAMENTO_BASE.valorTotal, em: criadoEm, contato: "Marina",
          protocolo, mensagem: corpo.mensagem || null, situacao: "AGUARDANDO", ordemCompra: null },
        ...estado.historico,
      ];
      return ok({ solicitacao: { id: estado.proxS, protocolo, tipo: corpo.tipo, criadoEm } });
    }
    default: return erro(400, "Ação inválida.", "ACAO_INVALIDA");
  }
}

// ---------------------------------------------------------------- servidor da página
async function subirServidor() {
  log("Gerando a página pública (vite build)...");
  const build = spawnSync("npx", ["vite", "build", "--config", "vite.public-status.config.ts"], { cwd: RAIZ, stdio: "inherit" });
  if (build.status !== 0) throw new Error("vite build falhou");
  const proc = spawn("npx", ["vite", "preview", "--config", "vite.public-status.config.ts", "--host", "127.0.0.1", "--port", String(PORTA), "--strictPort"], {
    cwd: RAIZ, stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return proc;
    } catch { /* ainda subindo */ }
    await esperar(500);
  }
  proc.kill();
  throw new Error("servidor de preview não respondeu");
}

// Se a versão do Chromium esperada pelo Playwright não estiver instalada, usa outra já presente na máquina.
async function abrirNavegador() {
  try {
    return await chromium.launch();
  } catch (e) {
    const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
    if (!existsSync(raiz)) throw e;
    const pastas = readdirSync(raiz).filter((n) => n.startsWith("chromium_headless_shell-")).sort().reverse();
    for (const pasta of pastas) {
      const exe = path.join(raiz, pasta, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (existsSync(exe)) {
        log(`Usando o Chromium alternativo ${exe}`);
        return chromium.launch({ executablePath: exe });
      }
    }
    throw e;
  }
}

// ---------------------------------------------------------------- overlay
const OVERLAY = () => {
  const montar = () => {
    if (document.getElementById("tut-legenda")) return;
    const estilo = document.createElement("style");
    estilo.textContent = `
      body { padding-bottom: 150px !important; }
      #tut-legenda { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483646; pointer-events: none;
        background: rgba(10,15,30,.86); color: #fff; font: 600 30px/1.3 system-ui, "Segoe UI", sans-serif;
        text-align: center; padding: 22px 60px; min-height: 100px; display: flex; align-items: center; justify-content: center;
        transition: opacity .25s; }
      #tut-legenda.vazia { opacity: 0; }
      #tut-cursor { position: fixed; z-index: 2147483647; pointer-events: none; width: 34px; height: 34px; margin: -17px 0 0 -17px;
        border-radius: 50%; background: rgba(250,204,21,.45); border: 3px solid #f59e0b; box-shadow: 0 0 14px rgba(245,158,11,.8);
        left: -100px; top: -100px; transition: transform .12s; }
      #tut-cursor.clique { transform: scale(.6); background: rgba(239,68,68,.55); border-color: #ef4444; }
    `;
    document.head.appendChild(estilo);
    const legenda = document.createElement("div");
    legenda.id = "tut-legenda";
    legenda.className = "vazia";
    const cursor = document.createElement("div");
    cursor.id = "tut-cursor";
    document.body.append(legenda, cursor);
    window.addEventListener("mousemove", (e) => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; }, true);
    window.addEventListener("mousedown", () => cursor.classList.add("clique"), true);
    window.addEventListener("mouseup", () => cursor.classList.remove("clique"), true);
    window.__legenda = (texto) => {
      const el = document.getElementById("tut-legenda");
      if (!el) return;
      el.textContent = texto || "";
      el.classList.toggle("vazia", !texto);
    };
    if (window.__legendaAtual) window.__legenda(window.__legendaAtual);
  };
  if (document.body) montar();
  else document.addEventListener("DOMContentLoaded", montar);
};

// ---------------------------------------------------------------- roteiro
async function main() {
  mkdirSync(SAIDA, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const servidor = await subirServidor();
  let browser;
  const linhaDoTempo = [];
  try {
    browser = await abrirNavegador();
    const tl = criarLinhaDoTempo({ largura: 1280, altura: 800 });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }, locale: "pt-BR", timezoneId: "America/Bahia",
      recordVideo: { dir: TMP, size: { width: 1280, height: 800 } }, bypassCSP: true,
    });
    const inicio = Date.now();
    await context.addInitScript(OVERLAY);
    const page = await context.newPage();

    // Rede: só a própria página e a função simulada; o resto é bloqueado.
    await page.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith(BASE) || u.startsWith("data:")) return route.continue();
      return route.abort();
    });
    const cors = {
      "access-control-allow-origin": "*", "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    await page.route(API, async (route) => {
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const { status, corpo } = tratar(route.request().postDataJSON());
      await esperar(60);
      return route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(corpo) });
    });

    // ----- helpers de cena
    const legenda = async (texto) => {
      linhaDoTempo.push({ t: Math.round((Date.now() - inicio) / 100) / 10, texto });
      log(`[${((Date.now() - inicio) / 1000).toFixed(1)}s] ${texto}`);
      await page.evaluate((t) => { window.__legendaAtual = t; window.__legenda?.(t); }, texto);
    };
    // Pausas longas são comprimidas para o vídeo ficar perto de 3 minutos (cada legenda continua com 3 s ou mais).
    const ficar = (ms) => page.waitForTimeout(ms >= 3000 ? Math.max(3000, Math.round(ms * 0.42)) : ms);
    const rolarPara = async (loc) => {
      await loc.first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await ficar(400);
    };
    const mover = async (loc, { rolar = true } = {}) => {
      if (rolar) await rolarPara(loc);
      const box = await loc.first().boundingBox();
      if (!box) throw new Error("elemento sem caixa");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
      await ficar(250);
    };
    const clicar = async (loc, opcoes = {}) => {
      await mover(loc, opcoes);
      if (opcoes.anel) await destacar(page, loc.first(), { ms: 1500 });
      await page.mouse.down();
      await ficar(100);
      await page.mouse.up();
      await ficar(350);
    };
    const digitar = async (loc, texto, delay = 70) => {
      await clicar(loc);
      await loc.first().pressSequentially(texto, { delay });
      await ficar(500);
    };
    // O zoom é aplicado ao vídeo inteiro; para a legenda não ser cortada, ela é levada para dentro do enquadramento ampliado.
    const zoomComLegenda = async (loc, escala, ms) => {
      await loc.scrollIntoViewIfNeeded();
      const caixa = await loc.boundingBox();
      const vw = 1280 / escala;
      const vh = 800 / escala;
      const lim = (v, max) => Math.min(Math.max(v, 0), max);
      const x0 = lim(caixa.x + caixa.width / 2 - vw / 2, 1280 - vw);
      const y0 = lim(caixa.y + caixa.height / 2 - vh / 2, 800 - vh);
      await page.evaluate(({ x0, vw, baixo }) => {
        const el = document.getElementById("tut-legenda");
        if (!el) return;
        el.style.left = `${x0}px`;
        el.style.right = `${1280 - x0 - vw}px`;
        el.style.bottom = `${baixo}px`;
        el.style.fontSize = "22px";
        el.style.padding = "12px 24px";
        el.style.minHeight = "0";
      }, { x0, vw, baixo: 800 - (y0 + vh) });
      await zoomar(page, loc, tl, { escala, ms });
      await page.evaluate(() => {
        const el = document.getElementById("tut-legenda");
        if (el) el.removeAttribute("style");
      });
    };
    const topo = () => page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })).then(() => ficar(900));

    // Roteiro curto (vídeo final de até 1 minuto). Cada legenda fica 3 s ou mais.
    const esp = (ms) => page.waitForTimeout(ms);
    const aceitar = page.getByRole("button", { name: "Aceitar orçamento", exact: true });

    // 1 - entrar
    await page.goto(`${BASE}#/entrar`, { waitUntil: "networkidle" });
    await page.mouse.move(640, 300);
    await legenda("Entre com o CPF ou CNPJ e a senha enviada pela equipe");
    await digitar(page.locator("#portal-documento"), "11222333000181", 35);
    await digitar(page.locator("#portal-senha"), "Exemplo2026", 40);
    await clicar(page.getByRole("button", { name: "Entrar", exact: true }), { anel: true });
    await page.getByText("Gráfica Exemplo Ltda").first().waitFor();

    // 2 - lista
    secao(tl);
    await legenda("Aqui ficam seus atendimentos. Veja: Aguarda sua resposta");
    await mover(page.getByText("Aguarda sua resposta"), { rolar: false });
    await esp(3400);

    // 3 - abrir o atendimento
    await legenda("Abra o atendimento para ver as etapas");
    await clicar(page.locator("a.portal-item", { hasText: "HP LaserJet Pro M404dn" }));
    await page.locator(".equipment-name").waitFor();
    await mover(page.locator(".timeline"));
    await esp(3200);

    // 4 - orçamento
    secao(tl);
    await legenda("Confira os itens, o total e a validade");
    const orcamento = page.locator("section.portal-quote");
    await rolarPara(orcamento.locator(".quote-list"));
    await mover(orcamento.locator(".quote-list"), { rolar: false });
    await zoomComLegenda(orcamento.locator(".quote-list"), 1.35, 3000);
    await esp(200);

    // 5 - negociar (só legenda: o botão fica à vista, sem clicar)
    await legenda("Quer conversar antes? Use Quero negociar");
    await mover(page.getByRole("button", { name: "Quero negociar" }));
    await esp(3300);

    // 6 - aceitar
    secao(tl);
    await legenda("Para aprovar, clique em Aceitar orçamento");
    await clicar(aceitar, { anel: true });
    await page.getByRole("alertdialog").waitFor();
    await esp(1000);
    await legenda("Confira impressora e valor, e Confirmar aceite");
    await clicar(page.getByRole("button", { name: "Confirmar aceite" }), { anel: true });
    await page.getByText("Resposta registrada no AutoOS").waitFor();
    await rolarPara(page.locator(".portal-receipt"));

    // 7 - comprovante
    await legenda("Pronto: comprovante com o protocolo R-1001");
    await mover(page.locator(".portal-receipt strong").first(), { rolar: false });
    await zoomComLegenda(page.locator(".portal-receipt strong").first(), 1.35, 3000);
    await esp(200);

    // 8 - desfazer (só legenda, sem desfazer de fato)
    await legenda("Mudou de ideia? Até 15 minutos: Desfazer resposta");
    await mover(page.getByRole("button", { name: /Desfazer resposta/ }));
    await esp(3400);
    await legenda("");
    await esp(300);

    const video = page.video();
    await context.close();
    const caminho = await video.path();
    const webm = path.join(SAIDA, "video-portal-cliente.webm");
    renameSync(caminho, webm);
    log(`WebM salvo em ${webm}`);

    await tl.salvar(path.join(SCRATCH, "linha-cliente.json"));
    const mp4 = path.join(SAIDA, "video-portal-cliente.mp4");
    const acab = spawnSync("node", [
      path.join(RAIZ, "scripts/tutoriais/acabamento.mjs"), webm, path.join(SCRATCH, "linha-cliente.json"), mp4,
      "--titulo", "Portal do Cliente", "--subtitulo", "Como acompanhar e aprovar seu orçamento",
      "--encerramento", "Dúvidas? Fale com a equipe pelo WhatsApp", "--cartao", "2",
    ], { stdio: "inherit" });
    if (acab.status !== 0) throw new Error("acabamento.mjs falhou");
    log(`MP4 salvo em ${mp4}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    servidor.kill();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((e) => {
  process.stderr.write(`Falhou: ${e.stack ?? e}\n`);
  process.exit(1);
});
