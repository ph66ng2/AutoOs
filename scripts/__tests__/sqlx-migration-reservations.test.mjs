import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function fixture(t, versions) {
  const root = mkdtempSync(join(tmpdir(), 'autoos-migration-reservations-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'src-tauri/migrations'), { recursive: true });
  const rows = [];
  for (const version of versions) {
    const sql = `-- fixture ${version}\n`;
    const name = `${String(version).padStart(4, '0')}_fixture.sql`;
    writeFileSync(join(root, 'src-tauri/migrations', name), sql);
    rows.push(`${version}|t|${createHash('sha384').update(sql).digest('hex')}`);
  }
  for (const script of ['check-sqlx-migrations.mjs', 'check-sqlx-database-history.mjs', 'sqlx-reserved-migrations.txt', 'verify-estoque-seed.sh']) {
    copyFileSync(new URL(`../${script}`, import.meta.url), join(root, 'scripts', script));
  }
  // Substitui só o executável psql do processo filho; nenhum banco é acessado.
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'bin/psql'), `#!/usr/bin/env node\nconst query = process.argv.at(-1);\nprocess.stdout.write(query.includes('to_regclass') ? 't' : process.env.AUTOOS_TEST_HISTORY);\n`, { mode: 0o755 });
  return {
    root,
    run(script, history = rows.join('\n')) {
      return spawnSync(process.execPath, [join(root, 'scripts', script)], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${join(root, 'bin')}:${process.env.PATH}`,
          AUTOOS_MIGRATION_DATABASE_URL: 'postgresql://autoos_test@127.0.0.1/fixture',
          AUTOOS_TEST_HISTORY: history,
        },
      });
    },
    rows,
    seedCheck() {
      return spawnSync('bash', [join(root, 'scripts/verify-estoque-seed.sh'), '--check-migrations'], { encoding: 'utf8' });
    },
  };
}

const branchVersions = [...Array.from({ length: 44 }, (_, i) => i + 1), 48];

test('arquivos aceitam as reservas 0045–0047 e a união futura das branches', (t) => {
  for (const versions of [branchVersions, [...branchVersions, 45, 46, 47, 49]]) {
    const f = fixture(t, versions);
    const result = f.run('check-sqlx-migrations.mjs');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`count=${versions.length}\\b`));
  }
});

test('arquivos continuam rejeitando ausência não reservada e ID duplicado', (t) => {
  const missing = fixture(t, branchVersions.filter((version) => version !== 44));
  assert.match(missing.run('check-sqlx-migrations.mjs').stderr, /0044 ausente/);
  const duplicate = fixture(t, branchVersions);
  writeFileSync(join(duplicate.root, 'src-tauri/migrations/0048_duplicate.sql'), '-- duplicate');
  assert.match(duplicate.run('check-sqlx-migrations.mjs').stderr, /0048 duplicada/);
});

test('histórico exige os arquivos do build e aceita lacunas reservadas ausentes dele', (t) => {
  const f = fixture(t, branchVersions);
  assert.equal(f.run('check-sqlx-database-history.mjs').status, 0);
  const without44 = f.rows.filter((row) => !row.startsWith('44|')).join('\n');
  assert.match(f.run('check-sqlx-database-history.mjs', without44).stderr, /0044.*ausente/);
  const changed = f.rows.map((row) => row.startsWith('48|') ? '48|t|invalid' : row).join('\n');
  assert.match(f.run('check-sqlx-database-history.mjs', changed).stderr, /checksum incompatível/);
});

test('histórico não pode omitir uma reserva que já está nos arquivos do build', (t) => {
  const f = fixture(t, [...branchVersions, 45, 46, 47]);
  const without45 = f.rows.filter((row) => !row.startsWith('45|')).join('\n');
  assert.match(f.run('check-sqlx-database-history.mjs', without45).stderr, /0045.*ausente/);
});

test('verificador do seed usa a mesma lista de reservas dos demais verificadores', (t) => {
  for (const versions of [branchVersions, [...Array.from({ length: 44 }, (_, i) => i + 1), 47], [...branchVersions, 45, 46, 47, 49]]) {
    const f = fixture(t, versions);
    const result = f.seedCheck();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`SEED_VERIFY_MIGRATIONS_OK count=${versions.length}\\b`));
    assert.equal(f.run('check-sqlx-migrations.mjs').status, 0);
  }
  const missing = fixture(t, branchVersions.filter((version) => version !== 44));
  assert.match(missing.seedCheck().stderr, /buraco não reservado em 0044/);
  const duplicate = fixture(t, branchVersions);
  writeFileSync(join(duplicate.root, 'src-tauri/migrations/0048_duplicate.sql'), '-- duplicate');
  assert.match(duplicate.seedCheck().stderr, /duplicata em 0048/);
});

test('a reserva vem do arquivo compartilhado, não de constante em cada verificador', (t) => {
  const f = fixture(t, branchVersions);
  writeFileSync(join(f.root, 'scripts/sqlx-reserved-migrations.txt'), '# só duas\n45\n46 # feature\n');
  assert.match(f.run('check-sqlx-migrations.mjs').stderr, /0047 ausente/);
  assert.match(f.seedCheck().stderr, /buraco não reservado em 0047/);
  for (const script of ['check-sqlx-migrations.mjs', 'verify-estoque-seed.sh']) {
    assert.doesNotMatch(readFileSync(new URL(`../${script}`, import.meta.url), 'utf8'), /\b45\b[^\n]*\b46\b/);
  }
});
