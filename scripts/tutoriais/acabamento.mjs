/**
 * Pós-produção dos vídeos tutoriais: zoom suave, fade entre seções, abertura e encerramento.
 *
 * node scripts/tutoriais/acabamento.mjs <gravacao.webm> <linha.json> <saida.mp4> \
 *   --titulo "Portal do Cliente" --subtitulo "Guia do operador" [--encerramento "Obrigado"] [--cartao 2]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const [entrada, linhaJson, saida, ...resto] = process.argv.slice(2);
if (!entrada || !linhaJson || !saida) {
  throw new Error("Uso: acabamento.mjs <gravacao.webm> <linha.json> <saida.mp4> --titulo T --subtitulo S");
}
const opcao = (nome, padrao) => {
  const i = resto.indexOf(`--${nome}`);
  return i >= 0 ? resto[i + 1] : padrao;
};
const titulo = opcao("titulo", "Portal do Cliente");
const subtitulo = opcao("subtitulo", "");
const encerramento = opcao("encerramento", "Em caso de dúvida, fale com a equipe.");

const { largura: W, altura: H, zooms, secoes } = JSON.parse(readFileSync(linhaJson, "utf8"));
const FPS = 25;
const FADE = 0.6;
const CARTAO = Number(opcao("cartao", "3.5"));
const FONTE_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const n = (v) => Number(v).toFixed(3);

// Peso suavizado (0..1) de cada zoom: sobe em 0,5 s, segura e desce em 0,5 s.
const pesos = zooms.map((z) => {
  const w = `clip(min((t-${n(z.ini)})/0.5,(${n(z.fim)}-t)/0.5),0,1)`;
  return `(${w}*${w}*(3-2*${w}))`;
});
const soma = (termos) => (termos.length ? termos.join("+") : "0");
const zoom = `(1${zooms.map((z, i) => `+${pesos[i]}*${n(z.escala - 1)}`).join("")})`;
const cx = `(${W / 2}${zooms.map((z, i) => `+${pesos[i]}*${n(z.cx - W / 2)}`).join("")})`;
const cy = `(${H / 2}${zooms.map((z, i) => `+${pesos[i]}*${n(z.cy - H / 2)}`).join("")})`;
const escurecer = secoes.map((s) => `clip(1-abs(t-${n(s)})/0.25,0,1)`);

const filtrosPrincipal = [
  `fps=${FPS}`,
  `scale=w='${W}*${zoom}':h='${H}*${zoom}':eval=frame`,
  `crop=${W}:${H}:x='clip(${cx}*${zoom}-${W / 2},0,${W}*${zoom}-${W})':y='clip(${cy}*${zoom}-${H / 2},0,${H}*${zoom}-${H})'`,
  ...(escurecer.length ? [`eq=brightness='-(${soma(escurecer)})':eval=frame`] : []),
  "format=yuv420p",
  "setsar=1",
].join(",");

const duracaoBruta = Number(
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", entrada])
    .toString().trim(),
);
// Textos vão por arquivo para não depender de escape de aspas/dois-pontos no filtro.
const cartao = (cor, linhas, arquivoBase) => {
  const partes = linhas.map(({ texto, tamanho, y, negrito }, i) => {
    const arquivo = `${arquivoBase}-${i}.txt`;
    writeFileSync(arquivo, texto);
    return `drawtext=fontfile=${negrito ? FONTE_B : FONTE}:textfile=${arquivo}:fontcolor=white:fontsize=${tamanho}:x=(w-text_w)/2:y=${y}`;
  });
  return `color=c=${cor}:s=${W}x${H}:r=${FPS}:d=${CARTAO},${partes.join(",")},fade=t=in:d=0.5,fade=t=out:st=${CARTAO - 0.5}:d=0.5,format=yuv420p,setsar=1`;
};

const tmp = saida.replace(/\.mp4$/, "");
const temporarios = [`${tmp}.intro-0.txt`, `${tmp}.intro-1.txt`, `${tmp}.fim-0.txt`];
const intro = cartao("0x0f172a", [
  { texto: titulo, tamanho: Math.round(H / 12), y: "(h/2)-70", negrito: true },
  { texto: subtitulo, tamanho: Math.round(H / 24), y: "(h/2)+30", negrito: false },
], `${tmp}.intro`);
const fim = cartao("0x0f172a", [
  { texto: encerramento, tamanho: Math.round(H / 20), y: "(h/2)-20", negrito: true },
], `${tmp}.fim`);

const dur1 = CARTAO + duracaoBruta - FADE;
const grafo = [
  `${intro}[a]`,
  `[0:v]${filtrosPrincipal}[b]`,
  `${fim}[c]`,
  `[a][b]xfade=transition=fade:duration=${FADE}:offset=${n(CARTAO - FADE)}[ab]`,
  `[ab][c]xfade=transition=fade:duration=${FADE}:offset=${n(dur1 - FADE)}[v]`,
].join(";");

execFileSync("ffmpeg", [
  "-y", "-v", "error", "-i", entrada, "-filter_complex", grafo, "-map", "[v]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", saida,
], { stdio: "inherit" });
for (const arquivo of temporarios) rmSync(arquivo, { force: true });
process.stdout.write(`Gerado: ${saida}\n`);
