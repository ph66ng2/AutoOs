/** Fixture sizes after JPEG encoding, not measurements of the user's actual photos or database. */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const results = [];
const p = (values, ratio) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * ratio) - 1];
for (const binaryBytesPerPhoto of [256 * 1024, 1024 * 1024]) for (const count of [0,3,6]) {
  const imagens = Array.from({ length: count }, (_, ordem) => {
    const dataUrl = `data:image/jpeg;base64,${randomBytes(binaryBytesPerPhoto).toString('base64')}`;
    return { categoria: 'ENTRADA', filename: `fixture-${ordem}.jpg`, mime_type: 'image/jpeg', tamanho_bytes: dataUrl.length, largura: 1600, altura: 1200, ordem, storage_path: dataUrl };
  });
  const payload = { equipamentoId: 1, imagens };
  const serializeMs = [], parseMs = [];
  let encodedBytes = 0;
  for (let run = 0; run < 21; run++) {
    const start = performance.now(); const json = JSON.stringify(payload); const serialized = performance.now();
    const parsed = JSON.parse(json); const ended = performance.now();
    if (parsed.imagens.length !== count) throw new Error('Fixture round trip mismatch');
    if (run) { serializeMs.push(serialized - start); parseMs.push(ended - serialized); }
    encodedBytes = Buffer.byteLength(json, 'utf8');
  }
  results.push({ binaryBytesPerPhoto, count, ipcRequestBytes: encodedBytes, stringifyMedianMs: p(serializeMs,.5), stringifyP95Ms: p(serializeMs,.95), parseMedianMs: p(parseMs,.5), parseP95Ms: p(parseMs,.95) });
}
const output = process.argv[2] || join(tmpdir(), 'autoos-equipment-photo-payload.json');
writeFileSync(output, JSON.stringify({ scope: 'Node JSON serialization of synthetic storage_path data URLs; excludes JPEG encoding, Rust IPC, database and network', node: process.version, samples: 20, results }, null, 2));
process.stdout.write(`${output}\n`);
