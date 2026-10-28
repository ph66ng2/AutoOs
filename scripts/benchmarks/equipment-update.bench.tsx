/** Diagnostic benchmark. Latency is injected at the IPC mock; this does not time PostgreSQL. */
import { test, expect, vi } from 'vitest';
import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Equipamento } from '../../src/types';

const bridge = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {
  listarEquipamentosPaginados: (...args: unknown[]) => bridge.list(...args),
  atualizarEquipamento: (...args: unknown[]) => bridge.update(...args),
  atualizarStatusEquipamento: (...args: unknown[]) => bridge.status(...args),
} }));
import { useEquipamentos } from '../../src/hooks/useEquipamentos';
const seed = (id: number): Equipamento => ({ id, serial_number: `BENCH-${id}`, marca: 'Teste', modelo: 'Modelo', tipo: 'LASER', status: 'RECEBIDO', data_entrada: '2026-10-27', atualizado_em: '2026-10-27T10:00:00.000000Z' });
const pause = (ms: number) => ms ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
const samples: Record<string, unknown>[] = [];

test('measures the real hook and records refresh correctness hazards without changing app code', async () => {
  for (const latencyMs of [0, 50, 150]) for (const operation of ['update', 'status'] as const) {
    let rows = Array.from({ length: 10 }, (_, i) => seed(i + 1));
    let delay = 0;
    const timeline: { command: string; started: number; ended: number }[] = [];
    async function call<T>(command: string, fn: () => T): Promise<T> {
      const started = performance.now(); await pause(delay);
      const value = fn(); timeline.push({ command, started, ended: performance.now() }); return value;
    }
    bridge.list.mockImplementation(() => call('list-page', () => ({ items: rows.map(r => ({ ...r })), total: 1000 })));
    bridge.update.mockImplementation((id, input) => call('update', () => {
      const updated = { ...input, id, atualizado_em: '2026-10-27T10:01:00.000000Z' };
      rows = rows.map(row => row.id === id ? updated : row); return updated;
    }));
    bridge.status.mockImplementation((id, status) => call('status', () => { rows = rows.map(row => row.id === id ? { ...row, status } : row); }));
    const hook = renderHook(() => useEquipamentos({ page: 1 }));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    delay = latencyMs;
    for (let run = 0; run < 10; run++) {
      timeline.length = 0;
      const serial = `CHANGED-${latencyMs}-${run}`;
      const targetStatus = run % 2 ? 'EM_VERIFICACAO' : 'RECEBIDO';
      const start = performance.now();
      await act(async () => {
        const result = operation === 'update'
          ? await hook.result.current.atualizar(1, { ...rows[0]!, serial_number: serial })
          : await hook.result.current.atualizarStatus(1, targetStatus, undefined, undefined, undefined, rows[0]!.atualizado_em);
        expect(result.sucesso).toBe(true);
      });
      const elapsedMs = performance.now() - start;
      expect(operation === 'update' ? hook.result.current.equipamentos[0]!.serial_number : hook.result.current.equipamentos[0]!.status).toBe(operation === 'update' ? serial : targetStatus);
      samples.push({ operation, latencyMs, run, elapsedMs, calls: timeline.map(c => c.command), mockedBridgeMs: timeline.reduce((n,c) => n + c.ended - c.started, 0) });
    }
    hook.unmount();
  }

  // A real stale-response scenario: previous filter completes after a newer filter.
  let resolveOld!: (value: unknown) => void;
  bridge.list.mockImplementation((search) => search === 'old'
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve({ items: [{ ...seed(2), serial_number: 'NEW' }], total: 1 }));
  const racing = renderHook(({ search }) => useEquipamentos({ busca: search }), { initialProps: { search: 'old' } });
  racing.rerender({ search: 'new' });
  await waitFor(() => expect(racing.result.current.equipamentos[0]?.serial_number).toBe('NEW'));
  await act(async () => resolveOld({ items: [{ ...seed(1), serial_number: 'OLD' }], total: 1 }));
  const staleResponseOverwritesNewerFilter = racing.result.current.equipamentos[0]?.serial_number === 'OLD';
  racing.unmount();

  bridge.list.mockResolvedValue({ items: [seed(1)], total: 1 });
  bridge.update.mockResolvedValue({ ...seed(1), serial_number: 'SAVED' });
  const failure = renderHook(() => useEquipamentos());
  await waitFor(() => expect(failure.result.current.loading).toBe(false));
  bridge.list.mockRejectedValue(new Error('simulated refresh unavailable'));
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let writeResult: { sucesso: boolean } | undefined;
  await act(async () => { writeResult = await failure.result.current.atualizar(1, { ...seed(1), serial_number: 'SAVED' }); });
  const refreshFailure = { mutationReportedSuccess: writeResult?.sucesso, errorAvailableInHook: failure.result.current.error !== null, displayedSerial: failure.result.current.equipamentos[0]?.serial_number };
  stderr.mockRestore(); failure.unmount(); cleanup();
  expect(samples).toHaveLength(60);
  expect(samples.every(sample => Number.isFinite(sample.elapsedMs))).toBe(true);
  writeFileSync(process.env.AUTOOS_UPDATE_BENCH_OUTPUT || join(tmpdir(), 'autoos-equipment-update.json'), JSON.stringify({ scope: 'real React hook in jsdom, mocked IPC; no database/browser layout timing', injectedDelayPerIpcMs: [0,50,150], samplesPerScenario: 10, samples, staleResponseOverwritesNewerFilter, refreshFailure }, null, 2));
}, 30000);
