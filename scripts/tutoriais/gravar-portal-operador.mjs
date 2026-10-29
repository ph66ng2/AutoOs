#!/usr/bin/env node
/**
 * Grava o vídeo tutorial do operador: lado desktop do Portal do Cliente.
 *
 * Uso (na raiz do repositório):
 *   node scripts/tutoriais/gravar-portal-operador.mjs
 *
 * Sobe o Vite com o mock `e2e/mocks/tauri-core-portal-video.ts` (dados fictícios, em memória),
 * conduz o app com Playwright (Chromium já instalado; não roda `playwright install`) e converte a
 * gravação com ffmpeg para docs/tutoriais/video-portal-operador.{webm,mp4}.
 *
 * Variáveis opcionais:
 *   CHROMIUM_PATH   caminho do executável do Chromium, se o padrão do Playwright não existir
 *   FRAMES_DIR      pasta onde salvar ~10 quadros de conferência
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { criarLinhaDoTempo, destacar, zoomar, secao } from "./efeitos.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SAIDA = path.join(RAIZ, "docs/tutoriais");
const PORTA = 1420;
const URL_BASE = `http://127.0.0.1:${PORTA}`;
const FRAMES_DIR = process.env.FRAMES_DIR;
const LINHA_JSON = path.join(tmpdir(), "linha-operador.json");
const ROTEIRO_JSON = path.join(tmpdir(), "autoos-roteiro-operador.json");

const log = (texto) => process.stdout.write(`${texto}\n`);
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mesma chave que o app usa para não abrir o aviso de novidades na gravação. */
function chaveNovidades() {
  const fonte = readFileSync(path.join(RAIZ, "src/lib/releaseHighlightsKey.ts"), "utf8");
  const versao = /RELEASE_HIGHLIGHTS_VERSION = "([^"]+)"/.exec(fonte)?.[1];
  return `autoos:release-highlights:${versao}:portal-insumos-perfil`;
}

function acharChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const padrao = chromium.executablePath();
    if (padrao && existsSync(padrao)) return padrao;
  } catch {
    /* segue para a busca manual */
  }
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", path.join(process.env.HOME ?? "", ".cache/ms-playwright")].filter(Boolean);
  for (const base of bases) {
    if (!existsSync(base)) continue;
    const pastas = readdirSync(base).filter((nome) => nome.startsWith("chromium-")).sort().reverse();
    for (const pasta of pastas) {
      const exe = path.join(base, pasta, "chrome-linux64/chrome");
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

async function subirServidor() {
  const filho = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(PORTA), "--force"], {
    cwd: RAIZ,
    env: { ...process.env, VITE_E2E_MOCK: "1", VITE_E2E_PORTAL_VIDEO: "1" },
    detached: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i += 1) {
    try {
      const resposta = await fetch(URL_BASE);
      if (resposta.ok) return filho;
    } catch {
      /* ainda subindo */
    }
    await pausa(500);
  }
  process.kill(-filho.pid);
  throw new Error("O servidor Vite não respondeu em 60 s (a porta 1420 está livre?).");
}

/** Cursor visível, legenda inferior e quadro de resumo, injetados em toda página. */
function preparoDaPagina({ chave }) {
  localStorage.setItem("autoos_app_mode", "standard");
  localStorage.setItem(chave, "seen");

  // A tela consulta alertas a cada 30 s; na gravação isso acontece em ~1,5 s.
  const setIntervalOriginal = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...resto) => setIntervalOriginal(fn, ms === 30000 ? 1500 : ms, ...resto);

  const montar = () => {
    if (document.getElementById("tutorial-legenda")) return;
    const estilo = document.createElement("style");
    estilo.textContent = `
      #tutorial-cursor{position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))}
      .tutorial-onda{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;
        border-radius:50%;border:3px solid #f59e0b;animation:tutorial-onda .55s ease-out forwards}
      @keyframes tutorial-onda{to{transform:scale(3.2);opacity:0}}
      #tutorial-legenda{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483645;pointer-events:none;
        max-width:1180px;padding:14px 28px;border-radius:14px;background:rgba(8,12,28,.86);color:#fff;
        font:600 28px/1.3 Inter,"Segoe UI",system-ui,sans-serif;text-align:center;display:none;
        box-shadow:0 6px 24px rgba(0,0,0,.35)}
      #tutorial-quadro{position:fixed;inset:0;z-index:2147483644;display:none;align-items:center;justify-content:center;
        background:rgba(8,12,28,.72);font-family:Inter,"Segoe UI",system-ui,sans-serif}
      #tutorial-quadro .cartao{width:1180px;max-width:92vw;padding:28px 34px 22px;border-radius:18px;background:#fff;color:#111827;
        box-shadow:0 20px 60px rgba(0,0,0,.45)}
      #tutorial-quadro h2{margin:0 0 4px;font-size:30px}
      #tutorial-quadro p.sub{margin:0 0 18px;color:#4b5563;font-size:18px}
      #tutorial-quadro .linha{display:grid;grid-template-columns:300px 1fr;gap:18px;padding:13px 16px;margin-bottom:10px;
        border-radius:10px;border-left:8px solid var(--cor);background:var(--fundo);font-size:19px;line-height:1.35}
      #tutorial-quadro .linha b{font-size:21px}
    `;
    document.head.appendChild(estilo);

    const cursor = document.createElement("div");
    cursor.id = "tutorial-cursor";
    cursor.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const legenda = document.createElement("div");
    legenda.id = "tutorial-legenda";
    const quadro = document.createElement("div");
    quadro.id = "tutorial-quadro";
    document.documentElement.append(quadro, legenda, cursor);

    window.addEventListener(
      "mousemove",
      (evento) => {
        cursor.style.transform = `translate(${evento.clientX - 4}px, ${evento.clientY - 2}px)`;
      },
      true,
    );
    window.addEventListener(
      "mousedown",
      (evento) => {
        const onda = document.createElement("div");
        onda.className = "tutorial-onda";
        onda.style.left = `${evento.clientX}px`;
        onda.style.top = `${evento.clientY}px`;
        document.documentElement.appendChild(onda);
        setTimeout(() => onda.remove(), 700);
      },
      true,
    );
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
}

async function gravar(browser, dirVideo) {
  const tl = criarLinhaDoTempo({ largura: 1440, altura: 900 });
  const contexto = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Bahia",
    permissions: ["clipboard-read", "clipboard-write"],
    recordVideo: { dir: dirVideo, size: { width: 1440, height: 900 } },
  });
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: URL_BASE });
  await contexto.addInitScript(preparoDaPagina, { chave: chaveNovidades() });
  const page = await contexto.newPage();
  const inicioVideo = Date.now();
  const erros = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  page.on("console", (msg) => {
    if (msg.type() === "warning" && msg.text().includes("[portal-video-mock]")) erros.push(msg.text());
  });

  /* ─── Ajudantes de cena ─── */
  const roteiro = [];
  let cenaAtual = "";
  const marcaTempo = () => (Date.now() - inicioVideo) / 1000;

  async function legenda(texto, minimoMs) {
    const duracao = minimoMs ?? Math.max(3200, texto.length * 48);
    roteiro.push({ passo: cenaAtual, inicio: marcaTempo(), duracao: duracao / 1000, texto });
    log(`[${marcaTempo().toFixed(0)} s] ${texto}`);
    await page.evaluate((t) => {
      const el = document.getElementById("tutorial-legenda");
      el.textContent = t;
      el.style.display = "block";
    }, texto);
    return duracao;
  }
  /** Mostra a legenda, executa as ações e completa o tempo mínimo de leitura. */
  async function cena(texto, acoes, minimoMs) {
    const inicio = Date.now();
    const duracao = await legenda(texto, minimoMs);
    if (acoes) await acoes();
    const falta = duracao - (Date.now() - inicio);
    if (falta > 0) await pausa(falta);
  }
  const passo = (nome) => {
    cenaAtual = nome;
  };
  async function ate(alvo) {
    await alvo.waitFor({ state: "visible", timeout: 15000 });
    await alvo.scrollIntoViewIfNeeded();
    const caixa = await alvo.boundingBox();
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { steps: 12 });
    await pausa(150);
  }
  async function clicar(alvo, depoisMs = 700) {
    await ate(alvo);
    await page.mouse.down();
    await pausa(60);
    await page.mouse.up();
    await pausa(depoisMs);
  }
  async function digitar(alvo, texto) {
    await clicar(alvo, 250);
    await page.keyboard.press("Control+A");
    await page.keyboard.type(texto, { delay: 140 });
    await pausa(500);
  }
  async function rolarAte(alvo) {
    await alvo.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await pausa(700);
  }
  const controle = (nome, ...args) =>
    page.evaluate(([n, a]) => window.__portalVideo[n](...a), [nome, args]);
  const dialogo = (nome) => page.getByRole("dialog", { name: nome });
  const detalhes = () => dialogo("Detalhes do Equipamento");
  const painelPortal = () => page.getByRole("dialog").filter({ hasText: "o que o cliente vê e responde" });
  const linhaEquipamento = (modelo) => page.locator("tbody tr").filter({ hasText: modelo });
  const anel = (alvo) => destacar(page, alvo, { ms: 800 });
  /** Zoom sem a legenda (o zoom é aplicado depois no vídeo todo e cortaria o texto). */
  async function zoom(alvo, escala = 1.45) {
    await page.evaluate(() => { document.getElementById("tutorial-legenda").style.visibility = "hidden"; });
    await zoomar(page, alvo, tl, { escala, ms: 1700 });
    await pausa(600); // espera o zoom terminar de sair antes de mostrar a legenda de novo
    await page.evaluate(() => { document.getElementById("tutorial-legenda").style.visibility = "visible"; });
  }
  // Avisos (toasts) ficam por cima do X da janela: o cursor vai até o X e o Esc fecha a janela do topo.
  async function fechar(caixa) {
    await ate(caixa.getByRole("button", { name: "Close" }));
    await page.keyboard.press("Escape");
    await pausa(400);
  }
  const limparAvisos = () =>
    page.evaluate(() => document.querySelectorAll("[data-sonner-toast] [data-close-button]").forEach((b) => b.click()));

  let inicioUtil;
  let deslocamentoTl;
  let fimUtil;
  try {
  await page.goto(`${URL_BASE}/`);
  await page.waitForSelector("text=Dashboard", { timeout: 20000 });
  await page.mouse.move(720, 450);
  await pausa(2500);
  inicioUtil = marcaTempo();
  deslocamentoTl = tl.agora() - inicioUtil;

  /* ─── 1. Configurações ─── */
  passo("1. Configurações → Integrações");
  const chavePortal = page.getByRole("switch", { name: "Portal ligado" });
  const chaveRespostas = page.getByRole("switch", { name: "Clientes podem responder orçamentos" });
  await cena("Ligue o portal e as respostas: pede PIN e permissão financeira", async () => {
    await clicar(page.getByRole("link", { name: /^Configurações/ }), 300);
    await page.waitForSelector("text=Portal do Cliente: funcionamento");
    await rolarAte(page.getByText("Portal do Cliente: funcionamento", { exact: true }));
    await anel(chavePortal);
    await clicar(chavePortal, 300);
    await clicar(chaveRespostas, 300);
  }, 6500);

  /* ─── 2. Acesso do contato ─── */
  passo("2. Dar acesso a um contato");
  secao(tl);
  await cena("Abra o equipamento e clique em 'Portal do Cliente'", async () => {
    await clicar(page.getByRole("link", { name: /^Equipamentos/ }), 300);
    await clicar(linhaEquipamento("ZD620"), 700);
    await clicar(detalhes().getByRole("button", { name: /^Portal do Cliente/ }), 600);
  }, 5000);
  await cena("'Dar acesso a um contato': escolha Marina", async () => {
    const dar = painelPortal().getByRole("button", { name: "Dar acesso a um contato" });
    await anel(dar);
    await clicar(dar, 600);
    await ate(page.locator("label").filter({ hasText: "Marina Alves" }));
  }, 4200);

  /* ─── 3. Senha ─── */
  passo("3. Liberar acesso e criar senha");
  secao(tl);
  await cena("Libere o acesso e crie a senha", async () => {
    const liberar = page.getByRole("button", { name: "Liberar acesso e criar senha" });
    await anel(liberar);
    await clicar(liberar, 500);
    await clicar(page.getByRole("button", { name: "Salvar senha" }), 500);
  }, 3600);
  await cena("A senha aparece uma única vez", async () => {
    await pausa(3000);
    await zoom(page.getByLabel("Dados de acesso"), 1.4);
  }, 3000);
  await cena("Envie por WhatsApp ou copie os dados", async () => {
    await clicar(page.getByRole("button", { name: "Enviar por WhatsApp" }), 400);
    await clicar(page.getByRole("button", { name: "Concluir" }), 500);
  }, 3200);

  /* ─── 4. Publicar ─── */
  passo("4. Publicar no Portal do Cliente");
  secao(tl);
  await cena("Publique o orçamento no Portal do Cliente", async () => {
    const publicar = painelPortal().getByRole("button", { name: "Publicar no Portal do Cliente" });
    await anel(publicar);
    await clicar(publicar, 700);
    await fechar(painelPortal());
    await ate(detalhes().getByText("Aguardando resposta do cliente"));
  }, 4500);

  /* ─── 5. Aceite recebido ─── */
  passo("5. Aceite recebido");
  secao(tl);
  await fechar(detalhes());
  await cena("Aceite recebido — confirma às HH:MM", async () => {
    await controle("clienteAceita", 10);
    const aviso = page.getByText(/Aceite recebido/).first();
    await aviso.waitFor({ state: "visible", timeout: 15000 });
    await pausa(1200);
    await zoom(aviso, 1.35);
  }, 3200);
  await cena("Não comece o serviço antes do horário", async () => {
    const sino = page.getByRole("button", { name: /^Notificações/ });
    await anel(sino);
    await clicar(sino, 500);
    await clicar(page.getByRole("button", { name: "Abrir atendimento" }).first(), 900);
  }, 4000);

  /* ─── 6. Efetivação ─── */
  passo("6. Orçamento aprovado pelo cliente");
  secao(tl);
  await fechar(detalhes());
  await cena("Após 15 min: orçamento aprovado pelo cliente", async () => {
    await controle("passaPrazo", 10);
    await page.getByText("Orçamento aprovado pelo cliente").first().waitFor({ state: "visible", timeout: 15000 });
  }, 3600);

  /* ─── 7. Exceções (quadro-resumo) ─── */
  passo("7. Exceções");
  secao(tl);
  await cena("Exceções: o que fazer em cada caso", async () => {
    await page.evaluate(() => {
      const linhas = [
        ["Cliente quer negociar", "#7c3aed", "#f5f3ff", "Altere o orçamento e publique de novo ('Publicar no Portal do Cliente')."],
        ["Aceite não efetivado", "#dc2626", "#fef2f2", "Abra o atendimento e use 'Revisar e aplicar decisão'."],
        ["Cliente pediu correção", "#d97706", "#fffbeb", "Converse e, se for o caso, 'Corrigir decisão do orçamento'."],
      ];
      const quadro = document.getElementById("tutorial-quadro");
      quadro.innerHTML = `<div class="cartao"><h2>Exceções do Portal do Cliente</h2><p class="sub">Situação e o que fazer</p>${linhas
        .map(([t, cor, fundo, texto]) => `<div class="linha" style="--cor:${cor};--fundo:${fundo}"><b>${t}</b><span>${texto}</span></div>`)
        .join("")}</div>`;
      quadro.style.display = "flex";
    });
  }, 5500);
  await page.evaluate(() => {
    document.getElementById("tutorial-legenda").style.display = "none";
    document.getElementById("tutorial-quadro").style.display = "none";
  });
  fimUtil = marcaTempo();
  } catch (falha) {
    await page.screenshot({ path: path.join(tmpdir(), "autoos-falha-gravacao.png") }).catch(() => undefined);
    await contexto.close().catch(() => undefined);
    throw falha;
  }

  const video = page.video();
  await contexto.close();
  // Linha do tempo no tempo do vídeo já recortado (começa em inicioUtil).
  const ajuste = (t) => t - deslocamentoTl - inicioUtil;
  tl.dados.zooms = tl.dados.zooms.map((z) => ({ ...z, ini: ajuste(z.ini), fim: ajuste(z.fim) })).filter((z) => z.ini > 0);
  tl.dados.secoes = tl.dados.secoes.map(ajuste).filter((t) => t > 0);
  await tl.salvar(LINHA_JSON);
  const bruto = await video.path();
  writeFileSync(ROTEIRO_JSON, JSON.stringify({ inicioUtil, fimUtil, roteiro, erros }, null, 2));
  return { bruto, inicioUtil, fimUtil, erros };
}

function ffmpeg(args) {
  const resultado = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (resultado.status !== 0) throw new Error(`ffmpeg falhou: ${args.join(" ")}`);
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const executavel = acharChromium();
  if (!executavel) throw new Error("Chromium não encontrado. Defina CHROMIUM_PATH.");
  const dirVideo = mkdtempSync(path.join(tmpdir(), "autoos-video-"));
  const servidor = await subirServidor();
  const matar = () => {
    try {
      process.kill(-servidor.pid);
    } catch {
      /* já encerrado */
    }
  };
  process.on("exit", matar);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: executavel, args: ["--force-device-scale-factor=1"] });

    // Aquecimento (fora da gravação): o Vite compila as telas sob demanda e recarrega ao otimizar.
    const aquecer = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await aquecer.addInitScript(preparoDaPagina, { chave: chaveNovidades() });
    const folha = await aquecer.newPage();
    for (const rota of ["/", "/equipamentos", "/configuracoes", "/"]) {
      await folha.goto(`${URL_BASE}${rota}`);
      await folha.waitForLoadState("networkidle");
      await pausa(1500);
    }
    await aquecer.close();

    const resultado = await gravar(browser, dirVideo);
    await browser.close();
    browser = undefined;

    const { bruto, inicioUtil, fimUtil, erros } = resultado;
    const duracao = fimUtil - inicioUtil;
    const webm = path.join(SAIDA, "video-portal-operador.webm");
    const mp4 = path.join(SAIDA, "video-portal-operador.mp4");
    const recorte = ["-ss", inicioUtil.toFixed(2), "-t", duracao.toFixed(2), "-i", bruto];
    ffmpeg([...recorte, "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-an", webm]);
    // Zoom, fades, abertura e encerramento (acabamento.mjs).
    const acab = spawnSync(
      process.execPath,
      [path.join(RAIZ, "scripts/tutoriais/acabamento.mjs"), webm, LINHA_JSON, mp4,
        "--titulo", "Portal do Cliente", "--subtitulo", "Guia do operador",
        "--cartao", "2", "--encerramento", "Dúvidas? Fale com o responsável pelo AutoOS"],
      { stdio: "inherit", cwd: RAIZ },
    );
    if (acab.status !== 0) throw new Error("acabamento.mjs falhou");
    copyFileSync(ROTEIRO_JSON, path.join(tmpdir(), "autoos-roteiro-operador.ultimo.json"));
    log(`Vídeo: ${mp4} (${duracao.toFixed(0)} s)`);
    log(`Vídeo: ${webm}`);
    if (erros.length > 0) log(`Avisos da página:\n${[...new Set(erros)].join("\n")}`);

    if (FRAMES_DIR) {
      mkdirSync(FRAMES_DIR, { recursive: true });
      const total = 10;
      for (let i = 0; i < total; i += 1) {
        const instante = ((duracao * (i + 0.5)) / total).toFixed(2);
        ffmpeg(["-ss", instante, "-i", mp4, "-frames:v", "1", path.join(FRAMES_DIR, `quadro-${String(i + 1).padStart(2, "0")}.png`)]);
      }
      log(`Quadros em ${FRAMES_DIR}`);
    }
    log(`Roteiro com os tempos: ${ROTEIRO_JSON}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    matar();
    rmSync(dirVideo, { recursive: true, force: true });
  }
}

main().catch((erro) => {
  process.stderr.write(`${erro?.stack ?? erro}\n`);
  process.exit(1);
});
