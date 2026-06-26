/**
 * Testes do PhotoUploadDialog — estado de sucesso após upload
 *
 * Cobre:
 * - Renderização do overlay de sucesso (checkmark verde + mensagem)
 * - Auto-fechamento após 2 segundos
 * - Fechamento manual durante sucesso (cancela timer)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { PhotoUploadDialog } from "../PhotoUploadDialog";

// ─── Mocks ──────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    startPhotoServer: vi.fn().mockResolvedValue(undefined),
    stopPhotoServer: vi.fn().mockResolvedValue(undefined),
    gerarQrUpload: vi.fn().mockResolvedValue({
      qr_svg: "<svg>mock-qr</svg>",
      url: "http://localhost:8765/upload/test-token",
      token: "test-token",
    }),
    abrirUrl: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Suite ──────────────────────────────────────────────

describe("PhotoUploadDialog — sucesso", () => {
  const defaultProps = {
    equipamentoId: 1,
    categoria: "ENTRADA" as const,
    open: true,
    onOpenChange: vi.fn(),
    onPhotoUploaded: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Teste 1: Overlay de sucesso ─────────────────

  it("mostra checkmark verde e mensagem de sucesso após upload", async () => {
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          used: true,
          image_data: [
            { bytes: [1, 2, 3], filename: "test.jpg", mime_type: "image/jpeg" },
          ],
        }),
    });

    render(<PhotoUploadDialog {...defaultProps} />);

    // Avança 3s do poll + 500ms de delay → upload detectado
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    // Mensagem de sucesso
    expect(
      screen.getByText("Imagem(ns) recebida(s) com sucesso!"),
    ).toBeInTheDocument();

    // Contagem de fotos
    expect(screen.getByText("1 foto recebida")).toBeInTheDocument();

    // Ícone verde (CheckCircle2 com classe text-green-600)
    const checkIcon = document.querySelector(".text-green-600");
    expect(checkIcon).toBeInTheDocument();
  });

  // ─── Teste 2: Auto-close após 2s ────────────────

  it("fecha o diálogo automaticamente após 2 segundos do sucesso", async () => {
    const onOpenChange = vi.fn();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ used: true }),
    });

    render(
      <PhotoUploadDialog {...defaultProps} onOpenChange={onOpenChange} />,
    );

    // Dispara upload
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(
      screen.getByText("Imagem(ns) recebida(s) com sucesso!"),
    ).toBeInTheDocument();

    // Avança 2s do auto-close
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // ─── Teste 3: Fechamento manual cancela timer ────

  it("fechamento manual durante sucesso cancela o timer de auto-close", async () => {
    const onOpenChange = vi.fn();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ used: true }),
    });

    render(
      <PhotoUploadDialog {...defaultProps} onOpenChange={onOpenChange} />,
    );

    // Dispara upload
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(
      screen.getByText("Imagem(ns) recebida(s) com sucesso!"),
    ).toBeInTheDocument();

    // Usuário clica Fechar durante sucesso (fireEvent sincrono)
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));

    // onOpenChange(false) deve ter sido chamado
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Limpa o mock para detectar novas chamadas
    onOpenChange.mockClear();

    // Avança 2s — o timer de auto-close NÃO deve disparar
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // ─── Teste 4: Draft mode (equipamentoId === 0) ───

  it("draft mode (equipamentoId=0) ainda mostra sucesso e chama onPhotoData", async () => {
    const onPhotoData = vi.fn();

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          used: true,
          image_data: [
            { bytes: [10, 20, 30], filename: "draft.jpg", mime_type: "image/jpeg" },
          ],
        }),
    });

    render(
      <PhotoUploadDialog
        equipamentoId={0}
        categoria="ENTRADA"
        open={true}
        onOpenChange={vi.fn()}
        onPhotoUploaded={vi.fn()}
        onPhotoData={onPhotoData}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    // Sucesso aparece
    expect(
      screen.getByText("Imagem(ns) recebida(s) com sucesso!"),
    ).toBeInTheDocument();

    // onPhotoData foi chamado com os dados da imagem
    expect(onPhotoData).toHaveBeenCalledWith({
      bytes: [10, 20, 30],
      filename: "draft.jpg",
      mime_type: "image/jpeg",
      categoria: "ENTRADA",
    });
  });
});
